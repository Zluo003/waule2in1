/**
 * 管理页面路由
 * 提供配置管理的 Web 界面（带密码保护）
 */
import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { 
  getAllConfig, 
  saveConfig, 
  isAppConfigured, 
  getAppConfig,
  hasAdminPassword,
  setAdminPassword,
  verifyAdminPassword,
  changeAdminPassword,
  generateSessionToken,
  saveSessionToken,
  verifySessionToken,
  clearSessionToken,
  getAllClientConfigs,
  setConfigValue,
} from '../services/database.service';
import { storageService } from '../services/storage.service';
import logger from '../utils/logger';
import { getDeviceId } from '../utils/deviceId';

const router = Router();

/**
 * 获取本机 IP 地址
 */
function getLocalIP(): string {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * 从请求中获取会话令牌
 */
function getSessionTokenFromRequest(req: Request): string | null {
  // 优先从 cookie 获取
  const cookies = req.headers.cookie?.split(';').reduce((acc, c) => {
    const [key, val] = c.trim().split('=');
    acc[key] = val;
    return acc;
  }, {} as Record<string, string>) || {};
  
  if (cookies['admin_session']) {
    return cookies['admin_session'];
  }
  
  // 从 Authorization header 获取
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  
  return null;
}

/**
 * 验证管理员身份中间件
 */
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // 如果还没设置密码，跳过验证（需要先设置密码）
  if (!hasAdminPassword()) {
    return next();
  }
  
  const token = getSessionTokenFromRequest(req);
  if (!token || !verifySessionToken(token)) {
    res.status(401).json({ success: false, error: '未登录或会话已过期', needLogin: true });
    return;
  }
  
  next();
}

// ==================== 公开接口（无需认证） ====================

/**
 * 检查是否需要设置密码
 * GET /admin/api/auth/status
 */
router.get('/api/auth/status', (req: Request, res: Response) => {
  const needSetPassword = !hasAdminPassword();
  const token = getSessionTokenFromRequest(req);
  const isLoggedIn = token ? verifySessionToken(token) : false;
  
  res.json({
    success: true,
    needSetPassword,
    isLoggedIn,
  });
});

/**
 * 首次设置管理员密码
 * POST /admin/api/auth/setup
 */
