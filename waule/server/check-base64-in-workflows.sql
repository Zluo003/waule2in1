-- 检查工作流中是否有 Base64 图片数据
-- 这个查询会找出所有包含 "data:image" 的工作流记录

SELECT
  id,
  name,
  "userId",
  "createdAt",
  LENGTH(data::text) as data_size_bytes,
  ROUND(LENGTH(data::text) / 1024.0, 2) as data_size_kb,
  ROUND(LENGTH(data::text) / 1024.0 / 1024.0, 2) as data_size_mb
FROM workflows
WHERE data::text LIKE '%data:image%'
ORDER BY LENGTH(data::text) DESC
LIMIT 20;

-- 统计总数和总大小
SELECT
  COUNT(*) as total_workflows_with_base64,
  SUM(LENGTH(data::text)) as total_bytes,
  ROUND(SUM(LENGTH(data::text)) / 1024.0 / 1024.0, 2) as total_mb
FROM workflows
WHERE data::text LIKE '%data:image%';
