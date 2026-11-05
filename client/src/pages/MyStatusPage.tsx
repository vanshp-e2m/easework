import { useState } from 'react'
import { useAuth } from '../auth'
import { AvailableDialog } from '../components/AvailableDialog'
import { SeatDialog } from '../components/ClaudeSeat'
import { AvailabilityBadge, CategoryBadge, TaskStatusBadge } from '../components/badges'
import { OccupiedDialog } from '../components/OccupiedDialog'
import { OpenTasks } from '../components/OpenTasks'
import { Button, ErrorText } from '../components/ui'
import { PRIORITY_LABEL, since, TYPE_LABEL } from '../lib/labels'
import { listNames, workingNow } from '../lib/people'
import { useMyTasks, useSetAvailable, useSetAway, useSetOccupied } from '../lib/queries'
import { Link } from 'react-router-dom'

export function MyStatusPage() {
  const { me } = useAuth()
  const { data: tasks = [] } = useMyTasks()
  const setOccupied = useSetOccupied()
  const setAvailable = useSetAvailable()
  const setAway = useSetAway()
  const [occupiedOpen, setOccupiedOpen] = useState(false)
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [seatOpen, setSeatOpen] = useState(false)

  if (!me) return null
  const current = me.currentTask
  const status = me.availability

  function goAvailable() {
    // Only ask what happened to the task if there's an unfinished one.
    if (current && current.status !== 'COMPLETED') setReleaseOpen(true)
    else setAvailable.mutate(undefined)
  }

  const TONE = {
    AVAILABLE: 'border-emerald-200 bg-emerald-50',
    OCCUPIED: 'border-amber-200 bg-amber-50',
    AWAY: 'border-slate-300 bg-slate-100',
  }
  const HEADLINE = { AVAILABLE: 'Available', OCCUPIED: 'Occupied', AWAY: 'Away' }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className={`rounded-2xl border p-6 ${TONE[status]}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-600">Hi {me.name.split(' ')[0]}, you are</p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-3xl font-bold">{HEADLINE[status]}</h1>
              <span className="text-sm text-slate-500">for {since(me.statusChangedAt)}</span>
            </div>
          </div>
          <AvailabilityBadge value={status} />
        </div>

        {current && status !== 'AVAILABLE' && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {status === 'AWAY' ? 'Paused — resume when you’re back' : 'Working on'}
            </p>
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
            {workingNow(current, me.id).length > 0 && (
              <p className="mt-2 text-sm text-slate-600">
                With {listNames(workingNow(current, me.id).map((p) => p.name))}, who{' '}
                {workingNow(current, me.id).length === 1 ? 'is' : 'are'} working on it too.
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          {status === 'AWAY' && current && (
            <Button disabled={setOccupied.isPending} onClick={() => setOccupied.mutate({ taskId: current.id })}>
              Resume “{current.title}”
            </Button>
          )}
          {status === 'OCCUPIED' || (status === 'AWAY' && current) ? (
            <>
              <Button variant="success" onClick={goAvailable} disabled={setAvailable.isPending}>
                I'm available
              </Button>
              <Button variant="secondary" onClick={() => setOccupiedOpen(true)}>
                Switch task
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setOccupiedOpen(true)}>I'm occupied — pick a task</Button>
              {status === 'AWAY' && (
                <Button variant="success" onClick={goAvailable} disabled={setAvailable.isPending}>
                  I'm available
                </Button>
              )}
            </>
          )}
          {status !== 'AWAY' && (
            <Button variant="ghost" disabled={setAway.isPending} onClick={() => setAway.mutate()}>
              Done for today
            </Button>
          )}
        </div>
        <ErrorText error={setAvailable.error ?? setAway.error ?? setOccupied.error} />
        <p className="mt-4 text-sm text-slate-600">
          Claude seat:{' '}
          {me.claudeSeat ? (
            <span className="font-medium text-slate-900">{me.claudeSeat}</span>
          ) : (
            <span className="font-medium text-amber-700">not entered</span>
          )}{' '}
          <button onClick={() => setSeatOpen(true)} className="text-slate-500 underline hover:text-slate-900">
            {me.claudeSeat ? 'Change' : 'Enter now'}
          </button>
        </p>
        {status !== 'AWAY' && (
          <p className="mt-3 text-xs text-slate-500">
            Not here at the end of the day? You'll be set to Away automatically, so time isn't counted overnight.
          </p>
        )}
      </section>


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
                      {workingNow(t, me.id).length > 0 && (
                        <span className="text-amber-700">
                          · {listNames(workingNow(t, me.id).map((p) => p.name))} working on it
                        </span>
                      )}
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

      {/* Only when free, and after their own tasks: an Occupied developer shouldn't be pulled away. */}
      {status !== 'OCCUPIED' && <OpenTasks />}

      <OccupiedDialog open={occupiedOpen} onClose={() => setOccupiedOpen(false)} />
      <SeatDialog open={seatOpen} onClose={() => setSeatOpen(false)} />
      <AvailableDialog task={releaseOpen ? current : null} onClose={() => setReleaseOpen(false)} />
    </div>
  )
}
