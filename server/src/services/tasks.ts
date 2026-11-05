import type { ActivityLog, Prisma, Priority, Role, TaskStatus, TaskType, WorkCategory } from '@prisma/client'
import { prisma } from '../prisma'
import { HttpError } from '../lib/http'
import { CATEGORY_LABEL, classify, isOnTask, listNames, PRIORITY_LABEL, STATUS_LABEL } from '../domain'
import { logActivity, publish } from '../activity'
import { setAvailable, setOccupied, takeOffTask } from './availability'

type Tx = Prisma.TransactionClient
type Actor = { id: string; role: Role }

export interface TaskInput {
  title: string
  description?: string | null
  expectedOutcome?: string | null
  category: WorkCategory
  type?: TaskType
  priority?: Priority
  projectId?: string | null
  assigneeId?: string | null
  /** Collaborators: developers working on it alongside the owner (assigneeId). */
  memberIds?: string[]
}

async function findDeveloper(tx: Tx, id: string) {
  const user = await tx.user.findUnique({ where: { id } })
  if (!user || user.role !== 'DEVELOPER') throw new HttpError(400, 'Tasks can only be assigned to developers')
  return user
}

/**
 * Makes the task's collaborators exactly `memberIds` (minus the owner). Anyone
 * removed who was working on it is freed. Collaborators need an owner to work with.
 */
async function setMembers(tx: Tx, taskId: string, ownerId: string | null, memberIds: string[]) {
  const wanted = [...new Set(memberIds)].filter((id) => id !== ownerId)
  if (wanted.length > 0 && !ownerId) throw new HttpError(400, 'Choose an owner before adding collaborators')
  const current = await tx.taskMember.findMany({ where: { taskId }, include: { user: true } })

  const removed = current.filter((m) => !wanted.includes(m.userId)).map((m) => m.user)
  if (removed.length > 0) {
    await tx.taskMember.deleteMany({ where: { taskId, userId: { in: removed.map((u) => u.id) } } })
    await takeOffTask(tx, removed.filter((u) => u.currentTaskId === taskId), 'REASSIGNED')
  }

  const added = []
  for (const id of wanted.filter((id) => !current.some((m) => m.userId === id))) {
    added.push(await findDeveloper(tx, id))
  }
  if (added.length > 0) await tx.taskMember.createMany({ data: added.map((u) => ({ taskId, userId: u.id })) })
  return { added, removed }
}

/** An In Progress task that nobody is working on any more goes back to Not Started. */
async function pauseIfIdle(tx: Tx, taskId: string) {
  await tx.task.updateMany({
    where: { id: taskId, status: 'IN_PROGRESS', currentFor: { none: {} } },
    data: { status: 'NOT_STARTED' },
  })
}

export async function createTask(actorId: string, input: TaskInput) {
  const { task, entries } = await prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } })
    const assignee = input.assigneeId ? await findDeveloper(tx, input.assigneeId) : null
    const { category, type } = classify(input)
    const task = await tx.task.create({
      data: {
        title: input.title,
        description: input.description || null,
        expectedOutcome: input.expectedOutcome || null,
        category,
        type,
        priority: input.priority ?? 'MEDIUM',
        projectId: input.projectId || null,
        assigneeId: assignee?.id ?? null,
        createdById: actorId,
      },
    })
    const { added } = await setMembers(tx, task.id, assignee?.id ?? null, input.memberIds ?? [])
    const team = added.length ? `, with ${listNames(added.map((u) => u.name))}` : ''
    const assigned = assignee ? ` and assigned it to ${assignee.name}${team}` : ''
    const entry = await logActivity(tx, {
      actorId,
      taskId: task.id,
      action: 'TASK_CREATED',
      summary: `${actor.name} created "${task.title}" (${CATEGORY_LABEL[category]})${assigned}`,
      // memberIds: collaborators added, so they get a notice too.
      details: { category, type, assigneeId: assignee?.id ?? null, memberIds: added.map((u) => u.id) },
    })
    return { task, entries: [entry] }
  })
  publish(entries)
  return task
}

/**
 * Manager edit. Reassigning a task frees the old owner if they were working on
 * it; the task goes back to Not Started unless a collaborator is still on it.
 */
