import NodeCreatorBadge from '../NodeCreatorBadge';
import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { NodeProps, useReactFlow } from 'reactflow';

interface TextAnnotationNodeData {
  label?: string;
  text?: string;
  fontSize?: number;
  width?: number;
  height?: number;
  color?: string;
  bold?: boolean;
}

const FONT_SIZES = [24, 28, 32, 36, 40, 48, 56, 64, 72, 80, 96, 120, 150, 200];

const TextAnnotationNode = ({ data, selected, id }: NodeProps<TextAnnotationNodeData>) => {
  const { setNodes } = useReactFlow();
  const [text, setText] = useState(data.text || '双击编辑文本');
  const [isEditing, setIsEditing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [fontSize, setFontSize] = useState(data.fontSize || 36); // 默认36px
  const [width, setWidth] = useState(data.width || 200);
  const [bold, setBold] = useState(data.bold || false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  // 更新节点数据
  const updateNodeData = useCallback((updates: Partial<TextAnnotationNodeData>) => {
    setNodes((nds) =>
      nds.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, ...updates } }
          : node
      )
    );
  }, [id, setNodes]);

  // 保存文本
  useEffect(() => {
    const timer = setTimeout(() => {
      if (text !== data.text) {
        updateNodeData({ text });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, data.text, updateNodeData]);

  // 保存样式
  useEffect(() => {
    updateNodeData({ fontSize, width, bold });
  }, [fontSize, width, bold, updateNodeData]);

  // 双击进入编辑模式
  const handleDoubleClick = () => {
    setIsEditing(true);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
        // 自动调整高度
        textareaRef.current.style.height = 'auto';
        textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      }
    }, 0);
  };

  // 退出编辑模式
  const handleBlur = () => {
    setIsEditing(false);
  };

  // 自动调整 textarea 高度
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [isEditing, text]);

  // 点击外部关闭设置面板
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setShowSettings(false);
      }
    };
    if (showSettings) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showSettings]);

  return (
    <div
      className={`relative group ${selected ? 'ring-2 ring-neutral-400 ring-offset-2' : ''}`}
      style={{ width }}
    >
      {/* 创建者头像徽章 */}
      <NodeCreatorBadge createdBy={(data as any).createdBy} isSharedWorkflow={(data as any)._isSharedWorkflow} />
      
      {/* 设置按钮 */}
      <button
        onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings); }}
        className="absolute -top-8 right-0 w-6 h-6 rounded-md bg-white dark:bg-gray-800 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-gray-100 dark:hover:bg-gray-700"
        title="文本设置"
      >
        <span className="material-symbols-outlined text-sm text-slate-600 dark:text-gray-300">settings</span>
      </button>

      {/* 设置面板 */}
      {showSettings && (
        <div
          ref={settingsRef}
          className="absolute -top-2 left-full ml-2 z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-slate-200 dark:border-white/10 p-3 min-w-[200px]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 字体大小 */}
          <div className="mb-3">
            <label className="text-[10px] uppercase font-bold tracking-wider text-slate-400 dark:text-white/50 block mb-1">
              字体大小
            </label>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="nodrag w-full px-2 py-1.5 text-xs rounded-md border bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-700 dark:text-white focus:outline-none focus:border-neutral-400"
            >
              {FONT_SIZES.map((size) => (
                <option key={size} value={size}>{size}px</option>
              ))}
            </select>
          </div>

          {/* 加粗 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setBold(!bold)}
              className={`nodrag px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                bold
                  ? 'bg-neutral-500 text-white'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-gray-300 hover:bg-slate-200 dark:hover:bg-white/20'
              }`}
            >
              <span className="font-bold">B</span> 加粗
            </button>
          </div>
        </div>
      )}

      {/* 文本内容 */}
      {isEditing ? (
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleBlur}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsEditing(false);
            }
          }}
          className="nodrag w-full bg-transparent border-2 border-neutral-400 rounded-lg p-2 resize-none focus:outline-none text-slate-900 dark:text-white"
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: bold ? 'bold' : 'normal',
          }}
        />
      ) : (
        <div
          onDoubleClick={handleDoubleClick}
          className="w-full cursor-text select-none whitespace-pre-wrap break-words text-slate-900 dark:text-white"
          style={{
            fontSize: `${fontSize}px`,
            fontWeight: bold ? 'bold' : 'normal',
          }}
        >
          {text}
        </div>
      )}

      {/* 调整宽度的拖拽手柄 - 编辑时隐藏 */}
      {!isEditing && (
        <div
          className="nodrag absolute top-0 bottom-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
          onMouseDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            const startX = e.clientX;
            const startWidth = width;
            
            const handleMouseMove = (moveEvent: MouseEvent) => {
              moveEvent.preventDefault();
              const newWidth = Math.max(100, startWidth + (moveEvent.clientX - startX));
              setWidth(newWidth);
            };
            
            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
            };
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        >
          <div className="w-1 h-8 rounded-full bg-slate-300 dark:bg-white/30" />
        </div>
      )}
    </div>
  );
};

export default memo(TextAnnotationNode);
