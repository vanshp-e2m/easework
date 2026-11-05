-- Which Claude seat each developer uses.
ALTER TABLE "User" ADD COLUMN "claudeSeat" TEXT,
ADD COLUMN "claudeSeatSetAt" TIMESTAMP(3);
