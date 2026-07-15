-- Compatibility upgrade for databases created from origin/main before migrations
-- were committed. Fresh databases already receive these columns from the baseline;
-- therefore every DDL statement here is deliberately idempotent.

ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "studentId" TEXT,
    ADD COLUMN IF NOT EXISTS "college" TEXT,
    ADD COLUMN IF NOT EXISTS "phone" TEXT,
    ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "User_studentId_key" ON "User"("studentId");

-- PostgreSQL does not add a sequence when adding a plain integer column, so make
-- the contest number sequence explicit and backfill every legacy contest first.
ALTER TABLE "Contest" ADD COLUMN IF NOT EXISTS "contestNo" INTEGER;
CREATE SEQUENCE IF NOT EXISTS "Contest_contestNo_seq";
ALTER SEQUENCE "Contest_contestNo_seq" OWNED BY "Contest"."contestNo";
ALTER TABLE "Contest"
    ALTER COLUMN "contestNo" SET DEFAULT nextval('"Contest_contestNo_seq"'::regclass);
UPDATE "Contest"
SET "contestNo" = nextval('"Contest_contestNo_seq"'::regclass)
WHERE "contestNo" IS NULL;
ALTER TABLE "Contest" ALTER COLUMN "contestNo" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Contest_contestNo_key" ON "Contest"("contestNo");

ALTER TABLE "Contest"
    ADD COLUMN IF NOT EXISTS "teamMode" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "isRated" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "ContestParticipant"
    ADD COLUMN IF NOT EXISTS "isVirtual" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "virtualStart" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "virtualEnd" TIMESTAMP(3);

-- Classes that existed before the approval workflow were already usable. Only
-- backfill them when the status column is introduced by this migration; do not
-- silently approve genuinely pending classes on newer installations.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'Class' AND column_name = 'status'
    ) THEN
        ALTER TABLE "Class"
            ADD COLUMN "status" TEXT NOT NULL DEFAULT 'PENDING',
            ADD COLUMN "reviewNote" TEXT,
            ADD COLUMN "approvedAt" TIMESTAMP(3);

        UPDATE "Class"
        SET "status" = 'APPROVED', "approvedAt" = "createdAt";
    ELSE
        ALTER TABLE "Class"
            ADD COLUMN IF NOT EXISTS "reviewNote" TEXT,
            ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3);
    END IF;
END $$;
