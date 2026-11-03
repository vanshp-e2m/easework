import type { TaskCard } from './types'

/** Where a research task sits in the pipeline management tracks. */
export type ResearchStage = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'COMPLETED'

export const STAGE_LABEL: Record<ResearchStage, string> = {
  OPEN: 'Open',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
}

export function researchStage(task: TaskCard): ResearchStage {
  if (task.status === 'COMPLETED') return 'COMPLETED'
  if (task.status === 'IN_PROGRESS') return 'IN_PROGRESS'
  return task.assignee ? 'ASSIGNED' : 'OPEN'
}

export function countStages(tasks: TaskCard[]) {
  const counts: Record<ResearchStage, number> = { OPEN: 0, ASSIGNED: 0, IN_PROGRESS: 0, COMPLETED: 0 }
  for (const t of tasks) if (t.type === 'RESEARCH') counts[researchStage(t)]++
  return counts
}
