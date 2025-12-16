# Waule 商用版改造规划

## 一、目标架构

```
/home/luo/aivider/
├── waule-client/      # 用户前端（独立应用）
├── waule-server/      # 平台服务端（独立应用）
├── waule-api/         # AI网关（独立应用，已完成）
└── waule/             # 原项目（保留作为参考，改造完成后可删除）
```

### 部署架构
```
┌───────────────────────────────────────────────────────────────────────────┐
│                              国内部署                                       │
│                                                                           │
│   ┌─────────────┐                                                         │
│   │waule-client │  租户API Key                                            │
│   │ (用户前端)   │─────────────────┐                                       │
│   └─────────────┘                  │                                       │
│                                    ▼                                       │
│                         ┌──────────────────────────────────────┐          │
│                         │         waule-server (:3000)         │          │
│                         │                                      │          │
│                         │  ┌─────────────────────────────────┐ │          │
│                         │  │ 对外API (租户API Key认证)       │ │          │
│                         │  │ POST /api/v1/images/generations │ │          │
│                         │  │ POST /api/v1/videos/generations │ │          │
│                         │  │ POST /api/v1/chat/completions   │ │          │
│                         │  └─────────────────────────────────┘ │          │
│                         │                                      │          │
│                         │  ┌─────────────────────────────────┐ │          │
│                         │  │ 业务模块                         │ │          │
│                         │  │ - 租户管理 (Tenant CRUD)        │ │          │
│                         │  │ - 用户管理 (租户下的用户)        │ │          │
│                         │  │ - 计费系统 (按租户计费)          │ │          │
│                         │  │ - Admin后台 (/admin/*)          │ │          │
│                         │  └─────────────────────────────────┘ │          │
│                         │                  │                   │          │
│                         └──────────────────┼───────────────────┘          │
│                                            │ INTERNAL_SECRET              │
└────────────────────────────────────────────┼──────────────────────────────┘
                                             │
┌────────────────────────────────────────────┼──────────────────────────────┐
│                              国外部署       │                               │
│                                            ▼                               │
│                         ┌──────────────────────────────────────┐          │
│                         │         waule-api (:9000)            │          │
│                         │         (已完成，保持不变)             │          │
│                         │                                      │          │
│                         │  内部接口 (INTERNAL_SECRET认证)       │          │
│                         │  ├── /v1/images/*                    │          │
│                         │  ├── /v1/videos/*                    │          │
│                         │  ├── /v1/audio/*                     │          │
│                         │  ├── /v1/chat/*                      │          │
│                         │  ├── /v1/sora/* (sora-proxy)         │          │
│                         │  └── /v1/midjourney/*                │          │
│                         │                                      │          │
│                         │  管理接口                             │          │
│                         │  ├── /api/provider-keys (API Key池)  │          │
│                         │  ├── /api/platform-oss               │          │
│                         │  └── /api/discord-accounts           │          │
│                         │                                      │          │
│                         │  特殊服务 (不可修改)                   │          │
│                         │  └── sora2api (外接模型)              │          │
│                         └──────────────────────────────────────┘          │
│                                            │                               │
│                                            ▼                               │
│                              AI供应商 (Doubao, Gemini, Sora, Vidu, etc.)   │
└───────────────────────────────────────────────────────────────────────────┘
```

---

## 二、认证体系

### 2.1 三层认证

| 层级 | 认证方式 | 说明 |
|------|----------|------|
| **Client → Server** | 租户 API Key | `wk_live_xxxx` 格式，每租户一个 |
| **Server → waule-api** | INTERNAL_SECRET | 内部通信密钥 |
| **waule-api → AI供应商** | Provider API Key | 由 waule-api 管理 |

### 2.2 租户 API Key 设计

```
格式: wk_live_{32位随机字符}
示例: wk_live_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6

用途:
- Client 调用 Server 的 /api/v1/* 接口时携带
- Header: Authorization: Bearer wk_live_xxx
- 或 Header: X-API-Key: wk_live_xxx
```

