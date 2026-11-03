import { Fragment, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { CategoryBadge, PriorityBadge, TaskStatusBadge } from '../components/badges'
import { PickUpButtons } from '../components/PickUpButtons'
import { TaskDialog } from '../components/TaskDialog'
import { useToast } from '../components/toast'
import { Button, ErrorText, inputClass, Modal } from '../components/ui'
import { ago, ENTRY_LABEL, ENTRY_PROMPT, TYPE_LABEL } from '../lib/labels'
import {
  useAddEntry,
  useAddLink,
  useDeleteEntry,
  useDeleteLink,
  useMoveTask,
  usePickUpTask,
  useReleaseTask,
  useTaskDetail,
  useUpdateEntry,
} from '../lib/queries'
import type { EntryKind, LinkKind, TaskCard, TaskEntry, TaskLink, TaskStatus } from '../lib/types'

const ENTRY_KINDS = Object.keys(ENTRY_LABEL) as EntryKind[]

const ENTRY_STYLE: Record<EntryKind, string> = {
  PROGRESS: 'bg-slate-100 text-slate-700',
  FINDING: 'bg-violet-100 text-violet-800',
  CHALLENGE: 'bg-amber-100 text-amber-800',
  SOLUTION: 'bg-emerald-100 text-emerald-800',
  OUTCOME: 'bg-blue-100 text-blue-800',
}

const fullDate = (iso: string) => new Date(iso).toLocaleString()
const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—')

/** Plain text with bare http(s) URLs turned into links. */
function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a key={i} href={part} target="_blank" rel="noreferrer noopener" className="break-all text-blue-700 underline">
            {part}
          </a>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}

