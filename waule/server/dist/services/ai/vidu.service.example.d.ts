/**
 * Vidu Q2 图生视频服务使用示例
 *
 * 使用前请确保在管理后台配置了 Vidu 模型:
 * - Provider: vidu
 * - API Key: your_api_key_here
 * - API URL: https://api.vidu.cn (可选)
 *
 * 注意：以下示例需要从管理后台获取 apiKey 和 apiUrl 后才能运行
 */
/**
 * 示例 1: 基础图生视频
 */
declare function example1_BasicImageToVideo(): Promise<void>;
/**
 * 示例 2: 使用本地图片（自动转base64）
 */
declare function example2_LocalImage(): Promise<void>;
/**
 * 示例 3: 音视频直出（带音频）
 */
declare function example3_WithAudio(): Promise<void>;
/**
 * 示例 4: 使用推荐提示词
 */
declare function example4_RecommendedPrompt(): Promise<void>;
/**
 * 示例 5: 错峰模式（节省积分）
 */
declare function example5_OffPeakMode(): Promise<void>;
/**
 * 示例 6: 高级配置（完整参数）
 */
declare function example6_AdvancedConfig(): Promise<void>;
/**
 * 示例 7: 查询任务状态
 */
declare function example7_QueryTaskStatus(): Promise<void>;
/**
 * 示例 8: 取消错峰任务
 */
declare function example8_CancelTask(): Promise<void>;
/**
 * 示例 9: 批量生成（顺序执行）
 */
declare function example9_BatchGeneration(): Promise<void>;
/**
 * 示例 10: 错误处理和重试
 */
declare function example10_ErrorHandling(): Promise<void>;
export { example1_BasicImageToVideo, example2_LocalImage, example3_WithAudio, example4_RecommendedPrompt, example5_OffPeakMode, example6_AdvancedConfig, example7_QueryTaskStatus, example8_CancelTask, example9_BatchGeneration, example10_ErrorHandling, };
//# sourceMappingURL=vidu.service.example.d.ts.map