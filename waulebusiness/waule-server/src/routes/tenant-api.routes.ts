/**
 * 租户用户 API 路由
 * 所有路由都需要租户用户认证，使用租户积分
 */
import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import multer from 'multer';
import { authenticateTenantUser, authenticateTenantUserOrApiKey } from '../middleware/tenant-auth';
import * as tenantApiController from '../controllers/tenant-api.controller';
import soraCharacterController from '../controllers/sora-character.controller';

const router = Router();

// 配置 multer 存储为内存，便于直传 OSS
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB
    files: 1,
  }
});

// multer 错误处理
const handleMulterError = (err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: '文件大小超出限制' });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
};

// 租户服务端专用路由（使用 API Key 认证，放在用户认证之前）
// 确认本地下载完成，删除 OSS 临时文件
router.post('/tasks/:taskId/confirm-local-download', authenticateTenantUserOrApiKey, tenantApiController.confirmLocalDownload);

// 获取预签名上传 URL（支持用户token或API Key）
router.post('/assets/presigned-url', authenticateTenantUserOrApiKey, tenantApiController.getPresignedUrl);

// 所有其他路由都需要租户用户认证
router.use(authenticateTenantUser);

// ==================== 项目管理 ====================

// 获取项目列表
router.get('/projects', tenantApiController.getProjects);

// 获取共享给我的项目（必须在 /projects/:id 之前，否则 "shared" 会被当作 id）
router.get('/projects/shared', tenantApiController.getSharedProjects);

// 创建项目
router.post('/projects', [
  body('name').notEmpty().withMessage('项目名称不能为空'),
  body('type').optional().isIn(['DRAMA', 'QUICK']),
], tenantApiController.createProject);

// 获取项目详情
router.get('/projects/:id', tenantApiController.getProject);

// 更新项目
router.put('/projects/:id', tenantApiController.updateProject);

// 删除项目
router.delete('/projects/:id', tenantApiController.deleteProject);

// ==================== 剧集管理 ====================

// 获取剧集列表
router.get('/projects/:projectId/episodes', tenantApiController.getEpisodes);

// 创建剧集
router.post('/projects/:projectId/episodes', [
  body('title').notEmpty().withMessage('剧集标题不能为空'),
], tenantApiController.createEpisode);

// 获取剧集详情
router.get('/projects/:projectId/episodes/:episodeId', tenantApiController.getEpisode);

// 更新剧集
router.put('/projects/:projectId/episodes/:episodeId', tenantApiController.updateEpisode);

// 删除剧集
router.delete('/projects/:projectId/episodes/:episodeId', tenantApiController.deleteEpisode);

// ==================== 分镜管理 ====================

// 添加分镜
router.post('/projects/:projectId/episodes/:episodeId/shots', tenantApiController.addShot);

// 更新单个分镜
router.put('/projects/:projectId/episodes/:episodeId/shots/:shotId', tenantApiController.updateShot);

// 删除分镜（只有所有者可以删除）
router.delete('/projects/:projectId/episodes/:episodeId/shots/:shotId', tenantApiController.deleteShot);

// 批量更新分镜顺序
router.post('/projects/:projectId/episodes/:episodeId/shots/reorder', tenantApiController.reorderShots);

// ==================== 工作流管理 ====================

// 获取工作流列表
router.get('/workflows', tenantApiController.getWorkflows);

// 获取单个工作流（支持协作者访问）
router.get('/workflows/:workflowId', tenantApiController.getWorkflowById);

// 获取/创建项目工作流
router.get('/workflows/project/:projectId', tenantApiController.getOrCreateProjectWorkflow);

// 获取/创建剧集工作流
router.get('/workflows/project/:projectId/episode/:episodeId', tenantApiController.getOrCreateEpisodeWorkflow);

// 获取/创建镜头工作流
router.get('/workflows/project/:projectId/episode/:episodeId/shot', tenantApiController.getOrCreateShotWorkflow);

// 保存工作流
router.post('/workflows/project/:projectId', tenantApiController.saveProjectWorkflow);
router.post('/workflows/project/:projectId/episode/:episodeId', tenantApiController.saveEpisodeWorkflow);
router.post('/workflows/project/:projectId/episode/:episodeId/shot', tenantApiController.saveShotWorkflow);

// 更新工作流（直接访问模式，支持协作者保存）
router.put('/workflows/:workflowId', tenantApiController.updateWorkflow);

// ==================== 资产管理 ====================

// 获取资产列表
router.get('/assets', tenantApiController.getAssets);

// 注意: presigned-url 已移到上面使用 authenticateTenantUserOrApiKey 中间件

// 确认上传
router.post('/assets/confirm-upload', tenantApiController.confirmUpload);

