-- AlterTable
ALTER TABLE "assets" ADD COLUMN     "storageExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "generation_tasks" ADD COLUMN     "storageExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "nodes" ADD COLUMN     "storageExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_level_configs" ADD COLUMN     "storageRetentionDays" INTEGER NOT NULL DEFAULT -1;

-- CreateIndex
CREATE INDEX "assets_storageExpiresAt_idx" ON "assets"("storageExpiresAt");

-- CreateIndex
CREATE INDEX "generation_tasks_storageExpiresAt_idx" ON "generation_tasks"("storageExpiresAt");

-- CreateIndex
CREATE INDEX "nodes_storageExpiresAt_idx" ON "nodes"("storageExpiresAt");
