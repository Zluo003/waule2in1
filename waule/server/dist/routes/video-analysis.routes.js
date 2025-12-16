"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const video_analysis_controller_1 = require("../controllers/video-analysis.controller");
const auth_1 = require("../middleware/auth");
const multer_1 = __importDefault(require("multer"));
// 管理员权限中间件
const adminOnly = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
};
const router = express_1.default.Router();
const controller = new video_analysis_controller_1.VideoAnalysisController();
// Multer配置 - 保存到 uploads 目录
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // 生成唯一文件名：时间戳_原文件名
        const uniqueName = `${Date.now()}_${file.originalname}`;
        cb(null, uniqueName);
    },
});
const upload = (0, multer_1.default)({
    storage: storage,
    limits: {
        fileSize: 500 * 1024 * 1024, // 500MB最大限制（视频分析专用）
    },
});
// 上传视频并开始分析
router.post('/upload', auth_1.authenticateToken, upload.single('video'), controller.uploadAndAnalyze);
// 获取所有分析列表
router.get('/', auth_1.authenticateToken, controller.getAnalyses);
// 获取单个分析详情
router.get('/:id', auth_1.authenticateToken, controller.getAnalysis);
// 获取分析状态（用于轮询）
router.get('/:id/status', auth_1.authenticateToken, controller.getAnalysisStatus);
// 更新镜头信息
router.put('/:id/shots/:shotId', auth_1.authenticateToken, controller.updateShot);
// 生成剧本
router.post('/:id/script', auth_1.authenticateToken, controller.generateScript);
// 生成海报
router.post('/:id/posters', auth_1.authenticateToken, controller.generatePosters);
// 导出CSV
router.get('/:id/export-csv', auth_1.authenticateToken, controller.exportCSV);
// 删除分析
router.delete('/:id', auth_1.authenticateToken, controller.deleteAnalysis);
// === 管理后台接口 ===
// 获取配置
router.get('/admin/config', auth_1.authenticateToken, adminOnly, controller.getConfig);
// 更新配置
router.put('/admin/config', auth_1.authenticateToken, adminOnly, controller.updateConfig);
exports.default = router;
//# sourceMappingURL=video-analysis.routes.js.map