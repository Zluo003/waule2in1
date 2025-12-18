import { Request, Response } from 'express';
import { prisma, redis } from '../index';
import { logger } from '../utils/logger';
import axios from 'axios';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { uploadPath, uploadBuffer, ensureAliyunOssUrl } from '../utils/oss';

// 获取所有资产库（包括自己的和共享给我的）
export const getAssetLibraries = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    const { category: categoryParam, q, limit: limitRaw, offset: offsetRaw, includeShared } = req.query as any;
    const allowed = ['ROLE', 'SCENE', 'PROP', 'AUDIO', 'OTHER'];
    const categoryFilter = allowed.includes(String(categoryParam || '').toUpperCase())
      ? String(categoryParam).toUpperCase()
      : undefined;
    const limit = Math.min(Math.max(parseInt(limitRaw || '20', 10), 1), 100);
    const offset = Math.max(parseInt(offsetRaw || '0', 10), 0);
    const nameFilter = typeof q === 'string' && q.trim() ? q.trim() : undefined;

    const where: any = {
      userId,
      ...(categoryFilter ? { category: categoryFilter as any } : {}),
      ...(nameFilter ? { name: { contains: nameFilter, mode: 'insensitive' as any } } : {}),
    };

    // 获取自己的资产库
    const [ownLibraries, total] = await Promise.all([
      prisma.assetLibrary.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          thumbnail: true,
          category: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { assets: true, shares: true } },
        },
        take: limit,
        skip: offset,
      }),
      prisma.assetLibrary.count({ where }),
    ]);

    // 标记是否有协作者（已共享）
    const librariesWithShareInfo = ownLibraries.map((lib) => ({
      ...lib,
      isOwner: true,
      isShared: false,
      hasCollaborators: lib._count.shares > 0,
    }));

    // 如果需要包含共享给我的资产库
    let sharedLibraries: any[] = [];
    if (includeShared === 'true' || includeShared === '1') {
      const shares = await prisma.assetLibraryShare.findMany({
        where: {
          targetUserId: userId,
          ...(categoryFilter ? { assetLibrary: { category: categoryFilter as any } } : {}),
          ...(nameFilter ? { assetLibrary: { name: { contains: nameFilter, mode: 'insensitive' as any } } } : {}),
        },
        include: {
          assetLibrary: {
            select: {
              id: true,
              name: true,
              description: true,
              thumbnail: true,
              category: true,
              createdAt: true,
              updatedAt: true,
              _count: { select: { assets: true } },
            },
          },
          owner: { select: { id: true, nickname: true, avatar: true } },
        },
      });

      sharedLibraries = shares.map((share) => ({
        ...share.assetLibrary,
        isOwner: false,
        isShared: true,
        hasCollaborators: false,
        owner: share.owner,
        shareInfo: {
          canDownload: share.canDownload,
          sharedAt: share.createdAt,
        },
      }));
    }

    const allLibraries = [...librariesWithShareInfo, ...sharedLibraries];

    res.json({ success: true, data: allLibraries, meta: { total: total + sharedLibraries.length, limit, offset } });
  } catch (error: any) {
    logger.error('Get asset libraries error:', error);
    res.status(500).json({ message: '获取资产库列表失败', error: error.message });
  }
};

// 获取单个资产库（所有者或协作者均可访问）
export const getAssetLibrary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    // 先尝试作为所有者获取
    let library = await prisma.assetLibrary.findFirst({
      where: { id, userId },
      include: {
        _count: { select: { assets: true, shares: true } },
      },
    });

    let isOwner = true;
    let shareInfo = null;

    // 如果不是所有者，检查是否是协作者
    if (!library) {
      isOwner = false;
      const share = await prisma.assetLibraryShare.findFirst({
        where: { assetLibraryId: id, targetUserId: userId },
        include: {
          assetLibrary: {
            include: {
              user: { select: { id: true, nickname: true, avatar: true } },
              _count: { select: { assets: true } },
            },
          },
          owner: { select: { id: true, nickname: true, avatar: true } },
        },
      });

      if (share) {
        library = share.assetLibrary as any;
        shareInfo = {
          canDownload: share.canDownload,
          sharedAt: share.createdAt,
          owner: share.owner,
        };
      }
    }

    if (!library) {
      return res.status(404).json({ message: '资产库不存在' });
    }

    res.json({
      success: true,
      data: {
        ...library,
        isOwner,
        isShared: !isOwner,
        shareInfo,
      },
    });
  } catch (error: any) {
    logger.error('Get asset library error:', error);
    res.status(500).json({ message: '获取资产库失败', error: error.message });
  }
};