export async function updateTask(actorId: string, taskId: string, patch: Partial<TaskInput>) {
  const entries = await prisma.$transaction(async (tx) => {
    const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } })
    const task = await tx.task.findUnique({ where: { id: taskId } })
    if (!task) throw new HttpError(404, 'Task not found')

    const data: Prisma.TaskUncheckedUpdateInput = {}
    const changes: string[] = []
    const entries: ActivityLog[] = []

    if (patch.title !== undefined && patch.title !== task.title) {
      data.title = patch.title
      changes.push('title')
    }
    for (const field of ['description', 'expectedOutcome'] as const) {
      const value = patch[field] === undefined ? undefined : patch[field] || null
      if (value !== undefined && value !== task[field]) {
        data[field] = value
        changes.push(field === 'description' ? 'description' : 'expected outcome')
      }
    }
    if (patch.priority && patch.priority !== task.priority) {
      data.priority = patch.priority
      changes.push(`priority → ${PRIORITY_LABEL[patch.priority]}`)
    }
    if (patch.projectId !== undefined && (patch.projectId || null) !== task.projectId) {
      data.projectId = patch.projectId || null
      changes.push('project')
    }
    if (patch.category || patch.type) {
      const categoryChanged = !!patch.category && patch.category !== task.category
      // A new category invalidates the old type unless a new type comes with it.
      const next = classify({
        category: patch.category ?? task.category,
        type: patch.type ?? (categoryChanged ? undefined : task.type),
      })
      if (next.category !== task.category) changes.push(`category → ${CATEGORY_LABEL[next.category]}`)
      if (next.category !== task.category || next.type !== task.type) Object.assign(data, next)
    }

    if (patch.assigneeId !== undefined && (patch.assigneeId || null) !== task.assigneeId) {
      const newAssignee = patch.assigneeId ? await findDeveloper(tx, patch.assigneeId) : null
      const oldAssignee = task.assigneeId ? await tx.user.findUnique({ where: { id: task.assigneeId } }) : null
      if (oldAssignee?.currentTaskId === task.id) {
        const away = oldAssignee.availability === 'AWAY'
        await takeOffTask(tx, [oldAssignee], 'REASSIGNED')
        entries.push(
          await logActivity(tx, {
            actorId,
            taskId: task.id,
            action: 'STATUS_AVAILABLE',
            summary: `${actor.name} reassigned "${task.title}"${away ? ` from ${oldAssignee.name}` : ` — ${oldAssignee.name} is now Available`}`,
          }),
        )
      }
      // A collaborator promoted to owner no longer needs a collaborator row.
      if (newAssignee) await tx.taskMember.deleteMany({ where: { taskId, userId: newAssignee.id } })
      data.assigneeId = newAssignee?.id ?? null
      changes.push(newAssignee ? `assigned to ${newAssignee.name}` : 'unassigned')
    }

    let addedIds: string[] = []
    if (patch.memberIds !== undefined) {
      const ownerId = 'assigneeId' in data ? (data.assigneeId as string | null) : task.assigneeId
      const { added, removed } = await setMembers(tx, taskId, ownerId, patch.memberIds)
      if (added.length) changes.push(`added ${listNames(added.map((u) => u.name))}`)
      if (removed.length) changes.push(`removed ${listNames(removed.map((u) => u.name))}`)
      addedIds = added.map((u) => u.id)
    }

    if (changes.length === 0) return entries
    await tx.task.update({ where: { id: taskId }, data })
    if ('assigneeId' in data || patch.memberIds !== undefined) await pauseIfIdle(tx, taskId)
    entries.push(
      await logActivity(tx, {
        actorId,
        taskId,
        action: 'TASK_UPDATED',
        summary: `${actor.name} updated "${patch.title ?? task.title}": ${changes.join(', ')}`,
        // assigneeId is present only when the owner changed (null = unassigned);
        // memberIds lists newly added collaborators. Both drive live notices.
        details: {
          changes,
          memberIds: addedIds,
          ...('assigneeId' in data && { assigneeId: data.assigneeId as string | null }),
        },
      }),
    )
    return entries
  })
  publish(entries)
}

/**
 * Become the owner of an unowned task. The conditional update is the guard against
 * two owners: if two developers click at once, Postgres makes the second UPDATE
 * wait for the first to commit, re-checks `assigneeId IS NULL`, and matches 0 rows.
 * The loser can still join the winner as a collaborator.
 */
