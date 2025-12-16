import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const MainLayout = () => {
  const location = useLocation();
  const { user } = useAuthStore();

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
    <div className="h-screen flex bg-background-light dark:bg-background-dark">
      {/* Sidebar with Logo */}
      <aside className="w-24 flex-shrink-0 bg-card-light dark:bg-card-dark flex flex-col relative">
        {/* Gradient border on right */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-purple-500/30 via-pink-500/50 to-cyan-500/30"></div>
        {/* Logo at Top - 与顶部和侧边边距相同 */}
        <div className="pt-4 pb-2 flex items-center justify-center">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-pink-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-purple-500/30">
            <span className="text-white text-lg font-bold">W</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex flex-col gap-2 flex-1 px-2 pt-2 pb-4">
          {navigation.map((item) => {
            const isActive = location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg transition-all duration-200 ${isActive
                    ? ''
                    : 'text-slate-700 dark:text-text-dark-secondary hover:bg-card-light-hover dark:hover:bg-card-dark-hover hover:text-slate-900 dark:hover:text-text-dark-primary'
                  }`}
              >
                <span
                  className={`material-symbols-outlined ${isActive ? 'bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent' : ''}`}
                  style={{ fontSize: '25px', fontVariationSettings: '"FILL" 0, "wght" 200' }}
                >
                  {item.icon}
                </span>
                <span className={`text-[10px] font-medium ${isActive ? 'bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent' : ''}`}>
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Theme Toggle */}
        <div className="flex flex-col items-center px-2 py-2">
          <ThemeToggleButton />
        </div>

        {/* Credits Display & Recharge */}
        <Link
          to="/recharge"
          className="flex flex-col items-center justify-center px-2 py-2 mx-2 rounded-lg hover:bg-gradient-to-r hover:from-purple-500/10 hover:to-pink-500/10 transition-all group"
          title="点击充值"
        >
          <span className="material-symbols-outlined text-amber-500 group-hover:scale-110 transition-transform" style={{ fontSize: '20px', fontVariationSettings: '"FILL" 1, "wght" 300' }}>
            stars
          </span>
          <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
            {user?.credits || 0}
          </span>
          <span className="text-[8px] text-slate-400 dark:text-gray-500 group-hover:text-purple-500 transition-colors">
            充值
          </span>
        </Link>

        {/* User Avatar */}
        <div className="flex items-center justify-center px-2 py-3">
          <Link
            to="/settings"
            className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer overflow-hidden hover:ring-2 hover:ring-purple-500/50 transition-all"
            title={user?.nickname || user?.username}
          >
            {user?.avatar ? (
              <img src={user.avatar} alt={user.nickname || user.username} className="h-full w-full rounded-full object-cover" />
            ) : (
              <span className="material-symbols-outlined text-slate-700 dark:text-white" style={{ fontSize: '28px', fontVariationSettings: '"FILL" 0, "wght" 200' }}>account_circle</span>
            )}
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-background-light dark:bg-background-dark global-gradient-bg">
        <Outlet />
      </main>
    </div>
  );
};

export default MainLayout;

// 内联主题切换按钮，保持轻量依赖
import { useTheme } from '../../contexts/ThemeContext';

const ThemeToggleButton = () => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button
      onClick={toggleTheme}
      className={`flex items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 ${isDark ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-200'}`}
      title={isDark ? '切换到明亮模式' : '切换到暗色模式'}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '24px', fontVariationSettings: '"FILL" 0, "wght" 200' }}>{isDark ? 'light_mode' : 'dark_mode'}</span>
    </button>
  );
};
