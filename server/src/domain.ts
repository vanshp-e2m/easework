import type { Prisma, Priority, Role, TaskStatus, TaskType, WorkCategory } from '@prisma/client'
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

/**
 * Which tasks someone may see. Managers see everything; developers see tasks they
 * own or collaborate on, plus unassigned ones they could pick up.
 */
export function visibleTasks(viewer: { id: string; role: Role }): Prisma.TaskWhereInput {
  if (viewer.role === 'MANAGER') return {}
  return { OR: [{ assigneeId: null }, { assigneeId: viewer.id }, { members: { some: { userId: viewer.id } } }] }
}

/** The owner (assignee) or a collaborator: someone who may start, move and document the task. */
export function isOnTask(task: { assigneeId: string | null; members: { userId: string }[] }, userId: string) {
  return task.assigneeId === userId || task.members.some((m) => m.userId === userId)
}

/** "Priya", "Priya and Sara", "Priya, Sara and Rohan". */
export function listNames(names: string[]) {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
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
  // Who has this as their current task right now (Occupied on it, or Away from it).
  currentFor: { orderBy: { name: 'asc' }, select: { id: true, name: true, availability: true } },
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
  members: { orderBy: { joinedAt: 'asc' }, select: { joinedAt: true, user: { select: { id: true, name: true } } } },
  createdBy: { select: { id: true, name: true } },
} as const
