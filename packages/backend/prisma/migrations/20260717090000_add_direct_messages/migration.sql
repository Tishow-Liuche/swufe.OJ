CREATE TABLE "DirectConversation" (
  "id" TEXT NOT NULL,
  "participantOneId" TEXT NOT NULL,
  "participantTwoId" TEXT NOT NULL,
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "DirectConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectConversation_participantOneId_participantTwoId_key"
  ON "DirectConversation"("participantOneId", "participantTwoId");
CREATE INDEX "DirectConversation_participantOneId_lastMessageAt_idx"
  ON "DirectConversation"("participantOneId", "lastMessageAt");
CREATE INDEX "DirectConversation_participantTwoId_lastMessageAt_idx"
  ON "DirectConversation"("participantTwoId", "lastMessageAt");
CREATE INDEX "DirectMessage_conversationId_createdAt_idx"
  ON "DirectMessage"("conversationId", "createdAt");
CREATE INDEX "DirectMessage_conversationId_readAt_idx"
  ON "DirectMessage"("conversationId", "readAt");

ALTER TABLE "DirectConversation"
  ADD CONSTRAINT "DirectConversation_participantOneId_fkey"
  FOREIGN KEY ("participantOneId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectConversation"
  ADD CONSTRAINT "DirectConversation_participantTwoId_fkey"
  FOREIGN KEY ("participantTwoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage"
  ADD CONSTRAINT "DirectMessage_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DirectMessage"
  ADD CONSTRAINT "DirectMessage_senderId_fkey"
  FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
