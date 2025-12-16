# AIVIDER - AI视频短剧制作平台

一个一站式AI视频（短剧）制作网站，提供完整的从小说改编到视频生成的工作流。

## 🌟 核心功能

### 1. 无限画布工作流编辑器 ✅
- ✨ **React Flow专业画布**：流畅的拖拽和缩放体验
- ✨ **右键菜单**：右击画布即可添加节点
- ✨ **鼠标滚轮缩放**：无限放大和缩小
- ✨ **自动保存**：2秒防抖自动保存，刷新不丢失
- ✨ **实时状态**：顶部显示保存状态和AI模型统计
- 可视化节点连接系统
- 小地图和控制面板

### 2. AI驱动的内容生成
- **LLM剧本改编**：将小说原著改编成快节奏短剧剧本
- **智能分镜**：自动按集分解剧本成分镜
- **AI图片生成**：根据分镜描述生成图片
- **AI视频生成**：将图片转换成视频

### 3. 节点工作流系统 ✅
支持4种节点类型（完整UI）：
- 🤖 **智能体节点**（蓝色）：文本处理、剧本改编、分镜生成
- 🎨 **AI图片节点**（紫色）：AI绘图、支持图生图、多种比例
- 🎬 **AI视频节点**（绿色）：图片转视频、设置时长和帧率
- 📤 **上传素材节点**（橙色）：支持PNG、JPG、MP4、MP3、PDF、DOCX等

每个节点支持：
- 展开/折叠配置
- 拖动移动
- 连接其他节点
- 独立配置表单

### 4. 资产管理系统
- 集中管理所有生成的图片和视频
- 智能搜索和过滤
- 即使工作流被删除，资产仍然保留
- 支持预览、下载、删除

### 5. 用户系统
- 用户注册和登录
- 个人资料管理（头像、昵称）
- 密码修改
- 项目权限管理

### 6. 管理后台（全新升级！）
- **用户管理**: 查看、编辑、禁用用户
- **AI模型配置**: 
  - ✨ 傻瓜式配置界面（无需编写JSON）
  - 支持文本、图片、视频三种模型类型
  - 每种类型都有专属的参数配置表单
  - 预设12+个主流AI模型
  - 支持豆包SeedDream 4.0、Gemini 2.5 Pro等最新模型
- **系统设置**: 全局配置管理
- **统计分析**: 使用情况和成本监控

### 7. 快速创建模式
- 快速在无限画布创建工作流
- 适用于临时快速素材生成
- 一键导出功能

## 🏗️ 技术架构

### 前端
- **React 18** + **TypeScript** - 现代化UI框架
- **Tailwind CSS** - 实用优先的CSS框架
- **React Flow** - 无限画布和节点编辑器
- **React Router** - 路由管理
- **Zustand** - 状态管理
- **Axios** - HTTP客户端
- **React Query** - 数据获取和缓存

### 后端
- **Node.js** + **Express** - RESTful API服务器
- **PostgreSQL** - 主数据库
- **Redis** - 缓存和会话管理
- **Prisma** - ORM和数据库工具
- **JWT** - 用户认证
- **Multer** - 文件上传

### AI服务集成
- **文本生成**: OpenAI GPT-4/3.5、Google Gemini 2.5 Pro、豆包
- **图片生成**: DALL-E 3、豆包SeedDream 4.0、Gemini 2.5 Flash、Stable Diffusion XL、**Midjourney (Discord逆向) ✨**
- **视频生成**: Runway Gen-3、Pika 1.5、Stable Video Diffusion

**Midjourney集成特色**：
- ✅ 支持两种模式：Proxy代理模式 和 Discord逆向模式（推荐）
- ✅ Discord模式无需部署额外Docker容器
- ✅ 完整支持V7.0最新版本、多种宽高比
- ✅ 支持Upscale、Variation、Reroll等所有操作
- ✅ 实时WebSocket连接，即时获取生成状态

### 存储
- **AWS S3 / 阿里云OSS** - 媒体文件存储
- **本地存储** - 开发环境

## 📁 项目结构

```
AIVIDER/
├── client/                 # 前端应用
│   ├── public/            # 静态资源
│   ├── src/
│   │   ├── components/    # React组件
│   │   ├── pages/         # 页面组件
│   │   ├── hooks/         # 自定义Hooks
│   │   ├── store/         # 状态管理
│   │   ├── api/           # API调用
│   │   ├── utils/         # 工具函数
│   │   ├── types/         # TypeScript类型定义
│   │   └── App.tsx        # 应用入口
│   ├── package.json
│   └── tailwind.config.js
│
├── server/                # 后端应用
│   ├── src/
│   │   ├── controllers/   # 控制器
│   │   ├── models/        # 数据模型
│   │   ├── routes/        # 路由
│   │   ├── middleware/    # 中间件
│   │   ├── services/      # 业务逻辑
│   │   ├── utils/         # 工具函数
│   │   └── index.ts       # 服务器入口
│   ├── prisma/            # 数据库schema
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                # 共享代码
│   └── types/            # 共享类型定义
│
├── UIDesign/             # UI设计参考文件
├── docker-compose.yml    # Docker配置
└── README.md            # 本文件
```

