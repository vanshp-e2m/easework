import { Router } from 'express'
import { z } from 'zod'
import { ProjectKind } from '@prisma/client'
import { prisma } from '../prisma'
import { requireRole } from '../auth'
import { HttpError } from '../lib/http'
import { taskSummarySelect } from '../domain'

export const teamRouter = Router()

// Central availability view: every developer, their status and what they're on.
teamRouter.get('/', async (_req, res) => {
  const members = await prisma.user.findMany({
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
  })
  const occupied = members.filter((m) => m.availability === 'OCCUPIED')
  res.json({
    members,
    summary: {
      total: members.length,
      available: members.length - occupied.length,
      occupiedDelivery: occupied.filter((m) => m.currentTask?.category === 'DELIVERY_TEAM').length,
      occupiedRnd: occupied.filter((m) => m.currentTask?.category === 'RND_INNOVATION').length,
    },
  })
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
