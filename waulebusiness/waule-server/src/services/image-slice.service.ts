import sharp from 'sharp';
import axios from 'axios';
import { uploadBuffer } from '../utils/oss';
import logger from '../utils/logger';

interface SliceResult {
  urls: string[];
  width: number;
  height: number;
}

class ImageSliceService {
  /**
   * 切割图片为网格
   * @param imageUrl 图片 URL
   * @param rows 行数
   * @param cols 列数
   * @returns 切割后的图片 URL 列表
   */
  async sliceImageGrid(imageUrl: string, rows: number, cols: number): Promise<SliceResult> {
    logger.info(`[ImageSlice] 开始切割图片: ${imageUrl.substring(0, 80)}... (${rows}x${cols})`);

    // 下载图片
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    const imageBuffer = Buffer.from(response.data);

    // 获取图片尺寸
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    if (!width || !height) {
      throw new Error('无法获取图片尺寸');
    }

    const pieceWidth = Math.floor(width / cols);
    const pieceHeight = Math.floor(height / rows);

    logger.info(`[ImageSlice] 图片尺寸: ${width}x${height}, 切片尺寸: ${pieceWidth}x${pieceHeight}`);

    // 切割并上传
    const uploadPromises: Promise<string>[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const left = col * pieceWidth;
        const top = row * pieceHeight;

        const slicePromise = sharp(imageBuffer)
          .extract({ left, top, width: pieceWidth, height: pieceHeight })
          .png()
          .toBuffer()
          .then(async (buffer) => {
            const url = await uploadBuffer(buffer, '.png');
            logger.info(`[ImageSlice] 切片 ${row * cols + col + 1}/${rows * cols} 上传成功`);
            return url;
          });

        uploadPromises.push(slicePromise);
      }
    }

    const urls = await Promise.all(uploadPromises);
    logger.info(`[ImageSlice] 切割完成，共 ${urls.length} 个切片`);

    return { urls, width: pieceWidth, height: pieceHeight };
  }
}

export const imageSliceService = new ImageSliceService();
