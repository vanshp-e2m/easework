import { Router } from 'express'
import { z } from 'zod'
import { Priority, TaskStatus, TaskType, WorkCategory } from '@prisma/client'
import { prisma } from '../prisma'
import { currentUser, requireRole, type AuthUser } from '../auth'
import { HttpError } from '../lib/http'
import { taskCardSelect, visibleTasks } from '../domain'
import {
  changeTaskStatus,
  createTask,
  joinTask,
  addMember,
  pickUpTask,
  releaseTask,
  removeMember,
  updateTask,
} from '../services/tasks'

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
      AND: [visibleTasks(currentUser(req))],
      category,
      type,
      status,
      projectId,
      // A person's tasks are the ones they own plus the ones they've joined.
      ...(assigneeId === 'none'
        ? { assigneeId: null }
        : assigneeId && { OR: [{ assigneeId }, { members: { some: { userId: assigneeId } } }] }),
    },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    select: taskCardSelect,
  })
  res.json(tasks)
})

/**
 * Reads go through the viewer's visibility; responses to an action don't, since
 * the action itself (leaving, handing over) can make the task invisible to them.
 */
async function loadTask(id: string, viewer?: AuthUser) {
  const task = await prisma.task.findFirst({
    where: { id, ...(viewer && visibleTasks(viewer)) },
    select: taskCardSelect,
  })
  if (!task) throw new HttpError(404, 'Task not found')
  return task
}

const idParams = z.object({ id: z.string().min(1) })

tasksRouter.get('/:id', async (req, res) => {
  res.json(await loadTask(idParams.parse(req.params).id, currentUser(req)))
})

// Everything the task page shows: the task, its documentation, links and full history.
tasksRouter.get('/:id/detail', async (req, res) => {
  const { id } = idParams.parse(req.params)
  const [task, entries, links, history, sessions] = await Promise.all([
    loadTask(id, currentUser(req)),
    prisma.taskEntry.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, kind: true, body: true, createdAt: true, author: { select: { id: true, name: true } } },
    }),
    prisma.taskLink.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        label: true,
        url: true,
        fileName: true,
        fileSize: true,
        mimeType: true,
        kind: true,
        createdAt: true,
      },
    }),
    prisma.activityLog.findMany({
      where: { taskId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, action: true, summary: true, createdAt: true, actor: { select: { id: true, name: true } } },
    }),
    prisma.workSession.findMany({
      where: { taskId: id },
      orderBy: { startedAt: 'desc' },
      select: { id: true, startedAt: true, endedAt: true, endReason: true, user: { select: { id: true, name: true } } },
    }),
  ])
  res.json({ task, entries, links, history, sessions })
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
  memberIds: z.array(z.string().min(1)).max(20).optional(),
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

// Work on a task someone else owns, as a collaborator.
tasksRouter.post('/:id/join', requireRole('DEVELOPER'), async (req, res) => {
  const { id } = idParams.parse(req.params)
  await joinTask(currentUser(req).id, id, pickUpSchema.parse(req.body ?? {}).start)
  res.json(await loadTask(id))
})

// The owner or a manager adds a collaborator.
tasksRouter.post('/:id/members', async (req, res) => {
  const { id } = idParams.parse(req.params)
  const { userId } = z.object({ userId: z.string().min(1, 'Choose a developer') }).parse(req.body)
  await addMember(currentUser(req), id, userId)
  res.json(await loadTask(id))
})

// A collaborator leaving (their own id), or the owner or a manager taking someone off.
const memberParams = z.object({ id: z.string().min(1), userId: z.string().min(1) })

tasksRouter.delete('/:id/members/:userId', async (req, res) => {
  const { id, userId } = memberParams.parse(req.params)
  await removeMember(currentUser(req), id, userId)
  res.json(await loadTask(id))
})

const statusSchema = z.object({ status: z.nativeEnum(TaskStatus) })

tasksRouter.post('/:id/status', async (req, res) => {
  const { id } = idParams.parse(req.params)
  await changeTaskStatus(currentUser(req), id, statusSchema.parse(req.body).status)
  res.json(await loadTask(id))
})
