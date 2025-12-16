# 阶段四：商用版多租户

## Task 4.1: 数据库迁移 ⏱️ 1天

```bash
cd /home/waule/server

# 将 02_DATABASE_SCHEMA.md 中的模型添加到 prisma/schema.prisma
# 然后执行迁移

npx prisma migrate dev --name add_commercial_tenant
```

---

## Task 4.2: 租户CRUD API ⏱️ 1天

### 创建文件
`/home/waule/server/src/controllers/tenant.controller.ts`

```typescript
import { Request, Response } from 'express';
import { prisma } from '../index';
import { generateApiKey, hashSecret } from '../utils/crypto';
import bcrypt from 'bcrypt';

// 创建租户
export const createTenant = async (req: Request, res: Response) => {
  const { name, adminUsername, adminPassword, maxSeats = 5 } = req.body;
  
  // 生成API Key: wk_live_xxxx
  const apiKey = `wk_live_${generateApiKey(32)}`;
  const apiSecret = generateApiKey(48);
  
  const tenant = await prisma.tenant.create({
    data: {
      name,
      apiKey,
      apiSecret: hashSecret(apiSecret),
      maxSeats,
      enabledModels: [], // 默认无启用模型
      admin: {
        create: {
          username: adminUsername,
          password: await bcrypt.hash(adminPassword, 10),
        },
      },
    },
    include: { admin: true },
  });
  
  // 只在创建时返回明文secret
  res.json({
    ...tenant,
    apiSecret, // 明文，仅此一次
    admin: { ...tenant.admin, password: undefined },
  });
};

// 获取租户列表
export const listTenants = async (req: Request, res: Response) => {
  const { page = 1, limit = 20 } = req.query;
  
  const [tenants, total] = await Promise.all([
    prisma.tenant.findMany({
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        admin: { select: { username: true, lastLoginAt: true } },
        _count: { select: { members: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.tenant.count(),
  ]);
  
  res.json({ data: tenants, total, page: Number(page), limit: Number(limit) });
};

// 更新租户模型配置
export const updateTenantModels = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { enabledModels } = req.body;
  
  const tenant = await prisma.tenant.update({
    where: { id },
    data: { enabledModels },
  });
  
  res.json(tenant);
};

// 租户充值
export const rechargeTenant = async (req: Request, res: Response) => {
  const { id } = req.params;
  const { amount, description } = req.body;
  
  const tenant = await prisma.tenant.update({
    where: { id },
    data: { credits: { increment: amount } },
  });
  
  await prisma.tenantTransaction.create({
    data: {
      tenantId: id,
      type: 'RECHARGE',
      amount,
      balance: tenant.credits,
      description: description || `充值 ${amount} 积分`,
    },
  });
  
  res.json({ credits: tenant.credits });
};
```

### 路由
`/home/waule/server/src/routes/tenant.routes.ts`

```typescript
import { Router } from 'express';
import { authenticateToken, authorizeRoles } from '../middleware/auth';
import * as tenantController from '../controllers/tenant.controller';

const router = Router();

router.use(authenticateToken);
router.use(authorizeRoles('ADMIN'));

router.post('/', tenantController.createTenant);
router.get('/', tenantController.listTenants);
router.get('/:id', tenantController.getTenant);
router.put('/:id', tenantController.updateTenant);
router.put('/:id/models', tenantController.updateTenantModels);
router.post('/:id/recharge', tenantController.rechargeTenant);

export default router;
```

---

## Task 4.3: 席位管理API ⏱️ 1天

```typescript
// 添加成员
export const addMember = async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const { username, password, nickname } = req.body;
  
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { _count: { select: { members: true } } },
  });
  
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  
  if (tenant._count.members >= tenant.maxSeats) {
    return res.status(400).json({ error: '席位已满，请先购买额外席位' });
  }
  
  const member = await prisma.tenantMember.create({
    data: {
      tenantId,
      username,
      password: await bcrypt.hash(password, 10),
      nickname,
    },
  });
  
  res.json({ ...member, password: undefined });
};

// 购买席位
export const purchaseSeats = async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const { count } = req.body;
  
  const SEAT_PRICE = 100; // 每个席位100积分
  const totalCost = count * SEAT_PRICE;
  
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  
  if (tenant!.credits < totalCost) {
    return res.status(400).json({ error: '积分不足' });
  }
  
  await prisma.$transaction([
    prisma.tenant.update({
      where: { id: tenantId },
      data: {
        maxSeats: { increment: count },
        credits: { decrement: totalCost },
      },
    }),
    prisma.tenantTransaction.create({
      data: {
        tenantId,
        type: 'SEAT_PURCHASE',
        amount: -totalCost,
        balance: tenant!.credits - totalCost,
        description: `购买 ${count} 个席位`,
      },
    }),
  ]);
  
  res.json({ ok: true });
};
```

