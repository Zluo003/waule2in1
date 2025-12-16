# AIVIDER Server Dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

# 安装依赖（包括 devDependencies 用于构建）
COPY package*.json ./
RUN npm ci

# 复制 Prisma schema
COPY prisma ./prisma/

# 生成 Prisma Client
RUN npx prisma generate

# 复制源代码并构建
COPY . .
RUN npm run build

# 生产阶段
FROM node:20-alpine

# 安装 Prisma 所需的 OpenSSL
RUN apk add --no-cache openssl

WORKDIR /app

# 仅复制生产依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制 Prisma
COPY prisma ./prisma/
RUN npx prisma generate

# 复制构建产物
COPY --from=builder /app/dist ./dist

# 创建上传目录
RUN mkdir -p uploads

# 暴露端口
EXPOSE 3001

# 启动服务
CMD ["node", "dist/index.js"]
