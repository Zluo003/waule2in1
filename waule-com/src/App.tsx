import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, useScroll, useTransform } from 'framer-motion'
import { 
  Shield, Zap, Users, Video, Image, Mic, Brain, 
  Download, Lock, TrendingUp, Workflow, Menu, X, Star, ArrowRight,
  Monitor, Server, Cloud, Check
} from 'lucide-react'

function App() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [activeSection, setActiveSection] = useState('hero')
  const { scrollYProgress } = useScroll()
  const opacity = useTransform(scrollYProgress, [0, 0.1], [1, 0])

  useEffect(() => {
    const handleScroll = () => {
      const sections = ['hero', 'features', 'workflow', 'security', 'pricing']
      const scrollPosition = window.scrollY + 100

      for (const section of sections) {
        const element = document.getElementById(section)
        if (element) {
          const { offsetTop, offsetHeight } = element
          if (scrollPosition >= offsetTop && scrollPosition < offsetTop + offsetHeight) {
            setActiveSection(section)
            break
          }
        }
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navItems = [
    { id: 'features', label: '核心功能' },
    { id: 'workflow', label: '工作流程' },
    { id: 'security', label: '数据安全' },
    { id: 'pricing', label: '版本对比' },
  ]

  const features = [
    {
      icon: <Video className="w-7 h-7" />,
      title: 'AI 视频生成',
      desc: '支持 Sora、Vidu、Minimax 等主流模型，文生视频、图生视频、视频风格化一键完成',
      color: 'from-violet-500 to-purple-600'
    },
    {
      icon: <Image className="w-7 h-7" />,
      title: 'AI 图像创作',
      desc: '集成 Midjourney、Nano Banana Pro 等顶级模型，角色设计、场景绘制、风格迁移轻松实现',
      color: 'from-cyan-500 to-blue-600'
    },
    {
      icon: <Mic className="w-7 h-7" />,
      title: 'AI 音频合成',
      desc: '智能配音、声音克隆、音效设计，打造沉浸式视听体验',
      color: 'from-emerald-500 to-teal-600',
      badge: '即将上线'
    },
    {
      icon: <Brain className="w-7 h-7" />,
      title: '智能分镜',
      desc: 'AI 导演自动拆解剧本，生成专业分镜脚本，支持写实、3D、动漫多种风格',
      color: 'from-orange-500 to-red-600'
    },
    {
      icon: <Workflow className="w-7 h-7" />,
      title: '可视化工作流',
      desc: '节点式创作流程，所见即所得，从创意到成片全程可控',
      color: 'from-pink-500 to-rose-600'
    },
    {
      icon: <Users className="w-7 h-7" />,
      title: '实时协作',
      desc: '多人同时编辑，实时同步，团队创作效率提升 300%',
      color: 'from-indigo-500 to-violet-600'
    },
  ]

  const securityFeatures = [
    { icon: <Server />, title: '本地部署', desc: '服务端部署在企业内网，数据不出内网边界' },
    { icon: <Lock />, title: '数据隔离', desc: '每个企业独立数据空间，严格权限控制' },
    { icon: <Shield />, title: '传输加密', desc: 'TLS 1.3 加密传输，API Key 认证机制' },
    { icon: <Cloud />, title: '混合架构', desc: 'AI 能力云端调用，创作资产本地存储' },
  ]

  const workflowSteps = [
    { num: '01', title: '剧本输入', desc: '导入剧本或直接输入创意文案' },
    { num: '02', title: '智能分镜', desc: 'AI 自动生成专业分镜脚本' },
    { num: '03', title: '素材生成', desc: '一键生成图像、视频、音频素材' },
    { num: '04', title: '精细调整', desc: '可视化编辑，精准控制每个细节' },
    { num: '05', title: '成片导出', desc: '高清导出，支持多种格式' },
  ]

  const comparisonData = [
    { feature: 'AI 视频生成', enterprise: true, basic: true },
    { feature: 'AI 图像创作', enterprise: true, basic: true },
    { feature: 'AI 音频合成', enterprise: true, basic: true },
    { feature: '智能分镜脚本', enterprise: true, basic: true },
    { feature: '实时团队协作', enterprise: true, basic: true },
    { feature: '本地数据存储', enterprise: true, basic: false },
    { feature: '多用户管理', enterprise: true, basic: false },
    { feature: '私有化部署', enterprise: true, basic: false },
    { feature: '专属技术支持', enterprise: true, basic: false },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-gray-900 overflow-x-hidden">
      {/* 背景装饰 */}
      <div className="fixed inset-0 bg-grid-light pointer-events-none" />
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-indigo-400/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-400/10 rounded-full blur-[100px] pointer-events-none" />

      {/* 导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <img src="/weblogo.png" alt="Waule AI" className="h-10" />
              <span className="text-xl font-bold text-gray-900">Waule <span className="text-indigo-600">AI</span></span>
            </motion.div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-8">
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`text-sm font-medium transition-colors ${
                    activeSection === item.id ? 'text-indigo-600' : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {item.label}
                </a>
              ))}
              <a 
                href="#download"
                className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-cyan-600 rounded-lg text-sm font-semibold text-white hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
              >
                立即下载
              </a>
            </div>

            {/* Mobile Menu Button */}
            <button 
              className="md:hidden p-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X /> : <Menu />}
            </button>
          </div>

          {/* Mobile Nav */}
          {isMenuOpen && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="md:hidden pt-4 pb-2"
            >
              {navItems.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block py-3 text-gray-600 hover:text-gray-900"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </motion.div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section id="hero" className="relative min-h-screen flex items-center pt-20">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-100 border border-indigo-200 mb-6">
                <Star className="w-4 h-4 text-indigo-600" />
                <span className="text-sm text-indigo-700">企业级 AI 内容创作平台</span>
              </div>
              
              <h1 className="text-5xl lg:text-6xl font-bold leading-tight mb-6 text-gray-900">
                <span className="gradient-text">AI 驱动</span>的
                <br />短剧制作新范式
              </h1>
              
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                从剧本到成片，Waule AI 为 AI 短剧、漫剧、广告团队提供一站式智能创作解决方案。
                <span className="text-gray-900 font-medium">数据本地存储，创意安全无忧。</span>
              </p>

              <div className="flex flex-wrap gap-4">
                <a 
                  href="#download"
                  className="group inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-indigo-600 to-cyan-600 rounded-xl text-lg font-semibold text-white hover:shadow-xl hover:shadow-indigo-500/30 transition-all"
                >
                  <Download className="w-5 h-5" />
                  免费下载试用
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </a>
                              </div>

              <div className="flex items-center gap-8 mt-12 pt-8 border-t border-gray-200">
                <div>
                  <div className="text-3xl font-bold gradient-text">300%</div>
                  <div className="text-sm text-gray-500">效率提升</div>
                </div>
                <div>
                  <div className="text-3xl font-bold gradient-text">40%</div>
                  <div className="text-sm text-gray-500">成本节约</div>
                </div>
                <div>
                  <div className="text-3xl font-bold gradient-text">100%</div>
                  <div className="text-sm text-gray-500">数据自主</div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-indigo-500/10">
                <div className="aspect-video bg-gradient-to-br from-gray-50 to-white rounded-2xl p-1 border border-gray-200">
                  <div className="w-full h-full rounded-xl bg-white flex items-center justify-center relative overflow-hidden">
                    {/* 模拟工作流界面 */}
                    <div className="absolute inset-4 rounded-lg border border-gray-200">
                      <div className="h-8 bg-gray-100 rounded-t-lg flex items-center px-3 gap-2">
                        <div className="w-3 h-3 rounded-full bg-red-400" />
                        <div className="w-3 h-3 rounded-full bg-yellow-400" />
                        <div className="w-3 h-3 rounded-full bg-green-400" />
                        <span className="text-xs text-gray-500 ml-2">Waule 工作流编辑器</span>
                      </div>
                      <div className="p-4 grid grid-cols-3 gap-3">
                        {[...Array(6)].map((_, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.5 + i * 0.1 }}
                            className="aspect-square rounded-lg bg-gradient-to-br from-indigo-100 to-cyan-100 border border-gray-200 flex items-center justify-center"
                          >
                            <div className="w-8 h-8 rounded bg-indigo-200" />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                      className="absolute -right-20 -bottom-20 w-60 h-60 rounded-full border border-indigo-200"
                    />
                  </div>
                </div>
              </div>
              
              {/* 浮动卡片 */}
              <motion.div
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute -left-6 top-1/4 bg-white rounded-xl p-4 shadow-lg border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">AI 生成中</div>
                    <div className="text-xs text-gray-500">视频渲染 78%</div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                animate={{ y: [0, 10, 0] }}
                transition={{ duration: 5, repeat: Infinity }}
                className="absolute -right-6 bottom-1/4 bg-white rounded-xl p-4 shadow-lg border border-gray-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-900">数据安全</div>
                    <div className="text-xs text-gray-500">本地加密存储</div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </div>

        {/* 滚动提示 */}
        <motion.div 
          style={{ opacity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-6 h-10 rounded-full border-2 border-gray-300 flex items-start justify-center p-2"
          >
            <div className="w-1 h-2 bg-gray-400 rounded-full" />
          </motion.div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-gray-900">
              一站式 <span className="gradient-text">AI 创作</span> 能力
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              整合业界领先的 AI 模型，覆盖视频、图像、音频全链路创作需求
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group relative p-8 rounded-2xl bg-white border border-gray-200 hover:border-indigo-200 hover:shadow-lg transition-all hover:-translate-y-1"
              >
                {'badge' in feature && feature.badge && (
                  <span className="absolute top-4 right-4 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">
                    {feature.badge}
                  </span>
                )}
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">{feature.title}</h3>
                <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>

          {/* AI 模型展示 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-20 text-center"
          >
            <p className="text-sm text-gray-500 mb-6">支持主流 AI 模型</p>
            <div className="flex flex-wrap justify-center items-center gap-4">
              {['Sora', 'Midjourney', 'Vidu', 'Minimax', '豆包', 'Nano Banana Pro'].map((name) => (
                <div key={name} className="px-6 py-3 rounded-lg bg-gray-100 text-gray-600 font-medium">
                  {name}
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-gray-900">
              从创意到成片，<span className="gradient-text">5 步完成</span>
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              可视化工作流让创作过程透明可控，AI 辅助让效率倍增
            </p>
          </motion.div>

          <div className="relative">
            {/* 连接线 */}
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/30 to-transparent" />
            
            <div className="grid lg:grid-cols-5 gap-8">
              {workflowSteps.map((step, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  className="relative text-center"
                >
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-600 flex items-center justify-center text-2xl font-bold text-white mb-4 relative z-10">
                    {step.num}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-600">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 降本增效数据 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-20 grid md:grid-cols-3 gap-8"
          >
            <div className="p-8 rounded-2xl bg-indigo-50 border border-indigo-100 text-center">
              <TrendingUp className="w-10 h-10 mx-auto text-indigo-600 mb-4" />
              <div className="text-4xl font-bold text-gray-900 mb-2">10x</div>
              <div className="text-gray-600">内容产出效率</div>
            </div>
            <div className="p-8 rounded-2xl bg-cyan-50 border border-cyan-100 text-center">
              <Users className="w-10 h-10 mx-auto text-cyan-600 mb-4" />
              <div className="text-4xl font-bold text-gray-900 mb-2">1/3</div>
              <div className="text-gray-600">人力成本</div>
            </div>
            <div className="p-8 rounded-2xl bg-emerald-50 border border-emerald-100 text-center">
              <Zap className="w-10 h-10 mx-auto text-emerald-600 mb-4" />
              <div className="text-4xl font-bold text-gray-900 mb-2">40%</div>
              <div className="text-gray-600">算力成本下降</div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl lg:text-5xl font-bold mb-6 text-gray-900">
                <span className="gradient-text">数据安全</span>
                <br />企业级保障
              </h2>
              <p className="text-xl text-gray-600 mb-8 leading-relaxed">
                所有创作资产存储在您的企业内部服务器，核心数据永不外泄。
                混合云架构设计，兼顾 AI 能力与数据安全。
              </p>
              
              <div className="space-y-6">
                {securityFeatures.map((item, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className="flex items-start gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 mb-1">{item.title}</h4>
                      <p className="text-gray-600 text-sm">{item.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="relative"
            >
              {/* 架构图 */}
              <div className="relative p-8 rounded-2xl bg-white border border-gray-200 shadow-lg">
                <div className="space-y-6">
                  {/* 客户端 */}
                  <div className="flex items-center justify-center">
                    <div className="px-6 py-4 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center gap-3">
                      <Monitor className="w-6 h-6 text-indigo-600" />
                      <span className="font-medium text-gray-900">Waule 客户端</span>
                    </div>
                  </div>
                  
                  <div className="flex justify-center">
                    <div className="w-px h-8 bg-gradient-to-b from-indigo-400 to-cyan-400" />
                  </div>
                  
                  {/* 企业服务端 */}
                  <div className="p-6 rounded-xl bg-emerald-50 border border-emerald-200">
                    <div className="flex items-center gap-3 mb-4">
                      <Server className="w-6 h-6 text-emerald-600" />
                      <span className="font-medium text-gray-900">企业内部服务端</span>
                      <span className="ml-auto text-xs px-2 py-1 rounded bg-emerald-200 text-emerald-700">私有部署</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm text-gray-600">
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        用户数据
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        创作资产
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        项目文件
                      </div>
                      <div className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-emerald-600" />
                        权限管理
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-center">
                    <div className="w-px h-8 bg-gradient-to-b from-cyan-400 to-violet-400" />
                  </div>
                  
                  {/* 云端 */}
                  <div className="p-6 rounded-xl bg-violet-50 border border-violet-200">
                    <div className="flex items-center gap-3 mb-4">
                      <Cloud className="w-6 h-6 text-violet-600" />
                      <span className="font-medium text-gray-900">Waule 云服务</span>
                      <span className="ml-auto text-xs px-2 py-1 rounded bg-violet-200 text-violet-700">加密传输</span>
                    </div>
                    <div className="text-sm text-gray-600">
                      仅处理 AI 生成请求，不存储任何用户数据
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Pricing/Comparison Section */}
      <section id="pricing" className="py-32 relative">
        <div className="max-w-5xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-gray-900">
              选择适合您的 <span className="gradient-text">版本</span>
            </h2>
            <p className="text-xl text-gray-600">
              企业版专为团队协作与数据安全需求打造
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl overflow-hidden border border-gray-200 bg-white shadow-lg"
          >
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left p-6 font-medium text-gray-600">功能特性</th>
                  <th className="p-6 text-center">
                    <div className="text-gray-500 text-sm mb-1">个人版</div>
                    <div className="text-lg font-semibold text-gray-900">基础功能</div>
                  </th>
                  <th className="p-6 text-center bg-indigo-50">
                    <div className="text-indigo-600 text-sm mb-1">企业版</div>
                    <div className="text-lg font-semibold gradient-text">完整功能</div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {comparisonData.map((row, index) => (
                  <tr key={index} className="border-t border-gray-100">
                    <td className="p-5 text-gray-700">{row.feature}</td>
                    <td className="p-5 text-center">
                      {row.basic ? (
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-gray-300 mx-auto" />
                      )}
                    </td>
                    <td className="p-5 text-center bg-indigo-50/50">
                      {row.enterprise ? (
                        <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                      ) : (
                        <X className="w-5 h-5 text-gray-300 mx-auto" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* Download CTA Section */}
      <section id="download" className="py-32 relative">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="relative p-12 rounded-3xl bg-gradient-to-br from-indigo-100 via-white to-cyan-100 border border-indigo-200"
          >
            <div className="relative">
              <h2 className="text-4xl lg:text-5xl font-bold mb-4 text-gray-900">
                开启 AI 创作新时代
              </h2>
              <p className="text-xl text-gray-600 mb-8">
                立即下载 Waule AI，体验企业级 AI 内容创作平台
              </p>
              
              <div className="flex flex-wrap justify-center gap-4">
                <a 
                  href="/download/waule-enterprise-setup.exe"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-xl font-semibold hover:shadow-lg hover:shadow-indigo-500/25 transition-all"
                >
                  <Download className="w-5 h-5" />
                  Windows 版下载
                </a>
                <a 
                  href="/download/waule-enterprise-server.exe"
                  className="inline-flex items-center gap-3 px-8 py-4 bg-white text-gray-900 border border-gray-200 rounded-xl font-semibold hover:bg-gray-50 transition-colors"
                >
                  <Server className="w-5 h-5" />
                  服务端下载
                </a>
              </div>
              
              <p className="mt-6 text-sm text-gray-500">
                支持 Windows 10 及以上版本 · 免费试用 · 无需信用卡
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-200 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src="/weblogo.png" alt="Waule AI" className="h-8" />
              <span className="font-semibold text-gray-900">Waule AI</span>
            </div>
            
            <div className="flex items-center gap-8 text-sm text-gray-500">
              <Link to="/terms" className="hover:text-gray-900 transition-colors">使用条款</Link>
              <Link to="/privacy" className="hover:text-gray-900 transition-colors">隐私政策</Link>
              <a href="mailto:zluo@aivider.com" className="hover:text-gray-900 transition-colors">联系我们</a>
            </div>
            
            <div className="text-sm text-gray-500">
              © 2024 Waule. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