// 创建资产库
export const createAssetLibrary = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { name, description, thumbnail, category } = req.body;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ message: '资产库名称不能为空' });
    }

    const allowedCategories = ['ROLE', 'SCENE', 'PROP', 'AUDIO', 'OTHER'];
    const finalCategory = allowedCategories.includes((category || '').toUpperCase())
      ? (category as string).toUpperCase()
      : 'OTHER';

    const existing = await prisma.assetLibrary.findFirst({
      where: {
        userId,
        name: name.trim(),
        category: finalCategory as any,
      },
      include: {
        _count: { select: { assets: true } },
      },
    });

    if (existing) {
      return res.status(200).json({ success: true, data: existing });
    }

    const library = await prisma.assetLibrary.create({
      data: {
        userId,
        name: name.trim(),
        description: description?.trim(),
        thumbnail,
        category: finalCategory as any,
      },
      include: {
        _count: {
          select: { assets: true },
        },
      },
    });

    logger.info(`Asset library created: ${library.name} by user ${userId}`);

    res.status(201).json({
      success: true,
      data: library,
    });
  } catch (error: any) {
    logger.error('Create asset library error:', error);
    res.status(500).json({ message: '创建资产库失败', error: error.message });
  }
};

// 更新资产库
export const updateAssetLibrary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { name, description, thumbnail, category } = req.body;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    // 检查资产库是否存在且属于当前用户
    const existingLibrary = await prisma.assetLibrary.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!existingLibrary) {
      return res.status(404).json({ message: '资产库不存在' });
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim();
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
    if (category !== undefined) {
      const allowedCategories = ['ROLE', 'SCENE', 'PROP', 'AUDIO', 'OTHER'];
      const upper = (category as string).toUpperCase();
      if (allowedCategories.includes(upper)) {
        updateData.category = upper as any;
      }
    }

    if (updateData.name || updateData.category) {
      const targetName = updateData.name ?? existingLibrary.name;
      const targetCategory = (updateData.category ?? existingLibrary.category) as any;
      const conflict = await prisma.assetLibrary.findFirst({
        where: {
          userId,
          name: targetName,
          category: targetCategory,
          NOT: { id },
        },
      });
      if (conflict) {
        return res.status(409).json({ message: '同名同分类的资产库已存在' });
      }
    }

    const library = await prisma.assetLibrary.update({
      where: { id },
      data: updateData,
      include: {
        _count: {
          select: { assets: true },
        },
      },
    });

    logger.info(`Asset library updated: ${library.name} by user ${userId}`);

    res.json({
      success: true,
      data: library,
    });
  } catch (error: any) {
    logger.error('Update asset library error:', error);
    res.status(500).json({ message: '更新资产库失败', error: error.message });
  }
};

// 删除资产库
export const deleteAssetLibrary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    // 检查资产库是否存在且属于当前用户
    const library = await prisma.assetLibrary.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!library) {
      return res.status(404).json({ message: '资产库不存在' });
    }

    // 删除资产库（关联的资产会因为onDelete: Cascade自动删除）
    await prisma.assetLibrary.delete({
      where: { id },
    });

    logger.info(`Asset library deleted: ${library.name} by user ${userId}`);

    res.json({
      success: true,
      message: '删除成功',
    });
  } catch (error: any) {
    logger.error('Delete asset library error:', error);
    res.status(500).json({ message: '删除资产库失败', error: error.message });
  }
};

