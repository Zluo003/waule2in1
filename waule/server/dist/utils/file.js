"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadToLocal = void 0;
const logger_1 = require("./logger");
const oss_1 = require("./oss");
/**
 * 下载远程文件并上传到 OSS（不再保存到本地）
 * @param url 远程文件 URL
 * @param folder 已废弃，保留参数兼容性
 * @returns OSS URL
 */
const downloadToLocal = async (url, folder = 'audio') => {
    if (!url)
        return '';
    if (!url.startsWith('http'))
        return url;
    try {
        const ossUrl = await (0, oss_1.downloadAndUploadToOss)(url, folder);
        logger_1.logger.info(`[Download] File uploaded to OSS: ${ossUrl}`);
        return ossUrl;
    }
    catch (error) {
        logger_1.logger.error(`[Download] Failed to download ${url}: ${error.message}`);
        return url; // Return original URL if download fails
    }
};
exports.downloadToLocal = downloadToLocal;
//# sourceMappingURL=file.js.map