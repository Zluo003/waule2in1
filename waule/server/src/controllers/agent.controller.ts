import { Request, Response } from 'express';
import { prisma, redis } from '../index';

export class AgentController {
  // 获取所有智能体
  async getAll(req: Request, res: Response) {
    try {
      // 🚀 尝试从缓存获取
      const cacheKey = 'agents:list';
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          return res.json(JSON.parse(cached));
        }
      } catch {}

      const agents = await prisma.agent.findMany({
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
      try { await redis.set(cacheKey, JSON.stringify(agents), 'EX', 300); } catch {}

      res.json(agents);
    } catch (error: any) {
      console.error('Failed to fetch agents:', error);
      res.status(500).json({ error: 'Failed to fetch agents' });
    }
  }

  // 获取单个智能体
  async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const agent = await prisma.agent.findUnique({
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
    } catch (error: any) {
      console.error('Failed to fetch agent:', error);
      res.status(500).json({ error: 'Failed to fetch agent' });
    }
  }

  // 创建智能体
  async create(req: Request, res: Response) {
    try {
      const { name, description, isActive } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Name is required' });
      }

      const agent = await prisma.agent.create({
        data: {
          name,
          description,
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

      res.status(201).json(agent);
    } catch (error: any) {
      console.error('Failed to create agent:', error);
      res.status(500).json({ error: 'Failed to create agent' });
    }
  }

  // 更新智能体
  async update(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name, description, isActive } = req.body;

      // 验证智能体是否存在
      const existingAgent = await prisma.agent.findUnique({
        where: { id },
      });

      if (!existingAgent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      const agent = await prisma.agent.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          ...(description !== undefined && { description }),
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

      res.json(agent);
    } catch (error: any) {
      console.error('Failed to update agent:', error);
      res.status(500).json({ error: 'Failed to update agent' });
    }
  }

  // 删除智能体
  async delete(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // 验证智能体是否存在
      const existingAgent = await prisma.agent.findUnique({
        where: { id },
      });

      if (!existingAgent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      await prisma.agent.delete({
        where: { id },
      });

      res.json({ message: 'Agent deleted successfully' });
    } catch (error: any) {
      console.error('Failed to delete agent:', error);
      res.status(500).json({ error: 'Failed to delete agent' });
    }
  }

  // 获取可用的文本生成模型
  async getAvailableModels(req: Request, res: Response) {
    try {
      const models = await prisma.aIModel.findMany({
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
    } catch (error: any) {
      console.error('Failed to fetch available models:', error);
      res.status(500).json({ error: 'Failed to fetch available models' });
    }
  }
}

