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

### 第二步：创建新数据库

```bash
cd waule/server
npx prisma migrate deploy
```

这会创建完整的数据库结构（包括 `legacyMemberExpireAt` 字段）。

### 第三步：恢复数据库备份

将旧平台的数据导入到新数据库（只导入数据，不导入表结构）。

```bash
# 示例：使用 pg_restore 只恢复数据
pg_restore --data-only -d 新数据库名 备份文件.dump
```

或使用其他数据迁移工具导入用户、项目等数据。

### 第四步：设置老会员特权到期日

恢复数据后，执行以下 SQL，将现有 VIP/SVIP 用户的**当前会员到期日**复制到 `legacy_member_expire_at`：

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
