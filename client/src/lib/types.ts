export type Role = 'DEVELOPER' | 'MANAGER'
export type Availability = 'AVAILABLE' | 'OCCUPIED' | 'AWAY'
export type WorkCategory = 'RND_INNOVATION' | 'DELIVERY_TEAM'
export type TaskType = 'RESEARCH' | 'DELIVERY' | 'PM_SUPPORT'
export type TaskStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'BLOCKED' | 'COMPLETED'
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'

export interface ProjectRef {
  id: string
  name: string
}

export interface Project extends ProjectRef {
  kind: 'DELIVERY' | 'RESEARCH'
  description: string | null
}

export interface Person {
  id: string
  name: string
}

export interface TaskSummary {
  id: string
  title: string
  category: WorkCategory
  type: TaskType
  status: TaskStatus
  priority: Priority
  startedAt: string | null
  project: ProjectRef | null
  /** Everyone who has this as their current task: Occupied on it, or Away from it. */
  currentFor: (Person & { availability: Availability })[]
}

export interface TaskCard extends TaskSummary {
  description: string | null
  expectedOutcome: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  /** The owner. */
  assignee: Person | null
  /** Developers working on it alongside the owner, in the order they joined. */
  members: { joinedAt: string; user: Person }[]
  createdBy: { id: string; name: string }
}

export interface TaskInput {
  title: string
  description: string | null
  expectedOutcome: string | null
  category: WorkCategory
  type: TaskType
  priority: Priority
  projectId: string | null
  assigneeId: string | null
  /** Collaborators alongside the owner (assigneeId). */
  memberIds: string[]
}

export interface TeamMember {
  id: string
  name: string
  email: string
  availability: Availability
  statusChangedAt: string
  currentTask: TaskSummary | null
}

export interface Me extends TeamMember {
  role: Role
  /** The Claude seat this developer uses, e.g. "claude-seat-14". Required for developers. */
  claudeSeat: string | null
}

export interface SeatRow {
  id: string
  name: string
  availability: Availability
  claudeSeat: string | null
  claudeSeatSetAt: string | null
}

export interface TeamResponse {
  members: (TeamMember & { todaySeconds: number })[]
  summary: {
    total: number
    available: number
    away: number
    occupiedDelivery: number
    occupiedRnd: number
    weekSeconds: Record<WorkCategory, number>
  }
  workHours: string
}

export interface WorkSession {
  id: string
  startedAt: string
  endedAt: string | null
  endReason: string | null
  user: { id: string; name: string }
}

export interface Activity {
  id: string
  action: string
  summary: string
  createdAt: string
  actor: { id: string; name: string }
  task: { id: string; title: string; category: WorkCategory } | null
}

export type EntryKind = 'PROGRESS' | 'FINDING' | 'CHALLENGE' | 'SOLUTION' | 'OUTCOME'
export type LinkKind = 'SUPPORTING' | 'FINAL_REPORT'

export interface TaskEntry {
  id: string
  kind: EntryKind
  body: string
  createdAt: string
  author: { id: string; name: string }
}

/** A web link (url) or an uploaded file (fileName etc.), never both. */
export interface DocLinkRef {
  id: string
  label: string
  url: string | null
  fileName: string | null
  mimeType?: string | null
  kind: LinkKind
}

export interface TaskLink extends DocLinkRef {
  fileSize: number | null
  mimeType: string | null
  createdAt: string
}

export interface HistoryItem {
  id: string
  action: string
  summary: string
  createdAt: string
  actor: { id: string; name: string }
}

export interface TaskDetail {
  task: TaskCard
  entries: TaskEntry[]
  links: TaskLink[]
  history: HistoryItem[]
  sessions: WorkSession[]
}

export interface SheetRow extends TaskCard {
  outcome: string | null
  timeSpentSeconds: number
  /** Most time first. */
  timeByPerson: { name: string; seconds: number }[]
  entryCounts: Record<EntryKind, number>
  links: DocLinkRef[]
}

export type ReleaseOutcome = 'COMPLETED' | 'NOT_STARTED' | 'BLOCKED'

export type OccupiedInput =
  | { taskId: string }
  | { newTask: { title: string; category: WorkCategory; type?: TaskType; projectId?: string; priority?: Priority } }
