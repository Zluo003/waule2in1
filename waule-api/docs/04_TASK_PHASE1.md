# 阶段一：AI服务迁移任务清单

## Task 1.1: 创建Gateway框架 ⏱️ 1天 ✅ 已完成

> **阶段三已完成**: waule管理后台已整合AI服务管理页面 (2025-12-03)

### 执行命令
```bash
cd /home/wauleapi/services
mkdir -p gateway/src/{routes/v1,middleware,providers/minimaxi,utils}
cd gateway
# 创建 package.json 和 tsconfig.json (见03_GATEWAY_STRUCTURE.md)
npm install
```

### 创建文件清单
1. `src/index.ts` - 主入口
2. `src/middleware/auth.ts` - 认证中间件
3. `src/middleware/billing.ts` - 计费中间件
4. `src/middleware/error.ts` - 错误处理
5. `src/routes/v1/models.ts` - 模型列表
6. `src/utils/logger.ts` - 日志工具

---

## Task 1.2: 迁移Doubao服务 ⏱️ 1天

### 源文件
`/home/waule/server/src/services/ai/doubao.service.ts`

### 目标文件
`/home/wauleapi/services/gateway/src/providers/doubao.ts`

### 迁移要点
1. 复制核心逻辑
2. 修改OSS引用: `../../utils/oss` → `../utils/oss`
3. 添加 `tenantId` 参数支持
4. 导出统一接口:

```typescript
export interface ImageGenOptions {
  model: string;
  prompt: string;
  size?: string;
  referenceImages?: string[];
  tenantId?: string;
}

export async function generateImage(options: ImageGenOptions): Promise<{
  url: string;
  revisedPrompt?: string;
}>;
```

---

## Task 1.3: 迁移Wanx服务 ⏱️ 1天

### 源文件
`/home/waule/server/src/services/ai/wanx.service.ts`

### 目标文件
`/home/wauleapi/services/gateway/src/providers/wanx.ts`

### 导出接口
```typescript
export async function generateImage(options: ImageGenOptions): Promise<{ url: string }>;
export async function generateVideo(options: VideoGenOptions): Promise<{ url: string; duration: number }>;
```

---

## Task 1.4: 迁移Vidu服务 ⏱️ 1天

### 源文件
`/home/waule/server/src/services/ai/vidu.service.ts`

### 目标文件
`/home/wauleapi/services/gateway/src/providers/vidu.ts`

### 导出接口
```typescript
export async function generateVideo(options: {
  model: string;
  prompt: string;
  duration?: number;
  aspectRatio?: string;
  referenceImages?: string[];
  tenantId?: string;
}): Promise<{ url: string; duration: number }>;
```

---

## Task 1.5: 迁移MiniMaxi服务 ⏱️ 2天

### 源文件
- `/home/waule/server/src/services/ai/minimaxi.service.ts`
- `/home/waule/server/src/services/ai/minimaxi.image.service.ts`
- `/home/waule/server/src/services/ai/minimaxi.audio.service.ts`

### 目标文件
```
/home/wauleapi/services/gateway/src/providers/minimaxi/
├── index.ts      # 统一导出
├── video.ts      # 视频生成
├── image.ts      # 图片生成
└── audio.ts      # 语音合成
```

---

## Task 1.6: 迁移CosyVoice服务 ⏱️ 0.5天

### 源文件
`/home/waule/server/src/services/ai/cosyvoice.service.ts`

### 目标文件
`/home/wauleapi/services/gateway/src/providers/cosyvoice.ts`

---

## Task 1.7: 整合Sora/Gemini ⏱️ 1天

现有服务已在wauleapi，需要：
1. 创建 `src/providers/sora.ts` 封装调用 localhost:8000
2. 创建 `src/providers/gemini.ts` 封装调用 localhost:3100
3. 或直接合并node-gateway代码到gateway

---

## Task 1.8: 创建多租户OSS工具 ⏱️ 0.5天

### 文件
`/home/wauleapi/services/gateway/src/utils/oss.ts`

### 核心功能
```typescript
// 根据租户配置获取OSS客户端
export async function getOssClient(tenantId?: string): Promise<{
  client: OSS;
  pathPrefix: string;
  customDomain?: string;
}>;

// 上传Buffer
export async function uploadBuffer(
  buffer: Buffer,
  ext: string,
  options?: { tenantId?: string; category?: string }
): Promise<string>;

// 下载URL并上传到OSS
export async function downloadAndUploadToOss(
  url: string,
  ext: string,
  options?: { tenantId?: string }
): Promise<string>;

// 验证租户OSS配置
export async function verifyOssConfig(config: OssConfig): Promise<{
  valid: boolean;
  error?: string;
}>;
```

---

## Task 1.9: 创建API路由 ⏱️ 1天

### 文件清单
1. `src/routes/v1/images.ts`
2. `src/routes/v1/videos.ts`
3. `src/routes/v1/audio.ts`
4. `src/routes/v1/chat.ts`
5. `src/routes/internal.ts`

---

## Task 1.10: 更新Docker配置 ⏱️ 0.5天

### 修改文件
1. `/home/wauleapi/Dockerfile` - 添加gateway构建
2. `/home/wauleapi/supervisord.conf` - 添加gateway进程
3. `/home/wauleapi/docker-compose.yml` - 更新端口和环境变量

---

## Task 1.11: 联调测试 ⏱️ 2天

### 测试用例
```bash
# 健康检查
curl http://localhost:9000/health

# 模型列表（需要JWT）
curl -H "Authorization: Bearer $JWT" http://localhost:9000/v1/models

# 图片生成
curl -X POST http://localhost:9000/v1/images/generations \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"model":"doubao-seedream-4.0","prompt":"a cat"}'

# 视频生成
curl -X POST http://localhost:9000/v1/videos/generations \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"model":"sora-turbo","prompt":"a running dog","duration":5}'
```