// 服务器中转上传（回退方案）
router.post('/assets/upload', upload.single('file'), handleMulterError, tenantApiController.uploadAsset);

// 代理下载（解决 CORS 问题）
router.get('/assets/proxy-download', tenantApiController.proxyDownload);

// 服务器转存（前端转存失败时的回退）
router.post('/assets/transfer-url', tenantApiController.transferUrl);

// 更新资产
router.put('/assets/:id', tenantApiController.updateAsset);

// 删除资产
router.delete('/assets/:id', tenantApiController.deleteAsset);

// ==================== 资产库管理 ====================

// 获取资产库列表
router.get('/asset-libraries', tenantApiController.getAssetLibraries);

// 创建资产库
router.post('/asset-libraries', tenantApiController.createAssetLibrary);

// 角色库：创建、获取、更新、删除角色（必须在 :id 路由之前）
router.post('/asset-libraries/:id/roles', tenantApiController.createRole);
router.get('/asset-libraries/:id/roles', tenantApiController.getRoles);
router.put('/asset-libraries/:id/roles/:roleId', tenantApiController.updateRole);
router.delete('/asset-libraries/:id/roles/:roleId', tenantApiController.deleteRole);

// 获取资产库中的资产
router.get('/asset-libraries/:id/assets', tenantApiController.getAssetLibraryAssets);

// 上传文件到资产库
router.post('/asset-libraries/:id/upload', upload.single('file'), tenantApiController.uploadAssetToLibrary);

// 从URL添加资产到资产库
router.post('/asset-libraries/:id/add-from-url', tenantApiController.addAssetFromUrl);

// 获取资产库详情
router.get('/asset-libraries/:id', tenantApiController.getAssetLibrary);

// 更新资产库
router.put('/asset-libraries/:id', tenantApiController.updateAssetLibrary);

// 删除资产库
router.delete('/asset-libraries/:id', tenantApiController.deleteAssetLibrary);

// ==================== 节点提示词 ====================

// 获取节点提示词模板
router.get('/node-prompts/type/:nodeType', tenantApiController.getNodePromptByType);

// ==================== AI 服务 ====================

// 获取 AI 模型列表
router.get('/ai/models', tenantApiController.getAIModels);

// 文本生成
router.post('/ai/text/generate', tenantApiController.generateText);

// 音频相关
router.get('/ai/audio/voices', tenantApiController.getVoices);
router.post('/ai/audio/voices', tenantApiController.addVoice);
router.get('/ai/audio/voice/presets', tenantApiController.getVoicePresets);
router.post('/ai/audio/voice/create', tenantApiController.createVoice);
router.get('/ai/audio/voice/status', tenantApiController.getVoiceStatus);
router.post('/ai/audio/voice/design', tenantApiController.designVoice);

// 商业视频
router.post('/ai/commercial-video', tenantApiController.commercialVideo);

// ==================== 任务管理 ====================

// 创建图片任务
router.post('/tasks/image', tenantApiController.createImageTask);

// 创建视频任务
router.post('/tasks/video', tenantApiController.createVideoTask);

// 创建视频编辑任务（换人/换脸等）
router.post('/tasks/video-edit', tenantApiController.createVideoEditTask);

// 创建智能分镜任务
router.post('/tasks/smart-storyboard', tenantApiController.createSmartStoryboardTask);

// 获取进行中的任务（用于页面刷新后恢复）
router.get('/tasks/active', tenantApiController.getActiveTask);

// 获取待创建的预览节点
router.get('/tasks/pending-preview-nodes', tenantApiController.getPendingPreviewNodes);

// 标记预览节点已创建
router.post('/tasks/:taskId/mark-preview-created', tenantApiController.markPreviewNodeCreated);

// 查询任务状态（放在最后避免路径冲突）
router.get('/tasks/:taskId', tenantApiController.getTaskStatus);

// 获取用户任务列表
router.get('/tasks', tenantApiController.getUserTasks);

// ==================== 代理 (Agents) ====================

// 获取代理列表
router.get('/agents', tenantApiController.getAgents);

// 获取可用的文本生成模型（用于工作流智能体节点）
// 注意：此路由必须在 /agents/:id 之前定义，否则会被 :id 参数匹配
router.get('/agents/models', tenantApiController.getAvailableAgentModels);

// 获取代理详情
router.get('/agents/:id', tenantApiController.getAgent);

// ==================== 智能体角色 ====================
// 获取指定智能体的角色列表
router.get('/agent-roles/by-agent/:agentId', tenantApiController.getAgentRoles);

// 执行智能体角色
router.post('/agent-roles/:id/execute', tenantApiController.executeAgentRole);

// ==================== 分镜脚本任务 ====================
// 创建分镜脚本任务
router.post('/tasks/storyboard', tenantApiController.createStoryboardTask);

