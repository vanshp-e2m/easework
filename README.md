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
| maya.manager@e2m.solutions | Manager | — |
| aarav.shah@e2m.solutions | Developer | Available, has a WordPress task assigned |
| priya.mehta@e2m.solutions | Developer | Occupied – PM support |
| rohan.desai@e2m.solutions | Developer | Occupied – R&D prototype (owner; Sara is a collaborator) |
| sara.khan@e2m.solutions | Developer | Available, has a Blocked task, collaborator on Rohan's prototype |

Other useful commands:

- `npm run -w server db:studio` – browse the database in Prisma Studio
- `npm run db:setup` – first-time setup: tables + demo data (refuses if the database already has data)
- `npm run db:reset-demo` – wipe everything and reload the demo data (takes a backup first)

## Project layout

For how the app works end to end (request flow, status and task workflows, and what every
file does), see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

```
server/
  prisma/schema.prisma      data model (users, projects, tasks, entries, links, activity log)
  prisma/seed.ts            demo data
  src/domain.ts             classification rules (research ⇒ R&D Innovation)
  src/services/             business logic – every state change goes through here
  src/activity.ts           activity log + event bus (feeds real-time and Slack)
  src/realtime.ts           Socket.IO: pushes every activity entry to signed-in browsers
  src/slack.ts              posts availability and pick-ups to a Slack channel
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
- [x] **Time tracking** – Away status, "Done for today", automatic end of day, work sessions, hours per task / day / week
- [x] **Shared tasks** – several developers on one task (owner + collaborators), each with their own tracked time
- [x] **Visibility** – developers see only their own, shared and unassigned tasks; managers see everything
- [x] **File uploads** – attach documents from your computer (up to 25 MB), alongside web links
- [x] **Claude seats** – every developer must enter the Claude seat they use; managers see who is on which seat
- [x] **Step 7** – Slack notifications: a message when a developer becomes Available or picks up a task

## Shared tasks

A task has one **owner** (the assignee: whoever picked it up or was assigned it).
Other developers can **Join** it as collaborators from the Research page or the task page,
or a manager can pick the owner and collaborators together when creating or editing a task.
Owner and collaborators can all start it, move it on the board and document it.

- Every person's time is tracked in their own work sessions; the task page and the
  tracking sheet show the total and a per-person breakdown.
- **Stop for now** takes only you off the task; it stays In Progress while others work on it.
- **Completed** or **Blocked** (or any board move) applies to the task, so everyone on it is freed.
- **Leave task** (collaborator) or **Hand over** (owner: the first collaborator becomes owner).
- The **owner and managers** can add or remove collaborators from the task page's People
  section; collaborators can only leave themselves.
- Picking up an unowned task is still race-safe: one owner wins, the other is told to join instead.

## Documents and uploads

On a task page, **Links & documents** takes either a web link or a file from your
computer (click *Choose file* or drop it on the form). Tick *Final report* to show it
in the task's Results and on the tracking sheet.

- Files are stored in `server/uploads/` (or `UPLOAD_DIR`), **not in the database**, so
  back that folder up along with the Docker volume. Max size: `MAX_UPLOAD_MB` (25 MB).
- Only people who can see the task can download its files; downloads need a sign-in.
- Programs and scripts (.exe, .bat, .ps1, .js, …) are refused. Everything is served as a
  download, and only PDFs, images and plain text open in a browser tab.

## Claude seats

Every developer must enter the Claude seat they work on. Until they do, a warning banner
shows on every page, and the question pops up once per sign-in. They can change it any
time from **My Status**. `14`, `seat 14` and `claude-seat-14` all mean the same seat.

Managers see the **Claude seats** panel on the Team Dashboard: each seat and who uses it,
who hasn't entered one yet, and any seat entered by more than one person.

## Backups

`npm run db:up` also starts **ease-work-backup**, which backs up the database **and** the
uploaded files every 6 hours (and once when it starts), keeping the newest 28 (7 days).
Backups land in `backups/` as `db-<time>.dump` + `uploads-<time>.tar.gz`.

```bash
npm run backup                          # back up right now
npm run restore                         # list backups
npm run restore -- 20261105-180000      # show what a restore would do
npm run restore -- 20261105-180000 --yes   # restore (stop npm run dev first)
```

- A restore takes a backup of the current data first, so it can be undone.
- The demo seed refuses to run on a database that has data, and `db:reset-demo` /
  `db:reset` back up before wiping.
- Removing a document or a documentation entry is recorded in the task history.
- `backups/` is on the same disk as everything else. To survive a disk failure or a lost
  laptop, point it at a synced folder, e.g. set `BACKUP_DIR=C:/Users/<you>/OneDrive/ease-work-backups`
  in a root `.env` file and run `npm run db:up` again.

## Slack

EaseWork posts to one Slack channel when a developer becomes **Available** (including
after leaving or handing over a task) and when they **pick up** a task. The text matches
Recent activity, people are @-mentioned when their EaseWork email matches their Slack
account, and each message links to the task.

1. At api.slack.com/apps, create an app **from a manifest** with the bot scopes
   `chat:write`, `chat:write.public`, `users:read`, `users:read.email` and token rotation off.
2. **Install App** → install to the workspace → copy the **Bot User OAuth Token** (`xoxb-…`).
3. In Slack, copy the channel's **Channel ID**; for a private channel, `/invite @EaseWork`.
4. Set them in `server/.env` and restart the API:
   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_CHANNEL_ID=C...
   APP_URL="http://localhost:5173"   # where "Open task" links point
   ```

With either value empty, Slack is off. If Slack is unreachable, the error is logged and
the app carries on.

## Working hours

Set in `server/.env` (defaults shown). Developers still Available or Occupied after
`WORK_END` are set to Away automatically, so time isn't counted overnight; someone who
starts after hours gets `OVERTIME_HOURS` before being set Away.

```
WORK_TIMEZONE="Asia/Kolkata"
WORK_DAYS="Mon,Tue,Wed,Thu,Fri"
WORK_START="10:00"
WORK_END="19:00"
OVERTIME_HOURS=2
```

Restart the API after changing them.
