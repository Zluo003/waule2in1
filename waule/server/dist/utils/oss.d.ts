/**
 * 是否跳过服务器转存，让前端自己处理
 * 设置为 true 时，AI 生成的内容 URL 将直接返回给前端，由前端转存到 OSS
 * 这样可以大幅减少服务器带宽消耗
 */
export declare const SKIP_SERVER_TRANSFER: boolean;
export declare const uploadPath: (fullPath: string) => Promise<string>;
export declare const uploadBuffer: (buffer: Buffer, ext?: string) => Promise<string>;
export declare const ensureAliyunOssUrl: (u?: string) => Promise<string | undefined>;
/**
 * 生成前端直传 OSS 的预签名 URL
 * @param ext 文件扩展名（如 .jpg, .mp4）
 * @param contentType MIME 类型
 * @returns { uploadUrl, publicUrl, objectKey }
 */
export declare const generatePresignedUrl: (ext: string, contentType: string) => Promise<{
    uploadUrl: string;
    publicUrl: string;
    objectKey: string;
}>;
/**
 * 从 URL 流式下载并上传到 OSS（边下载边上传，内存占用极小）
 * @param url 源文件 URL
 * @param prefix 文件名前缀，如 'minimaxi', 'doubao', 'wanx'
 * @param headers 可选的请求头
 * @returns OSS 公共 URL
 */
export declare const downloadAndUploadToOss: (url: string, prefix?: string, headers?: Record<string, string>, forceTransfer?: boolean) => Promise<string>;
/**
 * 从 URL 流式下载并上传到 OSS（边下载边上传，适合大文件如视频）
 * @param url 源文件 URL
 * @param ext 文件扩展名，如 '.mp4', '.jpg'
 * @param headers 可选的请求头
 * @returns OSS 公共 URL
 */
export declare const streamDownloadAndUploadToOss: (url: string, ext: string, headers?: Record<string, string>, forceTransfer?: boolean) => Promise<string>;
//# sourceMappingURL=oss.d.ts.map