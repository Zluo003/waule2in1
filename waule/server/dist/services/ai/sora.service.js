"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateImage = generateImage;
exports.generateVideo = generateVideo;
exports.createCharacter = createCharacter;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../../utils/logger");
const socks_proxy_agent_1 = require("socks-proxy-agent");
const waule_api_client_1 = require("../waule-api.client");
// SOCKS5 代理配置
let _proxyAgent;
function getProxyAgent() {
    if (_proxyAgent === undefined) {
        const proxyUrl = process.env.SOCKS_PROXY;
        if (proxyUrl) {
            _proxyAgent = new socks_proxy_agent_1.SocksProxyAgent(proxyUrl);
            logger_1.logger.info(`[Sora] 使用 SOCKS5 代理: ${proxyUrl}`);
        }
    }
    return _proxyAgent;
}
/**
 * Sora API 服务（通过 sora2api 部署）
 * 完全兼容 OpenAI API 格式
 */
/**
 * 将URL转换为base64 data URL格式（sora2api需要）
 */
async function urlToBase64DataUrl(url, mimeType) {
    // 如果已经是 base64 data URL，直接返回
    if (url.startsWith('data:')) {
        return url;
    }
    try {
        let buffer;
        if (url.startsWith('http://') || url.startsWith('https://')) {
            // 远程 URL：下载内容
            const response = await axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: 120000, // 120秒下载超时（视频可能较大）
            });
            buffer = Buffer.from(response.data);
            // 从响应头或 URL 推断 MIME 类型
            if (!mimeType) {
                mimeType = response.headers['content-type'] ||
                    (url.match(/\.(mp4|webm)$/i) ? 'video/mp4' :
                        url.match(/\.(png)$/i) ? 'image/png' :
                            url.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' :
                                url.match(/\.(gif)$/i) ? 'image/gif' :
                                    'application/octet-stream');
            }
        }
        else {
            // 本地文件路径
            const fullPath = url.startsWith('/') ? url : path_1.default.join(process.cwd(), url);
            if (!fs_1.default.existsSync(fullPath)) {
                logger_1.logger.warn(`[Sora] 本地文件不存在: ${fullPath}`);
                return url;
            }
            buffer = fs_1.default.readFileSync(fullPath);
            // 从扩展名推断 MIME 类型
            if (!mimeType) {
                const ext = path_1.default.extname(fullPath).toLowerCase();
                mimeType = ext === '.mp4' ? 'video/mp4' :
                    ext === '.webm' ? 'video/webm' :
                        ext === '.png' ? 'image/png' :
                            ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                                ext === '.gif' ? 'image/gif' :
                                    'application/octet-stream';
            }
        }
        const base64 = buffer.toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;
        logger_1.logger.info(`[Sora] ✅ 已将 ${url.substring(0, 50)}... 转换为 base64 data URL (${(base64.length / 1024 / 1024).toFixed(2)} MB)`);
        return dataUrl;
    }
    catch (error) {
        logger_1.logger.error(`[Sora] URL转base64失败: ${url}`, error.message);
        return url; // 返回原始URL作为fallback
    }
}
/**
 * 直接返回视频 URL，由前端处理上传到 OSS
 * 这样可以避免服务器下载慢的问题
 */
async function downloadFile(url, type) {
    logger_1.logger.info(`[Sora] ✅ ${type} URL: ${url}（前端直传模式）`);
    // 直接返回原始 URL，由前端下载并上传到 OSS
    return url;
}
/**
 * 转换比例格式
 * 1:1 -> landscape (默认)
 * 16:9 -> landscape
 * 9:16 -> portrait
 */
function getOrientationFromRatio(ratio) {
    const [w, h] = ratio.split(':').map(Number);
    return w >= h ? 'landscape' : 'portrait';
}
/**
 * 生成图片
 */
