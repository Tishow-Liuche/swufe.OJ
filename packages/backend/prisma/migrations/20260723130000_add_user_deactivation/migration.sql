-- Preserve historical teaching and submission records while disabling an account.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- Pending teacher applications must never retain effective teacher permissions.
UPDATE "User"
SET "role" = 'STUDENT'
WHERE "requestedRole" = 'TEACHER'
  AND "teacherApplicationStatus" = 'PENDING'
  AND "role" = 'TEACHER';

-- Teachers created before application-state tracking remain approved teachers.
UPDATE "User"
SET "requestedRole" = 'TEACHER',
    "teacherApplicationStatus" = 'APPROVED'
WHERE "role" = 'TEACHER'
  AND "teacherApplicationStatus" = 'NOT_REQUIRED';
