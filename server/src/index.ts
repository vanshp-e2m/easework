import 'dotenv/config'
import { createServer } from 'node:http'
import express from 'express'
import { attachRealtime } from './realtime'
import { requireAuth } from './auth'
import { errorHandler } from './lib/http'
import { activityBus } from './activity'
import { authRouter } from './routes/auth'
import { meRouter } from './routes/me'
import { tasksRouter } from './routes/tasks'
import { docsRouter } from './routes/docs'
import { sheetRouter } from './routes/sheet'
import { activityRouter, projectsRouter, teamRouter } from './routes/team'

const app = express()
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})
app.use('/api/auth', authRouter)

app.use('/api', requireAuth)
app.use('/api/me', meRouter)
app.use('/api/team', teamRouter)
app.use('/api/tasks', tasksRouter)
app.use('/api', docsRouter)
app.use('/api/sheet', sheetRouter)
app.use('/api/projects', projectsRouter)
app.use('/api/activity', activityRouter)

app.use(errorHandler)

activityBus.on('activity', (entry) => console.log(`[activity] ${entry.summary}`))

const server = createServer(app)
attachRealtime(server)

// Not 4000: LocalWP (common on WordPress teams) listens there.
const port = Number(process.env.PORT ?? 4100)
server.listen(port, () => console.log(`API listening on http://localhost:${port}`))
