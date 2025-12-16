"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = generateImage;
const axios_1 = __importDefault(require("axios"));
const oss_1 = require("../../utils/oss");
// 下载图片并上传到 OSS
async function downloadImage(url) {
    return (0, oss_1.downloadAndUploadToOss)(url, 'minimaxi-image');
}
// 通过文件 ID 下载并上传到 OSS
async function downloadByFileId(baseUrl, apiKey, fileId) {
    const url = `${baseUrl}/files/retrieve_content?file_id=${encodeURIComponent(fileId)}`;
    try {
        return await (0, oss_1.downloadAndUploadToOss)(url, 'minimaxi-image', { Authorization: `Bearer ${apiKey}` });
    }
    catch {
        return url;
    }
}
async function generateImage(options) {
    const { prompt, modelId, aspectRatio = '1:1', referenceImages = [], apiKey, apiUrl, n = 1 } = options;
    const KEY = apiKey || process.env.MINIMAX_API_KEY || process.env.MINIMAXI_API_KEY || process.env.MINIMAX_API_TOKEN;
    const BASE = apiUrl || 'https://api.minimaxi.com/v1';
    if (!KEY)
        throw new Error('MiniMax API 密钥未配置');
    const hasRefs = Array.isArray(referenceImages) && referenceImages.length > 0;
    let imageUrls = undefined;
    if (hasRefs) {
        imageUrls = [];
        for (const u of referenceImages) {
            if (!u)
                continue;
            if (u.startsWith('data:')) {
                const m = /^data:(.+?);base64,(.*)$/i.exec(u);
                const ext = m && /png/i.test(m[1]) ? '.png' : '.jpg';
                const b64 = m ? m[2] : u.split(',')[1];
                if (b64) {
                    const url = await (0, oss_1.uploadBuffer)(Buffer.from(b64, 'base64'), ext);
                    imageUrls.push(url);
                }
            }
            else {
                const url = await (0, oss_1.ensureAliyunOssUrl)(u);
                imageUrls.push(String(url || u));
            }
        }
    }
    const payload = { model: modelId, prompt, aspect_ratio: aspectRatio, n, response_format: 'url' };
    if (imageUrls && imageUrls.length > 0) {
        // 文档示例字段：image_file（单图）；部分 SDK 表示为 image_url
        // 为兼容性：优先使用 image_file / image_files
        if (imageUrls.length === 1) {
            payload.subject_reference = [{ type: 'character', image_file: imageUrls[0] }];
        }
        else {
            payload.subject_reference = [{ type: 'character', image_files: imageUrls }];
        }
    }
    const resp = await axios_1.default.post(`${BASE}/image_generation`, payload, { headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, timeout: 180000 });
    const data = resp.data || {};
    const genUrlsArr = (data?.data?.image_urls || data?.image_urls || data?.data?.images || data?.images);
    if (Array.isArray(genUrlsArr) && genUrlsArr.length > 0)
        return await downloadImage(String(genUrlsArr[0]));
    const genUrlStr = (data?.data?.image_url || data?.image_url || data?.data?.image_file || data?.image_file);
    if (typeof genUrlStr === 'string' && genUrlStr)
        return await downloadImage(String(genUrlStr));
    const images = data.data || data.images || [];
    const fileId = data.file_id || data.data?.file_id;
    if (fileId)
        return await downloadByFileId(BASE, KEY, String(fileId));
    if (Array.isArray(images) && images.length > 0) {
        const item = images[0];
        const url = item.url || item.image_url || item.data?.url;
        const b64 = item.b64_json || item.base64;
        if (url)
            return await downloadImage(String(url));
        if (b64) {
            // Base64 直接上传到 OSS
            const buf = Buffer.from(String(b64), 'base64');
            return await (0, oss_1.uploadBuffer)(buf, '.png');
        }
    }
    const status = data?.status || data?.base_resp?.status_msg;
    if (String(status).toLowerCase() === 'success') {
        throw new Error('MiniMax 成功但未返回图片数据');
    }
    const errMsg = data?.error?.message || data?.base_resp?.status_msg || 'MiniMax 图片生成失败';
    throw new Error(errMsg);
}
exports.default = { generateImage };
//# sourceMappingURL=minimaxi.image.service.js.map