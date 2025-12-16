# Waule 租户服务端

AI 生成内容本地存储服务 - 将 AI 生成的图片、视频等内容存储到企业本地服务器。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务

```bash
npm run dev  # 开发模式
# 或
npm start    # 生产模式
```

### 3. 打开管理页面

启动后访问：**http://localhost:3002/admin**

在管理页面中配置：
- **平台服务端地址**：Waule 平台的 API 地址
- **租户 API Key**：您的 API Key（`wk_live_xxx` 格式）
- **本地存储路径**：AI 生成内容的保存位置

### 4. 在前端启用本地存储

在 Waule 前端「设置」页面，填写本地服务端地址：

```
http://您的内网IP:3002
```

例如：`http://192.168.1.100:3002`

## 📦 功能特点

✅ **零环境变量配置** - 所有配置通过 Web 界面完成  
✅ **SQLite 存储** - 配置数据持久化存储  
✅ **自动内网 IP 检测** - 自动显示内网访问地址  
✅ **实时存储统计** - 查看文件数量和存储空间  
✅ **连接测试** - 一键测试平台连接状态  

## 🔌 API 接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/admin` | GET | 管理页面 |
| `/api/upload` | POST | 上传文件到本地 |
| `/api/upload/to-oss` | POST | 临时上传到平台 OSS |
| `/api/download/result` | POST | 从 OSS 下载 AI 结果到本地 |
| `/api/files/list` | GET | 获取文件列表 |
| `/api/files/stats` | GET | 获取存储统计 |
| `/files/*` | GET | 静态文件访问 |
| `/health` | GET | 健康检查 |

## 📁 目录结构

```
data/
├── config.db        # SQLite 配置数据库
└── storage/
    ├── uploads/     # 用户上传的素材
    │   └── {userId}/{年}/{月}/
    ├── results/     # AI 生成的结果
    │   └── {userId}/{年}/{月}/
    └── temp/        # 临时文件
```

## 🔧 技术栈

- Node.js + TypeScript
- Express.js
- SQLite (better-sqlite3)
- Multer (文件上传)

## 📋 系统要求

- Node.js 18+
- 足够的磁盘空间（建议 50GB+）
- 内网可访问（用户端与服务端在同一网络）

## ❓ 常见问题

### Q: 配置保存在哪里？
A: 配置保存在 `data/config.db` SQLite 数据库中，重启服务不会丢失。

### Q: 如何修改端口？
A: 在管理页面修改端口后，需要重启服务才能生效。

### Q: 用户端无法访问？
A: 请确保：
1. 租户服务端已启动
2. 防火墙已开放对应端口
3. 用户端与服务端在同一内网
4. 前端设置中填写的是内网 IP 而非 localhost

### Q: 需要配置阿里云 OSS 吗？
A: **不需要！** 所有临时文件操作都通过平台 API 完成，租户无需接触任何云服务配置。
