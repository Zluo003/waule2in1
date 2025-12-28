/**
 * 文件验证工具
 * 通过 Magic Bytes 验证文件真实类型，防止恶意文件上传
 */

// 文件类型的 Magic Bytes 签名
const FILE_SIGNATURES: Record<string, { signatures: number[][]; mimeTypes: string[] }> = {
  // 图片
  jpeg: {
    signatures: [[0xFF, 0xD8]],
    mimeTypes: ['image/jpeg', 'image/jpg'],
  },
  png: {
    signatures: [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
    mimeTypes: ['image/png'],
  },
  gif: {
    signatures: [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]],
    mimeTypes: ['image/gif'],
  },
  webp: {
    signatures: [[0x52, 0x49, 0x46, 0x46]], // RIFF header, needs additional check for WEBP
    mimeTypes: ['image/webp'],
  },
  // 视频
  mp4: {
    signatures: [
      [0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70], // ftyp at offset 4
      [0x00, 0x00, 0x00, 0x1C, 0x66, 0x74, 0x79, 0x70],
      [0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70],
    ],
    mimeTypes: ['video/mp4'],
  },
  quicktime: {
    signatures: [[0x00, 0x00, 0x00, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74]],
    mimeTypes: ['video/quicktime'],
  },
  // 音频
  mp3: {
    signatures: [[0xFF, 0xFB], [0xFF, 0xFA], [0xFF, 0xF3], [0x49, 0x44, 0x33]], // ID3 tag
    mimeTypes: ['audio/mpeg', 'audio/mp3'],
  },
  wav: {
    signatures: [[0x52, 0x49, 0x46, 0x46]], // RIFF header
    mimeTypes: ['audio/wav', 'audio/wave'],
  },
  // 文档
  pdf: {
    signatures: [[0x25, 0x50, 0x44, 0x46, 0x2D]], // %PDF-
    mimeTypes: ['application/pdf'],
  },
  docx: {
    signatures: [[0x50, 0x4B, 0x03, 0x04]], // ZIP-based (Office Open XML)
    mimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  },
  xlsx: {
    signatures: [[0x50, 0x4B, 0x03, 0x04]], // ZIP-based (Office Open XML)
    mimeTypes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
};

/**
 * 验证文件的 Magic Bytes 是否匹配声明的 MIME 类型
 * @param buffer 文件内容 Buffer
 * @param declaredMimeType 声明的 MIME 类型
 * @returns 是否验证通过
 */
export function validateFileMagicBytes(buffer: Buffer, declaredMimeType: string): boolean {
  if (buffer.length < 8) {
    console.log(`[FileValidator] Buffer too small: ${buffer.length} bytes`);
    return false; // 文件太小，无法验证
  }

  // 纯文本文件特殊处理
  if (declaredMimeType === 'text/plain') {
    // 检查是否为可打印 ASCII 或 UTF-8 文本
    return isTextFile(buffer);
  }

  // 查找匹配的签名
  for (const [, config] of Object.entries(FILE_SIGNATURES)) {
    if (config.mimeTypes.includes(declaredMimeType)) {
      // 检查是否匹配任一签名
      for (const signature of config.signatures) {
        if (matchesSignature(buffer, signature)) {
          return true;
        }
      }
      // 声明的类型在我们的签名库中，但签名不匹配
      const first16Bytes = Array.from(buffer.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`[FileValidator] Signature mismatch for ${declaredMimeType}. First 16 bytes: ${first16Bytes}`);
      return false;
    }
  }

  // 未知类型，为了兼容性暂时允许
  // 但记录警告
  return true;
}

/**
 * 检查 buffer 是否以给定签名开头
 */
function matchesSignature(buffer: Buffer, signature: number[]): boolean {
  for (let i = 0; i < signature.length; i++) {
    if (buffer[i] !== signature[i]) {
      return false;
    }
  }
  return true;
}

/**
 * 检查是否为文本文件
 */
function isTextFile(buffer: Buffer): boolean {
  // 检查前 1000 字节
  const checkLength = Math.min(buffer.length, 1000);
  for (let i = 0; i < checkLength; i++) {
    const byte = buffer[i];
    // 允许可打印 ASCII、换行、回车、制表符
    if (byte < 0x09 || (byte > 0x0D && byte < 0x20 && byte !== 0x1B) || byte === 0x7F) {
      // 可能是二进制文件，但也可能是 UTF-8
      // 简单检查：如果有超过 5% 的控制字符，认为不是文本
      let controlCount = 0;
      for (let j = 0; j < checkLength; j++) {
        const b = buffer[j];
        if (b < 0x09 || (b > 0x0D && b < 0x20) || b === 0x7F) {
          controlCount++;
        }
      }
      return controlCount / checkLength < 0.05;
    }
  }
  return true;
}

/**
 * 清理文件名，防止路径遍历攻击
 * @param filename 原始文件名
 * @returns 安全的文件名
 */
export function sanitizeFilename(filename: string): string {
  // 移除路径分隔符和危险字符
  let safe = filename
    .replace(/[\/\\]/g, '_') // 替换路径分隔符
    .replace(/\.\./g, '_')   // 移除路径遍历
    .replace(/[<>:"|?*\x00-\x1F]/g, '_') // 移除非法字符
    .trim();
  
  // 如果文件名为空或仅为点
  if (!safe || safe === '.' || safe === '..') {
    safe = 'unnamed_file';
  }
  
  // 限制文件名长度
  if (safe.length > 200) {
    const ext = safe.lastIndexOf('.') > 0 ? safe.substring(safe.lastIndexOf('.')) : '';
    safe = safe.substring(0, 200 - ext.length) + ext;
  }
  
  return safe;
}

/**
 * 获取推荐的最大文件大小（字节）
 */
export const MAX_FILE_SIZES: Record<string, number> = {
  image: 50 * 1024 * 1024,      // 50MB
  video: 500 * 1024 * 1024,     // 500MB
  audio: 100 * 1024 * 1024,     // 100MB
  document: 50 * 1024 * 1024,   // 50MB
  default: 100 * 1024 * 1024,   // 100MB
};

/**
 * 根据 MIME 类型获取文件类别
 */
export function getFileCategory(mimeType: string): 'image' | 'video' | 'audio' | 'document' | 'default' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text')) return 'document';
  return 'default';
}

export default {
  validateFileMagicBytes,
  sanitizeFilename,
  MAX_FILE_SIZES,
  getFileCategory,
};