async function generateImage(options) {
    const { prompt, modelId, aspectRatio = '1:1', referenceImages = [], apiKey, apiUrl, } = options;
    // 根据比例选择模型
    const orientation = getOrientationFromRatio(aspectRatio);
    let finalModelId = modelId;
    // 如果用户选择了通用模型，根据比例自动选择
    if (modelId === 'sora-image') {
        finalModelId = orientation === 'portrait' ? 'sora-image-portrait' : 'sora-image-landscape';
    }
    logger_1.logger.info(`[Sora] 生成图片, 模型: ${finalModelId}, 比例: ${aspectRatio}`);
    // 构建请求体（OpenAI 格式）
    const requestBody = {
        model: finalModelId,
        messages: [
            {
                role: 'user',
                content: prompt,
            },
        ],
    };
    // 如果有参考图，添加到请求中
    if (referenceImages && referenceImages.length > 0) {
        requestBody.image = referenceImages[0];
        logger_1.logger.info(`[Sora] 使用参考图进行生成（图生图模式）`);
    }
    // 优先使用 waule-api 网关（不需要前端传 API key）
    const wauleApiClient = (0, waule_api_client_1.getGlobalWauleApiClient)();
    if (wauleApiClient) {
        try {
            logger_1.logger.info(`[Sora] 使用 waule-api 网关调用`);
            const response = await wauleApiClient.soraChatCompletions(requestBody);
            // 解析响应中的图片URL
            const content = response.choices?.[0]?.message?.content || '';
            const imgMatch = content.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
            if (!imgMatch || !imgMatch[1]) {
                logger_1.logger.error('[Sora] 无法从 waule-api 响应中提取图片URL:', content);
                throw new Error('Sora API响应中没有图片URL');
            }
            const imageUrl = imgMatch[1];
            logger_1.logger.info(`[Sora] ✅ 图片生成成功 (waule-api)`, { imageUrl: imageUrl.substring(0, 80) });
            return imageUrl;
        }
        catch (error) {
            logger_1.logger.warn(`[Sora] waule-api 调用失败，回退到直连: ${error.message}`);
        }
    }
    // 回退：直接调用 sora2api
    const API_KEY = apiKey || process.env.SORA_API_KEY || 'han1234';
    const BASE_URL = apiUrl || process.env.SORA_API_URL || 'http://localhost:8000';
    if (!API_KEY) {
        throw new Error('Sora API 密钥未配置');
    }
    try {
        logger_1.logger.info(`[Sora] 请求详情:`, {
            url: `${BASE_URL}/v1/chat/completions`,
            model: finalModelId,
            promptLength: prompt.length,
            hasReferenceImage: referenceImages.length > 0,
        });
        // 使用 responseType: 'text' 来接收 SSE 流式响应
        const agent = getProxyAgent();
        const response = await axios_1.default.post(`${BASE_URL}/v1/chat/completions`, requestBody, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            responseType: 'text',
            timeout: 300000,
            ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
        });
        logger_1.logger.info(`[Sora] API 响应状态: ${response.status} ${response.statusText}`);
        logger_1.logger.info(`[Sora] API 响应 Content-Type: ${response.headers['content-type']}`);
        logger_1.logger.info(`[Sora] API 响应数据类型: ${typeof response.data}`);
        logger_1.logger.info(`[Sora] API 响应数据长度: ${response.data?.length || 0} 字节`);
        // 检查是否是 SSE 响应
        const isSSE = response.headers['content-type']?.includes('text/event-stream');
        logger_1.logger.info(`[Sora] 是否为 SSE 流式响应: ${isSSE ? 'YES' : 'NO'}`);
        let parsedData;
        if (isSSE) {
            // 解析 SSE 格式
            logger_1.logger.info(`[Sora] 开始解析 SSE 流式响应...`);
            parsedData = parseSSEResponse(response.data);
        }
        else {
            // 普通 JSON 响应
            logger_1.logger.info(`[Sora] 解析普通 JSON 响应`);
            parsedData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        }
        logger_1.logger.info(`[Sora] 解析后的数据结构:`, JSON.stringify(parsedData, null, 2).substring(0, 500) + '...');
        if (!parsedData || !parsedData.choices || parsedData.choices.length === 0) {
            logger_1.logger.error('[Sora] API 响应格式错误，完整数据:', JSON.stringify(parsedData, null, 2));
            logger_1.logger.error('[Sora] 期望格式: { choices: [{ message: { content: "<img src=...>" } }] }');
            throw new Error('Sora API未返回有效数据');
        }
        // 解析响应中的图片URL
        const content = parsedData.choices[0].message.content;
        logger_1.logger.info(`[Sora] 最终 content:`, content);
        // 从 HTML 标签中提取图片URL: <img src="..." /> 或 <img src='...' />
        // 支持单引号和双引号
        const imgMatch = content.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
        if (!imgMatch || !imgMatch[1]) {
            logger_1.logger.error('[Sora] 无法从响应中提取图片URL:', content);
            throw new Error('Sora API响应中没有图片URL');
        }
        const imageUrl = imgMatch[1];
        // 下载图片到本地
        const localImageUrl = await downloadFile(imageUrl, 'image');
        logger_1.logger.info(`[Sora] ✅ 图片生成成功！`, {
            remoteUrl: imageUrl,
            localUrl: localImageUrl,
        });
        return localImageUrl;
    }
    catch (error) {
        logger_1.logger.error('[Sora] 图片生成失败:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: typeof error.response?.data === 'string'
                ? error.response.data.substring(0, 200) + '...'
                : error.response?.data,
            message: error.message,
        });
        if (error.response?.data) {
            const errorMessage = error.response.data.error?.message ||
                (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data));
            throw new Error(`Sora API错误: ${errorMessage}`);
        }
        throw new Error(`Sora图片生成失败: ${error.message}`);
    }
}
/**
 * 解析 SSE (Server-Sent Events) 流式响应
 * 格式：data: {...}\n\ndata: {...}\n\ndata: [DONE]\n\n
 */
