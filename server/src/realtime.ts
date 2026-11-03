import type { Server as HttpServer } from 'node:http'
import { Server } from 'socket.io'
import type { ActivityLog } from '@prisma/client'
import { verifyToken } from './auth'
import { activityBus } from './activity'

/** What browsers receive for every committed change. */
export interface LiveEvent {
  id: string
  action: string
  summary: string
  actorId: string
  taskId: string | null
  details: unknown
  createdAt: string
}

/**
 * Pushes every activity entry to signed-in browsers, which refetch just the
 * views it affects. Everyone can already see all tasks in the app, so a
 * broadcast exposes nothing new.
 */
export function attachRealtime(server: HttpServer) {
  const io = new Server(server, { path: '/socket.io', serveClient: false })

  io.use((socket, next) => {
    const user = verifyToken(socket.handshake.auth?.token)
    if (!user) return next(new Error('unauthorized'))
    socket.data.user = user
    next()
  })

  activityBus.on('activity', (entry: ActivityLog) => {
    const event: LiveEvent = {
      id: entry.id,
      action: entry.action,
      summary: entry.summary,
      actorId: entry.actorId,
      taskId: entry.taskId,
      details: entry.details,
      createdAt: entry.createdAt.toISOString(),
    }
    io.emit('activity', event)
  })

  return io
}