### 2.3 租户用户认证

```
租户 (Tenant)
  └── API Key: wk_live_xxx
  └── 用户 (TenantUser)
        ├── user1 (username + password)
        ├── user2 (username + password)
        └── user3 (username + password)

登录流程:
1. 用户提供: API Key + username + password
2. Server 验证 API Key 找到租户
3. Server 验证用户凭证
4. 返回 JWT Token (包含 tenantId + userId)
5. 后续请求携带 JWT Token
```

---

## 三、改造阶段

### 阶段 0: 项目结构重组 (0.5天)
### 阶段 1: waule-server 对外API + 租户认证 (2天)
### 阶段 2: waule-server 对接 waule-api (2天)
### 阶段 3: waule-client 改造 (1天)
### 阶段 4: 多租户完整功能 (2天)
### 阶段 5: Admin后台 (2天)

---

## 四、详细任务

### 阶段 0: 项目结构重组

#### Task 0.1: 创建独立项目目录
```bash
cd /home/luo/aivider

# 复制 server
cp -r waule/server waule-server

# 复制 client  
cp -r waule/client waule-client

# waule-api 已存在，保持不变
```

#### Task 0.2: 清理 waule-server
```bash
# 移除前端打包产物（如果有）
rm -rf waule-server/dist/client 2>/dev/null

# 移除不再需要的 AI 供应商 API Key 配置
# (API Key 现在由 waule-api 管理)
```

#### Task 0.3: 更新各项目 package.json
- waule-server: name → "waule-server"
- waule-client: name → "waule-client"

---

### 阶段 1: waule-server 对外API + 租户认证

#### 目标
为 waule-server 添加面向租户的 API 接口，支持租户 API Key 认证。

#### Task 1.1: 添加租户相关数据模型

在 `waule-server/prisma/schema.prisma` 添加:

```prisma
// ============================================
// 租户模型
// ============================================

// 租户
model Tenant {
  id              String        @id @default(uuid())
  name            String        // 租户名称
  apiKey          String        @unique  // wk_live_xxx
  apiSecret       String        // 加密存储，用于签名验证(可选)
  credits         Int           @default(0)  // 积分余额
  isActive        Boolean       @default(true)
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  
  users           TenantUser[]
  usageRecords    TenantUsageRecord[]
  
  @@map("tenants")
}

// 租户用户
model TenantUser {
  id              String        @id @default(uuid())
  tenantId        String
  username        String
  password        String        // bcrypt 加密
  nickname        String?
  isActive        Boolean       @default(true)
  createdAt       DateTime      @default(now())
  lastLoginAt     DateTime?
  
  tenant          Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, username])
  @@map("tenant_users")
}

// 租户使用记录
model TenantUsageRecord {
  id              String        @id @default(uuid())
  tenantId        String
  userId          String?       // TenantUser ID
  modelId         String
  operation       String        // IMAGE_GENERATION, VIDEO_GENERATION, etc.
  creditsCharged  Int
  metadata        Json?
  createdAt       DateTime      @default(now())
  
  tenant          Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@index([tenantId, createdAt])
  @@map("tenant_usage_records")
}
```

#### Task 1.2: 创建租户认证中间件

