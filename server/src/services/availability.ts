import type { ActivityLog, Priority, TaskType, WorkCategory } from '@prisma/client'
import { prisma } from '../prisma'
import { HttpError } from '../lib/http'
import { CATEGORY_LABEL, classify, STATUS_LABEL } from '../domain'
import { logActivity, publish } from '../activity'

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
 * Mark a developer Occupied on a task: either one already assigned to them, or a
 * quick task they type in. Any other task they had In Progress is paused, so each
 * developer has at most one active task (also guaranteed by a DB index).
 */
export async function setOccupied(userId: string, input: OccupiedInput) {
  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const entries: ActivityLog[] = []

    let task
    const createdTask = !('taskId' in input)
    if ('taskId' in input) {
      task = await tx.task.findUnique({ where: { id: input.taskId } })
      if (!task) throw new HttpError(404, 'Task not found')
      if (task.assigneeId !== userId) throw new HttpError(403, 'This task is not assigned to you')
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

    const others = await tx.task.findMany({
      where: { assigneeId: userId, status: 'IN_PROGRESS', id: { not: task.id } },
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

    await tx.user.update({
      where: { id: userId },
      data: { availability: 'OCCUPIED', currentTaskId: task.id, statusChangedAt: new Date() },
    })
    const verb = createdTask ? 'started new task' : previousStatus === 'IN_PROGRESS' ? 'working on' : 'started'
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
 * `actorId` differs from `userId` when a manager moves the task on the board.
 */
export async function setAvailable(userId: string, outcome?: ReleaseOutcome, actorId = userId) {
  const entries = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    if (me.availability === 'AVAILABLE' && !me.currentTaskId) return []
    const actor = actorId === userId ? me : await tx.user.findUniqueOrThrow({ where: { id: actorId } })

    const task = me.currentTaskId ? await tx.task.findUnique({ where: { id: me.currentTaskId } }) : null
    let summary = `${me.name} is now Available`
    let details = {}

    if (task && task.status !== 'COMPLETED') {
      if (!outcome) throw new HttpError(400, `Choose what happened to "${task.title}" before becoming Available`)
      if (outcome !== task.status) {
        await tx.task.update({
          where: { id: task.id },
          data: { status: outcome, completedAt: outcome === 'COMPLETED' ? new Date() : null },
        })
      }
      const category = CATEGORY_LABEL[task.category]
      if (actor.id === me.id) {
        const verb = { COMPLETED: 'completed', NOT_STARTED: 'paused', BLOCKED: 'is blocked on' }[outcome]
        summary = `${me.name} ${verb} "${task.title}" (${category}) and is now Available`
      } else {
        summary = `${actor.name} moved "${task.title}" (${category}) to ${STATUS_LABEL[outcome]} — ${me.name} is now Available`
      }
      details = { category: task.category, taskStatus: { from: task.status, to: outcome } }
    }

    await tx.user.update({
      where: { id: userId },
      data: { availability: 'AVAILABLE', currentTaskId: null, statusChangedAt: new Date() },
    })
    return [
      await logActivity(tx, { actorId: actor.id, taskId: task?.id, action: 'STATUS_AVAILABLE', summary, details }),
    ]
  })
  publish(entries)
}
