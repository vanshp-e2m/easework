import type { ActivityLog } from '@prisma/client'
import { prisma } from './prisma'
import { activityBus } from './activity'

// Posts availability and pick-up updates to one Slack channel. Off unless both
// SLACK_BOT_TOKEN and SLACK_CHANNEL_ID are set; Slack being down never affects the app.

const ICON: Record<string, string> = {
  STATUS_AVAILABLE: ':large_green_circle:',
  TASK_LEFT: ':large_green_circle:',
  TASK_RELEASED: ':large_green_circle:',
  TASK_PICKED_UP: ':large_blue_circle:',
}

/** Leaving or releasing a task only matters here when it made someone Available. */
function shouldPost(entry: ActivityLog) {
  if (entry.action === 'TASK_LEFT' || entry.action === 'TASK_RELEASED') return /\bnow Available\b/.test(entry.summary)
  return entry.action in ICON
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function slackApi(method: string, token: string, params: Record<string, string>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: new URLSearchParams(params),
  })
  return (await res.json()) as { ok: boolean; error?: string; user?: { id: string } }
}

// Emails with no Slack account, so we don't ask Slack again until the server restarts.
const notOnSlack = new Set<string>()

/** Slack user id for an EaseWork user, found by work email and remembered in User.slackUserId. */
async function slackIdFor(token: string, user: { id: string; email: string; slackUserId: string | null }) {
  if (user.slackUserId) return user.slackUserId
  if (notOnSlack.has(user.email)) return null
  const found = await slackApi('users.lookupByEmail', token, { email: user.email })
  if (!found.ok || !found.user) {
    notOnSlack.add(user.email)
    return null
  }
  await prisma.user.update({ where: { id: user.id }, data: { slackUserId: found.user.id } })
  return found.user.id
}

/** The activity summary, with everyone named in it @-mentioned when they're on Slack. */
async function messageFor(token: string, entry: ActivityLog) {
  let text = escape(entry.summary)
  const users = await prisma.user.findMany({ select: { id: true, name: true, email: true, slackUserId: true } })
  // Longest names first, so "Sara Khan" is replaced before a shorter name inside it.
  for (const user of users.sort((a, b) => b.name.length - a.name.length)) {
    const name = escape(user.name)
    if (!text.includes(name)) continue
    const slackId = await slackIdFor(token, user)
    if (slackId) text = text.split(name).join(`<@${slackId}>`)
  }
  const appUrl = process.env.APP_URL || 'http://localhost:5173'
  const link = entry.taskId ? `  ·  <${appUrl}/tasks/${entry.taskId}|Open task>` : ''
  return `${ICON[entry.action]} ${text}${link}`
}

export function startSlack() {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.SLACK_CHANNEL_ID
  if (!token || !channel) {
    console.log('Slack: off (set SLACK_BOT_TOKEN and SLACK_CHANNEL_ID to turn on)')
    return
  }
  console.log('Slack: posting availability and pick-ups')

  // One at a time, so messages arrive in the order things happened.
  let queue = Promise.resolve()
  activityBus.on('activity', (entry: ActivityLog) => {
    if (!shouldPost(entry)) return
    queue = queue
      .then(async () => {
        const text = await messageFor(token, entry)
        const sent = await slackApi('chat.postMessage', token, { channel, text, unfurl_links: 'false' })
        if (!sent.ok) console.error(`[slack] ${sent.error}`)
      })
      .catch((err) => console.error('[slack]', err))
  })
}
