import { Fragment, useState } from 'react'
import { ago } from '../lib/labels'
import { useActivity } from '../lib/queries'
import type { Activity } from '../lib/types'

type Kind = 'ALL' | 'STATUS' | 'TASKS' | 'DOCS'

const KIND_LABEL: Record<Kind, string> = { ALL: 'All', STATUS: 'Status', TASKS: 'Tasks', DOCS: 'Docs' }

function kindOf(action: string): Exclude<Kind, 'ALL'> {
  if (action.startsWith('STATUS_')) return 'STATUS'
  if (action.startsWith('ENTRY_') || action.startsWith('LINK_')) return 'DOCS'
  return 'TASKS'
}

const DOT: Record<Exclude<Kind, 'ALL'>, string> = {
  STATUS: 'bg-amber-400',
  TASKS: 'bg-sky-500',
  DOCS: 'bg-violet-500',
}

function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

const PAGE = 25
const MAX = 100

/** A fixed-height feed that scrolls inside itself, so it never stretches the page. */
export function ActivityFeed() {
  const [limit, setLimit] = useState(PAGE)
  const [kind, setKind] = useState<Kind>('ALL')
  const { data: activity = [], isFetching } = useActivity(limit)
  const shown = kind === 'ALL' ? activity : activity.filter((a) => kindOf(a.action) === kind)

  const byDay: { day: string; items: Activity[] }[] = []
  for (const a of shown) {
    const day = dayLabel(a.createdAt)
    if (byDay.at(-1)?.day !== day) byDay.push({ day, items: [] })
    byDay.at(-1)!.items.push(a)
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="whitespace-nowrap text-lg font-semibold">Recent activity</h2>
        <div className="flex gap-1" role="group" aria-label="Filter activity">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button
              key={k}
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition ${
                kind === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400'
              }`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[32rem] overflow-y-auto rounded-xl border border-slate-200 bg-white">
        {shown.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No activity yet.</p>
        ) : (
          <ul>
            {byDay.map(({ day, items }) => (
              <Fragment key={day}>
                <li className="sticky top-0 border-b border-slate-100 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {day}
                </li>
                {items.map((a) => (
                  <li key={a.id} className="flex gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${DOT[kindOf(a.action)]}`} aria-hidden />
                    <span className="min-w-0 flex-1 leading-snug text-slate-700">{a.summary}</span>
                    <span
                      className="shrink-0 whitespace-nowrap text-xs text-slate-400"
                      title={new Date(a.createdAt).toLocaleString()}
                    >
                      {ago(a.createdAt)}
                    </span>
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
        )}
        {activity.length >= limit && limit < MAX && (
          <button
            onClick={() => setLimit((l) => Math.min(l + PAGE, MAX))}
            disabled={isFetching}
            className="w-full border-t border-slate-100 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900"
          >
            {isFetching ? 'Loading…' : 'Show older'}
          </button>
        )}
      </div>
    </section>
  )
}
