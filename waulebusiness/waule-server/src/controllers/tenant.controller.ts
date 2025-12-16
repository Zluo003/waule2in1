import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { prisma } from '../index';
import { asyncHandler } from '../middleware/errorHandler';

// 生成 API Key
function generateApiKey(): string {
  return `wk_live_${crypto.randomBytes(16).toString('hex')}`;
}

// 生成激活码（WAULE-XXXX-XXXX-XXXX 格式）
function generateActivationCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉容易混淆的字符
  const segments = [];
  for (let i = 0; i < 3; i++) {
    let segment = '';
    for (let j = 0; j < 4; j++) {
      segment += chars[Math.floor(Math.random() * chars.length)];
    }
    segments.push(segment);
  }
  return `WAULE-${segments.join('-')}`;
}

// ==================== 租户管理 ====================

/**
 * 获取租户列表
 */
export const getTenants = asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '20', search, isActive } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: search as string, mode: 'insensitive' } },
      { contactName: { contains: search as string, mode: 'insensitive' } },
      { contactPhone: { contains: search as string, mode: 'insensitive' } },
    ];
  }
  if (isActive !== undefined) {
    where.isActive = isActive === 'true';
  }

  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { users: true } },
      },
    }),
    prisma.tenant.count({ where }),
  ]);

  // 计算每个租户的在线客户端数（60秒内有心跳）
  const oneMinuteAgo = new Date(Date.now() - 60000);
  const tenantsWithOnlineCount = await Promise.all(
    tenants.map(async (tenant) => {
      const [onlineClients, totalClients] = await Promise.all([
        prisma.clientActivation.count({
          where: {
            tenantId: tenant.id,
            isActivated: true,
            lastHeartbeat: { gte: oneMinuteAgo },
          },
        }),
        prisma.clientActivation.count({
          where: {
            tenantId: tenant.id,
            isActivated: true,
          },
        }),
      ]);
      return { ...tenant, onlineClients, totalClients };
    })
  );

  res.json({
    success: true,
    data: tenantsWithOnlineCount,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * 获取租户详情
 */
export const getTenantById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      _count: { select: { users: true, usageRecords: true } },
      users: {
        select: {
          id: true,
          username: true,
          nickname: true,
          isAdmin: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!tenant) {
    return res.status(404).json({ success: false, message: '租户不存在' });
  }

  res.json({ success: true, data: tenant });
});

/**
 * 创建租户
 */
export const createTenant = asyncHandler(async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const {
    name,
    contactName,
    contactPhone,
    contactEmail,
    remark,
    initialCredits = 0,
    adminUsername,
    adminPassword,
  } = req.body;

  // 生成 API Key
  const apiKey = generateApiKey();

  // 创建租户和管理员用户
  const tenant = await prisma.$transaction(async (tx) => {
    // 创建租户
    const newTenant = await tx.tenant.create({
      data: {
        name,
        apiKey,
        credits: initialCredits,
        contactName,
        contactPhone,
        contactEmail,
        remark,
      },
    });

    // 创建租户管理员
    const hashedPassword = await bcrypt.hash(adminPassword, 10);
    await tx.tenantUser.create({
      data: {
        tenantId: newTenant.id,
        username: adminUsername,
        password: hashedPassword,
        nickname: adminUsername,
        isAdmin: true,
      },
    });

    // 记录初始积分（如果有）
    if (initialCredits > 0) {
      await tx.tenantCreditLog.create({
        data: {
          tenantId: newTenant.id,
          amount: initialCredits,
          balance: initialCredits,
          type: 'RECHARGE',
          description: '开户初始积分',
          operatorId: req.user!.id,
        },
      });
    }

    return newTenant;
  });

  res.status(201).json({
    success: true,
    message: '租户创建成功',
    data: {
      ...tenant,
      adminUsername, // 返回管理员用户名供显示
    },
  });
});

/**
 * 更新租户信息
 */
export const updateTenant = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, contactName, contactPhone, contactEmail, remark, isActive } = req.body;

  const tenant = await prisma.tenant.update({
    where: { id },
    data: {
      name,
      contactName,
      contactPhone,
      contactEmail,
      remark,
      isActive,
    },
  });

  res.json({ success: true, message: '更新成功', data: tenant });
});

/**
 * 删除租户
 */
export const deleteTenant = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  // 检查租户是否存在
  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) {
    return res.status(404).json({ success: false, message: '租户不存在' });
  }

  // 删除租户（级联删除用户和使用记录）
  await prisma.tenant.delete({ where: { id } });

  res.json({ success: true, message: '租户已删除' });
});

/**
 * 租户充值积分
 */
export const rechargeTenant = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, description } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const result = await prisma.$transaction(async (tx) => {
    // 更新租户积分
    const tenant = await tx.tenant.update({
      where: { id },
      data: { credits: { increment: amount } },
    });

    // 记录积分流水
    await tx.tenantCreditLog.create({
      data: {
        tenantId: id,
        amount,
        balance: tenant.credits,
        type: 'RECHARGE',
        description: description || '管理员充值',
        operatorId: req.user!.id,
      },
    });

    return tenant;
  });

  res.json({
    success: true,
    message: `充值成功，当前积分: ${result.credits}`,
    data: { credits: result.credits },
  });
});

