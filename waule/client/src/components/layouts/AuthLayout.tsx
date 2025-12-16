import { Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

const AuthLayout = () => {
  const { isAuthenticated } = useAuthStore();

  if (isAuthenticated) {
    return <Navigate to="/quick" replace />;
  }

  return (
    <div className="min-h-screen bg-background-dark flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="h-12 w-12 flex items-center justify-center rounded-lg bg-primary">
            <span className="material-symbols-outlined text-white text-2xl">movie</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold text-white">Waule</h1>
            <p className="text-sm text-gray-400">AI视频短剧制作平台</p>
          </div>
        </div>
        <Outlet />
      </div>
    </div>
  );
};

export default AuthLayout;