function parseSSEResponse(sseText) {
    logger_1.logger.info(`[Sora] 开始解析 SSE 响应，总长度: ${sseText.length} 字节`);
    const lines = sseText.split('\n');
    const chunks = [];
    for (const line of lines) {
        if (line.startsWith('data: ')) {
            const data = line.substring(6).trim(); // 移除 "data: " 前缀
            if (data === '[DONE]') {
                logger_1.logger.info(`[Sora] SSE 流结束标记: [DONE]`);
                break;
            }
            try {
                const json = JSON.parse(data);
                chunks.push(json);
            }
            catch (e) {
                logger_1.logger.warn(`[Sora] 无法解析 SSE chunk: ${data.substring(0, 100)}...`);
            }
        }
    }
    console.log(`[Sora] 解析完成，共 ${chunks.length} 个 chunks`);
    // 合并所有 chunk 的 content（流式响应会分多个chunk返回）
    let fullContent = '';
    for (const chunk of chunks) {
        // 检查 delta.content（流式）或 message.content（非流式）
        const deltaContent = chunk.choices?.[0]?.delta?.content;
        const messageContent = chunk.choices?.[0]?.message?.content;
        const content = deltaContent || messageContent;
        // 只有当 content 是非空字符串时才拼接（排除 null、undefined、空字符串）
        if (content && typeof content === 'string' && content.trim()) {
            fullContent += content;
        }
    }
    console.log(`[Sora] SSE 合并前的 chunks 数量: ${chunks.length}`);
    console.log(`[Sora] SSE 各 chunk 的 content: ${chunks.map(c => c.choices?.[0]?.delta?.content || c.choices?.[0]?.message?.content || '(empty)').join(' | ')}`);
    console.log(`[Sora] SSE 合并后的 fullContent: "${fullContent}"`);
    if (fullContent) {
        logger_1.logger.info(`[Sora] 合并后的 content 长度: ${fullContent.length}`);
        logger_1.logger.info(`[Sora] 合并后的 content 预览: ${fullContent.substring(0, 200)}...`);
        return {
            choices: [
                {
                    message: {
                        content: fullContent
                    }
                }
            ]
        };
    }
    // 如果没找到，返回所有 chunks 供调试
    logger_1.logger.warn(`[Sora] ⚠️ 未找到包含 content 的 chunk`);
    logger_1.logger.warn(`[Sora] 原始响应: ${sseText.substring(0, 500)}...`);
    return { chunks, raw: sseText };
}
/**
 * 生成视频
 */