## 🚀 快速开始

### 环境要求
- Node.js >= 18.x
- PostgreSQL >= 14.x
- Redis >= 6.x
- npm 或 yarn

### 安装

1. 克隆仓库
```bash
git clone <repository-url>
cd AIVIDER
```

2. 安装依赖
```bash
# 安装后端依赖
cd server
npm install

# 安装前端依赖
cd ../client
npm install
```

3. 配置环境变量
```bash
# 后端配置
cd server
cp .env.example .env
# 编辑 .env 文件，填入必要的配置

# 前端配置
cd ../client
cp .env.example .env
# 编辑 .env 文件，填入API地址
```

4. 初始化数据库
```bash
cd server
npx prisma migrate dev
npx prisma db seed
```

5. 启动开发服务器
```bash
# 启动后端 (在 server 目录)
npm run dev

# 启动前端 (在 client 目录，新终端)
npm run dev
```

6. 访问应用
- 前端: http://localhost:5173
- 后端API: http://localhost:3000
- API文档: http://localhost:3000/api-docs

## 📖 使用指南

### 创建新项目
1. 点击"创建新项目"按钮
2. 输入项目名称和描述
3. 选择项目类型（短剧/快速生成）

### 使用工作流编辑器
1. 在无限画布上点击右键或使用左侧工具栏添加节点
2. 拖拽节点的连接点创建连接
3. 双击节点进行编辑
4. 点击"运行"执行工作流

### AI剧本改编
1. 创建文本处理节点
2. 粘贴小说原文
3. 点击"AI改编"按钮
4. 系统自动生成短剧剧本和分镜

### 生成图片和视频
1. 连接分镜节点到图片生成节点
2. 调整AI提示词参数
3. 点击"生成"开始创作
4. 生成的资产自动保存到资产库

## 🔧 配置说明

### AI服务配置
在 `server/.env` 中配置：
```env
OPENAI_API_KEY=your_openai_key
STABLE_DIFFUSION_API_KEY=your_sd_key
RUNWAY_API_KEY=your_runway_key

# Midjourney配置（推荐使用Discord模式）
MIDJOURNEY_MODE=discord
DISCORD_USER_TOKEN=your_discord_token
DISCORD_GUILD_ID=your_server_id
DISCORD_CHANNEL_ID=your_channel_id
```

**Midjourney快速配置**：查看 [MIDJOURNEY_DISCORD_QUICKSTART.md](./MIDJOURNEY_DISCORD_QUICKSTART.md)

**详细配置指南**：查看 [DISCORD_REVERSE_SETUP.md](./DISCORD_REVERSE_SETUP.md)

### 存储配置
```env
STORAGE_TYPE=s3  # 或 local
AWS_S3_BUCKET=your_bucket
AWS_ACCESS_KEY_ID=your_key
AWS_SECRET_ACCESS_KEY=your_secret
```

## 🎨 UI设计

UI设计参考文件位于 `UIDesign/` 目录，包含：
- 工作流画布界面
- 资产管理界面
- 用户设置界面
- 管理后台界面
- 项目列表界面

设计风格：
- 深色主题
- 主色调：#1337ec（电蓝色）
- 字体：Space Grotesk
- 图标：Material Symbols Outlined

## 📝 API文档

完整的API文档可以在启动服务器后访问：
http://localhost:3000/api-docs

主要端点：
- `/api/auth/*` - 用户认证
- `/api/projects/*` - 项目管理
- `/api/workflows/*` - 工作流管理
- `/api/assets/*` - 资产管理
- `/api/ai/*` - AI服务
- `/api/admin/*` - 管理后台

## 🐳 Docker部署

使用Docker Compose快速部署：

```bash
docker-compose up -d
```

这将启动：
- PostgreSQL数据库
- Redis缓存
- 后端服务器
- 前端应用

## 🤝 贡献指南

欢迎贡献！请遵循以下步骤：
1. Fork本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 👥 作者

AIVIDER Team

## 🙏 致谢

- UI设计灵感来自现代视频编辑工具
- 感谢所有开源项目的贡献者

## 📞 联系方式

如有问题或建议，请通过以下方式联系：
- 提交 Issue
- 发送邮件至：support@aivider.com

---

**注意**: 本项目仍在积极开发中，某些功能可能尚未完全实现。