`waule-server/src/middleware/tenant-auth.ts`:
```typescript
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../index';
import jwt from 'jsonwebtoken';

// 扩展 Request 类型
declare global {
  namespace Express {
    interface Request {
      tenant?: { id: string; name: string; credits: number };
      tenantUser?: { id: string; username: string; tenantId: string };
    }
  }
}

// API Key 认证 (用于直接 API 调用)
export async function tenantApiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'] as string 
    || req.headers.authorization?.replace('Bearer ', '');
  
  if (!apiKey?.startsWith('wk_')) {
    return res.status(401).json({ error: 'Invalid API Key' });
  }
  
  const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
  
  if (!tenant || !tenant.isActive) {
    return res.status(401).json({ error: 'Invalid or inactive API Key' });
  }
  
  req.tenant = { id: tenant.id, name: tenant.name, credits: tenant.credits };
  next();
}

// JWT Token 认证 (用于登录后的用户)
export async function tenantUserAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      type: string;
      tenantId: string;
      userId: string;
    };
    
    if (decoded.type !== 'tenant_user') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    
    const tenant = await prisma.tenant.findUnique({ where: { id: decoded.tenantId } });
    if (!tenant || !tenant.isActive) {
      return res.status(401).json({ error: 'Tenant not found or inactive' });
    }
    
    req.tenant = { id: tenant.id, name: tenant.name, credits: tenant.credits };
    req.tenantUser = { id: decoded.userId, username: '', tenantId: decoded.tenantId };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

#### Task 1.3: 创建租户认证路由

`waule-server/src/routes/tenant-auth.routes.ts`:
```typescript
import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../index';

const router = Router();

// 租户用户登录
// POST /api/v1/auth/login
// Body: { apiKey, username, password }
router.post('/login', async (req, res) => {
  const { apiKey, username, password } = req.body;
  
  // 1. 验证 API Key
  const tenant = await prisma.tenant.findUnique({ where: { apiKey } });
  if (!tenant || !tenant.isActive) {
    return res.status(401).json({ error: 'Invalid API Key' });
  }
  
  // 2. 验证用户
  const user = await prisma.tenantUser.findUnique({
    where: { tenantId_username: { tenantId: tenant.id, username } }
  });
  
  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'User not found or inactive' });
  }
  
  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  
  // 3. 生成 JWT
  const token = jwt.sign(
    { type: 'tenant_user', tenantId: tenant.id, userId: user.id },
    process.env.JWT_SECRET!,
    { expiresIn: '7d' }
  );
  
  // 4. 更新最后登录时间
  await prisma.tenantUser.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() }
  });
  
  res.json({
    token,
    user: { id: user.id, username: user.username, nickname: user.nickname },
    tenant: { id: tenant.id, name: tenant.name }
  });
});

export default router;
```

#### Task 1.4: 创建对外 AI API 路由

`waule-server/src/routes/api-v1/images.routes.ts`:
```typescript
import { Router } from 'express';
import { tenantApiKeyAuth, tenantUserAuth } from '../../middleware/tenant-auth';
import { imageService } from '../../services/ai/image.service';

const router = Router();

// 支持两种认证方式: API Key 或 JWT Token
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization || req.headers['x-api-key'];
  if (authHeader?.startsWith('wk_')) {
    return tenantApiKeyAuth(req, res, next);
  }
  return tenantUserAuth(req, res, next);
};

