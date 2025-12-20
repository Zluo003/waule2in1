"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nodePromptService = void 0;
const index_1 = require("../index");
class NodePromptService {
    /**
     * 获取所有节点提示词模板
     */
    async getAll(includeInactive = false) {
        const where = includeInactive ? {} : { isActive: true };
        return index_1.prisma.nodePromptTemplate.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });
    }
    /**
     * 根据节点类型获取提示词模板
     */
    async getByNodeType(nodeType) {
        return index_1.prisma.nodePromptTemplate.findUnique({
            where: { nodeType },
        });
    }
    /**
     * 根据ID获取提示词模板
     */
    async getById(id) {
        return index_1.prisma.nodePromptTemplate.findUnique({
            where: { id },
        });
    }
    /**
     * 创建节点提示词模板
     */
    async create(input) {
        // 检查 nodeType 是否已存在
        const existing = await index_1.prisma.nodePromptTemplate.findUnique({
            where: { nodeType: input.nodeType },
        });
        if (existing) {
            throw new Error(`节点类型 "${input.nodeType}" 的提示词模板已存在`);
        }
        return index_1.prisma.nodePromptTemplate.create({
            data: {
                nodeType: input.nodeType,
                name: input.name,
                description: input.description,
                systemPrompt: input.systemPrompt,
                userPromptTemplate: input.userPromptTemplate,
                enhancePromptTemplate: input.enhancePromptTemplate,
                variables: input.variables || [],
                isActive: input.isActive ?? true,
            },
        });
    }
    /**
     * 更新节点提示词模板
     */
    async update(id, input) {
        const existing = await index_1.prisma.nodePromptTemplate.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new Error('提示词模板不存在');
        }
        return index_1.prisma.nodePromptTemplate.update({
            where: { id },
            data: {
                ...(input.name !== undefined && { name: input.name }),
                ...(input.description !== undefined && { description: input.description }),
                ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
                ...(input.userPromptTemplate !== undefined && { userPromptTemplate: input.userPromptTemplate }),
                ...(input.enhancePromptTemplate !== undefined && { enhancePromptTemplate: input.enhancePromptTemplate }),
                ...(input.variables !== undefined && { variables: input.variables }),
                ...(input.isActive !== undefined && { isActive: input.isActive }),
            },
        });
    }
    /**
     * 删除节点提示词模板
     */
    async delete(id) {
        const existing = await index_1.prisma.nodePromptTemplate.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new Error('提示词模板不存在');
        }
        return index_1.prisma.nodePromptTemplate.delete({
            where: { id },
        });
    }
    /**
     * 切换节点提示词模板启用状态
     */
    async toggleActive(id) {
        const existing = await index_1.prisma.nodePromptTemplate.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new Error('提示词模板不存在');
        }
        return index_1.prisma.nodePromptTemplate.update({
            where: { id },
            data: { isActive: !existing.isActive },
        });
    }
    /**
     * 渲染提示词模板（替换变量）
     */
    renderTemplate(template, variables) {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
            result = result.replace(regex, String(value));
        }
        return result;
    }
    /**
     * 获取高清放大节点的默认提示词模板
     */
    getHDUpscaleDefaults() {
        return {
            nodeType: 'hdUpscale',
            name: '高清放大节点',
            description: '将图片进行高清放大，保持原有画面内容不变',
            userPromptTemplate: '将这张图片进行高清放大，保持原有的画面内容、构图和风格不变，提升图片的清晰度和细节',
            isActive: true,
        };
    }
    /**
     * 获取智能溶图节点的默认提示词模板
     */
    getImageFusionDefaults() {
        return {
            nodeType: 'imageFusion',
            name: '智能溶图节点',
            description: '将多张参考图片（角色、场景、风格）融合生成新的画面',
            systemPrompt: '你是一个专业的AI图片生成助手，擅长将多张参考图片融合成一张新的画面。你需要理解用户的创意描述，结合提供的角色图、场景图和风格图，生成高质量的融合图片。',
            userPromptTemplate: '{{userInput}}',
            enhancePromptTemplate: '基于用户的描述"{{userInput}}"，请生成一张融合了所有参考图片元素的高质量图片。保持角色的外观特征，参考场景的构图，并应用风格图的色调和艺术风格。',
            variables: [
                { name: 'userInput', desc: '用户输入的场景描述', example: '一个女孩在森林中漫步' },
            ],
            isActive: true,
        };
    }
    /**
     * 获取智能分镜节点的默认提示词模板
     */
    getSmartStoryboardDefaults() {
        return {
            nodeType: 'smartStoryboard',
            name: '智能分镜节点',
            description: '根据参考图片和剧情简述，自动生成3x3九宫格分镜图',
            systemPrompt: '你是一个专业的分镜师，根据用户提供的图片和剧情简述，生成详细的9个分镜描述。每个分镜应包含场景、动作、镜头角度等信息。',
            userPromptTemplate: '{{userInput}}',
            enhancePromptTemplate: '根据以下分镜描述和参考图片，生成3x3的九宫格分镜图，每个格子展示一个分镜场景，保持角色和风格一致，使用细黑边框分隔每个画面。',
            variables: [
                { name: 'userInput', desc: '用户输入的剧情简述', example: '小明走进森林，发现一只小鹿，然后和小鹿成为朋友' },
            ],
            isActive: true,
        };
    }
}
exports.nodePromptService = new NodePromptService();
//# sourceMappingURL=node-prompt.service.js.map