// 获取分镜脚本任务状态
router.get('/tasks/storyboard/:taskId', tenantApiController.getStoryboardTaskStatus);

// ==================== 计费相关 ====================

// 积分估算
router.post('/billing/estimate', tenantApiController.estimateCredits);

// ==================== 用户信息 ====================

// 获取当前用户信息（包括租户积分）
router.get('/me', tenantApiController.getCurrentUser);

// 检查昵称可用性
router.get('/check-nickname', tenantApiController.checkNickname);

// 更新用户资料
router.put('/profile', tenantApiController.updateProfile);

// 修改密码
router.put('/password', tenantApiController.changePassword);

// 搜索租户用户（用于共享工作流、资产库）
router.get('/users/search', tenantApiController.searchTenantUsers);

// ==================== 共享/协作者管理 ====================

// 工作流协作者
router.get('/workflows/:workflowId/collaborators', tenantApiController.getWorkflowCollaborators);
router.post('/workflows/:workflowId/collaborators', tenantApiController.addWorkflowCollaborator);
router.put('/workflows/:workflowId/collaborators/:targetUserId', tenantApiController.updateWorkflowCollaboratorPermission);
router.delete('/workflows/:workflowId/collaborators/:targetUserId', tenantApiController.removeWorkflowCollaborator);
router.get('/workflows/shared', tenantApiController.getSharedWorkflows);

// 项目协作者
router.get('/projects/:projectId/collaborators', tenantApiController.getProjectCollaborators);
router.post('/projects/:projectId/collaborators', tenantApiController.addProjectCollaborator);
router.put('/projects/:projectId/collaborators/:targetUserId', tenantApiController.updateProjectCollaboratorPermission);
router.delete('/projects/:projectId/collaborators/:targetUserId', tenantApiController.removeProjectCollaborator);

// 资产库协作者
router.get('/asset-libraries/:libraryId/collaborators', tenantApiController.getAssetLibraryCollaborators);
router.post('/asset-libraries/:libraryId/collaborators', tenantApiController.addAssetLibraryCollaborator);
router.delete('/asset-libraries/:libraryId/collaborators/:targetUserId', tenantApiController.removeAssetLibraryCollaborator);
router.get('/asset-libraries/shared', tenantApiController.getSharedAssetLibraries);

// ==================== Sora角色管理 ====================

// 获取角色列表
router.get('/sora-characters', (req, res) => soraCharacterController.list(req, res));

// 搜索角色（用于@提及）
router.get('/sora-characters/search', (req, res) => soraCharacterController.search(req, res));

// 通过自定义名称获取角色（必须在 /:id 之前）
router.get('/sora-characters/by-name/:customName', (req, res) => soraCharacterController.getByCustomName(req, res));

// 用户搜索（用于添加协作者）
router.get('/sora-characters/users/search', (req, res) => soraCharacterController.searchUsers(req, res));

// 协作者列表
router.get('/sora-characters/collaborators', (req, res) => soraCharacterController.getCollaborators(req, res));

// 共享信息
router.get('/sora-characters/share-info', (req, res) => soraCharacterController.getShareInfo(req, res));

// 获取单个角色
router.get('/sora-characters/:id', (req, res) => soraCharacterController.getById(req, res));

// 创建角色
router.post('/sora-characters', (req, res) => soraCharacterController.create(req, res));

// 添加协作者
router.post('/sora-characters/share', (req, res) => soraCharacterController.addCollaborator(req, res));

// 移除协作者
router.post('/sora-characters/unshare', (req, res) => soraCharacterController.removeCollaborator(req, res));

// 更新角色
router.put('/sora-characters/:id', (req, res) => soraCharacterController.update(req, res));

// 删除角色
router.delete('/sora-characters/:id', (req, res) => soraCharacterController.delete(req, res));

// ==================== 回收站 ====================

// 获取回收站列表
router.get('/assets/recycle/bin', tenantApiController.getRecycleBin);

// 记录删除的预览节点到回收站
router.post('/assets/recycle/record', tenantApiController.recordRecycleItem);

// 从回收站恢复
router.post('/assets/recycle/:id/restore', tenantApiController.restoreRecycleItem);

// 永久删除
router.delete('/assets/recycle/:id/permanent', tenantApiController.permanentDeleteRecycleItem);

// ==================== 文档处理 ====================

// 提取文档文本（PDF、Word等）
router.post('/documents/extract-text', tenantApiController.extractDocumentText);

// ==================== 本地存储支持 ====================

// 获取租户存储配置
router.get('/storage/config', tenantApiController.getTenantStorageConfig);

// 更新租户存储配置（仅管理员）
router.put('/storage/config', tenantApiController.updateTenantStorageConfig);

// 注意：confirm-local-download 已移到文件顶部（支持 API Key 认证）

export default router;


