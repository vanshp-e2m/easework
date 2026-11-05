import type { Availability, EntryKind, Priority, TaskStatus, TaskType, WorkCategory } from './types'

export const ENTRY_LABEL: Record<EntryKind, string> = {
  PROGRESS: 'Progress',
  FINDING: 'Finding',
  CHALLENGE: 'Challenge',
  SOLUTION: 'Solution',
  OUTCOME: 'Outcome',
}

export const ENTRY_PROMPT: Record<EntryKind, string> = {
  PROGRESS: 'What did you work on?',
  FINDING: 'What did you learn?',
  CHALLENGE: 'What got in the way?',
  SOLUTION: 'How did you solve it?',
  OUTCOME: "What's the end result or recommendation?",
}

export const CATEGORY_LABEL: Record<WorkCategory, string> = {
  RND_INNOVATION: 'R&D Innovation',
  DELIVERY_TEAM: 'Delivery Team',
}

export const TYPE_LABEL: Record<TaskType, string> = {
  RESEARCH: 'Research',
  DELIVERY: 'Delivery work',
  PM_SUPPORT: 'PM support',
}

/** 2.4 MB, 820 KB, 12 B. */
export function fileSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

export const AVAILABILITY_LABEL: Record<Availability, string> = {
  AVAILABLE: 'Available',
  OCCUPIED: 'Occupied',
  AWAY: 'Away',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

/** "just now", "12m", "3h 5m", "2d" since the given time. */
export function since(iso: string) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m`
  return `${Math.floor(hours / 24)}d`
}

/** Tracked time: "3h 10m", "45m", "under 1m". */
export function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  if (minutes < 1) return seconds > 0 ? 'under 1m' : '0m'
  const h = Math.floor(minutes / 60)
  return h ? `${h}h ${minutes % 60}m` : `${minutes}m`
}

/** Seconds a session ran; an open one runs until now. */
export function sessionSeconds(s: { startedAt: string; endedAt: string | null }, now = Date.now()) {
  return Math.max(0, Math.round(((s.endedAt ? Date.parse(s.endedAt) : now) - Date.parse(s.startedAt)) / 1000))
}

/** "just now", "12m ago", ... */
export function ago(iso: string) {
  const s = since(iso)
  return s === 'just now' ? s : `${s} ago`
}
