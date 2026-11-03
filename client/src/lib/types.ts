export type Role = 'DEVELOPER' | 'MANAGER'
export type Availability = 'AVAILABLE' | 'OCCUPIED'
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

export interface TaskSummary {
  id: string
  title: string
  category: WorkCategory
  type: TaskType
  status: TaskStatus
  priority: Priority
  startedAt: string | null
  project: ProjectRef | null
}

export interface TaskCard extends TaskSummary {
  description: string | null
  expectedOutcome: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  assignee: { id: string; name: string } | null
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
}

export interface TeamResponse {
  members: TeamMember[]
  summary: { total: number; available: number; occupiedDelivery: number; occupiedRnd: number }
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

export interface TaskLink {
  id: string
  label: string
  url: string
  kind: LinkKind
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
}

export interface SheetRow extends TaskCard {
  outcome: string | null
  entryCounts: Record<EntryKind, number>
  links: { label: string; url: string; kind: LinkKind }[]
}

export type ReleaseOutcome = 'COMPLETED' | 'NOT_STARTED' | 'BLOCKED'

export type OccupiedInput =
  | { taskId: string }
  | { newTask: { title: string; category: WorkCategory; type?: TaskType; projectId?: string; priority?: Priority } }
