# Waule API

统一的 API 服务平台，整合了以下功能：

- **Gateway** (端口 9000) - 统一API网关，支持JWT和API Key认证
- **Sora API** (端口 8000) - OpenAI 兼容的视频生成 API，带管理页面
- **Sora Proxy** (端口 8001) - 视频代理服务，下载视频/图片后上传到阿里云 OSS
- **Gemini Service** (端口 3100) - Google Gemini AI 服务，支持图片和文本生成

## 商用版改造文档

详见 [docs/README.md](./docs/README.md)

## 功能特性

### Sora API
- OpenAI 兼容的 API 接口
- Token 管理和轮换
- 去水印视频下载
- Web 管理界面

### Sora Proxy
- 自动下载 Sora 生成的视频和图片
- 上传到阿里云 OSS
- 替换媒体 URL 返回

### Gemini Service
- 图片生成 (gemini-2.0-flash-exp-image-generation)
- 文本生成 (gemini-2.0-flash)
- **多 API Key 轮换** - 避免单个 Key 限速
- 图片自动上传到 OSS

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env 填写阿里云 OSS 和 Gemini API 配置
```

### 2. 构建并启动服务

**普通模式：**
```bash
docker compose up -d --build
```

**WARP 代理模式（Sora API 使用 Cloudflare WARP 代理）：**
```bash
docker compose -f docker-compose.warp.yml up -d --build
```

### 3. 访问管理页面

打开 http://localhost:8000/login

默认账号密码：`admin` / `admin`

### 4. 配置 Gemini API Keys

1. 登录管理页面
2. 点击 "Gemini 配置" 标签
3. 添加多个 Gemini API Key 实现轮换

## 构建与部署

### 首次构建

```bash
# 普通模式
docker compose up -d --build

# WARP 模式
docker compose -f docker-compose.warp.yml up -d --build
```

### 重新构建（代码更新后）

```bash
# 普通模式
docker compose up -d --build

# WARP 模式
docker compose -f docker-compose.warp.yml up -d --build

# 强制重新构建（清除缓存）
docker compose -f docker-compose.warp.yml build --no-cache
docker compose -f docker-compose.warp.yml up -d
```

### 停止服务

```bash
# 普通模式
docker compose down

# WARP 模式
docker compose -f docker-compose.warp.yml down
```

### 重启服务

```bash
docker compose -f docker-compose.warp.yml restart
```

## 日志查看

### 查看所有日志

```bash
docker logs wauleapi
```

### 实时跟踪日志

```bash
docker logs -f wauleapi
```

### 查看最近 100 行日志

```bash
docker logs --tail 100 wauleapi
```

### 过滤特定日志

```bash
# 查看 Sora Proxy 相关日志
docker logs wauleapi 2>&1 | grep "SoraProxy"

# 查看 Gemini 相关日志
docker logs wauleapi 2>&1 | grep "Gemini"

# 查看错误日志
docker logs wauleapi 2>&1 | grep -i "error"
```

### 查看 WARP 容器日志

```bash
docker logs warp
```

## 端口说明

| 端口 | 服务 | 说明 |
|------|------|------|
| 8000 | Sora API | 管理页面、OpenAI 兼容 API |
| 8001 | Sora Proxy | 视频代理（上传到 OSS） |
| 3100 | Gemini Service | 图片/文本生成 API |
| 1080 | WARP Proxy | Cloudflare WARP SOCKS5 代理（仅 WARP 模式） |

## API 接口

### Sora API (8000)
```
POST /v1/chat/completions  # OpenAI 兼容接口
GET  /login                # 登录页面
GET  /manage               # 管理页面
```

### Sora Proxy (8001)
```
POST /v1/chat/completions  # 代理 Sora API，媒体上传到 OSS
GET  /health               # 健康检查
```

### Gemini Service (3100)
```
POST /api/gemini/image     # 图片生成
POST /api/gemini/text      # 文本生成
GET  /api/gemini-keys      # 获取 API Keys 列表
POST /api/gemini-keys      # 添加 API Key
GET  /health               # 健康检查
```

## 数据持久化

- `./data/` - 数据库文件
  - `sora.db` - Sora API 数据（Token、配置等）
  - `gateway.db` - Gemini Keys 数据
- `./config/setting.toml` - Sora API 配置（普通模式）
- `./config/setting_warp.toml` - Sora API 配置（WARP 模式）
- `./static/` - 前端静态文件

## 目录结构

```
wauleapi/
├── services/
│   ├── sora-api/              # Python Sora API 服务
│   └── node-gateway/          # Node.js 网关服务
├── static/                    # 前端静态文件
├── config/
│   ├── setting.toml           # 普通模式配置
│   └── setting_warp.toml      # WARP 模式配置
├── data/                      # 数据持久化目录
├── Dockerfile                 # Docker 镜像
├── docker-compose.yml         # 普通模式 Compose
├── docker-compose.warp.yml    # WARP 模式 Compose
├── supervisord.conf           # 进程管理配置
├── .env.example               # 环境变量示例
└── .env                       # 环境变量（自行创建）
```

## 常见问题

### 1. 如何切换 WARP 模式？

停止当前服务后使用对应的 compose 文件重新启动：
```bash
docker compose down
docker compose -f docker-compose.warp.yml up -d --build
```

### 2. 数据丢失怎么办？

确保 `./data` 目录已正确挂载，数据库文件会保存在该目录下。

### 3. Gemini API Key 如何轮换？

在管理页面的 "Gemini 配置" 标签中添加多个 API Key，系统会自动轮换使用。

### 4. 视频/图片没有上传到 OSS？

请确保：
1. 使用 **8001 端口** 调用 API（而非 8000）
2. `.env` 中的 OSS 配置正确
3. 查看日志确认是否有错误

## 许可证

MIT
