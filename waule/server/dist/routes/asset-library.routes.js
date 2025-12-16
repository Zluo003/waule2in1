"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const asset_library_controller_1 = require("../controllers/asset-library.controller");
const router = (0, express_1.Router)();
router.use(auth_1.authenticateToken);
// 搜索用户（用于添加协作者）- 必须在 /:id 路由之前
router.get('/users/search', asset_library_controller_1.searchUsers);
// 资产库管理
router.get('/', asset_library_controller_1.getAssetLibraries);
router.get('/category/:category', asset_library_controller_1.getAssetLibraries);
router.get('/shared', asset_library_controller_1.getSharedAssetLibraries);
router.post('/', asset_library_controller_1.createAssetLibrary);
router.get('/:id', asset_library_controller_1.getAssetLibrary);
router.put('/:id', asset_library_controller_1.updateAssetLibrary);
router.delete('/:id', asset_library_controller_1.deleteAssetLibrary);
// 获取资产库中的资产
router.get('/:id/assets', asset_library_controller_1.getLibraryAssets);
// 从URL添加资产到资产库
router.post('/:id/add-from-url', asset_library_controller_1.addAssetFromUrl);
// 角色库：创建、获取、更新、删除角色
router.post('/:id/roles', asset_library_controller_1.createRole);
router.get('/:id/roles', asset_library_controller_1.getRoles);
router.put('/:id/roles/:roleId', asset_library_controller_1.updateRole);
router.delete('/:id/roles/:roleId', asset_library_controller_1.deleteRole);
// 分享/协作者管理
router.get('/:id/collaborators', asset_library_controller_1.getCollaborators);
router.post('/:id/share', asset_library_controller_1.shareAssetLibrary);
router.post('/:id/unshare', asset_library_controller_1.unshareAssetLibrary);
exports.default = router;
//# sourceMappingURL=asset-library.routes.js.map