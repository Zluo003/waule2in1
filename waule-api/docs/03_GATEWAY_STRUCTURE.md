# Gateway服务结构

## 目录结构

```
wauleapi/services/gateway/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                 # 主入口
│   ├── middleware/
│   │   ├── auth.ts              # 认证（JWT + API Key双模式）
│   │   ├── billing.ts           # 计费中间件
│   │   └── error.ts             # 错误处理
│   ├── routes/
│   │   ├── v1/
│   │   │   ├── models.ts        # GET /v1/models
│   │   │   ├── images.ts        # POST /v1/images/generations
│   │   │   ├── videos.ts        # POST /v1/videos/generations
│   │   │   ├── audio.ts         # POST /v1/audio/speech
│   │   │   └── chat.ts          # POST /v1/chat/completions
│   │   └── internal.ts          # 内部管理API
│   ├── providers/               # AI服务提供商
│   │   ├── doubao.ts
│   │   ├── wanx.ts
│   │   ├── vidu.ts
│   │   ├── sora.ts
│   │   ├── gemini.ts
│   │   ├── minimaxi/
│   │   │   ├── index.ts
│   │   │   ├── video.ts
│   │   │   ├── image.ts
│   │   │   └── audio.ts
│   │   └── cosyvoice.ts
│   └── utils/
│       ├── oss.ts               # 多租户OSS
│       ├── crypto.ts            # 加解密
│       └── logger.ts
```

## 创建步骤

### Step 1: 创建目录

```bash
mkdir -p /home/wauleapi/services/gateway/src/{routes/v1,middleware,providers/minimaxi,utils}
```

### Step 2: package.json

```json
{
  "name": "wauleapi-gateway",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "dev": "ts-node-dev --respawn src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "axios": "^1.6.0",
    "ali-oss": "^6.20.0",
    "jsonwebtoken": "^9.0.2",
    "dotenv": "^16.3.1",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/cors": "^2.8.17",
    "@types/jsonwebtoken": "^9.0.5",
    "@types/uuid": "^9.0.7",
    "typescript": "^5.3.0",
    "ts-node-dev": "^2.0.0"
  }
}
```

### Step 3: tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

## API端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /health | 健康检查（无需认证） |
| GET | /v1/models | 获取可用模型列表 |
| POST | /v1/images/generations | 图片生成 |
| POST | /v1/videos/generations | 视频生成 |
| POST | /v1/audio/speech | 语音合成 |
| POST | /v1/chat/completions | 文本对话 |
| GET | /internal/sora/tokens | Sora Token列表 |
| POST | /internal/sora/tokens | 添加Sora Token |

## 环境变量

```env
# Gateway
GATEWAY_PORT=9000

# waule主服务
WAULE_API_URL=http://localhost:3000
INTERNAL_SECRET=your-internal-secret
JWT_SECRET=same-as-waule-jwt-secret

# 平台OSS
OSS_REGION=oss-accelerate
OSS_BUCKET=your-bucket
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx

# 加密密钥（用于加密租户OSS配置）
CONFIG_ENCRYPTION_KEY=32-bytes-hex-key
```
