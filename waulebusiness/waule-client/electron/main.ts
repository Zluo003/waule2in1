/**
 * Electron 主进程
 * waule-client 桌面应用
 */
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

// 是否为开发模式
const isDev = process.env.NODE_ENV === 'development';

let mainWindow: BrowserWindow | null = null;

// 日志文件路径
const logPath = path.join(app.getPath('userData'), 'logs');
const errorLogFile = path.join(logPath, 'error.log');

// 确保日志目录存在
if (!fs.existsSync(logPath)) {
  fs.mkdirSync(logPath, { recursive: true });
}

// 日志记录函数
function writeLog(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(errorLogFile, logMessage);
  console.log(logMessage);
}

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  writeLog(`Uncaught Exception: ${error.message}\n${error.stack}`);
});

process.on('unhandledRejection', (reason) => {
  writeLog(`Unhandled Rejection: ${reason}`);
});

function createWindow() {
  try {
    writeLog('Creating main window...');

    mainWindow = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 1024,
      minHeight: 768,
      title: 'Waule',
      icon: path.join(__dirname, '../resources/icon.png'),
      frame: false, // 无边框窗口
      transparent: false,
      show: false, // 先隐藏,加载完成后显示
      backgroundColor: '#ffffff',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        sandbox: false,
        // GPU 加速降级方案
        disableHardwareAcceleration: false,
      },
    });

    // 窗口准备好后显示
    mainWindow.once('ready-to-show', () => {
      writeLog('Window ready to show');
      mainWindow?.show();
    });

  // 开发模式加载 Vite 开发服务器
  if (isDev) {
    mainWindow.loadURL('http://localhost:8852');
    mainWindow.webContents.openDevTools();
  } else {
    // 生产模式加载打包后的文件
    const indexPath = path.join(__dirname, '../dist/index.html');
    writeLog(`Loading file: ${indexPath}`);
    mainWindow.loadFile(indexPath).catch((err) => {
      writeLog(`Failed to load file: ${err.message}`);
    });
  }

  // 监听渲染进程崩溃
  mainWindow.webContents.on('render-process-gone', (event, details) => {
    writeLog(`Render process gone: ${details.reason}, exitCode: ${details.exitCode}`);
  });

  // 监听页面加载失败
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    writeLog(`Failed to load: ${errorDescription} (${errorCode}) - ${validatedURL}`);
  });

  // 监听控制台消息
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    if (level >= 2) { // 2=warning, 3=error
      writeLog(`Console [${level}]: ${message} (${sourceId}:${line})`);
    }
  });

  // 外部链接在默认浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  } catch (error: any) {
    writeLog(`Error creating window: ${error.message}\n${error.stack}`);
    throw error;
  }
}

// 应用准备就绪
app.whenReady().then(() => {
  writeLog(`App ready. Electron version: ${process.versions.electron}, Chrome: ${process.versions.chrome}`);
  writeLog(`Platform: ${process.platform}, Arch: ${process.arch}`);
  writeLog(`User data path: ${app.getPath('userData')}`);

  // 禁用 GPU 加速(如果启动参数包含 --disable-gpu)
  if (app.commandLine.hasSwitch('disable-gpu')) {
    writeLog('GPU acceleration disabled by command line');
    app.disableHardwareAcceleration();
  }

  createWindow();

  app.on('activate', () => {
    // macOS: 点击 dock 图标时重新创建窗口
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((error) => {
  writeLog(`App ready failed: ${error.message}\n${error.stack}`);
});

// 所有窗口关闭时退出（macOS 除外）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC 通信示例：获取应用版本
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// IPC：获取平台信息
ipcMain.handle('get-platform', () => {
  return process.platform;
});

// IPC：窗口控制
ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

// IPC：获取窗口最大化状态
ipcMain.handle('window-is-maximized', () => {
  return mainWindow?.isMaximized() || false;
});

// IPC：获取日志文件路径
ipcMain.handle('get-log-path', () => {
  return errorLogFile;
});

// IPC：读取日志内容
ipcMain.handle('get-logs', () => {
  try {
    if (fs.existsSync(errorLogFile)) {
      return fs.readFileSync(errorLogFile, 'utf-8');
    }
    return 'No logs available';
  } catch (error: any) {
    return `Error reading logs: ${error.message}`;
  }
});
