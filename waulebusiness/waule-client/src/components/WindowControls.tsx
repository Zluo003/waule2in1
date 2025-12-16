/**
 * 窗口控制组件（最小化/最大化/关闭）
 * 用于无边框 Electron 窗口
 */
import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

const WindowControls = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const isElectron = typeof window !== 'undefined' && window.electronAPI?.isElectron;

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;
    
    // 初始化最大化状态
    window.electronAPI.windowIsMaximized().then(setIsMaximized);
  }, [isElectron]);

  if (!isElectron || !window.electronAPI) return null;

  const handleMinimize = () => {
    window.electronAPI!.windowMinimize();
  };

  const handleMaximize = () => {
    window.electronAPI!.windowMaximize();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.electronAPI!.windowClose();
  };

  return (
    <div className="flex items-center gap-0 -webkit-app-region-no-drag">
      {/* 最小化 */}
      <button
        onClick={handleMinimize}
        className="w-11 h-8 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title="最小化"
      >
        <Minus className="w-4 h-4 text-gray-600 dark:text-gray-300" />
      </button>
      
      {/* 最大化/还原 */}
      <button
        onClick={handleMaximize}
        className="w-11 h-8 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        title={isMaximized ? '还原' : '最大化'}
      >
        {isMaximized ? (
          <Copy className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
        ) : (
          <Square className="w-3.5 h-3.5 text-gray-600 dark:text-gray-300" />
        )}
      </button>
      
      {/* 关闭 */}
      <button
        onClick={handleClose}
        className="w-11 h-8 flex items-center justify-center hover:bg-red-500 hover:text-white transition-colors group"
        title="关闭"
      >
        <X className="w-4 h-4 text-gray-600 dark:text-gray-300 group-hover:text-white" />
      </button>
    </div>
  );
};

export default WindowControls;
