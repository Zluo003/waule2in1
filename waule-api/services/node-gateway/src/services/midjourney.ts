/**
 * Midjourney Discord 服务 - 多账号连接池版本
 * 支持多账号轮询，提高并发能力
 */

import WebSocket from 'ws';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';
import { downloadAndUploadToOss } from '../oss';
import {
  DiscordAccount,
  getActiveDiscordAccounts,
  recordDiscordAccountUsage,
  createMjTask,
  getMjTask,
  updateMjTask,
  getPendingMjTasks,
  getMjTaskByMessageId,
  MjTask,
  MjButton,
  getConfig,
} from '../db';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_GATEWAY = 'wss://gateway.discord.gg';
const MIDJOURNEY_BOT_ID = '936929561302675456';

function log(msg: string, data?: any) {
  console.log(`[${new Date().toISOString()}] [MJ] ${msg}`, data || '');
}

interface DiscordConfig {
  userToken: string;
  guildId: string;
  channelId: string;
  accountId: number;
  accountName?: string;
}

// 单个 Discord 连接实例
class DiscordConnection extends EventEmitter {
  public config: DiscordConfig;
  private httpClient: AxiosInstance;
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string | null = null;
  private sequence: number | null = null;
  private isReady: boolean = false;
  private shouldReconnect: boolean = true;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  constructor(account: DiscordAccount) {
    super();
    this.config = {
      userToken: account.user_token,
      guildId: account.guild_id,
      channelId: account.channel_id,
      accountId: account.id,
      accountName: account.name || `账号${account.id}`,
    };
    this.httpClient = axios.create({
      baseURL: DISCORD_API_BASE,
      headers: {
        'Authorization': this.config.userToken,
        'Content-Type': 'application/json',
      },
    });
  }

  get ready(): boolean {
    return this.isReady;
  }

  get accountId(): number {
    return this.config.accountId;
  }

