/**
 * Midjourney 服务 - Discord WebSocket 连接和消息处理
 */

import WebSocket from 'ws';
import axios, { AxiosInstance } from 'axios';
import { log } from '../utils/logger';
import { getConfig, getMidjourneyStorageType } from '../config';
import { downloadAndUpload } from './storage';
import {
  getDiscordAccounts,
  DiscordAccount,
  createMjTask,
  getMjTask,
  getMjTaskByMessageId,
  updateMjTask,
  getPendingMjTasks,
  incrementDiscordAccountUsage,
  updateDiscordAccount
} from '../database';

const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_GATEWAY = 'wss://gateway.discord.gg';
const MIDJOURNEY_BOT_ID = '936929561302675456';

interface MjButton {
  customId: string;
  label: string;
  emoji?: string;
}

/**
 * 单个 Discord 连接实例
 */
class DiscordConnection {
  private ws: WebSocket | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionId: string = '';
  private sequence: number | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  public ready = false;
  public httpClient: AxiosInstance;

  constructor(public config: DiscordAccount) {
    this.httpClient = axios.create({
      baseURL: DISCORD_API_BASE,
      headers: {
        'Authorization': config.user_token,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(`${DISCORD_GATEWAY}/?v=10&encoding=json`);

        this.ws.on('open', () => {
          log('midjourney', `Discord connection opened for account ${this.config.id}`);
        });

        this.ws.on('message', async (data: WebSocket.Data) => {
          try {
            const payload = JSON.parse(data.toString());
            await this.handleMessage(payload, resolve);
          } catch (e: any) {
            log('midjourney', `Error parsing message: ${e.message}`);
          }
        });

        this.ws.on('close', (code, reason) => {
          log('midjourney', `Discord connection closed: ${code} ${reason}`);
          this.ready = false;
          this.stopHeartbeat();
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          log('midjourney', `Discord connection error: ${error.message}`);
          reject(error);
        });

        setTimeout(() => {
          if (!this.ready) {
            reject(new Error('Connection timeout'));
          }
        }, 30000);
      } catch (error) {
        reject(error);
      }
    });
  }

  private async handleMessage(payload: any, onReady?: (value: void) => void): Promise<void> {
    const { op, t, d, s } = payload;

    if (s) this.sequence = s;

    switch (op) {
      case 10: // Hello
        this.startHeartbeat(d.heartbeat_interval);
        this.identify();
        break;

      case 0: // Dispatch
        if (t === 'READY') {
          this.sessionId = d.session_id;
          this.ready = true;
          this.reconnectAttempts = 0;
          log('midjourney', `Discord ready for account ${this.config.id}`);
          onReady?.();
        } else if (t === 'MESSAGE_CREATE') {
          await this.handleMessageCreate(d);
        } else if (t === 'MESSAGE_UPDATE') {
          await this.handleMessageUpdate(d);
        } else if (t === 'MESSAGE_DELETE') {
          await this.handleMessageDelete(d);
        }
        break;

      case 11: // Heartbeat ACK
        break;

      case 7: // Reconnect
        this.ws?.close();
        break;

      case 9: // Invalid Session
        setTimeout(() => this.identify(), 5000);
        break;
    }
  }

  private identify(): void {
    this.ws?.send(JSON.stringify({
      op: 2,
      d: {
        token: this.config.user_token,
        intents: 33280, // GUILD_MESSAGES | MESSAGE_CONTENT
        properties: {
          os: 'linux',
          browser: 'chrome',
          device: 'chrome',
        },
      },
    }));
  }

