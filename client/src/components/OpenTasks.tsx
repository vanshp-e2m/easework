import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ago, TYPE_LABEL } from '../lib/labels'
import { usePickUpTask, useTasks } from '../lib/queries'
import type { Priority, TaskCard } from '../lib/types'
import { CategoryBadge, PriorityBadge } from './badges'
import { PickUpButtons } from './PickUpButtons'
import { useToast } from './toast'

const RANK: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
const SHOWN = 5

/** Most important first; among equals, the one waiting longest. */
function byPriority(a: TaskCard, b: TaskCard) {
  return RANK[a.priority] - RANK[b.priority] || a.createdAt.localeCompare(b.createdAt)
}

/** Unassigned tasks a free developer can grab right away. */
export function OpenTasks() {
  const { data: tasks = [] } = useTasks()
  const pickUp = usePickUpTask()
  const toast = useToast()
  const [showAll, setShowAll] = useState(false)

  const open = tasks.filter((t) => !t.assignee && t.status !== 'COMPLETED').sort(byPriority)
  if (open.length === 0) return null
  const list = showAll ? open : open.slice(0, SHOWN)

  function pick(task: TaskCard, start: boolean) {
    pickUp.mutate(
      { id: task.id, start },
      {
        onSuccess: () => toast(start ? `You're now working on "${task.title}"` : `"${task.title}" is on your list`),
        onError: (err) => toast((err as Error).message, 'error'),
      },
    )
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">
          Up for grabs <span className="text-sm font-normal text-slate-500">· {open.length} unassigned</span>
        </h2>
        <span className="text-xs text-slate-500">You're free, so pick one up</span>
      </div>
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-emerald-200 bg-white">
        {list.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <Link to={`/tasks/${t.id}`} className="font-medium hover:underline">
                {t.title}
              </Link>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <CategoryBadge value={t.category} />
                <PriorityBadge value={t.priority} />
                <span>{TYPE_LABEL[t.type]}</span>
                {t.project && <span>· {t.project.name}</span>}
                <span>· added {ago(t.createdAt)}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <PickUpButtons task={t} disabled={pickUp.isPending} onPick={(start) => pick(t, start)} />
            </div>
          </li>
        ))}
      </ul>
      {open.length > SHOWN && (
        <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-sm text-slate-500 underline hover:text-slate-900">
          {showAll ? 'Show fewer' : `Show all ${open.length}`}
        </button>
      )}
    </section>
  )
}
