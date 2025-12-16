"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoAnalysisController = void 0;
const video_analysis_service_1 = require("../services/video-analysis.service");
const logger_1 = require("../utils/logger");
class VideoAnalysisController {
    constructor() {
        this.service = new video_analysis_service_1.VideoAnalysisService();
        // 上传视频并开始分析
        this.uploadAndAnalyze = async (req, res) => {
            try {
                const userId = req.user.id;
                const file = req.file;
                const { projectId } = req.body;
                if (!file) {
                    return res.status(400).json({ error: '未上传文件' });
                }
                // 检查配置限制
                const config = await this.service.getConfig();
                // 检查文件大小
                if (file.size > Number(config.maxFileSize)) {
                    return res.status(400).json({
                        error: `文件大小超出限制（最大${Number(config.maxFileSize) / 1024 / 1024}MB）`
                    });
                }
                // 检查文件格式
                const ext = file.originalname.split('.').pop()?.toLowerCase();
                if (ext && !config.allowedFormats.includes(ext)) {
                    return res.status(400).json({
                        error: `不支持的文件格式，仅支持：${config.allowedFormats.join(', ')}`
                    });
                }
                // 暂时使用本地存储，文件已保存在 uploads/ 目录
                // 后续可以集成OSS上传
                const videoUrl = `/uploads/${file.filename}`;
                // 创建分析记录
                const analysis = await this.service.createAnalysis({
                    userId,
                    projectId,
                    videoUrl,
                    fileName: file.originalname,
                    fileSize: file.size,
                });
                // 异步启动分析任务
                this.service.startAnalysisTask(analysis.id).catch((err) => {
                    logger_1.logger.error('分析任务失败:', err);
                });
                // 转换 BigInt 为字符串
                const serializedAnalysis = {
                    ...analysis,
                    fileSize: analysis.fileSize.toString(),
                };
                res.json({
                    success: true,
                    data: serializedAnalysis,
                });
            }
            catch (error) {
                logger_1.logger.error('上传失败:', error);
                res.status(500).json({ error: error.message || '上传失败' });
            }
        };
        // 获取分析列表
        this.getAnalyses = async (req, res) => {
            try {
                const userId = req.user.id;
                const analyses = await this.service.getUserAnalyses(userId);
                // 转换 BigInt 为字符串以便 JSON 序列化
                const serializedAnalyses = analyses.map(a => ({
                    ...a,
                    fileSize: a.fileSize.toString(),
                }));
                res.json({
                    success: true,
                    data: serializedAnalyses,
                });
            }
            catch (error) {
                logger_1.logger.error('获取列表失败:', error);
                res.status(500).json({ error: '获取列表失败' });
            }
        };
        // 获取分析详情
        this.getAnalysis = async (req, res) => {
            try {
                const { id } = req.params;
                const userId = req.user.id;
                const analysis = await this.service.getAnalysisById(id, userId);
                if (!analysis) {
                    return res.status(404).json({ error: '未找到分析记录' });
                }
                // 转换 BigInt 为字符串
                const serializedAnalysis = {
                    ...analysis,
                    fileSize: analysis.fileSize.toString(),
                };
                res.json({
                    success: true,
                    data: serializedAnalysis,
                });
            }
            catch (error) {
                logger_1.logger.error('获取详情失败:', error);
                res.status(500).json({ error: '获取详情失败' });
            }
        };
        // 获取分析状态（用于轮询）
        this.getAnalysisStatus = async (req, res) => {
            try {
                const { id } = req.params;
                const userId = req.user.id;
                const analysis = await this.service.getAnalysisById(id, userId);
                if (!analysis) {
                    return res.status(404).json({ error: '未找到分析记录' });
                }
                res.json({
                    success: true,
                    data: {
                        status: analysis.status,
                        progress: analysis.progress,
                        errorMsg: analysis.errorMsg,
                    },
                });
            }
            catch (error) {
                logger_1.logger.error('获取状态失败:', error);
                res.status(500).json({ error: '获取状态失败' });
            }
        };
        // 更新镜头信息
        this.updateShot = async (req, res) => {
            try {
                const { shotId } = req.params;
                const updateData = req.body;
                const shot = await this.service.updateShot(shotId, updateData);
                res.json({
                    success: true,
                    data: shot,
                });
            }
            catch (error) {
                logger_1.logger.error('更新失败:', error);
                res.status(500).json({ error: '更新失败' });
            }
        };
        // 生成剧本
        this.generateScript = async (req, res) => {
            try {
                const { id } = req.params;
                const script = await this.service.generateScript(id);
                res.json({
                    success: true,
                    data: script,
                });
            }
            catch (error) {
                logger_1.logger.error('生成剧本失败:', error);
                res.status(500).json({ error: error.message || '生成剧本失败' });
            }
        };
        // 生成海报
        this.generatePosters = async (req, res) => {
            try {
                const { id } = req.params;
                const posters = await this.service.generatePosters(id);
                res.json({
                    success: true,
                    data: posters,
                });
            }
            catch (error) {
                logger_1.logger.error('生成海报失败:', error);
                res.status(500).json({ error: '生成海报失败' });
            }
        };
        // 导出CSV
        this.exportCSV = async (req, res) => {
            try {
                const { id } = req.params;
                const userId = req.user.id;
                // 验证权限
                const analysis = await this.service.getAnalysisById(id, userId);
                if (!analysis) {
                    return res.status(404).json({ error: '未找到分析记录' });
                }
                const csv = await this.service.exportToCSV(id);
                res.setHeader('Content-Type', 'text/csv; charset=utf-8');
                res.setHeader('Content-Disposition', `attachment; filename="shots_${id}.csv"`);
                res.send('\uFEFF' + csv); // 添加BOM以支持Excel中文
            }
            catch (error) {
                logger_1.logger.error('导出失败:', error);
                res.status(500).json({ error: '导出失败' });
            }
        };
        // 删除分析
        this.deleteAnalysis = async (req, res) => {
            try {
                const { id } = req.params;
                await this.service.deleteAnalysis(id);
                res.json({
                    success: true,
                    message: '删除成功',
                });
            }
            catch (error) {
                logger_1.logger.error('删除失败:', error);
                res.status(500).json({ error: '删除失败' });
            }
        };
        // 获取配置（管理后台）
        this.getConfig = async (req, res) => {
            try {
                const config = await this.service.getConfig();
                res.json({
                    success: true,
                    data: config,
                });
            }
            catch (error) {
                logger_1.logger.error('获取配置失败:', error);
                res.status(500).json({ error: '获取配置失败' });
            }
        };
        // 更新配置（管理后台）
        this.updateConfig = async (req, res) => {
            try {
                const config = await this.service.updateConfig(req.body);
                res.json({
                    success: true,
                    data: config,
                });
            }
            catch (error) {
                logger_1.logger.error('更新配置失败:', error);
                res.status(500).json({ error: '更新配置失败' });
            }
        };
    }
}
exports.VideoAnalysisController = VideoAnalysisController;
//# sourceMappingURL=video-analysis.controller.js.map