async function generateVideo(options) {
    const { prompt, modelId, aspectRatio = '16:9', referenceImage, referenceVideo, duration = 10, apiKey, apiUrl, } = options;
    // 根据比例选择模型
    const orientation = getOrientationFromRatio(aspectRatio);
    const durationSuffix = duration === 15 ? '15s' : '10s';
    let finalModelId = modelId;
    if (modelId === 'sora-video') {
        finalModelId = `sora-video-${orientation}-${durationSuffix}`;
    }
    else if (modelId === 'sora-video-portrait' || modelId === 'sora-video-landscape') {
        finalModelId = `${modelId}-${durationSuffix}`;
    }
    logger_1.logger.info(`[Sora] 生成视频, 模型: ${finalModelId}, 比例: ${aspectRatio}`);
    // 构建消息内容
    let messageContent;
    if (referenceVideo) {
        const videoDataUrl = await urlToBase64DataUrl(referenceVideo, 'video/mp4');
        logger_1.logger.info(`[Sora] 视频已转换为base64`);
        if (prompt && prompt.trim()) {
            messageContent = [
                { type: 'video_url', video_url: { url: videoDataUrl } },
                { type: 'text', text: prompt },
            ];
            logger_1.logger.info(`[Sora] 使用视频+提示词进行生成（视频生视频模式）`);
        }
        else {
            messageContent = [
                { type: 'video_url', video_url: { url: videoDataUrl } },
            ];
            logger_1.logger.info(`[Sora] 使用视频进行角色创建`);
        }
    }
    else if (referenceImage) {
        // 直接使用原始HTTP URL，让gateway下载并上传为文件
        // future-sora-api 需要文件上传，不是URL或base64
        messageContent = [
            { type: 'text', text: prompt || '' },
            { type: 'image_url', image_url: { url: referenceImage } },
        ];
        logger_1.logger.info(`[Sora] 使用参考图进行生成（图生视频模式）, 图片URL: ${referenceImage.substring(0, 80)}...`);
    }
    else {
        messageContent = prompt;
        logger_1.logger.info(`[Sora] 使用纯文本进行生成（文生视频模式）`);
    }
    const requestBody = {
        model: finalModelId,
        messages: [{ role: 'user', content: messageContent }],
        stream: true,
    };
    // 优先使用 waule-api 网关（不需要前端传 API key）
    const wauleApiClient = (0, waule_api_client_1.getGlobalWauleApiClient)();
    if (wauleApiClient) {
        try {
            logger_1.logger.info(`[Sora] 使用 waule-api 网关调用`);
            const response = await wauleApiClient.soraChatCompletions(requestBody);
            const content = response.choices?.[0]?.message?.content || '';
            const videoMatch = content.match(/<video[^>]+src=['"]([^'"]+)['"]/i);
            if (!videoMatch || !videoMatch[1]) {
                logger_1.logger.error('[Sora] 无法从 waule-api 响应中提取视频URL:', content);
                throw new Error('Sora API响应中没有视频URL');
            }
            const videoUrl = videoMatch[1];
            logger_1.logger.info(`[Sora] ✅ 视频生成成功 (waule-api)`, { videoUrl: videoUrl.substring(0, 80) });
            return videoUrl;
        }
        catch (error) {
            logger_1.logger.warn(`[Sora] waule-api 调用失败，回退到直连: ${error.message}`);
        }
    }
    // 回退：直接调用 sora2api
    const API_KEY = apiKey || process.env.SORA_API_KEY || 'han1234';
    const BASE_URL = apiUrl || process.env.SORA_API_URL || 'http://localhost:8000';
    if (!API_KEY) {
        throw new Error('Sora API 密钥未配置');
    }
    try {
        logger_1.logger.info(`[Sora] 请求详情 (直连):`, {
            url: `${BASE_URL}/v1/chat/completions`,
            model: finalModelId,
            promptLength: prompt?.length || 0,
            hasReferenceImage: !!referenceImage,
            hasReferenceVideo: !!referenceVideo,
        });
        const agent = getProxyAgent();
        const response = await axios_1.default.post(`${BASE_URL}/v1/chat/completions`, requestBody, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            responseType: 'text',
            timeout: 600000,
            ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
        });
        logger_1.logger.info(`[Sora] API 响应状态: ${response.status} ${response.statusText}`);
        logger_1.logger.info(`[Sora] API 响应 Content-Type: ${response.headers['content-type']}`);
        logger_1.logger.info(`[Sora] API 响应数据类型: ${typeof response.data}`);
        logger_1.logger.info(`[Sora] API 响应数据长度: ${response.data?.length || 0} 字节`);
        // 检查是否是 SSE 响应
        const isSSE = response.headers['content-type']?.includes('text/event-stream');
        logger_1.logger.info(`[Sora] 是否为 SSE 流式响应: ${isSSE ? 'YES' : 'NO'}`);
        let parsedData;
        if (isSSE) {
            // 解析 SSE 格式
            logger_1.logger.info(`[Sora] 开始解析 SSE 流式响应...`);
            parsedData = parseSSEResponse(response.data);
        }
        else {
            // 普通 JSON 响应
            logger_1.logger.info(`[Sora] 解析普通 JSON 响应`);
            parsedData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        }
        logger_1.logger.info(`[Sora] 解析后的数据结构:`, JSON.stringify(parsedData, null, 2).substring(0, 500) + '...');
        if (!parsedData || !parsedData.choices || parsedData.choices.length === 0) {
            logger_1.logger.error('[Sora] API 响应格式错误，完整数据:', JSON.stringify(parsedData, null, 2));
            logger_1.logger.error('[Sora] 期望格式: { choices: [{ message: { content: "<video src=...>" } }] }');
            throw new Error('Sora API未返回有效数据');
        }
        // 解析响应中的视频URL
        const content = parsedData.choices[0].message.content;
        logger_1.logger.info(`[Sora] 最终 content:`, content);
        // 从 HTML 标签中提取视频URL: <video src='...' controls></video>
        // 支持单引号和双引号
        const videoMatch = content.match(/<video[^>]+src=['"]([^'"]+)['"]/i);
        if (!videoMatch || !videoMatch[1]) {
            logger_1.logger.error('[Sora] 无法从响应中提取视频URL:', content);
            throw new Error('Sora API响应中没有视频URL');
        }
        const videoUrl = videoMatch[1];
        // 下载视频到本地
        const localVideoUrl = await downloadFile(videoUrl, 'video');
        logger_1.logger.info(`[Sora] ✅ 视频生成成功！`, {
            remoteUrl: videoUrl,
            localUrl: localVideoUrl,
            duration: '约 5 秒',
        });
        return localVideoUrl;
    }
    catch (error) {
        logger_1.logger.error('[Sora] 视频生成失败:', {
            status: error.response?.status,
            statusText: error.response?.statusText,
            data: typeof error.response?.data === 'string'
                ? error.response.data.substring(0, 200) + '...'
                : error.response?.data,
            message: error.message,
        });
        if (error.response?.data) {
            const errorMessage = error.response.data.error?.message ||
                (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data));
            throw new Error(`Sora API错误: ${errorMessage}`);
        }
        throw new Error(`Sora视频生成失败: ${error.message}`);
    }
}
/**
 * 解析角色创建响应
 */