// 获取资产库中的资产（所有者或协作者均可访问）
export const getLibraryAssets = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { limit: limitRaw, offset: offsetRaw } = req.query as any;
    const limit = Math.min(Math.max(parseInt(limitRaw || '24', 10), 1), 200);
    const offset = Math.max(parseInt(offsetRaw || '0', 10), 0);

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    // 🚀 尝试从缓存获取
    const cacheKey = `lib:assets:${id}:${offset}:${limit}`;
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch {}

    // 🚀 并行检查权限（所有者和协作者同时查询）
    const [ownerLib, share] = await Promise.all([
      prisma.assetLibrary.findFirst({
        where: { id, userId },
        select: { id: true },
      }),
      prisma.assetLibraryShare.findFirst({
        where: { assetLibraryId: id, targetUserId: userId },
        select: { canDownload: true, assetLibrary: { select: { id: true } } },
      }),
    ]);

    let isOwner = !!ownerLib;
    let canDownload = true;
    let hasAccess = isOwner;

    if (!isOwner && share) {
      hasAccess = true;
      canDownload = share.canDownload;
    }

    if (!hasAccess) {
      return res.status(404).json({ message: '资产库不存在' });
    }

    // 过滤条件：排除 metadata.deleted === true 的记录
    const whereCondition = {
      assetLibraryId: id,
      NOT: {
        metadata: {
          path: ['deleted'],
          equals: true,
        },
      },
    };

    // 🚀 并行执行数据查询和计数查询
    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true,
          name: true,
          originalName: true,
          type: true,
          mimeType: true,
          size: true,
          url: true,
          thumbnail: true,
          metadata: true,
          createdAt: true,
        },
      }),
      prisma.asset.count({
        where: whereCondition,
      }),
    ]);

    const result = { success: true, data: assets, meta: { total, limit, offset, isOwner, canDownload } };
    
    // 🚀 缓存 30 秒
    try { await redis.set(cacheKey, JSON.stringify(result), 'EX', 30); } catch {}

    res.json(result);
  } catch (error: any) {
    logger.error('Get library assets error:', error);
    res.status(500).json({ message: '获取资产列表失败', error: error.message });
  }
};

