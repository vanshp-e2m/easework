import { Router } from 'express'
import { z } from 'zod'
import { Priority, TaskType, WorkCategory } from '@prisma/client'
import { prisma } from '../prisma'
import { currentUser, requireRole } from '../auth'
import { HttpError } from '../lib/http'
import { taskSummarySelect } from '../domain'
import { setAvailable, setOccupied } from '../services/availability'

export const meRouter = Router()

const meSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  availability: true,
  statusChangedAt: true,
  currentTask: { select: taskSummarySelect },
} as const

async function loadMe(id: string) {
  const me = await prisma.user.findUnique({ where: { id }, select: meSelect })
  // A valid token for a deleted account (e.g. after re-seeding): force a fresh sign-in.
  if (!me) throw new HttpError(401, 'Your account no longer exists, please sign in again')
  return me
}

meRouter.get('/', async (req, res) => {
  res.json(await loadMe(currentUser(req).id))
})

// Open tasks assigned to me — the list a developer picks from when going Occupied.
meRouter.get('/tasks', async (req, res) => {
  const tasks = await prisma.task.findMany({
    where: { assigneeId: currentUser(req).id, status: { not: 'COMPLETED' } },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    select: taskSummarySelect,
  })
  res.json(tasks)
})

const pickTaskSchema = z.object({ taskId: z.string().min(1) })
const newTaskSchema = z.object({
  newTask: z.object({
    title: z.string().trim().min(2, 'Title is too short').max(200),
    category: z.nativeEnum(WorkCategory, { errorMap: () => ({ message: 'Work category is required' }) }),
    type: z.nativeEnum(TaskType).optional(),
    projectId: z.string().min(1).optional(),
    priority: z.nativeEnum(Priority).optional(),
  }),
})

meRouter.post('/occupied', requireRole('DEVELOPER'), async (req, res) => {
  const me = currentUser(req)
  const body = req.body ?? {}
  // Validate against one shape at a time so errors name the actual missing field.
  const input = 'taskId' in body ? pickTaskSchema.parse(body) : newTaskSchema.parse(body)
  await setOccupied(me.id, input)
  res.json(await loadMe(me.id))
})

const availableSchema = z.object({
  currentTaskOutcome: z.enum(['COMPLETED', 'NOT_STARTED', 'BLOCKED']).optional(),
})

meRouter.post('/available', requireRole('DEVELOPER'), async (req, res) => {
  const me = currentUser(req)
  await setAvailable(me.id, availableSchema.parse(req.body ?? {}).currentTaskOutcome)
  res.json(await loadMe(me.id))
})
