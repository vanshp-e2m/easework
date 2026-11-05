import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

const PASSWORD = 'password123'

async function main() {
  // The seed wipes everything. Never do that to a database people are using,
  // unless asked explicitly (npm run db:reset-demo, which backs up first).
  const force = process.argv.includes('--force')
  if (!force && (await prisma.user.count()) > 0) {
    console.error(
      'This database already has data, so the demo seed was NOT run (it would delete everything).\n' +
        'To wipe it and load the demo data, run: npm run db:reset-demo (takes a backup first).',
    )
    process.exitCode = 1
    return
  }

  await prisma.workSession.deleteMany()
  await prisma.activityLog.deleteMany()
  await prisma.taskEntry.deleteMany()
  await prisma.taskLink.deleteMany()
  await prisma.user.updateMany({ data: { currentTaskId: null } })
  await prisma.task.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()

  const passwordHash = await bcrypt.hash(PASSWORD, 10)

  const manager = await prisma.user.create({
    data: { name: 'Maya Manager', email: 'maya.manager@e2m.solutions', passwordHash, role: 'MANAGER' },
  })
  const [devA, devB, devC, devD] = await Promise.all(
    [
      ['Aarav Shah', 'aarav.shah@e2m.solutions'],
      ['Priya Mehta', 'priya.mehta@e2m.solutions'],
      ['Rohan Desai', 'rohan.desai@e2m.solutions'],
      ['Sara Khan', 'sara.khan@e2m.solutions'],
    ].map(([name, email]) => prisma.user.create({ data: { name, email, passwordHash } })),
  )

  const wpClient = await prisma.project.create({
    data: { name: 'Acme Corp – WordPress site', kind: 'DELIVERY', description: 'Client website build and maintenance' },
  })
  const pmSupport = await prisma.project.create({
    data: { name: 'PM Support', kind: 'DELIVERY', description: 'Supporting project managers with delivery activities' },
  })
  const aiResearch = await prisma.project.create({
    data: { name: 'AI Tools Research', kind: 'RESEARCH', description: 'Evaluating AI tools, frameworks and automation' },
  })

  // Aarav: has a WordPress delivery task assigned but has not started it (the example workflow).
  await prisma.task.create({
    data: {
      title: 'Fix WooCommerce checkout bug',
      description: 'Checkout page throws an error when a coupon is applied.',
      category: 'DELIVERY_TEAM',
      type: 'DELIVERY',
      priority: 'HIGH',
      projectId: wpClient.id,
      assigneeId: devA.id,
      createdById: manager.id,
    },
  })

  // Priya: currently occupied supporting a PM.
  const now = new Date()
  const priyaTask = await prisma.task.create({
    data: {
      title: 'Prepare sprint report for Acme',
      category: 'DELIVERY_TEAM',
      type: 'PM_SUPPORT',
      status: 'IN_PROGRESS',
      startedAt: new Date(now.getTime() - 45 * 60_000),
      projectId: pmSupport.id,
      assigneeId: devB.id,
      createdById: manager.id,
    },
  })
  await prisma.user.update({
    where: { id: devB.id },
    data: { availability: 'OCCUPIED', currentTaskId: priyaTask.id, statusChangedAt: priyaTask.startedAt! },
  })

  // Rohan: currently occupied on R&D.
  const rohanTask = await prisma.task.create({
    data: {
      title: 'Prototype AI code-review bot',
      expectedOutcome: 'Working POC that comments on pull requests.',
      category: 'RND_INNOVATION',
      type: 'RESEARCH',
      status: 'IN_PROGRESS',
      startedAt: new Date(now.getTime() - 2 * 3600_000),
      projectId: aiResearch.id,
      assigneeId: devC.id,
      createdById: manager.id,
    },
  })
  await prisma.user.update({
    where: { id: devC.id },
    data: { availability: 'OCCUPIED', currentTaskId: rohanTask.id, statusChangedAt: rohanTask.startedAt! },
  })

  // Unassigned research tasks — the research pool used in a later step.
  await prisma.task.createMany({
    data: [
      {
        title: 'Evaluate AI test-generation tools',
        description: 'Compare 3–4 tools that generate unit tests from code.',
        expectedOutcome: 'Comparison doc with a recommendation.',
        category: 'RND_INNOVATION',
        type: 'RESEARCH',
        priority: 'MEDIUM',
        projectId: aiResearch.id,
        createdById: manager.id,
      },
      {
        title: 'Prototype an AI FAQ chatbot for client sites',
        description: 'Embed a docs-trained chatbot on a WordPress staging site.',
        expectedOutcome: 'Working demo, cost estimate, and risks.',
        category: 'RND_INNOVATION',
        type: 'RESEARCH',
        priority: 'LOW',
        projectId: aiResearch.id,
        createdById: manager.id,
      },
      {
        title: 'Automate WordPress plugin update checks',
        description: 'Explore automating weekly plugin update + smoke test across client sites.',
        expectedOutcome: 'Proof of concept script and findings.',
        category: 'RND_INNOVATION',
        type: 'RESEARCH',
        priority: 'HIGH',
        projectId: aiResearch.id,
        createdById: manager.id,
      },
    ],
  })

  // A fuller board: backlog, blocked and recently completed work.
  const day = 24 * 3600_000
  await prisma.task.createMany({
    data: [
      {
        title: 'Migrate Acme site to new hosting',
        description: 'Waiting on DNS access from the client.',
        category: 'DELIVERY_TEAM',
        type: 'DELIVERY',
        priority: 'URGENT',
        status: 'BLOCKED',
        startedAt: new Date(now.getTime() - 2 * day),
        projectId: wpClient.id,
        assigneeId: devD.id,
        createdById: manager.id,
      },
      {
        title: 'Update premium plugin licenses',
        category: 'DELIVERY_TEAM',
        type: 'DELIVERY',
        priority: 'LOW',
        projectId: wpClient.id,
        createdById: manager.id,
      },
      {
        title: 'Set up staging environment for Acme',
        category: 'DELIVERY_TEAM',
        type: 'DELIVERY',
        priority: 'MEDIUM',
        status: 'COMPLETED',
        startedAt: new Date(now.getTime() - 3 * day),
        completedAt: new Date(now.getTime() - day),
        projectId: wpClient.id,
        assigneeId: devA.id,
        createdById: manager.id,
      },
      {
        title: 'Weekly client status call notes',
        category: 'DELIVERY_TEAM',
        type: 'PM_SUPPORT',
        priority: 'MEDIUM',
        projectId: pmSupport.id,
        assigneeId: devB.id,
        createdById: manager.id,
      },
    ],
  })

  // Documented research: one finished with an outcome and final report, one in flight.
  const vectorTask = await prisma.task.create({
    data: {
      title: 'Compare vector databases for internal search',
      description: 'pgvector vs Qdrant vs Pinecone for a docs search prototype.',
      expectedOutcome: 'Short report with benchmark numbers and a pick.',
      category: 'RND_INNOVATION',
      type: 'RESEARCH',
      priority: 'MEDIUM',
      status: 'COMPLETED',
      startedAt: new Date(now.getTime() - 6 * day),
      completedAt: new Date(now.getTime() - 4 * day),
      createdAt: new Date(now.getTime() - 7 * day),
      projectId: aiResearch.id,
      assigneeId: devC.id,
      createdById: manager.id,
    },
  })
  const at =(msAgo: number) => new Date(now.getTime() - msAgo)
  await prisma.taskEntry.createMany({
    data: [
      { taskId: vectorTask.id, authorId: devC.id, kind: 'PROGRESS', body: 'Loaded 20k doc chunks into all three and ran the same 50 queries.', createdAt: at(5.5 * day) },
      { taskId: vectorTask.id, authorId: devC.id, kind: 'FINDING', body: 'pgvector with an HNSW index answers in ~12ms at our size — fast enough, and we already run Postgres.', createdAt: at(5 * day) },
      { taskId: vectorTask.id, authorId: devC.id, kind: 'CHALLENGE', body: 'Pinecone free tier throttled bulk inserts, so its load numbers are not comparable.', createdAt: at(4.8 * day) },
      { taskId: vectorTask.id, authorId: devC.id, kind: 'SOLUTION', body: 'Batched inserts to 100 rows with a short delay; re-ran the benchmark.', createdAt: at(4.6 * day) },
      { taskId: vectorTask.id, authorId: devC.id, kind: 'OUTCOME', body: 'Recommend pgvector: no new infrastructure, good enough latency, zero extra cost. Revisit Qdrant past ~5M chunks.', createdAt: at(4 * day) },
      { taskId: rohanTask.id, authorId: devC.id, kind: 'PROGRESS', body: 'GitHub App skeleton receives pull_request webhooks.', createdAt: at(100 * 60_000) },
      { taskId: rohanTask.id, authorId: devC.id, kind: 'CHALLENGE', body: 'Large diffs exceed the model context window.', createdAt: at(50 * 60_000) },
    ],
  })
  await prisma.taskLink.createMany({
    data: [
      { taskId: vectorTask.id, label: 'Benchmark spreadsheet', url: 'https://example.com/sheets/vector-db-benchmark', kind: 'SUPPORTING', createdAt: at(5 * day) },
      { taskId: vectorTask.id, label: 'Vector DB comparison report', url: 'https://example.com/docs/vector-db-report', kind: 'FINAL_REPORT', createdAt: at(4 * day) },
      { taskId: rohanTask.id, label: 'Prototype repo', url: 'https://example.com/git/ai-review-bot', kind: 'SUPPORTING', createdAt: at(90 * 60_000) },
    ],
  })
  await prisma.activityLog.createMany({
    data: [
      { actorId: manager.id, taskId: vectorTask.id, action: 'TASK_CREATED', summary: `${manager.name} created "${vectorTask.title}" (R&D Innovation)`, createdAt: at(7 * day) },
      { actorId: devC.id, taskId: vectorTask.id, action: 'TASK_PICKED_UP', summary: `${devC.name} picked up research task "${vectorTask.title}" (R&D Innovation)`, createdAt: at(6 * day) },
      { actorId: devC.id, taskId: vectorTask.id, action: 'STATUS_OCCUPIED', summary: `${devC.name} is now Occupied — started "${vectorTask.title}" (R&D Innovation)`, createdAt: at(6 * day) },
      { actorId: devC.id, taskId: vectorTask.id, action: 'LINK_ADDED', summary: `${devC.name} attached the final report "Vector DB comparison report" to "${vectorTask.title}"`, createdAt: at(4 * day) },
      { actorId: devC.id, taskId: vectorTask.id, action: 'STATUS_AVAILABLE', summary: `${devC.name} completed "${vectorTask.title}" (R&D Innovation) and is now Available`, createdAt: at(4 * day) },
      { actorId: manager.id, taskId: rohanTask.id, action: 'TASK_CREATED', summary: `${manager.name} created "${rohanTask.title}" (R&D Innovation) and assigned it to ${devC.name}`, createdAt: at(3 * 3600_000) },
      { actorId: devC.id, taskId: rohanTask.id, action: 'STATUS_OCCUPIED', summary: `${devC.name} is now Occupied — started "${rohanTask.title}" (R&D Innovation)`, createdAt: at(2 * 3600_000) },
      { actorId: devD.id, taskId: rohanTask.id, action: 'TASK_JOINED', summary: `${devD.name} joined ${devC.name} on "${rohanTask.title}" (R&D Innovation)`, createdAt: at(95 * 60_000) },
      { actorId: devD.id, taskId: rohanTask.id, action: 'STATUS_AVAILABLE', summary: `${devD.name} stopped working on "${rohanTask.title}" (R&D Innovation) and is now Available — ${devC.name} is still on it`, createdAt: at(35 * 60_000) },
    ],
  })

  // A shared task: Sara joined Rohan's prototype for an hour, and stays on it as a collaborator.
  await prisma.taskMember.create({ data: { taskId: rohanTask.id, userId: devD.id, joinedAt: at(95 * 60_000) } })

  // Work sessions: the two people working right now have one open session each;
  // finished work has closed sessions, so time spent and weekly hours have history.
  const byTitle = async (title: string) => (await prisma.task.findFirstOrThrow({ where: { title } })).id
  const hour = 3600_000
  await prisma.workSession.createMany({
    data: [
      { userId: devB.id, taskId: priyaTask.id, startedAt: priyaTask.startedAt! },
      { userId: devC.id, taskId: rohanTask.id, startedAt: rohanTask.startedAt! },
      { userId: devD.id, taskId: rohanTask.id, startedAt: at(95 * 60_000), endedAt: at(35 * 60_000), endReason: 'PAUSED' },
      { userId: devB.id, taskId: await byTitle('Weekly client status call notes'), startedAt: at(26 * hour), endedAt: at(24 * hour), endReason: 'PAUSED' },
      { userId: devD.id, taskId: await byTitle('Migrate Acme site to new hosting'), startedAt: at(2 * day), endedAt: at(2 * day - 1.5 * hour), endReason: 'BLOCKED' },
      { userId: devA.id, taskId: await byTitle('Set up staging environment for Acme'), startedAt: at(3 * day), endedAt: at(3 * day - 4 * hour), endReason: 'END_OF_DAY' },
      { userId: devA.id, taskId: await byTitle('Set up staging environment for Acme'), startedAt: at(day + 2 * hour), endedAt: at(day), endReason: 'COMPLETED' },
      { userId: devC.id, taskId: vectorTask.id, startedAt: at(6 * day), endedAt: at(6 * day - 3.5 * hour), endReason: 'END_OF_DAY' },
      { userId: devC.id, taskId: vectorTask.id, startedAt: at(5 * day), endedAt: at(5 * day - 5 * hour), endReason: 'END_OF_DAY' },
      { userId: devC.id, taskId: vectorTask.id, startedAt: at(4 * day + 2 * hour), endedAt: at(4 * day), endReason: 'COMPLETED' },
    ],
  })

  console.log(`Seeded: 1 manager, 4 developers (${devD.name} starts Available). Password for all: ${PASSWORD}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
