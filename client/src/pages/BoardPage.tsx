import { useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth'
import { CategoryBadge, PriorityBadge } from '../components/badges'
import { TaskDialog } from '../components/TaskDialog'
import { useToast } from '../components/toast'
import { Button, inputClass, Segmented } from '../components/ui'
import { STATUS_LABEL, TYPE_LABEL } from '../lib/labels'
import { useMoveTask, useProjects, useTasks, useTeam } from '../lib/queries'
import type { TaskCard, TaskStatus, WorkCategory } from '../lib/types'

const COLUMNS: { status: TaskStatus; tone: string; accent: string }[] = [
  { status: 'NOT_STARTED', tone: 'bg-slate-100', accent: 'text-slate-700' },
  { status: 'IN_PROGRESS', tone: 'bg-blue-50', accent: 'text-blue-800' },
  { status: 'BLOCKED', tone: 'bg-red-50', accent: 'text-red-800' },
  { status: 'COMPLETED', tone: 'bg-emerald-50', accent: 'text-emerald-800' },
]

function initials(name: string) {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function CardBody({ task }: { task: TaskCard }) {
  return (
    <>
      <p className="font-medium leading-snug">{task.title}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <CategoryBadge value={task.category} />
        <span className="text-xs text-slate-500">{TYPE_LABEL[task.type]}</span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <PriorityBadge value={task.priority} />
        {task.assignee ? (
          <span className="flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[10px] font-semibold text-white">
              {initials(task.assignee.name)}
            </span>
            <span className="truncate">{task.assignee.name}</span>
          </span>
        ) : (
          <span className="text-xs italic text-slate-400">Unassigned</span>
        )}
      </div>
      {task.project && <p className="mt-2 truncate text-xs text-slate-400">{task.project.name}</p>}
    </>
  )
}

const cardClass = (task: TaskCard) =>
  `block w-full rounded-lg border bg-white p-3 text-left text-sm shadow-sm ${
    task.status === 'BLOCKED' ? 'border-red-300 border-l-4 border-l-red-500' : 'border-slate-200'
  }`

function DraggableCard({ task, canDrag, onOpen }: { task: TaskCard; canDrag: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, disabled: !canDrag })
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e)
        if (e.key === 'Enter' && !isDragging) onOpen()
      }}
      aria-label={`${task.title}, ${STATUS_LABEL[task.status]}`}
      className={`${cardClass(task)} transition hover:border-slate-400 ${
        canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      } ${isDragging ? 'opacity-30' : ''}`}
    >
      <CardBody task={task} />
    </div>
  )
}

function Column({
  status,
  tone,
  accent,
  tasks,
  children,
}: {
  status: TaskStatus
  tone: string
  accent: string
  tasks: TaskCard[]
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[12rem] flex-col rounded-xl p-3 transition ${tone} ${
        isOver ? 'ring-2 ring-slate-400 ring-offset-2' : ''
      }`}
    >
      <h2 className={`mb-3 flex items-center justify-between px-1 text-sm font-semibold ${accent}`}>
        {STATUS_LABEL[status]}
        <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs">{tasks.length}</span>
      </h2>
      <div className="flex flex-1 flex-col gap-2">
        {children}
        {tasks.length === 0 && (
          <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
            Drop tasks here
          </p>
        )}
      </div>
    </section>
  )
}

export function BoardPage() {
  const { me } = useAuth()
  const { data: tasks = [], isLoading } = useTasks()
  const { data: team } = useTeam()
  const { data: projects = [] } = useProjects()
  const move = useMoveTask()
  const toast = useToast()

  const [category, setCategory] = useState<'ALL' | WorkCategory>('ALL')
  const [assignee, setAssignee] = useState('') // '' = everyone, 'none' = unassigned, else a user id
  const [projectId, setProjectId] = useState('')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // A small drag threshold keeps plain clicks opening the card. Keyboard: Space picks
  // up/drops, arrows move, Escape cancels; Enter is left free for opening the card.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] } }),
  )
  // Dropping a card back onto itself fires a click; ignore clicks right after a drag.
  const lastDragEnd = useRef(0)
  const navigate = useNavigate()
  const open = (t: TaskCard) => {
    if (Date.now() - lastDragEnd.current > 250) navigate(`/tasks/${t.id}`)
  }

  const isManager = me?.role === 'MANAGER'
  const canDrag = (t: TaskCard) => isManager || t.assignee?.id === me?.id

  const query = search.trim().toLowerCase()
  const visible = tasks.filter(
    (t) =>
      (category === 'ALL' || t.category === category) &&
      (assignee === '' || (assignee === 'none' ? !t.assignee : t.assignee?.id === assignee)) &&
      (!projectId || t.project?.id === projectId) &&
      (!query || t.title.toLowerCase().includes(query)),
  )
  const blocked = visible.filter((t) => t.status === 'BLOCKED').length
  const dragging = tasks.find((t) => t.id === draggingId)

  function onDragEnd(e: DragEndEvent) {
    setDraggingId(null)
    lastDragEnd.current = Date.now()
    const task = tasks.find((t) => t.id === e.active.id)
    const to = e.over?.id as TaskStatus | undefined
    if (!task || !to || task.status === to) return
    move.mutate({ id: task.id, status: to }, { onError: (err) => toast((err as Error).message, 'error') })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Task board</h1>
          <p className="text-sm text-slate-500">
            {visible.length} tasks
            {blocked > 0 && <span className="ml-2 font-medium text-red-700">· {blocked} blocked</span>}
          </p>
        </div>
        {isManager && <Button onClick={() => setCreating(true)}>+ New task</Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-auto">
          <Segmented
            value={category}
            onChange={setCategory}
            options={[
              { value: 'ALL', label: 'All work' },
              { value: 'DELIVERY_TEAM', label: 'Delivery Team' },
              { value: 'RND_INNOVATION', label: 'R&D Innovation' },
            ]}
          />
        </div>
        <select
          aria-label="Filter by assignee"
          className={`${inputClass} sm:w-44`}
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
        >
          <option value="">Everyone</option>
          {me?.role === 'DEVELOPER' && <option value={me.id}>Only mine</option>}
          <option value="none">Unassigned</option>
          {team?.members
            .filter((m) => m.id !== me?.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
        </select>
        <select
          aria-label="Filter by project"
          className={`${inputClass} sm:w-52`}
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <input
          type="search"
          aria-label="Search tasks"
          placeholder="Search tasks…"
          className={`${inputClass} sm:w-52`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="text-slate-500">Loading…</p>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setDraggingId(String(e.active.id))}
          onDragCancel={() => setDraggingId(null)}
          onDragEnd={onDragEnd}
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => {
              const columnTasks = visible.filter((t) => t.status === col.status)
              return (
                <Column key={col.status} {...col} tasks={columnTasks}>
                  {columnTasks.map((t) => (
                    <DraggableCard key={t.id} task={t} canDrag={canDrag(t)} onOpen={() => open(t)} />
                  ))}
                </Column>
              )
            })}
          </div>
          <DragOverlay>
            {dragging && (
              <div className={`${cardClass(dragging)} rotate-2 cursor-grabbing shadow-xl`}>
                <CardBody task={dragging} />
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      <TaskDialog task={creating ? null : undefined} onClose={() => setCreating(false)} />
    </div>
  )
}
