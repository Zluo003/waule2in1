-- 启用 pg_trgm 扩展（用于模糊搜索索引）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_episodeId_fkey";

-- DropForeignKey
ALTER TABLE "workflows" DROP CONSTRAINT "workflows_projectId_fkey";

-- AlterTable
ALTER TABLE "episode_permissions" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text,
ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "project_shares" ALTER COLUMN "id" SET DEFAULT (gen_random_uuid())::text;

-- AlterTable
ALTER TABLE "workflow_shares" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "sora_character_shares" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sora_character_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sora_character_shares_targetUserId_idx" ON "sora_character_shares"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "sora_character_shares_ownerUserId_targetUserId_key" ON "sora_character_shares"("ownerUserId", "targetUserId");

-- CreateIndex
CREATE INDEX "idx_assets_project" ON "assets"("projectId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_episodes_project" ON "episodes"("projectId", "updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_projects_desc_trgm" ON "projects" USING GIN ("description" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_projects_name_trgm" ON "projects" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_projects_user_type_status_updated" ON "projects"("userId", "type", "status", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "idx_projects_user_updated_id" ON "projects"("userId", "updatedAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "idx_workflows_project" ON "workflows"("projectId", "updatedAt" DESC, "id" DESC);

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sora_character_shares" ADD CONSTRAINT "sora_character_shares_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sora_character_shares" ADD CONSTRAINT "sora_character_shares_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
