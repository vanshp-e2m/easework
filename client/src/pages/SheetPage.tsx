import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { AssigneeFilter } from '../components/AssigneeFilter'
import { CategoryBadge, PriorityBadge, TaskStatusBadge } from '../components/badges'
import { DocLink } from '../components/DocLink'
import { ProjectDialog } from '../components/ProjectDialog'
import { Button, inputClass } from '../components/ui'
import { downloadCsv } from '../lib/csv'
import { ago, CATEGORY_LABEL, duration, PRIORITY_LABEL, STATUS_LABEL, TYPE_LABEL } from '../lib/labels'
import { isOnTask } from '../lib/people'
import { useProjects, useSheet } from '../lib/queries'
import type { DocLinkRef, Priority, SheetRow, TaskStatus, WorkCategory } from '../lib/types'

const STATUS_ORDER: TaskStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED']
const PRIORITY_ORDER: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT']

// Uploaded files have no public URL; they're downloaded from the task page.
const linkText = (l: DocLinkRef) => `${l.label}: ${l.url ?? `file "${l.fileName}" (on the task page)`}`

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
const isoDay = (iso: string | null) => (iso ? iso.slice(0, 10) : '')

type SortKey = 'title' | 'category' | 'assignee' | 'status' | 'priority' | 'started' | 'completed' | 'docs' | 'time' | 'updated'

const SORT_VALUE: Record<SortKey, (r: SheetRow) => string | number> = {
  title: (r) => r.title.toLowerCase(),
  category: (r) => r.category,
  assignee: (r) => r.assignee?.name.toLowerCase() ?? '~',
  status: (r) => STATUS_ORDER.indexOf(r.status),
  priority: (r) => PRIORITY_ORDER.indexOf(r.priority),
  started: (r) => r.startedAt ?? '',
  completed: (r) => r.completedAt ?? '',
  docs: (r) => Object.values(r.entryCounts).reduce((a, b) => a + b, 0),
  time: (r) => r.timeSpentSeconds,
  updated: (r) => r.updatedAt,
}

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'title', label: 'Task', className: 'min-w-[16rem]' },
  { key: 'category', label: 'Category' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' },
  { key: 'started', label: 'Started' },
  { key: 'completed', label: 'Completed' },
  { key: 'docs', label: 'Documentation' },
  { key: 'time', label: 'Time spent' },
  { key: 'updated', label: 'Updated' },
]

