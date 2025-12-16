"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchUsers = exports.getCollaborators = exports.unshareAssetLibrary = exports.shareAssetLibrary = exports.getSharedAssetLibraries = exports.deleteRole = exports.updateRole = exports.getRoles = exports.createRole = exports.addAssetFromUrl = exports.getLibraryAssets = exports.deleteAssetLibrary = exports.updateAssetLibrary = exports.createAssetLibrary = exports.getAssetLibrary = exports.getAssetLibraries = void 0;
const index_1 = require("../index");
const logger_1 = require("../utils/logger");
const axios_1 = __importDefault(require("axios"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const crypto_1 = __importDefault(require("crypto"));
const oss_1 = require("../utils/oss");
// 获取所有资产库（包括自己的和共享给我的）
const getAssetLibraries = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        const { category: categoryParam, q, limit: limitRaw, offset: offsetRaw, includeShared } = req.query;
        const allowed = ['ROLE', 'SCENE', 'PROP', 'OTHER'];
        const categoryFilter = allowed.includes(String(categoryParam || '').toUpperCase())
            ? String(categoryParam).toUpperCase()
            : undefined;
        const limit = Math.min(Math.max(parseInt(limitRaw || '20', 10), 1), 100);
        const offset = Math.max(parseInt(offsetRaw || '0', 10), 0);
        const nameFilter = typeof q === 'string' && q.trim() ? q.trim() : undefined;
        const where = {
            userId,
            ...(categoryFilter ? { category: categoryFilter } : {}),
            ...(nameFilter ? { name: { contains: nameFilter, mode: 'insensitive' } } : {}),
        };
        // 获取自己的资产库
        const [ownLibraries, total] = await Promise.all([
            index_1.prisma.assetLibrary.findMany({
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
            index_1.prisma.assetLibrary.count({ where }),
        ]);
        // 标记是否有协作者（已共享）
        const librariesWithShareInfo = ownLibraries.map((lib) => ({
            ...lib,
            isOwner: true,
            isShared: false,
            hasCollaborators: lib._count.shares > 0,
        }));
        // 如果需要包含共享给我的资产库
        let sharedLibraries = [];
        if (includeShared === 'true' || includeShared === '1') {
            const shares = await index_1.prisma.assetLibraryShare.findMany({
                where: {
                    targetUserId: userId,
                    ...(categoryFilter ? { assetLibrary: { category: categoryFilter } } : {}),
                    ...(nameFilter ? { assetLibrary: { name: { contains: nameFilter, mode: 'insensitive' } } } : {}),
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
    }
    catch (error) {
        logger_1.logger.error('Get asset libraries error:', error);
        res.status(500).json({ message: '获取资产库列表失败', error: error.message });
    }
};
exports.getAssetLibraries = getAssetLibraries;
// 获取单个资产库（所有者或协作者均可访问）
const getAssetLibrary = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        // 先尝试作为所有者获取
        let library = await index_1.prisma.assetLibrary.findFirst({
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
            const share = await index_1.prisma.assetLibraryShare.findFirst({
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
                library = share.assetLibrary;
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
    }
    catch (error) {
        logger_1.logger.error('Get asset library error:', error);
        res.status(500).json({ message: '获取资产库失败', error: error.message });
    }
};
exports.getAssetLibrary = getAssetLibrary;
// 创建资产库
const createAssetLibrary = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { name, description, thumbnail, category } = req.body;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        if (!name || !name.trim()) {
            return res.status(400).json({ message: '资产库名称不能为空' });
        }
        const allowedCategories = ['ROLE', 'SCENE', 'PROP', 'OTHER'];
        const finalCategory = allowedCategories.includes((category || '').toUpperCase())
            ? category.toUpperCase()
            : 'OTHER';
        const existing = await index_1.prisma.assetLibrary.findFirst({
            where: {
                userId,
                name: name.trim(),
                category: finalCategory,
            },
            include: {
                _count: { select: { assets: true } },
            },
        });
        if (existing) {
            return res.status(200).json({ success: true, data: existing });
        }
        const library = await index_1.prisma.assetLibrary.create({
            data: {
                userId,
                name: name.trim(),
                description: description?.trim(),
                thumbnail,
                category: finalCategory,
            },
            include: {
                _count: {
                    select: { assets: true },
                },
            },
        });
        logger_1.logger.info(`Asset library created: ${library.name} by user ${userId}`);
        res.status(201).json({
            success: true,
            data: library,
        });
    }
    catch (error) {
        logger_1.logger.error('Create asset library error:', error);
        res.status(500).json({ message: '创建资产库失败', error: error.message });
    }
};
exports.createAssetLibrary = createAssetLibrary;
// 更新资产库
const updateAssetLibrary = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { name, description, thumbnail, category } = req.body;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        // 检查资产库是否存在且属于当前用户
        const existingLibrary = await index_1.prisma.assetLibrary.findFirst({
            where: {
                id,
                userId,
            },
        });
        if (!existingLibrary) {
            return res.status(404).json({ message: '资产库不存在' });
        }
        const updateData = {};
        if (name !== undefined)
            updateData.name = name.trim();
        if (description !== undefined)
            updateData.description = description?.trim();
        if (thumbnail !== undefined)
            updateData.thumbnail = thumbnail;
        if (category !== undefined) {
            const allowedCategories = ['ROLE', 'SCENE', 'PROP', 'OTHER'];
            const upper = category.toUpperCase();
            if (allowedCategories.includes(upper)) {
                updateData.category = upper;
            }
        }
        if (updateData.name || updateData.category) {
            const targetName = updateData.name ?? existingLibrary.name;
            const targetCategory = (updateData.category ?? existingLibrary.category);
            const conflict = await index_1.prisma.assetLibrary.findFirst({
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
        const library = await index_1.prisma.assetLibrary.update({
            where: { id },
            data: updateData,
            include: {
                _count: {
                    select: { assets: true },
                },
            },
        });
        logger_1.logger.info(`Asset library updated: ${library.name} by user ${userId}`);
        res.json({
            success: true,
            data: library,
        });
    }
    catch (error) {
        logger_1.logger.error('Update asset library error:', error);
        res.status(500).json({ message: '更新资产库失败', error: error.message });
    }
};
exports.updateAssetLibrary = updateAssetLibrary;
// 删除资产库
const deleteAssetLibrary = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        // 检查资产库是否存在且属于当前用户
        const library = await index_1.prisma.assetLibrary.findFirst({
            where: {
                id,
                userId,
            },
        });
        if (!library) {
            return res.status(404).json({ message: '资产库不存在' });
        }
        // 删除资产库（关联的资产会因为onDelete: Cascade自动删除）
        await index_1.prisma.assetLibrary.delete({
            where: { id },
        });
        logger_1.logger.info(`Asset library deleted: ${library.name} by user ${userId}`);
        res.json({
            success: true,
            message: '删除成功',
        });
    }
    catch (error) {
        logger_1.logger.error('Delete asset library error:', error);
        res.status(500).json({ message: '删除资产库失败', error: error.message });
    }
};
exports.deleteAssetLibrary = deleteAssetLibrary;
// 获取资产库中的资产（所有者或协作者均可访问）
const getLibraryAssets = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { limit: limitRaw, offset: offsetRaw } = req.query;
        const limit = Math.min(Math.max(parseInt(limitRaw || '24', 10), 1), 200);
        const offset = Math.max(parseInt(offsetRaw || '0', 10), 0);
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        // 🚀 尝试从缓存获取
        const cacheKey = `lib:assets:${id}:${offset}:${limit}`;
        try {
            const cached = await index_1.redis.get(cacheKey);
            if (cached) {
                logger_1.logger.info(`[Cache] Hit for library ${id}, returning cached data`);
                return res.json(JSON.parse(cached));
            }
        }
        catch (cacheError) {
            logger_1.logger.warn(`[Cache] Failed to get cache for library ${id}: ${cacheError.message}`);
        }
        // 🚀 并行检查权限（所有者和协作者同时查询）
        const [ownerLib, share] = await Promise.all([
            index_1.prisma.assetLibrary.findFirst({
                where: { id, userId },
                select: { id: true },
            }),
            index_1.prisma.assetLibraryShare.findFirst({
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
        // 过滤条件：只查询该资产库的资产，排除已删除的（metadata.deleted === true）
        // Prisma JSON 路径查询：如果 metadata 为 null 或不包含 deleted 字段，NOT 条件会通过
        const whereCondition = {
            assetLibraryId: id,
        };
        // 先查询所有资产，在应用层过滤（避免 Prisma JSON 查询的潜在问题）
        // 注意：如果需要软删除功能，可以在应用层过滤 metadata.deleted === true
        // 🚀 并行执行数据查询和计数查询
        const [assets, total] = await Promise.all([
            index_1.prisma.asset.findMany({
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
            index_1.prisma.asset.count({
                where: whereCondition,
            }),
        ]);
        // 应用层过滤：排除 metadata.deleted === true 的资产
        const filteredAssets = assets.filter((asset) => {
            const metadata = asset.metadata;
            return !metadata || metadata.deleted !== true;
        });
        // 重新计算过滤后的总数（如果需要精确分页，可以单独查询）
        const filteredTotal = filteredAssets.length === assets.length ? total :
            await index_1.prisma.asset.count({
                where: {
                    assetLibraryId: id,
                    NOT: { metadata: { path: ['deleted'], equals: true } },
                },
            }).catch(() => total);
        logger_1.logger.info(`[Assets] Library ${id}: found ${filteredAssets.length} assets (raw: ${assets.length}, total: ${filteredTotal}, offset: ${offset}, limit: ${limit})`);
        const result = { success: true, data: filteredAssets, meta: { total: filteredTotal, limit, offset, isOwner, canDownload } };
        // 🚀 缓存 30 秒
        try {
            await index_1.redis.set(cacheKey, JSON.stringify(result), 'EX', 30);
            logger_1.logger.info(`[Cache] Set cache for library ${id}`);
        }
        catch (cacheError) {
            logger_1.logger.warn(`[Cache] Failed to set cache for library ${id}: ${cacheError.message}`);
        }
        res.json(result);
    }
    catch (error) {
        logger_1.logger.error('Get library assets error:', error);
        res.status(500).json({ message: '获取资产列表失败', error: error.message });
    }
};
exports.getLibraryAssets = getLibraryAssets;
// 从URL添加资产到资产库
const addAssetFromUrl = async (req, res) => {
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
        const library = await index_1.prisma.assetLibrary.findFirst({
            where: {
                id,
                userId,
            },
        });
        if (!library) {
            return res.status(404).json({ message: '资产库不存在' });
        }
        // 创建临时目录（仅用于必要的落地回退）
        const uploadDir = path_1.default.join(process.cwd(), 'uploads');
        if (!fs_1.default.existsSync(uploadDir)) {
            fs_1.default.mkdirSync(uploadDir, { recursive: true });
        }
        // 判断URL类型：base64 / 远程URL / 本地文件
        const isBase64 = url.startsWith('data:');
        const isExternalUrl = url.startsWith('http://') || url.startsWith('https://');
        let filePath = null;
        let fileUrl;
        let mimeType;
        let fileSize = 0;
        let originalName;
        if (isBase64) {
            // 处理base64数据
            logger_1.logger.info('Processing base64 data');
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
            const hash = crypto_1.default.randomBytes(8).toString('hex');
            const fileName = `base64-${Date.now()}-${hash}${ext}`;
            originalName = `ai-generated${ext}`;
            // 直接上传到 OSS
            fileUrl = await (0, oss_1.uploadBuffer)(buffer, ext);
        }
        else if (isExternalUrl) {
            // 下载公网图片到本地（将来部署后本地链接会变成公网链接）
            logger_1.logger.info(`Downloading asset from URL: ${url}`);
            const response = await axios_1.default.get(url, {
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
            const hash = crypto_1.default.randomBytes(8).toString('hex');
            const ext = path_1.default.extname(originalName) || getExtensionFromMimeType(mimeType);
            const fileName = `download-${Date.now()}-${hash}${ext}`;
            // 直接上传到 OSS：下载到内存后直传
            fileUrl = await (0, oss_1.uploadBuffer)(Buffer.from(response.data), ext);
        }
        else {
            // 本地文件，从URL路径解析
            // 去除可能的域名和端口，只保留路径
            let urlPath = url;
            try {
                const urlObj = new URL(url);
                urlPath = urlObj.pathname;
            }
            catch {
                // 如果不是完整URL，直接使用
            }
            // ✅ 构建本地文件路径（保留子目录结构）
            let localPath;
            if (urlPath.startsWith('/uploads/')) {
                // 移除开头的 /uploads/，保留后面的子目录结构
                // 例如：/uploads/videos/sora-video-xxx.mp4 → videos/sora-video-xxx.mp4
                const relativePath = urlPath.substring('/uploads/'.length);
                localPath = path_1.default.join(uploadDir, relativePath);
            }
            else if (urlPath.startsWith('/')) {
                // 绝对路径
                localPath = path_1.default.join(process.cwd(), urlPath.substring(1));
            }
            else {
                // 相对路径
                localPath = path_1.default.join(process.cwd(), urlPath);
            }
            logger_1.logger.info(`[Asset] Looking for local file at: ${localPath}`);
            logger_1.logger.info(`[Asset] Original URL: ${url}, URL path: ${urlPath}`);
            if (!fs_1.default.existsSync(localPath)) {
                logger_1.logger.error(`[Asset] Local file not found: ${localPath}`);
                return res.status(404).json({
                    message: '本地文件不存在',
                    path: localPath,
                    originalUrl: url,
                    urlPath: urlPath,
                });
            }
            const stats = fs_1.default.statSync(localPath);
            fileSize = stats.size;
            const ext = path_1.default.extname(localPath).toLowerCase();
            mimeType = getMimeTypeFromExtension(ext);
            originalName = path_1.default.basename(localPath);
            // 将本地文件直传到 OSS
            fileUrl = await (0, oss_1.uploadPath)(localPath);
        }
        // 确定资产类型
        const assetType = getAssetTypeFromMimeType(mimeType);
        // 保存到数据库
        const asset = await index_1.prisma.asset.create({
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
        logger_1.logger.info(`Asset added to library: ${asset.name} (${asset.id}) - libraryId: ${id}`);
        // 🚀 清除资产库缓存 - 直接删除常见的缓存 key 组合
        try {
            // 删除常见的分页组合缓存 key
            const cacheKeysToDelete = [
                `lib:assets:${id}:0:24`, // 默认分页
                `lib:assets:${id}:0:50`,
                `lib:assets:${id}:0:100`,
                `lib:assets:${id}:0:200`,
            ];
            // 同时使用 keys 命令查找其他可能的缓存
            const wildcardKeys = await index_1.redis.keys(`lib:assets:${id}:*`);
            const allKeys = [...new Set([...cacheKeysToDelete, ...wildcardKeys])];
            if (allKeys.length > 0) {
                const deletedCount = await index_1.redis.del(...allKeys);
                logger_1.logger.info(`[Cache] Cleared ${deletedCount} cache keys for library ${id}`);
            }
        }
        catch (cacheError) {
            logger_1.logger.warn(`[Cache] Failed to clear cache for library ${id}: ${cacheError.message}`);
        }
        res.json({
            success: true,
            data: asset,
        });
    }
    catch (error) {
        logger_1.logger.error('Add asset from URL error:', error);
        res.status(500).json({
            message: '添加资产失败',
            error: error.message
        });
    }
};
exports.addAssetFromUrl = addAssetFromUrl;
const createRole = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { name, faceAssetId, frontAssetId, sideAssetId, backAssetId, voiceAssetId, documentAssetId } = req.body;
        if (!userId)
            return res.status(401).json({ message: '未授权' });
        if (!name || !String(name).trim())
            return res.status(400).json({ message: '角色名称不能为空' });
        const library = await index_1.prisma.assetLibrary.findFirst({ where: { id, userId } });
        if (!library)
            return res.status(404).json({ message: '资产库不存在' });
        const hasAnyAsset = Boolean(faceAssetId || frontAssetId || sideAssetId || backAssetId || voiceAssetId || documentAssetId);
        if (!hasAnyAsset)
            return res.status(400).json({ message: '至少上传一项素材' });
        const findAsset = async (aid) => (aid ? await index_1.prisma.asset.findFirst({ where: { id: aid, userId } }) : null);
        const face = await findAsset(faceAssetId);
        const front = await findAsset(frontAssetId);
        const side = await findAsset(sideAssetId);
        const back = await findAsset(backAssetId);
        const voice = await findAsset(voiceAssetId);
        const doc = await findAsset(documentAssetId);
        const thumb = face?.thumbnail || face?.url || front?.thumbnail || front?.url || null;
        const roleUrl = `role://${id}/${Date.now()}`;
        const metadata = {
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
        const roleAsset = await index_1.prisma.asset.create({
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
    }
    catch (error) {
        return res.status(500).json({ message: '创建角色失败', error: error.message });
    }
};
exports.createRole = createRole;
const getRoles = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: '未授权' });
        // 先检查是否为所有者
        let library = await index_1.prisma.assetLibrary.findFirst({ where: { id, userId } });
        // 如果不是所有者，检查是否是协作者
        if (!library) {
            const share = await index_1.prisma.assetLibraryShare.findFirst({
                where: { assetLibraryId: id, targetUserId: userId },
                include: { assetLibrary: true },
            });
            if (share) {
                library = share.assetLibrary;
            }
        }
        if (!library)
            return res.status(404).json({ message: '资产库不存在' });
        const assets = await index_1.prisma.asset.findMany({ where: { assetLibraryId: id, type: 'DOCUMENT' }, orderBy: { createdAt: 'desc' } });
        const roles = assets.filter((a) => {
            try {
                const m = a.metadata || {};
                return m && m.kind === 'ROLE';
            }
            catch {
                return false;
            }
        });
        return res.json({ success: true, data: roles });
    }
    catch (error) {
        return res.status(500).json({ message: '获取角色失败', error: error.message });
    }
};
exports.getRoles = getRoles;
const updateRole = async (req, res) => {
    try {
        const { id, roleId } = req.params;
        const userId = req.user?.id;
        const { name, faceAssetId, frontAssetId, sideAssetId, backAssetId, voiceAssetId, documentAssetId } = req.body;
        if (!userId)
            return res.status(401).json({ message: '未授权' });
        const role = await index_1.prisma.asset.findFirst({ where: { id: roleId, userId, assetLibraryId: id } });
        if (!role)
            return res.status(404).json({ message: '角色不存在' });
        const m = role.metadata || {};
        if (!m || m.kind !== 'ROLE')
            return res.status(400).json({ message: '资产不是角色类型' });
        const findAsset = async (aid) => (aid ? await index_1.prisma.asset.findFirst({ where: { id: aid, userId } }) : null);
        const face = await findAsset(faceAssetId);
        const front = await findAsset(frontAssetId);
        const side = await findAsset(sideAssetId);
        const back = await findAsset(backAssetId);
        const voice = await findAsset(voiceAssetId);
        const doc = await findAsset(documentAssetId);
        const thumb = face?.thumbnail || face?.url || front?.thumbnail || front?.url || role.thumbnail || null;
        const newMetadata = {
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
        const updated = await index_1.prisma.asset.update({
            where: { id: roleId },
            data: {
                name: name !== undefined ? String(name).trim() : role.name,
                originalName: name !== undefined ? String(name).trim() : role.originalName,
                thumbnail: thumb,
                metadata: newMetadata,
            },
        });
        return res.json({ success: true, data: updated });
    }
    catch (error) {
        return res.status(500).json({ message: '更新角色失败', error: error.message });
    }
};
exports.updateRole = updateRole;
const deleteRole = async (req, res) => {
    try {
        const { id, roleId } = req.params;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: '未授权' });
        // 验证角色存在且属于当前用户
        const role = await index_1.prisma.asset.findFirst({ where: { id: roleId, userId, assetLibraryId: id } });
        if (!role)
            return res.status(404).json({ message: '角色不存在' });
        const m = role.metadata || {};
        if (!m || m.kind !== 'ROLE')
            return res.status(400).json({ message: '资产不是角色类型' });
        // 删除角色（这是一个Asset记录）
        await index_1.prisma.asset.delete({ where: { id: roleId } });
        // 🚀 清除资产库缓存
        try {
            const keys = await index_1.redis.keys(`lib:assets:${id}:*`);
            if (keys.length > 0)
                await index_1.redis.del(...keys);
        }
        catch { }
        logger_1.logger.info(`Role deleted: ${role.name} (${roleId}) by user ${userId}`);
        return res.json({ success: true, message: '角色删除成功' });
    }
    catch (error) {
        logger_1.logger.error('Delete role error:', error);
        return res.status(500).json({ message: '删除角色失败', error: error.message });
    }
};
exports.deleteRole = deleteRole;
// 获取与我共享的资产库
const getSharedAssetLibraries = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        // 查找所有共享给当前用户的资产库
        const shares = await index_1.prisma.assetLibraryShare.findMany({
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
    }
    catch (error) {
        logger_1.logger.error('Get shared asset libraries error:', error);
        res.status(500).json({ message: '获取共享资产库失败', error: error.message });
    }
};
exports.getSharedAssetLibraries = getSharedAssetLibraries;
// 添加协作者
const shareAssetLibrary = async (req, res) => {
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
        const library = await index_1.prisma.assetLibrary.findFirst({
            where: { id, userId },
        });
        if (!library) {
            return res.status(404).json({ message: '资产库不存在' });
        }
        // 验证目标用户存在
        const targetUser = await index_1.prisma.user.findUnique({
            where: { id: targetUserId },
            select: { id: true, nickname: true, avatar: true },
        });
        if (!targetUser) {
            return res.status(404).json({ message: '用户不存在' });
        }
        // 检查是否已经共享
        const existingShare = await index_1.prisma.assetLibraryShare.findFirst({
            where: { assetLibraryId: id, targetUserId },
        });
        if (existingShare) {
            return res.status(400).json({ message: '该用户已是协作者' });
        }
        // 创建共享记录
        const share = await index_1.prisma.assetLibraryShare.create({
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
        logger_1.logger.info(`Asset library ${id} shared with user ${targetUserId} by ${userId}`);
        res.json({ success: true, data: share });
    }
    catch (error) {
        logger_1.logger.error('Share asset library error:', error);
        res.status(500).json({ message: '分享资产库失败', error: error.message });
    }
};
exports.shareAssetLibrary = shareAssetLibrary;
// 移除协作者
const unshareAssetLibrary = async (req, res) => {
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
        const library = await index_1.prisma.assetLibrary.findFirst({
            where: { id, userId },
        });
        if (!library) {
            return res.status(404).json({ message: '资产库不存在' });
        }
        // 删除共享记录
        const deleted = await index_1.prisma.assetLibraryShare.deleteMany({
            where: { assetLibraryId: id, targetUserId },
        });
        if (deleted.count === 0) {
            return res.status(404).json({ message: '该用户不是协作者' });
        }
        logger_1.logger.info(`Asset library ${id} unshared with user ${targetUserId} by ${userId}`);
        res.json({ success: true, message: '已移除协作者' });
    }
    catch (error) {
        logger_1.logger.error('Unshare asset library error:', error);
        res.status(500).json({ message: '取消分享失败', error: error.message });
    }
};
exports.unshareAssetLibrary = unshareAssetLibrary;
// 获取资产库的协作者列表
const getCollaborators = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        // 验证资产库存在且属于当前用户
        const library = await index_1.prisma.assetLibrary.findFirst({
            where: { id, userId },
        });
        if (!library) {
            return res.status(404).json({ message: '资产库不存在' });
        }
        // 获取所有协作者
        const shares = await index_1.prisma.assetLibraryShare.findMany({
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
    }
    catch (error) {
        logger_1.logger.error('Get collaborators error:', error);
        res.status(500).json({ message: '获取协作者列表失败', error: error.message });
    }
};
exports.getCollaborators = getCollaborators;
// 搜索用户（用于@提及添加协作者）
const searchUsers = async (req, res) => {
    try {
        const userId = req.user?.id;
        const { q } = req.query;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        const query = (typeof q === 'string' ? q.trim() : '');
        // 搜索用户（排除自己），空查询时返回最近活跃用户
        const whereCondition = {
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
        const users = await index_1.prisma.user.findMany({
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
    }
    catch (error) {
        logger_1.logger.error('Search users error:', error);
        res.status(500).json({ message: '搜索用户失败', error: error.message });
    }
};
exports.searchUsers = searchUsers;
// 根据MIME类型获取扩展名
function getExtensionFromMimeType(mimeType) {
    const mimeMap = {
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
function getMimeTypeFromExtension(ext) {
    const extMap = {
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
function getAssetTypeFromMimeType(mimeType) {
    if (mimeType.startsWith('image/'))
        return 'IMAGE';
    if (mimeType.startsWith('video/'))
        return 'VIDEO';
    if (mimeType.startsWith('audio/'))
        return 'AUDIO';
    return 'DOCUMENT';
}
//# sourceMappingURL=asset-library.controller.js.map