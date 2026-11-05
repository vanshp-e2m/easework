import type { Person, TaskCard, TaskSummary } from './types'

/** Owner first, then collaborators in the order they joined. */
export function peopleOn(task: TaskCard): Person[] {
  return [...(task.assignee ? [task.assignee] : []), ...task.members.map((m) => m.user)]
}

/** The owner or a collaborator: someone who can start, move and document the task. */
export function isOnTask(task: TaskCard, userId: string | undefined) {
  return !!userId && (task.assignee?.id === userId || task.members.some((m) => m.user.id === userId))
}

/** People Occupied on the task right now, optionally leaving someone out. */
export function workingNow(task: TaskSummary, exceptId?: string) {
  return task.currentFor.filter((p) => p.availability === 'OCCUPIED' && p.id !== exceptId)
}

/** "Priya", "Priya and Sara", "Priya, Sara and Rohan". */
export function listNames(names: string[]) {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}

export function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
