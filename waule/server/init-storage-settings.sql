-- 初始化存储配置
-- 存储模式配置（默认 OSS）
INSERT INTO settings (id, key, value, type, category, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'storage_mode',
  'oss',
  'string',
  'storage',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- 本地存储基础 URL
INSERT INTO settings (id, key, value, type, category, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'storage_base_url',
  'http://localhost:3000',
  'string',
  'storage',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO NOTHING;
