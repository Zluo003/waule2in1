import { logger } from './logger';
import { downloadAndUploadToOss } from './oss';

/**
 * 下载远程文件并上传到 OSS（不再保存到本地）
 * @param url 远程文件 URL
 * @param folder 已废弃，保留参数兼容性
 * @returns OSS URL
 */
export const downloadToLocal = async (url: string, folder: string = 'audio'): Promise<string> => {
    if (!url) return '';
    if (!url.startsWith('http')) return url;

    try {
        const ossUrl = await downloadAndUploadToOss(url, folder);
        logger.info(`[Download] File uploaded to OSS: ${ossUrl}`);
        return ossUrl;
    } catch (error: any) {
        logger.error(`[Download] Failed to download ${url}: ${error.message}`);
        return url; // Return original URL if download fails
    }
};
