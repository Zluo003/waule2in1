"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRoleController = void 0;
const index_1 = require("../index");
const waule_api_client_1 = require("../services/waule-api.client");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const axios_1 = __importDefault(require("axios"));
// 提取文档文本内容（走远程服务时需要先提取）
async function extractDocumentText(doc) {
    try {
        let fileBuffer = null;
        const fullPath = path.join(process.cwd(), doc.filePath);
        if (fs.existsSync(fullPath)) {
            fileBuffer = fs.readFileSync(fullPath);
        }
        else if (doc.filePath.startsWith('http://') || doc.filePath.startsWith('https://')) {
            const resp = await axios_1.default.get(doc.filePath, { responseType: 'arraybuffer' });
            fileBuffer = Buffer.from(resp.data);
        }
        if (!fileBuffer)
            return '';
        const mime = (doc.mimeType || '').toLowerCase();
        if (mime === 'application/pdf') {
            const pdfParse = (await Promise.resolve().then(() => __importStar(require('pdf-parse')))).default;
            const pdfData = await pdfParse(fileBuffer);
            return String(pdfData?.text || '');
        }
        else if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const mammoth = await Promise.resolve().then(() => __importStar(require('mammoth')));
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            return String(result?.value || '');
        }
        else if (mime.startsWith('text/')) {
            return fileBuffer.toString('utf8');
        }
        return '';
    }
    catch (e) {
        console.error('[extractDocumentText] 提取文档失败:', e);
        return '';
    }
}
class AgentRoleController {
    async list(req, res) {
        try {
            const roles = await index_1.prisma.agentRole.findMany({
                include: {
                    aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
                    agent: { select: { id: true, name: true } },
                },
                orderBy: { createdAt: 'desc' },
            });
            res.json(roles);
        }
        catch (e) {
            res.status(500).json({ error: 'Failed to fetch roles' });
        }
    }
    async listByAgent(req, res) {
        try {
            const { agentId } = req.params;
            const roles = await index_1.prisma.agentRole.findMany({
                where: { agentId },
                include: {
                    aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
                },
                orderBy: { order: 'asc' },
            });
            res.json(roles);
        }
        catch (e) {
            res.status(500).json({ error: 'Failed to fetch roles by agent' });
        }
    }
    async getById(req, res) {
        try {
            const { id } = req.params;
            const role = await index_1.prisma.agentRole.findUnique({
                where: { id },
                include: {
                    aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
                    agent: { select: { id: true, name: true } },
                },
            });
            if (!role)
                return res.status(404).json({ error: 'Role not found' });
            res.json(role);
        }
        catch (e) {
            res.status(500).json({ error: 'Failed to fetch role' });
        }
    }
    async create(req, res) {
        try {
            const { agentId, name, description, systemPrompt, aiModelId, temperature, maxTokens, isActive, order } = req.body;
            if (!agentId || !name || !systemPrompt || !aiModelId) {
                return res.status(400).json({ error: 'agentId, name, systemPrompt, aiModelId are required' });
            }
            const agent = await index_1.prisma.agent.findUnique({ where: { id: agentId } });
            if (!agent)
                return res.status(404).json({ error: 'Agent not found' });
            const aiModel = await index_1.prisma.aIModel.findUnique({ where: { id: aiModelId } });
            if (!aiModel)
                return res.status(404).json({ error: 'AI model not found' });
            if (aiModel.type !== 'TEXT_GENERATION')
                return res.status(400).json({ error: 'AI model must be TEXT_GENERATION' });
            const role = await index_1.prisma.agentRole.create({
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
        }
        catch (e) {
            res.status(500).json({ error: 'Failed to create role' });
        }
    }
    async update(req, res) {
        try {
            const { id } = req.params;
            const { name, description, systemPrompt, aiModelId, temperature, maxTokens, isActive, order } = req.body;
            const existing = await index_1.prisma.agentRole.findUnique({ where: { id } });
            if (!existing)
                return res.status(404).json({ error: 'Role not found' });
            if (aiModelId && aiModelId !== existing.aiModelId) {
                const aiModel = await index_1.prisma.aIModel.findUnique({ where: { id: aiModelId } });
                if (!aiModel)
                    return res.status(404).json({ error: 'AI model not found' });
                if (aiModel.type !== 'TEXT_GENERATION')
                    return res.status(400).json({ error: 'AI model must be TEXT_GENERATION' });
            }
            const role = await index_1.prisma.agentRole.update({
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
        }
        catch (e) {
            res.status(500).json({ error: 'Failed to update role' });
        }
    }
    async delete(req, res) {
        try {
            const { id } = req.params;
            const existing = await index_1.prisma.agentRole.findUnique({ where: { id } });
            if (!existing)
                return res.status(404).json({ error: 'Role not found' });
            await index_1.prisma.agentRole.delete({ where: { id } });
            res.json({ message: 'Role deleted successfully' });
        }
        catch (e) {
            res.status(500).json({ error: 'Failed to delete role' });
        }
    }
    // 执行智能体角色（文本生成）
    async executeRole(req, res) {
        try {
            const { id } = req.params;
            console.log('[AgentRole.executeRole] 开始执行, roleId:', id);
            const { prompt, systemPrompt, temperature, maxTokens, documentFiles, imageUrls, videoUrls } = req.body || {};
            if (!prompt)
                return res.status(400).json({ error: 'prompt 是必需的' });
            const role = await index_1.prisma.agentRole.findUnique({
                where: { id },
                include: {
                    aiModel: { select: { id: true, name: true, provider: true, modelId: true, apiKey: true, apiUrl: true, isActive: true, type: true, pricePerUse: true } },
                    agent: { select: { id: true, name: true, isActive: true } },
                },
            });
            if (!role)
                return res.status(404).json({ error: 'Role not found' });
            const model = role.aiModel;
            console.log('[AgentRole.executeRole] 模型信息:', { name: model?.name, provider: model?.provider, modelId: model?.modelId, type: model?.type, isActive: model?.isActive });
            if (!model)
                return res.status(404).json({ error: 'AI model not found' });
            if (!model.isActive)
                return res.status(400).json({ error: '模型未启用' });
            if (model.type !== 'TEXT_GENERATION')
                return res.status(400).json({ error: '该模型不支持文本生成' });
            const mergedSystemPromptRaw = [role.systemPrompt || '', systemPrompt || ''].filter(Boolean).join('\n\n');
            const trim = (s, max) => (s || '').length > max ? (s || '').slice(0, max) : (s || '');
            // 控制输入长度，避免模型拒绝或超限
            const mergedSystemPrompt = trim(mergedSystemPromptRaw, 8000);
            let promptTrimmed = trim(String(prompt), 12000);
            // 提取文档内容并追加到 prompt（走远程服务时，远程无法访问本地文件）
            if (documentFiles && documentFiles.length > 0) {
                console.log('[AgentRole.executeRole] 提取文档内容:', documentFiles.length, '个文件');
                const docTexts = [];
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
            let text;
            try {
                // 优先使用 waule-api 网关（与 ai.controller 保持一致）
                const wauleApiClient = (0, waule_api_client_1.getWauleApiClient)(model);
                if (wauleApiClient) {
                    console.log('[AgentRole.executeRole] 使用 waule-api 网关');
                    const messages = [];
                    if (mergedSystemPrompt)
                        messages.push({ role: 'system', content: mergedSystemPrompt });
                    const userContent = [{ type: 'text', text: promptTrimmed }];
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
                    if (!content)
                        throw new Error('WauleAPI 未返回文本内容');
                    text = content;
                }
                // 如果 waule-api 未配置，使用直接调用
                if (!text) {
                    switch ((model.provider || '').toLowerCase()) {
                        case 'google': {
                            const geminiService = (await Promise.resolve().then(() => __importStar(require('../services/ai/gemini-proxy.service')))).default;
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
                            const { generateText } = await Promise.resolve().then(() => __importStar(require('../services/ai/doubao.service')));
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
            }
            catch (err) {
                return res.status(500).json({ error: `文本生成失败: ${err?.message || '未知错误'}` });
            }
            await index_1.prisma.usageRecord.create({
                data: {
                    userId: req.user.id,
                    modelId: model.id,
                    operation: 'TEXT_GENERATION',
                    cost: model.pricePerUse || 0,
                    metadata: { prompt: String(prompt).substring(0, 100), provider: model.provider },
                },
            });
            res.json({ success: true, data: { text, model: model.name } });
        }
        catch (e) {
            console.error('[AgentRole.executeRole] 执行失败:', e);
            res.status(500).json({ error: `执行智能体角色失败: ${e?.message || '未知错误'}` });
        }
    }
}
exports.AgentRoleController = AgentRoleController;
//# sourceMappingURL=agent-role.controller.js.map