import { Request, Response } from 'express';
import { prisma, redis } from '../index';
import { getWauleApiClient } from '../services/waule-api.client';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

// 提取文档文本内容（走远程服务时需要先提取）
async function extractDocumentText(doc: { filePath: string; mimeType: string }): Promise<string> {
  try {
    let fileBuffer: Buffer | null = null;
    const fullPath = path.join(process.cwd(), doc.filePath);
    
    if (fs.existsSync(fullPath)) {
      fileBuffer = fs.readFileSync(fullPath);
    } else if (doc.filePath.startsWith('http://') || doc.filePath.startsWith('https://')) {
      const resp = await axios.get(doc.filePath, { responseType: 'arraybuffer' });
      fileBuffer = Buffer.from(resp.data);
    }

    if (!fileBuffer) return '';

    const mime = (doc.mimeType || '').toLowerCase();
    if (mime === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default as any;
      const pdfData = await pdfParse(fileBuffer);
      return String(pdfData?.text || '');
    } else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return String(result?.value || '');
    } else if (mime.startsWith('text/')) {
      return fileBuffer.toString('utf8');
    }
    return '';
  } catch (e) {
    console.error('[extractDocumentText] 提取文档失败:', e);
    return '';
  }
}

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
      console.log('[AgentRole.executeRole] 开始执行, roleId:', id);
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
      console.log('[AgentRole.executeRole] 模型信息:', { name: model?.name, provider: model?.provider, modelId: model?.modelId, type: model?.type, isActive: model?.isActive });
      if (!model) return res.status(404).json({ error: 'AI model not found' });
      if (!model.isActive) return res.status(400).json({ error: '模型未启用' });
      if (model.type !== 'TEXT_GENERATION') return res.status(400).json({ error: '该模型不支持文本生成' });

      const mergedSystemPromptRaw = [role.systemPrompt || '', systemPrompt || ''].filter(Boolean).join('\n\n');
      const trim = (s: string, max: number) => (s || '').length > max ? (s || '').slice(0, max) : (s || '');
      // 控制输入长度，避免模型拒绝或超限
      const mergedSystemPrompt = trim(mergedSystemPromptRaw, 8000);
      let promptTrimmed = trim(String(prompt), 12000);

      // 提取文档内容并追加到 prompt（走远程服务时，远程无法访问本地文件）
      if (documentFiles && documentFiles.length > 0) {
        console.log('[AgentRole.executeRole] 提取文档内容:', documentFiles.length, '个文件');
        const docTexts: string[] = [];
        for (const doc of documentFiles) {
          const docText = await extractDocumentText(doc);
          if (docText && docText.trim()) {
            console.log('[AgentRole.executeRole] 文档提取成功, 长度:', docText.length);
            docTexts.push(docText);
          }
        }
        if (docTexts.length > 0) {
          promptTrimmed = `${promptTrimmed}\n\n【文档内容】\n${docTexts.join('\n\n')}`;
        }
      }

      let text: string | undefined;
      try {
        // 优先使用 waule-api 网关（与 ai.controller 保持一致）
        const wauleApiClient = getWauleApiClient(model);
        if (wauleApiClient) {
          console.log('[AgentRole.executeRole] 使用 waule-api 网关');
          const messages: Array<{ role: string; content: any }> = [];
          if (mergedSystemPrompt) messages.push({ role: 'system', content: mergedSystemPrompt });
          const userContent: any[] = [{ type: 'text', text: promptTrimmed }];
          for (const url of (imageUrls || [])) {
            userContent.push({ type: 'image_url', image_url: { url } });
          }
          for (const url of (videoUrls || [])) {
            userContent.push({ type: 'video_url', video_url: { url } });
          }
          messages.push({ role: 'user', content: userContent });

          const r = await wauleApiClient.chatCompletions({
            model: model.modelId,
            messages,
            temperature: temperature ?? role.temperature ?? 0,
            max_tokens: maxTokens ?? role.maxTokens ?? 2000,
          });
          const content = r?.choices?.[0]?.message?.content;
          if (!content) throw new Error('WauleAPI 未返回文本内容');
          text = content;
        }

        // 如果 waule-api 未配置，使用直接调用
        if (!text) {
          switch ((model.provider || '').toLowerCase()) {
            case 'google': {
              const geminiService = (await import('../services/ai/gemini-proxy.service')).default;
              text = await geminiService.generateText({
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
      console.error('[AgentRole.executeRole] 执行失败:', e);
      res.status(500).json({ error: `执行智能体角色失败: ${e?.message || '未知错误'}` });
    }
  }
}