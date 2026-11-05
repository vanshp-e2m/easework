import { Router } from 'express'
import { z } from 'zod'
import { Priority, TaskType, WorkCategory } from '@prisma/client'
import { prisma } from '../prisma'
import { currentUser, requireRole } from '../auth'
import { HttpError } from '../lib/http'
import { taskSummarySelect } from '../domain'
import { setAvailable, setAway, setOccupied } from '../services/availability'
import { setClaudeSeat } from '../services/seats'

export const meRouter = Router()

const meSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  availability: true,
  statusChangedAt: true,
  claudeSeat: true,
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

// Open tasks I own or have joined — the list a developer picks from when going Occupied.
meRouter.get('/tasks', async (req, res) => {
  const myId = currentUser(req).id
  const tasks = await prisma.task.findMany({
    where: {
      status: { not: 'COMPLETED' },
      OR: [{ assigneeId: myId }, { members: { some: { userId: myId } } }],
    },
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

meRouter.post('/away', requireRole('DEVELOPER'), async (req, res) => {
  const me = currentUser(req)
  await setAway(me.id)
  res.json(await loadMe(me.id))
})

const seatSchema = z.object({ seat: z.string().trim().min(1, 'Enter the seat you are using').max(60) })

// The Claude seat this developer uses. `sharedWith` names anyone else who entered the same seat.
meRouter.put('/seat', requireRole('DEVELOPER'), async (req, res) => {
  const me = currentUser(req)
  const { sharedWith } = await setClaudeSeat(me.id, seatSchema.parse(req.body).seat)
  res.json({ me: await loadMe(me.id), sharedWith })
})

meRouter.post('/available', requireRole('DEVELOPER'), async (req, res) => {
  const me = currentUser(req)
  await setAvailable(me.id, availableSchema.parse(req.body ?? {}).currentTaskOutcome)
  res.json(await loadMe(me.id))
})
