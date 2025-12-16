# 数据库扩展 - 租户与OSS配置

> 在 waule/server/prisma/schema.prisma 中新增以下模型

```prisma
// ============================================
// 商用版 - 租户相关模型
// ============================================

enum OssMode {
  PLATFORM  // 使用平台OSS
  CUSTOM    // 使用自定义OSS
}

// 租户（商用客户）
model Tenant {
  id                  String   @id @default(uuid())
  name                String   // 公司/客户名称
  apiKey              String   @unique  // wk_live_xxx 或 wk_test_xxx
  apiSecret           String   // 加密存储
  credits             Int      @default(0)
  maxSeats            Int      @default(5)
  enabledModels       String[] // 启用的模型ID列表
  isActive            Boolean  @default(true)
  
  // OSS 配置
  ossMode             OssMode  @default(PLATFORM)
  storageUsedBytes    BigInt   @default(0)
  storageQuotaBytes   BigInt?
  
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt
  
  ossConfig           TenantOssConfig?
  admin               TenantAdmin?
  members             TenantMember[]
  usageRecords        TenantUsageRecord[]
  transactions        TenantTransaction[]
  devices             TenantDevice[]
  storageUsages       TenantStorageUsage[]
  
  @@map("tenants")
}

// 租户管理员
model TenantAdmin {
  id              String    @id @default(uuid())
  tenantId        String    @unique
  username        String    @unique
  password        String    // bcrypt加密
  deviceId        String?   // 绑定设备指纹
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
  
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@map("tenant_admins")
}

// 租户成员（用户端）
model TenantMember {
  id              String    @id @default(uuid())
  tenantId        String
  username        String
  password        String    // bcrypt加密
  nickname        String?
  deviceId        String?   // 绑定设备指纹
  isActive        Boolean   @default(true)
  lastLoginAt     DateTime?
  createdAt       DateTime  @default(now())
  
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, username])
  @@map("tenant_members")
}

// 租户自定义OSS配置
model TenantOssConfig {
  id                  String    @id @default(uuid())
  tenantId            String    @unique
  region              String    // oss-cn-beijing
  bucket              String
  accessKeyId         String    // AES加密存储
  accessKeySecret     String    // AES加密存储
  customDomain        String?
  isVerified          Boolean   @default(false)
  lastVerifiedAt      DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  
  tenant              Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@map("tenant_oss_configs")
}

// 租户设备绑定
model TenantDevice {
  id                  String    @id @default(uuid())
  tenantId            String
  deviceFingerprint   String
  deviceType          String    // admin / member
  userId              String    // TenantAdmin或TenantMember的ID
  deviceInfo          Json?     // 设备信息（OS、浏览器等）
  isActive            Boolean   @default(true)
  createdAt           DateTime  @default(now())
  lastSeenAt          DateTime  @default(now())
  
  tenant              Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, deviceFingerprint])
  @@map("tenant_devices")
}

// 租户消费记录
model TenantUsageRecord {
  id              String    @id @default(uuid())
  tenantId        String
  memberId        String?
  modelId         String
  operation       String
  tokens          Int?
  duration        Int?
  quantity        Int?
  creditsCharged  Int
  metadata        Json?
  createdAt       DateTime  @default(now())
  
  @@index([tenantId, createdAt])
  @@map("tenant_usage_records")
}

// 租户交易记录
model TenantTransaction {
  id              String    @id @default(uuid())
  tenantId        String
  type            String    // RECHARGE / CONSUME / SEAT_PURCHASE / STORAGE
  amount          Int
  balance         Int
  description     String
  metadata        Json?
  createdAt       DateTime  @default(now())
  
  @@index([tenantId, createdAt])
  @@map("tenant_transactions")
}

// 租户存储用量（每日）
model TenantStorageUsage {
  id              String    @id @default(uuid())
  tenantId        String
  date            DateTime  @db.Date
  storageBytes    BigInt
  uploadBytes     BigInt    @default(0)
  downloadBytes   BigInt    @default(0)
  fileCount       Int       @default(0)
  storageCredits  Int       @default(0)
  trafficCredits  Int       @default(0)
  createdAt       DateTime  @default(now())
  
  tenant          Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  @@unique([tenantId, date])
  @@map("tenant_storage_usages")
}

// OSS存储计费规则
model StorageBillingRule {
  id              String    @id @default(uuid())
  name            String
  tier1GbPrice    Int       @default(10)  // 0-100GB
  tier1Limit      Int       @default(100)
  tier2GbPrice    Int       @default(8)   // 100-500GB
  tier2Limit      Int       @default(500)
  tier3GbPrice    Int       @default(5)   // 500GB+
  trafficPricePerGb Int     @default(5)
  isActive        Boolean   @default(true)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@map("storage_billing_rules")
}
```

## 迁移命令

```bash
cd /home/waule/server
npx prisma migrate dev --name add_tenant_models
```