export async function pickUpTask(userId: string, taskId: string, start: boolean) {
  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const { count } = await tx.task.updateMany({
      where: { id: taskId, assigneeId: null, status: { not: 'COMPLETED' } },
      data: { assigneeId: userId },
    })
    const task = await tx.task.findUnique({ where: { id: taskId }, include: { assignee: true } })
    if (!task) throw new HttpError(404, 'Task not found')
    if (count === 0) {
      if (task.status === 'COMPLETED') throw new HttpError(400, 'This task is already completed')
      if (task.assigneeId === userId) throw new HttpError(409, 'You already have this task')
      throw new HttpError(409, `Already picked up by ${task.assignee?.name ?? 'someone else'}. You can join them instead.`)
    }
    // A collaborator who takes over an unowned task becomes its owner.
    await tx.taskMember.deleteMany({ where: { taskId, userId } })
    const kind = task.type === 'RESEARCH' ? 'research task' : 'task'
    return [
      await logActivity(tx, {
        actorId: userId,
        taskId,
        action: 'TASK_PICKED_UP',
        summary: `${me.name} picked up ${kind} "${task.title}" (${CATEGORY_LABEL[task.category]})`,
        details: { category: task.category, type: task.type },
      }),
    ]
  })
  publish(entries)
  if (start) await setOccupied(userId, { taskId })
}

/** Work on a task alongside its owner. Each person's time is tracked in their own sessions. */
export async function joinTask(userId: string, taskId: string, start: boolean) {
  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const task = await tx.task.findUnique({ where: { id: taskId }, include: { assignee: true, members: true } })
    if (!task) throw new HttpError(404, 'Task not found')
    if (task.status === 'COMPLETED') throw new HttpError(400, 'This task is already completed')
    if (!task.assignee) throw new HttpError(400, 'Nobody has this task yet, so pick it up instead')
    if (isOnTask(task, userId)) throw new HttpError(409, "You're already on this task")
    await tx.taskMember.create({ data: { taskId, userId } })
    return [
      await logActivity(tx, {
        actorId: userId,
        taskId,
        action: 'TASK_JOINED',
        summary: `${me.name} joined ${task.assignee.name} on "${task.title}" (${CATEGORY_LABEL[task.category]})`,
        details: { category: task.category, ownerId: task.assignee.id },
      }),
    ]
  })
  publish(entries)
  if (start) await setOccupied(userId, { taskId })
}

/** Who decides who works on a task: its owner and managers. */
function assertCanManagePeople(actor: Actor, task: { assigneeId: string | null }) {
  if (actor.role !== 'MANAGER' && task.assigneeId !== actor.id) {
    throw new HttpError(403, 'Only the task owner or a manager can change who works on it')
  }
}

/** The owner or a manager adds a developer to work alongside the owner. */
export async function addMember(actor: Actor, taskId: string, userId: string) {
  const entries = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId }, include: { members: true } })
    if (!task) throw new HttpError(404, 'Task not found')
    assertCanManagePeople(actor, task)
    if (task.status === 'COMPLETED') throw new HttpError(400, 'This task is already completed')
    if (!task.assigneeId) throw new HttpError(400, 'Choose an owner before adding collaborators')
    const user = await findDeveloper(tx, userId)
    if (isOnTask(task, user.id)) throw new HttpError(409, `${user.name} is already on this task`)
    await tx.taskMember.create({ data: { taskId, userId: user.id } })
    const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id } })
    return [
      await logActivity(tx, {
        actorId: actor.id,
        taskId,
        action: 'MEMBER_ADDED',
        summary: `${me.name} added ${user.name} to "${task.title}" (${CATEGORY_LABEL[task.category]})`,
        // memberIds: the added developer gets a notice.
        details: { category: task.category, memberIds: [user.id] },
      }),
    ]
  })
  publish(entries)
}

