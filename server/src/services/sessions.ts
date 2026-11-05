import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export type SessionEndReason =
  | 'SWITCHED'
  | 'COMPLETED'
  | 'PAUSED'
  | 'BLOCKED'
  | 'AWAY'
  | 'END_OF_DAY'
  | 'REASSIGNED'
  | 'RELEASED'
  | 'LEFT'

export function openSession(tx: Tx, userId: string, taskId: string) {
  return tx.workSession.create({ data: { userId, taskId } })
}

/** Ends the developer's open session, if any. A no-op when nothing is open. */
export function closeOpenSession(tx: Tx, userId: string, reason: SessionEndReason, at = new Date()) {
  return tx.workSession.updateMany({ where: { userId, endedAt: null }, data: { endedAt: at, endReason: reason } })
}

/** Seconds of a session that fall inside [from, to]; an open session runs until `to`. */
export function overlapSeconds(s: { startedAt: Date; endedAt: Date | null }, from: Date, to: Date) {
  const start = Math.max(s.startedAt.getTime(), from.getTime())
  const end = Math.min((s.endedAt ?? to).getTime(), to.getTime())
  return Math.max(0, Math.round((end - start) / 1000))
}
