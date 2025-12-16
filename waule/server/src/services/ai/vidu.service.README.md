# Vidu Q2 图生视频服务

基于 Vidu API v2 的图生视频服务实现。

## 功能特性

- ✅ **图生视频** (Image-to-Video)
- ✅ **多模型支持**: viduq2-pro、viduq2-turbo、viduq1、viduq1-classic、vidu2.0、vidu1.5
- ✅ **本地图片自动转换**: 自动将本地图片URL转换为base64
- ✅ **灵活的参数配置**: 支持时长、分辨率、运动幅度等参数
- ✅ **音视频直出**: 支持生成带音频的视频
- ✅ **错峰模式**: 支持错峰生成以节省积分
- ✅ **自动轮询**: 自动轮询任务状态直到完成
- ✅ **任务管理**: 支持查询和取消任务

## API 配置

**在管理后台配置模型**，而不是使用环境变量。

在管理后台的 AI 模型配置中添加 Vidu 模型：
- **Provider**: vidu
- **API Key**: 您的 Vidu API 密钥
- **API URL**: https://api.vidu.cn (可选，默认值)

## 使用示例

### 1. 基础图生视频

```typescript
import { imageToVideo } from './services/ai/vidu.service';

const videoUrl = await imageToVideo({
  images: ['https://example.com/image.jpg'],
  prompt: 'The astronaut waved and the camera moved up.',
  model: 'viduq2-pro',
  duration: 5,
  resolution: '1080p',
});

console.log('生成的视频:', videoUrl);
```

### 2. 使用本地图片

```typescript
const videoUrl = await imageToVideo({
  images: ['http://localhost:3000/uploads/image.jpg'],  // 自动转换为base64
  prompt: 'A beautiful sunset scene with gentle waves.',
  model: 'viduq2-turbo',
  duration: 8,
  resolution: '720p',
  movement_amplitude: 'medium',
});
```

### 3. 音视频直出

```typescript
const videoUrl = await imageToVideo({
  images: ['https://example.com/portrait.jpg'],
  prompt: 'A person talking about the weather.',
  model: 'viduq2-pro',
  audio: true,
  voice_id: 'professional_host',
  duration: 5,
  resolution: '1080p',
});
```

### 4. 使用推荐提示词

```typescript
const videoUrl = await imageToVideo({
  images: ['https://example.com/landscape.jpg'],
  model: 'viduq2-pro',
  is_rec: true,  // 系统自动推荐提示词
  duration: 5,
  resolution: '720p',
});
```

### 5. 错峰模式（节省积分）

```typescript
const videoUrl = await imageToVideo({
  images: ['https://example.com/image.jpg'],
  prompt: 'Slow motion scene.',
  model: 'viduq2-turbo',
  duration: 5,
  resolution: '720p',
  off_peak: true,  // 错峰模式，48小时内完成
});
```

### 6. 查询任务状态

```typescript
import { queryTaskStatus } from './services/ai/vidu.service';

const taskStatus = await queryTaskStatus('your_task_id');
console.log('任务状态:', taskStatus.state);
console.log('视频URL:', taskStatus.video_url);
```

### 7. 取消错峰任务

```typescript
import { cancelTask } from './services/ai/vidu.service';

await cancelTask('your_task_id');
console.log('任务已取消');
```

## 模型说明

| 模型 | 默认时长 | 可选时长 | 默认分辨率 | 可选分辨率 | 特点 |
|------|----------|----------|------------|------------|------|
| **viduq2-pro** | 5秒 | 1-10秒 | 720p | 540p, 720p, 1080p | 新模型，效果好，细节丰富 |
| **viduq2-turbo** | 5秒 | 1-10秒 | 720p | 540p, 720p, 1080p | 新模型，效果好，生成快 |
| **viduq1** | 5秒 | 5秒 | 1080p | 1080p | 画面清晰，平滑转场，运镜稳定 |
| **viduq1-classic** | 5秒 | 5秒 | 1080p | 1080p | 画面清晰，转场、运镜更丰富 |
| **vidu2.0** | 4秒 | 4秒, 8秒 | 360p | 360p, 720p, 1080p (4秒) / 720p (8秒) | 生成速度快 |
| **vidu1.5** | 4秒 | 4秒, 8秒 | 360p | 360p, 720p, 1080p (4秒) / 720p (8秒) | 动态幅度大 |

## 参数说明

### 必填参数

- `images`: string[] - 首帧图像数组（只支持1张）
  - 支持图片 Base64 编码或图片URL
  - 支持格式: png、jpeg、jpg、webp
  - 图片比例: 小于 1:4 或 4:1
  - 图片大小: 不超过 50 MB
  - Base64 decode后: 小于 10 MB

### 可选参数

- `prompt`: string - 文本提示词（不超过2000字符）
- `model`: string - 模型名称（默认: viduq2-pro）
- `audio`: boolean - 是否使用音视频直出（默认: false）
- `voice_id`: string - 音色id（需audio=true）
- `is_rec`: boolean - 是否使用推荐提示词（默认: false，额外消耗10积分）
- `duration`: number - 视频时长（根据模型而定）
- `seed`: number - 随机种子（默认: 0，使用随机数）
- `resolution`: string - 分辨率（根据模型而定）
- `movement_amplitude`: string - 运动幅度（默认: auto，可选: small, medium, large）
- `payload`: string - 透传参数（最多1048576字符）
- `off_peak`: boolean - 错峰模式（默认: false）
- `watermark`: boolean - 是否添加水印（默认: false）
- `wm_position`: number - 水印位置（1:左上, 2:右上, 3:右下, 4:左下，默认: 3）
- `wm_url`: string - 水印图片URL
- `meta_data`: string - 元数据标识（JSON格式）
- `callback_url`: string - 回调地址

## 任务状态

- `created` - 创建成功
- `queueing` - 任务排队中
- `processing` - 任务处理中
- `success` - 任务成功
- `failed` - 任务失败

## 错误处理

服务会自动处理以下错误：

1. **API密钥未配置**: 抛出错误提示配置API密钥
2. **图片处理失败**: 记录详细错误日志
3. **任务超时**: 默认轮询120次（约20分钟）
4. **网络错误**: 自动重试

## 注意事项

1. **本地图片处理**: 本地图片会自动转换为base64，注意文件大小限制
2. **轮询时间**: 视频生成可能需要较长时间，默认轮询20分钟
3. **错峰模式**: 错峰任务在48小时内完成，积分消耗更低
4. **音视频直出**: 启用audio=true时，不支持错峰模式
5. **推荐提示词**: 启用is_rec=true时，额外消耗10积分

## 集成到控制器

```typescript
// 在 controller 中使用
import { imageToVideo } from '../services/ai/vidu.service';

export async function handleViduImageToVideo(req, res) {
  try {
    const { images, prompt, model, duration, resolution } = req.body;
    
    const videoUrl = await imageToVideo({
      images,
      prompt,
      model,
      duration,
      resolution,
    });
    
    res.json({
      success: true,
      videoUrl,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
```

## 测试

```bash
# 测试图生视频
curl -X POST http://localhost:3000/api/vidu/img2video \
  -H "Content-Type: application/json" \
  -d '{
    "images": ["https://example.com/image.jpg"],
    "prompt": "A beautiful animation",
    "model": "viduq2-pro",
    "duration": 5,
    "resolution": "1080p"
  }'
```
