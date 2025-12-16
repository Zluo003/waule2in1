"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVideoFromFirstFrame = generateVideoFromFirstFrame;
exports.generateVideoFromText = generateVideoFromText;
exports.generateVideoRetalk = generateVideoRetalk;
exports.generateVideoStylize = generateVideoStylize;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const oss_1 = require("../../utils/oss");
async function uploadBufferToFallbackHost(buffer, filename) {
    const FormData = require('form-data');
    const smmsApiToken = process.env.SMMS_API_TOKEN;
    if (!smmsApiToken) {
        throw new Error('sm.ms 上传失败: 未配置 SMMS_API_TOKEN');
    }
    const formData = new FormData();
    const finalFilename = filename || `${crypto_1.default.randomUUID()}.jpg`;
    formData.append('smfile', buffer, {
        filename: finalFilename,
        contentType: 'image/jpeg',
    });
    try {
        const response = await axios_1.default.post('https://sm.ms/api/v2/upload', formData, {
            headers: {
                ...formData.getHeaders(),
                'Authorization': `Basic ${smmsApiToken}`,
            },
            timeout: 60000,
        });
        if (response.data?.success && response.data?.data?.url) {
            return response.data.data.url;
        }
        // 针对图片已存在的情况（code: image_repeated）
        if (response.data?.code === 'image_repeated' && response.data?.images) {
            return response.data.images;
        }
        throw new Error(response.data?.message || 'sm.ms 返回未知错误');
    }
    catch (error) {
        if (error.response?.data) {
            throw new Error(`sm.ms 上传失败: ${JSON.stringify(error.response.data)}`);
        }
        throw new Error(`sm.ms 上传失败: ${error.message}`);
    }
}
/**
 * 通义万相 - 首帧生视频
 * API文档: https://bailian.console.aliyun.com/?tab=api#/api/?type=model&url=2867393
 */