// 从URL添加资产到资产库
export const addAssetFromUrl = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const { url, name } = req.body;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    if (!url) {
      return res.status(400).json({ message: '缺少资源URL' });
    }

    // 验证资产库存在且属于当前用户
    const library = await prisma.assetLibrary.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!library) {
      return res.status(404).json({ message: '资产库不存在' });
    }

    // 创建临时目录（仅用于必要的落地回退）
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // 判断URL类型：base64 / 远程URL / 本地文件
    const isBase64 = url.startsWith('data:');
    const isExternalUrl = url.startsWith('http://') || url.startsWith('https://');
    let filePath: string | null = null;
    let fileUrl: string;
    let mimeType: string;
    let fileSize: number = 0;
    let originalName: string;

    if (isBase64) {
      // 处理base64数据
      logger.info('Processing base64 data');
      
      // 解析base64数据 data:image/jpeg;base64,/9j/4AAQ...
      const matches = url.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) {
        return res.status(400).json({ message: 'Invalid base64 format' });
      }
      
      mimeType = matches[1];
      const base64Data = matches[2];
      const buffer = Buffer.from(base64Data, 'base64');
      fileSize = buffer.length;
      
      // 生成文件名
      const ext = getExtensionFromMimeType(mimeType);
      const hash = crypto.randomBytes(8).toString('hex');
      const fileName = `base64-${Date.now()}-${hash}${ext}`;
      originalName = `ai-generated${ext}`;
      
      // 直接上传到 OSS
      fileUrl = await uploadBuffer(buffer, ext);
    } else if (isExternalUrl) {
      // 下载公网图片到本地（将来部署后本地链接会变成公网链接）
      logger.info(`Downloading asset from URL: ${url}`);
      
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000, // 2分钟超时
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      // 获取文件信息
      mimeType = response.headers['content-type'] || 'application/octet-stream';
      fileSize = Buffer.from(response.data).length;

      // 从URL提取文件名
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');
      originalName = pathParts[pathParts.length - 1].split('?')[0] || `asset-${Date.now()}`;

      // 生成唯一文件名
      const hash = crypto.randomBytes(8).toString('hex');
      const ext = path.extname(originalName) || getExtensionFromMimeType(mimeType);
      const fileName = `download-${Date.now()}-${hash}${ext}`;
      
      // 直接上传到 OSS：下载到内存后直传
      fileUrl = await uploadBuffer(Buffer.from(response.data), ext);
    } else {
      // 本地文件，从URL路径解析
      // 去除可能的域名和端口，只保留路径
      let urlPath = url;
      try {
        const urlObj = new URL(url);
        urlPath = urlObj.pathname;
      } catch {
        // 如果不是完整URL，直接使用
      }

      // ✅ 构建本地文件路径（保留子目录结构）
      let localPath: string;
      if (urlPath.startsWith('/uploads/')) {
        // 移除开头的 /uploads/，保留后面的子目录结构
        // 例如：/uploads/videos/sora-video-xxx.mp4 → videos/sora-video-xxx.mp4
        const relativePath = urlPath.substring('/uploads/'.length);
        localPath = path.join(uploadDir, relativePath);
      } else if (urlPath.startsWith('/')) {
        // 绝对路径
        localPath = path.join(process.cwd(), urlPath.substring(1));
      } else {
        // 相对路径
        localPath = path.join(process.cwd(), urlPath);
      }

      logger.info(`[Asset] Looking for local file at: ${localPath}`);
      logger.info(`[Asset] Original URL: ${url}, URL path: ${urlPath}`);

      if (!fs.existsSync(localPath)) {
        logger.error(`[Asset] Local file not found: ${localPath}`);
        return res.status(404).json({ 
          message: '本地文件不存在',
          path: localPath,
          originalUrl: url,
          urlPath: urlPath,
        });
      }

      const stats = fs.statSync(localPath);
      fileSize = stats.size;
      const ext = path.extname(localPath).toLowerCase();
      mimeType = getMimeTypeFromExtension(ext);
      originalName = path.basename(localPath);
      // 将本地文件直传到 OSS
      fileUrl = await uploadPath(localPath);
    }

    // 确定资产类型
    const assetType = getAssetTypeFromMimeType(mimeType);

    // 保存到数据库
    const asset = await prisma.asset.create({
      data: {
        userId,
        assetLibraryId: id,
        name: name?.trim() || originalName,
        originalName,
        mimeType,
        size: fileSize,
        url: fileUrl,
        type: assetType,
        metadata: { source: 'GENERATED', originalUrl: url },
      },
    });

    logger.info(`Asset added to library: ${asset.name} (${asset.id})`);
    
    // 🚀 清除资产库缓存
    try { 
      const keys = await redis.keys(`lib:assets:${id}:*`);
      if (keys.length > 0) await redis.del(...keys);
    } catch {}

    res.json({
      success: true,
      data: asset,
    });
  } catch (error: any) {
    logger.error('Add asset from URL error:', error);
    res.status(500).json({ 
      message: '添加资产失败', 
      error: error.message 
    });
  }
};

