import { memo, useEffect, useState } from 'react';
import { apiClient } from '../../lib/api';

interface Role {
  id: string;
  name: string;
  metadata: {
    kind: 'ROLE';
    name: string;
    images: {
      faceAssetId?: string | null;
      frontAssetId?: string | null;
      sideAssetId?: string | null;
    };
  };
  thumbnail?: string;
}

interface RoleMentionPickerProps {
  onSelect: (roleName: string, roleId: string) => void;
  onClose: () => void;
  position: { top: number; left: number };
}

const RoleMentionPicker = ({ onSelect, onClose, position }: RoleMentionPickerProps) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const loadRoles = async () => {
      try {
        // 获取所有资产库
        const response = await apiClient.assetLibraries.getAll();
        const libraries = response.data || response || [];
        const allRoles: Role[] = [];

        console.log('[RoleMentionPicker] 获取到资产库数量:', libraries.length);

        // 从每个角色库获取角色
        for (const lib of libraries) {
          // 只处理角色库
          if (lib.category !== 'ROLE') {
            continue;
          }

          try {
            const roleResponse = await apiClient.assetLibraries.roles.list(lib.id);
            const roleList = roleResponse.data || roleResponse || [];
            console.log(`[RoleMentionPicker] 从库 "${lib.name}" 获取到 ${roleList.length} 个角色`);
            allRoles.push(...roleList);
          } catch (error) {
            console.error(`[RoleMentionPicker] 从库 ${lib.id} 加载角色失败:`, error);
          }
        }

        console.log('[RoleMentionPicker] 总共加载角色数量:', allRoles.length);
        setRoles(allRoles);
      } catch (error) {
        console.error('[RoleMentionPicker] 加载角色失败:', error);
      } finally {
        setLoading(false);
      }
    };

    loadRoles();
  }, []);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, roles.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (roles[selectedIndex]) {
          onSelect(roles[selectedIndex].metadata.name, roles[selectedIndex].id);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [roles, selectedIndex, onSelect, onClose]);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.role-mention-picker')) {
        onClose();
      }
    };

    // 延迟添加监听器，避免立即触发
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (loading) {
    return (
      <div
        className="role-mention-picker fixed z-[10000] bg-white dark:bg-gray-800 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl p-3"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          minWidth: '200px',
        }}
      >
        <div className="text-xs text-slate-500 dark:text-gray-400 text-center">
          加载角色中...
        </div>
      </div>
    );
  }

  if (roles.length === 0) {
    return (
      <div
        className="role-mention-picker fixed z-[10000] bg-white dark:bg-gray-800 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl p-3"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          minWidth: '200px',
        }}
      >
        <div className="text-xs text-slate-500 dark:text-gray-400 text-center">
          暂无可用角色
        </div>
        <div className="text-[10px] text-slate-400 dark:text-gray-500 text-center mt-1">
          请先在资产库中创建角色
        </div>
      </div>
    );
  }

  return (
    <div
      className="role-mention-picker fixed z-[10000] bg-white dark:bg-gray-800 border border-slate-200 dark:border-white/10 rounded-lg shadow-xl overflow-hidden"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        minWidth: '220px',
        maxHeight: '300px',
        overflowY: 'auto',
      }}
    >
      <div className="p-2 border-b border-slate-200 dark:border-white/10">
        <div className="text-[10px] font-bold text-slate-500 dark:text-gray-400 uppercase tracking-wider">
          选择角色
        </div>
      </div>
      <div className="py-1">
        {roles.map((role, index) => (
          <button
            key={role.id}
            type="button"
            onClick={() => onSelect(role.metadata.name, role.id)}
            className={`w-full px-3 py-2 text-left flex items-center gap-2 transition-colors ${
              index === selectedIndex
                ? 'bg-purple-500/20 dark:bg-purple-500/30'
                : 'hover:bg-slate-100 dark:hover:bg-white/5'
            }`}
          >
            {role.thumbnail ? (
              <img
                src={role.thumbnail}
                alt={role.metadata.name}
                className="w-8 h-8 rounded-full object-cover border border-slate-200 dark:border-white/10"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-purple-500/20 dark:bg-purple-500/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-purple-500 dark:text-purple-400 text-base">
                  person
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                @{role.metadata.name}
              </div>
            </div>
            {index === selectedIndex && (
              <span className="material-symbols-outlined text-purple-500 dark:text-purple-400 text-sm">
                arrow_forward
              </span>
            )}
          </button>
        ))}
      </div>
      <div className="p-2 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5">
        <div className="text-[10px] text-slate-500 dark:text-gray-500">
          <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-slate-300 dark:border-white/20 rounded text-[9px]">
            ↑↓
          </kbd>{' '}
          导航{' '}
          <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-slate-300 dark:border-white/20 rounded text-[9px]">
            Enter
          </kbd>{' '}
          选择{' '}
          <kbd className="px-1 py-0.5 bg-white dark:bg-gray-700 border border-slate-300 dark:border-white/20 rounded text-[9px]">
            Esc
          </kbd>{' '}
          关闭
        </div>
      </div>
    </div>
  );
};

export default memo(RoleMentionPicker);
