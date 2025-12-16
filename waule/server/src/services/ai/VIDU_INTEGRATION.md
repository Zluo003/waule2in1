# Vidu Q2 服务集成完成

## ✅ 已完成的工作

### 1. 核心服务实现
**文件**: `/server/src/services/ai/vidu.service.ts`

- ✅ 实现了完整的 Vidu Q2 图生视频 API
- ✅ 支持本地图片自动转 base64
- ✅ 自动轮询任务状态（默认20分钟超时）
- ✅ 集成 OSS，自动下载视频到本地存储
- ✅ 完善的错误处理和日志记录
- ✅ **已适配管理后台配置**：从数据库获取 API Key，不使用环境变量

### 2. Controller 集成
**文件**: `/server/src/controllers/ai.controller.ts`

已在 `generateVideo` 函数中添加 Vidu 支持：

```typescript
case 'vidu':
  // Vidu Q2 图生视频（只支持图生视频，需要首帧图像）
  videoUrl = await viduService.imageToVideo({
    images: [referenceImages[0]],
    prompt: prompt || undefined,
    model: model.modelId,
    duration,
    resolution,
    apiKey: model.apiKey!,  // 从数据库获取
    apiUrl: model.apiUrl || undefined,
  });
  break;
```

### 3. 文档和示例
- ✅ `/server/src/services/ai/vidu.service.README.md` - 详细使用文档
- ✅ `/server/src/services/ai/vidu.service.example.ts` - 10个实用示例
- ✅ `/server/VIDU_SERVICE_SETUP.md` - 快速设置指南

## 🎯 核心功能

### 支持的模型
| 模型 | 时长 | 分辨率 | 特点 |
|------|------|--------|------|
| viduq2-pro | 1-10秒 | 540p/720p/1080p | 效果好，细节丰富 |
| viduq2-turbo | 1-10秒 | 540p/720p/1080p | 效果好，生成快 |
| viduq1 | 5秒 | 1080p | 平滑转场，运镜稳定 |
| viduq1-classic | 5秒 | 1080p | 转场、运镜更丰富 |
| vidu2.0 | 4秒/8秒 | 360p/720p/1080p | 生成速度快 |
| vidu1.5 | 4秒/8秒 | 360p/720p/1080p | 动态幅度大 |

### 支持的功能
- ✅ 图生视频
- ✅ 音视频直出（带音频）
- ✅ AI 推荐提示词
- ✅ 错峰模式（节省积分）
- ✅ 自定义水印
- ✅ 运动幅度控制
- ✅ 任务查询和取消

## 📋 使用方法

### 1. 在管理后台配置模型

进入管理后台 → AI 模型管理 → 添加新模型：

```
Provider: vidu
Model ID: viduq2-pro
Type: VIDEO_GENERATION
API Key: [您的 Vidu API Token]
API URL: https://api.vidu.cn (可选)
Is Active: ✅
```

### 2. 前端调用示例

从前端调用视频生成 API：

```typescript
// 图生视频
const response = await fetch('/api/ai/video', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  },
  body: JSON.stringify({
    modelId: 'vidu-model-id',  // 从管理后台获取的模型ID
    prompt: 'The astronaut waved and the camera moved up.',
    ratio: '16:9',
    resolution: '1080p',
    duration: 5,
    referenceImages: [imageBase64OrUrl],  // 必需：首帧图像
  }),
});

const { url } = await response.json();
console.log('生成的视频:', url);
```

### 3. 后端 Controller 处理流程

```
用户请求
  ↓
ai.controller.ts (generateVideo)
  ↓
从数据库获取模型配置 (apiKey, apiUrl)
  ↓
调用 viduService.imageToVideo()
  ↓
提交任务到 Vidu API
  ↓
轮询任务状态（最多20分钟）
  ↓
下载视频到 OSS
  ↓
返回本地视频 URL
```

## 🔧 技术细节

### API 密钥来源
- ❌ **不再使用**环境变量 (`VIDU_API_KEY`)
- ✅ **现在使用**管理后台配置（`AIModel.apiKey`）
- ✅ 从数据库 `ai_models` 表获取

### 图片处理
- 自动检测本地图片URL（`localhost` 或 `127.0.0.1`）
- 自动转换为 base64 格式
- 支持公网 URL 直接传递
- 验证图片大小（base64 decode 后 < 10MB）

### 轮询机制
- 默认轮询 120 次，每次间隔 10 秒（约 20 分钟）
- 任务状态：created → queueing → processing → success/failed
- 成功后自动下载视频到 OSS

### 错误处理
- API 密钥未配置 → 明确提示配置管理后台
- 图片未提供 → 提示需要首帧图像
- 轮询超时 → 抛出超时错误
- API 错误 → 返回详细错误信息

## 🧪 测试

### 单元测试（示例）
```bash
cd /home/luo/aivider/server
npx ts-node src/services/ai/vidu.service.example.ts
```

### API 测试
```bash
curl -X POST http://localhost:3000/api/ai/video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "modelId": "vidu-model-id",
    "prompt": "A beautiful animation",
    "duration": 5,
    "resolution": "1080p",
    "referenceImages": ["https://example.com/image.jpg"]
  }'
```

## ⚠️ 注意事项

1. **必需首帧图像**：Vidu 只支持图生视频，必须提供 `referenceImages`
2. **单张图片**：虽然 API 接受数组，但只使用第一张图片
3. **图片大小限制**：
   - 原始图片 < 50MB
   - Base64 decode 后 < 10MB
4. **比例限制**：图片比例需在 1:4 到 4:1 之间
5. **轮询时间**：视频生成可能需要较长时间，请耐心等待

## 📚 相关文件

- **服务**: `/server/src/services/ai/vidu.service.ts`
- **Controller**: `/server/src/controllers/ai.controller.ts` (已添加 vidu case)
- **文档**: `/server/src/services/ai/vidu.service.README.md`
- **示例**: `/server/src/services/ai/vidu.service.example.ts`
- **设置**: `/server/VIDU_SERVICE_SETUP.md`
- **Schema**: `/server/prisma/schema.prisma` (AIModel 表)

## 🎉 完成！

Vidu Q2 图生视频服务已完全集成到系统中，可以通过管理后台配置使用。
