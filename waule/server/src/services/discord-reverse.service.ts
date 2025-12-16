import WebSocket from 'ws';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import Redis from 'ioredis';
import { SocksProxyAgent } from 'socks-proxy-agent';
// 🔧 使用共享的 Prisma 实例，避免创建多个连接池导致内存泄漏
import { prisma, redis } from '../index';
import { mjTaskStore, type TaskStatus } from './midjourney-task-store';

// 🌐 SOCKS5 代理配置（延迟创建，确保 dotenv.config() 已执行）
let _proxyAgent: SocksProxyAgent | undefined;
let _proxyAgentInitialized = false;
function getProxyAgent(): SocksProxyAgent | undefined {
  if (!_proxyAgentInitialized) {
    const proxyUrl = process.env.SOCKS_PROXY;
    if (proxyUrl) {
      _proxyAgent = new SocksProxyAgent(proxyUrl);
      console.log('🌐 [Discord] 使用 SOCKS5 代理:', proxyUrl);
    }
    _proxyAgentInitialized = true;
  }
  return _proxyAgent;
}

// 重新导出 TaskStatus 类型
export type { TaskStatus };

/**
 * Discord逆向服务
 * 直接通过Discord API与Midjourney Bot交互
 * 🚀 支持 PM2 集群模式：使用 Redis 存储任务状态
 */

// Discord API配置
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_GATEWAY = 'wss://gateway.discord.gg';
const MIDJOURNEY_BOT_ID = '936929561302675456';

interface DiscordConfig {
  userToken: string;
  guildId: string;
  channelId: string;
}

// 🚀 集群模式配置
const DISCORD_LOCK_KEY = 'mj:discord:lock';       // 分布式锁键
const DISCORD_LOCK_TTL = 30;                      // 锁 TTL（秒）
const DISCORD_LOCK_RENEW_INTERVAL = 10000;        // 锁续期间隔（毫秒）
const DISCORD_COMMAND_CHANNEL = 'mj:discord:cmd'; // 命令通道

class DiscordReverseService extends EventEmitter {
  private config: DiscordConfig;
  private httpClient: AxiosInstance;
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private lockRenewInterval: NodeJS.Timeout | null = null;  // 🔒 锁续期定时器
  private sessionId: string | null = null;
  private sequence: number | null = null;
  private isReady: boolean = false;
  private shouldReconnect: boolean = true; // 控制是否自动重连
  
  // 🚀 集群模式：是否持有 Discord 连接锁
  private holdsLock: boolean = false;
  private lockValue: string = '';  // 锁标识（用于安全释放）
  
  // 🚀 集群模式：Redis 命令订阅
  private cmdSubClient: Redis | null = null;
  private cmdPubClient: Redis | null = null;

  constructor(config: DiscordConfig) {
    super();
    this.config = config;
    
    // 生成唯一的锁标识（进程ID + 随机数）
    this.lockValue = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    // 创建HTTP客户端（使用代理）
    this.httpClient = axios.create({
      baseURL: DISCORD_API_BASE,
      headers: {
        'Authorization': this.config.userToken,
        'Content-Type': 'application/json',
      },
      ...(getProxyAgent() ? { httpsAgent: getProxyAgent(), httpAgent: getProxyAgent() } : {}),
    });
    
    if (getProxyAgent()) {
      // 日志已在 getProxyAgent() 中输出
    }
  }

  /**
   * 🚀 集群模式：尝试获取分布式锁
   * 只有获得锁的进程才能连接 Discord WebSocket
   */
  private async tryAcquireLock(): Promise<boolean> {
    try {
      // 使用 SET NX EX 原子操作获取锁
      const result = await redis.set(DISCORD_LOCK_KEY, this.lockValue, 'EX', DISCORD_LOCK_TTL, 'NX');
      if (result === 'OK') {
        this.holdsLock = true;
        console.log(`🔒 [Discord] 进程 ${process.pid} 获得 Discord 连接锁`);
        
        // 启动锁续期
        this.startLockRenewal();
        return true;
      }
      return false;
    } catch (e) {
      console.error('[Discord] 获取锁失败:', e);
      return false;
    }
  }

  /**
   * 🚀 锁续期（防止锁过期导致其他进程抢占）
   */
  private startLockRenewal(): void {
    if (this.lockRenewInterval) {
      clearInterval(this.lockRenewInterval);
    }
    
    this.lockRenewInterval = setInterval(async () => {
      if (this.holdsLock) {
        try {
          // 只有当锁值匹配时才续期
          const currentValue = await redis.get(DISCORD_LOCK_KEY);
          if (currentValue === this.lockValue) {
            await redis.expire(DISCORD_LOCK_KEY, DISCORD_LOCK_TTL);
            // console.log('[Discord] 锁已续期');
          } else {
            console.warn('[Discord] 锁已被其他进程获取，停止续期');
            this.holdsLock = false;
            this.disconnect();
          }
        } catch (e) {
          console.error('[Discord] 锁续期失败:', e);
        }
      }
    }, DISCORD_LOCK_RENEW_INTERVAL);
  }

