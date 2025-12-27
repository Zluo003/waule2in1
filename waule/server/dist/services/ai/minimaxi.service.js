"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadVideoByFileId = downloadVideoByFileId;
exports.downloadVideoToOss = downloadVideoToOss;
exports.queryVideoTaskStatus = queryVideoTaskStatus;
exports.generateVideo = generateVideo;
const axios_1 = __importDefault(require("axios"));
const oss_1 = require("../../utils/oss");
const storage_service_1 = require("../storage.service");
const waule_api_client_1 = require("../waule-api.client");
// 下载视频并直接上传到 OSS
async function downloadToLocal(url, filenamePrefix, headers) {
    return (0, oss_1.downloadAndUploadToOss)(url, filenamePrefix, headers);
}
async function pollVideoTask(baseUrl, apiKey, taskId, genTaskId, maxAttempts = 120) {
    // 官方文档正确路径：/v1/query/video_generation
    const queryUrl = `${baseUrl}/query/video_generation?task_id=${encodeURIComponent(taskId)}`;
    for (let i = 0; i < maxAttempts; i++) {
        // 🛑 检查任务是否已被删除或取消
        if (genTaskId) {
            try {
                const { prisma } = require('../index');
                const dbTask = await prisma.generationTask.findUnique({
                    where: { id: genTaskId },
                    select: { id: true, status: true },
                });
                // 如果任务不存在或已被标记为失败/取消，停止轮询
                if (!dbTask) {
                    console.log('🛑 MiniMax 任务已被删除，停止轮询:', genTaskId);
                    throw new Error('任务已被删除');
                }
                if (dbTask.status === 'FAILURE' || dbTask.status === 'CANCELLED') {
                    console.log('🛑 MiniMax 任务已取消，停止轮询:', genTaskId);
                    throw new Error('任务已取消');
                }
            }
            catch (e) {
                if (e.message.includes('已被删除') || e.message.includes('已取消')) {
                    throw e;
                }
                // 数据库查询失败不影响轮询
            }
        }
        try {
            const response = await axios_1.default.get(queryUrl, {
                headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
                timeout: 300000,
            });
            const data = response.data || {};
            const status = data.status || data.data?.status || '';
            const s = String(status).toLowerCase();
            console.log(`🔍 MiniMax 任务状态查询 [${i + 1}/${maxAttempts}]:`, { taskId, genTaskId, status: s });
            if (s === 'success' || s === 'succeeded' || s === 'done') {
                const fileId = data.file_id || data.data?.file_id;
                if (!fileId) {
                    throw new Error('任务成功但未返回 file_id');
                }
                console.log('✅ MiniMax 视频生成成功，file_id:', fileId);
                // 返回 file_id，由调用方处理下载
                return fileId;
            }
            if (s === 'fail' || s === 'failed' || s === 'error' || s === 'cancelled') {
                const msg = data.error || data.message || data.base_resp?.status_msg || '视频生成失败';
                throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
            }
            // Processing, Queueing, Preparing 状态继续等待
        }
        catch (e) {
            const code = e?.response?.status;
            if (code && code !== 404) {
                console.error('❌ MiniMax 状态查询出错:', e.message);
                throw e;
            }
        }
        await new Promise((r) => setTimeout(r, 10000));
    }
    throw new Error('视频生成超时');
}
async function downloadVideoByFileId(baseUrl, apiKey, fileId) {
    const downloadUrl = `${baseUrl}/files/retrieve_content?file_id=${encodeURIComponent(fileId)}`;
    try {
        const localUrl = await downloadToLocal(downloadUrl, 'minimaxi-video', { Authorization: `Bearer ${apiKey}` });
        return localUrl;
    }
    catch {
        return downloadUrl;
    }
}
async function downloadVideoToOss(baseUrl, apiKey, fileId) {
    const headers = { Authorization: `Bearer ${apiKey}` };
    // 先尝试通过 /v1/files/retrieve 获取 download_url（官方文档推荐方式）
    const retrieveUrl = `${baseUrl}/files/retrieve?file_id=${encodeURIComponent(fileId)}`;
    try {
        console.log('🔍 MiniMax 获取下载链接:', retrieveUrl);
        const r = await axios_1.default.get(retrieveUrl, { headers, timeout: 300000 });
        const d = r.data || {};
        const file = d.file || d.data?.file;
        const downloadUrl = file?.download_url || file?.url;
        if (downloadUrl) {
            console.log('✅ 获取到下载链接:', downloadUrl);
            // 下载视频内容
            const c = await axios_1.default.get(downloadUrl, { responseType: 'arraybuffer', timeout: 600000 });
            const buf = Buffer.from(c.data);
            if (buf.length < 102400) {
                throw new Error('MiniMax 下载的视频文件过小，可能有问题');
            }
            // 上传到 OSS
            const ossUrl = await storage_service_1.storageService.uploadBuffer(buf, '.mp4');
            console.log('✅ 视频已上传到 OSS:', ossUrl);
            return ossUrl;
        }
    }
    catch (e) {
        console.error('❌ 通过 /files/retrieve 下载失败:', e.message);
        // 如果获取失败，尝试直接下载
    }
    // 如果上面失败，尝试直接通过 /files/retrieve_content 下载内容
    const contentUrl = `${baseUrl}/files/retrieve_content?file_id=${encodeURIComponent(fileId)}`;
    console.log('🔍 MiniMax 直接下载内容:', contentUrl);
    const res2 = await axios_1.default.get(contentUrl, { responseType: 'arraybuffer', headers, timeout: 600000 });
    const buf2 = Buffer.from(res2.data);
    if (buf2.length < 102400) {
        throw new Error('MiniMax 下载的视频文件过小，可能有问题');
    }
    const ossUrl = await storage_service_1.storageService.uploadBuffer(buf2, '.mp4');
    console.log('✅ 视频已上传到 OSS:', ossUrl);
    return ossUrl;
}
async function queryVideoTaskStatus(baseUrl, apiKey, taskId) {
    // 官方文档正确路径：/v1/query/video_generation
    const queryUrl = `${baseUrl}/query/video_generation?task_id=${encodeURIComponent(taskId)}`;
    const response = await axios_1.default.get(queryUrl, {
        headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        timeout: 120000,
    });
    return response.data;
}
async function generateVideo(options) {
    const { prompt, modelId, aspectRatio = '16:9', resolution = '1080P', duration = 5, referenceImages = [], apiKey, apiUrl, generationType, callbackUrl, } = options;
    const API_KEY = apiKey || process.env.MINIMAX_API_KEY || process.env.MINIMAXI_API_KEY || process.env.MINIMAX_API_TOKEN;
    const BASE_URL = apiUrl || 'https://api.minimaxi.com/v1';
    // 如果 apiKey 为空，使用 waule-api 网关
    if (!API_KEY) {
        const wauleApiClient = (0, waule_api_client_1.getGlobalWauleApiClient)();
        if (wauleApiClient) {
            console.log('🌐 [MiniMax] apiKey 为空，使用 waule-api 网关生成视频');
            const r = await wauleApiClient.generateVideo({
                model: modelId,
                prompt,
                duration,
                aspect_ratio: aspectRatio,
                resolution,
                reference_images: referenceImages || undefined,
                generation_type: generationType,
            });
            const videoUrl = r?.data?.[0]?.url;
            if (!videoUrl)
                throw new Error('waule-api 未返回视频数据');
            return videoUrl;
        }
        throw new Error('MiniMax API 密钥未配置，且 waule-api 网关未配置');
    }
    const hasImages = Array.isArray(referenceImages) && referenceImages.length > 0;
    const images = [];
    if (hasImages) {
        for (const u of referenceImages) {
            if (!u)
                continue;
            if (u.startsWith('data:')) {
                const m = /^data:(.+?);base64,(.*)$/i.exec(u);
                const ext = m && /png/i.test(m[1]) ? '.png' : '.jpg';
                const b64 = m ? m[2] : u.split(',')[1];
                if (b64) {
                    const url = await storage_service_1.storageService.uploadBuffer(Buffer.from(b64, 'base64'), ext);
                    images.push(url);
                }
            }
            else {
                const url = await (0, oss_1.ensureAliyunOssUrl)(u);
                images.push(url || u);
            }
        }
    }
    const isFastModel = /Fast/i.test(modelId);
    const normalizeType = (raw, imgLen) => {
        const t = (raw || '').toLowerCase();
        if (t.includes('主体') || t.includes('subject'))
            return 's2v';
        if (t.includes('首尾') || t.includes('start_end') || t.includes('fl2v'))
            return 'fl2v';
        if (t.includes('首帧') || t.includes('图生') || t.includes('i2v'))
            return 'i2v';
        if (t.includes('文生') || t.includes('t2v'))
            return 't2v';
        if (imgLen >= 2)
            return 'fl2v';
        if (imgLen === 1)
            return 'i2v';
        return 't2v';
    };
    let type = normalizeType(generationType, images.length);
    const endpoint = `${BASE_URL}/video_generation`;
    const payload = { model: modelId, prompt, resolution, duration };
    if (type === 'i2v' && images.length >= 1) {
        payload.first_frame_image = images[0];
    }
    else if (type === 'fl2v' && images.length >= 2) {
        payload.first_frame_image = images[0];
        payload.last_frame_image = images[1];
    }
    else if (type === 's2v') {
        payload.subject_reference = [{ type: 'character', image: images }];
    }
    const cbUrl = options.callbackUrl || process.env.MINIMAX_CALLBACK_URL;
    if (cbUrl)
        payload.callback_url = cbUrl;
    const norm = (mid, dur, res) => {
        const lower = (mid || '').toLowerCase();
        let d = dur;
        let r = res;
        if (lower.includes('hailuo')) {
            const allowedDur = [6, 10];
            const allowedRes = ['768P', '1080P'];
            if (!allowedDur.includes(d))
                d = 6;
            if (r === '720P')
                r = '768P';
            if (!allowedRes.includes(r))
                r = '768P';
        }
        return { d, r };
    };
    const nr = norm(modelId, Number(payload.duration), String(payload.resolution));
    payload.duration = nr.d;
    payload.resolution = nr.r;
    const resp = await axios_1.default.post(endpoint, payload, {
        headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
        timeout: 300000,
    });
    const taskId = resp.data?.task_id || resp.data?.data?.task_id || (Array.isArray(resp.data) ? resp.data[0]?.task_id : undefined);
    if (!taskId) {
        const base = resp.data?.base_resp;
        const msg = base?.status_msg || resp.data?.message || JSON.stringify(resp.data);
        throw new Error(`MiniMax 未返回任务ID: ${msg}`);
    }
    if (cbUrl) {
        return `task:${String(taskId)}`;
    }
    // 轮询任务状态，获取 file_id
    const fileId = await pollVideoTask(BASE_URL, API_KEY, String(taskId), options.genTaskId);
    // 通过 file_id 获取视频下载链接
    const retrieveUrl = `${BASE_URL}/files/retrieve?file_id=${encodeURIComponent(fileId)}`;
    try {
        console.log('🔍 MiniMax 获取下载链接:', retrieveUrl);
        const r = await axios_1.default.get(retrieveUrl, {
            headers: { Authorization: `Bearer ${API_KEY}` },
            timeout: 300000,
        });
        const file = r.data?.file || r.data?.data?.file;
        const downloadUrl = file?.download_url || file?.url;
        if (downloadUrl) {
            console.log('✅ 获取到下载链接:', downloadUrl);
            // 下载到本地
            const localUrl = await downloadToLocal(downloadUrl, 'minimaxi-video', { Authorization: `Bearer ${API_KEY}` });
            return localUrl;
        }
    }
    catch (e) {
        console.error('❌ 通过 /files/retrieve 获取下载链接失败:', e.message);
    }
    // 如果上面失败，尝试直接下载
    const contentUrl = `${BASE_URL}/files/retrieve_content?file_id=${encodeURIComponent(fileId)}`;
    console.log('🔍 MiniMax 直接下载视频:', contentUrl);
    const localUrl = await downloadToLocal(contentUrl, 'minimaxi-video', { Authorization: `Bearer ${API_KEY}` });
    return localUrl;
}
exports.default = { generateVideo };
//# sourceMappingURL=minimaxi.service.js.map