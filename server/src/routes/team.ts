import { Router } from 'express'
import { z } from 'zod'
import { ProjectKind } from '@prisma/client'
import { prisma } from '../prisma'
import { requireRole } from '../auth'
import { HttpError } from '../lib/http'
import { taskSummarySelect } from '../domain'
import { overlapSeconds } from '../services/sessions'
import { dayStart, describeWorkHours, weekStart } from '../workHours'

export const teamRouter = Router()

// Central availability view: every developer, their status and what they're on,
// plus tracked hours (today per person, this week per work category).
teamRouter.get('/', async (_req, res) => {
  const now = new Date()
  const today = dayStart(now)
  const week = weekStart(now)
  const [members, sessions] = await Promise.all([
    prisma.user.findMany({
      where: { role: 'DEVELOPER' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        availability: true,
        statusChangedAt: true,
        currentTask: { select: taskSummarySelect },
      },
    }),
    prisma.workSession.findMany({
      where: { OR: [{ endedAt: null }, { endedAt: { gt: week } }] },
      select: { userId: true, startedAt: true, endedAt: true, task: { select: { category: true } } },
    }),
  ])

  const todaySeconds = new Map<string, number>()
  const weekSeconds = { DELIVERY_TEAM: 0, RND_INNOVATION: 0 }
  for (const s of sessions) {
    todaySeconds.set(s.userId, (todaySeconds.get(s.userId) ?? 0) + overlapSeconds(s, today, now))
    weekSeconds[s.task.category] += overlapSeconds(s, week, now)
  }

  const occupied = members.filter((m) => m.availability === 'OCCUPIED')
  res.json({
    members: members.map((m) => ({ ...m, todaySeconds: todaySeconds.get(m.id) ?? 0 })),
    summary: {
      total: members.length,
      available: members.filter((m) => m.availability === 'AVAILABLE').length,
      away: members.filter((m) => m.availability === 'AWAY').length,
      occupiedDelivery: occupied.filter((m) => m.currentTask?.category === 'DELIVERY_TEAM').length,
      occupiedRnd: occupied.filter((m) => m.currentTask?.category === 'RND_INNOVATION').length,
      weekSeconds,
    },
    workHours: describeWorkHours(),
  })
})

// Manager only: which Claude seat each developer uses.
teamRouter.get('/seats', requireRole('MANAGER'), async (_req, res) => {
  res.json(
    await prisma.user.findMany({
      where: { role: 'DEVELOPER' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, availability: true, claudeSeat: true, claudeSeatSetAt: true },
    }),
  )
})

export const projectsRouter = Router()

const projectSelect = { id: true, name: true, kind: true, description: true } as const

projectsRouter.get('/', async (_req, res) => {
  res.json(await prisma.project.findMany({ orderBy: { name: 'asc' }, select: projectSelect }))
})

const projectSchema = z.object({
  name: z.string().trim().min(2, 'Name is too short').max(120),
  kind: z.nativeEnum(ProjectKind),
  description: z.string().trim().max(2000).optional(),
})

projectsRouter.post('/', requireRole('MANAGER'), async (req, res) => {
  const input = projectSchema.parse(req.body)
  const existing = await prisma.project.findFirst({ where: { name: { equals: input.name, mode: 'insensitive' } } })
  if (existing) throw new HttpError(409, `A project called "${existing.name}" already exists`)
  res.status(201).json(
    await prisma.project.create({
      data: { ...input, description: input.description || null },
      select: projectSelect,
    }),
  )
})

export const activityRouter = Router()

activityRouter.get('/', async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) }).parse(req.query)
  res.json(
    await prisma.activityLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        action: true,
        summary: true,
        createdAt: true,
        actor: { select: { id: true, name: true } },
        task: { select: { id: true, title: true, category: true } },
      },
    }),
  )
})
