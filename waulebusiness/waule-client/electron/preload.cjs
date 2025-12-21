/**
 * Electron 预加载脚本
 * 安全地暴露 API 给渲染进程
 */
const { contextBridge, ipcRenderer } = require('electron');

// 暴露给渲染进程的 API
contextBridge.exposeInMainWorld('electronAPI', {
  // 获取应用版本
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // 获取平台信息
  getPlatform: () => ipcRenderer.invoke('get-platform'),
  // 检查是否在 Electron 环境中运行
  isElectron: true,
  // 窗口控制
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized'),
  // 下载文件（Electron 专用）
  downloadFile: (url, filename) => ipcRenderer.invoke('download-file', url, filename),
  // 启动视频播放完成
  splashFinished: () => ipcRenderer.send('splash-finished'),
});
