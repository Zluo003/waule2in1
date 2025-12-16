import { Request, Response } from 'express';
import { prisma, redis } from '../index';
import logger from '../utils/logger';

/**
 * Sora角色控制器
 * 处理Sora2生成的角色CRUD操作
 */
export class SoraCharacterController {
  /**
   * 获取当前用户的所有角色（包括共享给我的）
   */
  async list(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { search, limit = 50, includeShared } = req.query;
      const limitNum = parseInt(limit as string, 10);
      
      // 🚀 尝试从缓存获取（无搜索条件时）
      const cacheKey = `sora:chars:${userId}:${includeShared || '0'}:${limitNum}`;
      if (!search) {
        try {
          const cached = await redis.get(cacheKey);
          if (cached) {
            return res.json(JSON.parse(cached));
          }
        } catch {}
      }
      
      // 获取自己的角色
      const ownWhere: any = {
        userId,
        isActive: true,
      };

      // 搜索自定义名称或角色名称
      if (search && typeof search === 'string') {
        ownWhere.OR = [
          { customName: { contains: search, mode: 'insensitive' } },
          { characterName: { contains: search, mode: 'insensitive' } },
        ];
      }

      const ownCharacters = await prisma.soraCharacter.findMany({
        where: ownWhere,
        orderBy: { createdAt: 'desc' },
        take: limitNum,
      });

      // 标记为自己的角色
      const ownWithFlag = ownCharacters.map(c => ({ ...c, isOwner: true, isShared: false }));

      // 如果需要包含共享给我的角色
      let sharedCharacters: any[] = [];
      if (includeShared === 'true' || includeShared === '1') {
        const shares = await prisma.soraCharacterShare.findMany({
          where: { targetUserId: userId },
          include: {
            owner: { select: { id: true, nickname: true, avatar: true } },
          },
        });

        if (shares.length > 0) {
          const sharedOwnerIds = shares.map(s => s.ownerUserId);
          const ownerMap = new Map(shares.map(s => [s.ownerUserId, s.owner]));
          
          const sharedWhere: any = {
            userId: { in: sharedOwnerIds },
            isActive: true,
          };

          if (search && typeof search === 'string') {
            sharedWhere.OR = [
              { customName: { contains: search, mode: 'insensitive' } },
              { characterName: { contains: search, mode: 'insensitive' } },
            ];
          }

          const shared = await prisma.soraCharacter.findMany({
            where: sharedWhere,
            orderBy: { createdAt: 'desc' },
            take: limitNum,
          });

          sharedCharacters = shared.map(c => ({
            ...c,
            isOwner: false,
            isShared: true,
            owner: ownerMap.get(c.userId),
          }));
        }
      }

      const allCharacters = [...ownWithFlag, ...sharedCharacters];

      const result = {
        success: true,
        characters: allCharacters,
      };
      
      // 🚀 缓存 1 分钟（无搜索条件时）
      if (!search) {
        try { await redis.set(cacheKey, JSON.stringify(result), 'EX', 60); } catch {}
      }

      res.json(result);
    } catch (error: any) {
      logger.error('[SoraCharacter] 获取角色列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 搜索角色（用于@提及自动完成，包括共享的角色）
   */
  async search(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { q, limit = 5 } = req.query;
      const searchTerm = (q as string || '').trim();
      const limitNum = parseInt(limit as string, 10);

      // 获取共享给我的用户 ID 列表
      const shares = await prisma.soraCharacterShare.findMany({
        where: { targetUserId: userId },
        select: { ownerUserId: true },
      });
      const sharedOwnerIds = shares.map((s: any) => s.ownerUserId);

      // 构建查询条件：自己的 + 共享给我的
      const userIds = [userId, ...sharedOwnerIds];

      const characters = await prisma.soraCharacter.findMany({
        where: {
          userId: { in: userIds },
          isActive: true,
          OR: searchTerm ? [
            { customName: { contains: searchTerm, mode: 'insensitive' } },
            { characterName: { contains: searchTerm, mode: 'insensitive' } },
          ] : undefined,
        },
        orderBy: { createdAt: 'desc' },
        take: limitNum,
        select: {
          id: true,
          customName: true,
          characterName: true,
          avatarUrl: true,
          userId: true,
        },
      });

      // 标记是否是共享的
      const result = characters.map((c: any) => ({
        ...c,
        isShared: c.userId !== userId,
      }));

      res.json({
        success: true,
        characters: result,
      });
    } catch (error: any) {
      logger.error('[SoraCharacter] 搜索角色失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 获取单个角色
   */
  async getById(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { id } = req.params;

      const character = await prisma.soraCharacter.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!character) {
        return res.status(404).json({ error: '角色不存在' });
      }

      res.json({
        success: true,
        character,
      });
    } catch (error: any) {
      logger.error('[SoraCharacter] 获取角色失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 创建角色
   */
  async create(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { customName, characterName, avatarUrl, sourceVideoUrl, description } = req.body;

      if (!customName || !characterName) {
        return res.status(400).json({ error: '缺少必要参数: customName, characterName' });
      }

      // 检查自定义名称是否已存在
      const existing = await prisma.soraCharacter.findFirst({
        where: {
          userId,
          customName,
        },
      });

      if (existing) {
        return res.status(400).json({ error: '角色自定义名称已存在' });
      }

      const character = await prisma.soraCharacter.create({
        data: {
          userId,
          customName,
          characterName,
          avatarUrl,
          sourceVideoUrl,
          description,
        },
      });

      logger.info(`[SoraCharacter] 创建角色成功: ${character.id}, customName: ${customName}, characterName: ${characterName}`);

      res.json({
        success: true,
        character,
      });
    } catch (error: any) {
      logger.error('[SoraCharacter] 创建角色失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 更新角色
   */
  async update(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { id } = req.params;
      const { customName, description, avatarUrl } = req.body;

      // 验证角色属于当前用户
      const existing = await prisma.soraCharacter.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!existing) {
        return res.status(404).json({ error: '角色不存在' });
      }

      // 如果更新自定义名称，检查是否冲突
      if (customName && customName !== existing.customName) {
        const conflict = await prisma.soraCharacter.findFirst({
          where: {
            userId,
            customName,
            id: { not: id },
          },
        });

        if (conflict) {
          return res.status(400).json({ error: '角色自定义名称已存在' });
        }
      }

      const character = await prisma.soraCharacter.update({
        where: { id },
        data: {
          ...(customName && { customName }),
          ...(description !== undefined && { description }),
          ...(avatarUrl !== undefined && { avatarUrl }),
        },
      });

      // 清除缓存
      try {
        const keys = await redis.keys(`sora:chars:${userId}:*`);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      } catch {}

      res.json({
        success: true,
        character,
      });
    } catch (error: any) {
      logger.error('[SoraCharacter] 更新角色失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 删除角色（软删除）
   */
  async delete(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { id } = req.params;

      // 验证角色属于当前用户
      const existing = await prisma.soraCharacter.findFirst({
        where: {
          id,
          userId,
        },
      });

      if (!existing) {
        return res.status(404).json({ error: '角色不存在' });
      }

      // 软删除
      await prisma.soraCharacter.update({
        where: { id },
        data: { isActive: false },
      });

      res.json({
        success: true,
        message: '角色已删除',
      });
    } catch (error: any) {
      logger.error('[SoraCharacter] 删除角色失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 通过自定义名称获取角色名称
   */
  async getByCustomName(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { customName } = req.params;

      // 先查自己的角色
      let character = await prisma.soraCharacter.findFirst({
        where: {
          userId,
          customName,
          isActive: true,
        },
        select: {
          id: true,
          customName: true,
          characterName: true,
          avatarUrl: true,
          userId: true,
        },
      });

      // 如果没找到，查共享给我的
      if (!character) {
        const shares = await prisma.soraCharacterShare.findMany({
          where: { targetUserId: userId },
          select: { ownerUserId: true },
        });
        const sharedOwnerIds = shares.map(s => s.ownerUserId);
        
        if (sharedOwnerIds.length > 0) {
          character = await prisma.soraCharacter.findFirst({
            where: {
              userId: { in: sharedOwnerIds },
              customName,
              isActive: true,
            },
            select: {
              id: true,
              customName: true,
              characterName: true,
              avatarUrl: true,
              userId: true,
            },
          });
        }
      }

      if (!character) {
        return res.status(404).json({ error: '角色不存在' });
      }

      res.json({
        success: true,
        character,
      });
    } catch (error: any) {
      logger.error('[SoraCharacter] 通过自定义名称获取角色失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 搜索用户（用于添加协作者）- 商业版使用 TenantUser
   */
  async searchUsers(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      const tenantId = (req as any).user?.tenantId;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { q } = req.query;
      const query = (typeof q === 'string' ? q.trim() : '');

      // 搜索租户用户（排除自己，同租户内）
      const whereCondition: any = {
        id: { not: userId },
        isActive: true,
        ...(tenantId && { tenantId }), // 限制同租户
      };

      if (query.length > 0) {
        whereCondition.OR = [
          { nickname: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
        ];
      }

      const users = await prisma.tenantUser.findMany({
        where: whereCondition,
        select: {
          id: true,
          nickname: true,
          avatar: true,
          username: true,
        },
        orderBy: { lastLoginAt: 'desc' },
        take: 5,
      });

      res.json({ success: true, data: users });
    } catch (error: any) {
      logger.error('[SoraCharacter] 搜索用户失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 获取协作者列表
   */
  async getCollaborators(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const shares = await prisma.soraCharacterShare.findMany({
        where: { ownerUserId: userId },
        include: {
          target: { select: { id: true, nickname: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const collaborators = shares.map(share => ({
        id: share.target.id,
        nickname: share.target.nickname,
        avatar: share.target.avatar,
        sharedAt: share.createdAt,
      }));

      res.json({ success: true, data: collaborators });
    } catch (error: any) {
      logger.error('[SoraCharacter] 获取协作者列表失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 添加协作者
   */
  async addCollaborator(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({ error: '请指定协作者' });
      }

      if (targetUserId === userId) {
        return res.status(400).json({ error: '不能将自己添加为协作者' });
      }

      // 验证目标用户存在（商业版使用 TenantUser）
      const targetUser = await prisma.tenantUser.findUnique({
        where: { id: targetUserId },
        select: { id: true, nickname: true, avatar: true },
      });

      if (!targetUser) {
        return res.status(404).json({ error: '用户不存在' });
      }

      // 检查是否已经共享
      const existingShare = await prisma.soraCharacterShare.findFirst({
        where: { ownerUserId: userId, targetUserId },
      });

      if (existingShare) {
        return res.status(400).json({ error: '该用户已是协作者' });
      }

      // 创建共享记录
      const share = await prisma.soraCharacterShare.create({
        data: {
          ownerUserId: userId,
          targetUserId,
        },
        include: {
          target: { select: { id: true, nickname: true, avatar: true } },
        },
      });

      logger.info(`[SoraCharacter] 添加协作者成功: owner=${userId}, target=${targetUserId}`);

      res.json({ success: true, data: share });
    } catch (error: any) {
      logger.error('[SoraCharacter] 添加协作者失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 移除协作者
   */
  async removeCollaborator(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const { targetUserId } = req.body;

      if (!targetUserId) {
        return res.status(400).json({ error: '请指定要移除的协作者' });
      }

      // 删除共享记录
      const deleted = await prisma.soraCharacterShare.deleteMany({
        where: { ownerUserId: userId, targetUserId },
      });

      if (deleted.count === 0) {
        return res.status(404).json({ error: '该用户不是协作者' });
      }

      logger.info(`[SoraCharacter] 移除协作者成功: owner=${userId}, target=${targetUserId}`);

      res.json({ success: true, message: '已移除协作者' });
    } catch (error: any) {
      logger.error('[SoraCharacter] 移除协作者失败:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * 获取协作者数量（用于显示共享状态）
   */
  async getShareInfo(req: Request, res: Response) {
    try {
      const userId = (req as any).tenantUser?.id || (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ error: '未授权' });
      }

      const shareCount = await prisma.soraCharacterShare.count({
        where: { ownerUserId: userId },
      });

      res.json({ 
        success: true, 
        data: { 
          hasCollaborators: shareCount > 0,
          collaboratorCount: shareCount,
        },
      });
    } catch (error: any) {
      logger.error('[SoraCharacter] 获取共享信息失败:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

export default new SoraCharacterController();
