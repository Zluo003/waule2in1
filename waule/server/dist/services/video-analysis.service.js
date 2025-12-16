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
exports.VideoAnalysisService = void 0;
const index_1 = require("../index");
const geminiService = __importStar(require("./ai/gemini.service"));
const logger_1 = require("../utils/logger");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const ffprobe_static_1 = __importDefault(require("ffprobe-static"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
if (ffmpeg_static_1.default) {
    fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
}
if (ffprobe_static_1.default && ffprobe_static_1.default.path) {
    fluent_ffmpeg_1.default.setFfprobePath(ffprobe_static_1.default.path);
}
class VideoAnalysisService {
    constructor() {
        // 使用现有的 Gemini 服务
    }
    // 获取 Gemini 模型配置
    async getGeminiModel() {
        const model = await index_1.prisma.aIModel.findFirst({
            where: {
                modelId: 'gemini-2.5-flash',
                provider: 'google',
                isActive: true,
            },
        });
        if (!model || !model.apiKey) {
            throw new Error('Gemini 2.5 Flash 模型未配置，请在管理后台-模型配置中添加');
        }
        return model;
    }
    // 创建分析记录
    async createAnalysis(data) {
        return index_1.prisma.videoAnalysis.create({
            data: {
                userId: data.userId,
                projectId: data.projectId,
                videoFile: data.videoUrl,
                fileName: data.fileName,
                fileSize: BigInt(data.fileSize),
                title: '分析中...',
                summary: '',
                duration: 0,
                width: 0,
                height: 0,
                frameCount: 0,
                status: 'PENDING',
            },
        });
    }
    // 获取用户的所有分析
    async getUserAnalyses(userId) {
        return index_1.prisma.videoAnalysis.findMany({
            where: {
                userId,
                deletedAt: null,
            },
            include: {
                _count: {
                    select: { shots: true },
                },
            },
            orderBy: { createdAt: 'desc' },
        });
    }
    // 获取分析详情
    async getAnalysisById(id, userId) {
        return index_1.prisma.videoAnalysis.findFirst({
            where: {
                id,
                userId,
                deletedAt: null,
            },
            include: {
                shots: { orderBy: { shotNumber: 'asc' } },
                scripts: { orderBy: { version: 'desc' } },
                posters: { orderBy: { variation: 'asc' } },
            },
        });
    }
    // 启动分析任务
    async startAnalysisTask(analysisId) {
        try {
            logger_1.logger.info(`开始视频分析: ${analysisId}`);
            // 1. 提取视频帧
            await this.updateStatus(analysisId, 'EXTRACTING_FRAMES', 10);
            const frames = await this.extractFrames(analysisId);
            logger_1.logger.info(`提取了 ${frames.length} 帧`);
            if (frames.length === 0) {
                throw new Error('未能提取到视频帧');
            }
            // 2. AI 分析
            await this.updateStatus(analysisId, 'ANALYZING', 50);
            const result = await this.analyzeWithGemini(analysisId, frames);
            // 3. 保存结果
            await this.saveAnalysisResult(analysisId, result, frames.length);
            // 完成
            await this.updateStatus(analysisId, 'COMPLETE', 100);
            logger_1.logger.info(`视频分析完成: ${analysisId}`);
        }
        catch (error) {
            logger_1.logger.error(`视频分析失败: ${analysisId}`, error);
            await this.updateStatus(analysisId, 'ERROR', 0, error.message);
        }
    }
    // 创建占位结果（临时实现）
    async createPlaceholderResult(analysisId) {
        const analysis = await index_1.prisma.videoAnalysis.findUnique({
            where: { id: analysisId },
        });
        if (!analysis)
            throw new Error('分析记录不存在');
        // 更新标题和摘要
        await index_1.prisma.videoAnalysis.update({
            where: { id: analysisId },
            data: {
                title: `${analysis.fileName} - 待分析`,
                summary: '🚧 视频分析功能开发中\n\n完整的AI分析功能需要：\n\n1. ✅ 视频上传功能（已完成）\n2. ⏳ 配置 Gemini 2.5 Flash API Key\n3. ⏳ 实现视频帧提取（ffmpeg）\n4. ⏳ 重构服务使用 geminiService\n\n请在管理后台-模型配置中添加 Gemini 2.5 Flash 的 API Key。',
            },
        });
    }
    // 提取视频帧 (复刻 CineView-AI 逻辑)
    async extractFrames(analysisId) {
        const analysis = await index_1.prisma.videoAnalysis.findUnique({
            where: { id: analysisId },
        });
        if (!analysis)
            throw new Error('分析记录不存在');
        const videoPath = path_1.default.join(process.cwd(), analysis.videoFile);
        if (!fs_1.default.existsSync(videoPath)) {
            throw new Error(`视频文件不存在: ${videoPath}`);
        }
        return new Promise((resolve, reject) => {
            const frames = [];
            const outputDir = path_1.default.join(process.cwd(), 'temp_frames', analysisId);
            if (!fs_1.default.existsSync(outputDir)) {
                fs_1.default.mkdirSync(outputDir, { recursive: true });
            }
            // 获取视频时长
            fluent_ffmpeg_1.default.ffprobe(videoPath, (err, metadata) => {
                if (err)
                    return reject(err);
                const duration = metadata.format.duration || 0;
                // CineView-AI 采样策略:
                // < 30s: 10 fps (0.1s)
                // < 60s: 5 fps (0.2s)
                // > 60s: 2.5 fps (0.4s)
                let fps = 2.5;
                if (duration <= 30) {
                    fps = 10;
                }
                else if (duration <= 60) {
                    fps = 5;
                }
                logger_1.logger.info(`视频时长: ${duration}s, 采用采样率: ${fps} fps`);
                (0, fluent_ffmpeg_1.default)(videoPath)
                    .on('end', async () => {
                    try {
                        const files = fs_1.default.readdirSync(outputDir).filter(f => f.endsWith('.jpg')).sort((a, b) => {
                            const numA = parseInt(a.match(/\d+/)?.[0] || '0');
                            const numB = parseInt(b.match(/\d+/)?.[0] || '0');
                            return numA - numB;
                        });
                        // 计算每一帧的时间戳
                        const interval = 1 / fps;
                        for (let i = 0; i < files.length; i++) {
                            const file = files[i];
                            const filePath = path_1.default.join(outputDir, file);
                            const data = fs_1.default.readFileSync(filePath);
                            frames.push({
                                timestamp: i * interval,
                                data: data.toString('base64')
                            });
                            fs_1.default.unlinkSync(filePath);
                        }
                        fs_1.default.rmdirSync(outputDir);
                        logger_1.logger.info(`成功提取 ${frames.length} 帧`);
                        resolve(frames);
                    }
                    catch (e) {
                        reject(e);
                    }
                })
                    .on('error', (err) => {
                    logger_1.logger.error('FFmpeg error:', err);
                    reject(err);
                })
                    .outputOptions([
                    `-vf fps=${fps},scale=256:-1`, // 256px 宽度，保持比例
                    '-q:v', '5' // JPEG 质量
                ])
                    .output(path_1.default.join(outputDir, 'frame_%04d.jpg'))
                    .run();
            });
        });
    }
    // 使用Gemini分析视频帧 (分批处理 + 原版提示词)
    async analyzeWithGemini(analysisId, frames) {
        const model = await this.getGeminiModel();
        const analysis = await index_1.prisma.videoAnalysis.findUnique({
            where: { id: analysisId },
        });
        if (!analysis)
            throw new Error('分析记录不存在');
        // 分批处理配置
        // CineView-AI 原版使用了 300 帧的限制，这里我们保持分批处理以支持任意长度
        // 但为了保持"原汁原味"，我们尽量让每一批都像是一个完整的 CineView-AI 请求
        const BATCH_SIZE = 300;
        const totalBatches = Math.ceil(frames.length / BATCH_SIZE);
        logger_1.logger.info(`开始分批分析: 总帧数 ${frames.length}, 批次大小 ${BATCH_SIZE}, 总批次 ${totalBatches}`);
        let finalResult = {
            title: '',
            summary: '',
            shots: []
        };
        for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
            const startIdx = batchIndex * BATCH_SIZE;
            const endIdx = Math.min((batchIndex + 1) * BATCH_SIZE, frames.length);
            const batchFrames = frames.slice(startIdx, endIdx);
            const isFirstBatch = batchIndex === 0;
            logger_1.logger.info(`处理批次 ${batchIndex + 1}/${totalBatches} (帧 ${startIdx}-${endIdx})`);
            // 构建系统指令 (CineView-AI 原版提示词)
            const systemInstruction = `你是一位专业的电影剪辑师和场记。
    我将提供一段视频（文件名："${analysis.fileName}"）的**超高密度**截图序列。
    
    你的任务是重建场景并生成一份详细的“分镜表”（Spotting Sheet）。
    
    **关键要求：所有输出内容必须完全使用简体中文。**
    
    请仔细观察画面变化，识别每一个镜头切换点（Cut）。这是一个高帧率采样序列，务必识别出所有**微小的剪辑（Micro-cuts）**和短暂的镜头。不要遗漏任何一个镜头。
    
    对于每个镜头，请根据画面推断以下信息：
    1. 开始和结束时间 (Start/End Time)：必须严格根据提供的截图时间戳来确定。如果两张截图之间画面发生显著突变，即为切点。
    2. 景别 (Size)：必须使用中文术语（如：特写, 近景, 中景, 全景, 大全景, 远景）。
    3. 运镜 (Movement)：必须使用中文术语（如：固定, 摇镜头, 推, 拉, 跟拍, 手持, 升降）。
    4. 画面描述 (Description)：用中文简要描述画面内容和动作。
    5. 人声/对白 (Audio)：根据人物口型和语境推断（如：“男主角说话”，“沉默”，“人群嘈杂”）。
    6. 音效 (SFX)：推断可能的音效（如：“脚步声”，“爆炸声”，“汽车经过”）。
    7. 缩略图索引 (Thumbnail Index)：最能代表该镜头的图片索引。
    
    请以 JSON 格式返回数据。`;
            // 将 base64 图片转换为 data: URL 格式
            const imageUrls = batchFrames.map((frame) => `data:image/jpeg;base64,${frame.data}`);
            // 添加时间戳信息到 prompt (CineView-AI 格式)
            let prompt = "";
            batchFrames.forEach((frame, index) => {
                prompt += `[Frame Index: ${index}, Timestamp: ${frame.timestamp.toFixed(2)}s]\n`;
            });
            // 从管理后台配置读取参数
            const config = model.config;
            const maxTokens = config?.maxTokens || 8192;
            const temperature = config?.temperature || 0.2; // CineView-AI 默认似乎没有设置，但通常分析类任务低温更好
            try {
                const responseText = await geminiService.generateText({
                    apiKey: model.apiKey || undefined,
                    modelId: model.modelId,
                    systemPrompt: systemInstruction,
                    prompt: prompt,
                    imageUrls: imageUrls,
                    maxTokens: maxTokens,
                    temperature: temperature
                });
                // 清理 JSON
                let cleanText = responseText.trim();
                cleanText = cleanText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
                const batchResult = JSON.parse(cleanText);
                // 合并结果
                if (isFirstBatch) {
                    finalResult.title = batchResult.title || '未命名视频';
                    finalResult.summary = batchResult.summary || '无总结';
                }
                if (batchResult.shots && Array.isArray(batchResult.shots)) {
                    // 修正 thumbnailIndex (加上偏移量)
                    const correctedShots = batchResult.shots.map((shot) => ({
                        ...shot,
                        shotNumber: finalResult.shots.length + 1, // 重新编号
                        thumbnailIndex: (shot.thumbnailIndex || 0) + startIdx
                    }));
                    finalResult.shots.push(...correctedShots);
                }
                // 更新进度
                const progress = 10 + Math.floor((batchIndex + 1) / totalBatches * 40); // 10-50%
                await this.updateStatus(analysisId, 'ANALYZING', progress);
            }
            catch (error) {
                logger_1.logger.error(`批次 ${batchIndex + 1} 分析失败`, error);
                throw error;
            }
        }
        return finalResult;
    }
    // 保存分析结果
    async saveAnalysisResult(analysisId, result, frameCount) {
        // 更新分析记录
        await index_1.prisma.videoAnalysis.update({
            where: { id: analysisId },
            data: {
                title: result.title,
                summary: result.summary,
                frameCount: frameCount,
            },
        });
        // 清除旧的 shot 数据（如果有）
        await index_1.prisma.videoShot.deleteMany({ where: { analysisId } });
        // 保存镜头数据
        for (const shot of result.shots) {
            await index_1.prisma.videoShot.create({
                data: {
                    analysisId,
                    shotNumber: shot.shotNumber,
                    startTime: shot.startTime,
                    endTime: shot.endTime,
                    duration: shot.duration,
                    size: shot.size,
                    movement: shot.movement,
                    description: shot.description,
                    audio: shot.audio,
                    sfx: shot.sfx,
                    thumbnailIndex: shot.thumbnailIndex,
                },
            });
        }
    }
    // 更新状态
    async updateStatus(analysisId, status, progress, errorMsg) {
        // 更新数据库
        await index_1.prisma.videoAnalysis.update({
            where: { id: analysisId },
            data: {
                status: status,
                progress,
                errorMsg,
            },
        });
        // 更新Redis缓存（用于轮询）
        try {
            await index_1.redis.setex(`analysis:${analysisId}:status`, 3600, JSON.stringify({
                status,
                progress,
                errorMsg,
                updatedAt: Date.now(),
            }));
        }
        catch (error) {
            logger_1.logger.warn('Redis更新失败', error);
        }
    }
    // 更新镜头信息
    async updateShot(shotId, data) {
        return index_1.prisma.videoShot.update({
            where: { id: shotId },
            data,
        });
    }
    // 生成剧本
    async generateScript(analysisId) {
        const model = await this.getGeminiModel();
        const analysis = await index_1.prisma.videoAnalysis.findUnique({
            where: { id: analysisId },
            include: { shots: true },
        });
        if (!analysis)
            throw new Error('分析记录不存在');
        const cleanShots = analysis.shots.map((s) => ({
            id: s.shotNumber,
            time: s.startTime,
            desc: s.description,
            audio: s.audio,
        }));
        const prompt = `你是一位专业的电影编剧。根据以下分镜表（Shot List）数据，反推并生成一份标准的电影剧本格式文本。
       
       格式要求：
       1. 场景标题（SCENE HEADING）：根据内容推断，例如 "内景. 房间 - 白天"。
       2. 动作描写（ACTION）：将连续镜头的画面描述整合成连贯的动作段落。不要像分镜表那样一行行罗列，要像小说一样流畅。
       3. 角色和对白（CHARACTER & DIALOGUE）：从 'audio' 字段提取。格式为：角色名居中，对话在下方。
       
       请仅输出剧本内容，不需要任何解释。
       
       分镜表数据：
       ${JSON.stringify({
            title: analysis.title,
            summary: analysis.summary,
            shots: cleanShots,
        })}`;
        try {
            // 使用管理后台配置的参数
            const config = model.config;
            const scriptContent = await geminiService.generateText({
                apiKey: model.apiKey || undefined,
                modelId: model.modelId,
                prompt: prompt,
                maxTokens: config?.maxTokens || 8192,
                temperature: config?.temperature || 0.7
            });
            // 保存剧本
            const script = await index_1.prisma.videoScript.create({
                data: {
                    analysisId,
                    content: scriptContent,
                    version: 1,
                },
            });
            return script;
        }
        catch (error) {
            logger_1.logger.error('剧本生成失败', error);
            throw error;
        }
    }
    // 生成海报
    async generatePosters(analysisId) {
        const model = await this.getGeminiModel();
        const analysis = await index_1.prisma.videoAnalysis.findUnique({
            where: { id: analysisId },
            include: { shots: true },
        });
        if (!analysis)
            throw new Error('分析记录不存在');
        // 1. 找到最佳角色帧（简化逻辑：找特写镜头）
        // 注意：由于我们没有保存所有帧的base64到数据库，这里可能需要重新提取或使用占位逻辑
        // 实际生产中应该将关键帧上传到OSS。这里为了演示，我们尝试重新提取第N帧，或者如果没有帧数据，就纯文生图。
        // 简单起见，我们使用纯文生图，描述中包含画面描述
        const bestShot = analysis.shots.find(s => s.size.includes('特写') || s.size.includes('近景')) || analysis.shots[0];
        const prompt = `Generate a movie poster for a film titled "${analysis.title}".
    Film Summary: "${analysis.summary}".
    Key Scene Description: "${bestShot?.description || ''}".
    Style: High-quality cinematic movie poster, professional lighting, dramatic composition, title text overlay at the bottom.
    Vertical 9:16 aspect ratio.`;
        try {
            const imageUrl = await geminiService.generateImage({
                apiKey: model.apiKey || undefined,
                modelId: 'gemini-2.5-flash-image',
                prompt: prompt,
                aspectRatio: '9:16'
            });
            // 保存海报记录
            const poster = await index_1.prisma.videoPoster.create({
                data: {
                    analysisId,
                    imageUrl: imageUrl,
                    style: 'Cinematic',
                    variation: 1,
                }
            });
            return [poster];
        }
        catch (error) {
            logger_1.logger.error('海报生成失败', error);
            throw error;
        }
    }
    // 导出CSV
    async exportToCSV(analysisId) {
        const analysis = await index_1.prisma.videoAnalysis.findUnique({
            where: { id: analysisId },
            include: { shots: true },
        });
        if (!analysis)
            throw new Error('分析记录不存在');
        const headers = [
            '镜号',
            '开始时间',
            '结束时间',
            '时长',
            '景别',
            '运镜',
            '画面描述',
            '对白',
            '音效',
        ];
        const rows = analysis.shots.map((shot) => [
            shot.shotNumber,
            shot.startTime,
            shot.endTime,
            shot.duration,
            shot.size,
            shot.movement,
            `"${shot.description.replace(/"/g, '""')}"`,
            `"${shot.audio.replace(/"/g, '""')}"`,
            `"${shot.sfx.replace(/"/g, '""')}"`,
        ]);
        const csv = [headers, ...rows].map((row) => row.join(',')).join('\n');
        return csv;
    }
    // 删除分析（软删除）
    async deleteAnalysis(analysisId) {
        return index_1.prisma.videoAnalysis.update({
            where: { id: analysisId },
            data: { deletedAt: new Date() },
        });
    }
    // 获取配置
    async getConfig() {
        let config = await index_1.prisma.videoAnalysisConfig.findFirst();
        if (!config) {
            // 创建默认配置
            config = await index_1.prisma.videoAnalysisConfig.create({
                data: {},
            });
        }
        return config;
    }
    // 更新配置
    async updateConfig(data) {
        const config = await this.getConfig();
        return index_1.prisma.videoAnalysisConfig.update({
            where: { id: config.id },
            data,
        });
    }
}
exports.VideoAnalysisService = VideoAnalysisService;
//# sourceMappingURL=video-analysis.service.js.map