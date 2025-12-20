/**
 * 图片处理工具函数
 */

// 最大边长限制（用于压缩）
const MAX_DIMENSION = 1920;

/**
 * 压缩图片：最大边不超过指定尺寸
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
      
      // 计算缩放比例
      if (width > maxDimension || height > maxDimension) {
        const scale = maxDimension / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        console.log(`[ImageUtils] 压缩图片: ${img.width}x${img.height} -> ${width}x${height}`);
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
  
  // OSS URL 直接返回（豆包、Vidu 等可以直接访问）
  if (url.includes('aliyuncs.com') || url.includes('oss-cn-')) {
    console.log('Using OSS URL directly:', url.substring(0, 60));
    return url;
  }
  
  // 其他公网 HTTPS URL 直接返回
  if (url.startsWith('https://') && !isLocalUrl(url)) {
    console.log('Using public URL directly:', url.substring(0, 60));
    return url;
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
 * 获取图片尺寸
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
 * 将本地/内网URL上传到OSS，返回公网URL
 * 用于将租户本地服务器的文件传给AI模型
 */
export const uploadLocalUrlToOss = async (url: string): Promise<string> => {
  // 已经是OSS链接，直接返回
  if (url.includes('aliyuncs.com') || url.includes('oss-cn-')) {
    console.log('[uploadLocalUrlToOss] 已是OSS链接，直接返回:', url.substring(0, 60));
    return url;
  }
  
  // 公网HTTPS链接，直接返回
  if (url.startsWith('https://') && !isLocalUrl(url)) {
    console.log('[uploadLocalUrlToOss] 公网链接，直接返回:', url.substring(0, 60));
    return url;
  }
  
  // base64 数据，直接返回（后端会处理）
  if (url.startsWith('data:')) {
    console.log('[uploadLocalUrlToOss] base64数据，直接返回');
    return url;
  }
  
  // 本地/内网URL，需要下载并上传到OSS
  console.log('[uploadLocalUrlToOss] 检测到本地/内网URL，开始上传到OSS:', url.substring(0, 60));
  
  try {
    // 动态导入API客户端
    const { apiClient } = await import('../lib/api');
    
    // 下载文件
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`下载失败: ${response.status}`);
    }
    const blob = await response.blob();
    
    // 获取文件扩展名
    const urlPath = new URL(url).pathname;
    const ext = urlPath.substring(urlPath.lastIndexOf('.')) || '.mp4';
    const contentType = blob.type || 'video/mp4';
    const fileName = `upload-${Date.now()}${ext}`;
    
    // 获取预签名URL
    const presignedRes = await apiClient.assets.getPresignedUrl(fileName, contentType);
    const { uploadUrl, publicUrl } = presignedRes.data || presignedRes;
    
    if (!uploadUrl || !publicUrl) {
      throw new Error('获取预签名URL失败');
    }
    
    // 上传到OSS
    await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob,
    });
    
    console.log('[uploadLocalUrlToOss] 上传成功:', publicUrl.substring(0, 60));
    return publicUrl;
  } catch (error: any) {
    console.error('[uploadLocalUrlToOss] 上传失败:', error);
    // 上传失败，返回原URL（让服务端尝试处理）
    return url;
  }
};
