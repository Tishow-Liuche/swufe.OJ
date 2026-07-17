-- Existing refresh tokens are intentionally revoked before changing storage format.
DELETE FROM "UserSession";

ALTER TABLE "UserSession" RENAME COLUMN "refreshToken" TO "refreshTokenHash";

DROP INDEX IF EXISTS "UserSession_refreshToken_idx";
CREATE INDEX IF NOT EXISTS "UserSession_refreshTokenHash_idx" ON "UserSession"("refreshTokenHash");
