import { Handle, Position, HandleProps } from 'reactflow';

interface CustomHandleProps extends Omit<HandleProps, 'type'> {
  type: 'source' | 'target';
  position: Position;
  id?: string;
  className?: string;
  label?: string; // 可选的文字标签
  isConnectable?: boolean; // 显式声明
  disabled?: boolean; // 显示和交互禁用
  style?: React.CSSProperties;
}

const CustomHandle = ({ type, position, id, className = '', label, isConnectable, disabled, style, ...props }: CustomHandleProps) => {
  // 输入连接点在左侧，输出连接点在右侧
  const isLeft = position === Position.Left;
  
  // 当 isConnectable 为 false 时，完全禁用 handle 的交互（包括拉线出去和被连接）
  const handleClassName = (isConnectable === false || disabled)
    ? '!w-3.5 !h-3.5 bg-white dark:bg-black !border-2 !border-purple-300 pointer-events-none opacity-60 rounded-full shadow-[0_0_5px_rgba(255,255,255,0.5)]'
    : `!w-3.5 !h-3.5 bg-white dark:bg-black !border-2 !border-purple-300 pointer-events-auto rounded-full ${type === 'target' ? 'opacity-70 cursor-default' : 'cursor-pointer hover:scale-125'} ${className}`;
  
  return (
    <div 
      className={`absolute ${isLeft ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none z-[10000]`}
      style={{ zIndex: 10000, ...(style || {}) }}
    >
      {/* 左侧连接点：标签在左 */}
      {isLeft && label && (
        <span className="text-xs text-gray-900 dark:text-gray-400 bg-gray-200/80 dark:bg-gray-900/80 px-2 py-0.5 rounded whitespace-nowrap">{label}</span>
      )}
      
    <Handle
      type={type}
      position={position}
      id={id}
      isConnectable={disabled ? false : isConnectable}
      style={{
          position: 'relative', 
          [isLeft ? 'left' : 'right']: '10px',
          transform: 'none',
          zIndex: 10001,
          cursor: type === 'target' ? 'default' : 'pointer'
      }}
        className={`${handleClassName} !z-[10001]`}
      {...props}
      />
      
      {/* 右侧连接点：标签在右 */}
      {!isLeft && label && (
        <span className="text-xs text-gray-900 dark:text-gray-400 bg-gray-200/80 dark:bg-gray-900/80 px-2 py-0.5 rounded whitespace-nowrap">{label}</span>
      )}
    </div>
  );
};

export default CustomHandle;
