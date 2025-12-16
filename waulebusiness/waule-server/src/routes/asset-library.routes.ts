import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import {
  getAssetLibraries,
  getSharedAssetLibraries,
  getAssetLibrary,
  createAssetLibrary,
  updateAssetLibrary,
  deleteAssetLibrary,
  getLibraryAssets,
  addAssetFromUrl,
  createRole,
  getRoles,
  shareAssetLibrary,
  unshareAssetLibrary,
  updateRole,
  deleteRole,
  getCollaborators,
  searchUsers,
} from '../controllers/asset-library.controller';

const router = Router();

router.use(authenticateToken);

// 搜索用户（用于添加协作者）- 必须在 /:id 路由之前
router.get('/users/search', searchUsers);

// 资产库管理
router.get('/', getAssetLibraries);
router.get('/category/:category', getAssetLibraries);
router.get('/shared', getSharedAssetLibraries);
router.post('/', createAssetLibrary);
router.get('/:id', getAssetLibrary);
router.put('/:id', updateAssetLibrary);
router.delete('/:id', deleteAssetLibrary);

// 获取资产库中的资产
router.get('/:id/assets', getLibraryAssets);

// 从URL添加资产到资产库
router.post('/:id/add-from-url', addAssetFromUrl);

// 角色库：创建、获取、更新、删除角色
router.post('/:id/roles', createRole);
router.get('/:id/roles', getRoles);
router.put('/:id/roles/:roleId', updateRole);
router.delete('/:id/roles/:roleId', deleteRole);

// 分享/协作者管理
router.get('/:id/collaborators', getCollaborators);
router.post('/:id/share', shareAssetLibrary);
router.post('/:id/unshare', unshareAssetLibrary);

export default router;
