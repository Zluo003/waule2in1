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
exports.imageToVideo = imageToVideo;
exports.queryTaskStatus = queryTaskStatus;
exports.cancelTask = cancelTask;
exports.textToVideo = textToVideo;
exports.upscaleVideo = upscaleVideo;
exports.createCommercialVideo = createCommercialVideo;
const axios_1 = __importDefault(require("axios"));
const oss_1 = require("../../utils/oss");
const logger_1 = require("../../utils/logger");
const waule_api_client_1 = require("../waule-api.client");
/**
 * Vidu Q2 API 服务
 * 支持: 图生视频 (Image-to-Video)
 * API文档: https://api.vidu.cn/ent/v2/img2video
 */
/**
 * 下载远程文件到本地
 */
async function downloadFile(url, type) {
    try {
        logger_1.logger.info(`[Vidu] 开始下载 ${type}: ${url}`);
        // 下载文件
        const response = await axios_1.default.get(url, {
            responseType: 'arraybuffer',
            timeout: 60000, // 60秒下载超时
        });
        const ext = type === 'image' ? '.png' : '.mp4';
        const publicUrl = await (0, oss_1.uploadBuffer)(Buffer.from(response.data), ext);
        logger_1.logger.info(`[Vidu] ✅ ${type} 已上传到 OSS: ${publicUrl}`);
        return publicUrl;
    }
    catch (error) {
        logger_1.logger.error(`[Vidu] 下载 ${type} 失败:`, error.message);
        // 如果下载失败，返回原始 URL
        return url;
    }
}
/**
 * 处理图片URL - 优先使用 URL，避免 base64
 */
async function processImageUrl(imageUrl) {
    // 如果是 base64，上传到 OSS 转为 URL（Vidu 支持 URL）
    if (imageUrl.startsWith('data:image/')) {
        logger_1.logger.info('[Vidu] 🔄 检测到 Base64，上传到 OSS 转为 URL...', imageUrl.length, '字符');
        try {
            const { uploadBuffer } = await Promise.resolve().then(() => __importStar(require('../../utils/oss')));
            const matches = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
            if (matches) {
                const ext = matches[1] === 'jpeg' ? '.jpg' : `.${matches[1]}`;
                const base64Data = matches[2];
                const buffer = Buffer.from(base64Data, 'base64');
                const ossUrl = await uploadBuffer(buffer, ext);
                logger_1.logger.info('[Vidu] ✅ 已上传到 OSS:', ossUrl);
                return ossUrl;
            }
        }
        catch (e) {
            logger_1.logger.error('[Vidu] ❌ 上传到 OSS 失败:', e.message);
            throw new Error('图片上传失败，请重试');
        }
    }
    // 公网 URL 直接返回
    if (imageUrl.startsWith('https://') || imageUrl.startsWith('http://')) {
        // 排除本地 URL
        if (!imageUrl.includes('localhost') && !imageUrl.includes('127.0.0.1')) {
            logger_1.logger.info('[Vidu] 🌐 使用 URL:', imageUrl.substring(0, 80));
            return imageUrl;
        }
    }
    // 本地 URL 不支持（应该用 OSS）
    logger_1.logger.error('[Vidu] ❌ 不支持的图片格式:', imageUrl.substring(0, 50));
    throw new Error('不支持的图片格式，请使用 OSS URL');
}
/**
 * 图生视频
 */
