# Waule 自动更新服务

提供 Waule 客户端和租户服务端的版本检查与自动更新功能。

## 架构说明

```
┌─────────────────┐     检查更新      ┌─────────────────────┐
│  Electron 客户端 │ ──────────────→ │  update.waule.com   │
│                 │                  │  (轻量更新服务)       │
└─────────────────┘                  └─────────────────────┘
        │                                      │
        │ 下载安装包                            │ 返回 OSS 下载链接
        ↓                                      ↓
┌─────────────────────────────────────────────────────────┐
│              阿里云 OSS (waule-releases)                 │
│  waule-client/1.0.1/Waule-Setup-1.0.1.exe              │
│  waule-tenant-server/1.0.1/xxx.exe                     │
└─────────────────────────────────────────────────────────┘
```

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产模式
npm run build
npm start
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```bash
# 服务端口
PORT=3008

# 阿里云 OSS 配置（启用后从 OSS 下载安装包）
OSS_ENABLED=true
OSS_BUCKET=waule-releases
OSS_REGION=oss-cn-hangzhou
OSS_BASE_URL=https://waule-releases.oss-cn-hangzhou.aliyuncs.com
```

## 发布新版本

### 方式一：OSS 模式（推荐）

1. 上传安装包到阿里云 OSS：
```
waule-releases/
├── waule-client/
│   └── 1.0.1/
│       └── Waule-Setup-1.0.1.exe
└── waule-tenant-server/
    └── 1.0.1/
        └── Waule企业版服务端-1.0.1-win-x64.exe
```

2. 在本地 `releases/` 目录创建版本元数据：
```
releases/
├── waule-client/
│   └── 1.0.1/
│       └── release.json
└── waule-tenant-server/
    └── 1.0.1/
        └── release.json
```

**release.json 示例：**
```json
{
  "version": "1.0.1",
  "releaseDate": "2024-12-21T12:00:00.000Z",
  "releaseNotes": "修复了若干问题",
  "mandatory": false,
  "files": [
    {
      "filename": "Waule-Setup-1.0.1.exe",
      "size": 85000000,
      "sha512": "可选，文件哈希"
    }
  ]
}
```

### 方式二：本地文件模式

直接将安装程序放入 `releases/` 目录，服务会自动扫描。

## API 接口

### 检查更新
```
GET /update/:app/:platform/:arch?version=x.x.x
```

### 获取 latest.yml (Windows)
```
GET /update/:app/latest.yml
```

### 获取 latest-mac.yml (macOS)
```
GET /update/:app/latest-mac.yml
```

### 列出所有版本
```
GET /versions/:app
```

## 服务器部署

部署到 `update.waule.com`，建议使用 PM2：

```bash
npm run build
pm2 start dist/index.js --name waule-update-server
```

Nginx 配置：
```nginx
server {
    listen 443 ssl;
    server_name update.waule.com;
    
    location / {
        proxy_pass http://127.0.0.1:3008;
        proxy_set_header Host $host;
    }
}
```
