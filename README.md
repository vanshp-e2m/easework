# EaseWork

Developer availability, task tracking and research management. React + Node + PostgreSQL.

## Run it locally

Requires Node 20+.

```bash
npm install

# 1. Start PostgreSQL (pick one, keep it running in its own terminal)
npm run db:local        # embedded PostgreSQL from npm, no Docker needed
# or
npm run db:up           # Docker (postgres:16-alpine)

# 2. Create tables + demo data (first time, or to reset everything)
npm run db:setup

# 3. Start API (http://localhost:4100) and web app (http://localhost:5173)
npm run dev
```

Open http://localhost:5173. All demo accounts use password `password123`:

| Email | Role | Starting state |
|---|---|---|
| manager@ease.work | Manager | — |
| aarav@ease.work | Developer | Available, has a WordPress task assigned |
| priya@ease.work | Developer | Occupied – PM support |
| rohan@ease.work | Developer | Occupied – R&D prototype |
| sara@ease.work | Developer | Available, has a Blocked task |

Other useful commands:

- `npm run -w server db:studio` – browse the database in Prisma Studio
- `npm run db:setup` – wipe and re-seed demo data

## Project layout

```
server/
  prisma/schema.prisma      data model (users, projects, tasks, entries, links, activity log)
  prisma/seed.ts            demo data
  src/domain.ts             classification rules (research ⇒ R&D Innovation)
  src/services/             business logic – every state change goes through here
  src/activity.ts           activity log + event bus (feeds real-time, and Slack next)
  src/realtime.ts           Socket.IO: pushes every activity entry to signed-in browsers
  src/routes/               HTTP endpoints
client/
  src/pages/                Login, My Status, Board (Kanban), Research, Task page, Sheet, Team Dashboard
  src/components/           dialogs, badges, layout
  src/lib/                  API client, React Query hooks, labels
```

## Build progress

- [x] **Step 1** – Foundation, login, developer availability, team dashboard
- [x] **Step 2** – Task management (create/edit/assign) + Kanban board
- [x] **Step 3** – Research task pool (pick up / release, race-safe assignment)
- [x] **Step 4** – Task page: documentation log, links & final reports, history
- [x] **Step 5** – Tracking sheet (per-project tabs, sort/filter, CSV export) + project creation
- [x] **Step 6** – Real-time updates (Socket.IO): instant refresh, notices, Live indicator, reconnect catch-up
- [ ] Step 7 – Slack app
