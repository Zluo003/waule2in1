import { Request, Response } from 'express';
import { prisma } from '../index';

export class AgentRoleController {
  async list(req: Request, res: Response) {
    try {
      const roles = await prisma.agentRole.findMany({
        include: {
          aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
          agent: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json(roles);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to fetch roles' });
    }
  }

  async listByAgent(req: Request, res: Response) {
    try {
      const { agentId } = req.params;
      const roles = await prisma.agentRole.findMany({
        where: { agentId },
        include: {
          aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
        },
        orderBy: { order: 'asc' },
      });
      res.json(roles);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to fetch roles by agent' });
    }
  }

  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const role = await prisma.agentRole.findUnique({
        where: { id },
        include: {
          aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
          agent: { select: { id: true, name: true } },
        },
      });
      if (!role) return res.status(404).json({ error: 'Role not found' });
      res.json(role);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to fetch role' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const { agentId, name, description, systemPrompt, aiModelId, temperature, maxTokens, isActive, order } = req.body;
      if (!agentId || !name || !systemPrompt || !aiModelId) {
        return res.status(400).json({ error: 'agentId, name, systemPrompt, aiModelId are required' });
      }
      const agent = await prisma.agent.findUnique({ where: { id: agentId } });
      if (!agent) return res.status(404).json({ error: 'Agent not found' });
      const aiModel = await prisma.aIModel.findUnique({ where: { id: aiModelId } });
      if (!aiModel) return res.status(404).json({ error: 'AI model not found' });
      if (aiModel.type !== 'TEXT_GENERATION') return res.status(400).json({ error: 'AI model must be TEXT_GENERATION' });

      const role = await prisma.agentRole.create({
        data: {
          agentId,
          name,
          description,
          systemPrompt,
          aiModelId,
          temperature: temperature ?? 0.7,
          maxTokens: maxTokens ?? 2000,
          isActive: isActive ?? true,
          order: order ?? 0,
        },
        include: {
          aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
          agent: { select: { id: true, name: true } },
        },
      });
      res.status(201).json(role);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to create role' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, systemPrompt, aiModelId, temperature, maxTokens, isActive, order } = req.body;
      const existing = await prisma.agentRole.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Role not found' });
      if (aiModelId && aiModelId !== existing.aiModelId) {
        const aiModel = await prisma.aIModel.findUnique({ where: { id: aiModelId } });
        if (!aiModel) return res.status(404).json({ error: 'AI model not found' });
        if (aiModel.type !== 'TEXT_GENERATION') return res.status(400).json({ error: 'AI model must be TEXT_GENERATION' });
      }
      const role = await prisma.agentRole.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
          ...(systemPrompt !== undefined && { systemPrompt }),
          ...(aiModelId !== undefined && { aiModelId }),
          ...(temperature !== undefined && { temperature }),
          ...(maxTokens !== undefined && { maxTokens }),
          ...(isActive !== undefined && { isActive }),
          ...(order !== undefined && { order }),
        },
        include: {
          aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
          agent: { select: { id: true, name: true } },
        },
      });
      res.json(role);
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to update role' });
    }
  }

  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const existing = await prisma.agentRole.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ error: 'Role not found' });
      await prisma.agentRole.delete({ where: { id } });
      res.json({ message: 'Role deleted successfully' });
    } catch (e: any) {
      res.status(500).json({ error: 'Failed to delete role' });
    }
  }

  // 执行智能体角色（文本生成）
  async executeRole(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { prompt, systemPrompt, temperature, maxTokens, documentFiles, imageUrls, videoUrls } = req.body || {};
      if (!prompt) return res.status(400).json({ error: 'prompt 是必需的' });

      const role = await prisma.agentRole.findUnique({
        where: { id },
        include: {
          aiModel: { select: { id: true, name: true, provider: true, modelId: true, apiKey: true, apiUrl: true, isActive: true, type: true, pricePerUse: true } },
          agent: { select: { id: true, name: true, isActive: true } },
        },
      });
      if (!role) return res.status(404).json({ error: 'Role not found' });
      const model = role.aiModel;
      if (!model) return res.status(404).json({ error: 'AI model not found' });
      if (!model.isActive) return res.status(400).json({ error: '模型未启用' });
      if (model.type !== 'TEXT_GENERATION') return res.status(400).json({ error: '该模型不支持文本生成' });

      const mergedSystemPromptRaw = [role.systemPrompt || '', systemPrompt || ''].filter(Boolean).join('\n\n');
      const trim = (s: string, max: number) => (s || '').length > max ? (s || '').slice(0, max) : (s || '');
      // 控制输入长度，避免模型拒绝或超限
      const mergedSystemPrompt = trim(mergedSystemPromptRaw, 8000);
      const promptTrimmed = trim(String(prompt), 12000);

      let text: string;
      try {
        switch ((model.provider || '').toLowerCase()) {
          case 'google': {
            const { generateText } = await import('../services/ai/gemini.service');
            text = await generateText({
              prompt: promptTrimmed,
              systemPrompt: mergedSystemPrompt,
              modelId: model.modelId,
              temperature: temperature ?? role.temperature ?? 0,
              maxTokens: maxTokens ?? role.maxTokens ?? 2000,
              documentFiles,
              imageUrls,
              videoUrls,
              apiKey: model.apiKey || undefined,
              apiUrl: model.apiUrl || undefined,
            });
            break;
          }
          case 'bytedance':
          case 'doubao': {
            const { generateText } = await import('../services/ai/doubao.service');
            text = await generateText({
              prompt: promptTrimmed,
              systemPrompt: mergedSystemPrompt,
              modelId: model.modelId,
              temperature: temperature ?? role.temperature ?? 0,
              maxTokens: maxTokens ?? role.maxTokens ?? 2000,
              imageUrls,
              videoUrls,
              apiKey: model.apiKey || undefined,
              apiUrl: model.apiUrl || undefined,
            });
            break;
          }
          default:
            return res.status(400).json({ error: `不支持的提供商: ${model.provider}` });
        }
        // 若返回空文本，尝试仅用JSON约束再次请求
        if (!text || !String(text).trim()) {
          const jsonConstraint = '请严格输出符合以下结构的JSON，不要包含多余文字：{"locale":"zh-CN","acts":[{"actIndex":1,"shots":[{"shotIndex":1,"画面":"...","景别/镜头":"...","内容/动作":"...","声音/对话":"...","时长":"6s","提示词":"...","media":{"type":"video","aspectRatio":"16:9","orientation":"horizontal"}}]}]}]}'
          const fallbackSystem = jsonConstraint;
          switch ((model.provider || '').toLowerCase()) {
            case 'google': {
              const { generateText } = await import('../services/ai/gemini.service');
              text = await generateText({
                prompt: promptTrimmed,
                systemPrompt: fallbackSystem,
                modelId: model.modelId,
                temperature: 0,
                maxTokens: maxTokens ?? role.maxTokens ?? 2000,
                apiKey: model.apiKey || undefined,
                apiUrl: model.apiUrl || undefined,
              });
              break;
            }
            case 'bytedance':
            case 'doubao': {
              const { generateText } = await import('../services/ai/doubao.service');
              text = await generateText({
                prompt: promptTrimmed,
                systemPrompt: fallbackSystem,
                modelId: model.modelId,
                temperature: 0,
                maxTokens: maxTokens ?? role.maxTokens ?? 2000,
                apiKey: model.apiKey || undefined,
                apiUrl: model.apiUrl || undefined,
              });
              break;
            }
          }
        }
      } catch (err: any) {
        return res.status(500).json({ error: `文本生成失败: ${err?.message || '未知错误'}` });
      }

      await prisma.usageRecord.create({
        data: {
          userId: (req as any).user!.id,
          modelId: model.id,
          operation: 'TEXT_GENERATION',
          cost: model.pricePerUse || 0,
          metadata: { prompt: String(prompt).substring(0, 100), provider: model.provider },
        },
      });

      res.json({ success: true, data: { text, model: model.name } });
    } catch (e: any) {
      res.status(500).json({ error: '执行智能体角色失败' });
    }
  }
}