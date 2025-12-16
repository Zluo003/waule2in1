/**
 * Electron 全局标题栏组件
 * 提供窗口拖动区域和苹果风格控制按钮（关闭/最小化/最大化）
 */
import { useState, useEffect } from 'react';

const ElectronTitleBar = () => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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
      className="h-8 flex items-center justify-start flex-shrink-0 fixed top-0 left-0 right-0 z-[9999]"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* 苹果风格交通灯按钮 */}
      <div 
        className="flex items-center gap-2 ml-3"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* 关闭 - 红色 */}
        <button
          onClick={handleClose}
          className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57] flex items-center justify-center transition-all group"
          title="关闭"
        >
          {isHovered && (
            <svg className="w-2 h-2 text-[#4c0002]" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
          )}
        </button>
        
        {/* 最小化 - 黄色 */}
        <button
          onClick={handleMinimize}
          className="w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e] flex items-center justify-center transition-all group"
          title="最小化"
        >
          {isHovered && (
            <svg className="w-2 h-2 text-[#995700]" viewBox="0 0 12 12" fill="currentColor">
              <path d="M2.5 6h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
            </svg>
          )}
        </button>
        
        {/* 最大化 - 绿色 */}
        <button
          onClick={handleMaximize}
          className="w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840] flex items-center justify-center transition-all group"
          title={isMaximized ? '还原' : '最大化'}
        >
          {isHovered && (
            <svg className="w-2 h-2 text-[#006500]" viewBox="0 0 12 12" fill="currentColor">
              {isMaximized ? (
                <path d="M4 8l4-4M4 4v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              ) : (
                <path d="M3 3l6 6M3 9V3h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              )}
            </svg>
          )}
        </button>
      </div>
    </div>
  );
};

export default ElectronTitleBar;
