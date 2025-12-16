"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = generateImage;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const oss_1 = require("../../utils/oss");
function toPublicUrlOrBase64(inputUrl) {
    if (!inputUrl)
        return inputUrl;
    if (inputUrl.startsWith('data:'))
        return inputUrl;
    const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || '';
    if (inputUrl.startsWith('/uploads/')) {
        if (PUBLIC_BASE_URL) {
            const full = `${PUBLIC_BASE_URL}${inputUrl}`;
            return full;
        }
        try {
            const fullPath = path_1.default.join(process.cwd(), inputUrl);
            const buf = fs_1.default.readFileSync(fullPath);
            const ext = path_1.default.extname(fullPath).toLowerCase();
            const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
            const mime = mimeMap[ext] || 'image/jpeg';
            return `data:${mime};base64,${buf.toString('base64')}`;
        }
        catch {
            return inputUrl;
        }
    }
    if (inputUrl.startsWith('http://') || inputUrl.startsWith('https://')) {
        const lower = inputUrl.toLowerCase();
        if (lower.includes('localhost') || lower.includes('127.0.0.1')) {
            if (PUBLIC_BASE_URL && inputUrl.includes('/uploads/')) {
                const idx = inputUrl.indexOf('/uploads/');
                return `${PUBLIC_BASE_URL}${inputUrl.substring(idx)}`;
            }
            try {
                const urlObj = new URL(inputUrl);
                const fullPath = path_1.default.join(process.cwd(), urlObj.pathname);
                const buf = fs_1.default.readFileSync(fullPath);
                const ext = path_1.default.extname(fullPath).toLowerCase();
                const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
                const mime = mimeMap[ext] || 'image/jpeg';
                return `data:${mime};base64,${buf.toString('base64')}`;
            }
            catch {
                return inputUrl;
            }
        }
        return inputUrl;
    }
    return inputUrl;
}
async function generateImage(options) {
    const { prompt, modelId, aspectRatio, referenceImages = [], apiKey, apiUrl, } = options;
    const API_KEY = apiKey || process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY;
    const DEFAULT_BASE = 'https://dashscope.aliyuncs.com/api/v1';
    const DEFAULT_INTL_BASE = 'https://dashscope-intl.aliyuncs.com/api/v1';
    const raw = (apiUrl || '').trim();
    const useIntl = raw.includes('dashscope-intl.aliyuncs.com');
    const base = useIntl ? DEFAULT_INTL_BASE : DEFAULT_BASE;
    const endpoint = /\/services\/aigc\//.test(raw) ? raw : `${base}/services/aigc/multimodal-generation/generation`;
    if (!API_KEY) {
        throw new Error('阿里云百炼 API 密钥未配置');
    }
    try {
        const contentParts = [];
        const images = referenceImages.slice(0, 3).map(toPublicUrlOrBase64);
        for (const img of images) {
            contentParts.push({ image: img });
        }
        contentParts.push({ text: prompt });
        const requestBody = {
            model: modelId,
            input: {
                messages: [
                    {
                        role: 'user',
                        content: contentParts,
                    },
                ],
            },
            parameters: {
                n: 1,
                negative_prompt: ' ',
                prompt_extend: true,
                watermark: false,
            },
        };
        if (aspectRatio) {
            const ratioToSize = {
                '16:9': '1664*928',
                '4:3': '1472*1140',
                '1:1': '1328*1328',
                '3:4': '1140*1472',
                '9:16': '928*1664',
            };
            const size = ratioToSize[aspectRatio];
            if (size && requestBody.parameters.n === 1) {
                requestBody.parameters.size = size;
            }
        }
        const response = await axios_1.default.post(endpoint, requestBody, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 180000,
        });
        const contents = response.data?.output?.choices?.[0]?.message?.content || [];
        const firstImageUrl = contents.find((c) => c.image)?.image;
        if (!firstImageUrl) {
            throw new Error('未返回图像URL');
        }
        try {
            const ossUrl = await (0, oss_1.downloadAndUploadToOss)(firstImageUrl, 'qwen-edit');
            return ossUrl;
        }
        catch (e) {
            return firstImageUrl;
        }
    }
    catch (error) {
        if (error.response?.data) {
            const err = error.response.data;
            throw new Error(err.message || JSON.stringify(err));
        }
        throw new Error(error.message || '阿里云百炼图像编辑失败');
    }
}
exports.default = {
    generateImage,
};
//# sourceMappingURL=aliyun.service.js.map