function DocCounts({ row }: { row: SheetRow }) {
  const parts = (
    [
      ['FINDING', 'finding', 'bg-violet-100 text-violet-800'],
      ['CHALLENGE', 'challenge', 'bg-amber-100 text-amber-800'],
      ['SOLUTION', 'solution', 'bg-emerald-100 text-emerald-800'],
      ['PROGRESS', 'update', 'bg-slate-100 text-slate-700'],
    ] as const
  ).filter(([k]) => row.entryCounts[k] > 0)
  if (parts.length === 0) return <span className="text-slate-300">—</span>
  return (
    <span className="flex flex-wrap gap-1">
      {parts.map(([k, noun, style]) => (
        <span key={k} className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium ${style}`}>
          {row.entryCounts[k]} {noun}
          {row.entryCounts[k] > 1 ? 's' : ''}
        </span>
      ))}
    </span>
  )
}

export function SheetPage() {
  const { me } = useAuth()
  const { data: rows = [], isLoading } = useSheet()
  const { data: projects = [] } = useProjects()
  const [params, setParams] = useSearchParams()
  const [category, setCategory] = useState<'' | WorkCategory>('')
  const [status, setStatus] = useState<'' | TaskStatus>('')
  const [assignee, setAssignee] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'updated', dir: -1 })
  const [creatingProject, setCreatingProject] = useState(false)

  // Each sheet tab is a slice of the same task records; the choice lives in the URL so it can be shared.
  const sheetKey = params.get('sheet') ?? 'all'
  const sheets: { key: string; label: string; match: (r: SheetRow) => boolean }[] = [
    { key: 'all', label: 'All tasks', match: () => true },
    { key: 'research', label: 'All research', match: (r) => r.type === 'RESEARCH' },
    ...projects.map((p) => ({ key: p.id, label: p.name, match: (r: SheetRow) => r.project?.id === p.id })),
    { key: 'none', label: 'No project', match: (r) => !r.project },
  ]
  const sheet = sheets.find((s) => s.key === sheetKey) ?? sheets[0]
  const project = projects.find((p) => p.id === sheet.key)

  const query = search.trim().toLowerCase()
  const visible = rows
    .filter(sheet.match)
    .filter(
      (r) =>
        (!category || r.category === category) &&
        (!status || r.status === status) &&
        (!assignee || (assignee === 'none' ? !r.assignee : isOnTask(r, assignee))) &&
        (!query || r.title.toLowerCase().includes(query) || (r.outcome ?? '').toLowerCase().includes(query)),
    )
    .sort((a, b) => {
      const va = SORT_VALUE[sort.key](a)
      const vb = SORT_VALUE[sort.key](b)
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir
    })
  const countBy = (s: TaskStatus) => visible.filter((r) => r.status === s).length

  function toggleSort(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  }

  function exportCsv() {
    const header = [
      'Task', 'Category', 'Type', 'Status', 'Priority', 'Assignee', 'Collaborators', 'Project', 'Created', 'Started', 'Completed', 'Time spent (h)', 'Time by person',
      'Progress updates', 'Findings', 'Challenges', 'Solutions', 'Outcome', 'Final report', 'Other links', 'Task link',
    ]
    const body = visible.map((r) => [
      r.title,
      CATEGORY_LABEL[r.category],
      TYPE_LABEL[r.type],
      STATUS_LABEL[r.status],
      PRIORITY_LABEL[r.priority],
      r.assignee?.name ?? 'Unassigned',
      r.members.map((m) => m.user.name).join(', '),
      r.project?.name ?? '',
      isoDay(r.createdAt),
      isoDay(r.startedAt),
      isoDay(r.completedAt),
      (r.timeSpentSeconds / 3600).toFixed(1),
      r.timeByPerson.map((p) => `${p.name} ${(p.seconds / 3600).toFixed(1)}h`).join('; '),
      r.entryCounts.PROGRESS,
      r.entryCounts.FINDING,
      r.entryCounts.CHALLENGE,
      r.entryCounts.SOLUTION,
      r.outcome ?? '',
      r.links.filter((l) => l.kind === 'FINAL_REPORT').map(linkText).join('\n'),
      r.links.filter((l) => l.kind === 'SUPPORTING').map(linkText).join('\n'),
      `${window.location.origin}/tasks/${r.id}`,
    ])
    const slug = sheet.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    downloadCsv(`easework-${slug}-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...body])
  }

  const th = (c: (typeof COLUMNS)[number]): ReactNode => {
    const active = sort.key === c.key
    return (
      <th
        key={c.key}
        scope="col"
        aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
        className={`px-3 py-2.5 font-medium ${c.className ?? ''}`}
      >
        <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 uppercase hover:text-slate-900">
          {c.label}
          <span aria-hidden className={active ? 'text-slate-900' : 'text-slate-300'}>
            {active && sort.dir === -1 ? '▼' : '▲'}
          </span>
        </button>
      </th>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Tracking sheet</h1>
          <p className="text-sm text-slate-500">Updates automatically from the board, research pool and task pages.</p>
        </div>
        <div className="flex gap-2">
          {me?.role === 'MANAGER' && (
            <Button variant="secondary" onClick={() => setCreatingProject(true)}>
              + New project
            </Button>
          )}
          <Button onClick={exportCsv} disabled={visible.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <div role="tablist" aria-label="Sheets" className="flex min-w-max gap-1 border-b border-slate-200">
          {sheets.map((s) => {
            const selected = s.key === sheet.key
            return (
              <button
                key={s.key}
                role="tab"
                aria-selected={selected}
                onClick={() => setParams(s.key === 'all' ? {} : { sheet: s.key })}
                className={`-mb-px whitespace-nowrap rounded-t-lg border px-3 py-2 text-sm font-medium ${
                  selected
                    ? 'border-slate-200 border-b-white bg-white text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-900'
                }`}
              >
                {s.label}
                <span className="ml-1.5 text-xs text-slate-400">{rows.filter(s.match).length}</span>
              </button>
            )
          })}
        </div>
      </div>

      {project?.description && <p className="text-sm text-slate-600">{project.description}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Category" className={`${inputClass} sm:w-44`} value={category} onChange={(e) => setCategory(e.target.value as '' | WorkCategory)}>
          <option value="">All categories</option>
          <option value="DELIVERY_TEAM">Delivery Team</option>
          <option value="RND_INNOVATION">R&amp;D Innovation</option>
        </select>
        <select aria-label="Status" className={`${inputClass} sm:w-40`} value={status} onChange={(e) => setStatus(e.target.value as '' | TaskStatus)}>
          <option value="">All statuses</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <AssigneeFilter value={assignee} onChange={setAssignee} />
        <input
          type="search"
          aria-label="Search"
          placeholder="Search tasks and outcomes…"
          className={`${inputClass} sm:w-64`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="text-sm text-slate-500 sm:ml-auto">
          {visible.length} tasks · {countBy('IN_PROGRESS')} in progress ·{' '}
          <span className={countBy('BLOCKED') ? 'font-medium text-red-700' : ''}>{countBy('BLOCKED')} blocked</span> ·{' '}
          {countBy('COMPLETED')} completed
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500">
            <tr>
              {COLUMNS.slice(0, 9).map(th)}
              <th scope="col" className="px-3 py-2.5 font-medium uppercase">
                Outcome / report
              </th>
              {th(COLUMNS[9])}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 align-top">
            {isLoading && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-slate-500">
                  No tasks on this sheet match the filters.
                </td>
              </tr>
            )}
            {visible.map((r) => {
              const reports = r.links.filter((l) => l.kind === 'FINAL_REPORT')
              return (
                <tr key={r.id} className={`hover:bg-slate-50 ${r.status === 'BLOCKED' ? 'bg-red-50/40' : ''}`}>
                  <td className="px-3 py-3">
                    <Link to={`/tasks/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {TYPE_LABEL[r.type]}
                      {r.project && sheet.key !== r.project.id && ` · ${r.project.name}`}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <CategoryBadge value={r.category} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    {r.assignee?.name ?? <span className="italic text-slate-400">Unassigned</span>}
                    {r.members.length > 0 && (
                      <div className="text-xs text-slate-500">+ {r.members.map((m) => m.user.name).join(', ')}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <TaskStatusBadge value={r.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <PriorityBadge value={r.priority} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{day(r.startedAt) || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-600">{day(r.completedAt) || '—'}</td>
                  <td className="px-3 py-3">
                    <DocCounts row={r} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-700">
                    {r.timeSpentSeconds ? duration(r.timeSpentSeconds) : <span className="text-slate-300">—</span>}
                    {r.timeByPerson.length > 1 &&
                      r.timeByPerson.map((p) => (
                        <div key={p.name} className="text-xs text-slate-500">
                          {p.name.split(' ')[0]} {duration(p.seconds)}
                        </div>
                      ))}
                  </td>
                  <td className="max-w-xs px-3 py-3">
                    {r.outcome && <p className="line-clamp-2 text-slate-700" title={r.outcome}>{r.outcome}</p>}
                    {reports.map((l) => (
                      <DocLink
                        key={l.id}
                        link={l}
                        className="mt-1 block max-w-full truncate text-xs font-medium text-blue-700 hover:underline"
                      >
                        📄 {l.label}
                      </DocLink>
                    ))}
                    {!r.outcome && reports.length === 0 && <span className="text-slate-300">—</span>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-slate-500" title={new Date(r.updatedAt).toLocaleString()}>
                    {ago(r.updatedAt)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {creatingProject && (
        <ProjectDialog onClose={() => setCreatingProject(false)} onCreated={(p) => setParams({ sheet: p.id })} />
      )}
    </div>
  )
}
