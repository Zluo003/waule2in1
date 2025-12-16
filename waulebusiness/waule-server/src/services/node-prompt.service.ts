import { prisma } from '../index';

export interface CreateNodePromptInput {
  nodeType: string;
  name: string;
  description?: string;
  systemPrompt?: string;
  userPromptTemplate: string;
  enhancePromptTemplate?: string;
  variables?: Array<{ name: string; desc: string; example?: string }>;
  isActive?: boolean;
}

export interface UpdateNodePromptInput {
  name?: string;
  description?: string;
  systemPrompt?: string;
  userPromptTemplate?: string;
  enhancePromptTemplate?: string;
  variables?: Array<{ name: string; desc: string; example?: string }>;
  isActive?: boolean;
}

class NodePromptService {
  /**
   * 获取所有节点提示词模板
   */
  async getAll(includeInactive = false) {
    const where = includeInactive ? {} : { isActive: true };
    return prisma.nodePromptTemplate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * 根据节点类型获取提示词模板
   */
  async getByNodeType(nodeType: string) {
    return prisma.nodePromptTemplate.findUnique({
      where: { nodeType },
    });
  }

  /**
   * 根据ID获取提示词模板
   */
  async getById(id: string) {
    return prisma.nodePromptTemplate.findUnique({
      where: { id },
    });
  }

  /**
   * 创建节点提示词模板
   */
  async create(input: CreateNodePromptInput) {
    // 检查 nodeType 是否已存在
    const existing = await prisma.nodePromptTemplate.findUnique({
      where: { nodeType: input.nodeType },
    });
    if (existing) {
      throw new Error(`节点类型 "${input.nodeType}" 的提示词模板已存在`);
    }

    return prisma.nodePromptTemplate.create({
      data: {
        nodeType: input.nodeType,
        name: input.name,
        description: input.description,
        systemPrompt: input.systemPrompt,
        userPromptTemplate: input.userPromptTemplate,
        enhancePromptTemplate: input.enhancePromptTemplate,
        variables: input.variables || [],
        isActive: input.isActive ?? true,
      },
    });
  }

  /**
   * 更新节点提示词模板
   */
  async update(id: string, input: UpdateNodePromptInput) {
    const existing = await prisma.nodePromptTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error('提示词模板不存在');
    }

    return prisma.nodePromptTemplate.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.systemPrompt !== undefined && { systemPrompt: input.systemPrompt }),
        ...(input.userPromptTemplate !== undefined && { userPromptTemplate: input.userPromptTemplate }),
        ...(input.enhancePromptTemplate !== undefined && { enhancePromptTemplate: input.enhancePromptTemplate }),
        ...(input.variables !== undefined && { variables: input.variables }),
        ...(input.isActive !== undefined && { isActive: input.isActive }),
      },
    });
  }

  /**
   * 删除节点提示词模板
   */
  async delete(id: string) {
    const existing = await prisma.nodePromptTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error('提示词模板不存在');
    }

    return prisma.nodePromptTemplate.delete({
      where: { id },
    });
  }

  /**
   * 切换节点提示词模板启用状态
   */
  async toggleActive(id: string) {
    const existing = await prisma.nodePromptTemplate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new Error('提示词模板不存在');
    }

    return prisma.nodePromptTemplate.update({
      where: { id },
      data: { isActive: !existing.isActive },
    });
  }

  /**
   * 渲染提示词模板（替换变量）
   */
  renderTemplate(template: string, variables: Record<string, string | number | boolean>): string {
    let result = template;
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
      result = result.replace(regex, String(value));
    }
    return result;
  }

  /**
   * 获取智能分镜节点的默认提示词模板
   */
  getStoryboardMasterDefaults(): CreateNodePromptInput {
    return {
      nodeType: 'storyboardMaster',
      name: '智能分镜节点',
      description: '用于生成多角度角色表/分镜网格的智能节点',
      systemPrompt: `You are an Academy Award-winning cinematographer and Director of Photography. 
Your task is to take a simple concept or user input and convert it into a highly technical, evocative, and visually stunning image generation prompt.

If reference images are provided, analyze their style/content and incorporate them into the scene description.

The output MUST include:
1. Subject description (detailed)
2. Camera Shot (e.g., Extreme Close-Up, Wide, Dutch Angle, Over-the-Shoulder)
3. Lens Choice (e.g., 35mm, 85mm anamorphic, macro)
4. Lighting (e.g., Chiaroscuro, Rim lighting, Volumetric fog, Neon, Practical lights)
5. Color Grade/Mood (e.g., Teal & Orange, Noir, Desaturated, Cyberpunk)
6. Film Stock/Texture (e.g., Kodak Portra 400, IMAX 70mm grain)

Output ONLY the final prompt text. Do not add introductory phrases.`,
      userPromptTemplate: `Create a high-resolution {{gridType}} grid layout containing exactly {{totalViews}} distinct panels.
The overall image must be divided into a {{gridRows}} row by {{gridCols}} column grid.
Subject: "{{userInput}}".
Instructions:
- Generate a "Character Sheet" or "Multi-Angle View" contact sheet.
- Each panel must show the SAME subject/scene from a DIFFERENT angle or perspective (e.g., Front, Side, 3/4 View, Back, Close-up, Wide Action).
- Maintain PERFECTION in consistency: The character/object must look identical in design, clothing, and lighting across all panels.
- Use invisible or very thin black borders between panels.
- Ensure the composition fits the grid perfectly so it can be sliced later.`,
      enhancePromptTemplate: `You are a film director's assistant. Rewrite the following scene description into a detailed, cinematic image generation prompt. Focus on lighting, camera angle, texture, and mood. Keep it under 100 words.

Input: "{{userInput}}"`,
      variables: [
        { name: 'userInput', desc: '用户输入的场景描述', example: 'A warrior standing in the rain' },
        { name: 'gridType', desc: '网格类型', example: '2x2' },
        { name: 'gridRows', desc: '网格行数', example: '2' },
        { name: 'gridCols', desc: '网格列数', example: '2' },
        { name: 'totalViews', desc: '总视图数', example: '4' },
        { name: 'aspectRatio', desc: '宽高比', example: '16:9' },
        { name: 'characterCount', desc: '人物参考图数量', example: '3' },
        { name: 'sceneCount', desc: '场景图数量', example: '2' },
        { name: 'hasStyleImage', desc: '是否有风格图', example: 'true' },
      ],
      isActive: true,
    };
  }
}

export const nodePromptService = new NodePromptService();
