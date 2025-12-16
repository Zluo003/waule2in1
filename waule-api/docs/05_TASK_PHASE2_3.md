# 阶段二：waule主服务适配

## Task 2.1: 新增内部API ⏱️ 2天

### 创建文件
`/home/waule/server/src/routes/internal.routes.ts`

```typescript
import { Router } from 'express';
import { prisma } from '../index';
import { billingService } from '../services/billing.service';

const router = Router();

// 内部API鉴权中间件
const internalAuth = (req: any, res: any, next: any) => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== process.env.INTERNAL_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

router.use(internalAuth);

// POST /internal/billing/charge - 计费
router.post('/billing/charge', async (req, res) => {
  const { targetType, targetId, modelId, operation, quantity, duration, resolution } = req.body;
  
  try {
    if (targetType === 'user') {
      const result = await billingService.chargeWithPermission({
        userId: targetId,
        aiModelId: modelId,
        operation,
        quantity,
        duration,
        resolution,
      });
      return res.json(result);
    }
    
    if (targetType === 'tenant') {
      const result = await chargeTenant(targetId, { modelId, operation, quantity, duration });
      return res.json(result);
    }
    
    res.status(400).json({ error: 'Invalid targetType' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /internal/billing/balance - 查询余额
router.get('/billing/balance', async (req, res) => {
  const { targetType, targetId } = req.query;
  
  if (targetType === 'user') {
    const user = await prisma.user.findUnique({
      where: { id: String(targetId) },
      select: { credits: true },
    });
    return res.json({ balance: user?.credits || 0 });
  }
  
  if (targetType === 'tenant') {
    const tenant = await prisma.tenant.findUnique({
      where: { id: String(targetId) },
      select: { credits: true },
    });
    return res.json({ balance: tenant?.credits || 0 });
  }
  
  res.status(400).json({ error: 'Invalid targetType' });
});

// GET /internal/tenants/by-apikey - 通过API Key获取租户
router.get('/tenants/by-apikey', async (req, res) => {
  const apiKey = req.headers['x-api-key'] as string;
  
  const tenant = await prisma.tenant.findUnique({
    where: { apiKey },
    select: {
      id: true,
      name: true,
      credits: true,
      enabledModels: true,
      ossMode: true,
      isActive: true,
    },
  });
  
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  
  res.json(tenant);
});

// GET /internal/tenants/:id/oss-config - 获取租户OSS配置
router.get('/tenants/:id/oss-config', async (req, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.params.id },
    include: { ossConfig: true },
  });
  
  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }
  
  res.json({
    ossMode: tenant.ossMode,
    ossConfig: tenant.ossConfig ? {
      region: tenant.ossConfig.region,
      bucket: tenant.ossConfig.bucket,
      accessKeyId: decrypt(tenant.ossConfig.accessKeyId),
      accessKeySecret: decrypt(tenant.ossConfig.accessKeySecret),
      customDomain: tenant.ossConfig.customDomain,
    } : null,
  });
});

// POST /internal/storage/record - 记录存储用量
router.post('/storage/record', async (req, res) => {
  const { tenantId, bytes } = req.body;
  
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { storageUsedBytes: { increment: bytes } },
  });
  
  res.json({ ok: true });
});

export default router;
```

### 注册路由
在 `/home/waule/server/src/index.ts` 添加:
```typescript
import internalRoutes from './routes/internal.routes';
// ...
app.use('/internal', internalRoutes);
```

---

## Task 2.2: 创建Gateway调用服务 ⏱️ 1天

### 创建文件
`/home/waule/server/src/services/gateway.service.ts`

```typescript
import axios from 'axios';

const GATEWAY_URL = process.env.WAULEAPI_URL || 'http://localhost:9000';
const INTERNAL_JWT = process.env.INTERNAL_JWT; // 内部调用用的长期JWT

interface GatewayResponse<T> {
  data: T[];
  usage?: { credits_charged: number };
}

export async function callGateway<T>(
  endpoint: string,
  data: any,
  userId: string
): Promise<GatewayResponse<T>> {
  const response = await axios.post(`${GATEWAY_URL}${endpoint}`, data, {
    headers: {
      'Authorization': `Bearer ${INTERNAL_JWT}`,
      'X-User-Id': userId,
    },
    timeout: 300000, // 5分钟（视频生成可能很长）
  });
  return response.data;
}

export async function generateImage(options: {
  userId: string;
  model: string;
  prompt: string;
  size?: string;
  referenceImages?: string[];
}) {
  return callGateway('/v1/images/generations', {
    model: options.model,
    prompt: options.prompt,
    size: options.size,
    reference_images: options.referenceImages,
  }, options.userId);
}

export async function generateVideo(options: {
  userId: string;
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  referenceImages?: string[];
}) {
  return callGateway('/v1/videos/generations', {
    model: options.model,
    prompt: options.prompt,
    duration: options.duration,
    aspect_ratio: options.aspectRatio,
    reference_images: options.referenceImages,
  }, options.userId);
}
```

---

## Task 2.3: 修改AI控制器 ⏱️ 1天

### 修改文件
`/home/waule/server/src/controllers/ai.controller.ts`

添加环境变量切换:
```typescript
const USE_GATEWAY = process.env.AI_SERVICE_MODE === 'gateway';

export const generateImage = asyncHandler(async (req, res) => {
  if (USE_GATEWAY) {
    // 通过网关调用
    const result = await gatewayService.generateImage({
      userId: req.user!.id,
      model: req.body.modelId,
      prompt: req.body.prompt,
      size: req.body.ratio,
      referenceImages: req.body.referenceImages,
    });
    return res.json({ success: true, url: result.data[0].url });
  }
  
  // 原有直接调用逻辑...
});
```

---

# 阶段三：管理后台整合

## Task 3.1: 创建Token/Key管理API ⏱️ 1天

### wauleapi内部API
`/home/wauleapi/services/gateway/src/routes/internal.ts`

```typescript
// Sora Token管理（调用Python服务）
router.get('/sora/tokens', async (req, res) => {
  const response = await axios.get('http://localhost:8000/api/tokens');
  res.json(response.data);
});

router.post('/sora/tokens', async (req, res) => {
  const response = await axios.post('http://localhost:8000/api/tokens', req.body);
  res.json(response.data);
});

// Gemini Key管理（直接访问SQLite）
router.get('/gemini/keys', async (req, res) => {
  const keys = await getGeminiKeys();
  res.json(keys);
});

router.post('/gemini/keys', async (req, res) => {
  const key = await addGeminiKey(req.body.apiKey);
  res.json(key);
});
```

---

## Task 3.2: waule管理面板扩展 ⏱️ 2天

### 新增页面
`/home/waule/client/src/pages/admin/AIServiceManagement.tsx`

功能:
1. Sora Token列表/添加/删除
2. Gemini Key列表/添加/删除
3. 各模型服务健康状态
4. 模型启用/禁用开关

### API调用
通过waule后端代理到wauleapi:
```
waule前端 → waule后端(/api/admin/ai-services/*) → wauleapi(/internal/*)
```
