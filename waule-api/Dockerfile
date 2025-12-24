# WauleAPI - 统一Docker镜像 (多阶段构建)
# 包含: sora-api (Python) + node-gateway (Node.js)

# ==================== Stage 1: Node.js 构建 ====================
FROM node:20-slim AS node-builder

WORKDIR /build

# 使用国内镜像源
RUN sed -i 's|deb.debian.org|mirrors.ustc.edu.cn|g' /etc/apt/sources.list.d/debian.sources

# 安装构建依赖
RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY services/node-gateway/package*.json ./

# 安装依赖
RUN npm ci --only=production=false

# 复制源码并构建
COPY services/node-gateway/ ./
RUN npm run build

# 清理开发依赖，只保留生产依赖
RUN rm -rf node_modules && npm ci --only=production
RUN npm rebuild better-sqlite3

# ==================== Stage 2: 最终镜像 ====================
FROM python:3.11-slim

# 使用国内镜像源
RUN sed -i 's|deb.debian.org|mirrors.ustc.edu.cn|g' /etc/apt/sources.list.d/debian.sources

# 安装 Node.js 运行时和必要工具
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 配置 pip 国内镜像
RUN pip config set global.index-url https://mirrors.ustc.edu.cn/pypi/web/simple

# 安装 PM2
RUN npm install -g pm2

WORKDIR /app

# ========== Python 依赖 ==========
COPY services/sora-api/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && rm /tmp/requirements.txt

# ========== 从构建阶段复制 Node-Gateway ==========
COPY --from=node-builder /build/dist /app/node-gateway/dist
COPY --from=node-builder /build/node_modules /app/node-gateway/node_modules
COPY --from=node-builder /build/package.json /app/node-gateway/package.json

# ========== 复制应用代码 ==========
COPY services/sora-api/ /app/sora-api/
COPY static/ /app/static/
COPY config/ /app/sora-api/config/

# ========== PM2 配置 ==========
COPY ecosystem.config.js /app/ecosystem.config.js

# ========== 创建数据目录 ==========
RUN mkdir -p /app/data /tmp/sora-proxy

# ========== 环境变量 ==========
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV DB_PATH=/app/data/gateway.db

# ========== 暴露端口 ==========
# 9000 - 统一网关入口
# 8000 - Sora API (Python sora2api)
# 8001 - Sora Proxy (兼容旧接口)
# 3100 - Gemini Service
EXPOSE 9000 8000 8001 3100

# ========== 健康检查 ==========
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:9000/health || exit 1

# ========== 启动 ==========
CMD ["pm2-runtime", "ecosystem.config.js"]