  get accountName(): string {
    return this.config.accountName || `账号${this.config.accountId}`;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      log(`[${this.accountName}] 正在连接到Discord Gateway...`);

      this.ws = new WebSocket(`${DISCORD_GATEWAY}?v=10&encoding=json`);

      this.ws.on('open', () => {
        log(`[${this.accountName}] WebSocket连接已建立`);
        this.reconnectAttempts = 0;
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error) => {
        log(`[${this.accountName}] WebSocket错误: ${error.message}`);
        reject(error);
      });

      this.ws.on('close', (code, reason) => {
        log(`[${this.accountName}] WebSocket连接已关闭: ${code}`);
        this.isReady = false;
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
          log(`[${this.accountName}] ${delay}ms后尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          setTimeout(() => this.connect().catch(console.error), delay);
        }
      });

      this.once('ready', () => {
        log(`[${this.accountName}] 服务已就绪`);
        resolve();
      });

      // 超时处理
      setTimeout(() => {
        if (!this.isReady) {
          reject(new Error(`[${this.accountName}] 连接超时`));
        }
      }, 30000);
    });
  }

  private handleMessage(data: string): void {
    try {
      const payload = JSON.parse(data);
      const { op, t, d, s } = payload;

      if (s !== null) this.sequence = s;

      switch (op) {
        case 10: // Hello
          this.handleHello(d);
          break;
        case 0: // Dispatch
          this.handleDispatch(t, d);
          break;
        case 11: // Heartbeat ACK
          break;
      }
    } catch (error: any) {
      log(`[${this.accountName}] 消息解析失败: ${error.message}`);
    }
  }

  private handleHello(d: any): void {
    log(`[${this.accountName}] 收到Hello，心跳间隔: ${d.heartbeat_interval}ms`);
    this.startHeartbeat(d.heartbeat_interval);
    this.identify();
  }

  private startHeartbeat(interval: number): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 1, d: this.sequence }));
      }
    }, interval);
  }

  private identify(): void {
    if (!this.ws) return;
    this.ws.send(JSON.stringify({
      op: 2,
      d: {
        token: this.config.userToken,
        properties: { os: 'windows', browser: 'chrome', device: 'chrome' },
        intents: 33281,
      },
    }));
    log(`[${this.accountName}] 已发送Identify`);
  }

  private handleDispatch(eventType: string, data: any): void {
    switch (eventType) {
      case 'READY':
        log(`[${this.accountName}] READY - 用户: ${data.user.username}`);
        this.sessionId = data.session_id;
        this.isReady = true;
        this.emit('ready');
        break;
      case 'MESSAGE_CREATE':
        this.handleMessageCreate(data);
        break;
      case 'MESSAGE_UPDATE':
        this.handleMessageUpdate(data);
        break;
      case 'MESSAGE_DELETE':
        this.handleMessageDelete(data);
        break;
    }
  }

  private async handleMessageCreate(message: any): Promise<void> {
    // 调试日志
    log(`[${this.accountName}] handleMessageCreate: id=${message.id}, author=${message.author?.id}, channel=${message.channel_id}, nonce=${message.nonce || 'N/A'}`);

    if (message.author?.id !== MIDJOURNEY_BOT_ID) return;
    if (message.channel_id !== this.config.channelId) return;

    log(`[${this.accountName}] 收到MJ消息: ${message.id}, hasComp=${!!message.components?.length}, hasAtt=${!!message.attachments?.length}`);

    const nonce = message.nonce;
    let matchedTaskId: string | null = null;

    if (nonce) {
      const task = getMjTask(nonce);
      if (task) {
        matchedTaskId = nonce;
        updateMjTask(nonce, { message_id: message.id, status: 'IN_PROGRESS' });
        log(`[${this.accountName}] 任务已匹配(nonce): ${nonce}`);
        this.emit('taskUpdate', { taskId: nonce, status: 'IN_PROGRESS' });
      }
    }

    // 如果 nonce 未匹配，尝试从 pending 任务中匹配
    if (!matchedTaskId) {
      const pendingTasks = getPendingMjTasks();
      
      if (pendingTasks.length === 1) {
        matchedTaskId = pendingTasks[0].task_id;
        log(`[${this.accountName}] 任务已匹配(pending唯一): ${matchedTaskId}`);
      } else if (pendingTasks.length > 1) {
        // 尝试通过 prompt 匹配 (U1-U4 等 Action 可能会带 prompt)
        // 使用倒序遍历，优先匹配最新的任务（解决旧任务卡住导致新任务被错误匹配的问题）
        if (message.content) {
          const content = message.content.toLowerCase();
          for (let i = pendingTasks.length - 1; i >= 0; i--) {
            const task = pendingTasks[i];
            if (!task.prompt) continue;
            
            // 提取 prompt 的前 20 个字符进行匹配
            const promptKeyword = task.prompt.toLowerCase().substring(0, 20);
            if (content.includes(promptKeyword)) {
              matchedTaskId = task.task_id;
              log(`[${this.accountName}] 任务已匹配(prompt, newest): ${matchedTaskId}, prompt=${promptKeyword}`);
              break;
            }
          }
        }
      }
    }

    if (!matchedTaskId) {
      // 这里的 return 可能导致某些消息被漏掉，但如果没有匹配任务，也无法处理
      return;
    }

    // 完成消息判定：只要有附件，且匹配到了任务，就尝试完成
    // 之前是 requires components && attachments，现在放宽
    if (message.attachments?.length > 0) {
      log(`[${this.accountName}] 消息包含附件，视为任务完成: ${matchedTaskId}`);
      await this.completeTask(matchedTaskId, message);
    }
  }

  private async handleMessageUpdate(message: any): Promise<void> {
    if (message.channel_id !== this.config.channelId) return;

    let task: MjTask | null = null;
    if (message.nonce) {
      task = getMjTask(message.nonce);
    }
    if (!task && message.id) {
      task = getMjTaskByMessageId(message.id);
    }
    if (!task) {
      const pending = getPendingMjTasks();
      if (pending.length === 1) task = pending[0];
    }

    if (!task) return;

    const progressMatch = message.content?.match(/\((\d+)%\)/);
    const progress = progressMatch ? progressMatch[1] + '%' : undefined;
    
    const hasComponents = message.components?.length > 0;
    const hasAttachments = message.attachments?.length > 0;
    const isWaiting = message.content?.includes('Waiting to start');

    // 只要有附件，且不是 Waiting 或 进度更新，就视为完成
    if (hasAttachments && (hasComponents || (!progress && !isWaiting))) {
      log(`[${this.accountName}] 消息更新为完成状态 (hasComp=${hasComponents}, hasAtt=${hasAttachments}): ${task.task_id}`);
      await this.completeTask(task.task_id, message);
    } else if (progress) {
      updateMjTask(task.task_id, { progress, status: 'IN_PROGRESS', message_id: message.id });
      this.emit('taskUpdate', { taskId: task.task_id, progress });
    }
  }

  private async handleMessageDelete(data: any): Promise<void> {
    if (data.channel_id !== this.config.channelId) return;
    
    const messageId = data.id;
    const task = getMjTaskByMessageId(messageId);
    if (!task || task.status !== 'IN_PROGRESS') return;
    
    log(`[${this.accountName}] MESSAGE_DELETE: 任务 ${task.task_id} 的消息 ${messageId} 被删除，轮询完成消息...`);
    
    // 等待 Discord 发送完成消息
    await new Promise(resolve => setTimeout(resolve, 2500));
    
    try {
      // 使用 after 参数只获取被删除消息ID之后的新消息
      const response = await this.httpClient.get(`/channels/${this.config.channelId}/messages?after=${messageId}&limit=5`);
      const messages = response.data;
      
      log(`[${this.accountName}] MESSAGE_DELETE: 获取到 ${messages.length} 条新消息 (after ${messageId})`);
      
      for (const msg of messages) {
        if (msg.author?.id !== MIDJOURNEY_BOT_ID) continue;
        if (!msg.attachments?.length) continue;
        
        const filename = msg.attachments[0].filename || '';
        const imageUrl = msg.attachments[0].url || '';

        const isCompletionImage = filename.match(/[a-f0-9-]{36}/i) || imageUrl.includes('ephemeral');
        if (!isCompletionImage) continue;

        log(`[${this.accountName}] MESSAGE_DELETE: 找到完成消息 ${msg.id}`);
        await this.completeTask(task.task_id, msg);
        return;
      }

      log(`[${this.accountName}] MESSAGE_DELETE: 未在新消息中找到完成消息`);

      const latestResponse = await this.httpClient.get(`/channels/${this.config.channelId}/messages?limit=3`);
      const latestMessages = latestResponse.data;
      for (const msg of latestMessages) {
        if (msg.author?.id !== MIDJOURNEY_BOT_ID) continue;
        if (!msg.attachments?.length) continue;
        if (BigInt(msg.id) <= BigInt(messageId)) continue;

        const filename = msg.attachments[0].filename || '';
        if (filename.match(/[a-f0-9-]{36}/i)) {
          log(`[${this.accountName}] MESSAGE_DELETE: (Fallback) 找到完成消息 ${msg.id}`);
          await this.completeTask(task.task_id, msg);
          return;
        }
      }
    } catch (error: any) {
      log(`[${this.accountName}] MESSAGE_DELETE: 获取消息失败: ${error.message}`);
    }
  }

  private async completeTask(taskId: string, message: any): Promise<void> {
    const buttons = this.parseButtons(message.components);
    const imageUrl = message.attachments?.[0]?.url || '';
    let messageHash: string | undefined;

    if (imageUrl) {
      const match = imageUrl.match(/([a-f0-9]{32})/);
      if (match) messageHash = match[1];
    }

    log(`[${this.accountName}] 任务完成: ${taskId}, 图片: ${imageUrl.substring(0, 50)}...`);

    let ossUrl = imageUrl;
    try {
      log(`[${this.accountName}] 开始下载并上传到 OSS...`);
      ossUrl = await downloadAndUploadToOss(imageUrl);
      log(`[${this.accountName}] OSS 上传成功: ${ossUrl.substring(0, 80)}...`);
    } catch (error: any) {
      log(`[${this.accountName}] OSS 上传失败，使用原始 URL: ${error.message}`);
    }

    updateMjTask(taskId, {
      status: 'SUCCESS',
      message_id: message.id,
      message_hash: messageHash,
      image_url: imageUrl,
      oss_url: ossUrl,
      buttons: JSON.stringify(buttons),
    });

    this.emit('taskUpdate', { taskId, status: 'SUCCESS', imageUrl: ossUrl, buttons });
  }

  private parseButtons(components: any[]): MjButton[] {
    const buttons: MjButton[] = [];
    for (const row of components || []) {
      if (row.type === 1 && row.components) {
        for (const btn of row.components) {
          if (btn.type === 2 && btn.custom_id) {
            buttons.push({
              customId: btn.custom_id,
              label: btn.label || '',
              emoji: btn.emoji?.name,
            });
          }
        }
      }
    }
    return buttons;
  }

  async imagine(prompt: string, userId?: string): Promise<string> {
    if (!this.isReady) {
      throw new Error(`[${this.accountName}] 服务未就绪`);
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    createMjTask(taskId, userId, this.config.accountId, prompt);

    const commandId = getConfig('mj_command_id') || process.env.DISCORD_IMAGINE_COMMAND_ID || '938956540159881230';
    const versionId = getConfig('mj_version_id') || process.env.DISCORD_IMAGINE_VERSION_ID || '1237876415471554623';
    log(`[${this.accountName}] 使用 commandId=${commandId}, versionId=${versionId}`);

    try {
      await this.httpClient.post('/interactions', {
        type: 2,
        application_id: MIDJOURNEY_BOT_ID,
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
      });

      log(`[${this.accountName}] Imagine命令已发送: ${taskId}`);
      recordDiscordAccountUsage(this.config.accountId, true);
      return taskId;
    } catch (error: any) {
      const errDetail = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      log(`[${this.accountName}] Imagine命令失败: ${errDetail}`);
      recordDiscordAccountUsage(this.config.accountId, false, errDetail);
      updateMjTask(taskId, { status: 'FAILURE', fail_reason: errDetail });
      throw new Error(`Imagine命令发送失败: ${errDetail}`);
    }
  }

  async action(messageId: string, customId: string, userId?: string): Promise<string> {
    if (!this.isReady) {
      throw new Error(`[${this.accountName}] 服务未就绪`);
    }

    // 尝试获取原始任务的 prompt
    let prompt: string | null = null;
    const originalTask = getMjTaskByMessageId(messageId);
    if (originalTask) {
      prompt = originalTask.prompt;
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    createMjTask(taskId, userId, this.config.accountId, prompt);

    try {
      await this.httpClient.post('/interactions', {
        type: 3,
        guild_id: this.config.guildId,
        channel_id: this.config.channelId,
        message_flags: 0,
        message_id: messageId,
        application_id: MIDJOURNEY_BOT_ID,
        session_id: this.sessionId,
        data: { component_type: 2, custom_id: customId },
        nonce: taskId,
      });

      log(`[${this.accountName}] Action命令已发送: ${taskId}, prompt=${prompt?.substring(0, 20)}...`);
      recordDiscordAccountUsage(this.config.accountId, true);
      return taskId;
    } catch (error: any) {
      log(`[${this.accountName}] Action命令失败: ${error.message}`);
      recordDiscordAccountUsage(this.config.accountId, false, error.message);
      updateMjTask(taskId, { status: 'FAILURE', fail_reason: error.message });
      throw new Error(`Action命令发送失败: ${error.message}`);
    }
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isReady = false;
    log(`[${this.accountName}] 已断开连接`);
  }
}

// 多账号连接池管理
class MidjourneyService extends EventEmitter {
  private connections: DiscordConnection[] = [];
  private currentIndex: number = 0;
  private isInitialized: boolean = false;
  private initializingPromise: Promise<void> | null = null;

  constructor() {
    super();
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // 防止并发初始化
    if (this.initializingPromise) {
      return this.initializingPromise;
    }

    this.initializingPromise = this._doInitialize();
    return this.initializingPromise;
  }

  private async _doInitialize(): Promise<void> {

    const accounts = getActiveDiscordAccounts();
    if (!accounts.length) {
      log('未配置Discord账号，Midjourney服务未启动');
      return;
    }

    log(`正在启动Midjourney服务，共 ${accounts.length} 个账号...`);

    // 并行连接所有账号
    const connectPromises = accounts.map(async (account) => {
      const conn = new DiscordConnection(account);
      try {
        await conn.connect();
        this.connections.push(conn);
        log(`[${conn.accountName}] 连接成功`);
      } catch (error: any) {
        log(`[账号${account.id}] 连接失败: ${error.message}`);
      }
    });

    await Promise.allSettled(connectPromises);

    if (this.connections.length > 0) {
      log(`Midjourney服务已启动，${this.connections.length}/${accounts.length} 个账号连接成功`);
      this.isInitialized = true;
    } else {
      log('所有Discord账号连接失败，Midjourney服务未启动');
    }
  }

  get ready(): boolean {
    return this.connections.some(c => c.ready);
  }

  get readyCount(): number {
    return this.connections.filter(c => c.ready).length;
  }

  // 轮询获取下一个可用连接
  private getNextConnection(): DiscordConnection | null {
    const readyConnections = this.connections.filter(c => c.ready);
    if (readyConnections.length === 0) return null;

    // 简单轮询
    this.currentIndex = (this.currentIndex + 1) % readyConnections.length;
    return readyConnections[this.currentIndex];
  }

  async imagine(prompt: string, userId?: string): Promise<string> {
    const conn = this.getNextConnection();
    if (!conn) {
      throw new Error('没有可用的Discord连接');
    }
    log(`[轮询] 使用 ${conn.accountName} 处理 Imagine 请求`);
    return conn.imagine(prompt, userId);
  }

  async action(messageId: string, customId: string, userId?: string): Promise<string> {
    const conn = this.getNextConnection();
    if (!conn) {
      throw new Error('没有可用的Discord连接');
    }
    log(`[轮询] 使用 ${conn.accountName} 处理 Action 请求`);
    return conn.action(messageId, customId, userId);
  }

  getTask(taskId: string): MjTask | null {
    return getMjTask(taskId);
  }

  async waitForTask(taskId: string, timeoutMs: number = 300000): Promise<MjTask> {
    const startTime = Date.now();

    while (true) {
      const task = getMjTask(taskId);
      if (!task) throw new Error('任务不存在');
      if (task.status === 'SUCCESS') return task;
      if (task.status === 'FAILURE') throw new Error(task.fail_reason || '任务失败');
      if (Date.now() - startTime > timeoutMs) throw new Error('任务超时');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  getStatus(): { total: number; ready: number; accounts: Array<{ id: number; name: string; ready: boolean }> } {
    return {
      total: this.connections.length,
      ready: this.readyCount,
      accounts: this.connections.map(c => ({
        id: c.accountId,
        name: c.accountName,
        ready: c.ready,
      })),
    };
  }

  disconnect(): void {
    for (const conn of this.connections) {
      conn.disconnect();
    }
    this.connections = [];
    this.isInitialized = false;
    this.initializingPromise = null;
    log('所有连接已断开');
  }
}

// 单例
export const midjourneyService = new MidjourneyService();
