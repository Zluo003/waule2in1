"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMidjourneySettings = exports.getMidjourneySettings = exports.getAllSettings = void 0;
const settings_service_1 = require("../services/settings.service");
/**
 * 获取所有设置（管理员）
 */
const getAllSettings = async (req, res) => {
    try {
        const settings = await settings_service_1.settingsService.getAll();
        res.json({ success: true, settings });
    }
    catch (error) {
        console.error('获取设置失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getAllSettings = getAllSettings;
/**
 * 获取 Midjourney 设置
 */
const getMidjourneySettings = async (req, res) => {
    try {
        const fastEnabled = await settings_service_1.settingsService.isMidjourneyFastEnabled();
        res.json({
            success: true,
            settings: {
                fastEnabled,
            },
        });
    }
    catch (error) {
        console.error('获取 Midjourney 设置失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.getMidjourneySettings = getMidjourneySettings;
/**
 * 更新 Midjourney 设置（管理员）
 */
const updateMidjourneySettings = async (req, res) => {
    try {
        const { fastEnabled } = req.body;
        if (typeof fastEnabled === 'boolean') {
            await settings_service_1.settingsService.setMidjourneyFastEnabled(fastEnabled);
        }
        // 返回更新后的设置
        const newFastEnabled = await settings_service_1.settingsService.isMidjourneyFastEnabled();
        res.json({
            success: true,
            settings: {
                fastEnabled: newFastEnabled,
            },
        });
    }
    catch (error) {
        console.error('更新 Midjourney 设置失败:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
exports.updateMidjourneySettings = updateMidjourneySettings;
//# sourceMappingURL=settings.controller.js.map