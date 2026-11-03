import { Router } from 'express'
import { z } from 'zod'
import { EntryKind, LinkKind } from '@prisma/client'
import { currentUser } from '../auth'
import { addEntry, addLink, deleteEntry, deleteLink, updateEntry } from '../services/docs'

// Mounted at /api: task-scoped creates live under /tasks/:id, edits under /entries and /links.
export const docsRouter = Router()

const idParams = z.object({ id: z.string().min(1) })
const entryBody = z.string().trim().min(1, 'Write something first').max(10_000)

docsRouter.post('/tasks/:id/entries', async (req, res) => {
  const { id } = idParams.parse(req.params)
  const { kind, body } = z.object({ kind: z.nativeEnum(EntryKind), body: entryBody }).parse(req.body)
  res.status(201).json(await addEntry(currentUser(req), id, kind, body))
})

docsRouter.patch('/entries/:id', async (req, res) => {
  const { id } = idParams.parse(req.params)
  const { body } = z.object({ body: entryBody }).parse(req.body)
  res.json(await updateEntry(currentUser(req), id, body))
})

docsRouter.delete('/entries/:id', async (req, res) => {
  await deleteEntry(currentUser(req), idParams.parse(req.params).id)
  res.status(204).end()
})

const linkSchema = z.object({
  label: z.string().trim().min(1, 'Give the link a name').max(200),
  // http(s) only, so a stored link can never become a javascript: URL in the browser.
  url: z
    .string()
    .trim()
    .refine((u) => {
      try {
        return ['http:', 'https:'].includes(new URL(u).protocol)
      } catch {
        return false
      }
    }, 'Enter a full web link starting with https://'),
  kind: z.nativeEnum(LinkKind).default('SUPPORTING'),
})

docsRouter.post('/tasks/:id/links', async (req, res) => {
  const { id } = idParams.parse(req.params)
  res.status(201).json(await addLink(currentUser(req), id, linkSchema.parse(req.body)))
})

docsRouter.delete('/links/:id', async (req, res) => {
  await deleteLink(currentUser(req), idParams.parse(req.params).id)
  res.status(204).end()
})
