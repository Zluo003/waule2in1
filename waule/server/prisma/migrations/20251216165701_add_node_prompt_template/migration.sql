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
CREATE UNIQUE INDEX "node_prompt_templates_nodeType_key" ON "node_prompt_templates"("nodeType");

-- CreateIndex
CREATE INDEX "node_prompt_templates_nodeType_idx" ON "node_prompt_templates"("nodeType");

-- CreateIndex
CREATE INDEX "node_prompt_templates_isActive_idx" ON "node_prompt_templates"("isActive");
