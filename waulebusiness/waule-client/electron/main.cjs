/**
 * Electron 主进程
 * waule-client 桌面应用
 */
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// 是否为开发模式
const isDev = process.env.NODE_ENV === 'development';

// 自动更新配置
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow = null;
let splashWindow = null;
let localServer = null;
let serverPort = 18852;

// 是否启用启动视频（检查视频文件是否存在）
function hasSplashVideo() {
  const videoPath = path.join(__dirname, 'splash.mp4');
  return fs.existsSync(videoPath);
}

// 远程 API 服务器地址
const REMOTE_SERVER = 'https://qiye.waule.com';

// 代理请求到远程服务器
function proxyRequest(req, res, targetPath) {
  const url = new URL(targetPath, REMOTE_SERVER);
  const protocol = url.protocol === 'https:' ? https : http;
  
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: url.hostname,
    },
  };
  
  // 移除可能导致问题的头
  delete options.headers['host'];
  delete options.headers['connection'];
  
  const proxyReq = protocol.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });
  
  proxyReq.on('error', (err) => {
    console.error('[Proxy Error]', err.message);
    res.writeHead(502);
    res.end('Proxy Error');
  });
  
  req.pipe(proxyReq);
}

// 启动本地静态文件服务器（解决 file:// 协议跨域问题）
function startLocalServer(distPath) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url.split('?')[0];
      
      // 只代理 /api 请求到远程服务器（认证、业务逻辑）
      // /uploads 和图片由本地 waule-tenant-server 提供，不需要代理
      if (req.url.startsWith('/api')) {
        proxyRequest(req, res, req.url);
        return;
      }
      
      let filePath = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath);
      
      // 处理 SPA 路由：如果文件不存在且不是静态资源，返回 index.html
      if (!fs.existsSync(filePath) && !req.url.includes('.')) {
        filePath = path.join(distPath, 'index.html');
      }
      
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
      };
      
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      
      fs.readFile(filePath, (err, content) => {
        if (err) {
          if (err.code === 'ENOENT') {
            res.writeHead(404);
            res.end('Not Found');
          } else {
            res.writeHead(500);
            res.end('Server Error');
          }
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(content);
        }
      });
    });
    
    server.listen(serverPort, '127.0.0.1', () => {
      console.log(`[Electron] 本地服务器启动: http://127.0.0.1:${serverPort}`);
      console.log(`[Electron] API/uploads 代理到: ${REMOTE_SERVER}`);
      localServer = server;
      resolve(serverPort);
    });
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        serverPort++;
        server.listen(serverPort, '127.0.0.1');
      }
    });
  });
}

// 创建启动视频窗口
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 800,
    height: 500,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

async function createWindow() {
  // 生产模式先启动本地服务器
  if (!isDev) {
    const distPath = path.join(__dirname, '../dist');
    await startLocalServer(distPath);
  }
  
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    title: 'Waule',
    icon: path.join(__dirname, '../resources/icon.ico'),
    frame: false,
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // 允许跨域API请求
    },
  });

  // 开发模式加载 Vite 开发服务器
  if (isDev) {
    mainWindow.loadURL('http://localhost:8852');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式加载本地服务器
    mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);
  }

  // 外部链接在默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 应用准备就绪
app.whenReady().then(async () => {
  // 检查是否有启动视频（仅生产模式）
  if (!isDev && hasSplashVideo()) {
    // 显示启动视频
    createSplashWindow();
    // 同时在后台准备主窗口
    await createWindow();
    mainWindow.hide(); // 先隐藏主窗口
  } else {
    // 没有启动视频，直接显示主窗口
    await createWindow();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// IPC：启动视频播放完成
ipcMain.on('splash-finished', () => {
  if (splashWindow) {
    splashWindow.close();
  }
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC：获取应用版本
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// IPC：获取平台信息
ipcMain.handle('get-platform', () => {
  return process.platform;
});

// IPC：窗口控制
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// IPC：获取窗口最大化状态
ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// IPC：下载文件
ipcMain.handle('download-file', async (event, url, filename) => {
  try {
    // 显示保存对话框
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [
        { name: '所有文件', extensions: ['*'] },
        { name: '图片', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: '视频', extensions: ['mp4', 'mov', 'avi', 'webm'] },
        { name: '音频', extensions: ['mp3', 'wav', 'aac', 'm4a'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return { success: false, message: '用户取消下载' };
    }

    const savePath = result.filePath;

    // 下载文件
    return new Promise((resolve) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = fs.createWriteStream(savePath);

      protocol.get(url, (response) => {
        // 处理重定向
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          file.close();
          fs.unlinkSync(savePath);
          // 递归处理重定向
          ipcMain.emit('download-file', event, response.headers.location, filename);
          return;
        }

        if (response.statusCode !== 200) {
          file.close();
          fs.unlinkSync(savePath);
          resolve({ success: false, message: `下载失败: HTTP ${response.statusCode}` });
          return;
        }

        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve({ success: true, path: savePath });
        });

        file.on('error', (err) => {
          file.close();
          fs.unlinkSync(savePath);
          resolve({ success: false, message: err.message });
        });
      }).on('error', (err) => {
        file.close();
        fs.unlinkSync(savePath);
        resolve({ success: false, message: err.message });
      });
    });
  } catch (error) {
    return { success: false, message: error.message };
  }
});

// ============ 自动更新 ============

// 检查更新（生产模式下）
function checkForUpdates() {
  if (isDev) {
    console.log('[AutoUpdate] 开发模式，跳过更新检查');
    return;
  }
  
  console.log('[AutoUpdate] 检查更新...');
  autoUpdater.checkForUpdatesAndNotify();
}

// 更新事件监听
autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdate] 正在检查更新...');
});

autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdate] 发现新版本:', info.version);
  if (mainWindow) {
    mainWindow.webContents.send('update-available', info);
  }
});

autoUpdater.on('update-not-available', (info) => {
  console.log('[AutoUpdate] 当前已是最新版本');
});

autoUpdater.on('download-progress', (progress) => {
  console.log(`[AutoUpdate] 下载进度: ${Math.round(progress.percent)}%`);
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', progress);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('[AutoUpdate] 更新已下载，准备安装');
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded', info);
  }
  
  // 显示更新提示对话框
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: '更新就绪',
    message: `新版本 ${info.version} 已下载完成`,
    detail: '应用将在关闭时自动安装更新。是否现在重启以完成更新？',
    buttons: ['立即重启', '稍后'],
    defaultId: 0,
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on('error', (err) => {
  console.error('[AutoUpdate] 更新错误:', err.message);
});

// IPC：手动检查更新
ipcMain.handle('check-for-updates', () => {
  checkForUpdates();
});

// IPC：立即安装更新
ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});

// 应用启动后延迟检查更新
app.on('ready', () => {
  setTimeout(checkForUpdates, 5000); // 延迟5秒检查
});
