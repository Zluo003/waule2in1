interface SoraImageGenerateOptions {
    prompt: string;
    modelId: string;
    aspectRatio?: string;
    referenceImages?: string[];
    apiKey?: string;
    apiUrl?: string;
}
interface SoraVideoGenerateOptions {
    prompt: string;
    modelId: string;
    aspectRatio?: string;
    referenceImage?: string;
    referenceVideo?: string;
    duration?: number;
    apiKey?: string;
    apiUrl?: string;
}
/**
 * 生成图片
 */
export declare function generateImage(options: SoraImageGenerateOptions): Promise<string>;
/**
 * 生成视频
 */
export declare function generateVideo(options: SoraVideoGenerateOptions): Promise<string>;
/**
 * 角色创建选项
 */
interface SoraCharacterCreateOptions {
    videoUrl: string;
    modelId?: string;
    apiKey?: string;
    apiUrl?: string;
}
/**
 * 角色创建结果
 */
interface SoraCharacterResult {
    characterName: string;
    avatarUrl: string;
}
/**
 * 创建角色（从视频中提取角色信息）
 * 不传prompt，只传视频，API会返回角色名称和头像
 */
export declare function createCharacter(options: SoraCharacterCreateOptions): Promise<SoraCharacterResult>;
export {};
//# sourceMappingURL=sora.service.d.ts.map