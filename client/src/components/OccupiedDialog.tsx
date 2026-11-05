import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth'
import { useMyTasks, useProjects, useSetOccupied } from '../lib/queries'
import { PRIORITY_LABEL, TYPE_LABEL } from '../lib/labels'
import type { Priority, TaskType, WorkCategory } from '../lib/types'
import { CategoryBadge, TaskStatusBadge } from './badges'
import { Button, ErrorText, inputClass, Modal, Segmented } from './ui'

export function OccupiedDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { me } = useAuth()
  const { data: tasks = [] } = useMyTasks()
  const { data: projects = [] } = useProjects()
  const setOccupied = useSetOccupied()

  const pickable = tasks.filter((t) => t.id !== me?.currentTask?.id)
  // Opens on "My tasks" when there are any to switch to, otherwise on "Create new task".
  const [chosen, setChosen] = useState<'pick' | 'new' | null>(null)
  const effectiveMode = chosen ?? (pickable.length > 0 ? 'pick' : 'new')

  const [taskId, setTaskId] = useState('')
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<WorkCategory>('DELIVERY_TEAM')
  const [type, setType] = useState<TaskType>('DELIVERY')
  const [projectId, setProjectId] = useState('')
  const [priority, setPriority] = useState<Priority>('MEDIUM')

  function close() {
    setOccupied.reset()
    setTaskId('')
    setTitle('')
    setChosen(null)
    onClose()
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const input =
      effectiveMode === 'pick'
        ? { taskId }
        : {
            newTask: {
              title,
              category,
              type: category === 'RND_INNOVATION' ? ('RESEARCH' as const) : type,
              projectId: projectId || undefined,
              priority,
            },
          }
    setOccupied.mutate(input, { onSuccess: close })
  }

  const canSubmit = effectiveMode === 'pick' ? !!taskId : title.trim().length >= 2

  return (
    <Modal open={open} onClose={close} title={me?.currentTask ? 'Switch to another task' : "What are you working on?"}>
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          value={effectiveMode}
          onChange={setChosen}
          options={[
            { value: 'pick', label: `My tasks (${pickable.length})` },
            { value: 'new', label: '+ Create new task' },
          ]}
        />

        {effectiveMode === 'pick' && pickable.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500">
            {me?.currentTask ? 'You have no other open tasks.' : 'You have no open tasks.'} Create a new one, or{' '}
            <Link to="/research" onClick={close} className="font-medium text-slate-900 underline">
              pick up a research task
            </Link>
            .
          </p>
        ) : effectiveMode === 'pick' ? (
          <ul className="space-y-2">
            {pickable.map((t) => (
              <li key={t.id}>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                    taskId === t.id ? 'border-slate-900 bg-slate-50' : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="task"
                    className="mt-1"
                    checked={taskId === t.id}
                    onChange={() => setTaskId(t.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <CategoryBadge value={t.category} />
                      <TaskStatusBadge value={t.status} />
                      <span>{TYPE_LABEL[t.type]}</span>
                      {t.project && <span>· {t.project.name}</span>}
                    </div>
                  </div>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium">New task name</span>
              <input
                autoFocus
                className={inputClass}
                placeholder="e.g. Supporting PM with client demo prep"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>

            <div>
              <span className="mb-1 block text-sm font-medium">Work category</span>
              <Segmented
                value={category}
                onChange={setCategory}
                options={[
                  { value: 'DELIVERY_TEAM', label: 'Delivery Team' },
                  { value: 'RND_INNOVATION', label: 'R&D Innovation' },
                ]}
              />
            </div>

            {category === 'DELIVERY_TEAM' && (
              <div>
                <span className="mb-1 block text-sm font-medium">Type of work</span>
                <Segmented
                  value={type}
                  onChange={setType}
                  options={[
                    { value: 'DELIVERY', label: TYPE_LABEL.DELIVERY },
                    { value: 'PM_SUPPORT', label: TYPE_LABEL.PM_SUPPORT },
                  ]}
                />
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Project (optional)</span>
                <select className={inputClass} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  <option value="">— None —</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium">Priority</span>
                <select
                  className={inputClass}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                >
                  {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        )}

        <ErrorText error={setOccupied.error} />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || setOccupied.isPending}>
            {setOccupied.isPending ? 'Saving…' : 'Start working'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
