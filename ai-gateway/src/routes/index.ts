import { Router } from 'express';
import v1Router from './v1';
import adminRouter from './admin';
import midjourneyRouter from './midjourney';
import { apiAuth } from '../middleware/auth';

const router = Router();

// API路由（需要认证）
router.use('/v1', apiAuth, v1Router);

// Midjourney API路由（需要认证）
router.use('/v1/midjourney', apiAuth, midjourneyRouter);

// 管理后台路由
router.use('/api', adminRouter);

export default router;
