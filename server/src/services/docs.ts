import type { EntryKind, LinkKind, Role, Task } from '@prisma/client'
import { prisma } from '../prisma'
import { HttpError } from '../lib/http'
import { logActivity, publish } from '../activity'

type Actor = { id: string; role: Role }

export const ENTRY_LABEL: Record<EntryKind, string> = {
  PROGRESS: 'progress update',
  FINDING: 'finding',
  CHALLENGE: 'challenge',
  SOLUTION: 'solution',
  OUTCOME: 'outcome',
}

// Documentation belongs to whoever is doing the work, plus management.
function assertCanDocument(actor: Actor, task: Task) {
  if (actor.role !== 'MANAGER' && task.assigneeId !== actor.id) {
    throw new HttpError(403, 'Only the assignee or a manager can document this task')
  }
}

async function findTask(id: string) {
  const task = await prisma.task.findUnique({ where: { id } })
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
  await prisma.taskEntry.delete({ where: { id: entryId } })
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
  const link = await prisma.taskLink.findUnique({ where: { id: linkId }, include: { task: true } })
  if (!link) throw new HttpError(404, 'Link not found')
  assertCanDocument(actor, link.task)
  await prisma.taskLink.delete({ where: { id: linkId } })
}
