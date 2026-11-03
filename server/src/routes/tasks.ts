import { Router } from 'express'
import { z } from 'zod'
import { Priority, TaskStatus, TaskType, WorkCategory } from '@prisma/client'
import { prisma } from '../prisma'
import { currentUser, requireRole } from '../auth'
import { HttpError } from '../lib/http'
import { taskCardSelect } from '../domain'
import { changeTaskStatus, createTask, pickUpTask, releaseTask, updateTask } from '../services/tasks'

export const tasksRouter = Router()

const listQuery = z.object({
  category: z.nativeEnum(WorkCategory).optional(),
  type: z.nativeEnum(TaskType).optional(),
  status: z.nativeEnum(TaskStatus).optional(),
  assigneeId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
})

tasksRouter.get('/', async (req, res) => {
  const { category, type, status, assigneeId, projectId } = listQuery.parse(req.query)
  const tasks = await prisma.task.findMany({
    where: {
      category,
      type,
      status,
      projectId,
      assigneeId: assigneeId === 'none' ? null : assigneeId,
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    select: taskCardSelect,
  })
  res.json(tasks)
})

async function loadTask(id: string) {
  const task = await prisma.task.findUnique({ where: { id }, select: taskCardSelect })
  if (!task) throw new HttpError(404, 'Task not found')
  return task
}

const idParams = z.object({ id: z.string().min(1) })

tasksRouter.get('/:id', async (req, res) => {
  res.json(await loadTask(idParams.parse(req.params).id))
})

// Everything the task page shows: the task, its documentation, links and full history.
tasksRouter.get('/:id/detail', async (req, res) => {
  const { id } = idParams.parse(req.params)
  const [task, entries, links, history] = await Promise.all([
    loadTask(id),
    prisma.taskEntry.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
    }),
    prisma.taskLink.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, label: true, url: true, kind: true, createdAt: true },
    }),
    prisma.activityLog.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { id: true, name: true } } },
    }),
  ])
  res.json({ task, entries, links, history })
})

const optionalText = z.string().trim().max(5000).nullable().optional()
const taskFields = {
  title: z.string().trim().min(2, 'Title is too short').max(200),
  description: optionalText,
  expectedOutcome: optionalText,
  category: z.nativeEnum(WorkCategory, { errorMap: () => ({ message: 'Work category is required' }) }),
  type: z.nativeEnum(TaskType).optional(),
  priority: z.nativeEnum(Priority).optional(),
  projectId: z.string().min(1).nullable().optional(),
  assigneeId: z.string().min(1).nullable().optional(),
}
const createSchema = z.object(taskFields)
const updateSchema = z.object(taskFields).partial()

tasksRouter.post('/', requireRole('MANAGER'), async (req, res) => {
  const task = await createTask(currentUser(req).id, createSchema.parse(req.body))
  res.status(201).json(await loadTask(task.id))
})

tasksRouter.patch('/:id', requireRole('MANAGER'), async (req, res) => {
  const { id } = idParams.parse(req.params)
  await updateTask(currentUser(req).id, id, updateSchema.parse(req.body))
  res.json(await loadTask(id))
})

const pickUpSchema = z.object({ start: z.boolean().default(false) })

tasksRouter.post('/:id/pickup', requireRole('DEVELOPER'), async (req, res) => {
  const { id } = idParams.parse(req.params)
  await pickUpTask(currentUser(req).id, id, pickUpSchema.parse(req.body ?? {}).start)
  res.json(await loadTask(id))
})

tasksRouter.post('/:id/release', requireRole('DEVELOPER'), async (req, res) => {
  const { id } = idParams.parse(req.params)
  await releaseTask(currentUser(req).id, id)
  res.json(await loadTask(id))
})

const statusSchema = z.object({ status: z.nativeEnum(TaskStatus) })

tasksRouter.post('/:id/status', async (req, res) => {
  const { id } = idParams.parse(req.params)
  await changeTaskStatus(currentUser(req), id, statusSchema.parse(req.body).status)
  res.json(await loadTask(id))
})
