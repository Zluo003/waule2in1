import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ThemeProvider } from './contexts/ThemeContext';
import { HeaderProvider } from './contexts/HeaderContext';
import App from './App';
import './index.css';

// 屏蔽 redi 重复加载警告（来自第三方依赖）
const originalWarn = console.warn;
console.warn = (...args) => {
  if (args[0]?.includes?.('[redi]') || (typeof args[0] === 'string' && args[0].includes('loading scripts of redi'))) {
    return;
  }
  originalWarn.apply(console, args);
};

// 创建 React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

let hasRendered = false;

const renderApp = () => {
  if (hasRendered) return;
  hasRendered = true;
  
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <ThemeProvider>
      <HeaderProvider>
        <QueryClientProvider client={queryClient}>
          <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <App />
            <Toaster position="top-right" richColors />
          </HashRouter>
        </QueryClientProvider>
      </HeaderProvider>
    </ThemeProvider>,
  );
  
  // 隐藏加载指示器
  setTimeout(() => {
    const splash = document.getElementById('loading-splash');
    if (splash) {
      splash.classList.add('hidden');
      // 完全移除元素
      setTimeout(() => splash.remove(), 300);
    }
  }, 100);
};

renderApp();