/**
 * 重新生成 API Key
 */
export const regenerateApiKey = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const newApiKey = generateApiKey();

  const tenant = await prisma.tenant.update({
    where: { id },
    data: { apiKey: newApiKey },
  });

  res.json({
    success: true,
    message: 'API Key 已重新生成',
    data: { apiKey: tenant.apiKey },
  });
});

// ==================== 租户用户管理 ====================

/**
 * 获取租户下的用户列表
 */
export const getTenantUsers = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const { page = '1', limit = '20', search } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const where: any = { tenantId };
  if (search) {
    where.OR = [
      { username: { contains: search as string, mode: 'insensitive' } },
      { nickname: { contains: search as string, mode: 'insensitive' } },
    ];
  }

  const [users, total] = await Promise.all([
    prisma.tenantUser.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        nickname: true,
        isAdmin: true,
        isActive: true,
        createdAt: true,
        lastLoginAt: true,
      },
    }),
    prisma.tenantUser.count({ where }),
  ]);

  res.json({
    success: true,
    data: users,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

/**
 * 创建租户用户
 * 用户名和昵称在租户内必须唯一
 */
export const createTenantUser = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const { username, password, nickname, isAdmin = false } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  // 检查用户名是否已存在（同一租户内）
  const existingUsername = await prisma.tenantUser.findUnique({
    where: { tenantId_username: { tenantId, username } },
  });
  if (existingUsername) {
    return res.status(400).json({ success: false, message: '该用户名已存在' });
  }

  // 检查昵称是否已存在（昵称默认为用户名）
  const finalNickname = nickname || username;
  const existingNickname = await prisma.tenantUser.findFirst({
    where: { tenantId, nickname: finalNickname },
  });
  if (existingNickname) {
    return res.status(400).json({ success: false, message: '该昵称已被使用' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = await prisma.tenantUser.create({
    data: {
      tenantId,
      username,
      password: hashedPassword,
      nickname: finalNickname,
      isAdmin,
    },
    select: {
      id: true,
      username: true,
      nickname: true,
      isAdmin: true,
      isActive: true,
      createdAt: true,
    },
  });

  res.status(201).json({ success: true, message: '用户创建成功', data: user });
});

/**
 * 更新租户用户
 * 用户名和昵称在租户内必须唯一
 */
export const updateTenantUser = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = req.params;
  const { username, nickname, isAdmin, isActive } = req.body;

  // 如果要修改用户名，检查是否重复
  if (username) {
    const existingUsername = await prisma.tenantUser.findFirst({
      where: {
        tenantId,
        username,
        id: { not: userId },
      },
    });
    if (existingUsername) {
      return res.status(400).json({ success: false, message: '该用户名已存在' });
    }
  }

  // 如果要修改昵称，检查是否重复
  if (nickname) {
    const existingNickname = await prisma.tenantUser.findFirst({
      where: {
        tenantId,
        nickname,
        id: { not: userId },
      },
    });
    if (existingNickname) {
      return res.status(400).json({ success: false, message: '该昵称已被使用' });
    }
  }

  const user = await prisma.tenantUser.update({
    where: { id: userId },
    data: {
      username,
      nickname,
      isAdmin,
      isActive,
    },
    select: {
      id: true,
      username: true,
      nickname: true,
      isAdmin: true,
      isActive: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });

  res.json({ success: true, message: '用户更新成功', data: user });
});

/**
 * 删除租户用户
 */
export const deleteTenantUser = asyncHandler(async (req: Request, res: Response) => {
  const { tenantId, userId } = req.params;

  // 检查是否是最后一个管理员
  const user = await prisma.tenantUser.findUnique({ where: { id: userId } });
  if (user?.isAdmin) {
    const adminCount = await prisma.tenantUser.count({
      where: { tenantId, isAdmin: true },
    });
    if (adminCount <= 1) {
      return res.status(400).json({ success: false, message: '不能删除最后一个管理员' });
    }
  }

  await prisma.tenantUser.delete({ where: { id: userId } });

  res.json({ success: true, message: '用户已删除' });
});

/**
 * 重置租户用户密码
 */
export const resetTenantUserPassword = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.params;
  const { password } = req.body;

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await prisma.tenantUser.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  res.json({ success: true, message: '密码已重置' });
});

// ==================== 租户统计 ====================

/**
 * 获取租户使用统计
 */
export const getTenantUsage = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;

  const where: any = { tenantId: id };
  if (startDate && endDate) {
    where.createdAt = {
      gte: new Date(startDate as string),
      lte: new Date(endDate as string),
    };
  }

  // 按操作类型统计
  const byOperation = await prisma.tenantUsageRecord.groupBy({
    by: ['operation'],
    where,
    _sum: { creditsCharged: true },
    _count: true,
  });

  // 按日期统计（最近7天）
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const dailyUsage = await prisma.$queryRaw`
    SELECT 
      DATE(created_at) as date,
      SUM(credits_charged) as total_credits,
      COUNT(*) as count
    FROM tenant_usage_records
    WHERE tenant_id = ${id}
      AND created_at >= ${sevenDaysAgo}
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `;

  // 总使用量
  const totals = await prisma.tenantUsageRecord.aggregate({
    where: { tenantId: id },
    _sum: { creditsCharged: true },
    _count: true,
  });

  res.json({
    success: true,
    data: {
      byOperation,
      dailyUsage,
      totals: {
        totalCredits: totals._sum.creditsCharged || 0,
        totalRecords: totals._count || 0,
      },
    },
  });
});

