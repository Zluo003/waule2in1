-- CreateEnum
CREATE TYPE "SharePermission" AS ENUM ('READ', 'EDIT');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER', 'VIP', 'SVIP', 'INTERNAL');

-- CreateEnum
CREATE TYPE "LoginType" AS ENUM ('PHONE', 'WECHAT', 'ADMIN');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('DRAMA', 'QUICK');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'RENDERING', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EpisodeStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('TEXT_PROCESSING', 'IMAGE_GENERATION', 'VIDEO_GENERATION', 'MEDIA_UPLOAD');

-- CreateEnum
CREATE TYPE "NodeStatus" AS ENUM ('IDLE', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT');

-- CreateEnum
CREATE TYPE "AssetLibraryCategory" AS ENUM ('ROLE', 'SCENE', 'PROP', 'OTHER');

-- CreateEnum
CREATE TYPE "AIModelType" AS ENUM ('TEXT_GENERATION', 'IMAGE_GENERATION', 'VIDEO_GENERATION', 'VIDEO_EDITING', 'AUDIO_SYNTHESIS');

-- CreateEnum
CREATE TYPE "TaskType" AS ENUM ('IMAGE', 'VIDEO', 'STORYBOARD');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "BillingType" AS ENUM ('PER_REQUEST', 'PER_IMAGE', 'PER_DURATION', 'DURATION_RESOLUTION', 'PER_CHARACTER', 'DURATION_MODE', 'OPERATION_MODE');

-- CreateEnum
CREATE TYPE "PackageType" AS ENUM ('RECHARGE', 'CREDITS');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('ALIPAY', 'WECHAT', 'MANUAL');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('RECHARGE', 'CONSUME', 'REFUND', 'GIFT', 'ADMIN', 'EXPIRE', 'REDEEM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "username" TEXT,
    "password" TEXT,
    "nickname" TEXT,
    "avatar" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "credits" INTEGER NOT NULL DEFAULT 0,
    "loginType" "LoginType" NOT NULL DEFAULT 'PHONE',
    "wechatOpenId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "membershipExpireAt" TIMESTAMP(3),
    "giftStartDate" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "type" "ProjectType" NOT NULL DEFAULT 'DRAMA',
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "duration" INTEGER,
    "thumbnail" TEXT,
    "videoUrl" TEXT,
    "status" "EpisodeStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scriptJson" JSONB,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenes" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "sceneNumber" INTEGER NOT NULL,
    "name" TEXT,
    "description" TEXT NOT NULL,
    "imagePrompt" TEXT,
    "imageUrl" TEXT,
    "videoUrl" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "episodeId" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nodes" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "type" "NodeType" NOT NULL,
    "position" JSONB NOT NULL,
    "data" JSONB NOT NULL,
    "status" "NodeStatus" NOT NULL DEFAULT 'IDLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "assetLibraryId" TEXT,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "metadata" JSONB,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_libraries" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "category" "AssetLibraryCategory" NOT NULL DEFAULT 'OTHER',

    CONSTRAINT "asset_libraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "type" "AIModelType" NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pricePerUse" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "apiKey" TEXT,
    "apiUrl" TEXT,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_roles" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "systemPrompt" TEXT NOT NULL,
    "aiModelId" TEXT NOT NULL,
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "maxTokens" INTEGER NOT NULL DEFAULT 2000,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelId" TEXT,
    "billingRuleId" TEXT,
    "nodeType" TEXT,
    "moduleType" TEXT,
    "operation" TEXT NOT NULL,
    "quantity" INTEGER,
    "duration" INTEGER,
    "resolution" TEXT,
    "mode" TEXT,
    "operationType" TEXT,
    "creditsCharged" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(10,4) NOT NULL,
    "tokens" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generation_tasks" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TaskType" NOT NULL,
    "modelId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "ratio" TEXT,
    "referenceImages" JSONB,
    "generationType" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'PENDING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "resultUrl" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,
    "previewNodeData" JSONB,
    "sourceNodeId" TEXT,
    "previewNodeCreated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "externalTaskId" TEXT,

    CONSTRAINT "generation_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_capabilities" (
    "id" TEXT NOT NULL,
    "aiModelId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "supported" BOOLEAN NOT NULL DEFAULT true,
    "signature" JSONB,
    "overrides" JSONB,
    "source" TEXT,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_library_shares" (
    "id" TEXT NOT NULL,
    "assetLibraryId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "canDownload" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_library_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_shares" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'READ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_shares" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episode_permissions" (
    "id" TEXT NOT NULL,
    "episodeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permission" "SharePermission" NOT NULL DEFAULT 'READ',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episode_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "aiModelId" TEXT,
    "nodeType" TEXT,
    "moduleType" TEXT,
    "billingType" "BillingType" NOT NULL,
    "baseCredits" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_prices" (
    "id" TEXT NOT NULL,
    "billingRuleId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "creditsPerUnit" INTEGER NOT NULL,
    "unitSize" INTEGER DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sora_characters" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customName" TEXT NOT NULL,
    "characterName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "sourceVideoUrl" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sora_characters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_configs" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSandbox" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_packages" (
    "id" TEXT NOT NULL,
    "type" "PackageType" NOT NULL DEFAULT 'RECHARGE',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "bonusCredits" INTEGER NOT NULL DEFAULT 0,
    "memberLevel" "UserRole",
    "memberDays" INTEGER,
    "coverImage" TEXT,
    "badge" TEXT,
    "badgeColor" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isRecommend" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_orders" (
    "id" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT,
    "amount" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "paymentMethod" "PaymentProvider" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "tradeNo" TEXT,
    "qrCodeUrl" TEXT,
    "qrCodeExpireAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "expireAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "orderId" TEXT,
    "usageRecordId" TEXT,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "redeem_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "memberLevel" "UserRole",
    "memberDays" INTEGER,
    "isUsed" BOOLEAN NOT NULL DEFAULT false,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "expireAt" TIMESTAMP(3),
    "remark" TEXT,
    "batchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "redeem_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_level_configs" (
    "id" TEXT NOT NULL,
    "userRole" "UserRole" NOT NULL,
    "dailyGiftCredits" INTEGER NOT NULL DEFAULT 0,
    "giftDays" INTEGER NOT NULL DEFAULT 0,
    "giftDescription" TEXT,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_level_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_permissions" (
    "id" TEXT NOT NULL,
    "aiModelId" TEXT,
    "nodeType" TEXT,
    "moduleType" TEXT,
    "userRole" "UserRole" NOT NULL,
    "isAllowed" BOOLEAN NOT NULL DEFAULT true,
    "dailyLimit" INTEGER NOT NULL DEFAULT -1,
    "isFreeForMember" BOOLEAN NOT NULL DEFAULT false,
    "freeDailyLimit" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_usage_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "aiModelId" TEXT,
    "nodeType" TEXT,
    "moduleType" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "freeUsageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_credits_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "giftedCredits" INTEGER NOT NULL DEFAULT 0,
    "usedCredits" INTEGER NOT NULL DEFAULT 0,
    "remainingCredits" INTEGER NOT NULL DEFAULT 0,
    "userRole" "UserRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gift_credits_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_nickname_key" ON "users"("nickname");

-- CreateIndex
CREATE UNIQUE INDEX "users_wechatOpenId_key" ON "users"("wechatOpenId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_projectId_episodeNumber_key" ON "episodes"("projectId", "episodeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "scenes_episodeId_sceneNumber_key" ON "scenes"("episodeId", "sceneNumber");

-- CreateIndex
CREATE INDEX "assets_assetLibraryId_createdAt_idx" ON "assets"("assetLibraryId", "createdAt");

-- CreateIndex
CREATE INDEX "assets_userId_createdAt_idx" ON "assets"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "assets_userId_type_createdAt_idx" ON "assets"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "assets_name_idx" ON "assets"("name");

-- CreateIndex
CREATE INDEX "assets_originalName_idx" ON "assets"("originalName");

-- CreateIndex
CREATE INDEX "asset_libraries_userId_createdAt_idx" ON "asset_libraries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "asset_libraries_userId_category_idx" ON "asset_libraries"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "asset_libraries_userId_name_category_key" ON "asset_libraries"("userId", "name", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_provider_modelId_key" ON "ai_models"("provider", "modelId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_roles_agentId_name_key" ON "agent_roles"("agentId", "name");

-- CreateIndex
CREATE INDEX "usage_records_userId_idx" ON "usage_records"("userId");

-- CreateIndex
CREATE INDEX "usage_records_modelId_idx" ON "usage_records"("modelId");

-- CreateIndex
CREATE INDEX "usage_records_createdAt_idx" ON "usage_records"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "generation_tasks_userId_idx" ON "generation_tasks"("userId");

-- CreateIndex
CREATE INDEX "generation_tasks_status_idx" ON "generation_tasks"("status");

-- CreateIndex
CREATE INDEX "generation_tasks_createdAt_idx" ON "generation_tasks"("createdAt");

-- CreateIndex
CREATE INDEX "generation_tasks_sourceNodeId_idx" ON "generation_tasks"("sourceNodeId");

-- CreateIndex
CREATE INDEX "generation_tasks_externalTaskId_idx" ON "generation_tasks"("externalTaskId");

-- CreateIndex
CREATE UNIQUE INDEX "model_capabilities_aiModelId_capability_key" ON "model_capabilities"("aiModelId", "capability");

-- CreateIndex
CREATE INDEX "asset_library_shares_targetUserId_idx" ON "asset_library_shares"("targetUserId");

-- CreateIndex
CREATE INDEX "workflow_shares_targetUserId_idx" ON "workflow_shares"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_shares_workflowId_targetUserId_key" ON "workflow_shares"("workflowId", "targetUserId");

-- CreateIndex
CREATE INDEX "project_shares_targetUserId_idx" ON "project_shares"("targetUserId");

-- CreateIndex
CREATE UNIQUE INDEX "project_shares_projectId_targetUserId_key" ON "project_shares"("projectId", "targetUserId");

-- CreateIndex
CREATE INDEX "episode_permissions_userId_idx" ON "episode_permissions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "episode_permissions_episodeId_userId_key" ON "episode_permissions"("episodeId", "userId");

-- CreateIndex
CREATE INDEX "billing_rules_billingType_idx" ON "billing_rules"("billingType");

-- CreateIndex
CREATE INDEX "billing_rules_isActive_idx" ON "billing_rules"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "billing_rules_aiModelId_nodeType_moduleType_key" ON "billing_rules"("aiModelId", "nodeType", "moduleType");

-- CreateIndex
CREATE INDEX "billing_prices_billingRuleId_idx" ON "billing_prices"("billingRuleId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_prices_billingRuleId_dimension_value_key" ON "billing_prices"("billingRuleId", "dimension", "value");

-- CreateIndex
CREATE INDEX "sora_characters_userId_idx" ON "sora_characters"("userId");

-- CreateIndex
CREATE INDEX "sora_characters_userId_customName_idx" ON "sora_characters"("userId", "customName");

-- CreateIndex
CREATE INDEX "sora_characters_characterName_idx" ON "sora_characters"("characterName");

-- CreateIndex
CREATE UNIQUE INDEX "sora_characters_userId_customName_key" ON "sora_characters"("userId", "customName");

-- CreateIndex
CREATE UNIQUE INDEX "payment_configs_provider_key" ON "payment_configs"("provider");

-- CreateIndex
CREATE INDEX "credit_packages_isActive_sortOrder_idx" ON "credit_packages"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "payment_orders_orderNo_key" ON "payment_orders"("orderNo");

-- CreateIndex
CREATE INDEX "payment_orders_userId_idx" ON "payment_orders"("userId");

-- CreateIndex
CREATE INDEX "payment_orders_status_idx" ON "payment_orders"("status");

-- CreateIndex
CREATE INDEX "payment_orders_orderNo_idx" ON "payment_orders"("orderNo");

-- CreateIndex
CREATE INDEX "payment_orders_createdAt_idx" ON "payment_orders"("createdAt");

-- CreateIndex
CREATE INDEX "credit_transactions_userId_idx" ON "credit_transactions"("userId");

-- CreateIndex
CREATE INDEX "credit_transactions_type_idx" ON "credit_transactions"("type");

-- CreateIndex
CREATE INDEX "credit_transactions_createdAt_idx" ON "credit_transactions"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "redeem_codes_code_key" ON "redeem_codes"("code");

-- CreateIndex
CREATE INDEX "redeem_codes_code_idx" ON "redeem_codes"("code");

-- CreateIndex
CREATE INDEX "redeem_codes_isUsed_idx" ON "redeem_codes"("isUsed");

-- CreateIndex
CREATE INDEX "redeem_codes_batchId_idx" ON "redeem_codes"("batchId");

-- CreateIndex
CREATE INDEX "redeem_codes_createdAt_idx" ON "redeem_codes"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_level_configs_userRole_key" ON "user_level_configs"("userRole");

-- CreateIndex
CREATE INDEX "model_permissions_userRole_idx" ON "model_permissions"("userRole");

-- CreateIndex
CREATE INDEX "model_permissions_aiModelId_idx" ON "model_permissions"("aiModelId");

-- CreateIndex
CREATE INDEX "model_permissions_nodeType_idx" ON "model_permissions"("nodeType");

-- CreateIndex
CREATE INDEX "model_permissions_moduleType_idx" ON "model_permissions"("moduleType");

-- CreateIndex
CREATE UNIQUE INDEX "model_permissions_aiModelId_nodeType_moduleType_userRole_key" ON "model_permissions"("aiModelId", "nodeType", "moduleType", "userRole");

-- CreateIndex
CREATE INDEX "daily_usage_records_userId_date_idx" ON "daily_usage_records"("userId", "date");

-- CreateIndex
CREATE INDEX "daily_usage_records_aiModelId_idx" ON "daily_usage_records"("aiModelId");

-- CreateIndex
CREATE UNIQUE INDEX "daily_usage_records_userId_date_aiModelId_nodeType_moduleTy_key" ON "daily_usage_records"("userId", "date", "aiModelId", "nodeType", "moduleType");

-- CreateIndex
CREATE INDEX "gift_credits_records_userId_date_idx" ON "gift_credits_records"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "gift_credits_records_userId_date_key" ON "gift_credits_records"("userId", "date");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nodes" ADD CONSTRAINT "nodes_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_assetLibraryId_fkey" FOREIGN KEY ("assetLibraryId") REFERENCES "asset_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_libraries" ADD CONSTRAINT "asset_libraries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_roles" ADD CONSTRAINT "agent_roles_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_roles" ADD CONSTRAINT "agent_roles_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_billingRuleId_fkey" FOREIGN KEY ("billingRuleId") REFERENCES "billing_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_capabilities" ADD CONSTRAINT "model_capabilities_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "ai_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_library_shares" ADD CONSTRAINT "asset_library_shares_assetLibraryId_fkey" FOREIGN KEY ("assetLibraryId") REFERENCES "asset_libraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_library_shares" ADD CONSTRAINT "asset_library_shares_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_library_shares" ADD CONSTRAINT "asset_library_shares_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_shares" ADD CONSTRAINT "workflow_shares_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "episode_permissions" ADD CONSTRAINT "episode_permissions_episodeId_fkey" FOREIGN KEY ("episodeId") REFERENCES "episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_rules" ADD CONSTRAINT "billing_rules_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "ai_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_prices" ADD CONSTRAINT "billing_prices_billingRuleId_fkey" FOREIGN KEY ("billingRuleId") REFERENCES "billing_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "credit_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "payment_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redeem_codes" ADD CONSTRAINT "redeem_codes_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redeem_codes" ADD CONSTRAINT "redeem_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_permissions" ADD CONSTRAINT "model_permissions_aiModelId_fkey" FOREIGN KEY ("aiModelId") REFERENCES "ai_models"("id") ON DELETE CASCADE ON UPDATE CASCADE;
