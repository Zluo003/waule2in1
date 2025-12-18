import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { apiClient } from '../lib/api';

// 自定义下拉菜单组件
interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // 检测dark mode
    const checkDarkMode = () => {
      setIsDark(document.documentElement.classList.contains('dark'));
    };
    checkDarkMode();
    
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="absolute right-0 top-0 bottom-0 px-4 bg-neutral-200 dark:bg-neutral-700 rounded-r-full text-xs cursor-pointer flex items-center gap-1 min-w-[100px] justify-center"
        style={{ outline: 'none !important', boxShadow: 'none !important', border: 'none', color: isDark ? 'white' : 'black' } as any}
      >
        <span className="whitespace-nowrap" style={{ color: isDark ? 'white' : 'black' }}>{selectedOption?.label}</span>
        <span className="material-symbols-outlined text-xs" style={{ fontVariationSettings: '"FILL" 0, "wght" 200', color: isDark ? 'white' : 'black' }}>
          {isOpen ? 'expand_less' : 'expand_more'}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-32 rounded-lg shadow-lg border border-slate-200 dark:border-white/10 py-1 z-50" style={{ backgroundColor: isDark ? '#0f0f10' : '#f3f5f5' }}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                value === option.value
                  ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface AssetItem {
  id: string;
  name: string;
  originalName: string;
  type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
  mimeType: string;
  size: number;
  url: string;
  thumbnail?: string | null;
  metadata?: any;
  createdAt: string;
}

