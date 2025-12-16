import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { soraProxyRouter } from './routes/sora-proxy';
import { geminiRouter } from './routes/gemini';
import { geminiKeysRouter } from './routes/gemini-keys';
import providerKeysRouter from './routes/provider-keys';
import platformOssRouter from './routes/platform-oss';
import discordAccountsRouter from './routes/discord-accounts';
import proxyApiConfigRouter from './routes/proxy-api-config';
import v1ImagesRouter from './routes/v1-images';
import v1VideosRouter from './routes/v1-videos';
import v1AudioRouter from './routes/v1-audio';
import v1ChatRouter from './routes/v1-chat';
import v1SoraRouter from './routes/v1-sora';
import v1MidjourneyRouter from './routes/v1-midjourney';
import internalOssRouter from './routes/internal-oss';
import { initDatabase, getConfig, setConfig } from './db';
import { midjourneyService } from './services/midjourney';

dotenv.config();

const app = express();

// ========== 端口配置 ==========
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '9000');
const SORA_PROXY_PORT = parseInt(process.env.SORA_PROXY_PORT || '8001');
const GEMINI_PORT = parseInt(process.env.GEMINI_PORT || '3100');

// ========== 中间件 ==========
app.use(express.json({ limit: '100mb' }));
app.use(cors({ origin: '*' }));

// ========== 日志 ==========
function log(msg: string, data?: any) {
  const time = new Date().toISOString();
  console.log(`[${time}] ${msg}`, data || '');
}

// ========== 健康检查 ==========
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== 路由 ==========
app.use('/v1', soraProxyRouter);
app.use('/api/gemini', geminiRouter);
app.use('/api/gemini-keys', geminiKeysRouter);

