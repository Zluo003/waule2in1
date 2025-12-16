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
 *     description: 租户服务端用于测试连接，验证设备绑定
 */
router.post('/verify-api-key', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-tenant-api-key'] as string;
    const deviceId = req.headers['x-device-id'] as string;
    
    if (!apiKey || !apiKey.startsWith('wk_live_')) {
      return res.status(401).json({ success: false, message: '无效的 API Key 格式' });
    }
    
    const tenant = await prisma.tenant.findUnique({
      where: { apiKey },
      select: { 
        id: true, 
        name: true, 
        isActive: true, 
        credits: true,
        serverActivated: true,
        serverDeviceId: true,
      },
    });
    
    if (!tenant) {
      return res.status(401).json({ success: false, message: 'API Key 不存在' });
    }
    
    if (!tenant.isActive) {
      return res.status(401).json({ success: false, message: '租户已被禁用' });
    }
    
    // 检查设备绑定：如果已激活，必须验证设备 ID
    if (tenant.serverActivated && tenant.serverDeviceId) {
      if (!deviceId) {
        return res.status(401).json({ 
          success: false, 
          message: 'API Key 已绑定设备，请提供设备 ID',
          requireDeviceId: true,
        });
      }
      if (deviceId !== tenant.serverDeviceId) {
        return res.status(401).json({ 
          success: false, 
          message: 'API Key 已绑定其他设备，无法使用',
          deviceMismatch: true,
        });
      }
    }
    
    res.json({
      success: true,
      message: '连接成功',
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        credits: tenant.credits,
        serverActivated: tenant.serverActivated,
      },
    });
  } catch (error: any) {
    console.error('Verify API Key error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * @swagger
 * /client/activate-server:
 *   post:
 *     summary: 激活租户服务端（只能激活一次）
 *     tags: [Client]
 *     description: 首次配置时绑定设备，API Key 只能激活一次
 */
router.post('/activate-server', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-tenant-api-key'] as string;
    const { deviceId } = req.body;
    
    if (!apiKey || !apiKey.startsWith('wk_live_')) {
      return res.status(401).json({ success: false, message: '无效的 API Key 格式' });
    }
    
    if (!deviceId) {
      return res.status(400).json({ success: false, message: '设备 ID 不能为空' });
    }
    
    const tenant = await prisma.tenant.findUnique({
      where: { apiKey },
      select: { 
        id: true, 
        name: true, 
        isActive: true,
        credits: true,
        serverActivated: true,
        serverDeviceId: true,
      },
    });
    
    if (!tenant) {
      return res.status(401).json({ success: false, message: 'API Key 不存在' });
    }
    
    if (!tenant.isActive) {
      return res.status(401).json({ success: false, message: '租户已被禁用' });
    }
    
    // 检查是否已激活
    if (tenant.serverActivated) {
      // 如果设备 ID 匹配，允许重新验证
      if (tenant.serverDeviceId === deviceId) {
        return res.json({
          success: true,
          message: '设备已激活',
          data: {
            tenantId: tenant.id,
            tenantName: tenant.name,
            credits: tenant.credits,
            alreadyActivated: true,
          },
        });
      }
      // 设备不匹配，拒绝激活
      return res.status(403).json({ 
        success: false, 
        message: 'API Key 已被其他设备激活，无法重复激活。如需更换设备，请联系管理员重置。',
        alreadyActivated: true,
      });
    }
    
    // 获取客户端 IP
    const clientIp = req.headers['x-forwarded-for'] as string || 
                     req.headers['x-real-ip'] as string ||
                     req.socket.remoteAddress || 
                     'unknown';
    
    // 激活并绑定设备
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        serverActivated: true,
        serverDeviceId: deviceId,
        serverActivatedAt: new Date(),
        serverActivatedIp: typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : clientIp,
      },
    });
    
    console.log(`[Client] 租户服务端激活成功: ${tenant.name}, 设备ID: ${deviceId.substring(0, 8)}...`);
    
    res.json({
      success: true,
      message: '激活成功！API Key 已绑定此设备',
      data: {
        tenantId: tenant.id,
        tenantName: tenant.name,
        credits: tenant.credits,
      },
    });
  } catch (error: any) {
    console.error('Activate server error:', error);
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

/**
 * @swagger
 * /client/heartbeat:
 *   post:
 *     summary: 租户服务端心跳上报
 *     tags: [Client]
 *     description: 定期上报心跳，更新在线状态
 */
router.post('/heartbeat', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-tenant-api-key'] as string;
    const deviceId = req.headers['x-device-id'] as string;
    const { version } = req.body;
    
    if (!apiKey || !apiKey.startsWith('wk_live_')) {
      return res.status(401).json({ success: false, message: '无效的 API Key' });
    }
    
    const tenant = await prisma.tenant.findUnique({
      where: { apiKey },
      select: { id: true, serverActivated: true, serverDeviceId: true, isActive: true },
    });
    
    if (!tenant || !tenant.isActive) {
      return res.status(401).json({ success: false, message: '租户不存在或已禁用' });
    }
    
    // 验证设备绑定
    if (tenant.serverActivated && tenant.serverDeviceId && deviceId !== tenant.serverDeviceId) {
      return res.status(401).json({ success: false, message: '设备不匹配' });
    }
    
    // 获取客户端 IP
    const clientIp = req.headers['x-forwarded-for'] as string || 
                     req.headers['x-real-ip'] as string ||
                     req.socket.remoteAddress || 
                     'unknown';
    
    // 更新心跳时间
    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        lastHeartbeat: new Date(),
        serverVersion: version || null,
        serverIp: typeof clientIp === 'string' ? clientIp.split(',')[0].trim() : null,
      },
    });
    
    res.json({ success: true, message: 'ok' });
  } catch (error: any) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ success: false, message: '服务器错误' });
  }
});

/**
 * @swagger
 * /client/reset-api-key:
 *   post:
 *     summary: 重设租户 API Key（管理员操作）
 *     tags: [Client]
 *     description: 重设 API Key，旧的 Key 立即失效
 */
router.post('/reset-api-key/:tenantId', async (req: Request, res: Response) => {
  try {
    const { tenantId } = req.params;
    
    // 生成新的 API Key
    const crypto = require('crypto');
    const newApiKey = `wk_live_${crypto.randomBytes(24).toString('base64url')}`;
    
    // 更新租户，重置 API Key 和设备绑定
    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        apiKey: newApiKey,
        serverActivated: false,
        serverDeviceId: null,
        serverActivatedAt: null,
        serverActivatedIp: null,
        lastHeartbeat: null,
        serverVersion: null,
        serverIp: null,
      },
      select: { id: true, name: true, apiKey: true },
    });
    
    console.log(`[Client] 租户 API Key 已重设: ${tenant.name}`);
    
    res.json({
      success: true,
      message: 'API Key 已重设',
      data: { apiKey: tenant.apiKey },
    });
  } catch (error: any) {
    console.error('Reset API Key error:', error);
    res.status(500).json({ success: false, message: '重设失败' });
  }
});

export default router;