const RecycleBinPage = () => {
  const [items, setItems] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IMAGE' | 'VIDEO' | 'AUDIO'>('ALL');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectionMode, setSelectionMode] = useState(false);
  const [previewItem, setPreviewItem] = useState<AssetItem | null>(null);

  // 防抖搜索
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const resp = await apiClient.tenant.get('/assets/recycle/bin', { params: { type: typeFilter, q: debouncedQuery } });
      setItems(resp.data || resp?.data?.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || '加载回收站失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, [typeFilter, debouncedQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const clearSelection = () => {
    setSelectedIds([]);
  };

  

  const bulkPermanentDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`确定要彻底删除选中的 ${selectedIds.length} 个资产吗？此操作不可恢复！`)) return;
    try {
      await Promise.all(selectedIds.map((id) => apiClient.tenant.delete(`/assets/${id}/permanent`)));
      toast.success('批量彻底删除完成');
      clearSelection();
      await loadItems();
    } catch (error: any) {
      toast.error('批量彻底删除失败');
    }
  };

  const handleCardHover = (cardElement: HTMLDivElement, isHovering: boolean) => {
    // 查找卡片内的 video 元素
    const videoElement = cardElement.querySelector('video') as HTMLVideoElement | null;
    if (!videoElement) return;
    
    if (isHovering) {
      console.log('[RecycleBin] 鼠标进入，开始播放视频');
      videoElement.currentTime = 0; // 从头开始
      videoElement.play().catch((err) => {
        console.error('[RecycleBin] 播放失败:', err);
      });
    } else {
      console.log('[RecycleBin] 鼠标离开，暂停视频');
      videoElement.pause();
      videoElement.currentTime = 0; // 重置到开始
    }
  };

  const renderPreview = (item: AssetItem) => {
    if (item.type === 'IMAGE') {
      return (
        <img 
          src={item.thumbnail || item.url} 
          alt={item.name} 
          className="w-full h-auto object-contain block"
          loading="lazy"
        />
      );
    }
    if (item.type === 'VIDEO') {
      return (
        <video 
          src={item.url} 
          className="w-full h-auto object-contain block"
          preload="metadata"
          poster={item.thumbnail || undefined}
          muted
          loop
        />
      );
    }
    if (item.type === 'AUDIO') {
      return (
        <div className="w-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center" style={{ aspectRatio: '1/1' }}>
          <span className="material-symbols-outlined text-5xl text-slate-400 dark:text-slate-500">audio_file</span>
        </div>
      );
    }
    return (
      <div className="w-full bg-neutral-100 dark:bg-[#27272a] flex items-center justify-center" style={{ aspectRatio: '16/9' }}>
        <span className="material-symbols-outlined text-5xl text-neutral-400 dark:text-neutral-500">insert_drive_file</span>
      </div>
    );
  };

  return (
    <div className="pr-8 pb-8">
      {/* 搜索栏 - 居中 */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-40 flex items-center h-[72px]">
        <div className="relative w-80 flex items-center">
          <span className="material-symbols-outlined absolute left-4 text-text-light-tertiary dark:text-text-dark-tertiary">
            search
          </span>
          <input
            type="text"
            placeholder="搜索项目名或文件名..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-12 pr-28 py-2.5 w-full bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-full text-text-light-primary dark:text-text-dark-primary placeholder:text-text-light-tertiary dark:placeholder:text-text-dark-tertiary outline-none transition-all"
            style={{ outline: 'none', boxShadow: 'none' }}
          />
          {/* 自定义下拉菜单 - 在搜索栏内部右侧 */}
          <CustomSelect
            value={typeFilter}
            onChange={(value) => setTypeFilter(value as any)}
            options={[
              { value: 'ALL', label: '全部' },
              { value: 'IMAGE', label: '图片' },
              { value: 'VIDEO', label: '视频' },
              { value: 'AUDIO', label: '音频' },
            ]}
          />
        </div>
      </div>

      {/* 操作按钮 - 右侧 */}
      <div className="fixed top-4 right-8 z-40 flex items-center h-[72px]">
        <div className="flex items-center gap-2 whitespace-nowrap">
          <button
            onClick={() => { setSelectionMode(!selectionMode); if (!selectionMode) setSelectedIds([]); }}
            className={`px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${selectionMode ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-white dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black hover:border-transparent'}`}
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>check_box</span>
            选择
          </button>
          
          <button
            onClick={() => { clearSelection(); setSelectionMode(false); }}
            disabled={!selectionMode}
            className="px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all bg-white dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700 hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black hover:border-transparent disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>close</span>
            取消
          </button>
          
          <button
            onClick={bulkPermanentDelete}
            disabled={!selectionMode || selectedIds.length === 0}
            className={`px-4 py-2.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all ${selectionMode && selectedIds.length > 0 ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-white dark:bg-[#18181b] text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-700'} disabled:opacity-50`}
          >
            <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>delete_forever</span>
            清空
          </button>
        </div>
      </div>

      {/* 内容区域 - 顶部留出header空间 */}
      <div className="pt-36">
      {loading ? (
        <div className="text-center py-12 text-text-light-secondary dark:text-text-dark-secondary">加载中...</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-24 w-24 rounded-full bg-gray-500/10 flex items-center justify-center mb-6">
            <span className="material-symbols-outlined text-gray-500 text-5xl">delete</span>
          </div>
          <h2 className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">回收站为空</h2>
          <p className="text-text-light-secondary dark:text-text-dark-secondary">删除的生成类媒体会出现在这里</p>
        </div>
      ) : (
        <div style={{ columnWidth: 240, columnGap: '16px' }}>
          {items.map((item) => (
            <div 
              key={item.id} 
              className={`relative group mb-4 bg-white/80 dark:bg-black/60 backdrop-blur-xl border ${selectedIds.includes(item.id) ? 'border-black dark:border-white' : 'border-neutral-200 dark:border-neutral-800'} rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg hover:border-neutral-400 dark:hover:border-neutral-600`} 
              style={{ breakInside: 'avoid' }} 
              onClick={() => { if (selectionMode) { toggleSelect(item.id); } else { setPreviewItem(item); } }}
              onMouseEnter={(e) => handleCardHover(e.currentTarget, true)}
              onMouseLeave={(e) => handleCardHover(e.currentTarget, false)}
            >
              {renderPreview(item)}
              
              {/* 选中时的黑色遮罩 */}
              {selectedIds.includes(item.id) && (
                <div className="absolute inset-0 bg-black/50 pointer-events-none"></div>
              )}
              
              {/* 选中时的右上角勾选标识 */}
              {selectedIds.includes(item.id) && (
                <div className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-black dark:bg-white rounded-full shadow-lg">
                  <span className="material-symbols-outlined text-white dark:text-black text-lg" style={{ fontVariationSettings: '"FILL" 1, "wght" 400' }}>check</span>
                </div>
              )}
              
                            
              {/* 下载按钮 - 仅在非选择模式下显示 */}
              {!selectionMode && (
                <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <a href={item.url} download={item.originalName || item.name} onClick={(e) => e.stopPropagation()} className="w-8 h-8 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all shadow-md active:scale-95">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>download</span>
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {previewItem && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
          onClick={() => setPreviewItem(null)}
        >
          <div
            className="rounded-2xl max-w-[90vw] relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-full h-[60vh] flex items-center justify-center">
              {previewItem.type === 'IMAGE' && (
                <img
                  src={previewItem.thumbnail || previewItem.url}
                  alt={previewItem.name}
                  className="max-h-full max-w-full h-full w-auto object-contain"
                />
              )}
              {previewItem.type === 'VIDEO' && (
                <video
                  src={previewItem.url}
                  controls
                  autoPlay
                  className="max-h-full max-w-full h-full w-auto object-contain"
                />
              )}
              {previewItem.type === 'AUDIO' && (
                <div className="w-full h-full flex items-center justify-center">
                  <audio src={previewItem.url} controls className="w-[80%] max-w-[800px]" />
                </div>
              )}
            </div>
            <div className="absolute bottom-4 right-4">
              <a href={previewItem.url} download={previewItem.originalName || previewItem.name} className="w-10 h-10 flex items-center justify-center bg-black/60 dark:bg-white/80 hover:bg-black dark:hover:bg-white text-white dark:text-black rounded-full transition-all shadow-md active:scale-95">
                <span className="material-symbols-outlined text-base" style={{ fontVariationSettings: '"FILL" 0, "wght" 200' }}>download</span>
              </a>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default RecycleBinPage;
