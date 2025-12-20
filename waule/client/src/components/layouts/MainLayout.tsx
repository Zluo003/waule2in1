import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useTheme } from '../../contexts/ThemeContext';

const MainLayout = () => {
  const location = useLocation();
  const { user } = useAuthStore();
  const { theme } = useTheme();

  // 检查是否在工作流页面
  const isWorkflowPage = location.pathname.includes('/workflow');

  const navigation = [
    { name: '快速创作', path: '/quick', icon: 'bolt' },
    { name: '剧集创作', path: '/drama', icon: 'movie' },
    { name: '资产库', path: '/assets', icon: 'photo_library' },
    { name: '回收站', path: '/recycle-bin', icon: 'delete' },
  ];

  if (user?.role === 'ADMIN') {
    navigation.push({ name: '管理后台', path: '/frame25', icon: 'admin_panel_settings' });
  }

  return (
    <div className="h-full bg-background-light dark:bg-background-dark">
      {/* Floating Logo - 左上角 */}
      <div className="fixed top-4 left-4 z-50 pointer-events-none">
        <img 
          src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'} 
          alt="Waule Logo" 
          className="w-[72px] h-[72px] object-contain pointer-events-auto"
        />
      </div>

      {/* Floating Toolbar - 左侧垂直居中 */}
      <nav className="fixed left-[24px] top-1/2 -translate-y-1/2 z-50 flex flex-col gap-1 p-2 rounded-2xl bg-[#deeaef] dark:bg-[#18181b] shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
        {navigation.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'bg-black dark:bg-white text-white dark:text-black'
                  : 'text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white'
              }`}
              title={item.name}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '20px', fontVariationSettings: '"FILL" 0, "wght" 300' }}
              >
                {item.icon}
              </span>
            </Link>
          );
        })}

        {/* 分隔线 */}
        <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />

        {/* Credits & Recharge - 平台版保留 */}
        <Link
          to="/recharge"
          className="flex flex-col items-center justify-center w-10 h-12 rounded-xl transition-all duration-200 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
          title="点击充值"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', fontVariationSettings: '"FILL" 0, "wght" 300' }}>toll</span>
          <span className="text-[9px]">{Math.floor(user?.credits || 0)}</span>
        </Link>

        {/* 分隔线 */}
        <div className="h-px bg-neutral-200 dark:bg-neutral-700 my-1" />

        {/* Theme Toggle */}
        <ThemeToggleButton />

        {/* User Avatar */}
        <Link
          to="/settings"
          className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          title={user?.nickname || user?.username || '设置'}
        >
          {user?.avatar ? (
            <img src={user.avatar} alt={user.nickname || user.username} className="w-6 h-6 rounded-full object-cover" />
          ) : (
            <span className="material-symbols-outlined" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 0, "wght" 300' }}>account_circle</span>
          )}
        </Link>
      </nav>

      {/* Main Content - 工作流页面不需要左侧边距 */}
      <main className={`h-full overflow-auto scrollbar-hide ${isWorkflowPage ? '' : 'pl-[136px]'}`}>
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;

// 内联主题切换按钮
const ThemeToggleButton = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-white"
      title={isDark ? '切换到明亮模式' : '切换到暗色模式'}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 0, "wght" 300' }}>{isDark ? 'light_mode' : 'dark_mode'}</span>
    </button>
  );
};
