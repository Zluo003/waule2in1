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
    res.json({
      success: true,
      settings: {
        fastEnabled,
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
    const { fastEnabled } = req.body;
    
    if (typeof fastEnabled === 'boolean') {
      await settingsService.setMidjourneyFastEnabled(fastEnabled);
    }
    
    // 返回更新后的设置
    const newFastEnabled = await settingsService.isMidjourneyFastEnabled();
    
    res.json({
      success: true,
      settings: {
        fastEnabled: newFastEnabled,
      },
    });
  } catch (error: any) {
    console.error('更新 Midjourney 设置失败:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