// ========== 初始化并启动 ==========
async function start() {
  // 初始化数据库
  initDatabase();
  
  // API 认证中间件（共用）
  const API_SECRET = process.env.API_SECRET;
  const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
    if (!API_SECRET) return next();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== API_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
  };

  // ========== 统一网关 (9000) ==========
  const gatewayApp = express();
  gatewayApp.use(express.json({ limit: '100mb' }));
  gatewayApp.use(cors({ origin: '*' }));
  
  // v1 API 路由（统一的AI服务接口）
  gatewayApp.use('/v1/images', authMiddleware, v1ImagesRouter);
  gatewayApp.use('/v1/videos', authMiddleware, v1VideosRouter);
  gatewayApp.use('/v1/audio', authMiddleware, v1AudioRouter);
  gatewayApp.use('/v1/chat', authMiddleware, v1ChatRouter);
  gatewayApp.use('/v1/sora', v1SoraRouter);
  gatewayApp.use('/v1/midjourney', authMiddleware, v1MidjourneyRouter);
  
  // 管理 API（也挂载到网关）
  gatewayApp.use('/api/gemini-keys', geminiKeysRouter);
  gatewayApp.use('/api/provider-keys', providerKeysRouter);
  gatewayApp.use('/api/platform-oss', platformOssRouter);
  gatewayApp.use('/api/discord-accounts', discordAccountsRouter);
  gatewayApp.use('/api/proxy-api-config', proxyApiConfigRouter);
  gatewayApp.use('/api/gemini', authMiddleware, geminiRouter);
  
  // 内部 API（供 sora-api 调用）
  gatewayApp.use('/internal/oss', internalOssRouter);
  
  // Config API (Midjourney Command ID 等)
  gatewayApp.get('/api/config/:key', (req, res) => {
    const value = getConfig(req.params.key);
    res.json({ key: req.params.key, value });
  });
  gatewayApp.post('/api/config/:key', (req, res) => {
    const { value } = req.body;
    setConfig(req.params.key, value);
    res.json({ success: true, key: req.params.key, value });
  });
  
  gatewayApp.get('/health', (req, res) => res.json({ status: 'ok', service: 'gateway', port: GATEWAY_PORT }));
  
  // 根路径重定向到管理页面
  gatewayApp.get('/', (req, res) => res.redirect('/manage'));
  
  // 代理到 sora-api (8000) - 管理页面和 sora2api 的 API
  const soraApiProxy = createProxyMiddleware({
    target: process.env.SORA_API_URL || 'http://localhost:8000',
    changeOrigin: true,
  });
  
  // 管理页面路由代理到 sora-api（精确匹配，避免循环）
  gatewayApp.get('/manage', soraApiProxy);
  gatewayApp.get('/login', soraApiProxy);
  gatewayApp.use('/static', soraApiProxy);
  // sora-api 的 API 路由代理（tokens, stats, logs 等）
  gatewayApp.use('/api/tokens', soraApiProxy);
  gatewayApp.use('/api/stats', soraApiProxy);
  gatewayApp.use('/api/logs', soraApiProxy);
  gatewayApp.use('/api/login', soraApiProxy);
  gatewayApp.use('/api/token-refresh', soraApiProxy);
  
  gatewayApp.listen(GATEWAY_PORT, () => {
    log(`统一网关已启动`);
    log(`监听端口: ${GATEWAY_PORT}`);
    log(`API Auth: ${API_SECRET ? 'Enabled' : 'Disabled'}`);
  });

  // Sora Proxy 服务 (8001)
  const soraApp = express();
  soraApp.use(express.json({ limit: '100mb' }));
  soraApp.use(cors({ origin: '*' }));
  soraApp.use('/v1', soraProxyRouter);
  // Config API (Midjourney Command ID \u7b49) - \u4e5f\u6302\u8f7d\u5230 Sora Proxy \u7aef\u53e3
  soraApp.get('/api/config/:key', (req, res) => {
    const value = getConfig(req.params.key);
    res.json({ key: req.params.key, value });
  });
  soraApp.post('/api/config/:key', (req, res) => {
    const { value } = req.body;
    setConfig(req.params.key, value);
    res.json({ success: true, key: req.params.key, value });
  });
  soraApp.get('/health', (req, res) => res.json({ status: 'ok', service: 'sora-proxy' }));
  
  soraApp.listen(SORA_PROXY_PORT, () => {
    log(`Sora Proxy 服务已启动`);
    log(`监听端口: ${SORA_PROXY_PORT}`);
  });

  // ========== Gemini 服务 (3100) - 兼容旧接口 ==========
  const geminiApp = express();
  geminiApp.use(express.json({ limit: '50mb' }));
  
  // gemini-keys 管理API（兼容旧接口）
  geminiApp.use('/api/gemini-keys', cors({ origin: '*' }), geminiKeysRouter);
  // provider-keys 管理API（新接口：统一管理所有供应商API Key）
  geminiApp.use('/api/provider-keys', cors({ origin: '*' }), providerKeysRouter);
  // platform-oss 管理API（平台OSS配置）
  geminiApp.use('/api/platform-oss', cors({ origin: '*' }), platformOssRouter);
  // discord-accounts 管理API（Midjourney Discord账号）
  geminiApp.use('/api/discord-accounts', cors({ origin: '*' }), discordAccountsRouter);
  // proxy-api-config 管理API（中转API配置）
  geminiApp.use('/api/proxy-api-config', cors({ origin: '*' }), proxyApiConfigRouter);
  // Config API (Midjourney Command ID 等)
  geminiApp.get('/api/config/:key', cors({ origin: '*' }), (req, res) => {
    const value = getConfig(req.params.key);
    res.json({ key: req.params.key, value });
  });
  geminiApp.post('/api/config/:key', cors({ origin: '*' }), (req, res) => {
    const { value } = req.body;
    setConfig(req.params.key, value);
    res.json({ success: true, key: req.params.key, value });
  });
  // gemini 生成API使用配置的来源限制
  geminiApp.use('/api/gemini', cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }), authMiddleware, geminiRouter);
  
  // v1 API 路由（统一的AI服务接口）
  geminiApp.use('/v1/images', cors({ origin: '*' }), authMiddleware, v1ImagesRouter);
  geminiApp.use('/v1/videos', cors({ origin: '*' }), authMiddleware, v1VideosRouter);
  geminiApp.use('/v1/audio', cors({ origin: '*' }), authMiddleware, v1AudioRouter);
  geminiApp.use('/v1/chat', cors({ origin: '*' }), authMiddleware, v1ChatRouter);
  geminiApp.use('/v1/sora', cors({ origin: '*' }), v1SoraRouter); // sora使用自己的认证（sora2api的key）
  geminiApp.use('/v1/midjourney', cors({ origin: '*' }), authMiddleware, v1MidjourneyRouter);
  
  geminiApp.get('/health', cors({ origin: '*' }), (req, res) => res.json({ status: 'ok', service: 'gemini' }));
  
  geminiApp.listen(GEMINI_PORT, () => {
    log(`Gemini 服务已启动`);
    log(`监听端口: ${GEMINI_PORT}`);
    log(`API Auth: ${API_SECRET ? 'Enabled' : 'Disabled'}`);
  });

  // 启动Midjourney服务
  midjourneyService.initialize().then(() => {
    const status = midjourneyService.getStatus();
    if (status.ready > 0) {
      log(`Midjourney服务已启动: ${status.ready}/${status.total} 个账号已连接`);
    }
  }).catch((err) => {
    log(`Midjourney服务启动失败: ${err.message}`);
  });

  log('====================================');
  log('WauleAPI Gateway 启动完成');
  log('====================================');
}

start().catch(console.error);
