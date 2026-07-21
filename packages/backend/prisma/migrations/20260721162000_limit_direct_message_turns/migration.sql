ALTER TABLE "DirectConversation"
ADD COLUMN "initiatorId" TEXT,
ADD COLUMN "messagingUnlocked" BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE "DirectConversation"
SET "messagingUnlocked" = TRUE
WHERE EXISTS (
  SELECT 1 FROM "DirectMessage"
  WHERE "DirectMessage"."conversationId" = "DirectConversation".id
);
