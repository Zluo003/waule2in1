/**
 * Electron 主进程
 * Waule 企业版服务端
 */
const { app, BrowserWindow, shell, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');

// 设置用户数据目录（避免缓存权限问题）
const userDataPath = path.join(os.homedir(), '.waule-enterprise-server');
app.setPath('userData', userDataPath);

let mainWindow = null;
let tray = null;
let isQuitting = false;
const port = 3002;
let host = '127.0.0.1';

// 获取本机 IP
function getLocalIP() {
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

// 启动后端服务
function startServer() {
  try {
    process.env.NODE_ENV = 'production';
    
    // 设置数据目录路径（数据库和配置文件）
    // 使用用户主目录下的固定位置，确保数据持久化（便携版 exe 每次提取到不同临时目录）
    const dataPath = app.isPackaged
      ? path.join(os.homedir(), '.waule-enterprise-server', 'data')
      : path.join(__dirname, '..', 'data');
    
    process.env.APP_DATA_PATH = dataPath;
    console.log('[Electron] 数据目录:', dataPath);
    
    // 确保目录存在
    const fs = require('fs');
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(dataPath, { recursive: true });
    }
    
    // 尝试多个可能的路径
    const possiblePaths = app.isPackaged
      ? [
          path.join(process.resourcesPath, 'app', 'dist', 'index.js'),
          path.join(process.resourcesPath, 'dist', 'index.js'),
          path.join(app.getAppPath(), 'dist', 'index.js'),
        ]
      : [path.join(__dirname, '..', 'dist', 'index.js')];
    
    let serverPath = null;
    
    for (const p of possiblePaths) {
      console.log('[Electron] 检查路径:', p);
      if (fs.existsSync(p)) {
        serverPath = p;
        break;
      }
    }
    
    if (!serverPath) {
      throw new Error('找不到服务器文件: ' + possiblePaths.join(', '));
    }
    
    console.log('[Electron] 启动服务:', serverPath);
    require(serverPath);
    console.log('[Electron] 服务启动成功');
    return true;
  } catch (error) {
    console.error('[Electron] 服务启动失败:', error);
    return false;
  }
}

function createWindow(error = null) {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 600,
    title: 'Waule 企业版服务端',
    frame: false,
    transparent: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 先显示加载页面
  const loadingHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%);
          min-height: 100vh;
          color: #e0e0e0;
          display: flex;
          flex-direction: column;
          padding-top: 32px;
        }
        .titlebar {
          height: 32px;
          background: rgba(0,0,0,0.3);
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          display: flex;
          align-items: center;
          padding-left: 12px;
          -webkit-app-region: drag;
        }
        .traffic-lights {
          display: flex;
          gap: 8px;
          -webkit-app-region: no-drag;
        }
        .btn { width: 12px; height: 12px; border-radius: 50%; cursor: pointer; border: none; }
        .btn.close { background: #ff5f57; }
        .btn.close:hover { background: #ff3b30; }
        .btn.min { background: #febc2e; }
        .btn.min:hover { background: #f5a623; }
        .btn.max { background: #28c840; }
        .btn.max:hover { background: #32d74b; }
        .title {
          flex: 1;
          text-align: center;
          font-size: 13px;
          color: rgba(255,255,255,0.7);
          margin-right: 60px;
        }
        .content {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .spinner {
          width: 40px;
          height: 40px;
          border: 3px solid rgba(255,255,255,0.2);
          border-top-color: #3498db;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        h2 { margin-top: 20px; font-weight: 500; }
        p { color: #888; margin-top: 8px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="titlebar">
        <div class="traffic-lights">
          <button class="btn close" onclick="window.electronAPI?.windowClose()"></button>
          <button class="btn min" onclick="window.electronAPI?.windowMinimize()"></button>
          <button class="btn max" onclick="window.electronAPI?.windowMaximize()"></button>
        </div>
        <div class="title">Waule 企业版服务端</div>
      </div>
      <div class="content">
        <div class="spinner"></div>
        <h2>正在启动服务...</h2>
        <p>请稍候</p>
      </div>
    </body>
    </html>
  `;
  
  mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(loadingHtml));

  // 如果服务器启动失败，直接显示错误
  if (error) {
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #fff; padding: 50px; padding-top: 82px; }
        .titlebar { height: 32px; background: rgba(0,0,0,0.3); position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; padding-left: 12px; -webkit-app-region: drag; }
        .traffic-lights { display: flex; gap: 8px; -webkit-app-region: no-drag; }
        .btn { width: 12px; height: 12px; border-radius: 50%; cursor: pointer; border: none; }
        .btn.close { background: #ff5f57; }
        .btn.min { background: #febc2e; }
        .btn.max { background: #28c840; }
        .title { flex: 1; text-align: center; font-size: 13px; color: rgba(255,255,255,0.7); margin-right: 60px; }
        h1 { color: #e74c3c; }
        pre { background: #000; padding: 15px; border-radius: 8px; overflow: auto; margin-top: 20px; white-space: pre-wrap; }
      </style>
      </head>
      <body>
        <div class="titlebar">
          <div class="traffic-lights">
            <button class="btn close" onclick="window.electronAPI?.windowClose()"></button>
            <button class="btn min" onclick="window.electronAPI?.windowMinimize()"></button>
            <button class="btn max" onclick="window.electronAPI?.windowMaximize()"></button>
          </div>
          <div class="title">Waule 企业版服务端</div>
        </div>
        <h1>❌ 服务启动失败</h1>
        <p>${error}</p>
        <p>请检查日志文件获取详细信息</p>
      </body>
      </html>
    `));
    return;
  }

  // 等待后尝试加载管理页面
  setTimeout(() => {
    const adminUrl = `http://${host}:${port}/admin`;
    console.log('[Electron] 尝试加载管理页面:', adminUrl);
    
    mainWindow.loadURL(adminUrl).catch(err => {
      console.error('[Electron] 页面加载失败:', err);
      mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`
        <!DOCTYPE html>
        <html>
        <head><meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #1a1a2e; color: #fff; padding: 50px; padding-top: 82px; }
          .titlebar { height: 32px; background: rgba(0,0,0,0.3); position: fixed; top: 0; left: 0; right: 0; display: flex; align-items: center; padding-left: 12px; -webkit-app-region: drag; }
          .traffic-lights { display: flex; gap: 8px; -webkit-app-region: no-drag; }
          .btn { width: 12px; height: 12px; border-radius: 50%; cursor: pointer; border: none; }
          .btn.close { background: #ff5f57; }
          .btn.min { background: #febc2e; }
          .btn.max { background: #28c840; }
          .title { flex: 1; text-align: center; font-size: 13px; color: rgba(255,255,255,0.7); margin-right: 60px; }
          h1 { color: #e74c3c; }
          pre { background: #000; padding: 15px; border-radius: 8px; overflow: auto; margin-top: 20px; }
        </style>
        </head>
        <body>
          <div class="titlebar">
            <div class="traffic-lights">
              <button class="btn close" onclick="window.electronAPI?.windowClose()"></button>
              <button class="btn min" onclick="window.electronAPI?.windowMinimize()"></button>
              <button class="btn max" onclick="window.electronAPI?.windowMaximize()"></button>
            </div>
            <div class="title">Waule 企业版服务端</div>
          </div>
          <h1>❌ 服务启动失败</h1>
          <p>无法连接到本地服务器 (端口 ${port})</p>
          <p>可能的原因：</p>
          <ul>
            <li>端口 ${port} 被其他程序占用</li>
            <li>服务器启动出错</li>
          </ul>
          <pre>${err.message}</pre>
        </body>
        </html>
      `));
    });
  }, 3000);

  // 外部链接在默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // 关闭时隐藏到托盘
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 创建系统托盘
function createTray() {
  const localIP = getLocalIP();
  
  // 加载托盘图标
  let trayIcon;
  const iconPaths = app.isPackaged
    ? [
        path.join(process.resourcesPath, 'app', 'resources', 'icon.ico'),
        path.join(process.resourcesPath, 'resources', 'icon.ico'),
        path.join(app.getAppPath(), 'resources', 'icon.ico'),
      ]
    : [path.join(__dirname, '..', 'resources', 'icon.ico')];
  
  for (const iconPath of iconPaths) {
    if (require('fs').existsSync(iconPath)) {
      trayIcon = nativeImage.createFromPath(iconPath);
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
      break;
    }
  }
  
  if (!trayIcon || trayIcon.isEmpty()) {
    console.warn('[Electron] 托盘图标未找到，使用空图标');
    trayIcon = nativeImage.createEmpty();
  }
  
  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开管理界面',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        } else {
          createWindow();
        }
      },
    },
    {
      label: `内网地址: ${localIP}:${port}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '在浏览器中打开',
      click: () => {
        shell.openExternal(`http://${host}:${port}/admin`);
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Waule 企业版服务端');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    } else {
      createWindow();
    }
  });
}

// 全局错误信息
let serverError = null;

// 应用准备就绪
app.whenReady().then(() => {
  host = getLocalIP();
  console.log('[Electron] 使用 IP 地址:', host);
  
  // 启动后端服务
  const success = startServer();
  if (!success) {
    serverError = '服务器启动失败，请查看日志';
  }

  // 等待服务启动后创建窗口
  setTimeout(() => {
    createTray();
    createWindow(serverError);
  }, 1500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 所有窗口关闭时不退出（托盘模式）
app.on('window-all-closed', () => {
  // Windows 下保持运行
});

// 退出前清理
app.on('before-quit', () => {
  isQuitting = true;
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
  if (mainWindow) mainWindow.hide();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});
