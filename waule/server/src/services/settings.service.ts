import { prisma } from '../index';

class SettingsService {
  /**
   * 获取设置值
   */
  async get(key: string): Promise<string | null> {
    const setting = await prisma.setting.findUnique({
      where: { key },
    });
    return setting?.value || null;
  }

  /**
   * 获取布尔值设置
   */
  async getBoolean(key: string, defaultValue: boolean = false): Promise<boolean> {
    const value = await this.get(key);
    if (value === null) return defaultValue;
    return value === 'true' || value === '1';
  }

  /**
   * 设置值
   */
  async set(key: string, value: string, type: string = 'string', category?: string): Promise<void> {
    await prisma.setting.upsert({
      where: { key },
      update: { value, type, category },
      create: { key, value, type, category },
    });
  }

  /**
   * 获取分类下的所有设置
   */
  async getByCategory(category: string): Promise<Record<string, string>> {
    const settings = await prisma.setting.findMany({
      where: { category },
    });
    return settings.reduce((acc, s) => {
      acc[s.key] = s.value;
      return acc;
    }, {} as Record<string, string>);
  }

  /**
   * 获取所有设置
   */
  async getAll(): Promise<Record<string, any>> {
    const settings = await prisma.setting.findMany();
    return settings.reduce((acc, s) => {
      acc[s.key] = {
        value: s.value,
        type: s.type,
        category: s.category,
      };
      return acc;
    }, {} as Record<string, any>);
  }

  // ========== Midjourney 专用方法 ==========

  /**
   * 检查 Midjourney Fast 模式是否启用
   */
  async isMidjourneyFastEnabled(): Promise<boolean> {
    return this.getBoolean('midjourney_fast_enabled', true); // 默认启用
  }

  /**
   * 设置 Midjourney Fast 模式状态
   */
  async setMidjourneyFastEnabled(enabled: boolean): Promise<void> {
    await this.set('midjourney_fast_enabled', enabled ? 'true' : 'false', 'boolean', 'midjourney');
  }
}

export const settingsService = new SettingsService();
