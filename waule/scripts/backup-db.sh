#!/bin/bash
# PostgreSQL 数据库备份脚本
# 每天凌晨3点（北京时间）自动执行

BACKUP_DIR="/home/aivider/waule/backups"
DB_NAME="aivider_db"
DB_USER="aivider"
DB_PASS="Lzh120710"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.dump"

# 确保备份目录存在
mkdir -p "$BACKUP_DIR"

# 执行备份（dump格式，全库备份）
echo "[$(date)] 开始备份数据库..."
PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h localhost -Fc -f "$BACKUP_FILE" "$DB_NAME"

if [ $? -eq 0 ]; then
    echo "[$(date)] 备份成功: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
    # 删除7天前的备份
    find "$BACKUP_DIR" -name "*.dump" -mtime +7 -delete
    echo "[$(date)] 已清理7天前的旧备份"
else
    echo "[$(date)] 备份失败!" >&2
    exit 1
fi
