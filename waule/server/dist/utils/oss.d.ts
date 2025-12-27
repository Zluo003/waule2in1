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
 * 从 URL 流式下载并上传到当前存储（根据存储模式）
 * @param url 源文件 URL
 * @param prefix 文件名前缀，如 'minimaxi', 'doubao', 'wanx'
 * @param headers 可选的请求头
 * @returns 存储 URL
 */
export declare const downloadAndUploadToOss: (url: string, prefix?: string, headers?: Record<string, string>, forceTransfer?: boolean) => Promise<string>;
/**
 * 从 URL 流式下载并上传到当前存储（根据存储模式，适合大文件如视频）
 * @param url 源文件 URL
 * @param ext 文件扩展名，如 '.mp4', '.jpg'
 * @param headers 可选的请求头
 * @returns 存储 URL
 */
export declare const streamDownloadAndUploadToOss: (url: string, ext: string, headers?: Record<string, string>, forceTransfer?: boolean) => Promise<string>;
/**
 * 从 OSS URL 中提取 objectKey
 * @param url OSS 公共 URL
 * @returns objectKey 或 null（如果不是有效的 OSS URL）
 */
export declare const extractObjectKeyFromUrl: (url: string) => string | null;
/**
 * 检查 URL 是否是我们的 OSS URL
 * @param url 要检查的 URL
 * @returns 是否是 OSS URL
 */
export declare const isOssUrl: (url: string) => boolean;
/**
 * 从 OSS 删除单个文件
 * @param url OSS 公共 URL
 * @returns 是否删除成功
 */
export declare const deleteFromOss: (url: string) => Promise<boolean>;
/**
 * 从 OSS 批量删除文件
 * @param urls OSS 公共 URL 数组
 * @returns 删除结果 { success: number, failed: number, errors: string[] }
 */
export declare const batchDeleteFromOss: (urls: string[]) => Promise<{
    success: number;
    failed: number;
    errors: string[];
}>;
/**
 * 列出 OSS 中指定前缀的所有文件
 * @param prefix 文件前缀，默认 'aivider/'
 * @param maxKeys 最大返回数量，默认 1000
 * @returns 文件列表 { name, url, lastModified, size }[]
 */
export declare const listOssFiles: (prefix?: string, maxKeys?: number) => Promise<Array<{
    name: string;
    url: string;
    lastModified: Date;
    size: number;
}>>;
//# sourceMappingURL=oss.d.ts.map