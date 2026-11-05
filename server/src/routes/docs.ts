import { Router } from 'express'
import { z } from 'zod'
import { EntryKind, LinkKind } from '@prisma/client'
import { currentUser } from '../auth'
import { HttpError } from '../lib/http'
import {
  addEntry,
  addFile,
  addLink,
  assertCanAttach,
  deleteEntry,
  deleteLink,
  findDownload,
  updateEntry,
} from '../services/docs'
import { receiveFile, removeStoredFile, storedFilePath } from '../uploads'

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

const fileFields = z.object({
  label: z.string().trim().max(200).optional(),
  kind: z.nativeEnum(LinkKind).default('SUPPORTING'),
})

// Upload a document from the user's computer (multipart: `file`, optional `label` and `kind`).
docsRouter.post(
  '/tasks/:id/files',
  async (req, _res, next) => {
    await assertCanAttach(currentUser(req), idParams.parse(req.params).id)
    next()
  },
  receiveFile,
  async (req, res) => {
    const { id } = idParams.parse(req.params)
    const file = req.file
    if (!file) throw new HttpError(400, 'Choose a file to upload')
    try {
      const { label, kind } = fileFields.parse(req.body ?? {})
      const fileName = file.originalname.slice(0, 255) || 'file'
      const stored = { storageKey: file.filename, fileName, fileSize: file.size, mimeType: file.mimetype }
      res.status(201).json(await addFile(currentUser(req), id, { label: label || fileName, kind, file: stored }))
    } catch (err) {
      await removeStoredFile(file.filename)
      throw err
    }
  },
)

// Always a download (octet-stream + nosniff), so an uploaded HTML or SVG file can
// never run as a page on this site.
docsRouter.get('/links/:id/file', async (req, res) => {
  const { storageKey, fileName } = await findDownload(currentUser(req), idParams.parse(req.params).id)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.download(storedFilePath(storageKey), fileName, { headers: { 'Content-Type': 'application/octet-stream' } }, (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File not found' })
  })
})

docsRouter.delete('/links/:id', async (req, res) => {
  await deleteLink(currentUser(req), idParams.parse(req.params).id)
  res.status(204).end()
})
