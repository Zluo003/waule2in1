-- 创建用户（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'aivider') THEN
        CREATE ROLE aivider WITH LOGIN PASSWORD 'Lzh120710';
    END IF;
END
$$;

-- 创建数据库（如果不存在）
SELECT 'CREATE DATABASE aivider_commercial OWNER aivider'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'aivider_commercial')\gexec

-- 授权
GRANT ALL PRIVILEGES ON DATABASE aivider_commercial TO aivider;

-- 连接到新数据库并启用扩展
\c aivider_commercial

-- 启用 pg_trgm 扩展（用于 GIN 索引）
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 授予 schema 权限
GRANT ALL ON SCHEMA public TO aivider;
