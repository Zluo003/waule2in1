"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmDirectUpload = exports.getPresignedUrl = exports.recordRecycleItem = exports.permanentDeleteAsset = exports.restoreAsset = exports.listRecycleBin = exports.deleteAsset = exports.updateAsset = exports.getAsset = exports.getAssets = exports.uploadAsset = exports.upload = void 0;
const index_1 = require("../index");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const oss_1 = require("../utils/oss");
const storage_service_1 = require("../services/storage.service");
const logger_1 = require("../utils/logger");
const fileValidator_1 = require("../utils/fileValidator");
const content_moderation_service_1 = require("../services/content-moderation.service");
const storage_expiration_1 = require("../utils/storage-expiration");
// 创建上传目录
const uploadDir = path_1.default.join(process.cwd(), 'uploads');
if (!fs_1.default.existsSync(uploadDir)) {
    fs_1.default.mkdirSync(uploadDir, { recursive: true });
}
// 配置 multer 存储为内存，便于直传 OSS
const storage = multer_1.default.memoryStorage();
// 文件过滤器
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        // 图片（包括各种变体 MIME 类型）
        'image/png', 'image/x-png',
        'image/jpeg', 'image/jpg', 'image/pjpeg',
        'image/webp', 'image/gif', 'image/bmp', 'image/tiff',
        'image/svg+xml', 'image/heic', 'image/heif', 'image/avif',
        // 视频
        'video/mp4', 'video/quicktime', 'video/webm', 'video/avi', 'video/x-msvideo',
        'video/mpeg', 'video/x-matroska', 'video/3gpp',
        // 音频
        'audio/mpeg', 'audio/wav', 'audio/mp3', 'audio/ogg', 'audio/webm',
        'audio/aac', 'audio/flac', 'audio/x-m4a', 'audio/mp4',
        // 文档
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    }
    else {
        // 记录被拒绝的 MIME 类型，方便后续排查
        console.warn(`[Asset] 文件类型被拒绝: ${file.mimetype}, 文件名: ${file.originalname}`);
        cb(new Error(`不支持的文件类型: ${file.mimetype}`));
    }
};
// 配置 multer——使用合理的文件大小限制
exports.upload = (0, multer_1.default)({
    storage,
    fileFilter,
    limits: {
        fileSize: fileValidator_1.MAX_FILE_SIZES.video, // 最大支持视频大小 (500MB)
        files: 1, // 单次只允许上传一个文件
    }
});
// 上传文件
const uploadAsset = async (req, res) => {
    try {
        logger_1.logger.info('Upload request received:', {
            file: req.file ? 'present' : 'missing',
            userId: req.user?.id,
        });
        const file = req.file;
        const userId = req.user?.id;
        if (!file) {
            logger_1.logger.error('No file in upload request');
            return res.status(400).json({ message: '没有上传文件' });
        }
        if (!userId) {
            logger_1.logger.error('No userId in upload request');
            return res.status(401).json({ message: '未授权' });
        }
        // 验证文件 Magic Bytes
        if (!(0, fileValidator_1.validateFileMagicBytes)(file.buffer, file.mimetype)) {
            logger_1.logger.warn(`文件类型验证失败: ${file.originalname} (${file.mimetype})`);
            return res.status(400).json({ message: '文件类型与内容不匹配，请上传有效文件' });
        }
        // 根据文件类型检查大小限制
        const category = (0, fileValidator_1.getFileCategory)(file.mimetype);
        const maxSize = fileValidator_1.MAX_FILE_SIZES[category];
        if (file.size > maxSize) {
            logger_1.logger.warn(`文件超过大小限制: ${file.originalname} (${file.size} > ${maxSize})`);
            return res.status(400).json({ message: `文件超过大小限制 (${Math.round(maxSize / 1024 / 1024)}MB)` });
        }
        const { assetLibraryId, customName } = req.body;
        // 如果指定了资产库，验证资产库是否存在且属于当前用户
        if (assetLibraryId) {
            const library = await index_1.prisma.assetLibrary.findFirst({
                where: {
                    id: assetLibraryId,
                    userId,
                },
            });
            if (!library) {
                return res.status(404).json({ message: '资产库不存在' });
            }
        }
        // 上传到当前配置的存储（OSS 或本地）
        const ext = path_1.default.extname(file.originalname);
        const fileUrl = await storage_service_1.storageService.uploadBuffer(file.buffer, ext);
        // 内容安全审核（图片/视频）
        if ((0, content_moderation_service_1.isModerationEnabled)() && (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/'))) {
            try {
                const moderationResult = await (0, content_moderation_service_1.moderateContent)(fileUrl, file.mimetype, {
                    waitVideoResult: false, // 视频异步审核，不阻塞上传
                });
                if (!moderationResult.pass && moderationResult.suggestion === 'block') {
                    logger_1.logger.warn(`[Upload] 内容审核未通过: ${file.originalname}, 原因: ${moderationResult.reason}`);
                    // TODO: 可选删除 OSS 上的文件
                    return res.status(400).json({
                        message: `文件包含违规内容: ${moderationResult.reason || '请更换素材'}`,
                        moderationResult,
                    });
                }
                if (moderationResult.suggestion === 'review') {
                    logger_1.logger.info(`[Upload] 内容需人工复审: ${file.originalname}`);
                    // 可以在这里标记资产为待审核状态
                }
            }
            catch (moderationError) {
                logger_1.logger.error('[Upload] 内容审核服务异常:', moderationError.message);
                // 审核异常不阻塞上传
            }
        }
        // 解码原始文件名（multer 使用 latin1 编码）并消毒处理
        const decodedOriginalName = (0, fileValidator_1.sanitizeFilename)(Buffer.from(file.originalname, 'latin1').toString('utf8'));
        // 使用自定义名称或原始文件名（均需消毒处理）
        const displayName = customName?.trim()
            ? (0, fileValidator_1.sanitizeFilename)(customName.trim())
            : decodedOriginalName;
        // 计算存储过期时间
        const storageExpiresAt = await (0, storage_expiration_1.calculateStorageExpiresAt)(userId);
        // 保存到数据库
        const asset = await index_1.prisma.asset.create({
            data: {
                userId,
                assetLibraryId: assetLibraryId || null,
                name: displayName,
                originalName: decodedOriginalName,
                mimeType: file.mimetype,
                size: file.size,
                url: fileUrl,
                type: getAssetType(file.mimetype),
                metadata: { source: 'UPLOAD' },
                storageExpiresAt,
            }
        });
        logger_1.logger.info(`File uploaded: ${file.originalname} (${displayName}) by user ${userId} to library ${assetLibraryId || 'none'}`);
        res.json({
            success: true,
            data: {
                id: asset.id,
                name: asset.name,
                originalName: asset.originalName,
                url: asset.url,
                type: asset.type,
                mimeType: asset.mimeType,
                size: asset.size,
                assetLibraryId: asset.assetLibraryId,
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Upload asset error:', error);
        res.status(500).json({ message: '上传失败', error: error.message });
    }
};
exports.uploadAsset = uploadAsset;
// 获取用户所有资产
const getAssets = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        const assets = await index_1.prisma.asset.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json({
            success: true,
            data: assets,
        });
    }
    catch (error) {
        logger_1.logger.error('Get assets error:', error);
        res.status(500).json({ message: '获取资产列表失败', error: error.message });
    }
};
exports.getAssets = getAssets;
// 获取单个资产
const getAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const asset = await index_1.prisma.asset.findFirst({
            where: {
                id,
                userId,
            },
        });
        if (!asset) {
            return res.status(404).json({ message: '资产不存在' });
        }
        res.json({
            success: true,
            data: asset,
        });
    }
    catch (error) {
        logger_1.logger.error('Get asset error:', error);
        res.status(500).json({ message: '获取资产失败', error: error.message });
    }
};
exports.getAsset = getAsset;
// 更新资产
const updateAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const { name } = req.body;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        // 查找资产
        const asset = await index_1.prisma.asset.findFirst({
            where: {
                id,
                userId,
            },
        });
        if (!asset) {
            return res.status(404).json({ message: '资产不存在' });
        }
        // 更新资产
        const updatedAsset = await index_1.prisma.asset.update({
            where: { id },
            data: {
                name: name?.trim() || asset.name,
            },
        });
        logger_1.logger.info(`Asset updated: ${updatedAsset.name} by user ${userId}`);
        res.json({
            success: true,
            data: updatedAsset,
        });
    }
    catch (error) {
        logger_1.logger.error('Update asset error:', error);
        res.status(500).json({ message: '更新资产失败', error: error.message });
    }
};
exports.updateAsset = updateAsset;
// 删除资产
const deleteAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        const asset = await index_1.prisma.asset.findFirst({
            where: {
                id,
                userId,
            },
        });
        if (!asset) {
            return res.status(404).json({ message: '资产不存在' });
        }
        const meta = asset.metadata || {};
        const isGenerated = meta && meta.source === 'GENERATED';
        const isMedia = asset.type === 'IMAGE' || asset.type === 'VIDEO' || asset.type === 'AUDIO';
        if (isGenerated && isMedia) {
            const fileBase = asset.url ? path_1.default.basename(asset.url) : undefined;
            const updatedMeta = { ...meta, deleted: true, deletedAt: new Date().toISOString(), fileName: meta.fileName || fileBase };
            await index_1.prisma.asset.update({
                where: { id },
                data: { metadata: updatedMeta, assetLibraryId: null },
            });
            logger_1.logger.info(`Asset moved to recycle bin: ${asset.name} by user ${userId}`);
            return res.json({ success: true, message: '已移入回收站' });
        }
        const urlStr = asset.url || '';
        let deletedFile = false;
        if (urlStr.startsWith('/uploads/')) {
            const filePath = path_1.default.join(uploadDir, path_1.default.basename(urlStr));
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
                deletedFile = true;
            }
        }
        await index_1.prisma.asset.delete({ where: { id } });
        logger_1.logger.info(`Asset deleted${deletedFile ? ' and file removed' : ''}: ${asset.name} by user ${userId}`);
        res.json({ success: true, message: '删除成功' });
    }
    catch (error) {
        logger_1.logger.error('Delete asset error:', error);
        res.status(500).json({ message: '删除资产失败', error: error.message });
    }
};
exports.deleteAsset = deleteAsset;
const listRecycleBin = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        const { q, type, page = 1, limit = 50 } = req.query;
        // 🚀 尝试从缓存获取（无搜索条件时）
        const cacheKey = `recycle:${userId}:${type || 'ALL'}:${page}:${limit}`;
        if (!q) {
            try {
                const cached = await index_1.redis.get(cacheKey);
                if (cached) {
                    return res.json(JSON.parse(cached));
                }
            }
            catch { }
        }
        // 构建数据库层查询条件
        const whereClause = {
            userId,
            type: { in: ['IMAGE', 'VIDEO', 'AUDIO'] }, // 只查询媒体类型
            metadata: {
                path: ['deleted'],
                equals: true
            }
        };
        // 类型过滤
        if (type && String(type).toUpperCase() !== 'ALL') {
            whereClause.type = String(type).toUpperCase();
        }
        // 搜索过滤 - 使用数据库 LIKE 查询
        if (q && typeof q === 'string' && q.trim()) {
            const query = q.trim();
            whereClause.OR = [
                { name: { contains: query, mode: 'insensitive' } },
                { originalName: { contains: query, mode: 'insensitive' } }
            ];
        }
        // 🚀 分页参数
        const take = Math.min(Number(limit) || 50, 100);
        const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
        // 🚀 并行执行查询和计数
        const [filtered, total] = await Promise.all([
            index_1.prisma.asset.findMany({
                where: whereClause,
                orderBy: { createdAt: 'desc' },
                skip,
                take,
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
                    createdAt: true
                }
            }),
            index_1.prisma.asset.count({ where: whereClause })
        ]);
        const result = {
            success: true,
            data: filtered,
            pagination: { page: Number(page), limit: take, total }
        };
        // 🚀 缓存 30 秒（无搜索条件时）
        if (!q) {
            try {
                await index_1.redis.set(cacheKey, JSON.stringify(result), 'EX', 30);
            }
            catch { }
        }
        res.json(result);
    }
    catch (error) {
        logger_1.logger.error('List recycle bin error:', error);
        res.status(500).json({ message: '获取回收站失败', error: error.message });
    }
};
exports.listRecycleBin = listRecycleBin;
const restoreAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: '未授权' });
        const asset = await index_1.prisma.asset.findFirst({ where: { id, userId } });
        if (!asset)
            return res.status(404).json({ message: '资产不存在' });
        const meta = asset.metadata || {};
        if (meta.source !== 'GENERATED')
            return res.status(400).json({ message: '仅生成类媒体可恢复' });
        const updated = await index_1.prisma.asset.update({
            where: { id },
            data: { metadata: { ...meta, deleted: false, deletedAt: null } },
        });
        // 🚀 清除回收站缓存
        try {
            const keys = await index_1.redis.keys(`recycle:${userId}:*`);
            if (keys.length > 0)
                await index_1.redis.del(...keys);
        }
        catch { }
        res.json({ success: true, data: updated });
    }
    catch (error) {
        logger_1.logger.error('Restore asset error:', error);
        res.status(500).json({ message: '恢复资产失败', error: error.message });
    }
};
exports.restoreAsset = restoreAsset;
const permanentDeleteAsset = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: '未授权' });
        const asset = await index_1.prisma.asset.findFirst({ where: { id, userId } });
        if (!asset)
            return res.status(404).json({ message: '资产不存在' });
        const urlStr = asset.url || '';
        let deletedFile = false;
        if (urlStr.startsWith('/uploads/')) {
            const filePath = path_1.default.join(uploadDir, path_1.default.basename(urlStr));
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
                deletedFile = true;
            }
        }
        await index_1.prisma.asset.delete({ where: { id } });
        // 🚀 清除回收站缓存
        try {
            const keys = await index_1.redis.keys(`recycle:${userId}:*`);
            if (keys.length > 0)
                await index_1.redis.del(...keys);
        }
        catch { }
        logger_1.logger.info(`Asset permanently deleted${deletedFile ? ' and file removed' : ''}: ${asset.name} by user ${userId}`);
        res.json({ success: true, message: '已彻底删除' });
    }
    catch (error) {
        logger_1.logger.error('Permanent delete asset error:', error);
        res.status(500).json({ message: '彻底删除失败', error: error.message });
    }
};
exports.permanentDeleteAsset = permanentDeleteAsset;
const recordRecycleItem = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ message: '未授权' });
        const { url, type, name, projectName } = req.body;
        if (!url || !type)
            return res.status(400).json({ message: '缺少必要参数' });
        let fileName = undefined;
        try {
            const urlObj = new URL(url, 'http://placeholder');
            const p = urlObj.pathname || '';
            fileName = p.split('/').filter(Boolean).pop() || undefined;
        }
        catch {
            fileName = url.split('/').filter(Boolean).pop();
        }
        const fileBaseName = fileName || undefined;
        const candidates = await index_1.prisma.asset.findMany({
            where: {
                userId,
                OR: [
                    { url },
                    fileBaseName ? { originalName: fileBaseName } : undefined,
                    fileBaseName ? { name: fileBaseName } : undefined,
                ].filter(Boolean),
            },
        });
        const inLibrary = candidates.find((a) => {
            const m = a.metadata || {};
            const aFile = m.fileName || (a.url ? path_1.default.basename(a.url) : undefined);
            return a.assetLibraryId !== null && (a.url === url || m.originalUrl === url || aFile === fileBaseName);
        });
        if (inLibrary) {
            return res.status(200).json({ success: true, skipped: true, reason: 'IN_LIBRARY' });
        }
        const already = candidates.find((a) => {
            const m = a.metadata || {};
            const isMedia = a.type === 'IMAGE' || a.type === 'VIDEO' || a.type === 'AUDIO';
            const aFile = m.fileName || (a.url ? path_1.default.basename(a.url) : undefined);
            const sameOrigin = a.url === url || m.originalUrl === url || aFile === fileBaseName;
            return isMedia && sameOrigin && m.source === 'GENERATED' && m.deleted === true;
        });
        if (already) {
            return res.status(200).json({ success: true, skipped: true, reason: 'ALREADY_RECORDED', data: already });
        }
        const asset = await index_1.prisma.asset.create({
            data: {
                userId,
                assetLibraryId: null,
                name: (name && String(name).trim()) || `${type.toLowerCase()}-preview-${Date.now()}`,
                originalName: (name && String(name).trim()) || `${type.toLowerCase()}-preview`,
                type,
                mimeType: 'application/octet-stream',
                size: 0,
                url,
                metadata: { source: 'GENERATED', deleted: true, deletedAt: new Date().toISOString(), projectName: projectName || null, fileName: fileName || null },
            },
        });
        logger_1.logger.info(`Recycle item recorded: ${asset.name} (${asset.id}) by user ${userId}`);
        res.status(201).json({ success: true, data: asset });
    }
    catch (error) {
        logger_1.logger.error('Record recycle item error:', error);
        res.status(500).json({ message: '记录回收站项目失败', error: error.message });
    }
};
exports.recordRecycleItem = recordRecycleItem;
// 根据 MIME 类型确定资产类型
function getAssetType(mimeType) {
    if (mimeType.startsWith('image/'))
        return 'IMAGE';
    if (mimeType.startsWith('video/'))
        return 'VIDEO';
    if (mimeType.startsWith('audio/'))
        return 'AUDIO';
    return 'DOCUMENT';
}
// 获取前端直传 OSS 的预签名 URL
const getPresignedUrl = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        const { fileName, contentType } = req.body;
        if (!fileName || !contentType) {
            return res.status(400).json({ message: '缺少 fileName 或 contentType' });
        }
        // 检查存储模式
        const storageMode = await storage_service_1.storageService.getStorageMode();
        // 如果是本地存储模式，返回特殊标记
        if (storageMode === 'local') {
            return res.json({
                success: true,
                data: {
                    mode: 'local',
                    uploadUrl: '/api/assets/upload', // 使用服务器上传接口
                },
            });
        }
        // OSS 模式或 original 模式：返回预签名 URL
        // original 模式下，用户创建的内容（如画布导出）仍需上传到 OSS
        const ext = path_1.default.extname(fileName);
        const result = await (0, oss_1.generatePresignedUrl)(ext, contentType);
        res.json({
            success: true,
            data: {
                mode: 'oss',
                ...result,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('获取预签名 URL 失败:', error);
        res.status(500).json({ message: '获取上传地址失败', error: error.message });
    }
};
exports.getPresignedUrl = getPresignedUrl;
// 确认前端直传完成，创建资产记录
const confirmDirectUpload = async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ message: '未授权' });
        }
        const { objectKey, publicUrl, fileName, contentType, size, assetLibraryId, customName } = req.body;
        if (!objectKey || !publicUrl || !fileName || !contentType) {
            return res.status(400).json({ message: '缺少必要参数' });
        }
        // 如果指定了资产库，验证资产库是否存在且属于当前用户
        if (assetLibraryId) {
            const library = await index_1.prisma.assetLibrary.findFirst({
                where: { id: assetLibraryId, userId },
            });
            if (!library) {
                return res.status(404).json({ message: '资产库不存在' });
            }
        }
        // 内容安全审核（图片/视频）
        if ((0, content_moderation_service_1.isModerationEnabled)() && (contentType.startsWith('image/') || contentType.startsWith('video/'))) {
            try {
                const moderationResult = await (0, content_moderation_service_1.moderateContent)(publicUrl, contentType, {
                    waitVideoResult: false, // 视频异步审核，不阻塞上传
                });
                if (!moderationResult.pass && moderationResult.suggestion === 'block') {
                    logger_1.logger.warn(`[DirectUpload] 内容审核未通过: ${fileName}, 原因: ${moderationResult.reason}`);
                    // TODO: 可选删除 OSS 上的文件
                    return res.status(400).json({
                        message: `文件包含违规内容: ${moderationResult.reason || '请更换素材'}`,
                        moderationResult,
                    });
                }
                if (moderationResult.suggestion === 'review') {
                    logger_1.logger.info(`[DirectUpload] 内容需人工复审: ${fileName}`);
                }
            }
            catch (moderationError) {
                logger_1.logger.error('[DirectUpload] 内容审核服务异常:', moderationError.message);
                // 审核异常不阻塞上传
            }
        }
        // 解码原始文件名
        const decodedOriginalName = fileName;
        const displayName = customName?.trim() || decodedOriginalName;
        const assetType = getAssetType(contentType);
        // 计算存储过期时间
        const storageExpiresAt = await (0, storage_expiration_1.calculateStorageExpiresAt)(userId);
        // 保存到数据库
        const asset = await index_1.prisma.asset.create({
            data: {
                userId,
                assetLibraryId: assetLibraryId || null,
                name: displayName,
                originalName: decodedOriginalName,
                type: assetType,
                mimeType: contentType,
                size: size || 0,
                url: publicUrl,
                storageExpiresAt,
            },
        });
        logger_1.logger.info(`Direct upload confirmed: ${asset.name} (${asset.id}) by user ${userId}`);
        // 清除资产库缓存（如果上传到了资产库）
        if (assetLibraryId) {
            try {
                const keys = await index_1.redis.keys(`lib:assets:${assetLibraryId}:*`);
                if (keys.length > 0) {
                    await index_1.redis.del(...keys);
                    logger_1.logger.info(`[Cache] Cleared ${keys.length} cache keys for library ${assetLibraryId}`);
                }
            }
            catch (cacheError) {
                logger_1.logger.warn(`[Cache] Failed to clear cache: ${cacheError.message}`);
            }
        }
        res.status(201).json({
            success: true,
            data: asset,
        });
    }
    catch (error) {
        logger_1.logger.error('确认直传上传失败:', error);
        res.status(500).json({ message: '确认上传失败', error: error.message });
    }
};
exports.confirmDirectUpload = confirmDirectUpload;
//# sourceMappingURL=asset.controller.js.map