export const createRole = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || (req as any).tenantUser?.id;
    const { name, faceAssetId, frontAssetId, sideAssetId, backAssetId, voiceAssetId, documentAssetId } = req.body;
    if (!userId) return res.status(401).json({ message: '未授权' });
    if (!name || !String(name).trim()) return res.status(400).json({ message: '角色名称不能为空' });
    
    // 检查是否是所有者或协作者
    const library = await prisma.assetLibrary.findFirst({ where: { id, userId } });
    if (!library) {
      const share = await prisma.assetLibraryShare.findFirst({ where: { assetLibraryId: id, targetUserId: userId } });
      if (!share) return res.status(403).json({ message: '没有权限在此资产库创建角色' });
    }
    const hasAnyAsset = Boolean(faceAssetId || frontAssetId || sideAssetId || backAssetId || voiceAssetId || documentAssetId);
    if (!hasAnyAsset) return res.status(400).json({ message: '至少上传一项素材' });
    const findAsset = async (aid?: string | null) => (aid ? await prisma.asset.findFirst({ where: { id: aid, userId } }) : null);
    const face = await findAsset(faceAssetId);
    const front = await findAsset(frontAssetId);
    const side = await findAsset(sideAssetId);
    const back = await findAsset(backAssetId);
    const voice = await findAsset(voiceAssetId);
    const doc = await findAsset(documentAssetId);
    const thumb = face?.thumbnail || face?.url || front?.thumbnail || front?.url || null;
    const roleUrl = `role://${id}/${Date.now()}`;
    const metadata: any = {
      kind: 'ROLE',
      name: String(name).trim(),
      images: {
        faceAssetId: face?.id || null,
        frontAssetId: front?.id || null,
        sideAssetId: side?.id || null,
        backAssetId: back?.id || null,
      },
      voiceAssetId: voice?.id || null,
      documentAssetId: doc?.id || null,
    };
    const roleAsset = await prisma.asset.create({
      data: {
        userId,
        assetLibraryId: id,
        name: String(name).trim(),
        originalName: String(name).trim(),
        type: 'DOCUMENT',
        mimeType: 'application/json',
        size: 0,
        url: roleUrl,
        thumbnail: thumb,
        metadata,
        tags: [],
      },
    });
    return res.status(201).json({ success: true, data: roleAsset });
  } catch (error: any) {
    return res.status(500).json({ message: '创建角色失败', error: error.message });
  }
};

export const getRoles = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id || (req as any).tenantUser?.id;
    if (!userId) return res.status(401).json({ message: '未授权' });
    
    // 先检查是否为所有者
    let library = await prisma.assetLibrary.findFirst({ where: { id, userId } });
    
    // 如果不是所有者，检查是否是协作者
    if (!library) {
      const share = await prisma.assetLibraryShare.findFirst({
        where: { assetLibraryId: id, targetUserId: userId },
        include: { assetLibrary: true },
      });
      if (share) {
        library = share.assetLibrary;
      }
    }
    
    if (!library) return res.status(404).json({ message: '资产库不存在' });
    const assets = await prisma.asset.findMany({ where: { assetLibraryId: id, type: 'DOCUMENT' }, orderBy: { createdAt: 'desc' } });
    const roles = assets.filter((a) => {
      try {
        const m: any = a.metadata || {};
        return m && m.kind === 'ROLE';
      } catch {
        return false;
      }
    });
    return res.json({ success: true, data: roles });
  } catch (error: any) {
    return res.status(500).json({ message: '获取角色失败', error: error.message });
  }
};

export const updateRole = async (req: Request, res: Response) => {
  try {
    const { id, roleId } = req.params as any;
    const userId = req.user?.id || (req as any).tenantUser?.id;
    const { name, faceAssetId, frontAssetId, sideAssetId, backAssetId, voiceAssetId, documentAssetId } = req.body;
    if (!userId) return res.status(401).json({ message: '未授权' });
    const role = await prisma.asset.findFirst({ where: { id: roleId, userId, assetLibraryId: id } });
    if (!role) return res.status(404).json({ message: '角色不存在' });
    const m: any = role.metadata || {};
    if (!m || m.kind !== 'ROLE') return res.status(400).json({ message: '资产不是角色类型' });
    const findAsset = async (aid?: string | null) => (aid ? await prisma.asset.findFirst({ where: { id: aid, userId } }) : null);
    const face = await findAsset(faceAssetId);
    const front = await findAsset(frontAssetId);
    const side = await findAsset(sideAssetId);
    const back = await findAsset(backAssetId);
    const voice = await findAsset(voiceAssetId);
    const doc = await findAsset(documentAssetId);
    const thumb = face?.thumbnail || face?.url || front?.thumbnail || front?.url || role.thumbnail || null;
    const newMetadata: any = {
      ...m,
      name: name !== undefined ? String(name).trim() : m.name,
      images: {
        faceAssetId: faceAssetId !== undefined ? (face?.id || null) : m.images?.faceAssetId || null,
        frontAssetId: frontAssetId !== undefined ? (front?.id || null) : m.images?.frontAssetId || null,
        sideAssetId: sideAssetId !== undefined ? (side?.id || null) : m.images?.sideAssetId || null,
        backAssetId: backAssetId !== undefined ? (back?.id || null) : m.images?.backAssetId || null,
      },
      voiceAssetId: voiceAssetId !== undefined ? (voice?.id || null) : m.voiceAssetId || null,
      documentAssetId: documentAssetId !== undefined ? (doc?.id || null) : m.documentAssetId || null,
    };
    const updated = await prisma.asset.update({
      where: { id: roleId },
      data: {
        name: name !== undefined ? String(name).trim() : role.name,
        originalName: name !== undefined ? String(name).trim() : role.originalName,
        thumbnail: thumb,
        metadata: newMetadata,
      },
    });
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ message: '更新角色失败', error: error.message });
  }
};

