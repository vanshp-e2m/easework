import { Router } from 'express'
import type { EntryKind } from '@prisma/client'
import { prisma } from '../prisma'
import { taskCardSelect } from '../domain'

export const sheetRouter = Router()

/**
 * The tracking sheet: every task with its documentation rolled up — entry counts
 * per kind, the latest outcome, and its links. Built from the same records the
 * board and task pages use, so there is nothing to keep in sync by hand.
 */
sheetRouter.get('/', async (_req, res) => {
  const [tasks, counts] = await Promise.all([
    prisma.task.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        ...taskCardSelect,
        links: { orderBy: { createdAt: 'asc' }, select: { label: true, url: true, kind: true } },
        entries: { where: { kind: 'OUTCOME' }, orderBy: { createdAt: 'desc' }, take: 1, select: { body: true } },
      },
    }),
    prisma.taskEntry.groupBy({ by: ['taskId', 'kind'], _count: { _all: true } }),
  ])

  const countsByTask = new Map<string, Partial<Record<EntryKind, number>>>()
  for (const c of counts) {
    const row = countsByTask.get(c.taskId) ?? {}
    row[c.kind] = c._count._all
    countsByTask.set(c.taskId, row)
  }

  res.json(
    tasks.map(({ entries, ...task }) => {
      const n = countsByTask.get(task.id) ?? {}
      return {
        ...task,
        outcome: entries[0]?.body ?? null,
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