export function TaskPage() {
  const { id = '' } = useParams()
  const { data, isLoading, error } = useTaskDetail(id)

  if (isLoading) return <p className="text-slate-500">Loading…</p>
  if (error || !data) {
    return (
      <div className="space-y-3">
        <ErrorText error={error ?? new Error('Task not found')} />
        <Link to="/board" className="text-sm text-slate-600 underline">
          Back to the board
        </Link>
      </div>
    )
  }

  const { task, entries, links, history } = data
  const outcomes = entries.filter((e) => e.kind === 'OUTCOME')
  const finalReports = links.filter((l) => l.kind === 'FINAL_REPORT')

  return (
    <div className="space-y-6">
      <TaskHeader task={task} />

      {(outcomes.length > 0 || finalReports.length > 0) && (
        <section className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-blue-900">Results</h2>
          {outcomes.map((o) => (
            <p key={o.id} className="mt-2 whitespace-pre-wrap text-sm text-blue-950">
              <Linkified text={o.body} />
            </p>
          ))}
          {finalReports.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {finalReports.map((l) => (
                <li key={l.id}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-blue-800 shadow-sm hover:underline"
                  >
                    📄 {l.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Documentation task={task} entries={entries} />
        <div className="space-y-6">
          <Links task={task} links={links} />
          <History items={history} />
        </div>
      </div>
    </div>
  )
}

function useCanDocument(task: TaskCard) {
  const { me } = useAuth()
  return me?.role === 'MANAGER' || task.assignee?.id === me?.id
}

function TaskHeader({ task }: { task: TaskCard }) {
  const { me } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const move = useMoveTask()
  const pickUp = usePickUpTask()
  const release = useReleaseTask()
  const [editing, setEditing] = useState(false)
  const [completing, setCompleting] = useState(false)

  const isManager = me?.role === 'MANAGER'
  const mine = task.assignee?.id === me?.id
  const canMove = isManager || mine
  const open = task.status !== 'COMPLETED'
  const busy = move.isPending || pickUp.isPending || release.isPending
  const fail = (err: unknown) => toast((err as Error).message, 'error')
  const moveTo = (status: TaskStatus) => move.mutate({ id: task.id, status }, { onError: fail })

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <button onClick={() => navigate(-1)} className="mb-3 text-sm text-slate-500 hover:text-slate-900">
        ← Back
      </button>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <CategoryBadge value={task.category} />
            <TaskStatusBadge value={task.status} />
            <PriorityBadge value={task.priority} />
            <span className="text-xs text-slate-500">{TYPE_LABEL[task.type]}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!task.assignee && open && me?.role === 'DEVELOPER' && (
            <PickUpButtons
              task={task}
              disabled={busy}
              onPick={(start) => pickUp.mutate({ id: task.id, start }, { onError: fail })}
            />
          )}
          {mine && open && task.status !== 'IN_PROGRESS' && (
            <Button disabled={busy} onClick={() => moveTo('IN_PROGRESS')}>
              Start working
            </Button>
          )}
          {canMove && open && (
            <Button variant="success" disabled={busy} onClick={() => setCompleting(true)}>
              Mark completed
            </Button>
          )}
          {canMove && open && task.status !== 'BLOCKED' && (
            <Button variant="secondary" disabled={busy} onClick={() => moveTo('BLOCKED')}>
              Mark blocked
            </Button>
          )}
          {canMove && !open && (
            <Button variant="secondary" disabled={busy} onClick={() => moveTo('NOT_STARTED')}>
              Reopen
            </Button>
          )}
          {mine && open && (
            <Button variant="ghost" disabled={busy} onClick={() => release.mutate(task.id, { onError: fail })}>
              Release to pool
            </Button>
          )}
          {isManager && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </div>

      {task.description && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-slate-700">
          <Linkified text={task.description} />
        </p>
      )}
      {task.expectedOutcome && (
        <p className="mt-3 text-sm text-slate-700">
          <span className="font-medium text-slate-900">Expected outcome:</span> {task.expectedOutcome}
        </p>
      )}

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Assignee', task.assignee?.name ?? 'Unassigned'],
          ['Project', task.project?.name ?? '—'],
          ['Created by', task.createdBy.name],
          ['Created', shortDate(task.createdAt)],
          ['Started', shortDate(task.startedAt)],
          ['Completed', shortDate(task.completedAt)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className="mt-0.5 font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      <TaskDialog task={editing ? task : undefined} onClose={() => setEditing(false)} />
      {completing && <CompleteDialog task={task} onClose={() => setCompleting(false)} />}
    </section>
  )
}

/** Completing asks for the result up front, so management has something to review. */
function CompleteDialog({ task, onClose }: { task: TaskCard; onClose: () => void }) {
  const addEntry = useAddEntry(task.id)
  const addLink = useAddLink(task.id)
  const move = useMoveTask()
  const [outcome, setOutcome] = useState('')
  const [reportLabel, setReportLabel] = useState('')
  const [reportUrl, setReportUrl] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [saving, setSaving] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (reportUrl.trim()) {
        await addLink.mutateAsync({ label: reportLabel.trim() || 'Final report', url: reportUrl, kind: 'FINAL_REPORT' })
      }
      if (outcome.trim()) await addEntry.mutateAsync({ kind: 'OUTCOME', body: outcome })
      await move.mutateAsync({ id: task.id, status: 'COMPLETED' })
      onClose()
    } catch (err) {
      setError(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Mark as completed">
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Outcome</span>
          <textarea
            autoFocus
            rows={4}
            className={inputClass}
            placeholder={ENTRY_PROMPT.OUTCOME}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Final report name</span>
            <input
              className={inputClass}
              placeholder="Final report"
              value={reportLabel}
              onChange={(e) => setReportLabel(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Final report link</span>
            <input
              className={inputClass}
              type="url"
              placeholder="https://…"
              value={reportUrl}
              onChange={(e) => setReportUrl(e.target.value)}
            />
          </label>
        </div>
        <p className="text-xs text-slate-500">Both are optional, but they're what management reviews.</p>
        <ErrorText error={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="success" disabled={saving}>
            {saving ? 'Saving…' : 'Mark completed'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function Documentation({ task, entries }: { task: TaskCard; entries: TaskEntry[] }) {
  const canDocument = useCanDocument(task)
  const [filter, setFilter] = useState<EntryKind | 'ALL'>('ALL')
  const shown = filter === 'ALL' ? entries : entries.filter((e) => e.kind === filter)
  const count = (k: EntryKind) => entries.filter((e) => e.kind === k).length

  return (
    <section className="min-w-0 space-y-4">
      <h2 className="text-lg font-semibold">Documentation</h2>
      {canDocument && <EntryComposer taskId={task.id} />}

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter entries">
          {(['ALL', ...ENTRY_KINDS] as const).map((k) => (
            <button
              key={k}
              aria-pressed={filter === k}
              onClick={() => setFilter(k)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                filter === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-400'
              }`}
            >
              {k === 'ALL' ? `All ${entries.length}` : `${ENTRY_LABEL[k]} ${count(k)}`}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
          {entries.length === 0
            ? canDocument
              ? 'Nothing documented yet. Add progress, findings and challenges as you go.'
              : 'Nothing documented yet.'
            : 'No entries of this kind.'}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => (
            <EntryItem key={e.id} taskId={task.id} entry={e} />
          ))}
        </ul>
      )}
    </section>
  )
}

function EntryComposer({ taskId }: { taskId: string }) {
  const add = useAddEntry(taskId)
  const [kind, setKind] = useState<EntryKind>('PROGRESS')
  const [body, setBody] = useState('')

  function submit(e?: FormEvent) {
    e?.preventDefault()
    if (!body.trim()) return
    add.mutate({ kind, body }, { onSuccess: () => setBody('') })
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Entry type">
        {ENTRY_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              kind === k ? ENTRY_STYLE[k] + ' ring-2 ring-slate-900/20' : 'text-slate-500 hover:bg-slate-100'
            }`}
          >
            {ENTRY_LABEL[k]}
          </button>
        ))}
      </div>
      <textarea
        rows={3}
        aria-label="Entry text"
        className={inputClass}
        placeholder={ENTRY_PROMPT[kind]}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit()
        }}
      />
      <ErrorText error={add.error} />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-slate-400">Ctrl + Enter to save</span>
        <Button type="submit" disabled={!body.trim() || add.isPending}>
          {add.isPending ? 'Saving…' : `Add ${ENTRY_LABEL[kind].toLowerCase()}`}
        </Button>
      </div>
    </form>
  )
}

function EntryItem({ taskId, entry }: { taskId: string; entry: TaskEntry }) {
  const { me } = useAuth()
  const update = useUpdateEntry(taskId)
  const remove = useDeleteEntry(taskId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(entry.body)
  const isAuthor = entry.author.id === me?.id
  const canDelete = isAuthor || me?.role === 'MANAGER'

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className={`rounded-full px-2 py-0.5 font-medium ${ENTRY_STYLE[entry.kind]}`}>{ENTRY_LABEL[entry.kind]}</span>
        <span className="font-medium text-slate-700">{entry.author.name}</span>
        <span title={fullDate(entry.createdAt)}>{ago(entry.createdAt)}</span>
        <span className="ml-auto flex gap-3">
          {isAuthor && !editing && (
            <button className="hover:text-slate-900" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
          {canDelete && !editing && (
            <button
              className="hover:text-red-700"
              disabled={remove.isPending}
              onClick={() => {
                if (window.confirm('Delete this entry?')) remove.mutate(entry.id)
              }}
            >
              Delete
            </button>
          )}
        </span>
      </div>
      {editing ? (
        <div className="mt-2 space-y-2">
          <textarea
            rows={3}
            aria-label="Edit entry"
            className={inputClass}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <ErrorText error={update.error} />
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDraft(entry.body)
                setEditing(false)
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!draft.trim() || update.isPending}
              onClick={() => update.mutate({ id: entry.id, body: draft }, { onSuccess: () => setEditing(false) })}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
          <Linkified text={entry.body} />
        </p>
      )}
    </li>
  )
}

function Links({ task, links }: { task: TaskCard; links: TaskLink[] }) {
  const canDocument = useCanDocument(task)
  const add = useAddLink(task.id)
  const remove = useDeleteLink(task.id)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<LinkKind>('SUPPORTING')

  function submit(e: FormEvent) {
    e.preventDefault()
    add.mutate(
      { label, url, kind },
      {
        onSuccess: () => {
          setLabel('')
          setUrl('')
          setKind('SUPPORTING')
        },
      },
    )
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Links &amp; documents</h2>
      {links.length === 0 ? (
        <p className="text-sm text-slate-500">No documents attached.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="flex items-start gap-2 text-sm">
              <span aria-hidden>{l.kind === 'FINAL_REPORT' ? '📄' : '🔗'}</span>
              <div className="min-w-0 flex-1">
                <a href={l.url} target="_blank" rel="noreferrer noopener" className="font-medium text-blue-700 hover:underline">
                  {l.label}
                </a>
                {l.kind === 'FINAL_REPORT' && (
                  <span className="ml-2 whitespace-nowrap rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-800">
                    Final report
                  </span>
                )}
                <p className="truncate text-xs text-slate-400">{l.url}</p>
              </div>
              {canDocument && (
                <button
                  aria-label={`Remove ${l.label}`}
                  className="text-slate-400 hover:text-red-700"
                  onClick={() => {
                    if (window.confirm(`Remove "${l.label}"?`)) remove.mutate(l.id)
                  }}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canDocument && (
        <form onSubmit={submit} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
          <input
            aria-label="Link name"
            className={inputClass}
            placeholder="Name, e.g. Benchmark sheet"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <input
            aria-label="Link URL"
            type="url"
            className={inputClass}
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={kind === 'FINAL_REPORT'}
                onChange={(e) => setKind(e.target.checked ? 'FINAL_REPORT' : 'SUPPORTING')}
              />
              Final report
            </label>
            <Button type="submit" variant="secondary" disabled={!label.trim() || !url.trim() || add.isPending}>
              Attach
            </Button>
          </div>
          <ErrorText error={add.error} />
        </form>
      )}
    </section>
  )
}

function History({ items }: { items: { id: string; summary: string; createdAt: string }[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">History</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">No history yet.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-slate-200 pl-4">
          {items.map((h) => (
            <li key={h.id} className="text-sm">
              <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-slate-300" aria-hidden />
              <p className="text-slate-700">{h.summary}</p>
              <p className="text-xs text-slate-400" title={fullDate(h.createdAt)}>
                {ago(h.createdAt)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