export const deleteRole = async (req: Request, res: Response) => {
  try {
    const { id, roleId } = req.params as any;
    const userId = req.user?.id || (req as any).tenantUser?.id;
    if (!userId) return res.status(401).json({ message: '未授权' });
    
    // 验证角色存在且属于当前用户
    const role = await prisma.asset.findFirst({ where: { id: roleId, userId, assetLibraryId: id } });
    if (!role) return res.status(404).json({ message: '角色不存在' });
    
    const m: any = role.metadata || {};
    if (!m || m.kind !== 'ROLE') return res.status(400).json({ message: '资产不是角色类型' });
    
    // 删除角色（这是一个Asset记录）
    await prisma.asset.delete({ where: { id: roleId } });
    
    // 🚀 清除资产库缓存
    try { 
      const keys = await redis.keys(`lib:assets:${id}:*`);
      if (keys.length > 0) await redis.del(...keys);
    } catch {}
    
    logger.info(`Role deleted: ${role.name} (${roleId}) by user ${userId}`);
    
    return res.json({ success: true, message: '角色删除成功' });
  } catch (error: any) {
    logger.error('Delete role error:', error);
    return res.status(500).json({ message: '删除角色失败', error: error.message });
  }
};

// 获取与我共享的资产库
export const getSharedAssetLibraries = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    // 查找所有共享给当前用户的资产库
    const shares = await prisma.assetLibraryShare.findMany({
      where: { targetUserId: userId },
      include: {
        assetLibrary: {
          include: {
            user: { select: { id: true, nickname: true, avatar: true } },
            _count: { select: { assets: true } },
          },
        },
        owner: { select: { id: true, nickname: true, avatar: true } },
      },
    });

    const libraries = shares.map((share) => ({
      ...share.assetLibrary,
      isShared: true,
      owner: share.owner,
      shareInfo: {
        canDownload: share.canDownload,
        sharedAt: share.createdAt,
      },
    }));

    res.json({ success: true, data: libraries });
  } catch (error: any) {
    logger.error('Get shared asset libraries error:', error);
    res.status(500).json({ message: '获取共享资产库失败', error: error.message });
  }
};

// 添加协作者
export const shareAssetLibrary = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { targetUserId, canDownload = true } = req.body;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    if (!targetUserId) {
      return res.status(400).json({ message: '请指定协作者' });
    }

    if (targetUserId === userId) {
      return res.status(400).json({ message: '不能将自己添加为协作者' });
    }

    // 验证资产库存在且属于当前用户
    const library = await prisma.assetLibrary.findFirst({
      where: { id, userId },
    });

    if (!library) {
      return res.status(404).json({ message: '资产库不存在' });
    }

    // 验证目标用户存在
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, nickname: true, avatar: true },
    });

    if (!targetUser) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 检查是否已经共享
    const existingShare = await prisma.assetLibraryShare.findFirst({
      where: { assetLibraryId: id, targetUserId },
    });

    if (existingShare) {
      return res.status(400).json({ message: '该用户已是协作者' });
    }

    // 创建共享记录
    const share = await prisma.assetLibraryShare.create({
      data: {
        assetLibraryId: id,
        ownerUserId: userId,
        targetUserId,
        canDownload,
      },
      include: {
        target: { select: { id: true, nickname: true, avatar: true } },
      },
    });

    logger.info(`Asset library ${id} shared with user ${targetUserId} by ${userId}`);

    res.json({ success: true, data: share });
  } catch (error: any) {
    logger.error('Share asset library error:', error);
    res.status(500).json({ message: '分享资产库失败', error: error.message });
  }
};

