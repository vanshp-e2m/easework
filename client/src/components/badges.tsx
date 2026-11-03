import { CATEGORY_LABEL, PRIORITY_LABEL, STATUS_LABEL } from '../lib/labels'
import type { Availability, Priority, TaskStatus, WorkCategory } from '../lib/types'

const pill = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap'

export function AvailabilityBadge({ value }: { value: Availability }) {
  const available = value === 'AVAILABLE'
  return (
    <span className={`${pill} ${available ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${available ? 'bg-emerald-500' : 'bg-amber-500'}`} />
      {available ? 'Available' : 'Occupied'}
    </span>
  )
}

export function CategoryBadge({ value }: { value: WorkCategory }) {
  const style = value === 'RND_INNOVATION' ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'
  return <span className={`${pill} ${style}`}>{CATEGORY_LABEL[value]}</span>
}

const STATUS_STYLE: Record<TaskStatus, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-700',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  BLOCKED: 'bg-red-100 text-red-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
}

export function TaskStatusBadge({ value }: { value: TaskStatus }) {
  return <span className={`${pill} ${STATUS_STYLE[value]}`}>{STATUS_LABEL[value]}</span>
}

const PRIORITY_STYLE: Record<Priority, string> = {
  LOW: 'text-slate-500',
  MEDIUM: 'text-slate-700',
  HIGH: 'text-orange-700',
  URGENT: 'text-red-700',
}

const PRIORITY_DOTS: Record<Priority, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 }

export function PriorityBadge({ value }: { value: Priority }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${PRIORITY_STYLE[value]}`}>
      <span aria-hidden className="tracking-tighter">
        {'▮'.repeat(PRIORITY_DOTS[value])}
        <span className="opacity-20">{'▮'.repeat(4 - PRIORITY_DOTS[value])}</span>
      </span>
      {PRIORITY_LABEL[value]}
    </span>
  )
}
