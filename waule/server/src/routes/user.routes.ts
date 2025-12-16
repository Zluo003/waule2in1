import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import * as userController from '../controllers/user.controller';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// User profile routes
router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.put('/avatar', userController.avatarUpload.single('avatar'), userController.uploadAvatar);
router.get('/check-nickname', userController.checkNickname);
router.put('/password', userController.changePassword);

// 头像直传 OSS
router.post('/avatar/presign', userController.getAvatarUploadUrl);
router.post('/avatar/confirm', userController.confirmAvatarUpload);

export default router;

