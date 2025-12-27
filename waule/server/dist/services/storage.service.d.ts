export type StorageMode = 'oss' | 'local';
declare class StorageService {
    private uploadDir;
    /**
     * 获取当前存储模式（带 Redis 缓存）
     */
    getStorageMode(): Promise<StorageMode>;
    /**
     * 获取本地存储基础 URL
     */
    getLocalBaseUrl(): Promise<string>;
    /**
     * 清除存储模式缓存
     */
    clearStorageModeCache(): Promise<void>;
    /**
     * 上传 Buffer 到当前存储
     */
    uploadBuffer(buffer: Buffer, ext: string): Promise<string>;
    /**
     * 上传文件路径到当前存储
     */
    uploadPath(filePath: string): Promise<string>;
    /**
     * 上传 Buffer 到本地存储
     */
    private uploadBufferToLocal;
    /**
     * 判断 URL 是否为 OSS URL
     */
    isOssUrl(url: string): boolean;
    /**
     * 判断 URL 是否为本地 URL
     */
    isLocalUrl(url: string): boolean;
    /**
     * 确保 URL 已转存到当前存储（根据存储模式）
     * 类似 ensureAliyunOssUrl，但会根据存储模式选择存储位置
     */
    ensureStoredUrl(url?: string): Promise<string | undefined>;
}
export declare const storageService: StorageService;
export {};
//# sourceMappingURL=storage.service.d.ts.map