async function imageToVideo(options) {
    const { images, subjects, prompt, model = 'viduq2-pro', audio, voice_id, bgm, is_rec, duration, seed, resolution, movement_amplitude, payload, off_peak, watermark, wm_position, wm_url, meta_data, callback_url, apiKey, apiUrl, } = options;
    // API配置 - 从管理后台配置获取
    // 如果 apiKey 为空，使用 waule-api 网关
    if (!apiKey) {
        const wauleApiClient = (0, waule_api_client_1.getGlobalWauleApiClient)();
        if (wauleApiClient) {
            console.log('🌐 [Vidu] apiKey 为空，使用 waule-api 网关生成视频');
            const r = await wauleApiClient.generateVideo({
                model,
                prompt,
                duration,
                resolution,
                reference_images: images || undefined,
                subjects,
                audio,
                voice_id,
                bgm,
                movement_amplitude,
                generation_type: images?.length ? '图生视频' : '文生视频',
            });
            const videoUrl = r?.data?.[0]?.url;
            if (!videoUrl)
                throw new Error('waule-api 未返回视频数据');
            return videoUrl;
        }
        throw new Error('Vidu API 密钥未配置，且 waule-api 网关未配置');
    }
    const API_KEY = apiKey;
    // 智能处理 API URL：去除末尾斜杠，如果已包含 /ent/v2 则直接使用，否则使用基础 URL
    let BASE_URL = (apiUrl || 'https://api.vidu.cn').replace(/\/$/, '');
    // 如果 URL 已经包含 /ent/v2，说明是完整的 API 前缀
    const API_PREFIX = BASE_URL.includes('/ent/v2') ? BASE_URL : `${BASE_URL}/ent/v2`;
    // 验证：images 和 subjects 必须至少提供其一
    if ((!images || images.length === 0) && (!subjects || subjects.length === 0)) {
        throw new Error('至少需要提供 images 或 subjects 参数');
    }
    try {
        logger_1.logger.info(`[Vidu] 开始图生视频, 模型: ${model}, 时长: ${duration}秒, 分辨率: ${resolution}`);
        logger_1.logger.info(`[Vidu] 使用参数: images=${!!images}, subjects=${!!subjects}, audio=${audio}`);
        // 处理图片URL（本地转base64），如果使用 images 参数
        let processedImages = [];
        if (images && images.length > 0) {
            processedImages = await Promise.all(images.map((url) => processImageUrl(url)));
            logger_1.logger.info(`[Vidu] ✅ 所有图片处理完成，数量: ${processedImages.length}`);
            processedImages.forEach((img, idx) => {
                logger_1.logger.info(`[Vidu] 📷 图片 ${idx + 1}/${processedImages.length}: ${img.substring(0, 100)}...`);
            });
        }
        // 处理 subjects 参数
        let processedSubjects;
        if (subjects && subjects.length > 0) {
            processedSubjects = await Promise.all(subjects.map(async (subject) => ({
                id: subject.id,
                images: await Promise.all(subject.images.map((url) => processImageUrl(url))),
                voice_id: subject.voice_id || '',
            })));
            logger_1.logger.info(`[Vidu] ✅ 所有 subjects 处理完成，数量: ${processedSubjects.length}`);
            processedSubjects.forEach((subj, idx) => {
                logger_1.logger.info(`[Vidu] 🎭 Subject ${idx + 1}: id="${subj.id}", images=${subj.images.length}`);
            });
        }
        // 根据是否启用音频或使用 subjects 决定使用哪个API端点
        let endpoint;
        let taskType;
        if (processedSubjects || audio === true) {
            // 使用 subjects 或音视频直出时使用 reference2video 接口
            endpoint = 'reference2video';
            taskType = processedSubjects ? 'Subjects参考图生视频' : '音视频直出';
        }
        else {
            // 普通模式根据图片数量选择端点
            endpoint = processedImages.length === 2 ? 'start-end2video' : 'img2video';
            taskType = processedImages.length === 2 ? '首尾帧' : '图生视频';
        }
        logger_1.logger.info(`[Vidu] 📌 使用API端点: ${endpoint} (${taskType})`);
        // 构建请求体 - 根据参数类型使用不同的结构
        const requestBody = {
            model,
        };
        if (processedSubjects) {
            // Subjects 模式：使用 subjects 参数
            requestBody.subjects = processedSubjects;
            if (audio === true) {
                requestBody.audio = true;
            }
        }
        else if (audio === true) {
            // 音视频直出模式但没有 subjects：从 images 创建一个默认 subject
            requestBody.subjects = [
                {
                    id: '1',
                    images: processedImages,
                    voice_id: voice_id || '', // 空字符串表示使用系统推荐
                },
            ];
            requestBody.audio = true;
        }
        else {
            // 普通模式：使用 images 参数
            requestBody.images = processedImages;
            // BGM 参数只在普通模式下生效
            if (bgm === true) {
                requestBody.bgm = true;
            }
        }
        // 可选参数 - 只在有值时添加
        if (prompt) {
            requestBody.prompt = prompt;
        }
        if (duration !== undefined) {
            requestBody.duration = duration;
        }
        // seed参数：只在明确设置且不为0时添加（0表示随机）
        if (seed && seed !== 0) {
            requestBody.seed = seed;
        }
        // 分辨率参数：标准化格式（确保小写p）
        if (resolution) {
            // 标准化分辨率格式：1080P -> 1080p, 720P -> 720p
            const normalizedResolution = resolution.toLowerCase();
            requestBody.resolution = normalizedResolution;
            logger_1.logger.info(`[Vidu] 分辨率参数: ${resolution} -> ${normalizedResolution}`);
        }
        // 运动幅度参数：auto、small、medium、large
        if (movement_amplitude && movement_amplitude !== 'auto') {
            // 只在非auto时添加（auto是默认值）
            requestBody.movement_amplitude = movement_amplitude;
            logger_1.logger.info(`[Vidu] 运动幅度参数: ${movement_amplitude}`);
        }
        else if (movement_amplitude === 'auto') {
            logger_1.logger.info(`[Vidu] 运动幅度: auto (默认值，不传参)`);
        }
        // 只在明确设置为 true 时才添加错峰模式
        if (off_peak === true) {
            requestBody.off_peak = true;
        }
        // 只在启用推荐提示词时才添加
        if (is_rec === true) {
            requestBody.is_rec = true;
        }
        if (payload) {
            requestBody.payload = payload;
        }
        // 只在明确启用水印时才添加相关字段
        if (watermark === true) {
            requestBody.watermark = true;
            if (wm_position !== undefined) {
                requestBody.wm_position = wm_position;
            }
            if (wm_url) {
                requestBody.wm_url = wm_url;
            }
        }
        if (meta_data) {
            requestBody.meta_data = meta_data;
        }
        if (callback_url) {
            requestBody.callback_url = callback_url;
        }
        logger_1.logger.info(`[Vidu] 请求详情:`, {
            url: `${API_PREFIX}/${endpoint}`,
            endpoint: endpoint,
            model,
            imagesCount: processedImages.length,
            duration,
            resolution,
            apiKey: API_KEY.substring(0, 4) + '****',
        });
        // 详细记录请求体（用于调试）
        const requestBodyForLog = {
            ...requestBody,
            images: requestBody.images ? requestBody.images.map((img, idx) => `[Image ${idx + 1}: ${img.substring(0, 50)}...]`) : undefined
        };
        logger_1.logger.info(`[Vidu] 📋 完整请求体字段:`, Object.keys(requestBody));
        logger_1.logger.info(`[Vidu] 📋 请求体内容 (包含所有图片预览):`, JSON.stringify(requestBodyForLog, null, 2));
        const imageCount = requestBody.images?.length || requestBody.subjects?.[0]?.images?.length || 0;
        logger_1.logger.info(`[Vidu] 🎯 关键参数: model=${requestBody.model}, duration=${requestBody.duration}, resolution=${requestBody.resolution}, movement_amplitude=${requestBody.movement_amplitude || 'auto(默认)'}, imagesCount=${imageCount}`);
        // 发送请求
        const response = await axios_1.default.post(`${API_PREFIX}/${endpoint}`, requestBody, {
            headers: {
                'Authorization': `Token ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30秒提交超时
        });
        logger_1.logger.info(`[Vidu] 任务创建响应:`, JSON.stringify(response.data, null, 2));
        const taskId = response.data.task_id;
        if (!taskId) {
            throw new Error('未获取到任务ID');
        }
        logger_1.logger.info(`[Vidu] ✅ ${taskType}任务创建成功，任务ID: ${taskId}, 状态: ${response.data.state}`);
        // 开始轮询任务状态
        return await pollTaskStatus(taskId, API_KEY, API_PREFIX);
    }
    catch (error) {
        logger_1.logger.error('[Vidu] 图生视频失败:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message,
            url: error.config?.url,
            requestData: error.config?.data ? JSON.parse(error.config.data) : null,
        });
        if (error.response?.data) {
            // 记录完整的错误响应用于调试
            logger_1.logger.error('[Vidu] API 完整错误响应:', JSON.stringify(error.response.data, null, 2));
            // 更详细的错误信息提取
            let errorMessage = '';
            const errorData = error.response.data;
            if (errorData.error?.message) {
                errorMessage = errorData.error.message;
            }
            else if (errorData.message) {
                errorMessage = errorData.message;
            }
            else if (errorData.error) {
                // 如果 error 是字符串
                errorMessage = typeof errorData.error === 'string' ? errorData.error : JSON.stringify(errorData.error);
            }
            else if (typeof errorData === 'string') {
                errorMessage = errorData;
            }
            else {
                errorMessage = JSON.stringify(errorData);
            }
            // 如果有具体的字段错误，提取并格式化
            if (errorData.error?.fields) {
                const fields = errorData.error.fields;
                if (typeof fields === 'object' && fields !== null) {
                    const fieldErrors = Object.entries(fields)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join(', ');
                    errorMessage += ` (字段错误: ${fieldErrors})`;
                }
                else {
                    errorMessage += ` (字段错误: ${JSON.stringify(fields)})`;
                }
            }
            throw new Error(`Vidu API错误: ${errorMessage}`);
        }
        throw new Error(`Vidu图生视频失败: ${error.message}`);
    }
}
/**
 * 轮询任务状态
 */
async function pollTaskStatus(taskId, apiKey, apiPrefix, maxAttempts = 120) {
    logger_1.logger.info(`[Vidu] 🔄 开始轮询任务状态, 任务ID: ${taskId}`);
    let unknownStateCount = 0; // 连续未知状态计数
    const maxUnknownStates = 5; // 允许的最大连续未知状态次数
    for (let i = 0; i < maxAttempts; i++) {
        try {
            logger_1.logger.info(`[Vidu] 🔍 开始第 ${i + 1} 次轮询, 任务ID: ${taskId}`);
            const response = await axios_1.default.get(`${apiPrefix}/tasks/${taskId}/creations`, {
                headers: {
                    'Authorization': `Token ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            });
            // 打印完整的原始响应，用于调试
            logger_1.logger.info(`[Vidu] 📦 完整响应 (第 ${i + 1} 次):`, JSON.stringify(response.data, null, 2));
            logger_1.logger.info(`[Vidu] 📊 响应状态码: ${response.status}`);
            // 兼容不同的响应结构
            const resData = response.data;
            // 有些API可能返回 { code: 200, data: { ... } } 格式
            const taskData = resData.data && resData.code ? resData.data : resData;
            const rawState = taskData.state || taskData.status;
            const state = rawState?.toLowerCase();
            // 从creations数组中获取视频URL（优先使用新格式）
            let video_url;
            if (taskData.creations && Array.isArray(taskData.creations) && taskData.creations.length > 0) {
                video_url = taskData.creations[0].url;
                logger_1.logger.info(`[Vidu] 从creations数组获取视频URL: ${video_url?.substring(0, 100)}...`);
            }
            else {
                // 向后兼容旧格式
                video_url = taskData.video_url || taskData.url || taskData.result_url || taskData.output_url;
            }
            const error = taskData.error || taskData.err_code || taskData.message;
            logger_1.logger.info(`[Vidu] 📌 解析结果 (第 ${i + 1} 次):`);
            logger_1.logger.info(`   - 原始状态: ${rawState}`);
            logger_1.logger.info(`   - 规范化状态: ${state}`);
            logger_1.logger.info(`   - 视频URL: ${video_url ? video_url.substring(0, 100) + '...' : 'null'}`);
            logger_1.logger.info(`   - 错误信息: ${error || 'null'}`);
            logger_1.logger.info(`   - 所有可用字段: ${Object.keys(taskData).join(', ')}`);
            // 检查状态字段是否存在
            if (!rawState) {
                logger_1.logger.error(`[Vidu] ❌ API响应中缺少状态字段！响应: ${JSON.stringify(taskData)}`);
                throw new Error('Vidu API响应格式错误：缺少 state/status 字段');
            }
            if (['success', 'succeeded', 'completed', 'finished', 'ok'].includes(state)) {
                if (!video_url) {
                    // 可能是刚刚完成，URL还没生成，或者是字段解析错误
                    logger_1.logger.warn('[Vidu] 状态显示成功但未找到视频URL，尝试继续轮询...');
                    // 如果是最后一次，则抛出错误
                    if (i === maxAttempts - 1) {
                        throw new Error('视频生成成功但未返回视频URL: ' + JSON.stringify(taskData));
                    }
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    continue;
                }
                logger_1.logger.info(`[Vidu] ✅ 视频生成成功！视频URL: ${video_url}`);
                // 下载视频到本地
                const localVideoUrl = await downloadFile(video_url, 'video');
                logger_1.logger.info(`[Vidu] ✅ 视频已下载到本地: ${localVideoUrl}`);
                return localVideoUrl;
            }
            else if (['failed', 'failure', 'error'].includes(state)) {
                const errorMsg = error || '视频生成失败';
                logger_1.logger.error(`[Vidu] ❌ 视频生成失败: ${errorMsg}`);
                // 创建一个特殊的错误对象，标记为业务失败（不应重试）
                const failureError = new Error(errorMsg);
                failureError.isBusinessFailure = true;
                throw failureError;
            }
            else if (['created', 'queueing', 'processing', 'pending', 'scheduled', 'starting'].includes(state)) {
                // 状态为 created, queueing, processing 等，继续等待
                logger_1.logger.info(`[Vidu] ⏳ 视频生成中... 状态: ${state}, 等待10秒后重试`);
                unknownStateCount = 0; // 重置未知状态计数
            }
            else {
                // 未知状态
                unknownStateCount++;
                logger_1.logger.warn(`[Vidu] ⚠️ 收到未知状态: ${rawState} (第 ${unknownStateCount} 次)`);
                logger_1.logger.warn(`[Vidu] 完整响应: ${JSON.stringify(response.data)}`);
                // 如果连续多次收到未知状态，则抛出错误
                if (unknownStateCount >= maxUnknownStates) {
                    throw new Error(`连续收到 ${unknownStateCount} 次未知状态 (${rawState})，任务可能异常`);
                }
            }
            await new Promise(resolve => setTimeout(resolve, 10000)); // 等待10秒
        }
        catch (error) {
            logger_1.logger.error(`[Vidu] 轮询第 ${i + 1} 次失败:`, error.response?.data || error.message);
            // 如果是业务失败（如 state=failed），立即停止轮询
            if (error.isBusinessFailure) {
                logger_1.logger.error(`[Vidu] 🛑 检测到业务失败，立即停止轮询`);
                throw error;
            }
            // 如果是最后一次尝试或者是致命错误，直接抛出
            if (i === maxAttempts - 1 || error.response?.status === 401 || error.response?.status === 403) {
                throw error;
            }
            // 否则等待后重试（仅针对网络错误等临时性错误）
            logger_1.logger.info(`[Vidu] 网络错误，将在10秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
    throw new Error(`视频生成超时，已轮询 ${maxAttempts} 次 (约 ${maxAttempts * 10 / 60} 分钟)`);
}
/**
 * 查询任务状态（单次查询）
 */
async function queryTaskStatus(taskId, apiKey, apiUrl) {
    if (!apiKey) {
        throw new Error('Vidu API 密钥未配置，请在管理后台配置模型');
    }
    const API_KEY = apiKey;
    let BASE_URL = (apiUrl || 'https://api.vidu.cn').replace(/\/$/, '');
    const API_PREFIX = BASE_URL.includes('/ent/v2') ? BASE_URL : `${BASE_URL}/ent/v2`;
    try {
        const response = await axios_1.default.get(`${API_PREFIX}/tasks/${taskId}/creations`, {
            headers: {
                'Authorization': `Token ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
        return response.data;
    }
    catch (error) {
        logger_1.logger.error('[Vidu] 查询任务状态失败:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message,
        });
        throw new Error(`Vidu查询任务失败: ${error.message}`);
    }
}
/**
 * 取消错峰任务
 */
async function cancelTask(taskId, apiKey, apiUrl) {
    if (!apiKey) {
        throw new Error('Vidu API 密钥未配置，请在管理后台配置模型');
    }
    const API_KEY = apiKey;
    let BASE_URL = (apiUrl || 'https://api.vidu.cn').replace(/\/$/, '');
    const API_PREFIX = BASE_URL.includes('/ent/v2') ? BASE_URL : `${BASE_URL}/ent/v2`;
    try {
        await axios_1.default.post(`${API_PREFIX}/tasks/${taskId}/cancel`, {}, {
            headers: {
                'Authorization': `Token ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        });
        logger_1.logger.info(`[Vidu] ✅ 任务已取消: ${taskId}`);
    }
    catch (error) {
        logger_1.logger.error('[Vidu] 取消任务失败:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message,
        });
        throw new Error(`Vidu取消任务失败: ${error.message}`);
    }
}
/**
 * 文生视频 (text2video)
 */
async function textToVideo(options) {
    const { prompt, model = 'viduq2', style = 'general', duration = 5, seed = 0, aspect_ratio = '16:9', resolution = '720p', movement_amplitude = 'auto', bgm = false, payload = '', off_peak = false, watermark = false, wm_position, wm_url, meta_data, callback_url, apiKey, apiUrl, } = options;
    const API_KEY = apiKey || process.env.VIDU_API_KEY || '';
    if (!API_KEY) {
        throw new Error('Vidu API Key未配置');
    }
    const BASE_URL = apiUrl || process.env.VIDU_API_URL || 'https://api.vidu.cn/ent/v2';
    const API_PREFIX = BASE_URL.includes('/ent/v2') ? BASE_URL : `${BASE_URL}/ent/v2`;
    if (!prompt || prompt.trim() === '') {
        throw new Error('提示词不能为空');
    }
    try {
        logger_1.logger.info(`[Vidu] 开始文生视频, 模型: ${model}, 时长: ${duration}秒, 分辨率: ${resolution}`);
        logger_1.logger.info(`[Vidu] 提示词: ${prompt.substring(0, 100)}...`);
        // 构建请求体
        const requestBody = {
            model,
            style,
            prompt,
            duration,
            seed,
            aspect_ratio,
            resolution,
            bgm,
            payload,
            off_peak,
        };
        // 可选参数
        if (model === 'viduq1' || model === 'vidu1.5') {
            requestBody.movement_amplitude = movement_amplitude;
        }
        if (watermark) {
            requestBody.watermark = watermark;
            if (wm_position)
                requestBody.wm_position = wm_position;
            if (wm_url)
                requestBody.wm_url = wm_url;
        }
        if (meta_data)
            requestBody.meta_data = meta_data;
        if (callback_url)
            requestBody.callback_url = callback_url;
        logger_1.logger.info('[Vidu] 📌 使用API端点: text2video (文生视频)');
        logger_1.logger.info('[Vidu] 请求详情:', {
            model,
            style,
            duration,
            resolution,
            aspect_ratio,
            promptLength: prompt.length,
        });
        const response = await axios_1.default.post(`${API_PREFIX}/text2video`, requestBody, {
            headers: {
                'Authorization': `Token ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
        });
        logger_1.logger.info('[Vidu] 任务创建响应:', response.data);
        const taskId = response.data.task_id;
        const state = response.data.state || 'created';
        logger_1.logger.info(`[Vidu] ✅ 文生视频任务创建成功，任务ID: ${taskId}, 状态: ${state}`);
        // 轮询任务状态
        logger_1.logger.info(`[Vidu] 🔄 开始轮询任务状态, 任务ID: ${taskId}`);
        const API_PREFIX_FOR_POLL = API_PREFIX;
        const videoUrl = await pollTaskStatus(taskId, API_KEY, API_PREFIX_FOR_POLL);
        return {
            taskId: taskId,
            status: videoUrl,
        };
    }
    catch (error) {
        logger_1.logger.error('[Vidu] 文生视频失败:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message,
        });
        throw new Error(`Vidu文生视频失败: ${error.response?.data?.error || error.message}`);
    }
}
/**
 * 智能超清 (upscale-new)
 */
async function upscaleVideo(options) {
    const { video_url, video_creation_id, upscale_resolution = '1080p', payload = '', callback_url, apiKey, apiUrl, } = options;
    const API_KEY = apiKey || process.env.VIDU_API_KEY || '';
    if (!API_KEY) {
        throw new Error('Vidu API Key未配置');
    }
    const BASE_URL = apiUrl || process.env.VIDU_API_URL || 'https://api.vidu.cn/ent/v2';
    const API_PREFIX = BASE_URL.includes('/ent/v2') ? BASE_URL : `${BASE_URL}/ent/v2`;
    // 验证：必须提供 video_url 或 video_creation_id
    if (!video_url && !video_creation_id) {
        throw new Error('必须提供 video_url 或 video_creation_id');
    }
    try {
        logger_1.logger.info(`[Vidu] 开始智能超清, 目标分辨率: ${upscale_resolution}`);
        if (video_url) {
            logger_1.logger.info(`[Vidu] 输入视频URL: ${video_url.substring(0, 100)}...`);
        }
        if (video_creation_id) {
            logger_1.logger.info(`[Vidu] 输入视频ID: ${video_creation_id}`);
        }
        // 构建请求体
        const requestBody = {
            upscale_resolution,
            payload,
        };
        // 优先使用 video_creation_id
        if (video_creation_id) {
            requestBody.video_creation_id = video_creation_id;
        }
        else if (video_url) {
            requestBody.video_url = video_url;
        }
        if (callback_url) {
            requestBody.callback_url = callback_url;
        }
        logger_1.logger.info('[Vidu] 📌 使用API端点: upscale-new (智能超清)');
        logger_1.logger.info('[Vidu] 请求详情:', {
            hasVideoUrl: !!video_url,
            hasCreationId: !!video_creation_id,
            targetResolution: upscale_resolution,
        });
        const response = await axios_1.default.post(`${API_PREFIX}/upscale-new`, requestBody, {
            headers: {
                'Authorization': `Token ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            timeout: 60000,
        });
        logger_1.logger.info('[Vidu] 任务创建响应:', response.data);
        const taskId = response.data.task_id;
        const state = response.data.state || 'created';
        logger_1.logger.info(`[Vidu] ✅ 智能超清任务创建成功，任务ID: ${taskId}, 状态: ${state}`);
        // 轮询任务状态
        logger_1.logger.info(`[Vidu] 🔄 开始轮询任务状态, 任务ID: ${taskId}`);
        const API_PREFIX_FOR_POLL = API_PREFIX;
        const videoUrl = await pollTaskStatus(taskId, API_KEY, API_PREFIX_FOR_POLL);
        return {
            taskId: taskId,
            status: videoUrl,
        };
    }
    catch (error) {
        logger_1.logger.error('[Vidu] 智能超清失败:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: error.response?.data,
            message: error.message,
        });
        throw new Error(`Vidu智能超清失败: ${error.response?.data?.error || error.message}`);
    }
}
/**
 * 广告成片 API (根据官方文档)
 * 支持两种模式：
 * 1. 有 apiKey：直接调用 Vidu 官方 API
 * 2. 无 apiKey 但有 apiUrl：使用自定义服务器（waule-api 网关），不需要 Authorization
 */
async function createCommercialVideo(options) {
    const { images, prompt, duration = 30, ratio = '16:9', language = 'zh', apiKey, apiUrl = 'https://api.vidu.cn' } = options;
    const requestId = `req_${Date.now()}`;
    console.log(`[Vidu Commercial] 📝 开始创建广告成片任务 [${requestId}]`);
    console.log(`[Vidu Commercial] [${requestId}] 参数:`, {
        imageCount: images.length,
        prompt,
        duration,
        ratio,
        language,
        hasApiKey: !!apiKey,
        apiUrl
    });
    if (images.length > 15) {
        throw new Error('最多支持15张图片');
    }
    try {
        // 确保 API URL 正确（避免路径重复）
        const baseUrl = apiUrl.replace(/\/ent\/v2$/, '').replace(/\/$/, ''); // 移除尾部的 /ent/v2 和斜杠
        // 根据官方 curl 示例，images 是数组
        const payload = {
            images: images, // 数组格式
            prompt,
            duration,
            'aspect_ratio': ratio, // 改用下划线格式
            language,
        };
        // 根据是否有 apiKey 决定调用方式
        if (apiKey) {
            // 有 apiKey：直接调用 Vidu 官方 API
            const endpoint = `${baseUrl}/ent/v2/ad-one-click`;
            console.log(`[Vidu Commercial] [${requestId}] 📤 使用 Vidu 官方 API:`, endpoint);
            console.log(`[Vidu Commercial] [${requestId}] 📋 请求体:`, JSON.stringify(payload, null, 2));
            const response = await axios_1.default.post(endpoint, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${apiKey}`,
                },
                timeout: 30000,
            });
            console.log('[Vidu Commercial] 📦 API 响应:', response.data);
            const taskId = response.data?.task_id;
            if (!taskId) {
                throw new Error('API 未返回任务 ID');
            }
            console.log('[Vidu Commercial] ✅ 任务创建成功，ID:', taskId);
            // 使用通用的轮询函数
            const apiPrefixForPoll = `${baseUrl}/ent/v2`;
            const videoUrl = await pollTaskStatus(taskId, apiKey, apiPrefixForPoll);
            return {
                taskId,
                status: videoUrl
            };
        }
        else {
            // 无 apiKey：优先使用 waule-api 网关
            const wauleApiClient = (0, waule_api_client_1.getGlobalWauleApiClient)();
            if (wauleApiClient) {
                console.log(`[Vidu Commercial] [${requestId}] 🌐 使用 waule-api 网关生成广告成片`);
                const result = await wauleApiClient.commercialVideo({
                    images,
                    prompt,
                    duration,
                    ratio,
                    language,
                });
                const videoUrl = result?.data?.[0]?.url;
                if (!videoUrl)
                    throw new Error('waule-api 未返回视频数据');
                console.log(`[Vidu Commercial] [${requestId}] ✅ waule-api 广告成片成功: ${videoUrl.substring(0, 80)}...`);
                return {
                    taskId: `waule_${Date.now()}`,
                    status: videoUrl
                };
            }
            // waule-api 不可用时，尝试从数据库获取 Vidu 模型配置
            const { prisma } = await Promise.resolve().then(() => __importStar(require('../../index')));
            const viduModel = await prisma.aIModel.findFirst({
                where: {
                    provider: 'vidu',
                    isActive: true,
                    apiKey: { not: null },
                },
                select: { apiKey: true, apiUrl: true },
            });
            if (!viduModel?.apiKey) {
                throw new Error('未找到可用的 Vidu API Key，请配置 WAULEAPI_URL 环境变量或在模型配置中设置 Vidu API Key');
            }
            const viduApiKey = viduModel.apiKey;
            // 使用数据库中配置的 apiUrl，如果没有则使用默认值
            const viduBaseUrl = (viduModel.apiUrl || 'https://api.vidu.cn').replace(/\/ent\/v2$/, '').replace(/\/$/, '');
            const endpoint = `${viduBaseUrl}/ent/v2/ad-one-click`;
            console.log(`[Vidu Commercial] [${requestId}] 📤 使用 Vidu API (从数据库获取配置):`, endpoint);
            console.log(`[Vidu Commercial] [${requestId}] 📋 请求体:`, JSON.stringify(payload, null, 2));
            const response = await axios_1.default.post(endpoint, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Token ${viduApiKey}`,
                },
                timeout: 30000,
            });
            console.log('[Vidu Commercial] 📦 API 响应:', response.data);
            const taskId = response.data?.task_id;
            if (!taskId) {
                throw new Error('API 未返回任务 ID');
            }
            console.log('[Vidu Commercial] ✅ 任务创建成功，ID:', taskId);
            // 使用通用的轮询函数
            const apiPrefixForPoll = `${viduBaseUrl}/ent/v2`;
            const videoUrl = await pollTaskStatus(taskId, viduApiKey, apiPrefixForPoll);
            return {
                taskId,
                status: videoUrl
            };
        }
    }
    catch (error) {
        console.error('[Vidu Commercial] ❌ 创建失败:', error);
        const msg = error.response?.data?.message || error.response?.data?.error || error.message || '广告成片创建失败';
        throw new Error(msg);
    }
}
//# sourceMappingURL=vidu.service.js.map