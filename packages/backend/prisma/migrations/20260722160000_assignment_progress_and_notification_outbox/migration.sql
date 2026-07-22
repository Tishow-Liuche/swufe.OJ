-- Assignment progress rules + notification outbox
ALTER TABLE "Assignment" ADD COLUMN IF NOT EXISTS "countExternalAc" BOOLEAN NOT NULL DEFAULT false;

-- Existing PENDING rows become NOT_STARTED for the new status machine.
UPDATE "AssignmentStudent" SET "status" = 'NOT_STARTED' WHERE "status" = 'PENDING';
ALTER TABLE "AssignmentStudent" ALTER COLUMN "status" SET DEFAULT 'NOT_STARTED';

CREATE INDEX IF NOT EXISTS "AssignmentStudent_userId_status_idx" ON "AssignmentStudent"("userId", "status");
CREATE INDEX IF NOT EXISTS "AssignmentStudent_assignmentId_status_idx" ON "AssignmentStudent"("assignmentId", "status");

CREATE TABLE IF NOT EXISTS "NotificationOutbox" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "link" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "NotificationOutbox_status_createdAt_idx" ON "NotificationOutbox"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationOutbox_refType_refId_idx" ON "NotificationOutbox"("refType", "refId");
CREATE INDEX IF NOT EXISTS "NotificationOutbox_userId_type_idx" ON "NotificationOutbox"("userId", "type");
