/**
 * Electron 全局标题栏组件
 * 提供窗口拖动区域和苹果风格控制按钮（关闭/最小化/最大化）
 */
import { useState, useEffect } from 'react';

const ElectronTitleBar = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    const checkElectron = () => {
      if (window.electronAPI?.isElectron) {
        setIsElectron(true);
        window.electronAPI.windowIsMaximized().then(setIsMaximized);
      }
    };
    checkElectron();
    const timer = setTimeout(checkElectron, 100);
    return () => clearTimeout(timer);
  }, []);

  if (!isElectron) return null;

  const handleMinimize = () => {
    window.electronAPI?.windowMinimize();
  };

  const handleMaximize = () => {
    window.electronAPI?.windowMaximize();
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.electronAPI?.windowClose();
  };

  return (
    <div 
      className="h-8 flex items-center justify-end flex-shrink-0 fixed top-0 left-0 right-0 z-[9999] bg-[#fdfdfd] dark:bg-[#010101]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Windows 风格控制按钮 - 右侧 */}
      <div 
        className="flex items-center h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* 最小化 */}
        <button
          onClick={handleMinimize}
          className="w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors"
          title="最小化"
        >
          <svg className="w-4 h-4 text-gray-400" viewBox="0 0 12 12" fill="none">
            <path d="M2 6h8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          </svg>
        </button>
        
        {/* 最大化/还原 */}
        <button
          onClick={handleMaximize}
          className="w-12 h-full flex items-center justify-center hover:bg-white/10 transition-colors"
          title={isMaximized ? '还原' : '最大化'}
        >
          {isMaximized ? (
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="4" width="6" height="6" stroke="currentColor" strokeWidth="1"/>
              <path d="M4 4V2h6v6h-2" stroke="currentColor" strokeWidth="1"/>
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="2" width="8" height="8" stroke="currentColor" strokeWidth="1"/>
            </svg>
          )}
        </button>
        
        {/* 关闭 */}
        <button
          onClick={handleClose}
          className="w-12 h-full flex items-center justify-center hover:bg-red-500 transition-colors group"
          title="关闭"
        >
          <svg className="w-4 h-4 text-gray-400 group-hover:text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
};

export default ElectronTitleBar;
