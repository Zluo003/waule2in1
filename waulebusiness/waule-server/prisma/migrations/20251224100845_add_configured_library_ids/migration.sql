-- CreateTable
CREATE TABLE "tenant_sora_character_shares" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_sora_character_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tenant_sora_character_shares_targetUserId_idx" ON "tenant_sora_character_shares"("targetUserId");

-- CreateIndex
CREATE INDEX "tenant_sora_character_shares_tenantId_idx" ON "tenant_sora_character_shares"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_sora_character_shares_ownerUserId_targetUserId_key" ON "tenant_sora_character_shares"("ownerUserId", "targetUserId");
