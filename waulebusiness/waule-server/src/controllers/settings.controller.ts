import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service';

/**
 * 获取所有设置（管理员）
 */
export const getAllSettings = async (req: Request, res: Response) => {
  try {
    const settings = await settingsService.getAll();
    res.json({ success: true, settings });
  } catch (error: any) {
    console.error('获取设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 获取 Midjourney 设置
 */
export const getMidjourneySettings = async (req: Request, res: Response) => {
  try {
    const fastEnabled = await settingsService.isMidjourneyFastEnabled();
    const serverId = await settingsService.get('midjourney_server_id');
    res.json({
      success: true,
      settings: {
        fastEnabled,
        serverId: serverId || '',
      },
    });
  } catch (error: any) {
    console.error('获取 Midjourney 设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * 更新 Midjourney 设置（管理员）
 */
export const updateMidjourneySettings = async (req: Request, res: Response) => {
  try {
    const { fastEnabled, serverId } = req.body;

    if (typeof fastEnabled === 'boolean') {
      await settingsService.setMidjourneyFastEnabled(fastEnabled);
    }

    if (serverId !== undefined) {
      await settingsService.set('midjourney_server_id', serverId || '');
    }

    // 返回更新后的设置
    const newFastEnabled = await settingsService.isMidjourneyFastEnabled();
    const newServerId = await settingsService.get('midjourney_server_id');

    res.json({
      success: true,
      settings: {
        fastEnabled: newFastEnabled,
        serverId: newServerId || '',
      },
    });
  } catch (error: any) {
    console.error('更新 Midjourney 设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
