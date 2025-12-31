#!/bin/bash

# AI Gateway 安装脚本

set -e

echo "=== AI Gateway 安装脚本 ==="

# 检查是否为 root 或有 sudo 权限
if [ "$EUID" -ne 0 ]; then
    SUDO="sudo"
else
    SUDO=""
fi

# 安装编译工具（better-sqlite3 需要）
echo "检查编译工具..."
if ! command -v make &> /dev/null; then
    echo "安装 build-essential..."
    $SUDO apt-get update
    $SUDO apt-get install -y build-essential
fi

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "错误: 未找到 Node.js，请先安装 Node.js"
    exit 1
fi

echo "Node.js 版本: $(node -v)"

# 安装依赖
echo "安装 npm 依赖..."
npm install

# 构建项目
echo "构建项目..."
npm run build

# 创建数据目录
mkdir -p data

echo ""
echo "=== 安装完成 ==="
echo "启动方式:"
echo "  开发模式: npm run dev"
echo "  生产模式: npm start"
echo "  PM2部署: pm2 start ecosystem.config.js"
