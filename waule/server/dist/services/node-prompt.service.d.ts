export interface CreateNodePromptInput {
    nodeType: string;
    name: string;
    description?: string;
    systemPrompt?: string;
    userPromptTemplate: string;
    enhancePromptTemplate?: string;
    variables?: Array<{
        name: string;
        desc: string;
        example?: string;
    }>;
    isActive?: boolean;
}
export interface UpdateNodePromptInput {
    name?: string;
    description?: string;
    systemPrompt?: string;
    userPromptTemplate?: string;
    enhancePromptTemplate?: string;
    variables?: Array<{
        name: string;
        desc: string;
        example?: string;
    }>;
    isActive?: boolean;
}
declare class NodePromptService {
    /**
     * 获取所有节点提示词模板
     */
    getAll(includeInactive?: boolean): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        nodeType: string;
        description: string | null;
        systemPrompt: string | null;
        userPromptTemplate: string;
        enhancePromptTemplate: string | null;
        variables: import("@prisma/client/runtime/library").JsonValue | null;
    }[]>;
    /**
     * 根据节点类型获取提示词模板
     */
    getByNodeType(nodeType: string): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        nodeType: string;
        description: string | null;
        systemPrompt: string | null;
        userPromptTemplate: string;
        enhancePromptTemplate: string | null;
        variables: import("@prisma/client/runtime/library").JsonValue | null;
    } | null>;
    /**
     * 根据ID获取提示词模板
     */
    getById(id: string): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        nodeType: string;
        description: string | null;
        systemPrompt: string | null;
        userPromptTemplate: string;
        enhancePromptTemplate: string | null;
        variables: import("@prisma/client/runtime/library").JsonValue | null;
    } | null>;
    /**
     * 创建节点提示词模板
     */
    create(input: CreateNodePromptInput): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        nodeType: string;
        description: string | null;
        systemPrompt: string | null;
        userPromptTemplate: string;
        enhancePromptTemplate: string | null;
        variables: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    /**
     * 更新节点提示词模板
     */
    update(id: string, input: UpdateNodePromptInput): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        nodeType: string;
        description: string | null;
        systemPrompt: string | null;
        userPromptTemplate: string;
        enhancePromptTemplate: string | null;
        variables: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    /**
     * 删除节点提示词模板
     */
    delete(id: string): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        nodeType: string;
        description: string | null;
        systemPrompt: string | null;
        userPromptTemplate: string;
        enhancePromptTemplate: string | null;
        variables: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    /**
     * 切换节点提示词模板启用状态
     */
    toggleActive(id: string): Promise<{
        id: string;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
        name: string;
        nodeType: string;
        description: string | null;
        systemPrompt: string | null;
        userPromptTemplate: string;
        enhancePromptTemplate: string | null;
        variables: import("@prisma/client/runtime/library").JsonValue | null;
    }>;
    /**
     * 渲染提示词模板（替换变量）
     */
    renderTemplate(template: string, variables: Record<string, string | number | boolean>): string;
    /**
     * 获取高清放大节点的默认提示词模板
     */
    getHDUpscaleDefaults(): CreateNodePromptInput;
    /**
     * 获取智能溶图节点的默认提示词模板
     */
    getImageFusionDefaults(): CreateNodePromptInput;
    /**
     * 获取智能分镜节点的默认提示词模板
     */
    getSmartStoryboardDefaults(): CreateNodePromptInput;
}
export declare const nodePromptService: NodePromptService;
export {};
//# sourceMappingURL=node-prompt.service.d.ts.map