  private startHeartbeat(interval: number): void {
    this.heartbeatInterval = setInterval(() => {
      this.ws?.send(JSON.stringify({ op: 1, d: this.sequence }));
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
      log('midjourney', `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
      setTimeout(() => this.connect().catch(() => {}), delay);
    }
  }

  private async handleMessageCreate(message: any): Promise<void> {
    if (message.author?.id !== MIDJOURNEY_BOT_ID) return;

    const nonce = message.nonce;
    if (nonce) {
      const task = getMjTask(nonce);
      if (task && task.status === 'SUBMITTED') {
        updateMjTask(nonce, { message_id: message.id, status: 'IN_PROGRESS' });
        log('midjourney', `Task ${nonce} matched by nonce, status: IN_PROGRESS`);
      }
    }

    // 检查是否有附件（图片生成完成）
    if (message.attachments?.length > 0) {
      await this.tryCompleteTask(message);
    }
  }

  private async handleMessageUpdate(message: any): Promise<void> {
    if (message.author?.id !== MIDJOURNEY_BOT_ID) return;

    // 检查进度更新
    const content = message.content || '';
    const progressMatch = content.match(/\((\d+)%\)/);

    // 尝试通过 message_id 匹配任务
    let task = message.id ? getMjTaskByMessageId(message.id) : null;

    // 如果没找到，尝试从 pending 任务中匹配
    if (!task) {
      const pendingTasks = getPendingMjTasks(this.config.id);
      if (pendingTasks.length === 1) {
        task = pendingTasks[0];
      }
    }

    if (task && progressMatch) {
      updateMjTask(task.task_id, { progress: progressMatch[1], message_id: message.id });
    }

    // 检查是否有附件（图片生成完成）
    if (message.attachments?.length > 0) {
      await this.tryCompleteTask(message);
    }
  }

  private async handleMessageDelete(data: any): Promise<void> {
    if (data.channel_id !== this.config.channel_id) return;

    const messageId = data.id;
    const task = getMjTaskByMessageId(messageId);
    if (!task || task.status !== 'IN_PROGRESS') return;

    log('midjourney', `MESSAGE_DELETE: Task ${task.task_id} message ${messageId} deleted, polling for completion...`);

    // 等待 Discord 发送完成消息
    await new Promise(resolve => setTimeout(resolve, 2500));

    try {
      // 获取被删除消息之后的新消息
      const response = await this.httpClient.get(`/channels/${this.config.channel_id}/messages?after=${messageId}&limit=5`);
      const messages = response.data;

      log('midjourney', `MESSAGE_DELETE: Found ${messages.length} new messages after ${messageId}`);

      for (const msg of messages) {
        if (msg.author?.id !== MIDJOURNEY_BOT_ID) continue;
        if (!msg.attachments?.length) continue;

        // 检查是否是完成消息（有按钮或没有进度）
        const hasComponents = msg.components?.length > 0;
        const hasProgress = /\(\d+%\)/.test(msg.content || '');
        if (!hasComponents && hasProgress) continue;

        log('midjourney', `MESSAGE_DELETE: Found completion message ${msg.id}`);
        await this.completeTask(task.task_id, msg);
        return;
      }

      log('midjourney', `MESSAGE_DELETE: No completion message found`);
    } catch (error: any) {
      log('midjourney', `MESSAGE_DELETE: Error fetching messages: ${error.message}`);
    }
  }

  private async tryCompleteTask(message: any): Promise<void> {
    const content = message.content || '';
    const progressMatch = content.match(/\((\d+)%\)/);
    const hasComponents = message.components?.length > 0;
    const isWaiting = content.includes('Waiting to start');

    log('midjourney', `tryCompleteTask: msgId=${message.id}, hasComp=${hasComponents}, progress=${progressMatch?.[1] || 'N/A'}, isWaiting=${isWaiting}`);

    // 只要有附件，且满足以下条件之一才视为完成：
    // 1. 有按钮（components）
    // 2. 没有进度百分比且不是 "Waiting to start"
    if (!hasComponents && (progressMatch || isWaiting)) {
      // 还在生成中，更新进度但不完成
      log('midjourney', `tryCompleteTask: skipping, still in progress`);
      return;
    }

    // 尝试通过 message_id 匹配任务
    let task = message.id ? getMjTaskByMessageId(message.id) : null;
    log('midjourney', `tryCompleteTask: task by msgId=${task?.task_id || 'null'}`);

    // 如果没找到，尝试从 pending 任务中匹配
    if (!task) {
      const pendingTasks = getPendingMjTasks(this.config.id);
      log('midjourney', `tryCompleteTask: pendingTasks count=${pendingTasks.length}`);

      // 先尝试通过 message_id 匹配
      for (const t of pendingTasks) {
        if (t.message_id === message.id) {
          task = t;
          break;
        }
      }

      // 如果只有一个 pending 任务，直接使用
      if (!task && pendingTasks.length === 1) {
        task = pendingTasks[0];
        log('midjourney', `tryCompleteTask: using single pending task ${task.task_id}`);
      }

      // 如果有多个 pending 任务，尝试通过 prompt 匹配（倒序，优先匹配最新的）
      if (!task && pendingTasks.length > 1 && content) {
        const contentLower = content.toLowerCase();
        for (let i = pendingTasks.length - 1; i >= 0; i--) {
          const t = pendingTasks[i];
          if (!t.prompt) continue;
          const promptKeyword = t.prompt.toLowerCase().substring(0, 20);
          if (contentLower.includes(promptKeyword)) {
            task = t;
            log('midjourney', `tryCompleteTask: matched by prompt ${task.task_id}`);
            break;
          }
        }
      }
    }

    // 尝试通过 nonce 匹配
    if (!task && message.nonce) {
      const t = getMjTask(message.nonce);
      if (t && t.status !== 'SUCCESS') {
        task = t;
        log('midjourney', `tryCompleteTask: task by nonce=${task?.task_id}`);
      }
    }

    if (task) {
      log('midjourney', `tryCompleteTask: completing task ${task.task_id}`);
      await this.completeTask(task.task_id, message);
    } else {
      log('midjourney', `tryCompleteTask: no task matched for msgId=${message.id}`);
    }
  }

  private async completeTask(taskId: string, message: any): Promise<void> {
    const imageUrl = message.attachments?.[0]?.url || '';
    let ossUrl = imageUrl;

    // 解析按钮
    const buttons: MjButton[] = [];
    if (message.components) {
      for (const row of message.components) {
        if (row.components) {
          for (const btn of row.components) {
            if (btn.custom_id) {
              buttons.push({
                customId: btn.custom_id,
                label: btn.label || '',
                emoji: btn.emoji?.name,
              });
            }
          }
        }
      }
    }

    // 提取 message_hash
    let messageHash = '';
    const hashMatch = imageUrl.match(/_([a-f0-9-]+)\./i);
    if (hashMatch) {
      messageHash = hashMatch[1];
    }

    // 尝试上传到 OSS
    try {
      const storageType = getMidjourneyStorageType();
      ossUrl = await downloadAndUpload(imageUrl, '.png', 'midjourney', storageType);
    } catch (e: any) {
      log('midjourney', `Failed to upload to OSS: ${e.message}`);
    }

    updateMjTask(taskId, {
      status: 'SUCCESS',
      message_id: message.id,
      message_hash: messageHash,
      image_url: imageUrl,
      oss_url: ossUrl,
      progress: '100',
      buttons: JSON.stringify(buttons),
    });

    incrementDiscordAccountUsage(this.config.id, true);
    log('midjourney', `Task ${taskId} completed successfully`);
  }

  async imagine(prompt: string, userId?: string): Promise<string> {
    const taskId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    createMjTask(taskId, userId, this.config.id, prompt);

    const commandId = getConfig('mj_command_id') || process.env.MJ_COMMAND_ID || '';
    const versionId = getConfig('mj_version_id') || process.env.MJ_VERSION_ID || '';

    if (!commandId || !versionId) {
      updateMjTask(taskId, { status: 'FAILURE', fail_reason: 'Missing MJ command/version ID' });
      throw new Error('Midjourney command ID or version ID not configured');
    }

    try {
      await this.httpClient.post('/interactions', {
        type: 2,
        application_id: MIDJOURNEY_BOT_ID,
        guild_id: this.config.guild_id,
        channel_id: this.config.channel_id,
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

      log('midjourney', `Imagine command sent: ${taskId}`);
      return taskId;
    } catch (e: any) {
      const errorMsg = e.response?.data?.message || e.message;
      updateMjTask(taskId, { status: 'FAILURE', fail_reason: errorMsg });
      incrementDiscordAccountUsage(this.config.id, false);
      updateDiscordAccount(this.config.id, { last_error: errorMsg });
      throw new Error(`Failed to send imagine command: ${errorMsg}`);
    }
  }

  async action(messageId: string, customId: string, userId?: string): Promise<string> {
    // 尝试获取原始任务的 prompt
    let prompt: string | undefined;
    const originalTask = getMjTaskByMessageId(messageId);
    if (originalTask) {
      prompt = originalTask.prompt ?? undefined;
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    createMjTask(taskId, userId, this.config.id, prompt);

    try {
      await this.httpClient.post('/interactions', {
        type: 3,
        application_id: MIDJOURNEY_BOT_ID,
        guild_id: this.config.guild_id,
        channel_id: this.config.channel_id,
        session_id: this.sessionId,
        message_id: messageId,
        data: {
          component_type: 2,
          custom_id: customId,
        },
        nonce: taskId,
      });

      log('midjourney', `Action command sent: ${taskId}`);
      return taskId;
    } catch (e: any) {
      const errorMsg = e.response?.data?.message || e.message;
      updateMjTask(taskId, { status: 'FAILURE', fail_reason: errorMsg });
      incrementDiscordAccountUsage(this.config.id, false);
      throw new Error(`Failed to send action command: ${errorMsg}`);
    }
  }

  disconnect(): void {
    this.stopHeartbeat();
    this.ws?.close();
    this.ready = false;
  }
}

/**
 * Midjourney 服务 - 多账号连接池管理
 */
class MidjourneyService {
  private connections: DiscordConnection[] = [];
  private currentIndex = 0;
  public ready = false;

  async initialize(): Promise<void> {
    const accounts = getDiscordAccounts(true);
    if (accounts.length === 0) {
      log('midjourney', 'No active Discord accounts found');
      return;
    }

    log('midjourney', `Initializing ${accounts.length} Discord connections...`);

    const results = await Promise.allSettled(
      accounts.map(async (account) => {
        const conn = new DiscordConnection(account);
        await conn.connect();
        return conn;
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        this.connections.push(result.value);
      }
    }

    this.ready = this.connections.some(c => c.ready);
    log('midjourney', `Initialized ${this.connections.filter(c => c.ready).length}/${accounts.length} connections`);
  }

  private getNextConnection(): DiscordConnection | null {
    const readyConnections = this.connections.filter(c => c.ready);
    if (readyConnections.length === 0) return null;
    this.currentIndex = (this.currentIndex + 1) % readyConnections.length;
    return readyConnections[this.currentIndex];
  }

  async imagine(prompt: string, userId?: string): Promise<string> {
    const conn = this.getNextConnection();
    if (!conn) throw new Error('No available Discord connection');
    return conn.imagine(prompt, userId);
  }

  async action(messageId: string, customId: string, userId?: string): Promise<string> {
    const conn = this.getNextConnection();
    if (!conn) throw new Error('No available Discord connection');
    return conn.action(messageId, customId, userId);
  }

  getStatus(): { ready: number; total: number } {
    return {
      ready: this.connections.filter(c => c.ready).length,
      total: this.connections.length,
    };
  }

  async reload(): Promise<void> {
    // 断开所有连接
    for (const conn of this.connections) {
      conn.disconnect();
    }
    this.connections = [];
    this.ready = false;

    // 重新初始化
    await this.initialize();
  }
}

export const midjourneyService = new MidjourneyService();
