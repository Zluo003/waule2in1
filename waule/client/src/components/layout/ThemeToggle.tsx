import React from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export const ThemeToggle: React.FC = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="
        relative p-2 rounded-lg 
        bg-card-light dark:bg-card-dark
        border border-border-light dark:border-border-dark
        hover:bg-card-light-hover dark:hover:bg-card-dark-hover
        transition-all duration-200
        group
      "
      aria-label="切换主题"
      title={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}
    >
      <div className="relative w-5 h-5">
        {/* Sun icon for light mode */}
        <Sun
          className={`
            absolute inset-0 w-5 h-5 
            text-tiffany-600 
            transition-all duration-300
            ${theme === 'light' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-0'}
          `}
        />
        {/* Moon icon for dark mode */}
        <Moon
          className={`
            absolute inset-0 w-5 h-5 
            text-tiffany-400
            transition-all duration-300
            ${theme === 'dark' ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-0'}
          `}
        />
      </div>
    </button>
  );
};

