/**
 * Electron API 类型声明
 */
declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;
      isElectron: boolean;
      windowMinimize: () => void;
      windowMaximize: () => void;
      windowClose: () => void;
      windowIsMaximized: () => Promise<boolean>;
      downloadFile: (url: string, filename: string) => Promise<{ success: boolean; path?: string; message?: string }>;
    };
  }
}

export {};
