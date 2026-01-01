"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.imageSliceService = void 0;
const sharp_1 = __importDefault(require("sharp"));
const axios_1 = __importDefault(require("axios"));
const storage_service_1 = require("./storage.service");
const logger_1 = require("../utils/logger");
class ImageSliceService {
    /**
     * 切割图片为网格
     * @param imageUrl 图片 URL
     * @param rows 行数
     * @param cols 列数
     * @returns 切割后的图片 URL 列表
     */
    async sliceImageGrid(imageUrl, rows, cols) {
        logger_1.logger.info(`[ImageSlice] 开始切割图片: ${imageUrl.substring(0, 80)}... (${rows}x${cols})`);
        // 下载图片
        const response = await axios_1.default.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
        });
        const imageBuffer = Buffer.from(response.data);
        // 获取图片尺寸
        const metadata = await (0, sharp_1.default)(imageBuffer).metadata();
        const { width, height } = metadata;
        if (!width || !height) {
            throw new Error('无法获取图片尺寸');
        }
        const pieceWidth = Math.floor(width / cols);
        const pieceHeight = Math.floor(height / rows);
        logger_1.logger.info(`[ImageSlice] 图片尺寸: ${width}x${height}, 切片尺寸: ${pieceWidth}x${pieceHeight}`);
        // 切割并上传
        const uploadPromises = [];
        for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
                const left = col * pieceWidth;
                const top = row * pieceHeight;
                const slicePromise = (0, sharp_1.default)(imageBuffer)
                    .extract({ left, top, width: pieceWidth, height: pieceHeight })
                    .png()
                    .toBuffer()
                    .then(async (buffer) => {
                    const url = await storage_service_1.storageService.uploadBuffer(buffer, '.png');
                    logger_1.logger.info(`[ImageSlice] 切片 ${row * cols + col + 1}/${rows * cols} 上传成功`);
                    return url;
                });
                uploadPromises.push(slicePromise);
            }
        }
        const urls = await Promise.all(uploadPromises);
        logger_1.logger.info(`[ImageSlice] 切割完成，共 ${urls.length} 个切片`);
        return { urls, width: pieceWidth, height: pieceHeight };
    }
}
exports.imageSliceService = new ImageSliceService();
//# sourceMappingURL=image-slice.service.js.map