async function parseCharacterResponse(content) {
    // 优先解析 @username 格式的系统角色名（如 "角色名@abc123"）
    const atNameMatch = content.match(/角色名@(\w+)/);
    let characterName = '';
    if (atNameMatch) {
        characterName = `@${atNameMatch[1]}`;
        logger_1.logger.info(`[Sora] 解析出的系统角色名: "${characterName}"`);
    }
    else {
        // 回退：解析中文字符作为角色名称
        const nameMatch = content.match(/[\u4e00-\u9fa5]{2,}/);
        characterName = nameMatch ? nameMatch[0] : '';
        logger_1.logger.info(`[Sora] 解析出的角色名称: "${characterName}"`);
    }
    // 解析头像URL
    let avatarUrl = '';
    const avatarLabelMatch = content.match(/头像[:：]([^\s,，]+)/);
    if (avatarLabelMatch) {
        avatarUrl = avatarLabelMatch[1];
        logger_1.logger.info(`[Sora] 从"头像:"标签解析出头像: ${avatarUrl}`);
    }
    else {
        const imgMatch = content.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
        if (imgMatch) {
            avatarUrl = imgMatch[1];
            logger_1.logger.info(`[Sora] 从img标签解析出头像: ${avatarUrl}`);
        }
        else {
            const urlMatch = content.match(/https?:\/\/[^\s"'<>，,]+/i);
            if (urlMatch) {
                avatarUrl = urlMatch[0];
                logger_1.logger.info(`[Sora] 从URL匹配解析出头像: ${avatarUrl}`);
            }
            else {
                logger_1.logger.warn(`[Sora] 响应中没有找到头像URL`);
            }
        }
    }
    if (avatarUrl) {
        avatarUrl = await downloadFile(avatarUrl, 'image');
    }
    if (!characterName) {
        logger_1.logger.warn('[Sora] 未能从响应中提取角色名称，完整内容:', content);
        throw new Error('未能从响应中提取角色名称');
    }
    logger_1.logger.info(`[Sora] ✅ 角色创建成功！`, { characterName, avatarUrl: avatarUrl || '(无头像)' });
    return { characterName, avatarUrl };
}
/**
 * 创建角色（从视频中提取角色信息）
 * 不传prompt，只传视频，API会返回角色名称和头像
 */
async function createCharacter(options) {
    const { videoUrl, modelId = 'sora-video-landscape-10s', apiKey, apiUrl, } = options;
    // 确保模型ID有正确的格式（需要duration后缀）
    let finalModelId = modelId;
    if (!modelId.match(/-(10|15|25)s$/)) {
        if (modelId === 'sora-video' || modelId.includes('sora')) {
            finalModelId = 'sora-video-landscape-10s';
        }
        else {
            finalModelId = `${modelId}-10s`;
        }
    }
    logger_1.logger.info(`[Sora] 创建角色, 模型: ${finalModelId}`);
    logger_1.logger.info(`[Sora] 使用视频URL: ${videoUrl.substring(0, 100)}...`);
    // 优先使用 waule-api 网关
    const wauleApiClient = (0, waule_api_client_1.getGlobalWauleApiClient)();
    if (wauleApiClient) {
        // ===== 尝试使用 future-sora-api 创建角色（需要原始HTTP URL）=====
        // future-sora-api 不接受 base64，需要直接传 HTTP URL
        if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
            try {
                logger_1.logger.info(`[Sora] 尝试使用 future-sora-api 创建角色 (HTTP URL)`);
                logger_1.logger.info(`[Sora] 视频URL: ${videoUrl.substring(0, 100)}...`);
                const response = await wauleApiClient.futureSoraCreateCharacter({
                    url: videoUrl,
                    timestamps: '1,3',
                });
                logger_1.logger.info(`[Sora] future-sora-api 响应:`, JSON.stringify(response).substring(0, 300));
                // 解析 future-sora-api 返回的角色信息
                const characterName = response.id || response.username || '';
                const avatarUrl = response.profile_picture_url || response.permalink || '';
                // 返回生成的视频URL，让前端截取首帧作为头像
                const generatedVideoUrl = response.video_url || '';
                if (characterName) {
                    logger_1.logger.info(`[Sora] future-sora-api 角色创建成功: @${characterName}, avatar: ${avatarUrl}, videoUrl: ${generatedVideoUrl}`);
                    return {
                        characterName: `@${characterName}`,
                        avatarUrl,
                        videoUrl: generatedVideoUrl, // 前端用于截取首帧
                    };
                }
                else {
                    logger_1.logger.warn(`[Sora] future-sora-api 返回数据没有角色名:`, response);
                }
            }
            catch (error) {
                logger_1.logger.error(`[Sora] future-sora-api 创建角色失败:`, {
                    message: error.message,
                    status: error.response?.status,
                    data: error.response?.data,
                });
                // 继续尝试 sora2api
            }
        }
        // ===== 使用 sora2api (需要 base64) =====
        try {
            logger_1.logger.info(`[Sora] 使用 waule-api 网关创建角色 (sora2api)`);
            // sora2api 需要 base64 格式的视频数据
            const videoDataUrl = await urlToBase64DataUrl(videoUrl, 'video/mp4');
            logger_1.logger.info(`[Sora] 视频已转换为base64, 大小约: ${(videoDataUrl.length / 1024 / 1024).toFixed(2)} MB`);
            const requestBody = {
                model: finalModelId,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'video_url',
                                video_url: {
                                    url: videoDataUrl,
                                },
                            },
                        ],
                    },
                ],
                stream: true,
            };
            const response = await wauleApiClient.soraChatCompletions(requestBody);
            const content = response.choices?.[0]?.message?.content || '';
            logger_1.logger.info(`[Sora] 角色创建响应:`, { contentLength: content.length, preview: content.substring(0, 200) });
            return parseCharacterResponse(content);
        }
        catch (error) {
            logger_1.logger.warn(`[Sora] waule-api 创建角色失败，回退到直连: ${error.message}`);
        }
    }
    // 回退：直接调用 sora2api
    const API_KEY = apiKey || process.env.SORA_API_KEY || 'han1234';
    const BASE_URL = apiUrl || process.env.SORA_API_URL || 'http://localhost:8000';
    if (!API_KEY) {
        throw new Error('Sora API 密钥未配置');
    }
    // sora2api 需要 base64 格式的视频数据
    const videoDataUrl = await urlToBase64DataUrl(videoUrl, 'video/mp4');
    logger_1.logger.info(`[Sora] 视频已转换为base64 (直连), 大小约: ${(videoDataUrl.length / 1024 / 1024).toFixed(2)} MB`);
    const directRequestBody = {
        model: finalModelId,
        messages: [
            {
                role: 'user',
                content: [
                    {
                        type: 'video_url',
                        video_url: {
                            url: videoDataUrl,
                        },
                    },
                ],
            },
        ],
        stream: true,
    };
    try {
        logger_1.logger.info(`[Sora] 角色创建请求 (直连):`, {
            url: `${BASE_URL}/v1/chat/completions`,
            model: finalModelId,
        });
        const agent = getProxyAgent();
        const response = await axios_1.default.post(`${BASE_URL}/v1/chat/completions`, directRequestBody, {
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            responseType: 'text',
            timeout: 300000,
            ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
        });
        console.log(`[Sora] 角色创建响应状态: ${response.status}`);
        console.log(`[Sora] 角色创建响应 Content-Type: ${response.headers['content-type']}`);
        console.log(`[Sora] 角色创建原始响应（前1000字符）: ${typeof response.data === 'string' ? response.data.substring(0, 1000) : JSON.stringify(response.data).substring(0, 1000)}`);
        const isSSE = response.headers['content-type']?.includes('text/event-stream');
        let parsedData;
        if (isSSE) {
            console.log(`[Sora] 检测到 SSE 流式响应，开始解析...`);
            parsedData = parseSSEResponse(response.data);
        }
        else {
            console.log(`[Sora] 检测到普通 JSON 响应，开始解析...`);
            parsedData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
        }
        console.log(`[Sora] 角色创建解析后响应:`, JSON.stringify(parsedData, null, 2).substring(0, 1000));
        if (!parsedData || !parsedData.choices || parsedData.choices.length === 0) {
            throw new Error('Sora API未返回有效的角色数据');
        }
        const content = parsedData.choices[0].message?.content || parsedData.choices[0].delta?.content || '';
        logger_1.logger.info(`[Sora] 角色创建响应 (直连):`, { contentLength: content.length, preview: content.substring(0, 200) });
        return parseCharacterResponse(content);
    }
    catch (error) {
        logger_1.logger.error('[Sora] 角色创建失败:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message,
        });
        if (error.response?.data) {
            const errorMessage = error.response.data.error?.message ||
                (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data));
            throw new Error(`Sora API错误: ${errorMessage}`);
        }
        throw new Error(`角色创建失败: ${error.message}`);
    }
}
//# sourceMappingURL=sora.service.js.map