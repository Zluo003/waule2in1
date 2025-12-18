import { useState, useEffect, useRef } from 'react';
import { Check, ChevronRight } from 'lucide-react';

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  className?: string;
}

const CustomSelect = ({ value, onChange, options, className = '' }: CustomSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    // 使用capture阶段确保先于其他事件处理
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [isOpen]);

  const currentOption = options.find(opt => opt.value === value);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      {/* 下拉框主体 */}
      <div 
        onClick={handleToggle}
        onMouseDown={(e) => e.stopPropagation()}
        className="nodrag flex justify-between items-center p-2 rounded-md border cursor-pointer text-xs transition-colors bg-slate-100 dark:bg-[#000000] backdrop-blur-none hover:bg-slate-200 dark:hover:bg-neutral-800 border-slate-200 dark:border-neutral-800 text-slate-800 dark:text-white"
      >
        <span>{currentOption?.label || value}</span>
        <ChevronRight 
          size={12} 
          className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} 
        />
      </div>
      
      {/* 展开的选项列表 */}
      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1 rounded-md border overflow-hidden z-[9999] shadow-xl bg-white/90 dark:bg-[#1a1a1a]/90 dark:backdrop-blur-none backdrop-blur-sm border-slate-200 dark:border-neutral-800">
          {options.map(opt => (
            <div 
              key={opt.value}
              onClick={(e) => { 
                e.stopPropagation();
                onChange(opt.value); 
                setIsOpen(false); 
              }}
              onMouseDown={(e) => e.stopPropagation()}
              className="nodrag px-3 py-2 text-xs cursor-pointer flex items-center justify-between transition-colors hover:bg-slate-100 dark:hover:bg-neutral-800 text-slate-800 dark:text-white"
            >
              {opt.label}
              {value === opt.value && <Check size={10} className="text-neutral-500" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomSelect;