/** A collaborator leaves a task, or the owner or a manager takes them off it. Owners release instead. */
export async function removeMember(actor: Actor, taskId: string, userId: string) {
  const self = actor.id === userId
  const entries = await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId } })
    if (!task) throw new HttpError(404, 'Task not found')
    if (!self) assertCanManagePeople(actor, task)
    const { count } = await tx.taskMember.deleteMany({ where: { taskId, userId } })
    if (count === 0) {
      throw new HttpError(404, self ? "You're not a collaborator on this task" : 'They are not a collaborator on this task')
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const wasWorking = user.currentTaskId === taskId && user.availability === 'OCCUPIED'
    if (user.currentTaskId === taskId) await takeOffTask(tx, [user], 'LEFT')
    await pauseIfIdle(tx, taskId)
    const actorName = self ? user.name : (await tx.user.findUniqueOrThrow({ where: { id: actor.id } })).name
    return [
      await logActivity(tx, {
        actorId: actor.id,
        taskId,
        action: 'TASK_LEFT',
        summary: self
          ? `${user.name} left "${task.title}"${wasWorking ? ' and is now Available' : ''}`
          : `${actorName} took ${user.name} off "${task.title}"${wasWorking ? ` — ${user.name} is now Available` : ''}`,
        details: { category: task.category, userId },
      }),
    ]
  })
  publish(entries)
}

/**
 * The owner gives a task up. If collaborators are on it, the one who joined
 * first becomes the owner; otherwise it goes back to the pool.
 */
export async function releaseTask(userId: string, taskId: string) {
  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const task = await tx.task.findUnique({ where: { id: taskId } })
    if (!task) throw new HttpError(404, 'Task not found')
    if (task.assigneeId !== userId) {
      throw new HttpError(403, 'Only the owner can release this task. Collaborators can leave it instead.')
    }
    if (task.status === 'COMPLETED') throw new HttpError(400, 'Completed tasks cannot be released')

    const wasCurrent = me.currentTaskId === task.id
    const away = me.availability === 'AWAY'
    if (wasCurrent) await takeOffTask(tx, [me], 'RELEASED')

    const successor = await tx.taskMember.findFirst({
      where: { taskId },
      orderBy: { joinedAt: 'asc' },
      include: { user: true },
    })
    if (successor) await tx.taskMember.delete({ where: { taskId_userId: { taskId, userId: successor.userId } } })
    await tx.task.update({ where: { id: taskId }, data: { assigneeId: successor?.userId ?? null } })
    await pauseIfIdle(tx, taskId)

    const nowAvailable = wasCurrent && !away ? ' and is now Available' : ''
    return [
      await logActivity(tx, {
        actorId: userId,
        taskId,
        action: 'TASK_RELEASED',
        summary: successor
          ? `${me.name} handed "${task.title}" over to ${successor.user.name}${nowAvailable}`
          : `${me.name} released "${task.title}" back to the pool${nowAvailable}`,
        // assigneeId: the new owner, so they get a notice.
        details: { category: task.category, assigneeId: successor?.userId ?? null },
      }),
    ]
  })
  publish(entries)
}

/**
 * A Kanban move. Starting work and taking people off a task go through the
 * availability service, so the board and the team dashboard never disagree.
 * A move applies to the whole task: everyone working on it is freed.
 */
export async function changeTaskStatus(actor: Actor, taskId: string, to: TaskStatus) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignee: true, members: true, currentFor: true },
  })
  if (!task) throw new HttpError(404, 'Task not found')
  if (task.status === to) return

  const isManager = actor.role === 'MANAGER'
  const onTask = isOnTask(task, actor.id)
  if (!isManager && !onTask) throw new HttpError(403, "You can only move tasks you're working on")

  if (to === 'IN_PROGRESS') {
    if (!task.assignee) throw new HttpError(400, 'Assign this task to a developer before starting it')
    if (!onTask) throw new HttpError(403, 'Only people on this task can start it, since it marks them Occupied')
    return setOccupied(actor.id, { taskId })
  }

  const workers = task.currentFor
  if (workers.length > 0) {
    const lead = workers.find((w) => w.id === actor.id) ?? workers[0]
    return setAvailable(lead.id, to, { actorId: actor.id, wholeTask: true })
  }

  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id } })
    await tx.task.update({
      where: { id: taskId },
      data: { status: to, completedAt: to === 'COMPLETED' ? new Date() : null },
    })
    const category = CATEGORY_LABEL[task.category]
    return [
      await logActivity(tx, {
        actorId: actor.id,
        taskId,
        action: to === 'COMPLETED' ? 'TASK_COMPLETED' : 'TASK_STATUS_CHANGED',
        summary:
          to === 'COMPLETED'
            ? `${me.name} completed "${task.title}" (${category})`
            : `${me.name} moved "${task.title}" (${category}) to ${STATUS_LABEL[to]}`,
        details: { category: task.category, taskStatus: { from: task.status, to } },
      }),
    ]
  })
  publish(entries)
}
