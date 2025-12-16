/**
 * 阿里云内容安全 2.0 服务
 * 用于检测图片和视频中的色情、暴力等违规内容
 * 
 * 文档：https://help.aliyun.com/document_detail/467829.html
 */

import crypto from 'crypto';
import axios from 'axios';
import { logger } from '../utils/logger';

// 审核结果类型
export interface ModerationResult {
  pass: boolean;           // 是否通过审核
  suggestion: 'pass' | 'review' | 'block';  // 建议：通过/人工复审/阻断
  label?: string;          // 检测到的标签（如 porn, terrorism）
  rate?: number;           // 置信度 0-100
  reason?: string;         // 拒绝原因（用于提示用户）
  details?: any;           // 详细信息
}

// 配置
const CONFIG = {
  enabled: process.env.CONTENT_MODERATION_ENABLED === 'true', // 默认禁用，需要显式开启
  accessKeyId: process.env.OSS_ACCESS_KEY_ID || '',
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET || '',
  region: process.env.CONTENT_MODERATION_REGION || 'cn-shanghai',
  // 默认审核服务（内容安全 2.0 使用 service 而不是 scenes）
  defaultService: 'baselineCheck', // 基础审核
};

// 标签中文映射（内容安全 2.0 标签）
const LABEL_MAP: Record<string, string> = {
  'porn': '色情内容',
  'sexual_content': '色情内容',
  'sexy': '性感内容',
  'terrorism': '暴恐内容',
  'bloody': '血腥内容',
  'violence': '暴力内容',
  'weapon': '武器相关',
  'contraband': '违禁品',
  'ad': '广告内容',
  'qrcode': '二维码',
  'politics': '政治敏感',
  'abuse': '辱骂内容',
  'nonLabel': '正常',
};

/**
 * 生成 ACS3-HMAC-SHA256 签名（内容安全 2.0 使用的新签名方式）
 */
function generateSignatureV3(
  method: string,
  path: string,
  query: Record<string, string>,
  headers: Record<string, string>,
  body: string,
  accessKeySecret: string
): { signature: string; signedHeaders: string } {
  // 1. 构造规范请求
  const sortedQueryKeys = Object.keys(query).sort();
  const canonicalQuery = sortedQueryKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join('&');

  const signedHeaderKeys = ['host', 'x-acs-action', 'x-acs-content-sha256', 'x-acs-date', 'x-acs-signature-nonce', 'x-acs-version'];
  const signedHeaders = signedHeaderKeys.join(';');
  
  const canonicalHeaders = signedHeaderKeys
    .map(k => `${k}:${headers[k]}`)
    .join('\n') + '\n';

  const hashedBody = crypto.createHash('sha256').update(body).digest('hex');
  
  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    hashedBody,
  ].join('\n');

  // 2. 构造待签名字符串
  const hashedCanonicalRequest = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `ACS3-HMAC-SHA256\n${hashedCanonicalRequest}`;

  // 3. 计算签名
  const signature = crypto
    .createHmac('sha256', accessKeySecret)
    .update(stringToSign)
    .digest('hex');

  return { signature, signedHeaders };
}

/**
 * 调用阿里云内容安全 2.0 API
 */
async function callGreenApiV2(action: string, body: any): Promise<any> {
  if (!CONFIG.accessKeyId || !CONFIG.accessKeySecret) {
    logger.warn('[ContentModeration] 未配置阿里云 AccessKey，跳过内容审核');
    return null;
  }

  const host = `green-cip.${CONFIG.region}.aliyuncs.com`;
  const apiVersion = '2022-03-02';
  const method = 'POST';
  const path = '/';
  
  const bodyStr = JSON.stringify(body);
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const nonce = crypto.randomBytes(16).toString('hex');
  const contentSha256 = crypto.createHash('sha256').update(bodyStr).digest('hex');

  const headers: Record<string, string> = {
    'host': host,
    'x-acs-action': action,
    'x-acs-content-sha256': contentSha256,
    'x-acs-date': timestamp,
    'x-acs-signature-nonce': nonce,
    'x-acs-version': apiVersion,
  };

  const { signature, signedHeaders } = generateSignatureV3(
    method, path, {}, headers, bodyStr, CONFIG.accessKeySecret
  );

  const authorization = `ACS3-HMAC-SHA256 Credential=${CONFIG.accessKeyId},SignedHeaders=${signedHeaders},Signature=${signature}`;

  try {
    const response = await axios.post(`https://${host}${path}`, bodyStr, {
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Authorization': authorization,
      },
      timeout: 30000,
    });
    
    return response.data;
  } catch (error: any) {
    const errDetail = error.response?.data 
      ? JSON.stringify(error.response.data) 
      : error.message;
    logger.error(`[ContentModeration] API 调用失败: ${errDetail}`);
    throw error;
  }
}

