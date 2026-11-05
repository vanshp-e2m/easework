import type { ActivityLog, Prisma, Priority, TaskType, User, WorkCategory } from '@prisma/client'
import { prisma } from '../prisma'
import { HttpError } from '../lib/http'
import { CATEGORY_LABEL, classify, isOnTask, listNames, STATUS_LABEL } from '../domain'
import { logActivity, publish } from '../activity'
import { closeOpenSession, openSession, type SessionEndReason } from './sessions'

type Tx = Prisma.TransactionClient

export type OccupiedInput =
  | { taskId: string }
  | {
      newTask: {
        title: string
        category: WorkCategory
        type?: TaskType
        projectId?: string
        priority?: Priority
      }
    }

// What happens to the developer's current task when they become Available.
export type ReleaseOutcome = 'COMPLETED' | 'NOT_STARTED' | 'BLOCKED'

// One developer action produces one activity entry (and later one Slack message);
// only side effects on other tasks, like pausing, get entries of their own.

/**
 * Takes developers off the task they're on: stops their clocks and clears their
 * current task. Anyone Away stays Away, so nobody is marked present by someone else.
 */
export async function takeOffTask(tx: Tx, users: User[], reason: SessionEndReason) {
  for (const u of users) {
    await closeOpenSession(tx, u.id, reason)
    await tx.user.update({
      where: { id: u.id },
      data:
        u.availability === 'AWAY'
          ? { currentTaskId: null }
          : { availability: 'AVAILABLE', currentTaskId: null, statusChangedAt: new Date() },
    })
  }
}

/**
 * Mark a developer Occupied on a task: one they own or have joined, or a quick
 * task they type in. Each developer has one current task, so whatever they were
 * driving before is paused, unless a collaborator is still working on it.
 */
export async function setOccupied(userId: string, input: OccupiedInput) {
  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const entries: ActivityLog[] = []

    let task
    const createdTask = !('taskId' in input)
    if ('taskId' in input) {
      const found = await tx.task.findUnique({ where: { id: input.taskId }, include: { members: true } })
      if (!found) throw new HttpError(404, 'Task not found')
      if (!isOnTask(found, userId)) throw new HttpError(403, 'Pick up or join this task before working on it')
      task = found
      if (task.status === 'COMPLETED') throw new HttpError(400, 'This task is already completed')
    } else {
      const { category, type } = classify(input.newTask)
      task = await tx.task.create({
        data: {
          title: input.newTask.title,
          category,
          type,
          priority: input.newTask.priority ?? 'MEDIUM',
          projectId: input.newTask.projectId,
          assigneeId: userId,
          createdById: userId,
        },
      })
    }

    // Tasks they own or were just on, that nobody else is working on right now.
    const mine: Prisma.TaskWhereInput[] = [{ assigneeId: userId }]
    if (me.currentTaskId) mine.push({ id: me.currentTaskId })
    const others = await tx.task.findMany({
      where: { id: { not: task.id }, status: 'IN_PROGRESS', OR: mine, currentFor: { every: { id: userId } } },
    })
    for (const other of others) {
      await tx.task.update({ where: { id: other.id }, data: { status: 'NOT_STARTED' } })
      entries.push(
        await logActivity(tx, {
          actorId: userId,
          taskId: other.id,
          action: 'TASK_STATUS_CHANGED',
          summary: `${me.name} paused "${other.title}"`,
          details: { from: 'IN_PROGRESS', to: 'NOT_STARTED', category: other.category },
        }),
      )
    }

    const previousStatus = task.status
    if (task.status !== 'IN_PROGRESS') {
      task = await tx.task.update({
        where: { id: task.id },
        data: { status: 'IN_PROGRESS', startedAt: task.startedAt ?? new Date() },
      })
    }

    const alreadyOnThisTask = me.availability === 'OCCUPIED' && me.currentTaskId === task.id
    if (alreadyOnThisTask) return entries

    // Time tracking: whatever they were timing stops, this task starts.
    await closeOpenSession(tx, userId, 'SWITCHED')
    await openSession(tx, userId, task.id)
    await tx.user.update({
      where: { id: userId },
      data: { availability: 'OCCUPIED', currentTaskId: task.id, statusChangedAt: new Date() },
    })
    const resumed = me.availability === 'AWAY' && me.currentTaskId === task.id
    const verb = createdTask
      ? 'started new task'
      : resumed
        ? 'resumed'
        : previousStatus === 'IN_PROGRESS'
          ? 'working on'
          : 'started'
    entries.push(
      await logActivity(tx, {
        actorId: userId,
        taskId: task.id,
        action: 'STATUS_OCCUPIED',
        summary: `${me.name} is now Occupied — ${verb} "${task.title}" (${CATEGORY_LABEL[task.category]})`,
        details: {
          category: task.category,
          type: task.type,
          createdTask,
          taskStatus: { from: createdTask ? null : previousStatus, to: 'IN_PROGRESS' },
        },
      }),
    )
    return entries
  })
  publish(entries)
}

