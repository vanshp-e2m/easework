import { Router } from 'express'
import { currentUser } from '../auth'
import type { EntryKind } from '@prisma/client'
import { prisma } from '../prisma'
import { taskCardSelect, visibleTasks } from '../domain'
import { overlapSeconds } from '../services/sessions'

export const sheetRouter = Router()

/**
 * The tracking sheet: every task with its documentation rolled up — entry counts
 * per kind, the latest outcome, and its links. Built from the same records the
 * board and task pages use, so there is nothing to keep in sync by hand.
 */
sheetRouter.get('/', async (req, res) => {
  const now = new Date()
  const [tasks, counts, sessions] = await Promise.all([
    prisma.task.findMany({
      where: visibleTasks(currentUser(req)),
      orderBy: { updatedAt: 'desc' },
      select: {
        ...taskCardSelect,
        links: { orderBy: { createdAt: 'asc' }, select: { id: true, label: true, url: true, fileName: true, mimeType: true, kind: true } },
        entries: { where: { kind: 'OUTCOME' }, orderBy: { createdAt: 'desc' }, take: 1, select: { body: true } },
      },
    }),
    prisma.taskEntry.groupBy({ by: ['taskId', 'kind'], _count: { _all: true } }),
    prisma.workSession.findMany({
      orderBy: { startedAt: 'asc' },
      select: { taskId: true, startedAt: true, endedAt: true, user: { select: { id: true, name: true } } },
    }),
  ])

  // Per task, then per person: shared tasks show who put in how much.
  const timeByTask = new Map<string, Map<string, { name: string; seconds: number }>>()
  for (const s of sessions) {
    const people = timeByTask.get(s.taskId) ?? new Map()
    const person = people.get(s.user.id) ?? { name: s.user.name, seconds: 0 }
    person.seconds += overlapSeconds(s, s.startedAt, now)
    people.set(s.user.id, person)
    timeByTask.set(s.taskId, people)
  }

  const countsByTask = new Map<string, Partial<Record<EntryKind, number>>>()
  for (const c of counts) {
    const row = countsByTask.get(c.taskId) ?? {}
    row[c.kind] = c._count._all
    countsByTask.set(c.taskId, row)
  }

  res.json(
    tasks.map(({ entries, ...task }) => {
      const n = countsByTask.get(task.id) ?? {}
      const timeByPerson = [...(timeByTask.get(task.id)?.values() ?? [])].sort((a, b) => b.seconds - a.seconds)
      return {
        ...task,
        outcome: entries[0]?.body ?? null,
        timeSpentSeconds: timeByPerson.reduce((sum, p) => sum + p.seconds, 0),
        timeByPerson,
        entryCounts: {
          PROGRESS: n.PROGRESS ?? 0,
          FINDING: n.FINDING ?? 0,
          CHALLENGE: n.CHALLENGE ?? 0,
          SOLUTION: n.SOLUTION ?? 0,
          OUTCOME: n.OUTCOME ?? 0,
        },
      }
    }),
  )
})
