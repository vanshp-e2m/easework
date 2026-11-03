import { useState, type FormEvent } from 'react'
import { PRIORITY_LABEL, TYPE_LABEL } from '../lib/labels'
import { useProjects, useSaveTask, useTeam } from '../lib/queries'
import type { Priority, TaskCard, TaskInput, TaskType, WorkCategory } from '../lib/types'
import { Button, ErrorText, inputClass, Modal, Segmented } from './ui'

/**
 * Manager create/edit form. `task` undefined = closed, null = new task, otherwise
 * that task. Everyone else views tasks on the task page.
 */
export function TaskDialog({
  task,
  onClose,
  onSaved,
  defaults,
  newTitle = 'New task',
}: {
  task: TaskCard | null | undefined
  onClose: () => void
  onSaved?: (task: TaskCard) => void
  defaults?: Partial<TaskInput>
  newTitle?: string
}) {
  if (task === undefined) return null
  return (
    <Modal open onClose={onClose} title={task ? 'Edit task' : newTitle}>
      <TaskForm
        key={task?.id ?? 'new'}
        task={task}
        defaults={defaults}
        onDone={(saved) => {
          onClose()
          if (saved) onSaved?.(saved)
        }}
      />
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function TaskForm({
  task,
  defaults,
  onDone,
}: {
  task: TaskCard | null
  defaults?: Partial<TaskInput>
  onDone: (saved?: TaskCard) => void
}) {
  const { data: projects = [] } = useProjects()
  const { data: team } = useTeam()
  const save = useSaveTask()

  const [form, setForm] = useState<TaskInput>({
    title: task?.title ?? '',
    description: task?.description ?? '',
    expectedOutcome: task?.expectedOutcome ?? '',
    category: task?.category ?? defaults?.category ?? 'DELIVERY_TEAM',
    type: task?.type ?? defaults?.type ?? 'DELIVERY',
    priority: task?.priority ?? defaults?.priority ?? 'MEDIUM',
    projectId: task ? (task.project?.id ?? null) : (defaults?.projectId ?? null),
    assigneeId: task?.assignee?.id ?? null,
  })
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setForm((f) => ({ ...f, [key]: value }))

  function setCategory(category: WorkCategory) {
    setForm((f) => ({ ...f, category, type: category === 'RND_INNOVATION' ? 'RESEARCH' : 'DELIVERY' }))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    save.mutate({ id: task?.id, input: form }, { onSuccess: (saved) => onDone(saved) })
  }

  const reassigningActive = task?.status === 'IN_PROGRESS' && form.assigneeId !== (task.assignee?.id ?? null)

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title">
        <input autoFocus className={inputClass} value={form.title} onChange={(e) => set('title', e.target.value)} />
      </Field>

      <div>
        <span className="mb-1 block text-sm font-medium">Work category</span>
        <Segmented
          value={form.category}
          onChange={setCategory}
          options={[
            { value: 'DELIVERY_TEAM', label: 'Delivery Team' },
            { value: 'RND_INNOVATION', label: 'R&D Innovation' },
          ]}
        />
      </div>

      {form.category === 'DELIVERY_TEAM' && (
        <div>
          <span className="mb-1 block text-sm font-medium">Type of work</span>
          <Segmented<TaskType>
            value={form.type}
            onChange={(v) => set('type', v)}
            options={[
              { value: 'DELIVERY', label: TYPE_LABEL.DELIVERY },
              { value: 'PM_SUPPORT', label: TYPE_LABEL.PM_SUPPORT },
            ]}
          />
        </div>
      )}

      <Field label="Description">
        <textarea
          rows={3}
          className={inputClass}
          value={form.description ?? ''}
          onChange={(e) => set('description', e.target.value)}
        />
      </Field>

      {form.category === 'RND_INNOVATION' && (
        <Field label="Expected outcome">
          <textarea
            rows={2}
            className={inputClass}
            placeholder="e.g. Comparison doc with a recommendation"
            value={form.expectedOutcome ?? ''}
            onChange={(e) => set('expectedOutcome', e.target.value)}
          />
        </Field>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Assignee">
          <select
            className={inputClass}
            value={form.assigneeId ?? ''}
            onChange={(e) => set('assigneeId', e.target.value || null)}
          >
            <option value="">Unassigned</option>
            {team?.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.availability === 'AVAILABLE' ? 'Available' : 'Occupied'}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select
            className={inputClass}
            value={form.priority}
            onChange={(e) => set('priority', e.target.value as Priority)}
          >
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Project">
          <select
            className={inputClass}
            value={form.projectId ?? ''}
            onChange={(e) => set('projectId', e.target.value || null)}
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {reassigningActive && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {task?.assignee?.name} is working on this right now. Reassigning frees them up and moves the task back to Not
          Started.
        </p>
      )}

      <ErrorText error={save.error} />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" onClick={() => onDone()}>
          Cancel
        </Button>
        <Button type="submit" disabled={form.title.trim().length < 2 || save.isPending}>
          {save.isPending ? 'Saving…' : task ? 'Save changes' : 'Create task'}
        </Button>
      </div>
    </form>
  )
}
