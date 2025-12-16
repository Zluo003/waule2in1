-- AlterTable
ALTER TABLE "users" ADD COLUMN     "totpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "totpSecret" TEXT;

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "remark" TEXT,
    "storageConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "maxClients" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar" TEXT,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_usage_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "modelId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "creditsCharged" INTEGER NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_credit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "operatorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_credit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_activations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activationCode" TEXT NOT NULL,
    "deviceFingerprint" TEXT,
    "deviceName" TEXT,
    "isActivated" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_projects" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "type" "ProjectType" NOT NULL DEFAULT 'QUICK',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_episodes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "EpisodeStatus" NOT NULL DEFAULT 'DRAFT',
    "thumbnail" TEXT,
    "scriptJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_workflows" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeId" TEXT,
    "scene" INTEGER,
    "shot" INTEGER,
    "name" TEXT NOT NULL,
    "nodes" JSONB NOT NULL DEFAULT '[]',
    "edges" JSONB NOT NULL DEFAULT '[]',
    "nodeGroups" JSONB NOT NULL DEFAULT '[]',
    "viewport" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_workflow_collaborators" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'READ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_workflow_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_project_collaborators" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'READ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_project_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_asset_library_collaborators" (
    "id" TEXT NOT NULL,
    "libraryId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "canDownload" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_asset_library_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_assets" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "libraryId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER,
    "mimeType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_asset_libraries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "thumbnail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_asset_libraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_tasks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "modelId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "creditsCost" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sourceNodeId" TEXT,
    "previewNodeCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "tenant_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_recycle_items" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tenantUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "size" INTEGER,
    "metadata" JSONB,
    "isDeleted" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_recycle_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "node_prompt_templates" (
    "id" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT,
    "userPromptTemplate" TEXT NOT NULL,
    "enhancePromptTemplate" TEXT,
    "variables" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "node_prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_apiKey_key" ON "tenants"("apiKey");

-- CreateIndex
CREATE INDEX "tenants_isActive_idx" ON "tenants"("isActive");

-- CreateIndex
CREATE INDEX "tenants_createdAt_idx" ON "tenants"("createdAt");

-- CreateIndex
CREATE INDEX "tenant_users_tenantId_idx" ON "tenant_users"("tenantId");

-- CreateIndex
CREATE INDEX "tenant_users_isActive_idx" ON "tenant_users"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_users_tenantId_username_key" ON "tenant_users"("tenantId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_users_tenantId_nickname_key" ON "tenant_users"("tenantId", "nickname");

-- CreateIndex
CREATE INDEX "tenant_usage_records_tenantId_createdAt_idx" ON "tenant_usage_records"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "tenant_credit_logs_tenantId_createdAt_idx" ON "tenant_credit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "client_activations_activationCode_key" ON "client_activations"("activationCode");

-- CreateIndex
CREATE INDEX "client_activations_tenantId_idx" ON "client_activations"("tenantId");

-- CreateIndex
CREATE INDEX "client_activations_activationCode_idx" ON "client_activations"("activationCode");

-- CreateIndex
CREATE INDEX "tenant_projects_tenantId_tenantUserId_idx" ON "tenant_projects"("tenantId", "tenantUserId");

-- CreateIndex
CREATE INDEX "tenant_projects_tenantId_updatedAt_idx" ON "tenant_projects"("tenantId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "tenant_episodes_projectId_idx" ON "tenant_episodes"("projectId");

-- CreateIndex
CREATE INDEX "tenant_workflows_tenantId_tenantUserId_idx" ON "tenant_workflows"("tenantId", "tenantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_workflows_projectId_episodeId_scene_shot_key" ON "tenant_workflows"("projectId", "episodeId", "scene", "shot");

-- CreateIndex
CREATE INDEX "tenant_workflow_collaborators_tenantUserId_idx" ON "tenant_workflow_collaborators"("tenantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_workflow_collaborators_workflowId_tenantUserId_key" ON "tenant_workflow_collaborators"("workflowId", "tenantUserId");

-- CreateIndex
CREATE INDEX "tenant_project_collaborators_tenantUserId_idx" ON "tenant_project_collaborators"("tenantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_project_collaborators_projectId_tenantUserId_key" ON "tenant_project_collaborators"("projectId", "tenantUserId");

-- CreateIndex
CREATE INDEX "tenant_asset_library_collaborators_tenantUserId_idx" ON "tenant_asset_library_collaborators"("tenantUserId");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_asset_library_collaborators_libraryId_tenantUserId_key" ON "tenant_asset_library_collaborators"("libraryId", "tenantUserId");

-- CreateIndex
CREATE INDEX "tenant_assets_tenantId_tenantUserId_idx" ON "tenant_assets"("tenantId", "tenantUserId");

-- CreateIndex
CREATE INDEX "tenant_assets_libraryId_idx" ON "tenant_assets"("libraryId");

-- CreateIndex
CREATE INDEX "tenant_asset_libraries_tenantId_tenantUserId_idx" ON "tenant_asset_libraries"("tenantId", "tenantUserId");

-- CreateIndex
CREATE INDEX "tenant_tasks_tenantId_tenantUserId_idx" ON "tenant_tasks"("tenantId", "tenantUserId");

-- CreateIndex
CREATE INDEX "tenant_tasks_status_idx" ON "tenant_tasks"("status");

-- CreateIndex
CREATE INDEX "tenant_tasks_sourceNodeId_idx" ON "tenant_tasks"("sourceNodeId");

-- CreateIndex
CREATE INDEX "tenant_recycle_items_tenantId_tenantUserId_idx" ON "tenant_recycle_items"("tenantId", "tenantUserId");

-- CreateIndex
CREATE INDEX "tenant_recycle_items_isDeleted_idx" ON "tenant_recycle_items"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "node_prompt_templates_nodeType_key" ON "node_prompt_templates"("nodeType");

-- CreateIndex
CREATE INDEX "node_prompt_templates_nodeType_idx" ON "node_prompt_templates"("nodeType");

-- CreateIndex
CREATE INDEX "node_prompt_templates_isActive_idx" ON "node_prompt_templates"("isActive");

-- CreateIndex
CREATE INDEX "idx_workflows_user_updated" ON "workflows"("userId", "updatedAt" DESC);

-- AddForeignKey
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_usage_records" ADD CONSTRAINT "tenant_usage_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_activations" ADD CONSTRAINT "client_activations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_episodes" ADD CONSTRAINT "tenant_episodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "tenant_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_workflows" ADD CONSTRAINT "tenant_workflows_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "tenant_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_workflows" ADD CONSTRAINT "tenant_workflows_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "tenant_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_workflow_collaborators" ADD CONSTRAINT "tenant_workflow_collaborators_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "tenant_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_project_collaborators" ADD CONSTRAINT "tenant_project_collaborators_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "tenant_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_asset_library_collaborators" ADD CONSTRAINT "tenant_asset_library_collaborators_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "tenant_asset_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_assets" ADD CONSTRAINT "tenant_assets_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "tenant_asset_libraries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
