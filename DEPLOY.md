# waule 混合部署指南

> **服务器配置**: 4核心 8G 内存  
> **部署方式**: waule (PM2) + waule-api (Docker)

## 架构概览

```
                    ┌─────────────────────────────────────────┐
                    │              Nginx (80/443)              │
                    └─────────────────────────────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
           ▼                           ▼                           ▼
    waule.ai (前端)           /api/*                      内部调用
    静态文件服务               waule-server:3000           waule-api:9000
       (Nginx)                    (PM2)                     (Docker)
                                    │                           │
                                    └───────────────────────────┘
                                         waule-server 调用 waule-api
```

## 端口分配

| 服务 | 端口 | 部署方式 | 说明 |
|------|------|----------|------|
| waule-server | 3000 | PM2 (2实例) | 主后端 API |
| waule-api | 9000 | Docker | API 网关入口 |
| sora-api | 8000 | Docker 内部 | Sora Python 服务 |

## 部署步骤

### 1. 安装依赖

```bash
# 安装 Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装 PM2
sudo npm install -g pm2

# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录使 docker 组生效
```

### 2. 克隆代码

```bash
cd /home/luo
git clone git@github.com:Zluo003/waule2in1.git
cd waule2in1
```

### 3. 构建 waule (PM2)

```bash
# 后端
cd waule/server
npm ci
npx prisma generate
npx prisma migrate deploy
npm run build

# 前端
cd ../client
npm ci
npm run build
```

### 4. 配置环境变量

```bash
# waule 后端
cp waule/server/.env.example waule/server/.env
nano waule/server/.env
# 配置: DATABASE_URL, OSS, API密钥, WAULE_API_URL=http://localhost:9000

# waule-api
cp waule-api/.env.example waule-api/.env
nano waule-api/.env
# 配置: SORA_API_KEY, API_SECRET
```

### 5. 创建日志目录

```bash
mkdir -p logs
```

### 6. 启动 waule-api (Docker)

```bash
cd waule-api
docker compose up -d

# 查看日志
docker compose logs -f
```

### 7. 启动 waule (PM2)

```bash
cd /home/luo/waule2in1

# 启动服务 (2个实例，cluster模式)
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 保存配置 + 开机自启
pm2 save
pm2 startup
```

## Nginx 配置示例

```nginx
# waule.ai - 前端静态文件
server {
    listen 80;
    server_name waule.ai www.waule.ai;
    
    root /home/luo/waule2in1/waule/client/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
    
    # Socket.IO
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

# api.waule.ai - 主后端 API（可选，如果需要单独域名）
server {
    listen 80;
    server_name api.waule.ai;
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
    }
}
```

## 常用命令

```bash
# 重启所有服务
pm2 restart all

# 重启单个服务
pm2 restart waule-server

# 停止所有服务
pm2 stop all

# 查看实时日志
pm2 logs --lines 100

# 监控面板
pm2 monit

# 重载配置
pm2 reload ecosystem.config.js
```

## 更新部署

```bash
cd /home/luo/waule2in1
git pull

# 重新构建
cd waule/server && npm run build
cd ../client && npm run build
cd ../../waule-api/services/node-gateway && npm run build

# 重启服务
pm2 restart all
```
