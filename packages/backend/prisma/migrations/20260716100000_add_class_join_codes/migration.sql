ALTER TABLE "Class"
  ADD COLUMN "joinCode" TEXT,
  ADD COLUMN "joinCodeExpiresAt" TIMESTAMP(3);

ALTER TABLE "ClassMember"
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "reviewNote" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Class_joinCode_key" ON "Class"("joinCode");
CREATE INDEX "ClassMember_classId_status_idx" ON "ClassMember"("classId", "status");
CREATE INDEX "ClassMember_userId_status_idx" ON "ClassMember"("userId", "status");
