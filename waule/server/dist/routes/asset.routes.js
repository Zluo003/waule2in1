"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const asset_controller_1 = require("../controllers/asset.controller");
const logger_1 = require("../utils/logger");
const axios_1 = __importDefault(require("axios"));
const oss_1 = require("../utils/oss");
const index_1 = require("../index");
const router = (0, express_1.Router)();
// 公开的代理端点（用于跨域/预览，不要求鉴权）
// Multer 错误处理中间件
const handleMulterError = (err, req, res, next) => {
    if (err) {
        logger_1.logger.error('Multer error:', err);
        return res.status(400).json({ message: err.message || '文件上传失败' });
    }
    next();
};
// 通用代理下载端点 - 支持自定义文件名
router.get('/proxy-download-with-name', async (req, res) => {
    try {
        const { url, filename } = req.query;
        const rawUrl = typeof url === 'string' ? decodeURIComponent(url) : '';
        const downloadName = typeof filename === 'string' ? decodeURIComponent(filename) : '';
        if (!rawUrl) {
            return res.status(400).json({ message: '缺少资源URL参数' });
        }
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
            return res.status(400).json({ message: '无效的URL格式' });
        }
        // 国内CDN不走代理
        const isChinaCdn = /oscdn2\.dyysy\.com|soraapi\.aimuse\.club|\.aliyuncs\.com/i.test(rawUrl);
        logger_1.logger.info('代理下载资源:', { url: rawUrl.substring(0, 100), filename: downloadName, isChinaCdn });
        const response = await axios_1.default.get(rawUrl, {
            responseType: 'arraybuffer',
            timeout: 300000,
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 300,
        });
        const buffer = Buffer.from(response.data);
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        // 确定最终文件名
        let finalName = downloadName;
        if (!finalName) {
            // 从URL提取文件名
            const urlParts = rawUrl.split('/');
            finalName = urlParts[urlParts.length - 1].split('?')[0] || `download-${Date.now()}`;
        }
        // 设置响应头
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(finalName)}"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.send(buffer);
    }
    catch (error) {
        logger_1.logger.error('资源代理下载失败:', error);
        res.status(500).json({
            success: false,
            message: '资源下载失败: ' + error.message
        });
    }
});
// 图片代理下载端点 - 解决CORS问题
router.get('/proxy-download', async (req, res) => {
    try {
        const { url } = req.query;
        const rawUrl = typeof url === 'string' ? decodeURIComponent(url) : '';
        if (!rawUrl) {
            return res.status(400).json({ message: '缺少资源URL参数' });
        }
        // 验证URL格式
        if (!rawUrl.startsWith('http://') && !rawUrl.startsWith('https://')) {
            return res.status(400).json({ message: '无效的URL格式' });
        }
        // 国内CDN不走代理
        const isChinaCdn = /oscdn2\.dyysy\.com|soraapi\.aimuse\.club|\.aliyuncs\.com/i.test(rawUrl);
        logger_1.logger.info('代理下载资源:', { url: rawUrl.substring(0, 100), isChinaCdn });
        const resolveUrl = (raw) => {
            try {
                const u = new URL(raw);
                const host = req.get('host') || '';
                const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
                if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
                    return `${proto}://${host}${u.pathname}${u.search}`;
                }
                return raw;
            }
            catch {
                return raw;
            }
        };
        const finalUrl = resolveUrl(rawUrl);
        const tryReadLocal = async (raw) => {
            try {
                const u = new URL(raw);
                const host = req.get('host') || '';
                if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === host) {
                    const p = decodeURIComponent(u.pathname);
                    if (p.startsWith('/uploads/')) {
                        const pathMod = require('path');
                        const fs = require('fs');
                        const rel = p.replace(/^\/+/, '');
                        const fsPath = pathMod.join(process.cwd(), rel);
                        if (fs.existsSync(fsPath)) {
                            const data = await fs.promises.readFile(fsPath);
                            const ext = (pathMod.extname(fsPath) || '').toLowerCase();
                            let contentType = 'application/octet-stream';
                            if (ext === '.mp3' || ext === '.mpeg')
                                contentType = 'audio/mpeg';
                            else if (ext === '.wav')
                                contentType = 'audio/wav';
                            else if (ext === '.ogg')
                                contentType = 'audio/ogg';
                            else if (ext === '.mp4' || ext === '.m4a')
                                contentType = 'audio/mp4';
                            else if (ext === '.flac')
                                contentType = 'audio/flac';
                            return { buffer: data, contentType };
                        }
                    }
                }
            }
            catch { }
            return null;
        };
        const local = await tryReadLocal(finalUrl);
        if (local) {
            res.setHeader('Content-Type', local.contentType);
            res.setHeader('Content-Length', local.buffer.length);
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Access-Control-Allow-Origin', '*');
            return res.send(local.buffer);
        }
        // 如果是本机 /uploads 路径但文件不存在，则尝试上传到 OSS 并从 OSS 读取
        try {
            const u = new URL(finalUrl);
            if (u.pathname.startsWith('/uploads/')) {
                const pathMod = require('path');
                const fs = require('fs');
                const rel = u.pathname.replace(/^\/+/, '');
                const fsPath = pathMod.join(process.cwd(), rel);
                if (!fs.existsSync(fsPath)) {
                    const ossUrl = await (0, oss_1.ensureAliyunOssUrl)(fsPath);
                    if (ossUrl && typeof ossUrl === 'string') {
                        const resp2 = await axios_1.default.get(ossUrl, {
                            responseType: 'arraybuffer',
                            timeout: 60000,
                            maxRedirects: 5,
                            validateStatus: (status) => status >= 200 && status < 300,
                        });
                        const buf2 = Buffer.from(resp2.data);
                        const ct2 = resp2.headers['content-type'] || 'application/octet-stream';
                        res.setHeader('Content-Type', ct2);
                        res.setHeader('Content-Length', buf2.length);
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        return res.send(buf2);
                    }
                }
            }
        }
        catch { }
        const response = await axios_1.default.get(finalUrl, {
            responseType: 'arraybuffer',
            timeout: 300000,
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'audio/*,video/*,image/*,*/*',
                'Range': 'bytes=0-',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
        });
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        const buf = Buffer.from(response.data);
        let contentLengthHdr = String(buf.length);
        const contentRangeHdr = response.headers['content-range'];
        // 从URL中提取文件名
        const urlObj = new URL(finalUrl);
        const pathParts = urlObj.pathname.split('/');
        const rawFileName = pathParts[pathParts.length - 1];
        // 获取文件扩展名
        let extension = rawFileName.split('.').pop() || 'bin';
        if (contentType.includes('mpeg'))
            extension = 'mp3';
        else if (contentType.includes('wav'))
            extension = 'wav';
        else if (contentType.includes('ogg'))
            extension = 'ogg';
        else if (contentType.includes('mp4'))
            extension = 'mp4';
        else if (contentType.includes('flac'))
            extension = 'flac';
        const fileName = rawFileName.split('?')[0] || `image-${Date.now()}.${extension}`;
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', contentLengthHdr);
        if (contentRangeHdr)
            res.setHeader('Content-Range', contentRangeHdr);
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Length, Content-Range');
        res.send(buf);
    }
    catch (error) {
        logger_1.logger.error('资源代理下载失败:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
        });
        res.status(500).json({
            success: false,
            message: '资源下载失败: ' + error.message
        });
    }
});
router.get('/proxy-stream', async (req, res) => {
    try {
        const { url } = req.query;
        const rawUrl = typeof url === 'string' ? decodeURIComponent(url) : '';
        if (!rawUrl || !(rawUrl.startsWith('http://') || rawUrl.startsWith('https://'))) {
            return res.status(400).json({ message: '无效的URL' });
        }
        const resolveUrl = (raw) => {
            try {
                const u = new URL(raw);
                const host = req.get('host') || '';
                const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
                if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
                    return `${proto}://${host}${u.pathname}${u.search}`;
                }
                return raw;
            }
            catch {
                return raw;
            }
        };
        const finalUrl = resolveUrl(rawUrl);
        const tryLocal = async () => {
            try {
                const u = new URL(finalUrl);
                const host = req.get('host') || '';
                if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === host) {
                    const p = decodeURIComponent(u.pathname);
                    if (p.startsWith('/uploads/')) {
                        const pathMod = require('path');
                        const fs = require('fs');
                        const rel = p.replace(/^\/+/, '');
                        const fsPath = pathMod.join(process.cwd(), rel);
                        if (fs.existsSync(fsPath)) {
                            const stat = fs.statSync(fsPath);
                            const range = req.headers.range;
                            const ext = (pathMod.extname(fsPath) || '').toLowerCase();
                            let contentType = 'application/octet-stream';
                            if (ext === '.mp3' || ext === '.mpeg')
                                contentType = 'audio/mpeg';
                            else if (ext === '.wav')
                                contentType = 'audio/wav';
                            else if (ext === '.ogg')
                                contentType = 'audio/ogg';
                            else if (ext === '.mp4' || ext === '.m4a')
                                contentType = 'audio/mp4';
                            else if (ext === '.flac')
                                contentType = 'audio/flac';
                            if (range) {
                                const parts = range.replace(/bytes=/, '').split('-');
                                const start = parseInt(parts[0], 10);
                                const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                                const chunkSize = end - start + 1;
                                res.status(206);
                                res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
                                res.setHeader('Accept-Ranges', 'bytes');
                                res.setHeader('Content-Length', chunkSize);
                                res.setHeader('Content-Type', contentType);
                                res.setHeader('Access-Control-Allow-Origin', '*');
                                fs.createReadStream(fsPath, { start, end }).pipe(res);
                            }
                            else {
                                res.status(200);
                                res.setHeader('Content-Length', stat.size);
                                res.setHeader('Content-Type', contentType);
                                res.setHeader('Access-Control-Allow-Origin', '*');
                                fs.createReadStream(fsPath).pipe(res);
                            }
                            return true;
                        }
                    }
                }
            }
            catch { }
            return false;
        };
        const servedLocal = await tryLocal();
        if (servedLocal)
            return;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'audio/*,video/*,image/*,*/*',
        };
        if (req.headers.range)
            headers['Range'] = req.headers.range;
        const response = await axios_1.default.get(finalUrl, {
            responseType: 'stream',
            timeout: 300000, // 5分钟超时
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 400,
            headers,
        });
        let contentType = response.headers['content-type'] || 'application/octet-stream';
        if (!contentType || contentType === 'application/octet-stream') {
            try {
                const head = await axios_1.default.head(finalUrl, { timeout: 15000, maxRedirects: 3, validateStatus: (s) => s >= 200 && s < 400 });
                const ct2 = head.headers['content-type'];
                if (ct2)
                    contentType = ct2;
            }
            catch { }
        }
        const contentLength = response.headers['content-length'];
        const contentRange = response.headers['content-range'];
        if (contentRange)
            res.status(206);
        else
            res.status(200);
        if (contentLength)
            res.setHeader('Content-Length', contentLength);
        if (contentRange)
            res.setHeader('Content-Range', contentRange);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', contentType);
        res.setHeader('Access-Control-Allow-Origin', '*');
        response.data.on('error', () => { try {
            res.end();
        }
        catch { } });
        response.data.pipe(res);
    }
    catch (error) {
        res.status(500).json({ success: false, message: error?.message || '代理流失败' });
    }
});
// 之后的资源管理端点需要鉴权
router.use(auth_1.authenticateToken);
// 资产下载接口 - 使用资产名称作为下载文件名
router.get('/download/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { filename } = req.query;
        // 获取资产信息
        const asset = await index_1.prisma.asset.findUnique({
            where: { id },
        });
        if (!asset) {
            return res.status(404).json({ message: '资产不存在' });
        }
        // 解析资产URL
        const resolveUrl = (url) => {
            if (url.startsWith('http://') || url.startsWith('https://')) {
                return url;
            }
            const host = req.get('host') || '';
            const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
            return `${proto}://${host}${url}`;
        };
        const assetUrl = resolveUrl(asset.url);
        // 确定下载文件名
        let downloadName = filename || asset.name;
        // 如果名称没有扩展名，从原始文件名获取
        if (!downloadName.includes('.')) {
            const getExt = (fname) => {
                const match = fname.match(/\.[^.]+$/);
                return match ? match[0] : '';
            };
            const ext = getExt(asset.originalName || asset.url);
            downloadName = downloadName + ext;
        }
        logger_1.logger.info(`下载资产: ${asset.name} (${downloadName}) from ${assetUrl}`);
        // 下载文件
        const response = await axios_1.default.get(assetUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxRedirects: 5,
            validateStatus: (status) => status >= 200 && status < 300,
        });
        // axios的arraybuffer响应已经是Buffer，不需要再转换
        const buffer = Buffer.isBuffer(response.data) ? response.data : Buffer.from(response.data);
        const contentType = response.headers['content-type'] || asset.mimeType || 'application/octet-stream';
        logger_1.logger.info(`资产下载成功，大小: ${buffer.length} bytes`);
        // 设置响应头
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
        res.send(buffer);
    }
    catch (error) {
        logger_1.logger.error('资产下载失败:', error);
        res.status(500).json({
            success: false,
            message: '资产下载失败: ' + error.message
        });
    }
});
// Asset management
router.get('/', asset_controller_1.getAssets);
router.post('/upload', asset_controller_1.upload.single('file'), handleMulterError, asset_controller_1.uploadAsset);
// 前端直传 OSS 相关接口
router.post('/presigned-url', asset_controller_1.getPresignedUrl);
router.post('/confirm-upload', asset_controller_1.confirmDirectUpload);
// 服务器转存接口（前端转存失败时的回退）
router.post('/transfer-url', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ success: false, message: '缺少 url 参数' });
        }
        // 如果已经是 OSS URL，直接返回
        if (url.includes('aliyuncs.com')) {
            return res.json({ success: true, data: { url } });
        }
        logger_1.logger.info('[转存] 服务器转存:', url.substring(0, 100));
        const ossUrl = await (0, oss_1.downloadAndUploadToOss)(url, 'transfer');
        res.json({ success: true, data: { url: ossUrl } });
    }
    catch (error) {
        logger_1.logger.error('[转存] 失败:', error.message);
        res.status(500).json({ success: false, message: '转存失败: ' + error.message });
    }
});
router.get('/:id', asset_controller_1.getAsset);
router.put('/:id', asset_controller_1.updateAsset);
router.delete('/:id', asset_controller_1.deleteAsset);
// Recycle bin
router.get('/recycle/bin', asset_controller_1.listRecycleBin);
router.post('/:id/restore', asset_controller_1.restoreAsset);
router.delete('/:id/permanent', asset_controller_1.permanentDeleteAsset);
router.post('/recycle/record', asset_controller_1.recordRecycleItem);
exports.default = router;
//# sourceMappingURL=asset.routes.js.map