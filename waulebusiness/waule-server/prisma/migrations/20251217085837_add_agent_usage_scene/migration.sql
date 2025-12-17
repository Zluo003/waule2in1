-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "usageScene" TEXT NOT NULL DEFAULT 'workflow';

-- AlterTable
ALTER TABLE "ai_models" ADD COLUMN     "wauleApiServerId" TEXT;

-- AlterTable
ALTER TABLE "client_activations" ADD COLUMN     "clientIp" TEXT,
ADD COLUMN     "clientVersion" TEXT,
ADD COLUMN     "lastHeartbeat" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenant_users" ADD COLUMN     "clientIp" TEXT,
ADD COLUMN     "clientVersion" TEXT,
ADD COLUMN     "lastHeartbeat" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "lastHeartbeat" TIMESTAMP(3),
ADD COLUMN     "serverActivated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "serverActivatedAt" TIMESTAMP(3),
ADD COLUMN     "serverActivatedIp" TEXT,
ADD COLUMN     "serverDeviceId" TEXT,
ADD COLUMN     "serverIp" TEXT,
ADD COLUMN     "serverVersion" TEXT;

-- CreateTable
CREATE TABLE "waule_api_servers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authToken" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "waule_api_servers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_models_wauleApiServerId_idx" ON "ai_models"("wauleApiServerId");

-- AddForeignKey
ALTER TABLE "ai_models" ADD CONSTRAINT "ai_models_wauleApiServerId_fkey" FOREIGN KEY ("wauleApiServerId") REFERENCES "waule_api_servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
