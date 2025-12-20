interface CleanupResult {
    totalScanned: number;
    totalDeleted: number;
    totalFailed: number;
    byTable: Record<string, {
        scanned: number;
        deleted: number;
        failed: number;
    }>;
    errors: string[];
    durationMs: number;
}
/**
 * 执行存储清理任务 - 基于 storageExpiresAt 字段
 * 清理所有已过期的 OSS 内容（storageExpiresAt < now）
 */
export declare function runStorageCleanup(): Promise<CleanupResult>;
/**
 * 获取存储清理预览（不实际删除，只统计）
 */
export declare function previewStorageCleanup(): Promise<{
    byTable: Record<string, {
        count: number;
        totalSize?: number;
    }>;
    totalExpired: number;
}>;
declare const _default: {
    runStorageCleanup: typeof runStorageCleanup;
    previewStorageCleanup: typeof previewStorageCleanup;
};
export default _default;
//# sourceMappingURL=storage-cleanup.service.d.ts.map