/**
 * 获取租户积分流水
 */
export const getTenantCreditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = '1', limit = '20' } = req.query;
  const pageNum = parseInt(page as string, 10);
  const limitNum = parseInt(limit as string, 10);
  const skip = (pageNum - 1) * limitNum;

  const [logs, total] = await Promise.all([
    prisma.tenantCreditLog.findMany({
      where: { tenantId: id },
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tenantCreditLog.count({ where: { tenantId: id } }),
  ]);

  res.json({
    success: true,
    data: logs,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      totalPages: Math.ceil(total / limitNum),
    },
  });
});

// ==================== 激活码管理 ====================

/**
 * 获取租户的激活码列表
 */
export const getTenantActivations = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { maxClients: true },
  });

  if (!tenant) {
    return res.status(404).json({ success: false, message: '租户不存在' });
  }

  const activations = await prisma.clientActivation.findMany({
    where: { tenantId: id },
    orderBy: { createdAt: 'desc' },
  });

  const activatedCount = activations.filter((a) => a.isActivated).length;

  res.json({
    success: true,
    data: {
      activations,
      stats: {
        total: activations.length,
        activated: activatedCount,
        available: activations.filter((a) => !a.isActivated).length,
        maxClients: tenant.maxClients,
      },
    },
  });
});

/**
 * 批量生成激活码
 */
export const generateActivations = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { count = 1 } = req.body;

  // 检查租户是否存在
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { maxClients: true },
  });

  if (!tenant) {
    return res.status(404).json({ success: false, message: '租户不存在' });
  }

  // 检查现有激活码数量
  const existingCount = await prisma.clientActivation.count({
    where: { tenantId: id },
  });

  if (existingCount + count > tenant.maxClients) {
    return res.status(400).json({
      success: false,
      message: `超出客户端数量限制，当前已有 ${existingCount} 个，最多 ${tenant.maxClients} 个`,
    });
  }

  // 生成激活码
  const activations = [];
  for (let i = 0; i < count; i++) {
    let code: string;
    let exists = true;
    // 确保激活码唯一
    while (exists) {
      code = generateActivationCode();
      const existing = await prisma.clientActivation.findUnique({
        where: { activationCode: code },
      });
      exists = !!existing;
    }

    const activation = await prisma.clientActivation.create({
      data: {
        tenantId: id,
        activationCode: code!,
      },
    });
    activations.push(activation);
  }

  res.status(201).json({
    success: true,
    message: `成功生成 ${count} 个激活码`,
    data: activations,
  });
});

/**
 * 删除激活码（仅未激活的可删除）
 */
export const deleteActivation = asyncHandler(async (req: Request, res: Response) => {
  const { id, activationId } = req.params;

  const activation = await prisma.clientActivation.findFirst({
    where: { id: activationId, tenantId: id },
  });

  if (!activation) {
    return res.status(404).json({ success: false, message: '激活码不存在' });
  }

  if (activation.isActivated) {
    return res.status(400).json({ success: false, message: '已激活的激活码不能删除，请先解绑' });
  }

  await prisma.clientActivation.delete({ where: { id: activationId } });

  res.json({ success: true, message: '激活码已删除' });
});

/**
 * 解绑激活码
 */
export const unbindActivation = asyncHandler(async (req: Request, res: Response) => {
  const { id, activationId } = req.params;

  const activation = await prisma.clientActivation.findFirst({
    where: { id: activationId, tenantId: id },
  });

  if (!activation) {
    return res.status(404).json({ success: false, message: '激活码不存在' });
  }

  if (!activation.isActivated) {
    return res.status(400).json({ success: false, message: '该激活码未被激活' });
  }

  await prisma.clientActivation.update({
    where: { id: activationId },
    data: {
      deviceFingerprint: null,
      deviceName: null,
      isActivated: false,
      activatedAt: null,
    },
  });

  res.json({ success: true, message: '设备已解绑' });
});

/**
 * 更新租户的客户端数量限制
 */
export const updateMaxClients = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { maxClients } = req.body;

  if (typeof maxClients !== 'number' || maxClients < 1) {
    return res.status(400).json({ success: false, message: '客户端数量必须为正整数' });
  }

  // 检查当前激活码数量
  const currentCount = await prisma.clientActivation.count({
    where: { tenantId: id },
  });

  if (maxClients < currentCount) {
    return res.status(400).json({
      success: false,
      message: `不能低于当前激活码数量 ${currentCount}`,
    });
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: { maxClients },
  });

  res.json({ success: true, message: '更新成功', data: { maxClients: tenant.maxClients } });
});