router.post('/api/auth/setup', (req: Request, res: Response) => {
  try {
    const { password, confirmPassword } = req.body;
    
    if (hasAdminPassword()) {
      return res.status(400).json({ success: false, error: '管理员密码已设置' });
    }
    
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, error: '密码长度不能少于6位' });
    }
    
    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, error: '两次输入的密码不一致' });
    }
    
    setAdminPassword(password);
    
    // 设置成功后自动登录
    const token = generateSessionToken();
    saveSessionToken(token);
    
    res.setHeader('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; Max-Age=${24 * 60 * 60}`);
    
    logger.info('管理员密码已设置');
    
    res.json({ success: true, message: '密码设置成功' });
  } catch (error: any) {
    logger.error(`设置密码失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 管理员登录
 * POST /admin/api/auth/login
 */
router.post('/api/auth/login', (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    
    if (!hasAdminPassword()) {
      return res.status(400).json({ success: false, error: '请先设置管理员密码', needSetPassword: true });
    }
    
    if (!verifyAdminPassword(password)) {
      return res.status(401).json({ success: false, error: '密码错误' });
    }
    
    const token = generateSessionToken();
    saveSessionToken(token);
    
    res.setHeader('Set-Cookie', `admin_session=${token}; Path=/; HttpOnly; Max-Age=${24 * 60 * 60}`);
    
    logger.info('管理员登录成功');
    
    res.json({ success: true, message: '登录成功' });
  } catch (error: any) {
    logger.error(`登录失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 管理员登出
 * POST /admin/api/auth/logout
 */
router.post('/api/auth/logout', (req: Request, res: Response) => {
  clearSessionToken();
  // 同时清除两个路径的 cookie，确保完全登出
  res.setHeader('Set-Cookie', [
    `admin_session=; Path=/; HttpOnly; Max-Age=0`,
    `admin_session=; Path=/admin; HttpOnly; Max-Age=0`,
  ]);
  res.json({ success: true, message: '已登出' });
});

/**
 * 强制登出（GET 方式，方便直接在浏览器访问）
 * GET /admin/api/auth/force-logout
 */
router.get('/api/auth/force-logout', (req: Request, res: Response) => {
  clearSessionToken();
  // 同时清除两个路径的 cookie，确保完全登出
  res.setHeader('Set-Cookie', [
    `admin_session=; Path=/; HttpOnly; Max-Age=0`,
    `admin_session=; Path=/admin; HttpOnly; Max-Age=0`,
  ]);
  res.redirect('/admin');
});

/**
 * 调试端点 - 查看当前认证状态
 * GET /admin/api/debug
 */
router.get('/api/debug', (req: Request, res: Response) => {
  const needSetPassword = !hasAdminPassword();
  const token = getSessionTokenFromRequest(req);
  const tokenValid = token ? verifySessionToken(token) : false;
  
  res.json({
    hasPassword: hasAdminPassword(),
    needSetPassword,
    receivedToken: token ? token.substring(0, 10) + '...' : null,
    tokenValid,
    isLoggedIn: tokenValid, // 只有 token 验证通过才算已登录
    cookies: req.headers.cookie,
  });
});

/**
 * 通过 API Key 重置密码
 * POST /admin/api/auth/reset-password
 */
router.post('/api/auth/reset-password', async (req: Request, res: Response) => {
  try {
    const { apiKey, newPassword } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ success: false, error: '请输入 API Key' });
    }
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: '新密码长度不能少于6位' });
    }
    
    // 获取已配置的 API Key
    const config = getAllConfig();
    
    if (!config.tenantApiKey) {
      return res.status(400).json({ success: false, error: '服务端尚未配置，无法验证' });
    }
    
    // 验证 API Key
    if (apiKey !== config.tenantApiKey) {
      return res.status(401).json({ success: false, error: 'API Key 不正确' });
    }
    
    // 验证通过，重置密码
    // 先清除旧密码，再设置新密码
    setConfigValue('adminPassword', '');
    setAdminPassword(newPassword);
    
    // 清除会话
    clearSessionToken();
    
    logger.info('管理员密码已通过 API Key 验证重置');
    
    res.json({ success: true, message: '密码重置成功' });
  } catch (error: any) {
    logger.error(`重置密码失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 管理页面
 * GET /admin
 */
router.get('/', (req: Request, res: Response) => {
  const config = getAllConfig();
  const localIP = getLocalIP();
  const isConfigured = isAppConfigured();
  const needSetPassword = !hasAdminPassword();
  const token = getSessionTokenFromRequest(req);
  // 修复：只有 token 验证通过才算已登录，没设置密码时也不算已登录
  const isLoggedIn = token ? verifySessionToken(token) : false;
  
  console.log('[Admin] 页面访问 - needSetPassword:', needSetPassword, 'token:', token?.substring(0, 10), 'isLoggedIn:', isLoggedIn);
  
  res.send(getAdminPageHTML(config, localIP, isConfigured, needSetPassword, isLoggedIn));
});

// ==================== 需要认证的接口 ====================

/**
 * 获取配置 API
 * GET /admin/api/config
 */
router.get('/api/config', requireAuth, (req: Request, res: Response) => {
  const config = getAllConfig();
  res.json({
    success: true,
    config: {
      storagePath: config.storagePath,
      platformServerUrl: config.platformServerUrl,
      tenantApiKey: config.tenantApiKey ? '***' + config.tenantApiKey.slice(-8) : '',
      isConfigured: config.isConfigured,
    },
  });
});

/**
 * 保存配置 API
 * POST /admin/api/config
 * 安全措施：
 * 1. 保存前必须验证 API Key 有效性
 * 2. 首次配置时激活 API Key 并绑定设备（只能激活一次）
 */
router.post('/api/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const { storagePath, platformServerUrl, tenantApiKey: inputApiKey } = req.body;
    
    // 验证必填项
    if (!platformServerUrl) {
      return res.status(400).json({ success: false, error: '平台地址不能为空' });
    }
    
    // 获取当前配置
    const currentConfig = getAllConfig();
    
    // API Key: 如果输入为空，使用已保存的；首次配置必须提供
    const tenantApiKey = inputApiKey || currentConfig.tenantApiKey;
    if (!tenantApiKey) {
      return res.status(400).json({ success: false, error: 'API Key 不能为空' });
    }
    
    const cleanUrl = platformServerUrl.replace(/\/+$/, '');
    const deviceId = getDeviceId();
    
    // 判断是否为首次配置（或更换了 API Key）
    const isFirstConfig = !currentConfig.isConfigured || (inputApiKey && currentConfig.tenantApiKey !== inputApiKey);
    
    if (isFirstConfig) {
      // 【首次配置】调用激活接口，绑定设备
      try {
        const activateResponse = await axios.post(
          `${cleanUrl}/api/client/activate-server`,
          { deviceId },
          {
            headers: {
              'X-Tenant-API-Key': tenantApiKey,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );
        
        if (!activateResponse.data?.success) {
          return res.status(400).json({ 
            success: false, 
            error: activateResponse.data?.message || 'API Key 激活失败' 
          });
        }
        
        logger.info(`API Key 激活成功: ${activateResponse.data?.data?.tenantName || '未知租户'}`);
        
      } catch (activateError: any) {
        const status = activateError.response?.status;
        const data = activateError.response?.data;
        let errorMessage = '保存失败：API Key 激活失败';
        
        if (status === 401) {
          errorMessage = '保存失败：API Key 无效或已过期';
        } else if (status === 403 && data?.alreadyActivated) {
          errorMessage = '保存失败：此 API Key 已被其他设备激活，无法使用。如需更换设备，请联系管理员重置。';
        } else if (status === 404) {
          errorMessage = '保存失败：平台地址不正确';
        } else if (activateError.code === 'ECONNREFUSED') {
          errorMessage = '保存失败：无法连接到平台服务器';
        } else if (activateError.code === 'ENOTFOUND') {
          errorMessage = '保存失败：平台地址无法解析';
        } else if (data?.message) {
          errorMessage = `保存失败：${data.message}`;
        }
        
        logger.warn(`配置保存被拒绝: ${errorMessage}`);
        return res.status(400).json({ success: false, error: errorMessage });
      }
    } else {
      // 【非首次配置】验证 API Key 和设备
      try {
        const verifyResponse = await axios.post(
          `${cleanUrl}/api/client/verify-api-key`,
          {},
          {
            headers: {
              'X-Tenant-API-Key': tenantApiKey,
              'X-Device-Id': deviceId,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );
        
        if (!verifyResponse.data?.success) {
          return res.status(400).json({ success: false, error: 'API Key 验证失败，请检查配置' });
        }
        
        logger.info('API Key 验证通过');
      } catch (verifyError: any) {
        const status = verifyError.response?.status;
        const data = verifyError.response?.data;
        let errorMessage = '保存失败：API Key 验证不通过';
        
        if (status === 401) {
          if (data?.deviceMismatch) {
            errorMessage = '保存失败：API Key 已绑定其他设备，无法在此设备使用';
          } else {
            errorMessage = '保存失败：API Key 无效或已过期';
          }
        } else if (status === 404) {
          errorMessage = '保存失败：平台地址不正确';
        } else if (verifyError.code === 'ECONNREFUSED') {
          errorMessage = '保存失败：无法连接到平台服务器';
        } else if (verifyError.code === 'ENOTFOUND') {
          errorMessage = '保存失败：平台地址无法解析';
        }
        
        logger.warn(`配置保存被拒绝: ${errorMessage}`);
        return res.status(400).json({ success: false, error: errorMessage });
      }
    }
    
    // 验证/激活通过，保存配置
    saveConfig({
      storagePath: storagePath || './data/storage',
      platformServerUrl: cleanUrl,
      tenantApiKey,
      isConfigured: true,
    });
    
    logger.info('配置已保存（已通过安全验证）');
    
    res.json({ success: true, message: '配置保存成功' });
  } catch (error: any) {
    logger.error(`保存配置失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 测试平台连接 API
 * POST /admin/api/test-connection
 */
router.post('/api/test-connection', requireAuth, async (req: Request, res: Response) => {
  try {
    const { platformServerUrl, tenantApiKey: inputApiKey } = req.body;
    
    if (!platformServerUrl) {
      return res.status(400).json({ success: false, error: '请填写平台地址' });
    }
    
    // API Key: 如果输入为空，使用已保存的
    const currentConfig = getAllConfig();
    const tenantApiKey = inputApiKey || currentConfig.tenantApiKey;
    
    if (!tenantApiKey) {
      return res.status(400).json({ success: false, error: '请填写 API Key' });
    }
    
    // 测试连接 - 使用专用的 API Key 验证接口
    const response = await axios.post(
      `${platformServerUrl}/api/client/verify-api-key`,
      {},
      {
        headers: {
          'X-Tenant-API-Key': tenantApiKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    
    const data = response.data?.data || response.data;
    
    res.json({
      success: true,
      message: '连接成功！',
      tenant: {
        name: data?.tenant?.name || data?.user?.tenant?.name || '未知租户',
        credits: data?.tenant?.credits || data?.user?.tenant?.credits || 0,
      },
    });
  } catch (error: any) {
    const status = error.response?.status;
    let errorMessage = '连接失败';
    
    if (status === 401) {
      errorMessage = 'API Key 无效，请检查是否正确';
    } else if (status === 404) {
      errorMessage = '接口不存在，请检查平台地址是否正确';
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = '无法连接到平台服务器，请检查地址是否正确';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = '域名解析失败，请检查平台地址是否正确';
    } else {
      errorMessage = error.message || '连接失败';
    }
    
    res.status(400).json({ success: false, error: errorMessage });
  }
});

/**
 * 获取存储统计 API
 * GET /admin/api/storage-stats
 */
router.get('/api/storage-stats', requireAuth, (req: Request, res: Response) => {
  try {
    const stats = storageService.getStorageStats();
    res.json({
      success: true,
      stats: {
        totalFiles: stats.totalFiles,
        totalSize: formatBytes(stats.totalSize),
        uploadsSize: formatBytes(stats.uploadsSize),
        resultsSize: formatBytes(stats.resultsSize),
      },
    });
  } catch (error: any) {
    res.json({
      success: true,
      stats: { totalFiles: 0, totalSize: '0 B', uploadsSize: '0 B', resultsSize: '0 B' },
    });
  }
});

/**
 * 修改管理员密码
 * POST /admin/api/auth/change-password
 */
router.post('/api/auth/change-password', requireAuth, (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword, confirmPassword } = req.body;
    
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ success: false, error: '请填写完整信息' });
    }
    
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: '新密码长度不能少于6位' });
    }
    
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ success: false, error: '两次输入的新密码不一致' });
    }
    
    if (!changeAdminPassword(oldPassword, newPassword)) {
      return res.status(401).json({ success: false, error: '原密码错误' });
    }
    
    // 清除当前会话，要求重新登录
    clearSessionToken();
    res.setHeader('Set-Cookie', [
      `admin_session=; Path=/; HttpOnly; Max-Age=0`,
      `admin_session=; Path=/admin; HttpOnly; Max-Age=0`,
    ]);
    
    logger.info('管理员密码已修改');
    
    res.json({ success: true, message: '密码修改成功，请重新登录' });
  } catch (error: any) {
    logger.error(`修改密码失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取已连接的客户端列表
 * GET /admin/api/clients
 */
router.get('/api/clients', requireAuth, (req: Request, res: Response) => {
  try {
    const clients = getAllClientConfigs();
    res.json({ success: true, data: clients });
  } catch (error: any) {
    logger.error(`获取客户端列表失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 生成管理页面 HTML - 横屏布局，Tab 分组
 */
function getAdminPageHTML(config: any, localIP: string, isConfigured: boolean, needSetPassword: boolean, isLoggedIn: boolean): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Waule 企业版服务端</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
      color: #e0e0e0;
      display: flex;
      flex-direction: column;
    }
    /* Electron 标题栏 */
    .electron-titlebar {
      display: flex;
      height: 32px;
      min-height: 32px;
      background: rgba(0, 0, 0, 0.3);
      -webkit-app-region: drag;
      padding-left: 12px;
      align-items: center;
    }
    .electron-titlebar.hidden { display: none; }
    .traffic-lights { display: flex; gap: 8px; -webkit-app-region: no-drag; }
    .traffic-light {
      width: 12px; height: 12px; border-radius: 50%; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }
    .traffic-light.close { background: #ff5f57; }
    .traffic-light.minimize { background: #ffbd2e; }
    .traffic-light.maximize { background: #28c840; }
    .traffic-light svg { width: 6px; height: 6px; opacity: 0; }
    .traffic-lights:hover .traffic-light svg { opacity: 0.6; }
    .titlebar-title { flex: 1; text-align: center; font-size: 13px; color: rgba(255,255,255,0.7); margin-right: 60px; }
    
    /* 主布局 - 横向 */
    .main-layout { display: flex; flex: 1; overflow: hidden; }
    
    /* 左侧边栏 */
    .sidebar {
      width: 180px; min-width: 180px;
      background: rgba(0,0,0,0.2);
      border-right: 1px solid rgba(255,255,255,0.1);
      display: flex; flex-direction: column;
      padding: 16px 0;
    }
    .sidebar-header {
      padding: 0 16px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 8px;
    }
    .sidebar-header h1 { font-size: 14px; color: #fff; display: flex; align-items: center; gap: 8px; }
    .sidebar-header .status {
      font-size: 11px; margin-top: 8px;
      padding: 4px 8px; border-radius: 10px; display: inline-flex; align-items: center; gap: 4px;
    }
    .sidebar-header .status.ok { background: rgba(46,204,113,0.2); color: #2ecc71; }
    .sidebar-header .status.warn { background: rgba(241,196,15,0.2); color: #f1c40f; }
    .status-dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
    
    /* Tab 导航 */
    .nav-tabs { flex: 1; }
    .nav-tab {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 16px; cursor: pointer;
      color: #888; font-size: 13px;
      border-left: 3px solid transparent;
      transition: all 0.15s;
    }
    .nav-tab:hover { background: rgba(255,255,255,0.05); color: #fff; }
    .nav-tab.active { background: rgba(52,152,219,0.1); color: #3498db; border-left-color: #3498db; }
    .nav-tab svg { width: 16px; height: 16px; }
    
    /* 退出按钮 */
    .nav-logout {
      margin: 8px 12px; padding: 8px 12px;
      background: rgba(231,76,60,0.15); border: 1px solid rgba(231,76,60,0.2);
      color: #e74c3c; border-radius: 6px; cursor: pointer;
      font-size: 12px; display: flex; align-items: center; gap: 6px; justify-content: center;
    }
    .nav-logout:hover { background: rgba(231,76,60,0.25); }
    
    /* 内容区域 */
    .content { flex: 1; overflow: hidden; padding: 20px; display: flex; flex-direction: column; }
    .tab-panel { display: none; flex: 1; overflow: hidden; }
    .tab-panel.active { display: flex; flex-direction: column; }
    
    /* 卡片 */
    .card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 16px;
      backdrop-filter: blur(10px);
    }
    .card-title { font-size: 13px; font-weight: 600; color: #fff; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
    
    /* 信息网格 - 紧凑 */
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .info-item { background: rgba(0,0,0,0.2); padding: 10px; border-radius: 6px; }
    .info-item .label { font-size: 11px; color: #888; margin-bottom: 2px; }
    .info-item .value { font-size: 12px; color: #fff; font-family: monospace; word-break: break-all; }
    .info-item .value.hl { color: #3498db; }
    
    /* 统计网格 */
    .stats-row { display: flex; gap: 12px; margin-top: 12px; }
    .stat-box { flex: 1; text-align: center; background: rgba(0,0,0,0.2); padding: 12px 8px; border-radius: 6px; }
    .stat-box .val { font-size: 18px; font-weight: 600; color: #3498db; }
    .stat-box .lbl { font-size: 10px; color: #888; margin-top: 2px; }
    
    /* 表单 - 紧凑 */
    .form-row { display: flex; gap: 12px; margin-bottom: 12px; }
    .form-row .form-group { flex: 1; }
    .form-group { margin-bottom: 12px; }
    .form-group label { display: block; font-size: 11px; color: #aaa; margin-bottom: 4px; }
    .form-group input {
      width: 100%; padding: 8px 10px;
      border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
      background: rgba(0,0,0,0.3); color: #fff; font-size: 12px;
    }
    .form-group input:focus { outline: none; border-color: #3498db; }
    .form-group input::placeholder { color: #555; }
    .form-group .hint { font-size: 10px; color: #555; margin-top: 3px; }
    
    /* 按钮 - 紧凑 */
    .btn {
      padding: 8px 16px; border: none; border-radius: 6px;
      font-size: 12px; font-weight: 500; cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px;
    }
    .btn-primary { background: linear-gradient(135deg, #3498db, #2980b9); color: #fff; }
    .btn-primary:hover { box-shadow: 0 2px 8px rgba(52,152,219,0.4); }
    .btn-secondary { background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-group { display: flex; gap: 8px; margin-top: 12px; }
    
    /* 提示 */
    .alert {
      padding: 8px 12px; border-radius: 6px; margin-bottom: 12px;
      display: none; align-items: center; gap: 6px; font-size: 12px;
    }
    .alert.success { background: rgba(46,204,113,0.2); border: 1px solid rgba(46,204,113,0.3); color: #2ecc71; }
    .alert.error { background: rgba(231,76,60,0.2); border: 1px solid rgba(231,76,60,0.3); color: #e74c3c; }
    .alert.show { display: flex; }
    
    .spinner { width: 12px; height: 12px; border: 2px solid transparent; border-top-color: currentColor; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    
    /* 使用说明 */
    .tips { font-size: 11px; color: #888; line-height: 1.6; }
    .tips p { margin-bottom: 4px; }
    .tips strong { color: #3498db; }
    
    /* 登录遮罩 */
    .auth-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0,0,0,0.85); backdrop-filter: blur(10px);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .auth-card {
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; padding: 24px; width: 320px; backdrop-filter: blur(10px);
    }
    .auth-card h2 { text-align: center; margin-bottom: 6px; color: #fff; font-size: 16px; }
    .auth-card .subtitle { text-align: center; color: #888; font-size: 12px; margin-bottom: 16px; }
    .hidden { display: none !important; }
    body.no-titlebar .electron-titlebar { display: none; }
  </style>
</head>
<body>
  <!-- Electron 标题栏 -->
  <div id="electronTitlebar" class="electron-titlebar">
    <div class="traffic-lights">
      <div class="traffic-light close" onclick="window.electronAPI?.windowClose()">
        <svg viewBox="0 0 6 6" fill="currentColor"><path d="M0 0h1.5v1.5H0zM4.5 0H6v1.5H4.5zM0 4.5h1.5V6H0zM4.5 4.5H6V6H4.5z"/></svg>
      </div>
      <div class="traffic-light minimize" onclick="window.electronAPI?.windowMinimize()">
        <svg viewBox="0 0 6 6" fill="currentColor"><rect y="2.5" width="6" height="1"/></svg>
      </div>
      <div class="traffic-light maximize" onclick="window.electronAPI?.windowMaximize()">
        <svg viewBox="0 0 6 6" fill="currentColor"><path d="M0 0v6h6V0H0zm5 5H1V1h4v4z"/></svg>
      </div>
    </div>
    <div class="titlebar-title">Waule 企业版服务端</div>
  </div>

  <!-- 登录/设置密码界面 -->
  <div id="authOverlay" class="auth-overlay ${isLoggedIn ? 'hidden' : ''}">
    <div id="setupForm" class="auth-card ${needSetPassword ? '' : 'hidden'}">
      <h2>🔐 设置管理密码</h2>
      <p class="subtitle">首次使用，请设置管理员密码</p>
      <div id="setupAlert" class="alert"></div>
      <div class="form-group">
        <label>设置密码</label>
        <input type="password" id="setupPassword" placeholder="请输入密码（至少6位）">
      </div>
      <div class="form-group">
        <label>确认密码</label>
        <input type="password" id="setupConfirmPassword" placeholder="请再次输入密码">
      </div>
      <button class="btn btn-primary" style="width:100%;" onclick="handleSetup()"><span id="setupBtnText">设置密码并进入</span></button>
    </div>
    <div id="loginForm" class="auth-card ${needSetPassword ? 'hidden' : ''}">
      <h2>🔐 管理员登录</h2>
      <p class="subtitle">请输入管理密码以访问控制台</p>
      <div id="loginAlert" class="alert"></div>
      <div class="form-group">
        <label>管理密码</label>
        <input type="password" id="loginPassword" placeholder="请输入管理密码" onkeydown="if(event.key==='Enter')handleLogin()">
      </div>
      <button class="btn btn-primary" style="width:100%;" onclick="handleLogin()"><span id="loginBtnText">登 录</span></button>
      <p style="margin-top:12px;font-size:11px;color:#666;text-align:center;"><a href="javascript:void(0)" onclick="showResetForm()" style="color:#3498db;text-decoration:none;">忘记密码？</a></p>
    </div>
    <div id="resetForm" class="auth-card hidden">
      <h2>🔑 重置密码</h2>
      <p class="subtitle">输入租户 API Key 验证身份</p>
      <div id="resetAlert" class="alert"></div>
      <div class="form-group">
        <label>租户 API Key</label>
        <input type="text" id="resetApiKey" placeholder="wk_live_xxxxxxxx" style="font-family:monospace;">
      </div>
      <div class="form-group">
        <label>新密码</label>
        <input type="password" id="resetNewPassword" placeholder="请输入新密码（至少6位）">
      </div>
      <div class="form-group">
        <label>确认新密码</label>
        <input type="password" id="resetConfirmPassword" placeholder="请再次输入新密码">
      </div>
      <button class="btn btn-primary" style="width:100%;" onclick="handleResetPassword()"><span id="resetBtnText">重置密码</span></button>
      <p style="margin-top:12px;font-size:11px;color:#666;text-align:center;"><a href="javascript:void(0)" onclick="showLoginForm()" style="color:#3498db;text-decoration:none;">返回登录</a></p>
    </div>
  </div>

  <!-- 主布局 -->
  <div class="main-layout">
    <!-- 左侧边栏 -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>🖥️ 企业版服务端</h1>
        <div class="status ${isConfigured ? 'ok' : 'warn'}">
          <span class="status-dot"></span>
          ${isConfigured ? '运行中' : '未配置'}
        </div>
      </div>
      <div class="nav-tabs">
        <div class="nav-tab active" onclick="switchTab('info')">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          服务信息
        </div>
        <div class="nav-tab" onclick="switchTab('config')">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          平台配置
        </div>
        <div class="nav-tab" onclick="switchTab('help')">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          使用说明
        </div>
      </div>
      <button class="nav-logout" onclick="handleLogout()">🚪 退出登录</button>
    </div>

    <!-- 内容区 -->
    <div class="content">
      <!-- 服务信息 Tab -->
      <div id="tab-info" class="tab-panel active">
        <div class="card" style="margin-bottom:16px;">
          <div class="card-title">📡 服务地址</div>
          <div class="info-grid">
            <div class="info-item">
              <div class="label">本地访问</div>
              <div class="value">http://localhost:${config.port}</div>
            </div>
            <div class="info-item">
              <div class="label">内网访问（客户端配置此地址）</div>
              <div class="value hl">http://${localIP}:${config.port}</div>
            </div>
            <div class="info-item">
              <div class="label">文件访问</div>
              <div class="value">http://${localIP}:${config.port}/files</div>
            </div>
            <div class="info-item">
              <div class="label">存储路径</div>
              <div class="value">${config.storagePath}</div>
            </div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">📊 存储统计</div>
          <div class="stats-row">
            <div class="stat-box"><div class="val" id="totalFiles">-</div><div class="lbl">总文件数</div></div>
            <div class="stat-box"><div class="val" id="totalSize">-</div><div class="lbl">总大小</div></div>
            <div class="stat-box"><div class="val" id="uploadsSize">-</div><div class="lbl">上传素材</div></div>
            <div class="stat-box"><div class="val" id="resultsSize">-</div><div class="lbl">AI 结果</div></div>
          </div>
        </div>
      </div>

      <!-- 平台配置 Tab -->
      <div id="tab-config" class="tab-panel">
        <div class="card">
          <div class="card-title">⚙️ 平台连接配置</div>
          <div id="alertBox" class="alert"></div>
          <form id="configForm" autocomplete="off">
            <!-- 隐藏的假输入框，用于欺骗浏览器自动填充 -->
            <input type="text" name="fake_user" style="display:none;">
            <input type="password" name="fake_pass" style="display:none;">
            <div class="form-row">
              <div class="form-group">
                <label>平台服务端地址 *</label>
                <input type="text" id="platformServerUrl" name="server_url_${Date.now()}" value="${config.platformServerUrl}" placeholder="https://api.example.com" required autocomplete="new-password">
                <div class="hint">Waule 平台 API 地址</div>
              </div>
              <div class="form-group">
                <label>租户 API Key *</label>
                <input type="text" id="tenantApiKey" name="api_key_${Date.now()}" value="" placeholder="${config.tenantApiKey ? '已配置 (***' + config.tenantApiKey.slice(-8) + ')' : 'wk_live_xxxxxxxx'}" ${config.tenantApiKey ? '' : 'required'} autocomplete="new-password" readonly onfocus="this.removeAttribute('readonly');">
                <div class="hint">${config.tenantApiKey ? '留空保持原配置，输入新值则更新' : '格式为 wk_live_xxx'}</div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group" style="flex: 1;">
                <label>本地存储路径</label>
                <input type="text" id="storagePath" value="${config.storagePath}" placeholder="D:/waule/data">
                <div class="hint">AI 生成文件保存位置</div>
              </div>
            </div>
            <div class="btn-group">
              <button type="button" class="btn btn-secondary" onclick="testConnection()"><span id="testBtnText">🔗 测试连接</span></button>
              <button type="submit" class="btn btn-primary"><span id="saveBtnText">💾 保存配置</span></button>
            </div>
          </form>
        </div>
      </div>

      <!-- 使用说明 Tab -->
      <div id="tab-help" class="tab-panel">
        <div class="card">
          <div class="card-title">📖 使用说明</div>
          <div class="tips">
            <p><strong>1.</strong> 在「平台配置」中填写平台地址和 API Key，点击「测试连接」</p>
            <p><strong>2.</strong> 设置本地存储路径（建议使用 SSD 硬盘）</p>
            <p><strong>3.</strong> 保存配置后，在客户端「设置」页面启用本地存储</p>
            <p><strong>4.</strong> 客户端设置中填写：<strong>http://${localIP}:${config.port}</strong></p>
            <p style="margin-top:12px;color:#666;">💡 保持此程序运行，AI 生成的内容将自动下载到本地</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    // ==================== Tab 切换 ====================
    function switchTab(tabId) {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.querySelector('[onclick="switchTab(\\'' + tabId + '\\')"]').classList.add('active');
      document.getElementById('tab-' + tabId).classList.add('active');
    }
    
    // ==================== 登录相关 ====================
    
    // 显示登录提示
    function showAuthAlert(formId, type, message) {
      const alertBox = document.getElementById(formId + 'Alert');
      if (!alertBox) return;
      alertBox.className = 'alert ' + type + ' show';
      alertBox.innerHTML = (type === 'success' ? '✅ ' : '❌ ') + message;
      setTimeout(() => alertBox.classList.remove('show'), 5000);
    }
    
    // 首次设置密码
    async function handleSetup() {
      const password = document.getElementById('setupPassword').value;
      const confirmPassword = document.getElementById('setupConfirmPassword').value;
      const btn = document.querySelector('#setupForm .btn-primary');
      const btnText = document.getElementById('setupBtnText');
      
      if (!password || password.length < 6) {
        showAuthAlert('setup', 'error', '密码长度不能少于6位');
        return;
      }
      
      if (password !== confirmPassword) {
        showAuthAlert('setup', 'error', '两次输入的密码不一致');
        return;
      }
      
      btn.disabled = true;
      btnText.innerHTML = '<span class="spinner"></span> 设置中...';
      
      try {
        const res = await fetch('/admin/api/auth/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password, confirmPassword }),
        });
        const data = await res.json();
        
        if (data.success) {
          showAuthAlert('setup', 'success', '密码设置成功！');
          setTimeout(() => {
            document.getElementById('authOverlay').classList.add('hidden');
            loadStorageStats();
          }, 500);
        } else {
          showAuthAlert('setup', 'error', data.error);
        }
      } catch (error) {
        showAuthAlert('setup', 'error', '请求失败：' + error.message);
      } finally {
        btn.disabled = false;
        btnText.innerHTML = '设置密码并进入';
      }
    }
    
    // 登录
    async function handleLogin() {
      const password = document.getElementById('loginPassword').value;
      const btn = document.querySelector('#loginForm .btn-primary');
      const btnText = document.getElementById('loginBtnText');
      
      if (!password) {
        showAuthAlert('login', 'error', '请输入密码');
        return;
      }
      
      btn.disabled = true;
      btnText.innerHTML = '<span class="spinner"></span> 登录中...';
      
      try {
        const res = await fetch('/admin/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });
        const data = await res.json();
        
        if (data.success) {
          showAuthAlert('login', 'success', '登录成功！');
          setTimeout(() => {
            document.getElementById('authOverlay').classList.add('hidden');
            loadStorageStats();
          }, 500);
        } else {
          showAuthAlert('login', 'error', data.error);
        }
      } catch (error) {
        showAuthAlert('login', 'error', '请求失败：' + error.message);
      } finally {
        btn.disabled = false;
        btnText.innerHTML = '登 录';
      }
    }
    
    // 登出
    async function handleLogout() {
      try {
        await fetch('/admin/api/auth/logout', { method: 'POST' });
        location.reload();
      } catch (error) {
        console.error('登出失败:', error);
        location.reload();
      }
    }
    
    // 显示重置密码表单
    function showResetForm() {
      document.getElementById('loginForm').classList.add('hidden');
      document.getElementById('resetForm').classList.remove('hidden');
    }
    
    // 显示登录表单
    function showLoginForm() {
      document.getElementById('resetForm').classList.add('hidden');
      document.getElementById('loginForm').classList.remove('hidden');
    }
    
    // 重置密码
    async function handleResetPassword() {
      const apiKey = document.getElementById('resetApiKey').value;
      const newPassword = document.getElementById('resetNewPassword').value;
      const confirmPassword = document.getElementById('resetConfirmPassword').value;
      const btn = document.querySelector('#resetForm .btn-primary');
      const btnText = document.getElementById('resetBtnText');
      
      if (!apiKey) {
        showAuthAlert('reset', 'error', '请输入 API Key');
        return;
      }
      
      if (!newPassword || newPassword.length < 6) {
        showAuthAlert('reset', 'error', '新密码长度不能少于6位');
        return;
      }
      
      if (newPassword !== confirmPassword) {
        showAuthAlert('reset', 'error', '两次输入的密码不一致');
        return;
      }
      
      btn.disabled = true;
      btnText.innerHTML = '<span class="spinner"></span> 验证中...';
      
      try {
        const res = await fetch('/admin/api/auth/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, newPassword }),
        });
        const data = await res.json();
        
        if (data.success) {
          showAuthAlert('reset', 'success', '密码重置成功！');
          setTimeout(() => {
            showLoginForm();
          }, 1500);
        } else {
          showAuthAlert('reset', 'error', data.error);
        }
      } catch (error) {
        showAuthAlert('reset', 'error', '请求失败：' + error.message);
      } finally {
        btn.disabled = false;
        btnText.innerHTML = '重置密码';
      }
    }
    
    // ==================== 配置相关 ====================
    
    // 显示提示
    function showAlert(type, message) {
      const alertBox = document.getElementById('alertBox');
      alertBox.className = 'alert ' + type + ' show';
      alertBox.innerHTML = (type === 'success' ? '✅ ' : '❌ ') + message;
      setTimeout(() => alertBox.classList.remove('show'), 5000);
    }

    // 测试连接
    async function testConnection() {
      const btn = document.querySelector('.btn-secondary');
      const btnText = document.getElementById('testBtnText');
      const platformServerUrl = document.getElementById('platformServerUrl').value;
      const tenantApiKey = document.getElementById('tenantApiKey').value;
      
      if (!platformServerUrl || !tenantApiKey) {
        showAlert('error', '请先填写平台地址和 API Key');
        return;
      }
      
      btn.disabled = true;
      btnText.innerHTML = '<span class="spinner"></span> 测试中...';
      
      try {
        const res = await fetch('/admin/api/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platformServerUrl, tenantApiKey }),
        });
        const data = await res.json();
        
        if (data.success) {
          showAlert('success', '连接成功！租户：' + data.tenant.name + '，积分：' + data.tenant.credits);
        } else {
          showAlert('error', data.error);
        }
      } catch (error) {
        showAlert('error', '请求失败：' + error.message);
      } finally {
        btn.disabled = false;
        btnText.innerHTML = '🔗 测试连接';
      }
    }

    // 保存配置
    document.getElementById('configForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const btn = document.querySelector('.btn-primary');
      const btnText = document.getElementById('saveBtnText');
      
      btn.disabled = true;
      btnText.innerHTML = '<span class="spinner"></span> 保存中...';
      
      try {
        const res = await fetch('/admin/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storagePath: document.getElementById('storagePath').value,
            platformServerUrl: document.getElementById('platformServerUrl').value,
            tenantApiKey: document.getElementById('tenantApiKey').value,
          }),
        });
        const data = await res.json();
        
        if (data.success) {
          showAlert('success', data.message);
          setTimeout(() => location.reload(), 1500);
        } else {
          showAlert('error', data.error);
        }
      } catch (error) {
        showAlert('error', '保存失败：' + error.message);
      } finally {
        btn.disabled = false;
        btnText.innerHTML = '💾 保存配置';
      }
    });

    // 加载存储统计
    async function loadStorageStats() {
      try {
        const res = await fetch('/admin/api/storage-stats');
        const data = await res.json();
        if (data.success) {
          document.getElementById('totalFiles').textContent = data.stats.totalFiles;
          document.getElementById('totalSize').textContent = data.stats.totalSize;
          document.getElementById('uploadsSize').textContent = data.stats.uploadsSize;
          document.getElementById('resultsSize').textContent = data.stats.resultsSize;
        }
      } catch (error) {
        console.error('加载存储统计失败:', error);
      }
    }
    
    // 页面加载时获取统计
    loadStorageStats();
    // 每30秒刷新一次
    setInterval(loadStorageStats, 30000);
    
    // 检测是否在浏览器中（非 Electron），隐藏标题栏
    if (!window.electronAPI?.isElectron) {
      document.getElementById('electronTitlebar').classList.add('hidden');
      document.body.classList.add('no-titlebar');
    }
  </script>
</body>
</html>`;
}

export default router;

