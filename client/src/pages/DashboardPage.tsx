import { useState } from 'react'
import { AvailabilityBadge, CategoryBadge, TaskStatusBadge } from '../components/badges'
import { Segmented } from '../components/ui'
import { ago, since, TYPE_LABEL } from '../lib/labels'
import { useActivity, useTasks, useTeam } from '../lib/queries'
import { countStages, STAGE_LABEL, type ResearchStage } from '../lib/research'
import { Link } from 'react-router-dom'
import type { TeamMember } from '../lib/types'

type Filter = 'ALL' | 'AVAILABLE' | 'DELIVERY_TEAM' | 'RND_INNOVATION'

const FILTERS: Record<Filter, (m: TeamMember) => boolean> = {
  ALL: () => true,
  AVAILABLE: (m) => m.availability === 'AVAILABLE',
  DELIVERY_TEAM: (m) => m.availability === 'OCCUPIED' && m.currentTask?.category === 'DELIVERY_TEAM',
  RND_INNOVATION: (m) => m.availability === 'OCCUPIED' && m.currentTask?.category === 'RND_INNOVATION',
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
  const { data: team, isLoading } = useTeam()
  const { data: activity = [] } = useActivity()
  const { data: tasks = [] } = useTasks()
  const [filter, setFilter] = useState<Filter>('ALL')
  const research = countStages(tasks)

  if (isLoading || !team) return <p className="text-slate-500">Loading…</p>
  const { summary } = team
  const members = team.members.filter(FILTERS[filter])
  const pct = (n: number) => (summary.total ? (n / summary.total) * 100 : 0)

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Developers" value={summary.total} tone="text-slate-900" />
        <Stat label="Available" value={summary.available} tone="text-emerald-600" />
        <Stat label="Occupied · Delivery Team" value={summary.occupiedDelivery} tone="text-sky-600" />
        <Stat label="Occupied · R&D Innovation" value={summary.occupiedRnd} tone="text-violet-600" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-slate-600">Capacity split</p>
        <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
          <div className="bg-sky-500" style={{ width: `${pct(summary.occupiedDelivery)}%` }} />
          <div className="bg-violet-500" style={{ width: `${pct(summary.occupiedRnd)}%` }} />
          <div className="bg-emerald-400" style={{ width: `${pct(summary.available)}%` }} />
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
                ]}
              />
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Developer</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Working on</th>
                  <th className="px-4 py-2.5 font-medium">Task status</th>
                  <th className="px-4 py-2.5 font-medium">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => {
                  const task = m.availability === 'OCCUPIED' ? m.currentTask : null
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
                            <Link to={`/tasks/${task.id}`} className="hover:underline">
                              {task.title}
                            </Link>
                            <div className="text-xs text-slate-500">
                              {TYPE_LABEL[task.type]}
                              {task.project && ` · ${task.project.name}`}
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-400">Ready for a new task</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{task ? <TaskStatusBadge value={task.status} /> : '—'}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-500">{since(m.statusChangedAt)}</td>
                    </tr>
                  )
                })}
                {members.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No developers match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside>
          <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
          <ul className="space-y-2">
            {activity.map((a) => (
              <li key={a.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p>{a.summary}</p>
                <p className="mt-1 text-xs text-slate-400">{ago(a.createdAt)}</p>
              </li>
            ))}
            {activity.length === 0 && <li className="text-sm text-slate-500">No activity yet.</li>}
          </ul>
        </aside>
      </div>
    </div>
  )
}
