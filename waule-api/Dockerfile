# WauleAPI - 统一Docker镜像
# 包含: sora-api (Python) + node-gateway (Node.js)

FROM python:3.11-slim

# 安装 Node.js 和构建工具
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    python3 \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# 安装 supervisor
RUN pip install supervisor

WORKDIR /app

# ========== Python 依赖 ==========
COPY services/sora-api/requirements.txt /app/sora-api/requirements.txt
RUN pip install --no-cache-dir -r /app/sora-api/requirements.txt

# ========== Node-Gateway 依赖（统一API网关）==========
COPY services/node-gateway/package*.json /app/node-gateway/
WORKDIR /app/node-gateway
RUN npm install
# 重新编译 better-sqlite3 原生模块（确保在 Linux 上正确编译）
RUN npm rebuild better-sqlite3

# 复制源码并构建
COPY services/node-gateway/ /app/node-gateway/
RUN npm run build

WORKDIR /app

# ========== 复制应用代码 ==========
COPY services/sora-api/ /app/sora-api/
COPY static/ /app/static/
# 配置文件复制到 sora-api 目录下
COPY config/ /app/sora-api/config/

# ========== 创建数据目录 ==========
RUN mkdir -p /app/data /tmp/sora-proxy

# ========== Supervisor 配置 ==========
COPY supervisord.conf /etc/supervisor/supervisord.conf

# ========== 环境变量 ==========
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production
ENV DB_PATH=/app/data/gateway.db

# ========== 暴露端口 ==========
# 8000 - Sora API (Python sora2api)
# 8001 - Sora Proxy (兼容旧接口)
# 3100 - 统一API网关 (v1/images, v1/videos, v1/audio, v1/chat, v1/sora, api/gemini)
EXPOSE 8000 8001 3100

# ========== 启动 ==========
CMD ["supervisord", "-c", "/etc/supervisor/supervisord.conf"]
