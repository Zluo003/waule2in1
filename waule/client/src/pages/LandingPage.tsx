import { useState, useEffect, useRef } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import LoginModal from '../components/landing/LoginModal';

// OSS CDN 加速地址
const OSS_BASE = 'https://aivider.oss-accelerate.aliyuncs.com/aivider/showcase';

// 示例作品数据 - 使用阿里云 OSS CDN 加速
const showcaseItems = [
  { id: 1, src: `${OSS_BASE}/video1.mp4`, title: '都市时尚' },
  { id: 2, src: `${OSS_BASE}/video2.mp4`, title: '光影艺术' },
  { id: 3, src: `${OSS_BASE}/video3.mp4`, title: '未来时装' },
  { id: 4, src: `${OSS_BASE}/video4.mp4`, title: '液态金属' },
  { id: 5, src: `${OSS_BASE}/video5.mp4`, title: '沙漠高定' },
  { id: 6, src: `${OSS_BASE}/video6.mp4`, title: '樱花雨中' },
  { id: 7, src: `${OSS_BASE}/video7.mp4`, title: '冰川时尚' },
  { id: 8, src: `${OSS_BASE}/video8.mp4`, title: '前卫时装' },
];

// 功能特性
const features = [
  {
    icon: 'movie',
    title: 'AI 视频生成',
    desc: '支持 Sora、Vidu、可灵等顶级模型，文字描述即可生成电影级画面',
  },
  {
    icon: 'image',
    title: 'AI 图像创作',
    desc: '集成 Midjourney、Flux 等主流引擎，风格百变，创意无限',
  },
  {
    icon: 'account_tree',
    title: '可视化工作流',
    desc: '节点式拖拽编排，图像、视频、音频无缝串联，复杂创作轻松掌控',
  },
  {
    icon: 'group',
    title: '实时协作',
    desc: '多人同时在线编辑，创意即时同步，团队协作效率提升 10 倍',
  },
];

// Hero 背景视频列表 - 使用阿里云 OSS CDN 加速
const heroVideos = [
  `${OSS_BASE}/hero1.mp4`,
  `${OSS_BASE}/hero2.mp4`,
  `${OSS_BASE}/hero3.mp4`,
];

