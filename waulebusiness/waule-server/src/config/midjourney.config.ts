export const midjourneyConfig = {
  // 模式选择：'proxy' 或 'discord'
  mode: (process.env.MIDJOURNEY_MODE || 'discord') as 'proxy' | 'discord',
  
  // 是否启用 Discord 连接（用于多实例部署，只让一个实例连接 Discord）
  // 其他实例设为 false，通过 Redis 队列转发任务
  enableDiscord: process.env.ENABLE_DISCORD !== 'false',
  
  // ===== Midjourney Proxy 配置（mode=proxy时使用） =====
  // Midjourney Proxy 服务地址（注意：包含 /mj 路径）
  proxyUrl: process.env.MIDJOURNEY_PROXY_URL || 'http://localhost:8080/mj',
  
  // API 密钥（与 docker-compose 中的 mj.api-secret 保持一致）
  apiSecret: process.env.MIDJOURNEY_API_SECRET || '9eba899a10a2422df986149f5a74b7fef7818fc682b27a21e82c5c4230de0527',
  
  // ===== Discord 直连配置（mode=discord时使用） =====
  discord: {
    // Discord用户Token（必填）
    userToken: process.env.DISCORD_USER_TOKEN || '',
    
    // Discord服务器ID（必填）
    guildId: process.env.DISCORD_GUILD_ID || '',
    
    // Discord频道ID（必填）
    channelId: process.env.DISCORD_CHANNEL_ID || '',
  },
  
  // 轮询间隔（毫秒）
  pollInterval: 2000,
  
  // 最大轮询次数
  maxPollAttempts: 150, // 5分钟（2秒 * 150次）
  
  // 超时时间（毫秒）
  timeout: 300000, // 5分钟
};

export const MIDJOURNEY_TASK_STATUS = {
  SUBMITTED: 'SUBMITTED',     // 已提交
  IN_PROGRESS: 'IN_PROGRESS', // 进行中
  SUCCESS: 'SUCCESS',         // 成功
  FAILURE: 'FAILURE',         // 失败
  NOT_FOUND: 'NOT_FOUND',     // 未找到
} as const;

export type MidjourneyTaskStatus = typeof MIDJOURNEY_TASK_STATUS[keyof typeof MIDJOURNEY_TASK_STATUS];

