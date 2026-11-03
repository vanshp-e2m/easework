import { useState } from 'react'
import { useAuth } from '../auth'
import { PriorityBadge, TaskStatusBadge } from '../components/badges'
import { Link } from 'react-router-dom'
import { PickUpButtons } from '../components/PickUpButtons'
import { TaskDialog } from '../components/TaskDialog'
import { useToast } from '../components/toast'
import { Button } from '../components/ui'
import { ago } from '../lib/labels'
import { usePickUpTask, useProjects, useTasks } from '../lib/queries'
import { countStages, researchStage, STAGE_LABEL, type ResearchStage } from '../lib/research'
import type { TaskCard } from '../lib/types'

const STAGE_TONE: Record<ResearchStage, string> = {
  OPEN: 'text-violet-700',
  ASSIGNED: 'text-slate-700',
  IN_PROGRESS: 'text-blue-700',
  COMPLETED: 'text-emerald-700',
}

const EMPTY: Record<ResearchStage, string> = {
  OPEN: 'No open research tasks right now.',
  ASSIGNED: 'Nothing is waiting to be started.',
  IN_PROGRESS: 'No research is in progress.',
  COMPLETED: 'No research has been completed yet.',
}

export function ResearchPage() {
  const { me } = useAuth()
  const { data: tasks = [], isLoading } = useTasks()
  const { data: projects = [] } = useProjects()
  const pickUp = usePickUpTask()
  const toast = useToast()
  const [stage, setStage] = useState<ResearchStage>('OPEN')
  const [creating, setCreating] = useState(false)

  const research = tasks.filter((t) => t.type === 'RESEARCH')
  const counts = countStages(research)
  const list = research.filter((t) => researchStage(t) === stage)
  const isDeveloper = me?.role === 'DEVELOPER'

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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Research tasks</h1>
          <p className="text-sm text-slate-500">R&D Innovation work that developers can pick up when they're free.</p>
        </div>
        {me?.role === 'MANAGER' && <Button onClick={() => setCreating(true)}>+ New research task</Button>}
      </div>

      {isDeveloper && me.availability === 'OCCUPIED' && me.currentTask && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You're occupied on <span className="font-medium">“{me.currentTask.title}”</span>. Picking up a task adds it to
          your list without interrupting your current work.
        </p>
      )}

      <div role="tablist" aria-label="Research pipeline" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(Object.keys(STAGE_LABEL) as ResearchStage[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={stage === s}
            onClick={() => setStage(s)}
            className={`rounded-xl border bg-white p-4 text-left transition ${
              stage === s ? 'border-slate-900 ring-1 ring-slate-900' : 'border-slate-200 hover:border-slate-400'
            }`}
          >
            <span className="block text-sm text-slate-500">{STAGE_LABEL[s]}</span>
            <span className={`mt-1 block text-3xl font-bold ${STAGE_TONE[s]}`}>{counts[s]}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          {EMPTY[stage]}
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((t) => (
            <li key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <Link to={`/tasks/${t.id}`} className="min-w-0 flex-1">
                  <p className="font-semibold hover:underline">{t.title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <PriorityBadge value={t.priority} />
                    {t.project && <span>{t.project.name}</span>}
                    <span>
                      Added by {t.createdBy.name} {ago(t.createdAt)}
                    </span>
                  </div>
                </Link>
                <div className="flex flex-wrap items-center gap-2">
                  {t.assignee ? (
                    <>
                      <span className="text-sm text-slate-600">{t.assignee.id === me?.id ? 'You' : t.assignee.name}</span>
                      <TaskStatusBadge value={t.status} />
                    </>
                  ) : (
                    isDeveloper && <PickUpButtons task={t} disabled={pickUp.isPending} onPick={(start) => pick(t, start)} />
                  )}
                </div>
              </div>
              {t.description && <p className="mt-3 line-clamp-2 text-sm text-slate-700">{t.description}</p>}
              {t.expectedOutcome && (
                <p className="mt-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-800">Expected outcome:</span> {t.expectedOutcome}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <TaskDialog
        task={creating ? null : undefined}
        onClose={() => setCreating(false)}
        newTitle="New research task"
        defaults={{
          category: 'RND_INNOVATION',
          type: 'RESEARCH',
          projectId: projects.find((p) => p.kind === 'RESEARCH')?.id ?? null,
        }}
      />
    </div>
  )
}
