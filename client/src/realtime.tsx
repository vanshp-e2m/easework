import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { io } from 'socket.io-client'
import { useAuth } from './auth'
import { useToast } from './components/toast'
import { getToken } from './lib/api'
import { setLive } from './lib/liveRefresh'

export type LiveStatus = 'connecting' | 'live' | 'offline'

interface LiveEvent {
  id: string
  action: string
  summary: string
  actorId: string
  taskId: string | null
  details: { assigneeId?: string | null; taskStatus?: { to?: string } } | null
}

// Every live view; a change anywhere can move counts on any of them.
const LIVE_VIEWS = ['me', 'myTasks', 'tasks', 'sheet', 'team', 'activity']

const LiveStatusContext = createContext<LiveStatus>('offline')

/** Notices worth interrupting someone for — never for their own actions. */
function noticeFor(e: LiveEvent, me: { id: string; role: string }): string | null {
  if (e.actorId === me.id) return null
  const assignedToMe = e.details?.assigneeId === me.id
  if (me.role === 'DEVELOPER') {
    return assignedToMe && (e.action === 'TASK_CREATED' || e.action === 'TASK_UPDATED') ? e.summary : null
  }
  const to = e.details?.taskStatus?.to
  if (e.action === 'TASK_PICKED_UP' || e.action === 'TASK_COMPLETED' || to === 'COMPLETED' || to === 'BLOCKED') {
    return e.summary
  }
  return null
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { signedIn, me } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [status, setStatus] = useState<LiveStatus>('offline')
  const meRef = useRef(me)
  meRef.current = me

  useEffect(() => {
    if (!signedIn) return
    // A short timeout matters on flaky networks: an attempt that hangs blocks the next retry.
    const socket = io({ path: '/socket.io', auth: { token: getToken() }, transports: ['websocket'], timeout: 5000 })

    // One user action can emit several events; coalesce them into one refetch.
    const pendingTasks = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      for (const key of LIVE_VIEWS) qc.invalidateQueries({ queryKey: [key] })
      for (const id of pendingTasks) qc.invalidateQueries({ queryKey: ['task', id] })
      pendingTasks.clear()
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(flush, 150)
    }

    let wasConnected = false
    setStatus('connecting')
    socket.on('connect', () => {
      setStatus('live')
      setLive(true)
      // After a drop we may have missed events: refresh everything, open task pages included.
      if (wasConnected) {
        flush()
        qc.invalidateQueries({ queryKey: ['task'] })
      }
      wasConnected = true
    })
    socket.on('disconnect', () => {
      setStatus('connecting')
      setLive(false)
    })
    socket.on('connect_error', () => {
      // `active` is false only when the client has given up, e.g. the token was rejected.
      setStatus(socket.active ? 'connecting' : 'offline')
      setLive(false)
    })
    // When the OS reports the network is back, retry now rather than waiting out the backoff.
    const onOnline = () => {
      if (!socket.connected) socket.disconnect().connect()
    }
    window.addEventListener('online', onOnline)
    socket.on('activity', (e: LiveEvent) => {
      if (e.taskId) pendingTasks.add(e.taskId)
      schedule()
      const notice = meRef.current && noticeFor(e, meRef.current)
      if (notice) toast(notice)
    })

    return () => {
      clearTimeout(timer)
      window.removeEventListener('online', onOnline)
      socket.close()
      setStatus('offline')
      setLive(false)
    }
  }, [signedIn, qc, toast])

  return <LiveStatusContext.Provider value={status}>{children}</LiveStatusContext.Provider>
}

export const useLiveStatus = () => useContext(LiveStatusContext)
