import { Request, Response } from 'express';
import { settingsService } from '../services/settings.service';
import { storageService } from '../services/storage.service';

/**
 * 获取存储配置
 */
export const getStorageConfig = async (req: Request, res: Response) => {
  try {
    const mode = await storageService.getStorageMode();
    const baseUrl = await storageService.getLocalBaseUrl();

    res.json({
      success: true,
      data: {
        mode,
        localBaseUrl: baseUrl,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: '获取存储配置失败',
      error: error.message,
    });
  }
};

/**
 * 更新存储配置
 */
export const updateStorageConfig = async (req: Request, res: Response) => {
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
      await settingsService.set('storage_mode', mode, 'string', 'storage');
    }

    // 更新本地存储基础 URL
    if (localBaseUrl) {
      await settingsService.set('storage_base_url', localBaseUrl, 'string', 'storage');
    }

    // 清除 Redis 缓存
    await storageService.clearStorageModeCache();

    res.json({
      success: true,
      message: '存储配置更新成功',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: '更新存储配置失败',
      error: error.message,
    });
  }
};
