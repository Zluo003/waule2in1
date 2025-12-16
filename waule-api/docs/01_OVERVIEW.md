# Waule 商用版改造 - 总览

## 核心决策

| 决策项 | 选择 |
|--------|------|
| 计费方案 | **方案B** - 网关回调waule主服务API |
| OSS方案 | 双模式 - 平台OSS / 租户自有OSS |
| 统一端口 | 9000 |

## 实施顺序

```
阶段一 (2-3周): AI服务迁移到wauleapi
    ↓
阶段二 (1周): waule主服务适配（调用网关）
    ↓
阶段三 (1周): 管理后台整合
    ↓
阶段四 (2-3周): 商用版多租户
```

## 架构图

```
用户/租户
    │
    ▼
┌─────────────────────────────────┐
│  wauleapi 统一网关 (9000)       │
│  ├─ 认证层 (JWT/API Key)        │
│  ├─ 计费层 (回调waule)          │
│  ├─ OSS层 (多租户隔离)          │
│  └─ AI服务层                    │
│     ├─ Doubao                   │
│     ├─ Wanx                     │
│     ├─ Vidu                     │
│     ├─ MiniMaxi                 │
│     ├─ Sora                     │
│     ├─ Gemini                   │
│     └─ CosyVoice                │
└────────────┬────────────────────┘
             │ /internal/billing/charge
             ▼
┌─────────────────────────────────┐
│  waule 主服务 (3000)            │
│  ├─ 用户管理                    │
│  ├─ 租户管理                    │
│  ├─ 计费逻辑                    │
│  └─ PostgreSQL                  │
└─────────────────────────────────┘
```

## 待迁移服务清单

| 服务 | 源文件 | 状态 |
|------|--------|------|
| Sora | sora.service.ts | ✅ 已有 (Python) |
| Gemini | gemini.service.ts | ✅ 已有 (Node) |
| Doubao | doubao.service.ts | ❌ 待迁移 |
| Wanx | wanx.service.ts | ❌ 待迁移 |
| Vidu | vidu.service.ts | ❌ 待迁移 |
| MiniMaxi | minimaxi.*.service.ts | ❌ 待迁移 |
| CosyVoice | cosyvoice.service.ts | ❌ 待迁移 |
| Aliyun | aliyun.service.ts | ❌ 待迁移 |
