/**
 * 文件验证工具
 * 通过 Magic Bytes 验证文件真实类型，防止恶意文件上传
 */
/**
 * 验证文件的 Magic Bytes 是否匹配声明的 MIME 类型
 * @param buffer 文件内容 Buffer
 * @param declaredMimeType 声明的 MIME 类型
 * @returns 是否验证通过
 */
export declare function validateFileMagicBytes(buffer: Buffer, declaredMimeType: string): boolean;
/**
 * 清理文件名，防止路径遍历攻击
 * @param filename 原始文件名
 * @returns 安全的文件名
 */
export declare function sanitizeFilename(filename: string): string;
/**
 * 获取推荐的最大文件大小（字节）
 */
export declare const MAX_FILE_SIZES: Record<string, number>;
/**
 * 根据 MIME 类型获取文件类别
 */
export declare function getFileCategory(mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'default';
declare const _default: {
    validateFileMagicBytes: typeof validateFileMagicBytes;
    sanitizeFilename: typeof sanitizeFilename;
    MAX_FILE_SIZES: Record<string, number>;
    getFileCategory: typeof getFileCategory;
};
export default _default;
//# sourceMappingURL=fileValidator.d.ts.map