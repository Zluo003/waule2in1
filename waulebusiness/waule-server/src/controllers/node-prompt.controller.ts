import { Request, Response } from 'express';
import { nodePromptService } from '../services/node-prompt.service';

/**
 * 获取所有节点提示词模板（管理员）
 */
export const getAllNodePrompts = async (req: Request, res: Response) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const templates = await nodePromptService.getAll(includeInactive);
    res.json({ success: true, data: templates });
  } catch (error: any) {
    console.error('获取节点提示词模板失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 根据节点类型获取提示词模板
 */
export const getNodePromptByType = async (req: Request, res: Response) => {
  try {
    const { nodeType } = req.params;
    const template = await nodePromptService.getByNodeType(nodeType);
    
    if (!template) {
      return res.status(404).json({ 
        success: false, 
        message: `未找到节点类型 "${nodeType}" 的提示词模板` 
      });
    }
    
    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('获取节点提示词模板失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 根据ID获取提示词模板（管理员）
 */
export const getNodePromptById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const template = await nodePromptService.getById(id);
    
    if (!template) {
      return res.status(404).json({ success: false, message: '提示词模板不存在' });
    }
    
    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('获取节点提示词模板失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 创建节点提示词模板（管理员）
 */
export const createNodePrompt = async (req: Request, res: Response) => {
  try {
    const { 
      nodeType, 
      name, 
      description, 
      systemPrompt, 
      userPromptTemplate, 
      enhancePromptTemplate,
      variables,
      isActive 
    } = req.body;

    // 验证必填字段
    if (!nodeType || !name || !userPromptTemplate) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少必填字段: nodeType, name, userPromptTemplate' 
      });
    }

    const template = await nodePromptService.create({
      nodeType,
      name,
      description,
      systemPrompt,
      userPromptTemplate,
      enhancePromptTemplate,
      variables,
      isActive,
    });

    res.status(201).json({ success: true, data: template });
  } catch (error: any) {
    console.error('创建节点提示词模板失败:', error);
    if (error.message.includes('已存在')) {
      return res.status(409).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 更新节点提示词模板（管理员）
 */
export const updateNodePrompt = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      systemPrompt, 
      userPromptTemplate, 
      enhancePromptTemplate,
      variables,
      isActive 
    } = req.body;

    const template = await nodePromptService.update(id, {
      name,
      description,
      systemPrompt,
      userPromptTemplate,
      enhancePromptTemplate,
      variables,
      isActive,
    });

    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('更新节点提示词模板失败:', error);
    if (error.message.includes('不存在')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 删除节点提示词模板（管理员）
 */
export const deleteNodePrompt = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await nodePromptService.delete(id);
    res.json({ success: true, message: '删除成功' });
  } catch (error: any) {
    console.error('删除节点提示词模板失败:', error);
    if (error.message.includes('不存在')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 切换节点提示词模板启用状态（管理员）
 */
export const toggleNodePromptActive = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const template = await nodePromptService.toggleActive(id);
    res.json({ success: true, data: template });
  } catch (error: any) {
    console.error('切换节点提示词模板状态失败:', error);
    if (error.message.includes('不存在')) {
      return res.status(404).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 获取智能分镜节点的默认提示词模板（管理员）
 */
export const getStoryboardMasterDefaults = async (_req: Request, res: Response) => {
  try {
    const defaults = nodePromptService.getStoryboardMasterDefaults();
    res.json({ success: true, data: defaults });
  } catch (error: any) {
    console.error('获取默认模板失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * 初始化智能分镜节点的默认提示词模板（管理员）
 */
export const initStoryboardMasterTemplate = async (_req: Request, res: Response) => {
  try {
    // 检查是否已存在
    const existing = await nodePromptService.getByNodeType('storyboardMaster');
    if (existing) {
      return res.json({ success: true, data: existing, message: '模板已存在' });
    }

    const defaults = nodePromptService.getStoryboardMasterDefaults();
    const template = await nodePromptService.create(defaults);
    res.status(201).json({ success: true, data: template, message: '初始化成功' });
  } catch (error: any) {
    console.error('初始化模板失败:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
