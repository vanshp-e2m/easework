import type { ActivityLog } from '@prisma/client'
import { prisma } from '../prisma'
import { logActivity, publish } from '../activity'
import { autoAwayAt, clockTime } from '../workHours'
import { closeOpenSession } from './sessions'

/**
 * Sets developers Away once their workday is over, so time isn't counted
 * overnight. Runs every minute and is idempotent. The cutoff is computed from
 * when each person became active, not from "now", so if the server was down at
 * 19:00 their session still ends at 19:00.
 */
export async function sendDevelopersAwayAfterHours(now = new Date()) {
  const candidates = await prisma.user.findMany({
    where: { role: 'DEVELOPER', availability: { not: 'AWAY' } },
    select: {
      id: true,
      name: true,
      availability: true,
      statusChangedAt: true,
      workSessions: { where: { endedAt: null }, select: { startedAt: true } },
    },
  })

  const entries: ActivityLog[] = []
  for (const u of candidates) {
    const cutoff = autoAwayAt(u.workSessions[0]?.startedAt ?? u.statusChangedAt)
    if (now < cutoff) continue

    const entry = await prisma.$transaction(async (tx) => {
      // Only if nothing changed since we looked: the developer may have just acted.
      const { count } = await tx.user.updateMany({
        where: { id: u.id, availability: u.availability, statusChangedAt: u.statusChangedAt },
        data: { availability: 'AWAY', statusChangedAt: cutoff },
      })
      if (count === 0) return null
      await closeOpenSession(tx, u.id, 'END_OF_DAY', cutoff)
      return logActivity(tx, {
        actorId: u.id,
        action: 'STATUS_AWAY',
        summary: `${u.name} was set to Away at ${clockTime(cutoff)} (end of working hours)`,
        details: { automatic: true, at: cutoff.toISOString() },
      })
    })
    if (entry) entries.push(entry)
  }
  publish(entries)
  return entries.length
}
