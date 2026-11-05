import { useState } from 'react'
import { useAuth } from '../auth'
import { ActivityFeed } from '../components/ActivityFeed'
import { AvailabilityBadge, CategoryBadge, TaskStatusBadge } from '../components/badges'
import { Segmented } from '../components/ui'
import { ago, duration, since, TYPE_LABEL } from '../lib/labels'
import { useSeats, useTasks, useTeam } from '../lib/queries'
import { listNames, workingNow } from '../lib/people'
import { countStages, STAGE_LABEL, type ResearchStage } from '../lib/research'
import { Link } from 'react-router-dom'
import type { TaskSummary, TeamMember } from '../lib/types'

type Filter = 'ALL' | 'AVAILABLE' | 'DELIVERY_TEAM' | 'RND_INNOVATION' | 'AWAY'

const FILTERS: Record<Filter, (m: TeamMember) => boolean> = {
  ALL: () => true,
  AVAILABLE: (m) => m.availability === 'AVAILABLE',
  AWAY: (m) => m.availability === 'AWAY',
  DELIVERY_TEAM: (m) => m.availability === 'OCCUPIED' && m.currentTask?.category === 'DELIVERY_TEAM',
  RND_INNOVATION: (m) => m.availability === 'OCCUPIED' && m.currentTask?.category === 'RND_INNOVATION',
}

/** Developers can open only tasks they're on; others show as plain text. */
function TaskTitle({ task, member }: { task: TaskSummary; member: TeamMember }) {
  const { me } = useAuth()
  const canOpen = me?.role === 'MANAGER' || member.id === me?.id || task.currentFor.some((p) => p.id === me?.id)
  if (!canOpen) return <>{task.title}</>
  return (
    <Link to={`/tasks/${task.id}`} className="hover:underline">
      {task.title}
    </Link>
  )
}