/**
 * 审核图片（内容安全 2.0）
 * @param imageUrl 图片 URL（需要公网可访问）
 * @param service 审核服务，默认 baselineCheck
 */
export async function moderateImage(
  imageUrl: string, 
  service: string = CONFIG.defaultService
): Promise<ModerationResult> {
  // 如果未启用或未配置，默认通过
  if (!CONFIG.enabled) {
    return { pass: true, suggestion: 'pass' };
  }
  if (!CONFIG.accessKeyId || !CONFIG.accessKeySecret) {
    return { pass: true, suggestion: 'pass' };
  }

  try {
    logger.info(`[ContentModeration] 开始审核图片: ${imageUrl.substring(0, 80)}...`);
    
    // 内容安全 2.0 API 格式
    const body = {
      Service: service,
      ServiceParameters: JSON.stringify({
        imageUrl: imageUrl,
      }),
    };

    const result = await callGreenApiV2('ImageModeration', body);
    
    if (!result) {
      logger.warn('[ContentModeration] API 返回空结果，默认通过');
      return { pass: true, suggestion: 'pass' };
    }

    // 内容安全 2.0 响应格式
    const code = result.Code;
    if (code !== 200 && code !== '200') {
      logger.error(`[ContentModeration] 审核失败: ${result.Message || result.Msg}`);
      return { pass: true, suggestion: 'pass', reason: result.Message };
    }

    const data = result.Data;
    if (!data) {
      return { pass: true, suggestion: 'pass' };
    }

    // 解析审核结果
    // Result: 包含多个检测场景的结果
    const results = data.Result || [];
    let finalSuggestion: 'pass' | 'review' | 'block' = 'pass';
    let blockLabel = '';
    let maxConfidence = 0;
    const details: any[] = [];

    for (const item of results) {
      const label = item.Label;
      const confidence = item.Confidence || 0;
      details.push({ label, confidence });
      
      // nonLabel 表示正常，其他标签表示有问题
      if (label && label !== 'nonLabel') {
        if (confidence >= 80) {
          finalSuggestion = 'block';
          if (confidence > maxConfidence) {
            maxConfidence = confidence;
            blockLabel = label;
          }
        } else if (confidence >= 50 && finalSuggestion !== 'block') {
          finalSuggestion = 'review';
          if (confidence > maxConfidence) {
            maxConfidence = confidence;
            blockLabel = label;
          }
        }
      }
    }

    const pass = finalSuggestion === 'pass';
    const reason = blockLabel ? (LABEL_MAP[blockLabel] || blockLabel) : undefined;
    
    logger.info(`[ContentModeration] 图片审核结果: ${finalSuggestion}${reason ? `, 原因: ${reason}` : ''}`);

    return {
      pass,
      suggestion: finalSuggestion,
      label: blockLabel || undefined,
      rate: maxConfidence || undefined,
      reason: pass ? undefined : `检测到${reason || '违规内容'}`,
      details,
    };
  } catch (error: any) {
    logger.error('[ContentModeration] 图片审核异常:', error.message);
    // 审核异常时默认通过，避免影响用户上传
    return { pass: true, suggestion: 'pass', reason: '审核服务异常' };
  }
}

/**
 * 审核视频（内容安全 2.0 暂不支持，默认通过）
 * TODO: 后续升级为内容安全 2.0 视频审核 API
 */
export async function moderateVideo(
  videoUrl: string,
  _service?: string,
  _waitResult?: boolean
): Promise<ModerationResult> {
  // 如果未启用，默认通过
  if (!CONFIG.enabled) {
    return { pass: true, suggestion: 'pass' };
  }
  
  // 视频审核暂时默认通过，后续可以通过截帧+图片审核实现
  logger.info(`[ContentModeration] 视频审核暂不支持，默认通过: ${videoUrl.substring(0, 50)}...`);
  return { pass: true, suggestion: 'pass' };
}

/**
 * 智能审核（根据文件类型自动选择）
 */
export async function moderateContent(
  url: string,
  mimeType: string,
  options?: {
    service?: string;
    waitVideoResult?: boolean;
  }
): Promise<ModerationResult> {
  const service = options?.service || CONFIG.defaultService;
  
  if (mimeType.startsWith('image/')) {
    return moderateImage(url, service);
  } else if (mimeType.startsWith('video/')) {
    return moderateVideo(url, service, options?.waitVideoResult ?? false);
  }
  
  // 其他类型默认通过
  return { pass: true, suggestion: 'pass' };
}

/**
 * 检查是否启用了内容审核
 */
export function isModerationEnabled(): boolean {
  return !!(CONFIG.accessKeyId && CONFIG.accessKeySecret);
}
