import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { prisma } from '../index';
import { asyncHandler } from '../middleware/errorHandler';

/**
 * 客户端激活
 * 用户输入激活码，绑定设备指纹
 */
export const activate = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { activationCode, deviceFingerprint, deviceName } = req.body;

  // 查找激活码
  const activation = await prisma.clientActivation.findUnique({
    where: { activationCode },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
    },
  });

  if (!activation) {
    return res.status(400).json({ success: false, message: '激活码无效' });
  }

  // 检查租户是否启用
  if (!activation.tenant.isActive) {
    return res.status(400).json({ success: false, message: '该企业账号已被禁用' });
  }

  // 检查是否已被其他设备激活
  if (activation.isActivated && activation.deviceFingerprint !== deviceFingerprint) {
    return res.status(400).json({
      success: false,
      message: '该激活码已被其他设备使用，请联系管理员解绑',
    });
  }

  // 如果是同一设备重新激活（重装客户端场景），直接返回成功
  if (activation.isActivated && activation.deviceFingerprint === deviceFingerprint) {
    return res.json({
      success: true,
      message: '设备已激活',
      data: {
        tenantId: activation.tenantId,
        tenantName: activation.tenant.name,
      },
    });
  }

  // 激活设备
  await prisma.clientActivation.update({
    where: { id: activation.id },
    data: {
      deviceFingerprint,
      deviceName: deviceName || '未命名设备',
      isActivated: true,
      activatedAt: new Date(),
    },
  });

  res.json({
    success: true,
    message: '激活成功',
    data: {
      tenantId: activation.tenantId,
      tenantName: activation.tenant.name,
    },
  });
});

/**
 * 检查激活状态
 * 客户端启动时检查设备是否已激活
 */
export const checkActivation = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { deviceFingerprint } = req.body;

  // 查找该设备的激活记录
  const activation = await prisma.clientActivation.findFirst({
    where: {
      deviceFingerprint,
      isActivated: true,
    },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          isActive: true,
        },
      },
    },
  });

  if (!activation) {
    return res.json({
      success: true,
      data: {
        isActivated: false,
      },
    });
  }

  // 检查租户是否启用
  if (!activation.tenant.isActive) {
    return res.json({
      success: true,
      data: {
        isActivated: false,
        message: '企业账号已被禁用',
      },
    });
  }

  res.json({
    success: true,
    data: {
      isActivated: true,
      tenantId: activation.tenantId,
      tenantName: activation.tenant.name,
    },
  });
});




