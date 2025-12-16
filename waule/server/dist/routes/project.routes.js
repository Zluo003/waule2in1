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
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_1 = require("../middleware/auth");
const projectController = __importStar(require("../controllers/project.controller"));
const router = (0, express_1.Router)();
router.use(auth_1.authenticateToken);
/**
 * @swagger
 * /projects:
 *   get:
 *     summary: 获取所有项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 成功获取项目列表
 */
router.get('/', projectController.getAllProjects);
// 用户搜索（用于添加协作者）- 必须放在 /:id 路由之前
router.get('/users/search', projectController.searchUsers);
// 获取共享给我的项目 - 必须放在 /:id 路由之前
router.get('/shared', projectController.getSharedProjects);
/**
 * @swagger
 * /projects:
 *   post:
 *     summary: 创建项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', [
    (0, express_validator_1.body)('name')
        .notEmpty()
        .withMessage('项目名称不能为空')
        .isLength({ max: 100 })
        .withMessage('项目名称不能超过100字符'),
    (0, express_validator_1.body)('description').optional().isLength({ max: 500 }),
    (0, express_validator_1.body)('type').optional().isIn(['DRAMA', 'QUICK']),
], projectController.createProject);
/**
 * @swagger
 * /projects/{id}:
 *   get:
 *     summary: 获取项目详情
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', projectController.getProjectById);
/**
 * @swagger
 * /projects/{id}:
 *   put:
 *     summary: 更新项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', projectController.updateProject);
/**
 * @swagger
 * /projects/{id}:
 *   delete:
 *     summary: 删除项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', projectController.deleteProject);
/**
 * @swagger
 * /projects/{id}/episodes:
 *   get:
 *     summary: 获取项目的所有集数
 *     tags: [Projects - Episodes]
 *     security:
 *       - bearerAuth: []
 */
// 项目协作者管理（项目级只有只读权限）
router.get('/:id/collaborators', projectController.getProjectCollaborators);
router.post('/:id/share', projectController.addProjectCollaborator);
router.post('/:id/unshare', projectController.removeProjectCollaborator);
exports.default = router;
//# sourceMappingURL=project.routes.js.map