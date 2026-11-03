import { EventEmitter } from 'node:events'
import type { ActivityLog, Prisma } from '@prisma/client'

/**
 * Every state change writes an ActivityLog row inside its transaction, then the
 * committed rows are published here. Real-time updates and Slack subscribe to
 * this bus in later steps, so they never need their own bookkeeping.
 */
export const activityBus = new EventEmitter()

export function logActivity(
  tx: Prisma.TransactionClient,
  data: { actorId: string; action: string; summary: string; taskId?: string; details?: Prisma.InputJsonValue },
) {
  return tx.activityLog.create({ data })
}

export function publish(entries: ActivityLog[]) {
  for (const entry of entries) activityBus.emit('activity', entry)
}
