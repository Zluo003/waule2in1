#!/bin/bash
# PostgreSQL 数据库备份脚本
# 每8小时自动执行，备份后上传到 OSS

BACKUP_DIR="/home/waule2in1/waule/databackup"
DB_NAME="aivider"
DB_USER="waule"
DB_PASS="Lzh120710"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}_${DATE}.dump"

# OSS 配置
OSS_BUCKET="aivider"
OSS_ENDPOINT="oss-cn-beijing.aliyuncs.com"
OSS_ACCESS_KEY_ID="LTAI5tPmnvEogP4JrGdMEm9G"
OSS_ACCESS_KEY_SECRET="i3Nwo5yw64onQvbMFclqpFOrddC0zV"
OSS_PATH="databackup"

# 确保备份目录存在
mkdir -p "$BACKUP_DIR"

# 执行备份（dump格式，全库备份）
echo "[$(date)] 开始备份数据库..."
PGPASSWORD="$DB_PASS" pg_dump -U "$DB_USER" -h localhost -Fc -f "$BACKUP_FILE" "$DB_NAME"

if [ $? -eq 0 ]; then
    echo "[$(date)] 备份成功: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"
    
    # 上传到 OSS
    echo "[$(date)] 开始上传到 OSS..."
    ossutil64 cp "$BACKUP_FILE" "oss://${OSS_BUCKET}/${OSS_PATH}/" \
        -e "$OSS_ENDPOINT" \
        -i "$OSS_ACCESS_KEY_ID" \
        -k "$OSS_ACCESS_KEY_SECRET"
    
    if [ $? -eq 0 ]; then
        echo "[$(date)] OSS 上传成功: oss://${OSS_BUCKET}/${OSS_PATH}/$(basename $BACKUP_FILE)"
    else
        echo "[$(date)] OSS 上传失败!" >&2
    fi
    
    # 删除7天前的本地备份
    find "$BACKUP_DIR" -name "*.dump" -mtime +7 -delete
    echo "[$(date)] 已清理7天前的本地旧备份"
else
    echo "[$(date)] 备份失败!" >&2
    exit 1
fi
