"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.settingsService = void 0;
const index_1 = require("../index");
class SettingsService {
    /**
     * 获取设置值
     */
    async get(key) {
        const setting = await index_1.prisma.setting.findUnique({
            where: { key },
        });
        return setting?.value || null;
    }
    /**
     * 获取布尔值设置
     */
    async getBoolean(key, defaultValue = false) {
        const value = await this.get(key);
        if (value === null)
            return defaultValue;
        return value === 'true' || value === '1';
    }
    /**
     * 设置值
     */
    async set(key, value, type = 'string', category) {
        await index_1.prisma.setting.upsert({
            where: { key },
            update: { value, type, category },
            create: { key, value, type, category },
        });
    }
    /**
     * 获取分类下的所有设置
     */
    async getByCategory(category) {
        const settings = await index_1.prisma.setting.findMany({
            where: { category },
        });
        return settings.reduce((acc, s) => {
            acc[s.key] = s.value;
            return acc;
        }, {});
    }
    /**
     * 获取所有设置
     */
    async getAll() {
        const settings = await index_1.prisma.setting.findMany();
        return settings.reduce((acc, s) => {
            acc[s.key] = {
                value: s.value,
                type: s.type,
                category: s.category,
            };
            return acc;
        }, {});
    }
    // ========== Midjourney 专用方法 ==========
    /**
     * 检查 Midjourney Fast 模式是否启用
     */
    async isMidjourneyFastEnabled() {
        return this.getBoolean('midjourney_fast_enabled', true); // 默认启用
    }
    /**
     * 设置 Midjourney Fast 模式状态
     */
    async setMidjourneyFastEnabled(enabled) {
        await this.set('midjourney_fast_enabled', enabled ? 'true' : 'false', 'boolean', 'midjourney');
    }
}
exports.settingsService = new SettingsService();
//# sourceMappingURL=settings.service.js.map