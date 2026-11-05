import { Fragment, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth'
import { CategoryBadge, PriorityBadge, TaskStatusBadge } from '../components/badges'
import { DocLink } from '../components/DocLink'
import { PickUpButtons } from '../components/PickUpButtons'
import { TaskDialog } from '../components/TaskDialog'
import { useToast } from '../components/toast'
import { Button, ErrorText, inputClass, Modal, Segmented } from '../components/ui'
import { ago, AVAILABILITY_LABEL, duration, ENTRY_LABEL, ENTRY_PROMPT, fileSize, sessionSeconds, TYPE_LABEL } from '../lib/labels'
import { isOnTask, workingNow } from '../lib/people'
import {
  useAddEntry,
  useAddLink,
  useAddMember,
  useDeleteEntry,
  useDeleteLink,
  useJoinTask,
  useMoveTask,
  usePickUpTask,
  useReleaseTask,
  useRemoveMember,
  useSetOccupied,
  useTaskDetail,
  useTeam,
  useUpdateEntry,
  useUploadFile,
} from '../lib/queries'
import type { EntryKind, LinkKind, TaskCard, TaskEntry, TaskLink, TaskStatus, WorkSession } from '../lib/types'

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
  const now = useNow(30_000)

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

  const { task, entries, links, history, sessions } = data
  const outcomes = entries.filter((e) => e.kind === 'OUTCOME')
  const finalReports = links.filter((l) => l.kind === 'FINAL_REPORT')
  const timeSpent = sessions.reduce((sum, s) => sum + sessionSeconds(s, now), 0)

  return (
    <div className="space-y-6">
      <TaskHeader task={task} timeSpent={timeSpent} />

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
                  <DocLink
                    link={l}
                    className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-blue-800 shadow-sm hover:underline"
                  >
                    📄 {l.label}
                  </DocLink>
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
          <People task={task} sessions={sessions} now={now} />
          <Sessions sessions={sessions} now={now} />
          <History items={history} />
        </div>
      </div>
    </div>
  )
}

function useCanDocument(task: TaskCard) {
  const { me } = useAuth()
  return me?.role === 'MANAGER' || isOnTask(task, me?.id)
}

