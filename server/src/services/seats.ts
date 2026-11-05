import { prisma } from '../prisma'

/**
 * One spelling per seat, so the same seat typed differently still shows up as
 * shared: "14", "seat 14", "#14", "Claude-Seat-14" → "claude-seat-14".
 * Anything else is kept as typed.
 */
export function normalizeSeat(raw: string) {
  const seat = raw.trim().replace(/\s+/g, ' ')
  const number = seat.match(/^(?:claude[\s-]*)?(?:seat[\s-]*)?#?\s*0*(\d{1,4})$/i)?.[1]
  return number ? `claude-seat-${number}` : seat
}

/** Records the developer's Claude seat and says who else has entered the same one. */
export async function setClaudeSeat(userId: string, raw: string) {
  const seat = normalizeSeat(raw)
  await prisma.user.update({ where: { id: userId }, data: { claudeSeat: seat, claudeSeatSetAt: new Date() } })
  const others = await prisma.user.findMany({
    where: { id: { not: userId }, role: 'DEVELOPER', claudeSeat: { equals: seat, mode: 'insensitive' } },
    orderBy: { name: 'asc' },
    select: { name: true },
  })
  return { seat, sharedWith: others.map((o) => o.name) }
}
