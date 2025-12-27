-- 清理工作流中的 Base64 图片数据
-- ⚠️ 警告：这个脚本会修改数据，请先备份数据库！

-- 步骤 1：备份受影响的工作流
CREATE TABLE IF NOT EXISTS workflows_backup_base64 AS
SELECT * FROM workflows
WHERE data::text LIKE '%data:image%';

-- 步骤 2：创建清理函数
CREATE OR REPLACE FUNCTION clean_base64_from_json(input_json jsonb)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  -- 使用正则表达式替换所有 data:image 开头的字符串为空字符串
  result := regexp_replace(
    input_json::text,
    '"data:image/[^"]*"',
    '""',
    'g'
  )::jsonb;

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- 步骤 3：清理所有包含 Base64 的工作流
UPDATE workflows
SET data = clean_base64_from_json(data)
WHERE data::text LIKE '%data:image%';

-- 步骤 4：验证清理结果
SELECT
  COUNT(*) as remaining_workflows_with_base64
FROM workflows
WHERE data::text LIKE '%data:image%';

-- 步骤 5：显示清理统计
SELECT
  (SELECT COUNT(*) FROM workflows_backup_base64) as backed_up_count,
  (SELECT SUM(LENGTH(data::text)) FROM workflows_backup_base64) as original_size_bytes,
  (SELECT SUM(LENGTH(data::text)) FROM workflows WHERE id IN (SELECT id FROM workflows_backup_base64)) as cleaned_size_bytes,
  (SELECT SUM(LENGTH(data::text)) FROM workflows_backup_base64) -
  (SELECT SUM(LENGTH(data::text)) FROM workflows WHERE id IN (SELECT id FROM workflows_backup_base64)) as saved_bytes;

-- 如果清理成功，可以删除备份表（可选）
-- DROP TABLE workflows_backup_base64;
