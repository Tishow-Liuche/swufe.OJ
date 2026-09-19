ALTER TABLE "CommunityPost"
    ADD COLUMN IF NOT EXISTS "imagePaths" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "CommunityReply"
    ADD COLUMN IF NOT EXISTS "parentReplyId" TEXT;

CREATE INDEX IF NOT EXISTS "CommunityReply_parentReplyId_createdAt_idx"
    ON "CommunityReply"("parentReplyId", "createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'CommunityReply_parentReplyId_fkey'
    ) THEN
        ALTER TABLE "CommunityReply"
            ADD CONSTRAINT "CommunityReply_parentReplyId_fkey"
            FOREIGN KEY ("parentReplyId") REFERENCES "CommunityReply"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
