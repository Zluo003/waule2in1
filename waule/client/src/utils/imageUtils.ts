/**
 * 图片处理工具函数
 */

// 最大边长限制（用于压缩）
const MAX_DIMENSION = 2560;  // 最小边长超过2560时压缩
// 文件大小限制（超过此大小强制压缩）
const MAX_FILE_SIZE_MB = 10;

/**
 * 压缩图片：最小边不超过指定尺寸
 * 当最小边超过 maxDimension 时，按比例缩放使最小边等于 maxDimension
 */
export const compressImage = (
  blob: Blob,
  maxDimension: number = MAX_DIMENSION,
  quality: number = 0.9
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      let { width, height } = img;
      const minDimension = Math.min(width, height);
      
      // 当最小边超过 maxDimension 时，按比例缩放
      if (minDimension > maxDimension) {
        const scale = maxDimension / minDimension;
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        console.log(`[ImageUtils] 压缩图片: ${img.width}x${img.height} -> ${width}x${height} (最小边${minDimension} -> ${maxDimension})`);
      }
      
      // 创建 canvas 进行压缩
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // 转为 base64（使用 JPEG 格式以获得更好的压缩率）
      const base64 = canvas.toDataURL('image/jpeg', quality);
      console.log(`[ImageUtils] 压缩后大小: ${Math.round(base64.length / 1024)} KB`);
      resolve(base64);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for compression'));
    };
    
    img.src = url;
  });
};

/**
 * 判断URL是否为本地地址
 */
export const isLocalUrl = (url: string): boolean => {
  if (!url) return false;
  
  const localPatterns = [
    /^https?:\/\/localhost/i,
    /^https?:\/\/127\.0\.0\.1/i,
    /^https?:\/\/0\.0\.0\.0/i,
    /^https?:\/\/192\.168\./i,
    /^https?:\/\/10\./i,
    /^https?:\/\/172\.(1[6-9]|2[0-9]|3[0-1])\./i,
    /^\/uploads\//i,
  ];
  
  return localPatterns.some(pattern => pattern.test(url));
};

/**
 * 将本地图片URL转换为Base64（自动压缩，最大边 1920px）
 */
export const convertLocalImageToBase64 = async (url: string): Promise<string> => {
  try {
    // 使用fetch获取图片
    // 对于相对路径（/uploads/...），补全同源前缀
    const fullUrl = url.startsWith('/uploads/')
      ? (import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}${url}` : url)
      : url;
    const response = await fetch(fullUrl);
    const blob = await response.blob();
    
    // 压缩并转换为 Base64（最大边 1920px）
    console.log(`[ImageUtils] 原始图片大小: ${Math.round(blob.size / 1024)} KB`);
    return await compressImage(blob, MAX_DIMENSION, 0.9);
  } catch (error) {
    console.error('Failed to convert image to base64:', error);
    throw error;
  }
};

/**
 * 处理图片URL
 * - OSS/公网 URL：直接返回（第三方 AI 服务可以直接访问）
 * - 本地 URL：转 base64（第三方无法访问本地服务器）
 */
export const processImageUrl = async (url: string): Promise<string> => {
  if (!url) {
    throw new Error('Image URL is required');
  }
  
  // 如果已经是base64，检查是否需要压缩
  if (url.startsWith('data:image/')) {
    // 如果 base64 太大（超过 500KB），进行压缩
    if (url.length > 500 * 1024) {
      console.log(`[ImageUtils] Base64 太大 (${Math.round(url.length / 1024)} KB)，进行压缩...`);
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        return await compressImage(blob, MAX_DIMENSION, 0.9);
      } catch (error) {
        console.warn('[ImageUtils] 压缩失败，使用原图:', error);
        return url;
      }
    }
    return url;
  }
  
  // OSS URL 或公网 HTTPS URL：检查是否需要压缩
  const isOssUrl = url.includes('aliyuncs.com') || url.includes('oss-cn-');
  const isPublicUrl = url.startsWith('https://') && !isLocalUrl(url);
  
  if (isOssUrl || isPublicUrl) {
    // 先用 HEAD 请求快速获取文件大小，决定是否需要下载压缩
    try {
      // 30秒超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      // 先检查文件大小
      let fileSizeMB = 0;
      try {
        const headResponse = await fetch(url, { method: 'HEAD', signal: controller.signal });
        const contentLength = headResponse.headers.get('content-length');
        if (contentLength) {
          fileSizeMB = parseInt(contentLength) / (1024 * 1024);
        }
      } catch {
        // HEAD 请求失败，继续下载
      }
      
      // 如果文件小于等于10MB且不需要检查尺寸，直接返回URL（优化性能）
      // 但为了确保尺寸检查，还是需要下载
      console.log(`[ImageUtils] 开始下载图片 (${fileSizeMB.toFixed(1)}MB)...`);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      const blob = await response.blob();
      const actualSizeMB = blob.size / (1024 * 1024);
      console.log(`[ImageUtils] 图片下载完成，实际大小: ${actualSizeMB.toFixed(1)}MB`);
      
      // 如果文件大于10MB，强制压缩
      if (actualSizeMB > MAX_FILE_SIZE_MB) {
        console.log(`[ImageUtils] 图片过大 (${actualSizeMB.toFixed(1)}MB > ${MAX_FILE_SIZE_MB}MB)，进行压缩...`);
        return await compressImage(blob, MAX_DIMENSION, 0.85);
      }
      
      // 检查图片尺寸是否需要压缩
      const dimensions = await getImageDimensionsFromBlob(blob);
      const minDimension = Math.min(dimensions.width, dimensions.height);
      
      if (minDimension > MAX_DIMENSION) {
        console.log(`[ImageUtils] 图片尺寸过大 (${dimensions.width}x${dimensions.height}，最小边${minDimension} > ${MAX_DIMENSION})，进行压缩...`);
        return await compressImage(blob, MAX_DIMENSION, 0.9);
      }
      
      // 不需要压缩，直接返回原URL
      console.log(`Using ${isOssUrl ? 'OSS' : 'public'} URL directly:`, url.substring(0, 60));
      return url;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.error('[ImageUtils] 图片下载超时（30秒），跳过此图');
        throw new Error('图片下载超时');
      }
      console.warn('[ImageUtils] 检查图片失败，直接使用原URL:', error);
      return url;
    }
  }
  
  // 本地地址，转换为base64（因为第三方AI服务无法访问）
  if (isLocalUrl(url)) {
    console.log('Converting local image to base64:', url);
    return await convertLocalImageToBase64(url);
  }
  
  // 其他情况直接返回
  return url;
};

/**
 * 从文件创建Base64
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * 验证图片URL是否有效
 */
export const validateImageUrl = async (url: string): Promise<boolean> => {
  try {
    const response = await fetch(url, { method: 'HEAD' });
    const contentType = response.headers.get('content-type');
    return response.ok && (contentType?.startsWith('image/') || false);
  } catch (error) {
    return false;
  }
};

/**
 * 获取图片尺寸（从URL）
 */
export const getImageDimensions = (url: string): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = reject;
    img.src = url;
  });
};

/**
 * 获取图片尺寸（从Blob）
 */
export const getImageDimensionsFromBlob = (blob: Blob): Promise<{ width: number; height: number }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
};