// 移除协作者
export const unshareAssetLibrary = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { targetUserId } = req.body;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    if (!targetUserId) {
      return res.status(400).json({ message: '请指定要移除的协作者' });
    }

    // 验证资产库存在且属于当前用户
    const library = await prisma.assetLibrary.findFirst({
      where: { id, userId },
    });

    if (!library) {
      return res.status(404).json({ message: '资产库不存在' });
    }

    // 删除共享记录
    const deleted = await prisma.assetLibraryShare.deleteMany({
      where: { assetLibraryId: id, targetUserId },
    });

    if (deleted.count === 0) {
      return res.status(404).json({ message: '该用户不是协作者' });
    }

    logger.info(`Asset library ${id} unshared with user ${targetUserId} by ${userId}`);

    res.json({ success: true, message: '已移除协作者' });
  } catch (error: any) {
    logger.error('Unshare asset library error:', error);
    res.status(500).json({ message: '取消分享失败', error: error.message });
  }
};

// 获取资产库的协作者列表
export const getCollaborators = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    // 验证资产库存在且属于当前用户
    const library = await prisma.assetLibrary.findFirst({
      where: { id, userId },
    });

    if (!library) {
      return res.status(404).json({ message: '资产库不存在' });
    }

    // 获取所有协作者
    const shares = await prisma.assetLibraryShare.findMany({
      where: { assetLibraryId: id },
      include: {
        target: { select: { id: true, nickname: true, avatar: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const collaborators = shares.map((share) => ({
      id: share.target.id,
      nickname: share.target.nickname,
      avatar: share.target.avatar,
      canDownload: share.canDownload,
      sharedAt: share.createdAt,
    }));

    res.json({ success: true, data: collaborators });
  } catch (error: any) {
    logger.error('Get collaborators error:', error);
    res.status(500).json({ message: '获取协作者列表失败', error: error.message });
  }
};

// 搜索用户（用于@提及添加协作者）
export const searchUsers = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { q } = req.query;

    if (!userId) {
      return res.status(401).json({ message: '未授权' });
    }

    const query = (typeof q === 'string' ? q.trim() : '');

    // 搜索用户（排除自己），空查询时返回最近活跃用户
    const whereCondition: any = {
      id: { not: userId },
      isActive: true,
    };

    // 如果有搜索词，添加昵称/用户名过滤
    if (query.length > 0) {
      whereCondition.OR = [
        { nickname: { contains: query, mode: 'insensitive' } },
        { username: { contains: query, mode: 'insensitive' } },
      ];
    }

    const users = await prisma.user.findMany({
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
    logger.error('Search users error:', error);
    res.status(500).json({ message: '搜索用户失败', error: error.message });
  }
};

// 根据MIME类型获取扩展名
function getExtensionFromMimeType(mimeType: string): string {
  const mimeMap: { [key: string]: string } = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'audio/mpeg': '.mp3',
    'audio/wav': '.wav',
    'audio/ogg': '.ogg',
  };
  return mimeMap[mimeType] || '.bin';
}

// 根据扩展名获取MIME类型
function getMimeTypeFromExtension(ext: string): string {
  const extMap: { [key: string]: string } = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
  };
  return extMap[ext.toLowerCase()] || 'application/octet-stream';
}

// 根据MIME类型确定资产类型
function getAssetTypeFromMimeType(mimeType: string): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  return 'DOCUMENT';
}