const LandingPage = () => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [currentHeroVideo, setCurrentHeroVideo] = useState(0);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const heroVideoRef = useRef<HTMLVideoElement>(null);
  const showcaseRef = useRef<HTMLDivElement>(null);
  
  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 600], [1, 0]);
  const heroScale = useTransform(scrollY, [0, 600], [1, 1.1]);
  const textY = useTransform(scrollY, [0, 400], [0, 100]);

  // Hero 视频轮播
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHeroVideo((prev) => (prev + 1) % heroVideos.length);
    }, 8000);
    return () => clearInterval(interval);
  }, []);

  // 作品展示区自动滚动
  useEffect(() => {
    const container = showcaseRef.current;
    if (!container) return;
    
    let animationId: number;
    let scrollPos = 0;
    const speed = 0.5;
    
    const animate = () => {
      scrollPos += speed;
      if (scrollPos >= container.scrollWidth / 2) {
        scrollPos = 0;
      }
      container.scrollLeft = scrollPos;
      animationId = requestAnimationFrame(animate);
    };
    
    animationId = requestAnimationFrame(animate);
    
    // 鼠标悬停暂停
    const handleMouseEnter = () => cancelAnimationFrame(animationId);
    const handleMouseLeave = () => { animationId = requestAnimationFrame(animate); };
    
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    
    return () => {
      cancelAnimationFrame(animationId);
      container.removeEventListener('mouseenter', handleMouseEnter);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#030014] text-white overflow-x-hidden">
      {/* 固定导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-end justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <img src="/logo-dark.png" alt="Waule" className="h-16" />
          </div>
          
          {/* 开始创作按钮 */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowLoginModal(true)}
            className="px-6 py-2.5 bg-white text-black font-semibold rounded-full hover:bg-gray-100 transition-colors shadow-lg shadow-white/20"
          >
            开始创作
          </motion.button>
        </div>
      </nav>

      {/* Hero Section - 全屏视频背景 */}
      <section className="relative h-screen overflow-hidden">
        {/* 视频背景 */}
        <motion.div 
          style={{ opacity: heroOpacity, scale: heroScale }}
          className="absolute inset-0"
        >
          <AnimatePresence mode="wait">
            <motion.video
              key={currentHeroVideo}
              ref={heroVideoRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: isVideoLoaded ? 1 : 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5 }}
              autoPlay
              muted
              loop
              playsInline
              onLoadedData={() => setIsVideoLoaded(true)}
              className="absolute inset-0 w-full h-full object-cover"
              src={heroVideos[currentHeroVideo]}
            />
          </AnimatePresence>
          
          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#030014]/40 via-[#030014]/20 to-[#030014]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#030014]/60 via-transparent to-[#030014]/60" />
        </motion.div>

        {/* 占位背景（视频加载前） */}
        {!isVideoLoaded && (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0c0118] via-[#0a0a1a] to-[#030014]">
            <div className="absolute top-[-30%] left-[-20%] w-[70%] h-[70%] bg-neutral-600/10 rounded-full blur-[150px]" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[60%] bg-neutral-600/8 rounded-full blur-[130px]" />
          </div>
        )}

        {/* Hero 内容 */}
        <motion.div 
          style={{ y: textY }}
          className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6"
        >
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-7xl md:text-9xl font-bold mb-6 tracking-tight"
          >
            哇噢
          </motion.h1>
          
          <motion.h2
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="text-2xl md:text-4xl font-bold mb-6"
          >
            <span className="bg-gradient-to-r from-neutral-300 via-white to-neutral-300 bg-clip-text text-transparent">
              不可思议的 AI 创作平台
            </span>
          </motion.h2>
          
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.6 }}
            className="text-gray-400 text-lg md:text-xl max-w-2xl mb-10"
          >
            释放你的想象力，用 AI 的力量创造令人惊叹的视频和图像
          </motion.p>
          
          <motion.button
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.8 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowLoginModal(true)}
            className="px-10 py-4 bg-white text-black font-bold text-lg rounded-full hover:bg-gray-100 transition-all shadow-2xl shadow-white/20"
          >
            立即体验
          </motion.button>

          {/* 视频指示器 */}
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-2">
            {heroVideos.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentHeroVideo(i)}
                className={`w-2 h-2 rounded-full transition-all duration-300 ${
                  i === currentHeroVideo ? 'bg-white w-8' : 'bg-white/30 hover:bg-white/50'
                }`}
              />
            ))}
          </div>

          {/* 滚动提示 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
          >
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-6 h-10 border-2 border-white/30 rounded-full flex items-start justify-center p-2"
            >
              <div className="w-1 h-2 bg-white/50 rounded-full" />
            </motion.div>
          </motion.div>
        </motion.div>
      </section>

      {/* 作品展示区 - 无限滚动画廊 */}
      <section className="py-24 relative overflow-hidden">
        {/* 背景装饰 */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#030014] via-[#050520] to-[#030014]" />
        
        <div className="relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16 px-6"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">AI 创作无限可能</h2>
            <p className="text-gray-400 text-lg">探索由 AI 生成的惊艳视觉作品</p>
          </motion.div>

          {/* 横向滚动画廊 */}
          <div 
            ref={showcaseRef}
            className="flex gap-6 overflow-x-hidden px-6 py-4"
            style={{ scrollBehavior: 'auto' }}
          >
            {/* 复制两份实现无缝滚动 */}
            {[...showcaseItems, ...showcaseItems].map((item, index) => (
              <motion.div
                key={`${item.id}-${index}`}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                whileHover={{ scale: 1.02, y: -8 }}
                transition={{ duration: 0.4 }}
                className="relative flex-shrink-0 w-[300px] md:w-[400px] aspect-[16/10] rounded-2xl overflow-hidden group cursor-pointer"
              >
                <video
                  src={item.src}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                />
                
                {/* Hover 遮罩 */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="absolute bottom-4 left-4 right-4">
                    <p className="text-white font-semibold text-lg">{item.title}</p>
                    <span className="inline-flex items-center gap-1 text-white/70 text-sm mt-1">
                      <span className="material-symbols-outlined text-sm">play_circle</span>
                      AI 视频
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* 功能特性 */}
      <section className="py-24 px-6 relative">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold mb-4">强大功能，简单易用</h2>
            <p className="text-gray-400 text-lg">专为创作者打造的 AI 创作工具</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 40 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                whileHover={{ y: -4 }}
                className="relative p-6 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-sm group"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-5 group-hover:bg-white/10 transition-colors duration-300">
                  <span className="material-symbols-outlined text-white/70 text-xl">{feature.icon}</span>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 relative overflow-hidden">
        {/* 背景效果 */}
        <div className="absolute inset-0">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-neutral-600/10 rounded-full blur-[200px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="relative z-10 max-w-4xl mx-auto text-center"
        >
          <h2 className="text-4xl md:text-6xl font-bold mb-6">
            准备好开始创作了吗？
          </h2>
          <p className="text-gray-400 text-xl mb-10 max-w-2xl mx-auto">
            加入数万创作者的行列，用 AI 释放你的创造力
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowLoginModal(true)}
            className="px-12 py-5 bg-white text-black font-bold text-lg rounded-full hover:bg-gray-100 transition-all shadow-2xl shadow-white/20"
          >
            免费开始
          </motion.button>
        </motion.div>
      </section>

      {/* 页脚 */}
      <footer className="py-8 px-6 border-t border-white/10">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/logo-dark.png" alt="Waule" className="h-12 opacity-60" />
            <span className="text-gray-400">© 2025 Waule.ai</span>
          </div>
          
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <a href="/terms" className="hover:text-white transition-colors">服务条款</a>
            <a href="/privacy" className="hover:text-white transition-colors">隐私政策</a>
          </div>
        </div>
      </footer>

      {/* 登录弹窗 */}
      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
    </div>
  );
};

export default LandingPage;
