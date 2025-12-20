"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runStorageCleanup = runStorageCleanup;
exports.previewStorageCleanup = previewStorageCleanup;
const index_1 = require("../index");
const oss_1 = require("../utils/oss");
const logger_1 = __importDefault(require("../utils/logger"));
/**
 * 从 JSON 对象中递归提取所有 OSS URL
 */
function extractOssUrlsFromJson(obj) {
    const urls = [];
    if (!obj)
        return urls;
    if (typeof obj === 'string') {
        if ((0, oss_1.isOssUrl)(obj)) {
            urls.push(obj);
        }
        return urls;
    }
    if (Array.isArray(obj)) {
        for (const item of obj) {
            urls.push(...extractOssUrlsFromJson(item));
        }
        return urls;
    }
    if (typeof obj === 'object') {
        for (const key of Object.keys(obj)) {
            urls.push(...extractOssUrlsFromJson(obj[key]));
        }
    }
    return urls;
}
/**
 * 执行存储清理任务 - 基于 storageExpiresAt 字段
 * 清理所有已过期的 OSS 内容（storageExpiresAt < now）
 */
async function runStorageCleanup() {
    const startTime = Date.now();
    const now = new Date();
    const result = {
        totalScanned: 0,
        totalDeleted: 0,
        totalFailed: 0,
        byTable: {},
        errors: [],
        durationMs: 0,
    };
    try {
        logger_1.default.info('[StorageCleanup] 开始执行存储清理任务');
        // 1. 清理 GenerationTask 表中过期的内容
        const taskResult = { scanned: 0, deleted: 0, failed: 0 };
        result.byTable['GenerationTask'] = taskResult;
        const expiredTasks = await index_1.prisma.generationTask.findMany({
            where: {
                storageExpiresAt: { not: null, lt: now },
            },
            select: { id: true, resultUrl: true, referenceImages: true },
        });
        const taskUrls = [];
        for (const task of expiredTasks) {
            if (task.resultUrl && (0, oss_1.isOssUrl)(task.resultUrl))
                taskUrls.push(task.resultUrl);
            if (task.referenceImages) {
                taskUrls.push(...extractOssUrlsFromJson(task.referenceImages));
            }
        }
        taskResult.scanned = taskUrls.length;
        result.totalScanned += taskUrls.length;
        if (taskUrls.length > 0) {
            const deleteResult = await (0, oss_1.batchDeleteFromOss)(taskUrls);
            taskResult.deleted = deleteResult.success;
            taskResult.failed = deleteResult.failed;
            result.totalDeleted += deleteResult.success;
            result.totalFailed += deleteResult.failed;
            result.errors.push(...deleteResult.errors.slice(0, 5));
        }
        logger_1.default.info(`[StorageCleanup] GenerationTask: 扫描=${taskResult.scanned}, 删除=${taskResult.deleted}`);
        // 2. 清理 Asset 表中过期的内容
        const assetResult = { scanned: 0, deleted: 0, failed: 0 };
        result.byTable['Asset'] = assetResult;
        const expiredAssets = await index_1.prisma.asset.findMany({
            where: {
                storageExpiresAt: { not: null, lt: now },
            },
            select: { id: true, url: true, thumbnail: true },
        });
        const assetUrls = [];
        for (const asset of expiredAssets) {
            if (asset.url && (0, oss_1.isOssUrl)(asset.url))
                assetUrls.push(asset.url);
            if (asset.thumbnail && (0, oss_1.isOssUrl)(asset.thumbnail))
                assetUrls.push(asset.thumbnail);
        }
        assetResult.scanned = assetUrls.length;
        result.totalScanned += assetUrls.length;
        if (assetUrls.length > 0) {
            const deleteResult = await (0, oss_1.batchDeleteFromOss)(assetUrls);
            assetResult.deleted = deleteResult.success;
            assetResult.failed = deleteResult.failed;
            result.totalDeleted += deleteResult.success;
            result.totalFailed += deleteResult.failed;
            result.errors.push(...deleteResult.errors.slice(0, 5));
        }
        logger_1.default.info(`[StorageCleanup] Asset: 扫描=${assetResult.scanned}, 删除=${assetResult.deleted}`);
        // 3. 清理 Node 表中过期的内容
        const nodeResult = { scanned: 0, deleted: 0, failed: 0 };
        result.byTable['Node'] = nodeResult;
        const expiredNodes = await index_1.prisma.node.findMany({
            where: {
                storageExpiresAt: { not: null, lt: now },
            },
            select: { id: true, data: true },
        });
        const nodeUrls = [];
        for (const node of expiredNodes) {
            if (node.data) {
                nodeUrls.push(...extractOssUrlsFromJson(node.data));
            }
        }
        nodeResult.scanned = nodeUrls.length;
        result.totalScanned += nodeUrls.length;
        if (nodeUrls.length > 0) {
            const deleteResult = await (0, oss_1.batchDeleteFromOss)(nodeUrls);
            nodeResult.deleted = deleteResult.success;
            nodeResult.failed = deleteResult.failed;
            result.totalDeleted += deleteResult.success;
            result.totalFailed += deleteResult.failed;
            result.errors.push(...deleteResult.errors.slice(0, 5));
        }
        logger_1.default.info(`[StorageCleanup] Node: 扫描=${nodeResult.scanned}, 删除=${nodeResult.deleted}`);
        result.durationMs = Date.now() - startTime;
        logger_1.default.info(`[StorageCleanup] 清理任务完成: 总扫描=${result.totalScanned}, 总删除=${result.totalDeleted}, 总失败=${result.totalFailed}, 耗时=${result.durationMs}ms`);
    }
    catch (error) {
        logger_1.default.error('[StorageCleanup] 清理任务失败:', error.message);
        result.errors.push(`任务失败: ${error.message}`);
        result.durationMs = Date.now() - startTime;
    }
    return result;
}
/**
 * 获取存储清理预览（不实际删除，只统计）
 */
async function previewStorageCleanup() {
    const now = new Date();
    const preview = {
        byTable: {},
        totalExpired: 0,
    };
    // 统计 GenerationTask
    const expiredTaskCount = await index_1.prisma.generationTask.count({
        where: { storageExpiresAt: { not: null, lt: now } },
    });
    preview.byTable['GenerationTask'] = { count: expiredTaskCount };
    preview.totalExpired += expiredTaskCount;
    // 统计 Asset
    const expiredAssetCount = await index_1.prisma.asset.count({
        where: { storageExpiresAt: { not: null, lt: now } },
    });
    preview.byTable['Asset'] = { count: expiredAssetCount };
    preview.totalExpired += expiredAssetCount;
    // 统计 Node
    const expiredNodeCount = await index_1.prisma.node.count({
        where: { storageExpiresAt: { not: null, lt: now } },
    });
    preview.byTable['Node'] = { count: expiredNodeCount };
    preview.totalExpired += expiredNodeCount;
    return preview;
}
exports.default = {
    runStorageCleanup,
    previewStorageCleanup,
};
//# sourceMappingURL=storage-cleanup.service.js.map