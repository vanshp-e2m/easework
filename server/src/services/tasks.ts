import type { ActivityLog, Prisma, Priority, Role, TaskStatus, TaskType, WorkCategory } from '@prisma/client'
import { prisma } from '../prisma'
import { HttpError } from '../lib/http'
import { CATEGORY_LABEL, classify, PRIORITY_LABEL, STATUS_LABEL } from '../domain'
import { logActivity, publish } from '../activity'
import { setAvailable, setOccupied } from './availability'

type Tx = Prisma.TransactionClient

export interface TaskInput {
  title: string
  description?: string | null
  expectedOutcome?: string | null
  category: WorkCategory
  type?: TaskType
  priority?: Priority
  projectId?: string | null
  assigneeId?: string | null
}

async function findDeveloper(tx: Tx, id: string) {
  const user = await tx.user.findUnique({ where: { id } })
  if (!user || user.role !== 'DEVELOPER') throw new HttpError(400, 'Tasks can only be assigned to developers')
  return user
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
    const assigned = assignee ? ` and assigned it to ${assignee.name}` : ''
    const entry = await logActivity(tx, {
      actorId,
      taskId: task.id,
      action: 'TASK_CREATED',
      summary: `${actor.name} created "${task.title}" (${CATEGORY_LABEL[category]})${assigned}`,
      details: { category, type, assigneeId: assignee?.id ?? null },
    })
    return { task, entries: [entry] }
  })
  publish(entries)
  return task
}

/**
 * Manager edit. Reassigning a task someone is actively working on frees that
 * developer and moves the task back to Not Started for the new assignee.
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
        await tx.user.update({
          where: { id: oldAssignee.id },
          data: { availability: 'AVAILABLE', currentTaskId: null, statusChangedAt: new Date() },
        })
        entries.push(
          await logActivity(tx, {
            actorId,
            taskId: task.id,
            action: 'STATUS_AVAILABLE',
            summary: `${actor.name} reassigned "${task.title}" — ${oldAssignee.name} is now Available`,
          }),
        )
      }
      if (task.status === 'IN_PROGRESS') data.status = 'NOT_STARTED'
      data.assigneeId = newAssignee?.id ?? null
      changes.push(newAssignee ? `assigned to ${newAssignee.name}` : 'unassigned')
    }

    if (changes.length === 0) return entries
    await tx.task.update({ where: { id: taskId }, data })
    entries.push(
      await logActivity(tx, {
        actorId,
        taskId,
        action: 'TASK_UPDATED',
        summary: `${actor.name} updated "${patch.title ?? task.title}": ${changes.join(', ')}`,
        // assigneeId is present only when the assignment changed (null = unassigned).
        details: { changes, ...('assigneeId' in data && { assigneeId: data.assigneeId as string | null }) },
      }),
    )
    return entries
  })
  publish(entries)
}

/**
 * Self-assign an open task. The conditional update is the guard against double
 * assignment: if two developers click at once, Postgres makes the second UPDATE
 * wait for the first to commit, re-checks `assigneeId IS NULL`, and matches 0 rows.
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
      throw new HttpError(409, `Already picked up by ${task.assignee?.name ?? 'someone else'}`)
    }
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

/** Give a task back to the pool. Frees the developer if it was their current task. */
export async function releaseTask(userId: string, taskId: string) {
  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const task = await tx.task.findUnique({ where: { id: taskId } })
    if (!task) throw new HttpError(404, 'Task not found')
    if (task.assigneeId !== userId) throw new HttpError(403, 'You can only release tasks assigned to you')
    if (task.status === 'COMPLETED') throw new HttpError(400, 'Completed tasks cannot be released')

    const wasCurrent = me.currentTaskId === task.id
    if (wasCurrent) {
      await tx.user.update({
        where: { id: userId },
        data: { availability: 'AVAILABLE', currentTaskId: null, statusChangedAt: new Date() },
      })
    }
    await tx.task.update({
      where: { id: taskId },
      data: { assigneeId: null, status: task.status === 'IN_PROGRESS' ? 'NOT_STARTED' : task.status },
    })
    return [
      await logActivity(tx, {
        actorId: userId,
        taskId,
        action: 'TASK_RELEASED',
        summary: `${me.name} released "${task.title}" back to the pool${wasCurrent ? ' and is now Available' : ''}`,
        details: { category: task.category },
      }),
    ]
  })
  publish(entries)
}

/**
 * A Kanban move. Starting work and leaving a developer's current task go through
 * the availability service, so the board and the team dashboard never disagree.
 */
export async function changeTaskStatus(actor: { id: string; role: Role }, taskId: string, to: TaskStatus) {
  const task = await prisma.task.findUnique({ where: { id: taskId }, include: { assignee: true } })
  if (!task) throw new HttpError(404, 'Task not found')
  if (task.status === to) return

  const isManager = actor.role === 'MANAGER'
  const isAssignee = task.assigneeId === actor.id
  if (!isManager && !isAssignee) throw new HttpError(403, 'You can only move tasks assigned to you')

  if (to === 'IN_PROGRESS') {
    if (!task.assignee) throw new HttpError(400, 'Assign this task to a developer before starting it')
    if (!isAssignee) {
      throw new HttpError(403, `Only ${task.assignee.name} can start this task, since it marks them Occupied`)
    }
    return setOccupied(actor.id, { taskId })
  }

  if (task.assignee?.currentTaskId === task.id) {
    return setAvailable(task.assignee.id, to, actor.id)
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
