# Waule 商用版改造文档

## 文档索引

| 文档 | 说明 |
|------|------|
| [01_OVERVIEW.md](./01_OVERVIEW.md) | 项目总览、架构决策、实施顺序 |
| [02_DATABASE_SCHEMA.md](./02_DATABASE_SCHEMA.md) | 数据库扩展（租户、OSS配置） |
| [03_GATEWAY_STRUCTURE.md](./03_GATEWAY_STRUCTURE.md) | Gateway服务结构 |
| [04_TASK_PHASE1.md](./04_TASK_PHASE1.md) | 阶段一：AI服务迁移任务 |
| [05_TASK_PHASE2_3.md](./05_TASK_PHASE2_3.md) | 阶段二三：适配与整合 |
| [06_TASK_PHASE4_COMMERCIAL.md](./06_TASK_PHASE4_COMMERCIAL.md) | 阶段四：商用多租户 |

## 快速开始

### 阶段一执行顺序

```bash
# 1. 创建Gateway服务框架
cd /home/wauleapi/services
mkdir -p gateway/src/{routes/v1,middleware,providers/minimaxi,utils}

# 2. 初始化项目
cd gateway
# 创建 package.json (见 03_GATEWAY_STRUCTURE.md)
npm install

# 3. 逐个迁移服务
# - 见 04_TASK_PHASE1.md 中的 Task 1.2 ~ 1.7

# 4. 创建路由和中间件
# - 见 04_TASK_PHASE1.md 中的 Task 1.8

# 5. 更新Docker配置
# - 见 04_TASK_PHASE1.md 中的 Task 1.10

# 6. 构建测试
docker compose up -d --build
```

## 核心配置

### 环境变量 (.env)

```env
# wauleapi/.env
GATEWAY_PORT=9000
WAULE_API_URL=http://host.docker.internal:3000
INTERNAL_SECRET=your-32-char-secret
JWT_SECRET=same-as-waule

OSS_REGION=oss-accelerate
OSS_BUCKET=your-bucket
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx

CONFIG_ENCRYPTION_KEY=your-32-bytes-hex-key
```

```env
# waule/server/.env 新增
INTERNAL_SECRET=your-32-char-secret
WAULEAPI_URL=http://localhost:9000
AI_SERVICE_MODE=gateway  # 或 direct
```

## 关键架构决策

1. **统一网关**: 所有AI请求经过9000端口
2. **计费方案B**: 网关回调waule主服务`/internal/billing/charge`
3. **OSS双模式**: 
   - PLATFORM: 平台OSS，按目录隔离`/tenants/{id}/`
   - CUSTOM: 租户自有OSS，加密存储配置
4. **设备绑定**: 管理端和用户端首次登录绑定设备指纹

## Cursor使用指南

在Cursor中执行任务时，按以下顺序：

1. 打开对应的任务文档（如 `04_TASK_PHASE1.md`）
2. 按Task编号顺序执行
3. 每完成一个Task进行测试
4. 遇到问题时参考相关文档

### 示例Prompt

```
请按照 /home/wauleapi/docs/04_TASK_PHASE1.md 中的 Task 1.2 
将 /home/waule/server/src/services/ai/doubao.service.ts 
迁移到 /home/wauleapi/services/gateway/src/providers/doubao.ts
```

## 测试检查点

### 阶段一完成标准
- [ ] `curl http://localhost:9000/health` 返回ok
- [ ] `/v1/models` 返回模型列表
- [ ] `/v1/images/generations` 可生成图片
- [ ] `/v1/videos/generations` 可生成视频

### 阶段四完成标准
- [ ] 可创建租户并生成API Key
- [ ] 使用API Key可调用API
- [ ] 租户可配置自有OSS
- [ ] 设备绑定验证有效