---

## Task 4.4: OSS配置API ⏱️ 1天

```typescript
// 更新OSS配置
export const updateOssConfig = async (req: Request, res: Response) => {
  const { tenantId } = req.params;
  const { ossMode, region, bucket, accessKeyId, accessKeySecret, customDomain } = req.body;
  
  if (ossMode === 'CUSTOM') {
    // 验证配置
    const { valid, error } = await verifyOssConfig({
      region, bucket, accessKeyId, accessKeySecret,
    });
    
    if (!valid) {
      return res.status(400).json({ error: `OSS配置验证失败: ${error}` });
    }
    
    // 保存配置（加密存储）
    await prisma.tenantOssConfig.upsert({
      where: { tenantId },
      update: {
        region,
        bucket,
        accessKeyId: encrypt(accessKeyId),
        accessKeySecret: encrypt(accessKeySecret),
        customDomain,
        isVerified: true,
        lastVerifiedAt: new Date(),
      },
      create: {
        tenantId,
        region,
        bucket,
        accessKeyId: encrypt(accessKeyId),
        accessKeySecret: encrypt(accessKeySecret),
        customDomain,
        isVerified: true,
        lastVerifiedAt: new Date(),
      },
    });
  }
  
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { ossMode },
  });
  
  res.json({ ok: true });
};

// 验证OSS配置（不保存）
export const verifyOssConfigEndpoint = async (req: Request, res: Response) => {
  const { region, bucket, accessKeyId, accessKeySecret } = req.body;
  
  const result = await verifyOssConfig({ region, bucket, accessKeyId, accessKeySecret });
  res.json(result);
};
```

---

## Task 4.5: 租户认证 ⏱️ 1天

### 租户管理员登录
```typescript
export const tenantAdminLogin = async (req: Request, res: Response) => {
  const { username, password, deviceFingerprint } = req.body;
  
  const admin = await prisma.tenantAdmin.findUnique({
    where: { username },
    include: { tenant: true },
  });
  
  if (!admin || !await bcrypt.compare(password, admin.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  
  if (!admin.tenant.isActive) {
    return res.status(403).json({ error: '账户已被禁用' });
  }
  
  // 设备验证
  if (admin.deviceId && admin.deviceId !== deviceFingerprint) {
    return res.status(403).json({ error: '设备不匹配，请联系管理员' });
  }
  
  // 首次登录绑定设备
  if (!admin.deviceId) {
    await prisma.tenantAdmin.update({
      where: { id: admin.id },
      data: { deviceId: deviceFingerprint },
    });
  }
  
  // 生成JWT
  const token = jwt.sign(
    { type: 'tenant_admin', tenantId: admin.tenantId, adminId: admin.id },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
  
  await prisma.tenantAdmin.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  
  res.json({ token, tenant: admin.tenant });
};
```

### 租户成员登录
```typescript
export const tenantMemberLogin = async (req: Request, res: Response) => {
  const { tenantApiKey, username, password, deviceFingerprint } = req.body;
  
  // 通过API Key找租户
  const tenant = await prisma.tenant.findUnique({
    where: { apiKey: tenantApiKey },
  });
  
  if (!tenant || !tenant.isActive) {
    return res.status(401).json({ error: '无效的API Key' });
  }
  
  const member = await prisma.tenantMember.findUnique({
    where: { tenantId_username: { tenantId: tenant.id, username } },
  });
  
  if (!member || !await bcrypt.compare(password, member.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  
  if (!member.isActive) {
    return res.status(403).json({ error: '账户已被禁用' });
  }
  
  // 设备验证逻辑同上...
  
  const token = jwt.sign(
    { type: 'tenant_member', tenantId: tenant.id, memberId: member.id },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
  
  res.json({ token, member: { ...member, password: undefined } });
};
```

---

## Task 4.6: 管理端/用户端前端 ⏱️ 3天

### 推荐技术栈
- **框架**: Electron 或 Tauri
- **UI**: React + TailwindCSS + shadcn/ui
- **打包**: electron-builder 或 tauri-cli

### 管理端功能
1. 登录（用户名/密码 + 设备绑定）
2. 仪表盘（余额、用量统计）
3. 模型管理（开关模型）
4. 成员管理（添加/禁用）
5. OSS配置
6. 消费记录

### 用户端功能
1. 登录（API Key + 用户名/密码 + 设备绑定）
2. AI功能界面
3. 个人用量查看
