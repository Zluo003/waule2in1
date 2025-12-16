import { useAuthStore } from '../store/authStore';

const DashboardPage = () => {
  const { user } = useAuthStore();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-text-light-primary dark:text-text-dark-primary mb-2">欢迎回来, {user?.nickname || user?.username}!</h1>
        <p className="text-text-light-secondary dark:text-text-dark-secondary">这是你的工作台，开始创作你的AI短剧吧</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* 统计卡片 */}
        <div className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-xl p-6 shadow-soft">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-lg bg-tiffany-500/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-tiffany-600 dark:text-tiffany-400">folder</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary">0</p>
              <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">项目总数</p>
            </div>
          </div>
        </div>

        <div className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-xl p-6 shadow-soft">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-lg bg-green-500/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-green-600 dark:text-green-400">photo_library</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary">0</p>
              <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">资产总数</p>
            </div>
          </div>
        </div>

        <div className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-xl p-6 shadow-soft">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-12 w-12 rounded-lg bg-accent-500/20 flex items-center justify-center">
              <span className="material-symbols-outlined text-accent-600 dark:text-accent-400">account_tree</span>
            </div>
            <div>
              <p className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary">0</p>
              <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">工作流数量</p>
            </div>
          </div>
        </div>
      </div>

      {/* 快速操作 */}
      <div className="mt-8">
        <h2 className="text-2xl font-bold text-text-light-primary dark:text-text-dark-primary mb-4">快速操作</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <button className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-xl p-6 hover:border-tiffany-500 hover:shadow-tiffany transition-all text-left">
            <span className="material-symbols-outlined text-tiffany-600 dark:text-tiffany-400 text-3xl mb-2">add_circle</span>
            <h3 className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary mb-1">创建新项目</h3>
            <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">开始一个新的短剧项目</p>
          </button>

          <button className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-xl p-6 hover:border-tiffany-500 hover:shadow-tiffany transition-all text-left">
            <span className="material-symbols-outlined text-tiffany-600 dark:text-tiffany-400 text-3xl mb-2">bolt</span>
            <h3 className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary mb-1">快速创建</h3>
            <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">快速生成素材</p>
          </button>

          <button className="bg-card-light dark:bg-card-dark border border-border-light dark:border-border-dark rounded-xl p-6 hover:border-tiffany-500 hover:shadow-tiffany transition-all text-left">
            <span className="material-symbols-outlined text-tiffany-600 dark:text-tiffany-400 text-3xl mb-2">upload</span>
            <h3 className="text-lg font-bold text-text-light-primary dark:text-text-dark-primary mb-1">上传资产</h3>
            <p className="text-sm text-text-light-secondary dark:text-text-dark-secondary">导入现有素材</p>
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;

