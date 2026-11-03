import type { EntryKind, Priority, TaskStatus, TaskType, WorkCategory } from './types'

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

/** "just now", "12m ago", ... */
export function ago(iso: string) {
  const s = since(iso)
  return s === 'just now' ? s : `${s} ago`
}
