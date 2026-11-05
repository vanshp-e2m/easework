// Team working hours, from server/.env. "19:00" always means 19:00 in WORK_TIMEZONE,
// whatever time zone the server itself runs in.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function minutesOf(value: string | undefined, fallback: string) {
  const [h, m] = (value || fallback).split(':').map(Number)
  if (!Number.isInteger(h) || h < 0 || h > 23 || !(m >= 0 && m < 60)) {
    throw new Error(`Invalid time "${value}" in work hours config; use HH:MM`)
  }
  return h * 60 + m
}

const timeZone = process.env.WORK_TIMEZONE || 'Asia/Kolkata'
new Intl.DateTimeFormat('en-US', { timeZone }) // throws on an unknown zone, so a typo fails at startup

export const workHours = {
  timeZone,
  days: (process.env.WORK_DAYS || 'Mon,Tue,Wed,Thu,Fri').split(',').map((d) => d.trim()),
  startMinutes: minutesOf(process.env.WORK_START, '10:00'),
  endMinutes: minutesOf(process.env.WORK_END, '19:00'),
  // How long someone who starts after hours stays active before being set Away.
  overtimeMs: Number(process.env.OVERTIME_HOURS || 2) * 3600_000,
}

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone,
  hourCycle: 'h23',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Wall-clock fields of an instant in the team's time zone. */
function localParts(date: Date) {
  const p = Object.fromEntries(partsFormat.formatToParts(date).map((x) => [x.type, x.value]))
  return {
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    second: +p.second,
    weekday: p.weekday,
  }
}

function offsetMs(date: Date) {
  const p = localParts(date)
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000
}

/** The instant at which the team's clock shows `minutes` past midnight on that local date. */
function zoned(year: number, month: number, day: number, minutes: number) {
  const guess = Date.UTC(year, month - 1, day, 0, minutes)
  let t = guess - offsetMs(new Date(guess))
  const corrected = guess - offsetMs(new Date(t)) // second pass handles DST edges
  if (corrected !== t) t = corrected
  return new Date(t)
}

function localDate(date: Date, plusDays = 0) {
  const p = localParts(date)
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + plusDays))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }
}

export function isWorkDay(date: Date) {
  return workHours.days.includes(localParts(date).weekday)
}

/** Local midnight of the day containing `date`. */
export function dayStart(date: Date) {
  const { year, month, day } = localDate(date)
  return zoned(year, month, day, 0)
}

/** Local Monday 00:00 of the week containing `date`. */
export function weekStart(date: Date) {
  const back = (DAY_NAMES.indexOf(localParts(date).weekday) + 6) % 7
  const { year, month, day } = localDate(date, -back)
  return zoned(year, month, day, 0)
}

/**
 * When someone who became active at `since` is automatically set Away: the end
 * of that workday, or, if they started after hours, a fixed overtime allowance later.
 */
export function autoAwayAt(since: Date) {
  if (isWorkDay(since)) {
    const { year, month, day } = localDate(since)
    const end = zoned(year, month, day, workHours.endMinutes)
    if (since < end) return end
  }
  return new Date(since.getTime() + workHours.overtimeMs)
}

/** "19:00" on the team's clock. */
export function clockTime(date: Date) {
  const p = localParts(date)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

/** "Mon–Fri · 10:00–19:00 · Asia/Kolkata" */
export function describeWorkHours() {
  const d = workHours.days
  const days = d.join(',') === 'Mon,Tue,Wed,Thu,Fri' ? 'Mon–Fri' : d.join(', ')
  return `${days} · ${hhmm(workHours.startMinutes)}–${hhmm(workHours.endMinutes)} · ${workHours.timeZone}`
}
