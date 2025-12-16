import Redis from 'ioredis';
import crypto from 'crypto';
import { logger } from '../utils/logger';

/**
 * 验证码服务
 * 使用Redis存储验证码，确保集群模式下数据共享
 */
export class VerificationCodeService {
  private redis: Redis | null = null;
  private memoryStore: Map<string, { code: string; expiresAt: number }> = new Map();
  private useRedis = false;
  private initialized = false;

  constructor() {
    // 延迟初始化，等待主程序的 Redis 连接
    this.initRedis();
  }

  private async initRedis() {
    if (this.initialized) return;
    
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        lazyConnect: false,
      });
      
      // 测试连接
      await this.redis.ping();
      this.useRedis = true;
      this.initialized = true;
      logger.info('验证码服务使用Redis存储 (集群模式安全)');
    } catch (error) {
      logger.warn('Redis连接失败，使用内存存储验证码 (集群模式下可能导致验证失败)', error);
      this.useRedis = false;
      this.initialized = true;
      // 定期清理过期的内存验证码
      setInterval(() => this.cleanExpiredCodes(), 60000);
    }
  }

  private async ensureInitialized() {
    if (!this.initialized) {
      await this.initRedis();
    }
  }

  // 最大验证尝试次数
  private readonly MAX_VERIFY_ATTEMPTS = 5;

  /**
   * 生成6位数字验证码（使用加密安全随机数）
   */
  generateCode(): string {
    // 使用 crypto.randomInt 生成加密安全的随机数
    return crypto.randomInt(100000, 999999).toString();
  }

  /**
   * 保存验证码（5分钟有效期）
   */
  async saveCode(phone: string, code: string, ttl: number = 300): Promise<void> {
    await this.ensureInitialized();
    const key = `sms:code:${phone}`;
    
    if (this.useRedis && this.redis) {
      await this.redis.setex(key, ttl, code);
      logger.info(`验证码已保存到Redis: ${phone} (有效期${ttl}秒)`);
    } else {
      const expiresAt = Date.now() + ttl * 1000;
      this.memoryStore.set(key, { code, expiresAt });
      logger.warn(`验证码已保存到内存: ${phone} (集群模式下可能失效)`);
    }
  }

  /**
   * 验证验证码（带尝试次数限制）
   */
  async verifyCode(phone: string, code: string): Promise<boolean> {
    await this.ensureInitialized();
    const codeKey = `sms:code:${phone}`;
    const attemptKey = `sms:attempts:${phone}`;
    
    // 检查尝试次数
    const attempts = await this.getAttempts(attemptKey);
    if (attempts >= this.MAX_VERIFY_ATTEMPTS) {
      logger.warn(`验证码验证失败: ${phone} - 尝试次数过多 (${attempts})`);
      return false;
    }
    
    // 增加尝试次数
    await this.incrementAttempts(attemptKey);
    
    if (this.useRedis && this.redis) {
      const storedCode = await this.redis.get(codeKey);
      if (storedCode === code) {
        await this.redis.del(codeKey); // 验证成功后删除
        await this.redis.del(attemptKey); // 清除尝试次数
        logger.info(`验证码验证成功: ${phone}`);
        return true;
      }
    } else {
      const stored = this.memoryStore.get(codeKey);
      if (stored && stored.expiresAt > Date.now() && stored.code === code) {
        this.memoryStore.delete(codeKey); // 验证成功后删除
        this.memoryStore.delete(attemptKey); // 清除尝试次数
        logger.info(`验证码验证成功: ${phone}`);
        return true;
      }
    }
    
    logger.warn(`验证码验证失败: ${phone} - 尝试次数 ${attempts + 1}/${this.MAX_VERIFY_ATTEMPTS}`);
    return false;
  }

  /**
   * 获取验证尝试次数
   */
  private async getAttempts(key: string): Promise<number> {
    if (this.useRedis && this.redis) {
      const attempts = await this.redis.get(key);
      return attempts ? parseInt(attempts, 10) : 0;
    } else {
      const stored = this.memoryStore.get(key);
      if (stored && stored.expiresAt > Date.now()) {
        return parseInt(stored.code, 10);
      }
      return 0;
    }
  }

  /**
   * 增加验证尝试次数
   */
  private async incrementAttempts(key: string): Promise<void> {
    const ttl = 300; // 5分钟内的尝试次数
    if (this.useRedis && this.redis) {
      const current = await this.redis.incr(key);
      if (current === 1) {
        await this.redis.expire(key, ttl);
      }
    } else {
      const stored = this.memoryStore.get(key);
      const currentAttempts = stored && stored.expiresAt > Date.now() 
        ? parseInt(stored.code, 10) 
        : 0;
      this.memoryStore.set(key, {
        code: (currentAttempts + 1).toString(),
        expiresAt: Date.now() + ttl * 1000,
      });
    }
  }

  /**
   * 检查验证码发送频率（60秒内只能发送一次）
   */
  async canSendCode(phone: string): Promise<boolean> {
    await this.ensureInitialized();
    const key = `sms:limit:${phone}`;
    
    if (this.useRedis && this.redis) {
      const exists = await this.redis.exists(key);
      if (exists) {
        return false;
      }
      await this.redis.setex(key, 60, '1');
      return true;
    } else {
      const stored = this.memoryStore.get(key);
      if (stored && stored.expiresAt > Date.now()) {
        return false;
      }
      const expiresAt = Date.now() + 60000;
      this.memoryStore.set(key, { code: '1', expiresAt });
      return true;
    }
  }

  /**
   * 清理过期的内存验证码
   */
  private cleanExpiredCodes(): void {
    const now = Date.now();
    for (const [key, value] of this.memoryStore.entries()) {
      if (value.expiresAt <= now) {
        this.memoryStore.delete(key);
      }
    }
  }

  /**
   * 关闭Redis连接
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }
}

export const verificationCodeService = new VerificationCodeService();
