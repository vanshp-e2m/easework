import type { EntryKind, LinkKind, Role, Task } from '@prisma/client'
import { prisma } from '../prisma'
import { HttpError } from '../lib/http'
import { logActivity, publish } from '../activity'
import { isOnTask, visibleTasks } from '../domain'
import { removeStoredFile } from '../uploads'

type Actor = { id: string; role: Role }

export const ENTRY_LABEL: Record<EntryKind, string> = {
  PROGRESS: 'progress update',
  FINDING: 'finding',
  CHALLENGE: 'challenge',
  SOLUTION: 'solution',
  OUTCOME: 'outcome',
}

type TaskWithMembers = Task & { members: { userId: string }[] }

// Documentation belongs to whoever is doing the work (owner and collaborators), plus management.
function assertCanDocument(actor: Actor, task: TaskWithMembers) {
  if (actor.role !== 'MANAGER' && !isOnTask(task, actor.id)) {
    throw new HttpError(403, 'Only people on this task or a manager can document it')
  }
}

async function findTask(id: string) {
  const task = await prisma.task.findUnique({ where: { id }, include: { members: true } })
  if (!task) throw new HttpError(404, 'Task not found')
  return task
}

export async function addEntry(actor: Actor, taskId: string, kind: EntryKind, body: string) {
  const task = await findTask(taskId)
  assertCanDocument(actor, task)
  const { entry, log } = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id } })
    const entry = await tx.taskEntry.create({ data: { taskId, authorId: actor.id, kind, body } })
    const log = await logActivity(tx, {
      actorId: actor.id,
      taskId,
      action: 'ENTRY_ADDED',
      summary: `${me.name} documented ${/^[aeiou]/.test(ENTRY_LABEL[kind]) ? 'an' : 'a'} ${ENTRY_LABEL[kind]} on "${task.title}"`,
      details: { entryId: entry.id, kind },
    })
    return { entry, log }
  })
  publish([log])
  return entry
}

async function findEntry(id: string) {
  const entry = await prisma.taskEntry.findUnique({ where: { id } })
  if (!entry) throw new HttpError(404, 'Entry not found')
  return entry
}

export async function updateEntry(actor: Actor, entryId: string, body: string) {
  const entry = await findEntry(entryId)
  if (entry.authorId !== actor.id) throw new HttpError(403, 'You can only edit your own entries')
  return prisma.taskEntry.update({ where: { id: entryId }, data: { body } })
}

export async function deleteEntry(actor: Actor, entryId: string) {
  const entry = await findEntry(entryId)
  if (entry.authorId !== actor.id && actor.role !== 'MANAGER') {
    throw new HttpError(403, 'You can only delete your own entries')
  }
  // Removals are logged like additions, so the history shows who removed what.
  const log = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id } })
    const task = await tx.task.findUniqueOrThrow({ where: { id: entry.taskId } })
    await tx.taskEntry.delete({ where: { id: entryId } })
    return logActivity(tx, {
      actorId: actor.id,
      taskId: entry.taskId,
      action: 'ENTRY_DELETED',
      summary: `${me.name} deleted ${/^[aeiou]/.test(ENTRY_LABEL[entry.kind]) ? 'an' : 'a'} ${ENTRY_LABEL[entry.kind]} on "${task.title}"`,
      details: { kind: entry.kind, body: entry.body.slice(0, 500) },
    })
  })
  publish([log])
}

export async function addLink(actor: Actor, taskId: string, input: { label: string; url: string; kind: LinkKind }) {
  const task = await findTask(taskId)
  assertCanDocument(actor, task)
  const { link, log } = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id } })
    const link = await tx.taskLink.create({ data: { taskId, ...input } })
    const what = input.kind === 'FINAL_REPORT' ? `the final report "${input.label}"` : `"${input.label}"`
    const log = await logActivity(tx, {
      actorId: actor.id,
      taskId,
      action: 'LINK_ADDED',
      summary: `${me.name} attached ${what} to "${task.title}"`,
      details: { linkId: link.id, kind: input.kind, url: input.url },
    })
    return { link, log }
  })
  publish([log])
  return link
}

export async function deleteLink(actor: Actor, linkId: string) {
  const link = await prisma.taskLink.findUnique({ where: { id: linkId }, include: { task: { include: { members: true } } } })
  if (!link) throw new HttpError(404, 'Link not found')
  assertCanDocument(actor, link.task)
  const log = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id } })
    await tx.taskLink.delete({ where: { id: linkId } })
    const what = link.storageKey ? `the file "${link.label}"` : `the link "${link.label}"`
    return logActivity(tx, {
      actorId: actor.id,
      taskId: link.taskId,
      action: 'LINK_DELETED',
      summary: `${me.name} removed ${what} from "${link.task.title}"`,
      details: { kind: link.kind, url: link.url, fileName: link.fileName },
    })
  })
  publish([log])
  if (link.storageKey) await removeStoredFile(link.storageKey)
}

/** Checked before an upload is accepted, so nobody else's bytes reach the disk. */
export async function assertCanAttach(actor: Actor, taskId: string) {
  assertCanDocument(actor, await findTask(taskId))
}

export interface UploadedFile {
  storageKey: string
  fileName: string
  fileSize: number
  mimeType: string
}

export async function addFile(
  actor: Actor,
  taskId: string,
  input: { label: string; kind: LinkKind; file: UploadedFile },
) {
  const task = await findTask(taskId)
  assertCanDocument(actor, task)
  const { link, log } = await prisma.$transaction(async (tx) => {
    const me = await tx.user.findUniqueOrThrow({ where: { id: actor.id } })
    const link = await tx.taskLink.create({ data: { taskId, label: input.label, kind: input.kind, ...input.file } })
    const what = input.kind === 'FINAL_REPORT' ? `the final report "${input.label}"` : `the file "${input.label}"`
    const log = await logActivity(tx, {
      actorId: actor.id,
      taskId,
      action: 'LINK_ADDED',
      summary: `${me.name} attached ${what} to "${task.title}"`,
      details: { linkId: link.id, kind: input.kind, fileName: input.file.fileName },
    })
    return { link, log }
  })
  publish([log])
  return link
}

/** An uploaded file, if the viewer can see its task. */
export async function findDownload(viewer: Actor, linkId: string) {
  const link = await prisma.taskLink.findFirst({ where: { id: linkId, task: visibleTasks(viewer) } })
  if (!link?.storageKey) throw new HttpError(404, 'File not found')
  return { storageKey: link.storageKey, fileName: link.fileName ?? 'download' }
}
