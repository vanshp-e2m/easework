import { useState } from 'react'
import { useAuth } from '../auth'
import { AvailableDialog } from '../components/AvailableDialog'
import { AvailabilityBadge, CategoryBadge, TaskStatusBadge } from '../components/badges'
import { OccupiedDialog } from '../components/OccupiedDialog'
import { Button, ErrorText } from '../components/ui'
import { PRIORITY_LABEL, since, TYPE_LABEL } from '../lib/labels'
import { useMyTasks, useSetAvailable, useSetOccupied, useTasks } from '../lib/queries'
import { countStages } from '../lib/research'
import { Link } from 'react-router-dom'

export function MyStatusPage() {
  const { me } = useAuth()
  const { data: tasks = [] } = useMyTasks()
  const { data: allTasks = [] } = useTasks()
  const setOccupied = useSetOccupied()
  const setAvailable = useSetAvailable()
  const [occupiedOpen, setOccupiedOpen] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)

  if (!me) return null
  const current = me.currentTask
  const available = me.availability === 'AVAILABLE'
  const openResearch = countStages(allTasks).OPEN

  function goAvailable() {
    // Only ask what happened to the task if there's an unfinished one.
    if (current && current.status !== 'COMPLETED') setReleaseOpen(true)
    else setAvailable.mutate(undefined)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section
        className={`rounded-2xl border p-6 ${available ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">Hi {me.name.split(' ')[0]}, you are</p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-3xl font-bold">{available ? 'Available' : 'Occupied'}</h1>
              <span className="text-sm text-slate-500">for {since(me.statusChangedAt)}</span>
            </div>
          </div>
          <AvailabilityBadge value={me.availability} />
        </div>

        {current && !available && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Working on</p>
            <Link to={`/tasks/${current.id}`} className="mt-1 block text-lg font-semibold hover:underline">
              {current.title}
            </Link>
            <p className="text-xs text-slate-500">Open it to log progress, findings and challenges.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <CategoryBadge value={current.category} />
              <TaskStatusBadge value={current.status} />
              <span>{TYPE_LABEL[current.type]}</span>
              {current.project && <span>· {current.project.name}</span>}
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {available ? (
            <Button onClick={() => setOccupiedOpen(true)}>I'm occupied — pick a task</Button>
          ) : (
            <>
              <Button variant="success" onClick={goAvailable} disabled={setAvailable.isPending}>
                I'm available
              </Button>
              <Button variant="secondary" onClick={() => setOccupiedOpen(true)}>
                Switch task
              </Button>
            </>
          )}
        </div>
        <ErrorText error={setAvailable.error} />
      </section>

      {available && openResearch > 0 && (
        <Link
          to="/research"
          className="flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 hover:border-violet-400"
        >
          <span>
            <span className="font-semibold">
              {openResearch} research {openResearch === 1 ? 'task is' : 'tasks are'} open.
            </span>{' '}
            You're free, so pick one up.
          </span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">My open tasks</h2>
        {tasks.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
            Nothing assigned to you. Use <span className="font-medium">I'm occupied</span> to log what you're working
            on.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {tasks.map((t) => {
              const isCurrent = t.id === current?.id
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <Link to={`/tasks/${t.id}`} className="font-medium hover:underline">
                      {t.title}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <CategoryBadge value={t.category} />
                      <TaskStatusBadge value={t.status} />
                      <span>{PRIORITY_LABEL[t.priority]} priority</span>
                      {t.project && <span>· {t.project.name}</span>}
                    </div>
                  </div>
                  {isCurrent ? (
                    <span className="text-xs font-medium text-amber-700">Current task</span>
                  ) : (
                    <Button
                      variant="secondary"
                      disabled={setOccupied.isPending}
                      onClick={() => setOccupied.mutate({ taskId: t.id })}
                    >
                      Start
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <ErrorText error={setOccupied.error} />
      </section>

      <OccupiedDialog open={occupiedOpen} onClose={() => setOccupiedOpen(false)} />
      <AvailableDialog task={releaseOpen ? current : null} onClose={() => setReleaseOpen(false)} />
    </div>
  )
}
