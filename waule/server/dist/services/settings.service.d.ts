declare class SettingsService {
    /**
     * 获取设置值
     */
    get(key: string): Promise<string | null>;
    /**
     * 获取布尔值设置
     */
    getBoolean(key: string, defaultValue?: boolean): Promise<boolean>;
    /**
     * 设置值
     */
    set(key: string, value: string, type?: string, category?: string): Promise<void>;
    /**
     * 获取分类下的所有设置
     */
    getByCategory(category: string): Promise<Record<string, string>>;
    /**
     * 获取所有设置
     */
    getAll(): Promise<Record<string, any>>;
    /**
     * 检查 Midjourney Fast 模式是否启用
     */
    isMidjourneyFastEnabled(): Promise<boolean>;
    /**
     * 设置 Midjourney Fast 模式状态
     */
    setMidjourneyFastEnabled(enabled: boolean): Promise<void>;
}
export declare const settingsService: SettingsService;
export {};
//# sourceMappingURL=settings.service.d.ts.map