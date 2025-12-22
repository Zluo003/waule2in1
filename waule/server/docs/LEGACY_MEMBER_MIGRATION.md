# 老会员特权迁移指南

## 背景

新平台不再为 VIP/SVIP 用户提供免费额度，但需要保留现有会员的特权直到他们**迁移时的会员到期日**（即使后来续费，也不延长老特权）。

## 老会员特权配置

在代码中硬编码的特权配置：

| 会员等级 | 模型 | 每日免费次数 |
|---------|------|-------------|
| VIP | gemini-3-pro-image-preview | 20 次 |
| SVIP | gemini-3-pro-image-preview | 100 次 |
| SVIP | midjourney | 50 次 |

> 如需修改配额，编辑文件：`waule/server/src/services/user-level.service.ts` 中的 `LEGACY_MEMBER_FREE_QUOTAS`

---

## 部署步骤

### 第一步：部署新代码

正常部署新版本代码到服务器。

### 第二步：恢复数据库备份

按照正常流程恢复数据库备份。

### 第三步：添加新字段

连接到 PostgreSQL 数据库，执行以下 SQL：

```sql
-- 添加 legacy_member_expire_at 字段（如果不存在）
ALTER TABLE users ADD COLUMN IF NOT EXISTS legacy_member_expire_at TIMESTAMP;
```

### 第四步：记录老会员特权到期日

执行以下 SQL，将现有 VIP/SVIP 用户的**当前会员到期日**复制到 `legacy_member_expire_at`：

```sql
-- 记录老会员的特权到期日（= 迁移时的会员到期日）
UPDATE users 
SET legacy_member_expire_at = membership_expire_at
WHERE role IN ('VIP', 'SVIP') 
  AND membership_expire_at > NOW();
```

### 第五步：验证

执行以下 SQL 验证迁移结果：

```sql
-- 查看老会员数量
SELECT role, COUNT(*) as total,
       COUNT(CASE WHEN legacy_member_expire_at IS NOT NULL THEN 1 END) as legacy_count
FROM users 
WHERE role IN ('VIP', 'SVIP')
GROUP BY role;

-- 查看老会员列表（前20个）
SELECT id, nickname, phone, role, membership_expire_at, legacy_member_expire_at
FROM users 
WHERE legacy_member_expire_at IS NOT NULL
ORDER BY legacy_member_expire_at DESC
LIMIT 20;
```

### 第六步：（可选）清理旧的 ModelPermission 免费配额

如果不希望新用户获得免费额度，可以清理旧的权限配置：

```sql
-- 查看当前的免费配额配置
SELECT mp.*, am.model_id, am.name 
FROM model_permissions mp
LEFT JOIN ai_models am ON mp.ai_model_id = am.id
WHERE mp.is_free_for_member = true;

-- 禁用免费配额（取消注释执行）
-- UPDATE model_permissions SET free_daily_limit = 0, is_free_for_member = false;
```

---

## 工作原理

1. 用户请求使用 AI 模型时，系统检查 `legacy_member_expire_at` 字段
2. 如果 `legacy_member_expire_at` 有值且未过期，按老配额给免费次数
3. 如果 `legacy_member_expire_at` 为空或已过期，走正常计费
4. **关键**：即使用户续费延长了 `membership_expire_at`，老特权仍然按 `legacy_member_expire_at` 判断

---

## 常见问题

### Q: 新注册的 VIP/SVIP 会获得免费额度吗？
A: 不会。新用户没有 `legacy_member_expire_at`。

### Q: 老会员续费后还有免费额度吗？
A: 只在 `legacy_member_expire_at` 之前有。续费只延长会员身份，不延长老特权。

### Q: 如何手动给某用户添加老会员特权？
A: 执行：
```sql
UPDATE users SET legacy_member_expire_at = '2025-06-30 23:59:59' WHERE id = '用户ID';
```

### Q: 如何查看某用户的免费额度使用情况？
A: 查询 `daily_usage_records` 表：
```sql
SELECT * FROM daily_usage_records 
WHERE user_id = '用户ID' AND date = CURRENT_DATE;
```
