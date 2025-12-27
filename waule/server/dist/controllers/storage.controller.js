"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateStorageConfig = exports.getStorageConfig = void 0;
const settings_service_1 = require("../services/settings.service");
const storage_service_1 = require("../services/storage.service");
/**
 * 获取存储配置
 */
const getStorageConfig = async (req, res) => {
    try {
        const mode = await storage_service_1.storageService.getStorageMode();
        const baseUrl = await storage_service_1.storageService.getLocalBaseUrl();
        res.json({
            success: true,
            data: {
                mode,
                localBaseUrl: baseUrl,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: '获取存储配置失败',
            error: error.message,
        });
    }
};
exports.getStorageConfig = getStorageConfig;
/**
 * 更新存储配置
 */
const updateStorageConfig = async (req, res) => {
    try {
        const { mode, localBaseUrl } = req.body;
        // 验证存储模式
        if (mode && !['oss', 'local'].includes(mode)) {
            return res.status(400).json({
                success: false,
                message: '无效的存储模式，只支持 oss 或 local',
            });
        }
        // 更新存储模式
        if (mode) {
            await settings_service_1.settingsService.set('storage_mode', mode, 'string', 'storage');
        }
        // 更新本地存储基础 URL
        if (localBaseUrl) {
            await settings_service_1.settingsService.set('storage_base_url', localBaseUrl, 'string', 'storage');
        }
        // 清除 Redis 缓存
        await storage_service_1.storageService.clearStorageModeCache();
        res.json({
            success: true,
            message: '存储配置更新成功',
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: '更新存储配置失败',
            error: error.message,
        });
    }
};
exports.updateStorageConfig = updateStorageConfig;
//# sourceMappingURL=storage.controller.js.map