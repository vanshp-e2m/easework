import type { Priority, TaskStatus, TaskType, WorkCategory } from '@prisma/client'
import { HttpError } from './lib/http'

export const CATEGORY_LABEL: Record<WorkCategory, string> = {
  RND_INNOVATION: 'R&D Innovation',
  DELIVERY_TEAM: 'Delivery Team',
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  COMPLETED: 'Completed',
}

/**
 * Category is mandatory. Research work is always R&D Innovation, and R&D Innovation
 * work is always typed as research; Delivery Team work is either delivery or PM support.
 */
export function classify(input: { category?: WorkCategory; type?: TaskType }): {
  category: WorkCategory
  type: TaskType
} {
  if (input.type === 'RESEARCH' || input.category === 'RND_INNOVATION') {
    return { category: 'RND_INNOVATION', type: 'RESEARCH' }
  }
  if (!input.category && !input.type) throw new HttpError(400, 'Work category is required')
  return { category: 'DELIVERY_TEAM', type: input.type ?? 'DELIVERY' }
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
}

// Prisma select shared by every endpoint that returns a developer's current task.
export const taskSummarySelect = {
  id: true,
  title: true,
  category: true,
  type: true,
  status: true,
  priority: true,
  startedAt: true,
  project: { select: { id: true, name: true } },
} as const

// Everything a Kanban card or task dialog needs.
export const taskCardSelect = {
  ...taskSummarySelect,
  description: true,
  expectedOutcome: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  assignee: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} as const
