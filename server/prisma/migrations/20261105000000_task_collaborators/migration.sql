-- Several developers can now work on one task at the same time.

-- "One In Progress task per assignee" no longer holds: an owner's task can stay
-- In Progress while a collaborator works on it and the owner starts another.
-- One active task per developer is still guaranteed by User.currentTaskId.
DROP INDEX "Task_one_in_progress_per_assignee";

-- A task can be the current task of several developers.
DROP INDEX "User_currentTaskId_key";
CREATE INDEX "User_currentTaskId_idx" ON "User"("currentTaskId");

-- CreateTable
CREATE TABLE "TaskMember" (
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskMember_pkey" PRIMARY KEY ("taskId","userId")
);

-- CreateIndex
CREATE INDEX "TaskMember_userId_idx" ON "TaskMember"("userId");

-- AddForeignKey
ALTER TABLE "TaskMember" ADD CONSTRAINT "TaskMember_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskMember" ADD CONSTRAINT "TaskMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
