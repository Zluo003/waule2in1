/**
 * 图片网格切割工具
 * 用于将生成的多宫格图片切割成独立的图片
 */

export interface SliceResult {
  slices: string[];      // 切割后的 base64 图片数组
  fullImage: string;     // 原始完整图片
  rows: number;
  cols: number;
}

/**
 * 将网格图片切割成独立的图片
 * @param imageUrl - 图片 URL 或 base64 字符串
 * @param rows - 行数 (如 2x2 网格为 2)
 * @param cols - 列数 (如 2x2 网格为 2)
 * @returns Promise<SliceResult> - 切割结果
 */
export const sliceImageGrid = async (
  imageUrl: string,
  rows: number,
  cols: number
): Promise<SliceResult> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';

    img.onload = () => {
      try {
        const w = img.width;
        const h = img.height;
        const pieceWidth = Math.floor(w / cols);
        const pieceHeight = Math.floor(h / rows);

        const pieces: string[] = [];
        const canvas = document.createElement('canvas');
        canvas.width = pieceWidth;
        canvas.height = pieceHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('无法获取 Canvas 上下文'));
          return;
        }

        // 按行列顺序切割
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            ctx.clearRect(0, 0, pieceWidth, pieceHeight);
            ctx.drawImage(
              img,
              c * pieceWidth,  // 源 x
              r * pieceHeight, // 源 y
              pieceWidth,      // 源宽度
              pieceHeight,     // 源高度
              0,               // 目标 x
              0,               // 目标 y
              pieceWidth,      // 目标宽度
              pieceHeight      // 目标高度
            );
            pieces.push(canvas.toDataURL('image/png'));
          }
        }

        resolve({
          slices: pieces,
          fullImage: imageUrl,
          rows,
          cols,
        });
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('图片加载失败'));
    };

    // 处理不同类型的图片源
    if (imageUrl.startsWith('data:')) {
      img.src = imageUrl;
    } else {
      // 对于远程 URL，尝试直接加载
      img.src = imageUrl;
    }
  });
};

/**
 * 根据生成模式获取行列数
 * @param mode - 生成模式：'single' | 'grid2x2' | 'grid3x3'
 * @returns { rows: number, cols: number }
 */
export const getGridDimensions = (mode: 'single' | 'grid2x2' | 'grid3x3'): { rows: number; cols: number } => {
  switch (mode) {
    case 'grid2x2':
      return { rows: 2, cols: 2 };
    case 'grid3x3':
      return { rows: 3, cols: 3 };
    case 'single':
    default:
      return { rows: 1, cols: 1 };
  }
};

/**
 * 获取网格模式的描述文本
 * @param mode - 生成模式
 * @returns 描述文本
 */
export const getGridModeLabel = (mode: 'single' | 'grid2x2' | 'grid3x3'): string => {
  switch (mode) {
    case 'grid2x2':
      return '四宫格 (2×2)';
    case 'grid3x3':
      return '九宫格 (3×3)';
    case 'single':
    default:
      return '单图';
  }
};

/**
 * 将 File 对象转换为 base64 字符串
 * @param file - File 对象
 * @returns Promise<string> - base64 字符串（不含前缀）
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // 返回不含 data:xxx;base64, 前缀的纯 base64 字符串
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = (error) => reject(error);
  });
};

/**
 * 将 base64 字符串转换为 Blob
 * @param base64 - base64 字符串（含或不含前缀）
 * @param mimeType - MIME 类型，默认 'image/png'
 * @returns Blob
 */
export const base64ToBlob = (base64: string, mimeType: string = 'image/png'): Blob => {
  // 如果包含 data: 前缀，提取纯 base64 部分
  const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * 下载图片
 * @param imageUrl - 图片 URL 或 base64
 * @param fileName - 文件名
 */
export const downloadImage = (imageUrl: string, fileName: string = 'image.png'): void => {
  const a = document.createElement('a');
  a.href = imageUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/**
 * 批量下载图片为 ZIP（需要 JSZip 库）
 * @param images - 图片数组 { url: string, name: string }[]
 * @param zipFileName - ZIP 文件名
 */
export const downloadImagesAsZip = async (
  images: Array<{ url: string; name: string }>,
  zipFileName: string = 'images.zip'
): Promise<void> => {
  // 动态导入 JSZip
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const folder = zip.folder('storyboard');

  if (!folder) {
    throw new Error('无法创建 ZIP 文件夹');
  }

  // 添加所有图片到 ZIP
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    try {
      let blob: Blob;
      
      if (img.url.startsWith('data:')) {
        // base64 转 Blob
        blob = base64ToBlob(img.url);
      } else {
        // 远程 URL，fetch 获取
        const response = await fetch(img.url);
        blob = await response.blob();
      }
      
      folder.file(img.name, blob);
    } catch (error) {
      console.error(`添加图片 ${img.name} 到 ZIP 失败:`, error);
    }
  }

  // 生成并下载 ZIP
  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = zipFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