function TaskHeader({ task, timeSpent }: { task: TaskCard; timeSpent: number }) {
  const { me } = useAuth()
  const navigate = useNavigate()
  const toast = useToast()
  const move = useMoveTask()
  const pickUp = usePickUpTask()
  const join = useJoinTask()
  const release = useReleaseTask()
  const leave = useRemoveMember()
  const start = useSetOccupied()
  const [editing, setEditing] = useState(false)
  const [completing, setCompleting] = useState(false)

  const isManager = me?.role === 'MANAGER'
  const isDeveloper = me?.role === 'DEVELOPER'
  const owner = !!me && task.assignee?.id === me.id
  const onTask = isOnTask(task, me?.id)
  const collaborator = onTask && !owner
  const workingOnIt = me?.availability === 'OCCUPIED' && me.currentTask?.id === task.id
  const canMove = isManager || onTask
  const open = task.status !== 'COMPLETED'
  const busy = move.isPending || pickUp.isPending || join.isPending || release.isPending || leave.isPending || start.isPending
  const successor = task.members[0]?.user
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
          {!task.assignee && open && isDeveloper && (
            <PickUpButtons
              task={task}
              disabled={busy}
              onPick={(start) => pickUp.mutate({ id: task.id, start }, { onError: fail })}
            />
          )}
          {task.assignee && !onTask && open && isDeveloper && (
            <PickUpButtons
              task={task}
              join
              disabled={busy}
              onPick={(start) => join.mutate({ id: task.id, start }, { onError: fail })}
            />
          )}
          {onTask && open && !workingOnIt && (
            <Button disabled={busy} onClick={() => start.mutate({ taskId: task.id }, { onError: fail })}>
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
          {owner && open && (
            <Button
              variant="ghost"
              disabled={busy}
              title={successor ? `${successor.name} becomes the owner` : undefined}
              // Handing over makes the task someone else's, so it's no longer visible here.
              onClick={() =>
                release.mutate(task.id, { onError: fail, onSuccess: () => successor && navigate('/board') })
              }
            >
              {successor ? `Hand over to ${successor.name.split(' ')[0]}` : 'Release to pool'}
            </Button>
          )}
          {collaborator && open && me && (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                leave.mutate({ taskId: task.id, userId: me.id }, { onError: fail, onSuccess: () => navigate('/board') })
              }
            >
              Leave task
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

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4 lg:grid-cols-7">
        {[
          ['Owner', task.assignee?.name ?? 'Unassigned'],
          ['Project', task.project?.name ?? '—'],
          ['Created by', task.createdBy.name],
          ['Created', shortDate(task.createdAt)],
          ['Started', shortDate(task.startedAt)],
          ['Completed', shortDate(task.completedAt)],
          ['Time spent', timeSpent ? duration(timeSpent) : '—'],
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
  const remove = useDeleteLink(task.id)

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 font-semibold">Links &amp; documents</h2>
      {links.length === 0 ? (
        <p className="text-sm text-slate-500">No documents attached.</p>
      ) : (
        <ul className="space-y-2">
          {links.map((l) => (
            <li key={l.id} className="flex items-start gap-2 text-sm">
              <span aria-hidden>{l.kind === 'FINAL_REPORT' ? '📄' : l.url ? '🔗' : '📎'}</span>
              <div className="min-w-0 flex-1">
                <DocLink link={l} className="font-medium text-blue-700 hover:underline">
                  {l.label}
                </DocLink>
                {l.kind === 'FINAL_REPORT' && (
                  <span className="ml-2 whitespace-nowrap rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-blue-800">
                    Final report
                  </span>
                )}
                <p className="truncate text-xs text-slate-400">
                  {l.url ?? `${l.fileName} · ${fileSize(l.fileSize ?? 0)}`}
                </p>
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
      {canDocument && <AttachForm taskId={task.id} />}
    </section>
  )
}

// Matches the server's default MAX_UPLOAD_MB; the server has the final say.
const MAX_UPLOAD_MB = 25

/** Upload a file from this computer, or attach a web link. Files can also be dropped on it. */
function AttachForm({ taskId }: { taskId: string }) {
  const addLink = useAddLink(taskId)
  const upload = useUploadFile(taskId)
  const [mode, setMode] = useState<'file' | 'link'>('file')
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [kind, setKind] = useState<LinkKind>('SUPPORTING')
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const tooBig = !!file && file.size > MAX_UPLOAD_MB * 1024 * 1024
  const canSubmit = mode === 'file' ? !!file && !tooBig : !!label.trim() && !!url.trim()
  const busy = addLink.isPending || upload.isPending

  function reset() {
    setLabel('')
    setUrl('')
    setFile(null)
    setKind('SUPPORTING')
    if (fileInput.current) fileInput.current.value = ''
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (mode === 'link') addLink.mutate({ label, url, kind }, { onSuccess: reset })
    else if (file) upload.mutate({ file, label: label.trim(), kind }, { onSuccess: reset })
  }

  return (
    <form
      onSubmit={submit}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const dropped = e.dataTransfer.files[0]
        if (dropped) {
          setMode('file')
          setFile(dropped)
        }
      }}
      className={`mt-4 space-y-2 border-t border-slate-100 pt-4 ${dragging ? 'rounded-lg ring-2 ring-blue-400' : ''}`}
    >
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'file', label: 'Upload file' },
          { value: 'link', label: 'Web link' },
        ]}
      />
      {mode === 'file' ? (
        <>
          <input
            ref={fileInput}
            type="file"
            aria-label="File to upload"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className={`truncate text-xs ${tooBig ? 'text-red-700' : 'text-slate-500'}`}>
              {file.name} · {fileSize(file.size)}
              {tooBig && ` — too large, the limit is ${MAX_UPLOAD_MB} MB`}
            </p>
          ) : (
            <p className="text-xs text-slate-400">Or drop a file here. Up to {MAX_UPLOAD_MB} MB.</p>
          )}
          <input
            aria-label="Document name"
            className={inputClass}
            placeholder={file ? `Name (default: ${file.name})` : 'Name (optional)'}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </>
      ) : (
        <>
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
        </>
      )}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={kind === 'FINAL_REPORT'}
            onChange={(e) => setKind(e.target.checked ? 'FINAL_REPORT' : 'SUPPORTING')}
          />
          Final report
        </label>
        <Button type="submit" variant="secondary" disabled={!canSubmit || busy}>
          {upload.isPending ? 'Uploading…' : mode === 'file' ? 'Upload' : 'Attach'}
        </Button>
      </div>
      <ErrorText error={mode === 'file' ? upload.error : addLink.error} />
    </form>
  )
}

const END_REASON: Record<string, string> = {
  SWITCHED: 'switched task',
  COMPLETED: 'completed',
  PAUSED: 'paused',
  BLOCKED: 'blocked',
  AWAY: 'went away',
  END_OF_DAY: 'end of day',
  REASSIGNED: 'reassigned',
  RELEASED: 'released',
  LEFT: 'left the task',
}

/** Re-render on an interval so open sessions keep counting. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/** Who is on the task and how much time each of them has put in. */
function People({ task, sessions, now }: { task: TaskCard; sessions: WorkSession[]; now: number }) {
  const { me } = useAuth()
  const toast = useToast()
  const remove = useRemoveMember()
  // The owner and managers decide who works on the task.
  const canManage = me?.role === 'MANAGER' || (!!me && task.assignee?.id === me.id)

  const seconds = new Map<string, number>()
  for (const s of sessions) seconds.set(s.user.id, (seconds.get(s.user.id) ?? 0) + sessionSeconds(s, now))
  const working = new Set(workingNow(task).map((p) => p.id))
  const away = new Set(task.currentFor.filter((p) => p.availability === 'AWAY').map((p) => p.id))
  const people = [
    ...(task.assignee ? [{ ...task.assignee, role: 'Owner' as const }] : []),
    ...task.members.map((m) => ({ ...m.user, role: 'Collaborator' as const })),
  ]
  // Time logged by people no longer on the task (released, reassigned or left) still counts.
  const current = new Set(people.map((p) => p.id))
  const former = [...new Map(sessions.filter((s) => !current.has(s.user.id)).map((s) => [s.user.id, s.user])).values()]
  const time = (id: string) => (seconds.get(id) ? duration(seconds.get(id)!) : '—')

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 font-semibold">People</h2>
      <p className="mb-3 text-xs text-slate-500">Each person's time is tracked separately.</p>
      {people.length === 0 && former.length === 0 ? (
        <p className="text-sm text-slate-500">Nobody is on this task yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {people.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="font-medium">{p.name}</span>{' '}
                <span className="text-xs text-slate-500">{p.role}</span>
                {working.has(p.id) && <span className="ml-1 text-xs font-medium text-amber-700">· working now</span>}
                {away.has(p.id) && <span className="ml-1 text-xs text-slate-500">· away</span>}
              </span>
              <span className="flex shrink-0 items-baseline gap-3">
                <span className="tabular-nums text-slate-700">{time(p.id)}</span>
                {canManage && p.role === 'Collaborator' && (
                  <button
                    className="text-xs text-slate-400 hover:text-red-600"
                    disabled={remove.isPending}
                    aria-label={`Take ${p.name} off this task`}
                    onClick={() =>
                      remove.mutate(
                        { taskId: task.id, userId: p.id },
                        { onError: (err) => toast((err as Error).message, 'error') },
                      )
                    }
                  >
                    Remove
                  </button>
                )}
              </span>
            </li>
          ))}
          {former.map((p) => (
            <li key={p.id} className="flex items-baseline justify-between gap-3 text-slate-500">
              <span className="min-w-0">
                {p.name} <span className="text-xs">no longer on it</span>
              </span>
              <span className="shrink-0 tabular-nums">{time(p.id)}</span>
            </li>
          ))}
        </ul>
      )}
      {canManage && task.assignee && task.status !== 'COMPLETED' && <AddCollaborator task={task} />}
    </section>
  )
}