async function generateVideoFromFirstFrame(options) {
    const { prompt, modelId, firstFrameImage, duration = 5, // 默认5秒
    resolution = '1080P', // 默认1080P
    apiKey, apiUrl, replaceImageUrl, replaceVideoUrl, mode = 'wan-std', } = options;
    const cleanUrl = (u) => {
        if (!u)
            return u;
        const trimmed = u.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, "");
        return trimmed;
    };
    const safeReplaceImageUrl = cleanUrl(replaceImageUrl);
    const safeReplaceVideoUrl = cleanUrl(replaceVideoUrl);
    // API配置
    const API_KEY = apiKey || process.env.WANX_API_KEY || process.env.ALIYUN_API_KEY;
    const DEFAULT_BASE = 'https://dashscope.aliyuncs.com';
    const DEFAULT_INTL_BASE = 'https://dashscope-intl.aliyuncs.com';
    const rawApi = (apiUrl || '').trim();
    const useIntl = rawApi.includes('dashscope-intl.aliyuncs.com');
    const base = useIntl ? DEFAULT_INTL_BASE : DEFAULT_BASE;
    if (!API_KEY) {
        throw new Error('通义万相 API 密钥未配置');
    }
    // 处理首帧图片
    let processedFirstFrame;
    if (firstFrameImage) {
        // 如果是公网URL，直接使用
        if (firstFrameImage.startsWith('http://') || firstFrameImage.startsWith('https://')) {
            if (firstFrameImage.includes('localhost') || firstFrameImage.includes('127.0.0.1')) {
                throw new Error('通义万相API不支持localhost地址，请使用公网URL');
            }
            // 检查是否是豆包的TOS URL（通义万相可能无法访问）
            if (firstFrameImage.includes('tos-cn-beijing.volces.com') || firstFrameImage.includes('tos.volces.com')) {
                console.warn('⚠️  检测到豆包TOS URL，通义万相可能无法访问，建议上传到图床获取公网URL');
                // 继续尝试，如果失败会提示用户
            }
            processedFirstFrame = firstFrameImage;
        }
        else {
            // 本地路径 - 上传到OSS
            const { uploadPath } = await Promise.resolve().then(() => __importStar(require('../../utils/oss')));
            let filePath;
            if (firstFrameImage.startsWith('/')) {
                filePath = firstFrameImage;
            }
            else {
                const urlObj = new URL(firstFrameImage);
                filePath = urlObj.pathname;
            }
            const fullPath = path_1.default.join(process.cwd(), filePath);
            if (!fs_1.default.existsSync(fullPath)) {
                throw new Error(`文件不存在: ${fullPath}`);
            }
            processedFirstFrame = await uploadPath(fullPath);
        }
    }
    // 构建请求体 - 根据模型类型（视频换人或普通生成）
    let requestBody;
    if ((modelId === 'wan2.2-animate-mix' || modelId === 'wan2.2-animate-move') && safeReplaceImageUrl && safeReplaceVideoUrl) {
        requestBody = {
            model: modelId,
            input: {
                image_url: safeReplaceImageUrl,
                video_url: safeReplaceVideoUrl,
            },
            parameters: {
                mode: options.mode || 'wan-std',
            },
        };
    }
    else {
        requestBody = {
            model: modelId,
            input: {
                prompt: prompt,
            },
            parameters: {
                duration: duration, // 整数，单位：秒（5 或 10）
                resolution: resolution, // 字符串：'480P'、'720P'、'1080P'
            },
        };
    }
    // 添加首帧图片URL
    if (processedFirstFrame && !(requestBody?.input?.image_url && requestBody?.input?.video_url)) {
        // 根据官方文档，参数名是 img_url，位置在 input 中
        // 先尝试使用URL，如果API返回url error，会自动转换为Base64重试
        requestBody.input.img_url = cleanUrl(processedFirstFrame);
        console.log('📤 完整请求体:', JSON.stringify(requestBody, null, 2));
        console.log('📤 图片URL:', processedFirstFrame);
    }
    // 创建视频生成任务 - 根据模型选择端点
    const isFullEndpoint = /\/services\/aigc\//.test(rawApi);
    const createTaskUrl = isFullEndpoint
        ? rawApi
        : ((modelId === 'wan2.2-animate-mix' || modelId === 'wan2.2-animate-move')
            ? `${base}/api/v1/services/aigc/image2video/video-synthesis`
            : `${base}/api/v1/services/aigc/video-synthesis/video-generation`);
    console.log(`📤 API端点: ${createTaskUrl}`);
    const requestHeaders = {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        'X-DashScope-OssResourceResolve': 'enable',
    };
    try {
        const createResponse = await axios_1.default.post(createTaskUrl, requestBody, {
            headers: requestHeaders,
            timeout: 30000,
        });
        // 获取任务ID
        const taskId = createResponse.data?.output?.task_id || createResponse.data?.task_id;
        if (!taskId) {
            console.error('❌ API响应:', JSON.stringify(createResponse.data, null, 2));
            throw new Error('未返回任务ID');
        }
        // 轮询任务结果，获取远程视频URL
        const remoteVideoUrl = await pollVideoTask(taskId, base, API_KEY);
        // 下载并上传到 OSS
        try {
            console.log('📥 开始下载通义万相视频并上传到 OSS:', remoteVideoUrl);
            const ossUrl = await (0, oss_1.streamDownloadAndUploadToOss)(remoteVideoUrl, '.mp4');
            console.log('✅ 通义万相视频已上传到 OSS:', ossUrl);
            return ossUrl;
        }
        catch (e) {
            console.error('❌ 上传通义万相视频到 OSS 失败，返回远程URL:', e.message);
            return remoteVideoUrl;
        }
    }
    catch (error) {
        // 输出详细的错误信息
        if (error.response?.data) {
            const errorData = error.response.data;
            const errorMessage = errorData.message || JSON.stringify(errorData);
            console.error('❌ 通义万相API错误响应:', JSON.stringify(errorData, null, 2));
            // 如果是URL错误，且当前使用的是URL，尝试转换为Base64重试
            if ((errorMessage.includes('url error') || errorData.code === 'InvalidParameter')
                && processedFirstFrame
                && processedFirstFrame.startsWith('http')) {
                console.log('🔄 URL访问失败，尝试下载图片并转换为Base64重试...');
                let imageBuffer = null;
                let mimeType = 'image/jpeg';
                try {
                    // 下载图片并转换为Base64
                    const imageResponse = await axios_1.default.get(processedFirstFrame, {
                        responseType: 'arraybuffer',
                        timeout: 30000,
                    });
                    imageBuffer = Buffer.from(imageResponse.data);
                    mimeType = imageResponse.headers['content-type'] || 'image/jpeg';
                    const base64 = imageBuffer.toString('base64');
                    const base64Data = base64;
                    console.log('✅ 图片已转换为Base64，大小:', Math.round(imageBuffer.length / 1024), 'KB');
                    // 检查Base64大小（不超过10MB）
                    if (imageBuffer.length > 10 * 1024 * 1024) {
                        throw new Error(`图片太大 (${Math.round(imageBuffer.length / 1024 / 1024)}MB)，超过10MB限制`);
                    }
                    // 使用Base64重试
                    delete requestBody.input.img_url;
                    requestBody.input.image = base64Data;
                    console.log('🔄 使用Base64重试API调用...');
                    const retryResponse = await axios_1.default.post(createTaskUrl, requestBody, {
                        headers: requestHeaders,
                        timeout: 30000,
                    });
                    const taskId = retryResponse.data?.output?.task_id || retryResponse.data?.task_id;
                    if (!taskId) {
                        throw new Error('重试后仍未返回任务ID');
                    }
                    console.log('✅ Base64方式成功，任务ID:', taskId);
                    return await pollVideoTask(taskId, base, API_KEY);
                }
                catch (retryError) {
                    console.error('❌ Base64重试也失败:', retryError.response?.data || retryError.message);
                    // 如果Base64也失败，尝试上传到备用图床（sm.ms）
                    if (imageBuffer) {
                        try {
                            console.log('🔄 尝试上传到备用图床 sm.ms...');
                            const fallbackUrl = await uploadBufferToFallbackHost(imageBuffer, `wanx-first-frame-${Date.now()}.jpg`);
                            console.log('✅ 备用图床上传成功:', fallbackUrl);
                            delete requestBody.input.image;
                            requestBody.input.img_url = fallbackUrl;
                            console.log('🔄 使用备用图床URL重试API调用...');
                            const fallbackResponse = await axios_1.default.post(createTaskUrl, requestBody, {
                                headers: requestHeaders,
                                timeout: 30000,
                            });
                            const taskId = fallbackResponse.data?.output?.task_id || fallbackResponse.data?.task_id;
                            if (!taskId) {
                                throw new Error('备用图床重试后仍未返回任务ID');
                            }
                            console.log('✅ 备用图床方式成功，任务ID:', taskId);
                            return await pollVideoTask(taskId, base, API_KEY);
                        }
                        catch (fallbackError) {
                            console.error('❌ 备用图床重试失败:', fallbackError.response?.data || fallbackError.message);
                            throw new Error(`通义万相API错误: ${errorMessage} (Base64重试失败: ${retryError.message}; 备用图床也失败: ${fallbackError.message})`);
                        }
                    }
                    throw new Error(`通义万相API错误: ${errorMessage} (Base64重试也失败: ${retryError.message})`);
                }
            }
            console.error('❌ 请求体:', JSON.stringify(requestBody, null, 2));
            throw new Error(`通义万相API错误: ${errorMessage}`);
        }
        throw error;
    }
}
/**
 * 轮询视频任务结果
 */
