import { Router, Request, Response } from 'express';
import { body } from 'express-validator';
import * as clientController from '../controllers/client.controller';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

/**
 * @swagger
 * /client/verify-api-key:
 *   post:
 *     summary: 验证租户 API Key
 *     tags: [Client]
 *     description: 租户服务端用于测试连接
 */
router.post('/verify-api-key', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-tenant-api-key'] as string;
    
    if (!apiKey || !apiKey.startsWith('wk_live_')) {
      return res.status(401).json({ success: false, message: '无效的 API Key 格式' });
    }
    
    const tenant = await prisma.tenant.findUnique({
      where: { apiKey },
      select: { id: true, name: true, isActive: true, credits: true },
    });
    
    if (!tenant) {
      return res.status(401).json({ success: false, message: 'API Key 不存在' });
    }
    
    if (!tenant.isActive) {
      return res.status(401).json({ success: false, message: '租户已被禁用' });
    }
    
    res.json({
      success: true,
      message: '连接成功',
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        credits: tenant.credits,
      },
    });
  } catch (error: any) {
    console.error('Verify API Key error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * @swagger
 * /client/activate:
 *   post:
 *     summary: 客户端激活
 *     tags: [Client]
 *     description: 使用激活码激活客户端，绑定设备
 */
router.post(
  '/activate',
  [
    body('activationCode').notEmpty().withMessage('激活码不能为空'),
    body('deviceFingerprint').notEmpty().withMessage('设备指纹不能为空'),
    body('deviceName').optional(),
  ],
  clientController.activate
);

/**
 * @swagger
 * /client/check-activation:
 *   post:
 *     summary: 检查激活状态
 *     tags: [Client]
 *     description: 检查设备是否已激活，返回租户信息
 */
router.post(
  '/check-activation',
  [body('deviceFingerprint').notEmpty().withMessage('设备指纹不能为空')],
  clientController.checkActivation
);

export default router;