// POST /api/v1/images/generations
router.post('/generations', auth, async (req, res) => {
  try {
    const result = await imageService.generate({
      tenantId: req.tenant!.id,
      userId: req.tenantUser?.id,
      ...req.body
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
```

---

### 阶段 2: waule-server 对接 waule-api

#### Task 2.1: 创建 waule-api 客户端

`waule-server/src/services/wauleapi-client.ts`:
```typescript
import axios, { AxiosInstance } from 'axios';

class WauleApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.WAULEAPI_URL || 'http://localhost:9000',
      headers: {
        'X-Internal-Secret': process.env.INTERNAL_SECRET,
      },
      timeout: 300000, // 5分钟，AI生成可能很慢
    });
  }

  async generateImage(params: {
    provider: string;
    model: string;
    prompt: string;
    size?: string;
    referenceImage?: string;
    ossConfig?: OssConfig;
  }) {
    const response = await this.client.post('/internal/v1/images/generations', params);
    return response.data;
  }

  async generateVideo(params: {
    provider: string;
    model: string;
    prompt: string;
    image?: string;
    duration?: number;
    ossConfig?: OssConfig;
  }) {
    const response = await this.client.post('/internal/v1/videos/generations', params);
    return response.data;
  }

  async generateAudio(params: {
    provider: string;
    model: string;
    input: string;
    voice?: string;
    ossConfig?: OssConfig;
  }) {
    const response = await this.client.post('/internal/v1/audio/speech', params);
    return response.data;
  }

  async chat(params: {
    provider: string;
    model: string;
    messages: Array<{ role: string; content: string }>;
    temperature?: number;
    stream?: boolean;
  }) {
    const response = await this.client.post('/internal/v1/chat/completions', params);
    return response.data;
  }
}

export const wauleApiClient = new WauleApiClient();
```

#### Task 2.2: 改造 AI 服务为调度层

删除原有的直接调用逻辑，改为通过 waule-api:

`waule-server/src/services/ai/image.service.ts`:
```typescript
import { wauleApiClient } from '../wauleapi-client';
import { prisma } from '../../index';

export class ImageService {
  async generate(params: {
    tenantId: string;
    userId?: string;  // TenantUser ID
    provider: string;
    model: string;
    prompt: string;
    size?: string;
    negativePrompt?: string;
    referenceImage?: string;
  }) {
    // 1. 获取租户信息，检查余额
    const tenant = await prisma.tenant.findUnique({ where: { id: params.tenantId } });
    if (!tenant) throw new Error('Tenant not found');
    
    // 2. 估算积分
    const estimatedCredits = await this.estimateCredits(params.model, 1);
    if (tenant.credits < estimatedCredits) {
      throw new Error('积分不足');
    }

    // 3. 调用 waule-api
    const result = await wauleApiClient.generateImage({
      provider: params.provider,
      model: params.model,
      prompt: params.prompt,
      size: params.size,
      negativePrompt: params.negativePrompt,
      referenceImage: params.referenceImage,
      // OSS 配置：使用平台 OSS，按租户目录隔离
      ossConfig: { mode: 'PLATFORM', tenantId: params.tenantId },
    });

    // 4. 扣费 + 记录
    const actualCredits = this.calculateCredits(params.model, result.data.images.length);
    
    await prisma.$transaction([
      prisma.tenant.update({
        where: { id: params.tenantId },
        data: { credits: { decrement: actualCredits } }
      }),
      prisma.tenantUsageRecord.create({
        data: {
          tenantId: params.tenantId,
          userId: params.userId,
          modelId: params.model,
          operation: 'IMAGE_GENERATION',
          creditsCharged: actualCredits,
          metadata: { provider: params.provider, count: result.data.images.length }
        }
      })
    ]);

    return result.data;
  }

  private async estimateCredits(model: string, count: number): Promise<number> {
    // 从数据库获取计费规则，或使用默认值
    return count * 20; // 默认每张20积分
  }

  private calculateCredits(model: string, count: number): number {
    return count * 20;
  }
}

export const imageService = new ImageService();
```

#### Task 2.3: 创建视频、音频、对话服务

同样模式创建:
- `waule-server/src/services/ai/video.service.ts`
- `waule-server/src/services/ai/audio.service.ts`
- `waule-server/src/services/ai/chat.service.ts`

#### Task 2.4: 删除旧的直接调用服务

以下文件可以删除（逻辑已迁移到 waule-api）:
```
waule-server/src/services/ai/doubao.service.ts
waule-server/src/services/ai/gemini.service.ts
waule-server/src/services/ai/wanx.service.ts
waule-server/src/services/ai/vidu.service.ts
waule-server/src/services/ai/sora.service.ts
waule-server/src/services/ai/minimaxi.*.service.ts
waule-server/src/services/ai/cosyvoice.service.ts
```

保留:
- `waule-server/src/services/ai/index.ts` (重写为导出新服务)

#### Task 2.5: 环境变量配置

`waule-server/.env` 新增:
```env
# waule-api 配置
WAULEAPI_URL=https://your-wauleapi-domain.com  # 国外部署的地址
INTERNAL_SECRET=your-32-char-internal-secret
```

---

### 阶段 3: waule-client 前端改造

#### Task 3.1: 移除 Admin 相关页面

从 waule-client 中移除:
```
src/pages/admin/       # 整个 admin 目录
src/components/admin/  # admin 相关组件
```

#### Task 3.2: 更新路由配置

移除 admin 路由，保留用户功能路由。

#### Task 3.3: 配置 API 地址

`waule-client/.env.production`:
```env
VITE_API_URL=https://your-server.com
```

---

### 阶段 4: 多租户完整功能

#### Task 4.1: 租户 CRUD API (Admin 使用)

`waule-server/src/routes/admin/tenant.routes.ts`:
```typescript
import { Router } from 'express';
import { prisma } from '../../index';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

const router = Router();

// 创建租户
// POST /admin/api/tenants
router.post('/', async (req, res) => {
  const { name, initialCredits = 0 } = req.body;
  
  // 生成 API Key
  const apiKey = `wk_live_${crypto.randomBytes(16).toString('hex')}`;
  const apiSecret = crypto.randomBytes(24).toString('hex');
  
  const tenant = await prisma.tenant.create({
    data: {
      name,
      apiKey,
      apiSecret,
      credits: initialCredits,
    }
  });
  
  res.json({
    ...tenant,
    apiSecret, // 只在创建时返回明文
  });
});

// 租户列表
router.get('/', async (req, res) => {
  const tenants = await prisma.tenant.findMany({
    include: { _count: { select: { users: true } } },
    orderBy: { createdAt: 'desc' }
  });
  res.json(tenants);
});

// 租户充值
router.post('/:id/recharge', async (req, res) => {
  const { id } = req.params;
  const { amount } = req.body;
  
  const tenant = await prisma.tenant.update({
    where: { id },
    data: { credits: { increment: amount } }
  });
  
  res.json({ credits: tenant.credits });
});

export default router;
```

#### Task 4.2: 租户用户管理 API

`waule-server/src/routes/admin/tenant-users.routes.ts`:
```typescript
import { Router } from 'express';
import { prisma } from '../../index';
import bcrypt from 'bcrypt';

const router = Router();

// 添加租户用户
// POST /admin/api/tenants/:tenantId/users
router.post('/:tenantId/users', async (req, res) => {
  const { tenantId } = req.params;
  const { username, password, nickname } = req.body;
  
  const user = await prisma.tenantUser.create({
    data: {
      tenantId,
      username,
      password: await bcrypt.hash(password, 10),
      nickname,
    }
  });
  
  res.json({ ...user, password: undefined });
});

// 租户用户列表
router.get('/:tenantId/users', async (req, res) => {
  const { tenantId } = req.params;
  const users = await prisma.tenantUser.findMany({
    where: { tenantId },
    select: { id: true, username: true, nickname: true, isActive: true, lastLoginAt: true }
  });
  res.json(users);
});

export default router;
```

#### Task 4.3: 租户用量统计 API

```typescript
// GET /admin/api/tenants/:id/usage
router.get('/:id/usage', async (req, res) => {
  const { id } = req.params;
  const { startDate, endDate } = req.query;
  
  const records = await prisma.tenantUsageRecord.findMany({
    where: {
      tenantId: id,
      createdAt: {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string)
      }
    },
    orderBy: { createdAt: 'desc' }
  });
  
  const summary = await prisma.tenantUsageRecord.groupBy({
    by: ['operation'],
    where: { tenantId: id },
    _sum: { creditsCharged: true },
    _count: true
  });
  
  res.json({ records, summary });
});
```

---

### 阶段 5: Admin 前端开发

#### Task 5.1: 选择方案

**方案 A: 服务端渲染 (推荐)**
- 使用 EJS/Pug 模板
- 集成到 waule-server
- 路径: `/admin/*`

**方案 B: 独立 SPA**
- 单独的 React 应用
- 集成到 waule-server/admin-client
- 构建后放到 waule-server/public/admin

#### Task 5.2: Admin 前端功能

```
/admin/
├── login                 # 管理员登录
├── dashboard             # 仪表盘
├── tenants/              # 租户管理
│   ├── list              # 租户列表
│   ├── create            # 创建租户
│   └── :id/              # 租户详情
│       ├── info          # 基本信息
│       ├── members       # 成员管理
│       ├── usage         # 用量统计
│       └── billing       # 账单
├── models/               # 模型管理
│   ├── list              # 模型列表
│   └── :id/config        # 模型配置
├── billing/              # 计费管理
│   ├── rules             # 计费规则
│   └── packages          # 充值套餐
├── users/                # 平台用户管理
└── settings/             # 系统设置
```

---

## 五、环境变量汇总

### waule-api/.env
```env
# 服务端口
GATEWAY_PORT=9000

# 内部认证
INTERNAL_SECRET=your-32-char-secret-here

# 平台 OSS
OSS_REGION=oss-accelerate
OSS_BUCKET=your-bucket
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx

# AI Provider Keys (由管理接口动态管理)
# 不需要在 .env 中配置，从数据库读取
```

### waule-server/.env
```env
# 数据库
DATABASE_URL=postgresql://user:pass@localhost:5432/waule

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-jwt-secret

# wauleapi
WAULEAPI_URL=https://api.example.com
INTERNAL_SECRET=your-32-char-secret-here

# 加密密钥（用于加密租户 OSS 配置）
CONFIG_ENCRYPTION_KEY=your-32-bytes-hex-key
```

### waule-client/.env
```env
VITE_API_URL=https://your-server.com
```

---

## 六、执行顺序

```
Day 1 (半天):
└── 阶段 0 - 项目结构重组
    ├── cp waule/server → waule-server
    ├── cp waule/client → waule-client
    └── 更新 package.json

Day 2-3:
└── 阶段 1 - waule-server 对外API + 租户认证
    ├── 添加 Tenant, TenantUser, TenantUsageRecord 模型
    ├── 创建租户认证中间件
    ├── 创建 /api/v1/auth/login 路由
    └── 创建 /api/v1/images, /api/v1/videos 路由

Day 4-5:
└── 阶段 2 - waule-server 对接 waule-api
    ├── 创建 wauleapi-client.ts
    ├── 创建新的 image.service.ts, video.service.ts 等
    └── 删除旧的直接调用服务

Day 6:
└── 阶段 3 - waule-client 改造
    ├── 移除 Admin 页面
    ├── 添加租户登录页
    └── 配置 API 地址

Day 7-8:
└── 阶段 4 - 多租户完整功能
    ├── 租户 CRUD API
    ├── 租户用户管理
    └── 用量统计

Day 9-10:
└── 阶段 5 - Admin 后台
    ├── Admin 前端页面
    └── 测试 + 部署
```

---

## 七、测试检查点

### 阶段 0 完成标准
- [ ] waule-server 目录存在且可独立运行
- [ ] waule-client 目录存在且可独立运行

### 阶段 1 完成标准
- [ ] `POST /api/v1/auth/login` 可用（租户用户登录）
- [ ] `POST /api/v1/images/generations` 可用（需 API Key 或 JWT）
- [ ] 返回 401 当 API Key 无效时

### 阶段 2 完成标准
- [ ] waule-server 成功调用 waule-api 生成图片
- [ ] 租户积分正确扣除
- [ ] TenantUsageRecord 正确记录

### 阶段 3 完成标准
- [ ] waule-client 无 Admin 页面
- [ ] 租户登录页可用
- [ ] 可调用 AI 功能

### 阶段 4 完成标准
- [ ] Admin 可创建租户
- [ ] Admin 可为租户添加用户
- [ ] Admin 可为租户充值
- [ ] Admin 可查看租户用量

### 阶段 5 完成标准
- [ ] Admin 前端可访问
- [ ] Admin 可登录
- [ ] Admin 可管理租户