async function pollVideoTask(taskId, endpoint, apiKey, maxAttempts = 0 // 0 表示无限次，每次10秒
) {
    console.log('🔄 开始轮询任务结果, 任务ID:', taskId);
    const queryUrl = `${endpoint}/api/v1/tasks/${taskId}`;
    for (let i = 0; maxAttempts === 0 ? true : i < maxAttempts; i++) {
        try {
            const response = await axios_1.default.get(queryUrl, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            });
            console.log(`🔄 轮询第 ${i + 1} 次, 响应:`, JSON.stringify(response.data, null, 2));
            const data = response.data;
            const status = data.output?.task_status || data.task_status;
            if (status === 'SUCCEEDED') {
                // 成功，提取视频URL（兼容 results.video_url 和可能带包裹符号的字符串）
                let videoUrl = data.output?.video_url || data.video_url || data.output?.results?.video_url;
                if (typeof videoUrl === 'string') {
                    videoUrl = videoUrl.trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, '');
                    const mUrl = videoUrl.match(/https?:\/\/[^"'\s]+\.mp4(?:\?[^"'\s}]+)?/i);
                    if (mUrl && mUrl[0]) {
                        videoUrl = mUrl[0];
                    }
                }
                if (videoUrl) {
                    console.log('✅ 视频生成成功:', videoUrl);
                    return videoUrl;
                }
                // 某些响应可能把 URL 放在 usage 或其他位置，尝试全面搜索
                const str = JSON.stringify(data);
                const re = new RegExp('https?://[^"\'\\s]+\\.mp4(?:\\?[^"\'\\s}]+)?', 'i');
                const m = str.match(re);
                if (m && m[0]) {
                    console.log('✅ 视频生成成功(解析自响应文本):', m[0]);
                    return m[0];
                }
                throw new Error('响应中未找到视频URL');
            }
            else if (status === 'FAILED') {
                const errorCode = data.output?.code || '';
                const errorMsg = data.output?.message || data.message || '视频生成失败';
                const fullErrorMsg = errorCode ? `${errorCode}: ${errorMsg}` : errorMsg;
                console.error('❌ 视频生成失败:', fullErrorMsg);
                throw new Error(fullErrorMsg);
            }
            else if (status === 'CANCELED' || status === 'CANCELLED') {
                throw new Error('视频生成任务被取消');
            }
            // 状态为 PENDING 或 RUNNING，继续等待
            console.log(`⏳ 视频生成中... 状态: ${status}, 等待10秒后重试`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
        catch (error) {
            console.error(`❌ 轮询第 ${i + 1} 次失败:`, error.response?.data || error.message);
            // 致命错误直接抛出；否则继续等待
            if (error.response?.status === 401 ||
                error.response?.status === 403 ||
                error.message.includes('失败') ||
                error.message.includes('取消')) {
                throw error;
            }
            // 否则等待后重试
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    throw new Error(`视频生成超时`);
}
/**
 * 通义万相 - 文生视频（无首帧）
 */
async function generateVideoFromText(options) {
    // 复用首帧生视频的方法，只是不传firstFrameImage
    return generateVideoFromFirstFrame({
        ...options,
        firstFrameImage: undefined,
    });
}
async function generateVideoRetalk(options) {
    const API_KEY = options.apiKey || process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY;
    const DEFAULT_BASE = 'https://dashscope.aliyuncs.com';
    const DEFAULT_INTL_BASE = 'https://dashscope-intl.aliyuncs.com';
    const rawApi = (options.apiUrl || '').trim();
    const useIntl = rawApi.includes('dashscope-intl.aliyuncs.com');
    const base = useIntl ? DEFAULT_INTL_BASE : DEFAULT_BASE;
    if (!API_KEY) {
        throw new Error('通义万相 API 密钥未配置');
    }
    const requestBody = {
        model: 'videoretalk',
        input: {
            video_url: (options.videoUrl || '').trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, ''),
            audio_url: (options.audioUrl || '').trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, ''),
        },
        parameters: {},
    };
    if (options.refImageUrl)
        requestBody.input.ref_image_url = options.refImageUrl;
    if (typeof options.videoExtension === 'boolean')
        requestBody.parameters.video_extension = options.videoExtension;
    const isFullEndpoint = /\/services\/aigc\//.test(rawApi);
    const createTaskUrl = isFullEndpoint ? rawApi : `${base}/api/v1/services/aigc/image2video/video-synthesis`;
    const requestHeaders = {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        'X-DashScope-OssResourceResolve': 'enable',
    };
    const createResponse = await axios_1.default.post(createTaskUrl, requestBody, { headers: requestHeaders, timeout: 30000 });
    const taskId = createResponse.data?.output?.task_id || createResponse.data?.task_id;
    if (!taskId) {
        throw new Error('未返回任务ID');
    }
    const remoteVideoUrl = await pollVideoTask(taskId, base, API_KEY);
    try {
        const ossUrl = await (0, oss_1.streamDownloadAndUploadToOss)(remoteVideoUrl, '.mp4');
        return ossUrl;
    }
    catch (e) {
        return remoteVideoUrl;
    }
}
async function generateVideoStylize(options) {
    const API_KEY = options.apiKey || process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY;
    const DEFAULT_BASE = 'https://dashscope.aliyuncs.com';
    const DEFAULT_INTL_BASE = 'https://dashscope-intl.aliyuncs.com';
    const rawApi = (options.apiUrl || '').trim();
    const useIntl = rawApi.includes('dashscope-intl.aliyuncs.com');
    const base = useIntl ? DEFAULT_INTL_BASE : DEFAULT_BASE;
    if (!API_KEY) {
        throw new Error('通义万相 API 密钥未配置');
    }
    const requestBody = {
        model: 'video-style-transform',
        input: {
            video_url: (options.videoUrl || '').trim().replace(/^`+|`+$/g, '').replace(/^"+|"+$/g, ''),
        },
        parameters: {},
    };
    if (typeof options.style === 'number')
        requestBody.parameters.style = options.style;
    if (typeof options.videoFps === 'number')
        requestBody.parameters.video_fps = options.videoFps;
    if (typeof options.minLen === 'number')
        requestBody.parameters.min_len = options.minLen;
    // 在风格转绘场景中，开启结果解析，确保API识别OSS直链
    const requestHeaders = {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
        'X-DashScope-OssResourceResolve': 'enable',
    };
    const isFullEndpoint = /\/services\/aigc\//.test(rawApi);
    const createTaskUrl = isFullEndpoint ? rawApi : `${base}/api/v1/services/aigc/video-generation/video-synthesis`;
    const createResponse = await axios_1.default.post(createTaskUrl, requestBody, { headers: requestHeaders, timeout: 60000 });
    const taskId = createResponse.data?.output?.task_id || createResponse.data?.task_id;
    if (!taskId) {
        throw new Error('未返回任务ID');
    }
    const remoteVideoUrl = await pollVideoTask(taskId, base, API_KEY);
    try {
        const ossUrl = await (0, oss_1.streamDownloadAndUploadToOss)(remoteVideoUrl, '.mp4');
        return ossUrl;
    }
    catch (e) {
        return remoteVideoUrl;
    }
}
//# sourceMappingURL=wanx.service.js.map