"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSmartStoryboardTemplate = exports.initImageFusionTemplate = exports.initHDUpscaleTemplate = exports.toggleNodePromptActive = exports.deleteNodePrompt = exports.updateNodePrompt = exports.createNodePrompt = exports.getNodePromptById = exports.getNodePromptByType = exports.getAllNodePrompts = void 0;
const node_prompt_service_1 = require("../services/node-prompt.service");
/**
 * 获取所有节点提示词模板（管理员）
 */
const getAllNodePrompts = async (req, res) => {
    try {
        const includeInactive = req.query.includeInactive === 'true';
        const templates = await node_prompt_service_1.nodePromptService.getAll(includeInactive);
        res.json({ success: true, data: templates });
    }
    catch (error) {
        console.error('获取节点提示词模板失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getAllNodePrompts = getAllNodePrompts;
/**
 * 根据节点类型获取提示词模板
 */
const getNodePromptByType = async (req, res) => {
    try {
        const { nodeType } = req.params;
        const template = await node_prompt_service_1.nodePromptService.getByNodeType(nodeType);
        if (!template) {
            return res.status(404).json({
                success: false,
                message: `未找到节点类型 "${nodeType}" 的提示词模板`
            });
        }
        res.json({ success: true, data: template });
    }
    catch (error) {
        console.error('获取节点提示词模板失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getNodePromptByType = getNodePromptByType;
/**
 * 根据ID获取提示词模板（管理员）
 */
const getNodePromptById = async (req, res) => {
    try {
        const { id } = req.params;
        const template = await node_prompt_service_1.nodePromptService.getById(id);
        if (!template) {
            return res.status(404).json({ success: false, message: '提示词模板不存在' });
        }
        res.json({ success: true, data: template });
    }
    catch (error) {
        console.error('获取节点提示词模板失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getNodePromptById = getNodePromptById;
/**
 * 创建节点提示词模板（管理员）
 */
const createNodePrompt = async (req, res) => {
    try {
        const { nodeType, name, description, systemPrompt, userPromptTemplate, enhancePromptTemplate, variables, isActive } = req.body;
        // 验证必填字段
        if (!nodeType || !name || !userPromptTemplate) {
            return res.status(400).json({
                success: false,
                message: '缺少必填字段: nodeType, name, userPromptTemplate'
            });
        }
        const template = await node_prompt_service_1.nodePromptService.create({
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
    }
    catch (error) {
        console.error('创建节点提示词模板失败:', error);
        if (error.message.includes('已存在')) {
            return res.status(409).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.createNodePrompt = createNodePrompt;
/**
 * 更新节点提示词模板（管理员）
 */
const updateNodePrompt = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, systemPrompt, userPromptTemplate, enhancePromptTemplate, variables, isActive } = req.body;
        const template = await node_prompt_service_1.nodePromptService.update(id, {
            name,
            description,
            systemPrompt,
            userPromptTemplate,
            enhancePromptTemplate,
            variables,
            isActive,
        });
        res.json({ success: true, data: template });
    }
    catch (error) {
        console.error('更新节点提示词模板失败:', error);
        if (error.message.includes('不存在')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.updateNodePrompt = updateNodePrompt;
/**
 * 删除节点提示词模板（管理员）
 */
const deleteNodePrompt = async (req, res) => {
    try {
        const { id } = req.params;
        await node_prompt_service_1.nodePromptService.delete(id);
        res.json({ success: true, message: '删除成功' });
    }
    catch (error) {
        console.error('删除节点提示词模板失败:', error);
        if (error.message.includes('不存在')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.deleteNodePrompt = deleteNodePrompt;
/**
 * 切换节点提示词模板启用状态（管理员）
 */
const toggleNodePromptActive = async (req, res) => {
    try {
        const { id } = req.params;
        const template = await node_prompt_service_1.nodePromptService.toggleActive(id);
        res.json({ success: true, data: template });
    }
    catch (error) {
        console.error('切换节点提示词模板状态失败:', error);
        if (error.message.includes('不存在')) {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.toggleNodePromptActive = toggleNodePromptActive;
/**
 * 初始化高清放大节点的默认提示词模板（管理员）
 */
const initHDUpscaleTemplate = async (_req, res) => {
    try {
        // 检查是否已存在
        const existing = await node_prompt_service_1.nodePromptService.getByNodeType('hdUpscale');
        if (existing) {
            return res.json({ success: true, data: existing, message: '模板已存在' });
        }
        const defaults = node_prompt_service_1.nodePromptService.getHDUpscaleDefaults();
        const template = await node_prompt_service_1.nodePromptService.create(defaults);
        res.status(201).json({ success: true, data: template, message: '初始化成功' });
    }
    catch (error) {
        console.error('初始化模板失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.initHDUpscaleTemplate = initHDUpscaleTemplate;
/**
 * 初始化智能溶图节点的默认提示词模板（管理员）
 */
const initImageFusionTemplate = async (_req, res) => {
    try {
        // 检查是否已存在
        const existing = await node_prompt_service_1.nodePromptService.getByNodeType('imageFusion');
        if (existing) {
            return res.json({ success: true, data: existing, message: '模板已存在' });
        }
        const defaults = node_prompt_service_1.nodePromptService.getImageFusionDefaults();
        const template = await node_prompt_service_1.nodePromptService.create(defaults);
        res.status(201).json({ success: true, data: template, message: '初始化成功' });
    }
    catch (error) {
        console.error('初始化模板失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.initImageFusionTemplate = initImageFusionTemplate;
/**
 * 初始化智能分镜节点的默认提示词模板（管理员）
 */
const initSmartStoryboardTemplate = async (_req, res) => {
    try {
        // 检查是否已存在
        const existing = await node_prompt_service_1.nodePromptService.getByNodeType('smartStoryboard');
        if (existing) {
            return res.json({ success: true, data: existing, message: '模板已存在' });
        }
        const defaults = node_prompt_service_1.nodePromptService.getSmartStoryboardDefaults();
        const template = await node_prompt_service_1.nodePromptService.create(defaults);
        res.status(201).json({ success: true, data: template, message: '初始化成功' });
    }
    catch (error) {
        console.error('初始化模板失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.initSmartStoryboardTemplate = initSmartStoryboardTemplate;
//# sourceMappingURL=node-prompt.controller.js.map