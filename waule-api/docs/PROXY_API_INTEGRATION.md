# 中转API接入指南（Docker 部署版）

适用于使用 Docker 部署的 waule-api，支持 warp 网络环境。

---

## 快速部署步骤

### 1. 复制修改后的文件到服务器

需要修改/新增的文件（共5个）：

```
services/node-gateway/src/
├── db.ts                          # 修改：添加配置表
├── providers/
│   └── future-api.ts              # 新增：中转API Provider
├── routes/
│   ├── proxy-api-config.ts        # 新增：配置管理路由
│   └── v1-images.ts               # 修改：添加通道判断
└── index.ts                       # 修改：注册路由

static/
└── manage.html                    # 修改：添加中转API Tab
```

### 2. 重新构建 Docker

```bash
cd /path/to/waule-api
docker compose build --no-cache
docker compose up -d
```

### 3. 配置中转API

访问管理后台，进入"中转API"Tab进行配置：
- API地址：`https://future-api.vodeshop.com`
- API Key：你的密钥
- 通道：选择"中转API"
- 启用：打勾

---

## 修改详情

### 文件1：db.ts

在 `initDatabase()` 函数中，`config` 表创建后添加：

```typescript
// 中转API配置表
database.exec(`
  CREATE TABLE IF NOT EXISTS proxy_api_config (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    provider TEXT DEFAULT 'future-api',
    base_url TEXT DEFAULT 'https://future-api.vodeshop.com',
    api_key TEXT,
    is_active INTEGER DEFAULT 0,
    model_2k TEXT DEFAULT 'gemini-2.5-flash-image',
    model_4k TEXT DEFAULT 'gemini-2.5-flash-image',
    channel TEXT DEFAULT 'native',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);
database.exec(`INSERT OR IGNORE INTO proxy_api_config (id) VALUES (1)`);
```

在文件末尾添加：

```typescript
// ========== 中转API配置管理 ==========

export interface ProxyApiConfig {
  id: number;
  provider: string;
  base_url: string;
  api_key: string | null;
  is_active: number;
  model_2k: string;
  model_4k: string;
  channel: 'native' | 'proxy';
  created_at: string;
  updated_at: string;
}

export function getProxyApiConfig(): ProxyApiConfig | null {
  const db = getDatabase();
  return db.prepare('SELECT * FROM proxy_api_config WHERE id = 1').get() as ProxyApiConfig | null;
}

export function updateProxyApiConfig(config: Partial<ProxyApiConfig>): boolean {
  const db = getDatabase();
  const fields: string[] = [];
  const values: any[] = [];
  
  if (config.provider !== undefined) { fields.push('provider = ?'); values.push(config.provider); }
  if (config.base_url !== undefined) { fields.push('base_url = ?'); values.push(config.base_url); }
  if (config.api_key !== undefined) { fields.push('api_key = ?'); values.push(config.api_key); }
  if (config.is_active !== undefined) { fields.push('is_active = ?'); values.push(config.is_active); }
  if (config.model_2k !== undefined) { fields.push('model_2k = ?'); values.push(config.model_2k); }
  if (config.model_4k !== undefined) { fields.push('model_4k = ?'); values.push(config.model_4k); }
  if (config.channel !== undefined) { fields.push('channel = ?'); values.push(config.channel); }
  
  if (fields.length === 0) return false;
  fields.push('updated_at = CURRENT_TIMESTAMP');
  
  const stmt = db.prepare(`UPDATE proxy_api_config SET ${fields.join(', ')} WHERE id = 1`);
  return stmt.run(...values).changes > 0;
}
```

---

### 文件2：providers/future-api.ts（新建）

完整内容见：`services/node-gateway/src/providers/future-api.ts`

---

### 文件3：routes/proxy-api-config.ts（新建）

完整内容见：`services/node-gateway/src/routes/proxy-api-config.ts`

---

### 文件4：routes/v1-images.ts

在文件开头添加 import：

```typescript
import * as futureApi from '../providers/future-api';
import { getProxyApiConfig } from '../db';
```

在 `router.post('/generations', ...)` 处理函数中，添加模型判断：

```typescript
// 判断是否使用中转API
function isGemini3ProImageModel(model: string): boolean {
  return model.toLowerCase().includes('gemini-3-pro-image');
}

function shouldUseProxyChannel(model: string): boolean {
  const config = getProxyApiConfig();
  if (!config) return false;
  return isGemini3ProImageModel(model) && 
         config.channel === 'proxy' && 
         config.is_active === 1 && 
         !!config.api_key;
}

// 在路由处理中
if (isGemini3ProImageModel(model)) {
  if (shouldUseProxyChannel(model)) {
    result = await futureApi.generateImage({ model, prompt, size, referenceImages: reference_images });
  } else {
    result = await gemini.generateImage({ model: 'gemini-2.0-flash-exp-image-generation', prompt, size, referenceImages: reference_images });
  }
}
```

---

### 文件5：index.ts

添加 import：

```typescript
import proxyApiConfigRouter from './routes/proxy-api-config';
```

注册路由（在 geminiApp 和 gatewayApp 中都添加）：

```typescript
geminiApp.use('/api/proxy-api-config', cors({ origin: '*' }), proxyApiConfigRouter);
gatewayApp.use('/api/proxy-api-config', proxyApiConfigRouter);
```

---

### 文件6：static/manage.html

**Tab 导航添加：**

```html
<button onclick="switchTab('proxyapi')" id="tabProxyapi" class="tab-btn border-b-2 border-transparent text-sm font-medium py-3 px-1">中转API</button>
```

**面板内容** 和 **JavaScript 函数** 参考当前项目的 `manage.html` 中的实现。

---

## 测试命令

```bash
# 配置中转API
curl -X PUT http://localhost:3100/api/proxy-api-config \
  -H "Content-Type: application/json" \
  -d '{"base_url":"https://future-api.vodeshop.com","api_key":"your-key","channel":"proxy","is_active":1}'

# 测试生成
curl -X POST http://localhost:3100/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-secret" \
  -d '{"model":"gemini-3-pro-image-preview-2k","prompt":"一只猫"}'
```

---

## warp 网络说明

如果使用 warp 网络环境，中转API调用不需要走代理，因为中转API服务器已经在海外。

如果原生 Google API 需要走 warp，确保 `docker-compose.warp.yml` 正确配置了网络。