function AddCollaborator({ task }: { task: TaskCard }) {
  const { data: team } = useTeam()
  const add = useAddMember()
  const toast = useToast()
  const [userId, setUserId] = useState('')
  const candidates = team?.members.filter((m) => !isOnTask(task, m.id)) ?? []
  if (candidates.length === 0) return null

  function submit(e: FormEvent) {
    e.preventDefault()
    const name = candidates.find((m) => m.id === userId)?.name
    add.mutate(
      { taskId: task.id, userId },
      {
        onSuccess: () => {
          setUserId('')
          toast(`${name} can now work on "${task.title}"`)
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-2 border-t border-slate-100 pt-4">
      <div className="flex gap-2">
        <select
          aria-label="Developer to add"
          className={inputClass}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        >
          <option value="">Add a collaborator…</option>
          {candidates.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {AVAILABILITY_LABEL[m.availability]}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" disabled={!userId || add.isPending}>
          Add
        </Button>
      </div>
      <ErrorText error={add.error} />
    </form>
  )
}

function Sessions({ sessions, now }: { sessions: WorkSession[]; now: number }) {
  const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 font-semibold">Work sessions</h2>
      <p className="mb-3 text-xs text-slate-500">Time is counted only while someone is Occupied on this task.</p>
      {sessions.length === 0 ? (
        <p className="text-sm text-slate-500">No time tracked yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0">
                <span className="font-medium">{s.user.name}</span>{' '}
                <span className="text-slate-500">
                  {date(s.startedAt)} · {time(s.startedAt)}–
                  {s.endedAt ? `${time(s.endedAt)} · ${END_REASON[s.endReason ?? ''] ?? 'ended'}` : 'now'}
                </span>
              </span>
              <span className={`shrink-0 tabular-nums ${s.endedAt ? 'text-slate-700' : 'font-medium text-amber-700'}`}>
                {duration(sessionSeconds(s, now))}
              </span>
            </li>
          ))}
        </ul>
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