/** Manager only: which developer is on which Claude seat, with gaps and clashes flagged. */
function ClaudeSeats() {
  const { data: rows = [] } = useSeats(true)
  const users = new Map<string, number>()
  for (const r of rows) if (r.claudeSeat) users.set(r.claudeSeat.toLowerCase(), (users.get(r.claudeSeat.toLowerCase()) ?? 0) + 1)
  const shared = (seat: string) => (users.get(seat.toLowerCase()) ?? 0) > 1
  const seated = rows
    .filter((r) => r.claudeSeat)
    .sort((a, b) => a.claudeSeat!.localeCompare(b.claudeSeat!, undefined, { numeric: true }))
  const missing = rows.filter((r) => !r.claudeSeat)
  const clashes = [...new Set(seated.filter((r) => shared(r.claudeSeat!)).map((r) => r.claudeSeat!))]

  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-semibold">
        Claude seats{' '}
        <span className="text-sm font-normal text-slate-500">
          {seated.length} of {rows.length} entered
        </span>
      </h2>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
        {seated.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {seated.map((r) => (
              <li key={r.id} className="flex items-baseline justify-between gap-3 px-3 py-2">
                <span
                  className={`font-mono text-xs ${shared(r.claudeSeat!) ? 'font-semibold text-red-700' : 'text-slate-700'}`}
                >
                  {r.claudeSeat}
                </span>
                <span className="min-w-0 truncate text-right" title={r.claudeSeatSetAt ? `Entered ${ago(r.claudeSeatSetAt)}` : undefined}>
                  {r.name}
                </span>
              </li>
            ))}
          </ul>
        )}
        {clashes.map((seat) => (
          <p key={seat} className="border-t border-red-200 bg-red-50 px-3 py-2 text-red-800">
            ⚠ {seat} is entered by{' '}
            {listNames(seated.filter((r) => r.claudeSeat!.toLowerCase() === seat.toLowerCase()).map((r) => r.name))}
          </p>
        ))}
        {missing.length > 0 && (
          <p className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
            ⚠ Not entered yet: {listNames(missing.map((r) => r.name))}
          </p>
        )}
      </div>
    </section>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone}`}>{value}</p>
    </div>
  )
}

export function DashboardPage() {
  const { me } = useAuth()
  const { data: team, isLoading } = useTeam()
  const { data: tasks = [] } = useTasks()
  const [filter, setFilter] = useState<Filter>('ALL')
  const research = countStages(tasks)

  if (isLoading || !team) return <p className="text-slate-500">Loading…</p>
  const { summary } = team
  const members = team.members.filter(FILTERS[filter])
  const pct = (n: number) => (summary.total ? (n / summary.total) * 100 : 0)

  const week = summary.weekSeconds
  const weekTotal = week.DELIVERY_TEAM + week.RND_INNOVATION
  const weekPct = (n: number) => (weekTotal ? Math.round((n / weekTotal) * 100) : 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Developers" value={summary.total} tone="text-slate-900" />
        <Stat label="Available" value={summary.available} tone="text-emerald-600" />
        <Stat label="Occupied · Delivery Team" value={summary.occupiedDelivery} tone="text-sky-600" />
        <Stat label="Occupied · R&D Innovation" value={summary.occupiedRnd} tone="text-violet-600" />
        <Stat label="Away" value={summary.away} tone="text-slate-500" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="mb-2 text-sm font-medium text-slate-600">Right now</p>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="bg-sky-500" style={{ width: `${pct(summary.occupiedDelivery)}%` }} />
            <div className="bg-violet-500" style={{ width: `${pct(summary.occupiedRnd)}%` }} />
            <div className="bg-emerald-400" style={{ width: `${pct(summary.available)}%` }} />
            <div className="bg-slate-300" style={{ width: `${pct(summary.away)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />
              Delivery Team
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />
              R&D Innovation
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />
              Available
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-slate-300" />
              Away
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-slate-600">Hours worked this week</p>
            <p className="text-xs text-slate-400">{team.workHours}</p>
          </div>
          <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="bg-sky-500" style={{ width: `${weekPct(week.DELIVERY_TEAM)}%` }} />
            <div className="bg-violet-500" style={{ width: `${weekPct(week.RND_INNOVATION)}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-500">
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />
              Delivery Team <span className="font-semibold text-slate-900">{duration(week.DELIVERY_TEAM)}</span> (
              {weekPct(week.DELIVERY_TEAM)}%)
            </span>
            <span>
              <span className="mr-1 inline-block h-2 w-2 rounded-full bg-violet-500" />
              R&D Innovation <span className="font-semibold text-slate-900">{duration(week.RND_INNOVATION)}</span> (
              {weekPct(week.RND_INNOVATION)}%)
            </span>
          </div>
        </div>
      </div>

      <Link
        to="/research"
        className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white p-4 text-sm hover:border-slate-400"
      >
        <span className="font-medium text-slate-600">Research pipeline</span>
        {(Object.keys(STAGE_LABEL) as ResearchStage[]).map((s) => (
          <span key={s} className="text-slate-500">
            {STAGE_LABEL[s]} <span className="ml-1 font-semibold text-slate-900">{research[s]}</span>
          </span>
        ))}
        <span aria-hidden className="ml-auto text-slate-400">
          →
        </span>
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Developers</h2>
            <div className="w-full sm:w-auto">
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'ALL', label: 'All' },
                  { value: 'AVAILABLE', label: 'Available' },
                  { value: 'DELIVERY_TEAM', label: 'Delivery' },
                  { value: 'RND_INNOVATION', label: 'R&D' },
                  { value: 'AWAY', label: 'Away' },
                ]}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Developer</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Working on</th>
                  <th className="px-4 py-2.5 font-medium">Task status</th>
                  <th className="px-4 py-2.5 font-medium">Since</th>
                  <th className="px-4 py-2.5 font-medium" title="Tracked working time today">
                    Today
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => {
                  const task = m.availability === 'OCCUPIED' ? m.currentTask : null
                  const paused = m.availability === 'AWAY' ? m.currentTask : null
                  return (
                    <tr key={m.id}>
                      <td className="px-4 py-3 font-medium">{m.name}</td>
                      <td className="px-4 py-3">
                        <AvailabilityBadge value={m.availability} />
                      </td>
                      <td className="px-4 py-3">{task ? <CategoryBadge value={task.category} /> : '—'}</td>
                      <td className="px-4 py-3">
                        {task ? (
                          <>
                            <TaskTitle task={task} member={m} />
                            <div className="text-xs text-slate-500">
                              {TYPE_LABEL[task.type]}
                              {task.project && ` · ${task.project.name}`}
                              {workingNow(task, m.id).length > 0 &&
                                ` · with ${listNames(workingNow(task, m.id).map((p) => p.name))}`}
                            </div>
                          </>
                        ) : paused ? (
                          <span className="text-slate-400">
                            Paused:{' '}
                            <TaskTitle task={paused} member={m} />
                          </span>
                        ) : (
                          <span className="text-slate-400">
                            {m.availability === 'AWAY' ? 'Not working right now' : 'Ready for a new task'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{task ? <TaskStatusBadge value={task.status} /> : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{since(m.statusChangedAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-700">
                        {m.todaySeconds ? duration(m.todaySeconds) : '—'}
                      </td>
                    </tr>
                  )
                })}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                      No developers match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside>
          {me?.role === 'MANAGER' && <ClaudeSeats />}
          <ActivityFeed />
        </aside>
      </div>
    </div>
  )
}
