"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentController = void 0;
const index_1 = require("../index");
class AgentController {
    // 获取所有智能体
    async getAll(req, res) {
        try {
            // 🚀 尝试从缓存获取
            const cacheKey = 'agents:list';
            try {
                const cached = await index_1.redis.get(cacheKey);
                if (cached) {
                    return res.json(JSON.parse(cached));
                }
            }
            catch { }
            const agents = await index_1.prisma.agent.findMany({
                include: {
                    roles: {
                        include: {
                            aiModel: {
                                select: { id: true, name: true, provider: true, modelId: true },
                            },
                        },
                        orderBy: { order: 'asc' },
                    },
                },
                orderBy: {
                    createdAt: 'desc',
                },
            });
            // 🚀 缓存 5 分钟
            try {
                await index_1.redis.set(cacheKey, JSON.stringify(agents), 'EX', 300);
            }
            catch { }
            res.json(agents);
        }
        catch (error) {
            console.error('Failed to fetch agents:', error);
            res.status(500).json({ error: 'Failed to fetch agents' });
        }
    }
    // 获取单个智能体
    async getById(req, res) {
        try {
            const { id } = req.params;
            const agent = await index_1.prisma.agent.findUnique({
                where: { id },
                include: {
                    roles: {
                        include: {
                            aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
                        },
                        orderBy: { order: 'asc' },
                    },
                },
            });
            if (!agent) {
                return res.status(404).json({ error: 'Agent not found' });
            }
            res.json(agent);
        }
        catch (error) {
            console.error('Failed to fetch agent:', error);
            res.status(500).json({ error: 'Failed to fetch agent' });
        }
    }
    // 创建智能体
    async create(req, res) {
        try {
            const { name, description, usageScene, isActive } = req.body;
            if (!name) {
                return res.status(400).json({ error: 'Name is required' });
            }
            const agent = await index_1.prisma.agent.create({
                data: {
                    name,
                    description,
                    usageScene: usageScene || 'workflow',
                    isActive: isActive ?? true,
                },
                include: {
                    roles: {
                        include: {
                            aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });
            // 清除缓存
            try {
                await index_1.redis.del('agents:list');
            }
            catch { }
            res.status(201).json(agent);
        }
        catch (error) {
            console.error('Failed to create agent:', error);
            res.status(500).json({ error: 'Failed to create agent' });
        }
    }
    // 更新智能体
    async update(req, res) {
        try {
            const { id } = req.params;
            const { name, description, usageScene, isActive } = req.body;
            // 验证智能体是否存在
            const existingAgent = await index_1.prisma.agent.findUnique({
                where: { id },
            });
            if (!existingAgent) {
                return res.status(404).json({ error: 'Agent not found' });
            }
            const agent = await index_1.prisma.agent.update({
                where: { id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(description !== undefined && { description }),
                    ...(usageScene !== undefined && { usageScene }),
                    ...(isActive !== undefined && { isActive }),
                },
                include: {
                    roles: {
                        include: {
                            aiModel: { select: { id: true, name: true, provider: true, modelId: true } },
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                },
            });
            // 清除缓存
            try {
                await index_1.redis.del('agents:list');
            }
            catch { }
            res.json(agent);
        }
        catch (error) {
            console.error('Failed to update agent:', error);
            res.status(500).json({ error: 'Failed to update agent' });
        }
    }
    // 删除智能体
    async delete(req, res) {
        try {
            const { id } = req.params;
            // 验证智能体是否存在
            const existingAgent = await index_1.prisma.agent.findUnique({
                where: { id },
            });
            if (!existingAgent) {
                return res.status(404).json({ error: 'Agent not found' });
            }
            await index_1.prisma.agent.delete({
                where: { id },
            });
            // 清除缓存
            try {
                await index_1.redis.del('agents:list');
            }
            catch { }
            res.json({ message: 'Agent deleted successfully' });
        }
        catch (error) {
            console.error('Failed to delete agent:', error);
            res.status(500).json({ error: 'Failed to delete agent' });
        }
    }
    // 获取可用的文本生成模型
    async getAvailableModels(req, res) {
        try {
            const models = await index_1.prisma.aIModel.findMany({
                where: {
                    type: 'TEXT_GENERATION',
                    isActive: true,
                },
                select: {
                    id: true,
                    name: true,
                    provider: true,
                    modelId: true,
                },
                orderBy: {
                    name: 'asc',
                },
            });
            res.json(models);
        }
        catch (error) {
            console.error('Failed to fetch available models:', error);
            res.status(500).json({ error: 'Failed to fetch available models' });
        }
    }
}
exports.AgentController = AgentController;
//# sourceMappingURL=agent.controller.js.map