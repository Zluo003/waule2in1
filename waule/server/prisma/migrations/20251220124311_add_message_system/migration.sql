-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('NOTIFICATION', 'ANNOUNCEMENT', 'PROMOTION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageTargetType" AS ENUM ('ALL', 'ROLE', 'USER');

-- CreateTable
CREATE TABLE "system_messages" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" "MessageType" NOT NULL DEFAULT 'NOTIFICATION',
    "targetType" "MessageTargetType" NOT NULL DEFAULT 'ALL',
    "targetRoles" TEXT[],
    "targetUsers" TEXT[],
    "senderId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_messages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "systemMessageId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_messages_userId_isDeleted_isRead_idx" ON "user_messages"("userId", "isDeleted", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "user_messages_userId_systemMessageId_key" ON "user_messages"("userId", "systemMessageId");

-- AddForeignKey
ALTER TABLE "system_messages" ADD CONSTRAINT "system_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_messages" ADD CONSTRAINT "user_messages_systemMessageId_fkey" FOREIGN KEY ("systemMessageId") REFERENCES "system_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