  /**
   * 🚀 释放分布式锁
   */
  private async releaseLock(): Promise<void> {
    if (!this.holdsLock) return;
    
    try {
      // 使用 Lua 脚本原子释放锁（只有值匹配时才删除）
      const script = `
        if redis.call('get', KEYS[1]) == ARGV[1] then
          return redis.call('del', KEYS[1])
        else
          return 0
        end
      `;
      await redis.eval(script, 1, DISCORD_LOCK_KEY, this.lockValue);
      this.holdsLock = false;
      console.log(`🔓 [Discord] 进程 ${process.pid} 释放了 Discord 连接锁`);
    } catch (e) {
      console.error('[Discord] 释放锁失败:', e);
    }
    
    if (this.lockRenewInterval) {
      clearInterval(this.lockRenewInterval);
      this.lockRenewInterval = null;
    }
  }

  /**
   * 🚀 初始化命令订阅（非主进程用于接收命令结果）
   */
  private async initCommandSubscription(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.cmdSubClient = new Redis(redisUrl);
      this.cmdPubClient = new Redis(redisUrl);
      
      // 订阅命令响应通道
      await this.cmdSubClient.subscribe(`${DISCORD_COMMAND_CHANNEL}:response`);
      
      this.cmdSubClient.on('message', (channel, message) => {
        try {
          const response = JSON.parse(message);
          this.emit(`cmd:${response.requestId}`, response);
        } catch (e) {
          console.error('[Discord] 解析命令响应失败:', e);
        }
      });
      
      console.log('✅ [Discord] 命令订阅已初始化（非主进程模式）');
    } catch (e) {
      console.error('[Discord] 初始化命令订阅失败:', e);
    }
  }

  /**
   * 🚀 初始化命令处理（主进程用于处理来自其他进程的命令）
   */
  private async initCommandHandler(): Promise<void> {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.cmdSubClient = new Redis(redisUrl);
      this.cmdPubClient = new Redis(redisUrl);
      
      // 订阅命令通道
      await this.cmdSubClient.subscribe(`${DISCORD_COMMAND_CHANNEL}:request`);
      
      this.cmdSubClient.on('message', async (channel, message) => {
        try {
          const cmd = JSON.parse(message);
          console.log('[Discord] 收到跨进程命令:', cmd.type, cmd.requestId);
          
          let result: any;
          try {
            switch (cmd.type) {
              case 'imagine':
                result = await this._doImagine(cmd.prompt, cmd.userId, cmd.nodeId, cmd.nonce);
                break;
              case 'action':
                result = await this._doAction(cmd.messageId, cmd.customId, cmd.userId, cmd.nodeId);
                break;
              default:
                result = { error: `未知命令类型: ${cmd.type}` };
            }
          } catch (e: any) {
            result = { error: e.message };
          }
          
          // 发送响应
          await this.cmdPubClient?.publish(
            `${DISCORD_COMMAND_CHANNEL}:response`,
            JSON.stringify({ requestId: cmd.requestId, result })
          );
        } catch (e) {
          console.error('[Discord] 处理命令失败:', e);
        }
      });
      
      console.log('✅ [Discord] 命令处理器已初始化（主进程模式）');
    } catch (e) {
      console.error('[Discord] 初始化命令处理器失败:', e);
    }
  }

  /**
   * 初始化并连接到Discord Gateway
   * 🚀 集群模式：只有获得锁的进程才会真正连接
   */
  async connect(): Promise<void> {
    // 初始化任务存储
    await mjTaskStore.initialize();
    
    // 🚀 尝试获取 Discord 连接锁
    const gotLock = await this.tryAcquireLock();
    
    if (!gotLock) {
      // 没有获得锁，作为从进程运行
      console.log(`⏳ [Discord] 进程 ${process.pid} 未获得锁，作为从进程运行（任务查询仍可用）`);
      await this.initCommandSubscription();
      this.isReady = true; // 标记为就绪（可以查询任务）
      this.emit('ready');
      return;
    }
    
    // 获得锁，作为主进程连接 Discord
    await this.initCommandHandler();
    
    return new Promise((resolve, reject) => {
      console.log(`🔌 [Discord] 进程 ${process.pid} 正在连接到Gateway（主进程）...`);
      
      this.ws = new WebSocket(`${DISCORD_GATEWAY}?v=10&encoding=json`, {
        agent: getProxyAgent(),
      });
      
      this.ws.on('open', () => {
        console.log('✅ [Discord] WebSocket连接已建立');
      });
      
      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });
      
      this.ws.on('error', (error) => {
        console.error('❌ [Discord] WebSocket错误:', error);
        reject(error);
      });
      
      this.ws.on('close', (code, reason) => {
        console.log(`⚠️ [Discord] WebSocket连接已关闭: ${code} - ${reason}`);
        this.isReady = false;
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
        
        // 释放锁
        this.releaseLock().catch(console.error);
        
        // 仅在需要时尝试重连
        if (this.shouldReconnect) {
          setTimeout(() => {
            console.log('🔄 [Discord] 尝试重新连接...');
            this.connect().catch(console.error);
          }, 5000);
        }
      });
      
      // 等待READY事件
      this.once('ready', () => {
        console.log('✅ [Discord] 服务已就绪（主进程）');
        resolve();
      });
    });
  }

  /**
   * 处理Gateway消息
   */
  private handleMessage(data: string): void {
    try {
      const payload = JSON.parse(data);
      const { op, t, d, s } = payload;
      
      // 更新sequence
      if (s !== null) {
        this.sequence = s;
      }
      
      switch (op) {
        case 10: // Hello
          this.handleHello(d);
          break;
        case 0: // Dispatch
          this.handleDispatch(t, d);
          break;
        case 11: // Heartbeat ACK
          console.log('💓 [Discord] 心跳ACK - WebSocket正常');
          break;
        default:
          // console.log(`🔔 [Discord] 收到op ${op} 事件`);
          break;
      }
    } catch (error) {
      console.error('❌ [Discord] 消息解析失败:', error);
    }
  }

  /**
   * 处理Hello事件
   */
  private handleHello(d: any): void {
    console.log('👋 [Discord] 收到Hello，心跳间隔:', d.heartbeat_interval);
    
    // 开始心跳
    this.startHeartbeat(d.heartbeat_interval);
    
    // 发送Identify
    this.identify();
  }

  /**
   * 开始心跳
   */
  private startHeartbeat(interval: number): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          op: 1,
          d: this.sequence,
        }));
        // console.log('💓 [Discord] 发送心跳');
      }
    }, interval);
  }

  /**
   * 发送Identify
   */
  private identify(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    const identifyPayload = {
      op: 2,
      d: {
        token: this.config.userToken,
        properties: {
          os: 'windows',
          browser: 'chrome',
          device: 'chrome',
        },
        intents: 33281, // GUILDS (1) + GUILD_MESSAGES (512) + MESSAGE_CONTENT (32768)
      },
    };
    
    this.ws.send(JSON.stringify(identifyPayload));
    console.log('🔐 [Discord] 已发送Identify');
  }

  /**
   * 处理Dispatch事件
   */
  private handleDispatch(eventType: string, data: any): void {
    // 记录所有事件用于调试
    if (eventType !== 'PRESENCE_UPDATE' && eventType !== 'TYPING_START') {
      console.log(`🔔 [Discord] 事件: ${eventType}`);
    }
    
    switch (eventType) {
      case 'READY':
        console.log('✅ [Discord] READY - 用户:', data.user.username);
        console.log('   Session ID:', data.session_id);
        console.log('   进程 ID:', process.pid);
        console.log('   持有锁:', this.holdsLock);
        this.sessionId = data.session_id;
        this.isReady = true;
        this.emit('ready');
        break;
        
      case 'MESSAGE_CREATE':
        console.log('   → 处理 MESSAGE_CREATE');
        this.handleMessageCreate(data);
        break;
        
      case 'MESSAGE_UPDATE':
        console.log('   → 处理 MESSAGE_UPDATE');
        this.handleMessageUpdate(data);
        break;
        
      default:
        // 其他事件
        break;
    }
  }

  /**
   * 处理消息创建事件
   * 🚀 集群模式：使用 Redis 存储任务状态
   */
  private async handleMessageCreate(message: any): Promise<void> {
    // 只处理Midjourney Bot的消息
    if (message.author?.id !== MIDJOURNEY_BOT_ID) return;
    
    // 只处理指定频道的消息
    if (message.channel_id !== this.config.channelId) return;
    
    console.log('📨 [Discord] 收到Midjourney消息:', message.id);
    console.log('   内容:', message.content?.substring(0, 100));
    console.log('   有nonce:', !!message.nonce, 'nonce值:', message.nonce);
    console.log('   附件数:', message.attachments?.length || 0);
    console.log('   组件数:', message.components?.length || 0);
    
    // 情况1：有nonce且匹配的消息（初始响应）
    const nonce = message.nonce;
    if (nonce) {
      const task = await mjTaskStore.getTask(nonce);
      if (task) {
        await mjTaskStore.updateTask(nonce, {
          messageId: message.id,
          status: 'IN_PROGRESS',
        });
        await mjTaskStore.setMessageToTaskMapping(message.id, nonce);
        console.log('✅ [Discord MESSAGE_CREATE] 任务已匹配（nonce）:', {
          taskId: task.taskId,
          nodeId: task.nodeId,
          messageId: message.id,
          status: 'IN_PROGRESS',
        });
        this.emit('taskUpdate', { ...task, messageId: message.id, status: 'IN_PROGRESS' });
        return;
      }
    }
    
    // 情况2：有按钮的消息（最终完成的消息）
    if (message.components && message.components.length > 0 && message.attachments && message.attachments.length > 0) {
      console.log('📨 [Discord] 收到完成消息（有按钮和附件）');
      console.log('   消息ID:', message.id);
      console.log('   附件URL:', message.attachments?.[0]?.url);
      
      // 🚀 从 Redis 获取待处理任务
      const pendingTasks = await mjTaskStore.getPendingTasks();
      console.log('   🔍 待处理任务数量:', pendingTasks.length);
      
      let matchedTask: TaskStatus | null = null;
      
      // 🔑 首先检查 referenced_message（用于按钮操作）
      if (message.referenced_message && message.id !== message.referenced_message.id) {
        const referencedMsgId = message.referenced_message.id;
        console.log('   🔗 检测到引用消息:', referencedMsgId);
        
        const newImageUrl = message.attachments?.[0]?.url;
        const refImageUrl = message.referenced_message.attachments?.[0]?.url;
        
        if (newImageUrl && newImageUrl !== refImageUrl) {
          const matchingTasks = pendingTasks.filter(t => t.sourceMessageId === referencedMsgId);
          
          if (matchingTasks.length === 1) {
            matchedTask = matchingTasks[0];
            console.log('   ✅ 通过 referenced_message 匹配到按钮操作任务:', matchedTask.taskId);
          } else if (matchingTasks.length > 1) {
            const sortedTasks = matchingTasks.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            matchedTask = sortedTasks[0];
            console.log('   ⚠️ 多个匹配任务，选择最新的:', matchedTask.taskId);
          }
        }
      }
      
      // 只有一个待处理任务时，安全匹配
      if (!matchedTask && pendingTasks.length === 1) {
        matchedTask = pendingTasks[0];
        console.log('   ✅ 安全匹配：只有一个待处理任务:', matchedTask.taskId);
      } else if (!matchedTask && pendingTasks.length > 1 && message.content) {
        // 尝试通过提示词匹配
        const promptMatch = message.content.match(/\*\*(.+?)\s*--/);
        if (promptMatch) {
          const messagePrompt = promptMatch[1].trim();
          matchedTask = pendingTasks.find(t => 
            t.prompt && (t.prompt.includes(messagePrompt) || messagePrompt.includes(t.prompt))
          ) || null;
          if (matchedTask) {
            console.log('   ✅ 通过提示词匹配到任务:', matchedTask.taskId);
          }
        }
      }
      
      if (matchedTask) {
        const buttons = this.parseButtons(message.components);
        const imageUrl = message.attachments?.[0]?.url || '';
        let messageHash: string | undefined;
        
        if (imageUrl) {
          const match = imageUrl.match(/([a-f0-9]{32})/);
          if (match) messageHash = match[1];
        }
        
        const updatedTask = await mjTaskStore.updateTask(matchedTask.taskId, {
          status: 'SUCCESS',
          messageId: message.id,
          imageUrl,
          buttons,
          messageHash,
        });
        
        if (updatedTask) {
          await mjTaskStore.setMessageToTaskMapping(message.id, matchedTask.taskId);
          console.log('✅ [Discord] 任务完成（新消息）:', matchedTask.taskId);
          console.log('   图片URL:', imageUrl);
          console.log('   按钮数量:', buttons?.length || 0);
          this.emit('taskUpdate', updatedTask);
        }
      }
    }
  }

  /**
   * 处理消息更新事件
   * 🚀 集群模式：使用 Redis 存储任务状态
   */
  private async handleMessageUpdate(message: any): Promise<void> {
    // MESSAGE_UPDATE 可能没有 author 字段，先检查频道
    if (message.channel_id !== this.config.channelId) {
      return;
    }
    
    console.log('📝 [Discord] 消息更新:', message.id);
    console.log('   内容预览:', message.content?.substring(0, 50));
    console.log('   附件数量:', message.attachments?.length || 0);
    console.log('   消息nonce:', message.nonce);
    
    // 🚀 从 Redis 查找任务
    let task: TaskStatus | null = null;
    let foundTaskId: string | undefined;
    
    // 方式1：通过 nonce 精确匹配
    const nonce = message.nonce || message.referenced_message?.nonce;
    if (nonce) {
      task = await mjTaskStore.getTask(nonce);
      if (task) {
        foundTaskId = nonce;
        console.log('   ✅ 通过 nonce 精确匹配到任务:', nonce);
      }
    }
    
    // 方式2：通过 messageId 匹配
    if (!task) {
      const taskId = await mjTaskStore.getTaskIdByMessageId(message.id);
      if (taskId) {
        task = await mjTaskStore.getTask(taskId);
        if (task) {
          foundTaskId = taskId;
          console.log('   ✅ 通过 messageId 匹配到任务:', taskId);
        }
      }
    }
    
    // 方式3：通过 referenced_message 匹配按钮操作任务
    if (!task && message.referenced_message) {
      const referencedMsgId = message.referenced_message.id;
      console.log('   🔗 检测到引用消息:', referencedMsgId);
      
      task = await mjTaskStore.findPendingTaskByPromptOrSource(undefined, referencedMsgId);
      if (task) {
        foundTaskId = task.taskId;
        console.log('   ✅ 通过 referenced_message 匹配到按钮操作任务:', task.taskId);
      }
    }
    
    // 方式4：智能 fallback 匹配
    if (!task) {
      const pendingTasks = await mjTaskStore.getPendingTasks();
      console.log('   🔍 待处理任务数量:', pendingTasks.length);
      
      if (pendingTasks.length === 1) {
        task = pendingTasks[0];
        foundTaskId = task.taskId;
        console.log('   ✅ 安全匹配：只有一个待处理任务:', foundTaskId);
      } else if (pendingTasks.length > 1) {
        console.log('   ⚠️ 检测到并发任务，无法安全匹配');
      }
    }
    
    if (!task || !foundTaskId) {
      console.log('   ❌ 未找到匹配任务，跳过此消息更新');
      return;
    }
    
    // 检查图片和按钮
    const hasButtons = message.components && message.components.length > 0;
    
    // 解析进度
    const progressMatch = message.content?.match(/\((\d+)%\)/);
    const progress = progressMatch ? progressMatch[1] + '%' : task.progress;
    
    // 构建更新数据
    const updates: Partial<TaskStatus> = {
      messageId: message.id,
      progress,
    };
    
    // 只有当有按钮时才标记为完成
    if (hasButtons) {
      updates.status = 'SUCCESS';
      updates.imageUrl = message.attachments?.[0]?.url || task.imageUrl;
      updates.buttons = this.parseButtons(message.components);
      
      // 从URL中提取messageHash
      if (updates.imageUrl && !task.messageHash) {
        const match = updates.imageUrl.match(/([a-f0-9]{32})/);
        if (match) {
          updates.messageHash = match[1];
        }
      }
      
      console.log('✅ [Discord] 任务完成（有按钮）:', foundTaskId);
      console.log('   图片URL:', updates.imageUrl);
      console.log('   按钮数量:', updates.buttons?.length || 0);
    } else {
      updates.status = 'IN_PROGRESS';
      console.log('📊 [Discord] 进度更新:', progress);
    }
    
    // 🚀 更新 Redis
    const updatedTask = await mjTaskStore.updateTask(foundTaskId, updates);
    if (updatedTask) {
      await mjTaskStore.setMessageToTaskMapping(message.id, foundTaskId);
      console.log('✅ [Discord MESSAGE_UPDATE] 任务已更新:', {
        taskId: foundTaskId,
        status: updatedTask.status,
        progress: updatedTask.progress,
      });
      this.emit('taskUpdate', updatedTask);
    }
  }

  /**
   * 解析Discord消息组件中的按钮
   */
  private parseButtons(components: any[]): Array<{
    customId: string;
    emoji?: string;
    label: string;
    type: number;
    style: number;
  }> {
    const buttons: Array<{
      customId: string;
      emoji?: string;
      label: string;
      type: number;
      style: number;
    }> = [];
    
    for (const row of components) {
      if (row.type === 1 && row.components) { // Action Row
        for (const button of row.components) {
          if (button.type === 2) { // Button
            buttons.push({
              customId: button.custom_id,
              emoji: button.emoji?.name,
              label: button.label || '',
              type: button.type,
              style: button.style,
            });
          }
        }
      }
    }
    
    return buttons;
  }

  /**
   * 检查用户是否有活跃任务
   * 🚀 集群模式：使用 Redis 存储
   */
  async hasActiveTask(userId: string): Promise<boolean> {
    return mjTaskStore.hasActiveTask(userId);
  }
  
  /**
   * 获取用户的活跃任务
   * 🚀 集群模式：使用 Redis 存储
   */
  async getActiveTask(userId: string): Promise<TaskStatus | null> {
    return mjTaskStore.getActiveTask(userId);
  }
  
  /**
   * 发送Imagine命令
   * 🚀 集群模式：如果不是主进程，通过 Redis 转发到主进程
   */
  async imagine(prompt: string, userId: string, nodeId?: string, nonce?: string): Promise<string> {
    if (!this.isReady) {
      throw new Error('Discord服务未就绪，请稍后重试');
    }
    
    // 🚀 如果不是主进程（没有 WebSocket 连接），通过 Redis 转发命令
    if (!this.holdsLock) {
      return this._forwardCommand('imagine', { prompt, userId, nodeId, nonce });
    }
    
    // 主进程直接执行
    return this._doImagine(prompt, userId, nodeId, nonce);
  }

  /**
   * 🔄 带重试的 HTTP 请求发送
   * 处理 ECONNRESET、ETIMEDOUT 等临时性网络错误
   */
  private async sendWithRetry(url: string, payload: any, maxRetries: number = 3): Promise<any> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`📤 [Discord] 发送请求 (尝试 ${attempt}/${maxRetries})`);
        const response = await this.httpClient.post(url, payload);
        console.log('📥 [Discord] 收到响应:', response.status);
        return response;
      } catch (error: any) {
        lastError = error;
        const errorCode = error.code || '';
        const errorMsg = error.message || '';
        
        // 可重试的网络错误
        const isRetryable = 
          errorCode === 'ECONNRESET' ||
          errorCode === 'ETIMEDOUT' ||
          errorCode === 'ECONNREFUSED' ||
          errorCode === 'ENOTFOUND' ||
          errorCode === 'EAI_AGAIN' ||
          errorMsg.includes('socket hang up') ||
          errorMsg.includes('network') ||
          errorMsg.includes('timeout');
        
        if (isRetryable && attempt < maxRetries) {
          const delay = attempt * 1000; // 1s, 2s, 3s...
          console.warn(`⚠️ [Discord] 请求失败 (${errorCode || errorMsg})，${delay}ms 后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        // 不可重试或已达最大重试次数
        throw error;
      }
    }
    
    throw lastError || new Error('请求失败');
  }

  /**
   * 🚀 实际执行 Imagine 命令（仅主进程调用）
   * 🔒 使用原子锁防止多实例并发提交
   */
  private async _doImagine(prompt: string, userId: string, nodeId?: string, nonce?: string): Promise<string> {
    console.log('🎨 [Discord Imagine] 准备发送命令', {
      userId,
      nodeId,
      promptPreview: prompt.substring(0, 50),
      holdsLock: this.holdsLock,
    });
    
    // 生成唯一的nonce作为任务ID
    const taskId = nonce || `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // 🔒 使用原子锁获取用户任务提交权并创建任务
    const lockResult = await mjTaskStore.tryAcquireLockAndCreateTask({
      taskId,
      userId,
      nodeId,
      prompt,
      status: 'SUBMITTED',
      timestamp: Date.now(),
    });
    
    if (!lockResult.success) {
      console.log(`⚠️ [Discord Imagine] 获取用户锁失败: ${lockResult.reason}`);
      throw new Error(lockResult.reason || '每位用户只允许同时执行一个Midjourney任务');
    }
    
    console.log('🎨 [Discord] 发送Imagine命令:', prompt);
    console.log('   任务ID:', taskId);
    console.log('   用户ID:', userId);
    console.log('   节点ID:', nodeId || '未指定');
    
    try {
      const appId = MIDJOURNEY_BOT_ID;
      const commandId = process.env.DISCORD_IMAGINE_COMMAND_ID || '938956540159881230';
      const versionId = process.env.DISCORD_IMAGINE_VERSION_ID || '1166847114203123795';
      
      const payload = {
        type: 2,
        application_id: appId,
        guild_id: this.config.guildId,
        channel_id: this.config.channelId,
        session_id: this.sessionId,
        data: {
          version: versionId,
          id: commandId,
          name: 'imagine',
          type: 1,
          options: [{ type: 3, name: 'prompt', value: prompt }],
          attachments: [],
        },
        nonce: taskId,
      };
      
      // 🔄 带重试的请求发送（处理网络不稳定）
      const response = await this.sendWithRetry('/interactions', payload, 3);
      
      console.log('✅ [Discord Imagine] 命令已发送:', taskId);
      return taskId;
    } catch (error: any) {
      console.error('❌ [Discord] Imagine命令发送失败:', error.message);
      // 🔓 发送失败时释放锁并删除任务
      await mjTaskStore.deleteTask(taskId).catch(() => {});
      await mjTaskStore.releaseUserLockOnComplete(userId).catch(() => {});
      throw new Error(`Imagine命令发送失败: ${error.message}`);
    }
  }

  /**
   * 执行按钮操作（Upscale、Variation、Reroll）
   * 🚀 集群模式：如果不是主进程，通过 Redis 转发到主进程
   */
  async action(messageId: string, customId: string, userId: string, nodeId?: string): Promise<string> {
    if (!this.isReady) {
      throw new Error('Discord服务未就绪');
    }
    
    // 🚀 如果不是主进程，通过 Redis 转发命令
    if (!this.holdsLock) {
      return this._forwardCommand('action', { messageId, customId, userId, nodeId });
    }
    
    // 主进程直接执行
    return this._doAction(messageId, customId, userId, nodeId);
  }

  /**
   * 🚀 实际执行 Action 命令（仅主进程调用）
   * 🔒 使用原子锁防止多实例并发提交
   */
  private async _doAction(messageId: string, customId: string, userId: string, nodeId?: string): Promise<string> {
    console.log('🎬 [Discord] 执行按钮操作');
    console.log('   消息ID:', messageId);
    console.log('   CustomId:', customId);
    console.log('   用户ID:', userId);
    console.log('   节点ID:', nodeId || '未指定');
    
    const taskId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    
    // 🔒 使用原子锁获取用户任务提交权并创建任务
    const lockResult = await mjTaskStore.tryAcquireLockAndCreateTask({
      taskId,
      userId,
      nodeId,
      sourceMessageId: messageId,
      status: 'SUBMITTED',
      timestamp: Date.now(),
    });
    
    if (!lockResult.success) {
      console.log(`⚠️ [Discord Action] 获取用户锁失败: ${lockResult.reason}`);
      throw new Error(lockResult.reason || '每位用户只允许同时执行一个Midjourney任务');
    }
    
    try {
      // 🔄 带重试的请求发送（处理网络不稳定）
      await this.sendWithRetry('/interactions', {
        type: 3,
        guild_id: this.config.guildId,
        channel_id: this.config.channelId,
        message_flags: 0,
        message_id: messageId,
        application_id: MIDJOURNEY_BOT_ID,
        session_id: this.sessionId,
        data: {
          component_type: 2,
          custom_id: customId,
        },
        nonce: taskId,
      }, 3);
      
      console.log('✅ [Discord] 操作命令已发送，新任务ID:', taskId);
      return taskId;
    } catch (error: any) {
      console.error('❌ [Discord] 操作命令发送失败:', error.message);
      // 🔓 发送失败时释放锁并删除任务
      await mjTaskStore.deleteTask(taskId).catch(() => {});
      await mjTaskStore.releaseUserLockOnComplete(userId).catch(() => {});
      throw new Error(`操作命令发送失败: ${error.message}`);
    }
  }

  /**
   * 🚀 转发命令到主进程（通过 Redis Pub/Sub）
   */
  private async _forwardCommand(type: string, params: any): Promise<string> {
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeAllListeners(`cmd:${requestId}`);
        reject(new Error('命令执行超时'));
      }, 30000);
      
      this.once(`cmd:${requestId}`, (response: { result: any }) => {
        clearTimeout(timeout);
        if (response.result?.error) {
          reject(new Error(response.result.error));
        } else {
          resolve(response.result);
        }
      });
      
      // 发布命令
      this.cmdPubClient?.publish(
        `${DISCORD_COMMAND_CHANNEL}:request`,
        JSON.stringify({ requestId, type, ...params })
      ).catch(reject);
    });
  }

  /**
   * 更新任务的图片URL（用于OSS上传完成后更新）
   * 🚀 集群模式：使用 Redis 存储
   */
  async updateTaskImageUrl(taskId: string, imageUrl: string): Promise<void> {
    const task = await mjTaskStore.getTask(taskId);
    if (task) {
      const oldUrl = task.imageUrl;
      await mjTaskStore.updateTask(taskId, { imageUrl });
      console.log(`[Discord] 更新任务 ${taskId} 的图片URL: ${oldUrl?.substring(0, 50)}... -> ${imageUrl.substring(0, 50)}...`);
      
      // 如果有 nodeId，同时更新数据库中的工作流节点数据
      if (task.nodeId) {
        this.updateWorkflowNodeImageUrl(task.nodeId, oldUrl, imageUrl).catch(e => {
          console.warn(`[Discord] 更新数据库失败（不影响功能）:`, e.message);
        });
      }
    }
  }

  /**
   * 更新数据库中工作流节点的图片URL
   */
  private async updateWorkflowNodeImageUrl(nodeId: string, oldUrl: string | undefined, newUrl: string): Promise<void> {
    // 使用原生 SQL 查询包含该 nodeId 的工作流（JSON 查询）
    const workflows = await prisma.$queryRaw<Array<{ id: string; data: any }>>`
      SELECT id, data FROM workflows 
      WHERE data::text LIKE ${`%"id":"${nodeId}"%`}
      LIMIT 10
    `;
    
    for (const workflow of workflows) {
      const data = workflow.data;
      if (data?.nodes && Array.isArray(data.nodes)) {
        let updated = false;
        for (const node of data.nodes) {
          if (node.id === nodeId && node.data) {
            // 更新 ImagePreview 节点的 imageUrl
            if (node.data.imageUrl && (node.data.imageUrl === oldUrl || node.data.imageUrl.includes('/uploads/midjourney/'))) {
              node.data.imageUrl = newUrl;
              updated = true;
            }
            // 更新 midjourneyData 中的 imageUrl
            if (node.data.midjourneyData?.imageUrl) {
              node.data.midjourneyData.imageUrl = newUrl;
              updated = true;
            }
          }
        }
        
        if (updated) {
          await prisma.workflow.update({
            where: { id: workflow.id },
            data: { data }
          });
          console.log(`[Discord] ✅ 已更新数据库中工作流 ${workflow.id} 节点 ${nodeId} 的图片URL`);
        }
      }
    }
  }

  /**
   * 获取任务状态
   * 🚀 集群模式：使用 Redis 存储
   */
  async getTask(taskId: string): Promise<TaskStatus | null> {
    const task = await mjTaskStore.getTask(taskId);
    if (!task) {
      console.log('⚠️ [Discord] 任务不存在:', taskId);
      return null;
    }
    return task;
  }
  
  /**
   * 清理已完成的任务
   * 🚀 集群模式：Redis TTL 自动清理，此方法保留兼容性
   */
  async cleanupCompletedTask(taskId: string): Promise<void> {
    await mjTaskStore.deleteTask(taskId);
    console.log('🗑️ [Discord] 已清理完成的任务:', taskId);
  }

  /**
   * 等待任务完成
   * 🚀 集群模式：使用 Redis 存储
   */
  async waitForTask(taskId: string, timeoutMs: number = 300000): Promise<TaskStatus> {
    const startTime = Date.now();
    
    while (true) {
      const task = await mjTaskStore.getTask(taskId);
      
      if (!task) {
        throw new Error('任务不存在');
      }
      
      if (task.status === 'SUCCESS') {
        return task;
      }
      
      if (task.status === 'FAILURE') {
        throw new Error(task.failReason || '任务失败');
      }
      
      // 检查超时
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('任务超时');
      }
      
      // 等待 2 秒后重试
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  /**
   * 上传图片到 Discord 获取 CDN URL
   * @param imageBuffer 图片 Buffer
   * @param filename 文件名
   * @returns Discord CDN URL
   */
  async uploadImageToDiscord(imageBuffer: Buffer, filename: string): Promise<string> {
    try {
      console.log(`🖼️ [Discord] 开始上传图片: ${filename}, 大小: ${imageBuffer.length} bytes`);
      
      // 使用 FormData 上传文件
      const FormData = require('form-data');
      const formData = new FormData();
      
      // 添加图片文件
      formData.append('file', imageBuffer, {
        filename: filename,
        contentType: this.getContentType(filename),
      });
      
      // 添加消息内容（可选）
      const payload = {
        content: 'Image upload for Midjourney reference',
      };
      formData.append('payload_json', JSON.stringify(payload));
      
      // 发送 POST 请求到 Discord
      const response = await this.httpClient.post(
        `/channels/${this.config.channelId}/messages`,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        }
      );
      
      console.log('✅ [Discord] 图片上传成功');
      
      // 从响应中提取附件 URL
      if (response.data.attachments && response.data.attachments.length > 0) {
        const attachmentUrl = response.data.attachments[0].url;
        console.log(`📎 [Discord] 附件 URL: ${attachmentUrl}`);
        return attachmentUrl;
      } else {
        throw new Error('上传成功但未找到附件 URL');
      }
    } catch (error: any) {
      console.error('❌ [Discord] 图片上传失败:', error.response?.data || error.message);
      throw new Error(`Discord 图片上传失败: ${error.message}`);
    }
  }
  
  /**
   * 根据文件名获取 Content-Type
   */
  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
    };
    return mimeTypes[ext || 'jpg'] || 'image/jpeg';
  }

  /**
   * 断开连接
   * 🚀 集群模式：释放锁和关闭订阅
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.lockRenewInterval) {
      clearInterval(this.lockRenewInterval);
      this.lockRenewInterval = null;
    }
    
    // 🚀 释放分布式锁
    await this.releaseLock();
    
    // 🚀 关闭 Redis Pub/Sub 连接
    if (this.cmdSubClient) {
      await this.cmdSubClient.quit();
      this.cmdSubClient = null;
    }
    if (this.cmdPubClient) {
      await this.cmdPubClient.quit();
      this.cmdPubClient = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isReady = false;
    console.log(`👋 [Discord] 进程 ${process.pid} 已断开连接`);
  }
}

// 导出单例（如果需要多账号支持，可以导出类）
let discordServiceInstance: DiscordReverseService | null = null;

export function createDiscordService(config: DiscordConfig): DiscordReverseService {
  if (discordServiceInstance) {
    discordServiceInstance.disconnect();
  }
  
  discordServiceInstance = new DiscordReverseService(config);
  return discordServiceInstance;
}

export function getDiscordService(): DiscordReverseService | null {
  return discordServiceInstance;
}

export { DiscordReverseService };
export type { DiscordConfig };

