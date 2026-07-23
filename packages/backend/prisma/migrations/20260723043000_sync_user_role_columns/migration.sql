-- Keep the persisted User table aligned with the current registration and role schema.
ALTER TABLE "User" ADD COLUMN     "requestedRole" TEXT NOT NULL DEFAULT 'STUDENT',
ADD COLUMN     "school" TEXT,
ADD COLUMN     "teacherApplicationStatus" TEXT NOT NULL DEFAULT 'NOT_REQUIRED';

-- The unique index kept its old name when refreshToken was renamed to refreshTokenHash.
ALTER INDEX "UserSession_refreshToken_key" RENAME TO "UserSession_refreshTokenHash_key";
