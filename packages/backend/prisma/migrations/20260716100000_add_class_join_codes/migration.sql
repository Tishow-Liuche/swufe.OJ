ALTER TABLE "Class"
  ADD COLUMN IF NOT EXISTS "joinCode" TEXT,
  ADD COLUMN IF NOT EXISTS "joinCodeExpiresAt" TIMESTAMP(3);

ALTER TABLE "ClassMember"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN IF NOT EXISTS "reviewNote" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "Class_joinCode_key" ON "Class"("joinCode");
CREATE INDEX IF NOT EXISTS "ClassMember_classId_status_idx" ON "ClassMember"("classId", "status");
CREATE INDEX IF NOT EXISTS "ClassMember_userId_status_idx" ON "ClassMember"("userId", "status");