/**
 * Mark a developer Available. If they still hold an unfinished task, the caller
 * must say what happened to it: Completed, paused (Not Started) or Blocked.
 *
 * On a shared task, Completed and Blocked apply to the task, so collaborators
 * still on it are freed too. Pausing only takes this developer off it while
 * others keep working, unless `wholeTask` is set (a move on the board).
 * `actorId` differs from `userId` when someone else moves the task.
 */
export async function setAvailable(
  userId: string,
  outcome?: ReleaseOutcome,
  { actorId = userId, wholeTask = false }: { actorId?: string; wholeTask?: boolean } = {},
) {
  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    if (me.availability === 'AVAILABLE' && !me.currentTaskId) return []
    const actor = actorId === userId ? me : await tx.user.findUniqueOrThrow({ where: { id: actorId } })

    const task = me.currentTaskId ? await tx.task.findUnique({ where: { id: me.currentTaskId } }) : null
    // Someone else closing an away developer's task must not mark them present.
    const stayAway = me.availability === 'AWAY' && actor.id !== me.id
    let summary = `${me.name} is now Available`
    let details = {}

    if (task && task.status !== 'COMPLETED') {
      if (!outcome) throw new HttpError(400, `Choose what happened to "${task.title}" before becoming Available`)
      const others = await tx.user.findMany({ where: { currentTaskId: task.id, id: { not: me.id } } })
      const category = CATEGORY_LABEL[task.category]

      if (outcome === 'NOT_STARTED' && !wholeTask && others.length > 0) {
        // Stepping away from a shared task: it stays In Progress for the others.
        const verb = others.length === 1 ? 'is' : 'are'
        summary = `${me.name} stopped working on "${task.title}" (${category}) and is now Available — ${listNames(others.map((o) => o.name))} ${verb} still on it`
        details = { category: task.category, shared: true }
      } else {
        if (outcome !== task.status) {
          await tx.task.update({
            where: { id: task.id },
            data: { status: outcome, completedAt: outcome === 'COMPLETED' ? new Date() : null },
          })
        }
        await takeOffTask(tx, others, SESSION_END[outcome])
        const freed = [...(stayAway ? [] : [me]), ...others.filter((o) => o.availability !== 'AWAY')]
        if (actor.id === me.id) {
          const verb = { COMPLETED: 'completed', NOT_STARTED: 'paused', BLOCKED: 'is blocked on' }[outcome]
          const also = freed.length > 1 ? ` — ${listNames(freed.slice(1).map((o) => o.name))} freed too` : ''
          summary = `${me.name} ${verb} "${task.title}" (${category}) and is now Available${also}`
        } else {
          const nowFree = freed.length
            ? ` — ${listNames(freed.map((o) => o.name))} ${freed.length === 1 ? 'is' : 'are'} now Available`
            : ''
          summary = `${actor.name} moved "${task.title}" (${category}) to ${STATUS_LABEL[outcome]}${nowFree}`
        }
        details = { category: task.category, taskStatus: { from: task.status, to: outcome } }
      }
    }

    await closeOpenSession(tx, userId, outcome ? SESSION_END[outcome] : 'PAUSED')
    await tx.user.update({
      where: { id: userId },
      data: stayAway
        ? { currentTaskId: null }
        : { availability: 'AVAILABLE', currentTaskId: null, statusChangedAt: new Date() },
    })
    return [
      await logActivity(tx, { actorId: actor.id, taskId: task?.id, action: 'STATUS_AVAILABLE', summary, details }),
    ]
  })
  publish(entries)
}

const SESSION_END = { COMPLETED: 'COMPLETED', NOT_STARTED: 'PAUSED', BLOCKED: 'BLOCKED' } as const

/**
 * "Done for today": stop the clock without giving up the current task, which
 * stays In Progress so the developer can resume it in one click.
 */
export async function setAway(userId: string) {
  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    if (me.availability === 'AWAY') return []
    await closeOpenSession(tx, userId, 'AWAY')
    await tx.user.update({ where: { id: userId }, data: { availability: 'AWAY', statusChangedAt: new Date() } })
    const task = me.currentTaskId ? await tx.task.findUnique({ where: { id: me.currentTaskId } }) : null
    return [
      await logActivity(tx, {
        actorId: userId,
        taskId: task?.id,
        action: 'STATUS_AWAY',
        summary: task ? `${me.name} is away — paused work on "${task.title}"` : `${me.name} is away`,
        details: { automatic: false },
      }),
    ]
  })
  publish(entries)
}
