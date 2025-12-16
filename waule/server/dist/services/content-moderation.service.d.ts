/**
 * 阿里云内容安全 2.0 服务
 * 用于检测图片和视频中的色情、暴力等违规内容
 *
 * 文档：https://help.aliyun.com/document_detail/467829.html
 */
export interface ModerationResult {
    pass: boolean;
    suggestion: 'pass' | 'review' | 'block';
    label?: string;
    rate?: number;
    reason?: string;
    details?: any;
}
/**
 * 审核图片（内容安全 2.0）
 * @param imageUrl 图片 URL（需要公网可访问）
 * @param service 审核服务，默认 baselineCheck
 */
export declare function moderateImage(imageUrl: string, service?: string): Promise<ModerationResult>;
/**
 * 审核视频（内容安全 2.0 暂不支持，默认通过）
 * TODO: 后续升级为内容安全 2.0 视频审核 API
 */
export declare function moderateVideo(videoUrl: string, _service?: string, _waitResult?: boolean): Promise<ModerationResult>;
/**
 * 智能审核（根据文件类型自动选择）
 */
export declare function moderateContent(url: string, mimeType: string, options?: {
    service?: string;
    waitVideoResult?: boolean;
}): Promise<ModerationResult>;
/**
 * 检查是否启用了内容审核
 */
export declare function isModerationEnabled(): boolean;
//# sourceMappingURL=content-moderation.service.d.ts.map