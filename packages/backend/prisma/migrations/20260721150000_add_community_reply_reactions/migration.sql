CREATE TABLE "CommunityReplyReaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "replyId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'UPVOTE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CommunityReplyReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityReplyReaction_userId_replyId_type_key"
    ON "CommunityReplyReaction"("userId", "replyId", "type");
CREATE INDEX "CommunityReplyReaction_replyId_createdAt_idx"
    ON "CommunityReplyReaction"("replyId", "createdAt");

ALTER TABLE "CommunityReplyReaction"
    ADD CONSTRAINT "CommunityReplyReaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CommunityReplyReaction"
    ADD CONSTRAINT "CommunityReplyReaction_replyId_fkey"
    FOREIGN KEY ("replyId") REFERENCES "CommunityReply"("id") ON DELETE CASCADE ON UPDATE CASCADE;
