/**
 * 客户端配置路由
 * 用于客户端保存和恢复连接配置
 */
import { Router, Request, Response } from 'express';
import { saveClientConfig, getClientConfig, deleteClientConfig } from '../services/database.service';
import logger from '../utils/logger';

const router = Router();

/**
 * 保存客户端配置
 * POST /api/client-config
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { clientId, deviceName, localServerUrl, storageMode } = req.body;
    
    if (!clientId) {
      return res.status(400).json({ success: false, error: '缺少 clientId' });
    }
    
    if (!localServerUrl) {
      return res.status(400).json({ success: false, error: '缺少 localServerUrl' });
    }
    
    saveClientConfig({
      clientId,
      deviceName,
      localServerUrl,
      storageMode,
    });
    
    logger.info(`客户端配置已保存: ${clientId}`);
    
    res.json({ success: true, message: '配置已保存' });
  } catch (error: any) {
    logger.error(`保存客户端配置失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 获取客户端配置
 * GET /api/client-config/:clientId
 */
router.get('/:clientId', (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    
    const config = getClientConfig(clientId);
    
    if (!config) {
      return res.status(404).json({ success: false, error: '未找到配置' });
    }
    
    res.json({ success: true, data: config });
  } catch (error: any) {
    logger.error(`获取客户端配置失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 删除客户端配置
 * DELETE /api/client-config/:clientId
 */
router.delete('/:clientId', (req: Request, res: Response) => {
  try {
    const { clientId } = req.params;
    
    deleteClientConfig(clientId);
    
    logger.info(`客户端配置已删除: ${clientId}`);
    
    res.json({ success: true, message: '配置已删除' });
  } catch (error: any) {
    logger.error(`删除客户端配置失败: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

