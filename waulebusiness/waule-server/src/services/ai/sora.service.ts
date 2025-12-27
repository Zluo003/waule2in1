import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { uploadBuffer } from '../../utils/oss';
import { logger } from '../../utils/logger';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { wauleApiClient, getServerConfigByModelId, ServerConfig } from '../wauleapi-client';

// SOCKS5 代理配置
let _proxyAgent: SocksProxyAgent | undefined;
function getProxyAgent(): SocksProxyAgent | undefined {
  if (_proxyAgent === undefined) {
    const proxyUrl = process.env.SOCKS_PROXY;
    if (proxyUrl) {
      _proxyAgent = new SocksProxyAgent(proxyUrl);
      logger.info(`[Sora] 使用 SOCKS5 代理: ${proxyUrl}`);
    }
  }
  return _proxyAgent;
}

/**
 * Sora API 服务（通过 sora2api 部署）
 * 完全兼容 OpenAI API 格式
 */

/**
 * 将URL转换为base64 data URL格式（sora2api需要）
 */
async function urlToBase64DataUrl(url: string, mimeType?: string): Promise<string> {
  // 如果已经是 base64 data URL，直接返回
  if (url.startsWith('data:')) {
    return url;
  }
  
  try {
    let buffer: Buffer;
    
    if (url.startsWith('http://') || url.startsWith('https://')) {
      // 远程 URL：下载内容
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000, // 120秒下载超时（视频可能较大）
      });
      buffer = Buffer.from(response.data);
      
      // 从响应头或 URL 推断 MIME 类型
      if (!mimeType) {
        mimeType = response.headers['content-type'] || 
                   (url.match(/\.(mp4|webm)$/i) ? 'video/mp4' : 
                    url.match(/\.(png)$/i) ? 'image/png' :
                    url.match(/\.(jpg|jpeg)$/i) ? 'image/jpeg' :
                    url.match(/\.(gif)$/i) ? 'image/gif' :
                    'application/octet-stream');
      }
    } else {
      // 本地文件路径
      const fullPath = url.startsWith('/') ? url : path.join(process.cwd(), url);
      if (!fs.existsSync(fullPath)) {
        logger.warn(`[Sora] 本地文件不存在: ${fullPath}`);
        return url;
      }
      buffer = fs.readFileSync(fullPath);
      
      // 从扩展名推断 MIME 类型
      if (!mimeType) {
        const ext = path.extname(fullPath).toLowerCase();
        mimeType = ext === '.mp4' ? 'video/mp4' :
                   ext === '.webm' ? 'video/webm' :
                   ext === '.png' ? 'image/png' :
                   ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                   ext === '.gif' ? 'image/gif' :
                   'application/octet-stream';
      }
    }
    
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64}`;
    logger.info(`[Sora] ✅ 已将 ${url.substring(0, 50)}... 转换为 base64 data URL (${(base64.length / 1024 / 1024).toFixed(2)} MB)`);
    return dataUrl;
  } catch (error: any) {
    logger.error(`[Sora] URL转base64失败: ${url}`, error.message);
    return url; // 返回原始URL作为fallback
  }
}

/**
 * 直接返回视频 URL，由前端处理上传到 OSS
 * 这样可以避免服务器下载慢的问题
 */
async function downloadFile(url: string, type: 'image' | 'video'): Promise<string> {
  logger.info(`[Sora] ✅ ${type} URL: ${url}（前端直传模式）`);
  // 直接返回原始 URL，由前端下载并上传到 OSS
  return url;
}

interface SoraImageGenerateOptions {
  prompt: string;
  modelId: string;
  aspectRatio?: string;
  referenceImages?: string[];
  serverConfig?: ServerConfig;
  apiKey?: string;
  apiUrl?: string;
}

interface SoraVideoGenerateOptions {
  prompt: string;
  modelId: string;
  aspectRatio?: string;
  referenceImage?: string;
  referenceVideo?: string;
  duration?: number;
  serverConfig?: ServerConfig; // 服务器配置（来自数据库）
  apiKey?: string; // 已废弃，保留向后兼容
  apiUrl?: string; // 已废弃，保留向后兼容
}

/**
 * 转换比例格式
 * 1:1 -> landscape (默认)
 * 16:9 -> landscape
 * 9:16 -> portrait
 */
function getOrientationFromRatio(ratio: string): 'landscape' | 'portrait' {
  const [w, h] = ratio.split(':').map(Number);
  return w >= h ? 'landscape' : 'portrait';
}

/**
 * 生成图片
 */
export async function generateImage(options: SoraImageGenerateOptions): Promise<string> {
  const {
    prompt,
    modelId,
    aspectRatio = '1:1',
    referenceImages = [],
    apiKey,
    apiUrl,
  } = options;

  // API配置
  const API_KEY = apiKey || process.env.SORA_API_KEY || 'han1234';
  const BASE_URL = apiUrl || process.env.SORA_API_URL || 'http://localhost:8000';

  if (!API_KEY) {
    throw new Error('Sora API 密钥未配置');
  }

  try {
    // 根据比例选择模型
    const orientation = getOrientationFromRatio(aspectRatio);
    let finalModelId = modelId;
    
    // 如果用户选择了通用模型，根据比例自动选择
    if (modelId === 'sora-image') {
      finalModelId = orientation === 'portrait' ? 'sora-image-portrait' : 'sora-image-landscape';
    }

    logger.info(`[Sora] 生成图片, 模型: ${finalModelId}, 比例: ${aspectRatio}`);

    // 构建请求体（OpenAI 格式）
    const requestBody: any = {
      model: finalModelId,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    };

    // 如果有参考图，添加到请求中
    if (referenceImages && referenceImages.length > 0) {
      // sora2api 支持通过 image 字段传递 base64 图片
      requestBody.image = referenceImages[0]; // 目前只支持一张参考图
      logger.info(`[Sora] 使用参考图进行生成（图生图模式）`);
    }

    logger.info(`[Sora] 请求详情:`, {
      url: `${BASE_URL}/v1/chat/completions`,
      model: finalModelId,
      promptLength: prompt.length,
      hasReferenceImage: referenceImages.length > 0,
      apiKey: API_KEY.substring(0, 4) + '****', // 只显示前4位
    });

    // 使用 responseType: 'text' 来接收 SSE 流式响应
    const agent = getProxyAgent();
    const response = await axios.post(
      `${BASE_URL}/v1/chat/completions`,
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'text', // 接收文本格式的 SSE 响应
        timeout: 300000, // 300秒超时
        ...(agent ? { httpsAgent: agent, httpAgent: agent } : {}),
      }
    );

    logger.info(`[Sora] API 响应状态: ${response.status} ${response.statusText}`);
    logger.info(`[Sora] API 响应 Content-Type: ${response.headers['content-type']}`);
    logger.info(`[Sora] API 响应数据类型: ${typeof response.data}`);
    logger.info(`[Sora] API 响应数据长度: ${response.data?.length || 0} 字节`);
    
    // 检查是否是 SSE 响应
    const isSSE = response.headers['content-type']?.includes('text/event-stream');
    logger.info(`[Sora] 是否为 SSE 流式响应: ${isSSE ? 'YES' : 'NO'}`);
    
    let parsedData: any;
    
    if (isSSE) {
      // 解析 SSE 格式
      logger.info(`[Sora] 开始解析 SSE 流式响应...`);
      parsedData = parseSSEResponse(response.data);
    } else {
      // 普通 JSON 响应
      logger.info(`[Sora] 解析普通 JSON 响应`);
      parsedData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    }
    
    logger.info(`[Sora] 解析后的数据结构:`, JSON.stringify(parsedData, null, 2).substring(0, 500) + '...');

    if (!parsedData || !parsedData.choices || parsedData.choices.length === 0) {
      logger.error('[Sora] API 响应格式错误，完整数据:', JSON.stringify(parsedData, null, 2));
      logger.error('[Sora] 期望格式: { choices: [{ message: { content: "<img src=...>" } }] }');
      throw new Error('Sora API未返回有效数据');
    }

    // 解析响应中的图片URL
    const content = parsedData.choices[0].message.content;
    logger.info(`[Sora] 最终 content:`, content);
    
    // 从 HTML 标签中提取图片URL: <img src="..." /> 或 <img src='...' />
    // 支持单引号和双引号
    const imgMatch = content.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
    if (!imgMatch || !imgMatch[1]) {
      logger.error('[Sora] 无法从响应中提取图片URL:', content);
      throw new Error('Sora API响应中没有图片URL');
    }

    const imageUrl = imgMatch[1];
    
    // 下载图片到本地
    const localImageUrl = await downloadFile(imageUrl, 'image');

    logger.info(`[Sora] ✅ 图片生成成功！`, {
      remoteUrl: imageUrl,
      localUrl: localImageUrl,
    });

    return localImageUrl;
  } catch (error: any) {
    logger.error('[Sora] 图片生成失败:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: typeof error.response?.data === 'string' 
        ? error.response.data.substring(0, 200) + '...'
        : error.response?.data,
      message: error.message,
    });

    if (error.response?.data) {
      const errorMessage = error.response.data.error?.message || 
                          (typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data));
      throw new Error(`Sora API错误: ${errorMessage}`);
    }

    throw new Error(`Sora图片生成失败: ${error.message}`);
  }
}

/**
 * 解析 SSE (Server-Sent Events) 流式响应
 * 格式：data: {...}\n\ndata: {...}\n\ndata: [DONE]\n\n
 */
function parseSSEResponse(sseText: string): any {
  logger.info(`[Sora] 开始解析 SSE 响应，总长度: ${sseText.length} 字节`);
  
  const lines = sseText.split('\n');
  const chunks: any[] = [];
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.substring(6).trim(); // 移除 "data: " 前缀
      
      if (data === '[DONE]') {
        logger.info(`[Sora] SSE 流结束标记: [DONE]`);
        break;
      }
      
      try {
        const json = JSON.parse(data);
        chunks.push(json);
      } catch (e) {
        logger.warn(`[Sora] 无法解析 SSE chunk: ${data.substring(0, 100)}...`);
      }
    }
  }
  
  console.log(`[Sora] 解析完成，共 ${chunks.length} 个 chunks`);
  
  // 合并所有 chunk 的 content（流式响应会分多个chunk返回）
  let fullContent = '';
  for (const chunk of chunks) {
    // 检查 delta.content（流式）或 message.content（非流式）
    const deltaContent = chunk.choices?.[0]?.delta?.content;
    const messageContent = chunk.choices?.[0]?.message?.content;
    const content = deltaContent || messageContent;
    // 只有当 content 是非空字符串时才拼接（排除 null、undefined、空字符串）
    if (content && typeof content === 'string' && content.trim()) {
      fullContent += content;
    }
  }
  
  console.log(`[Sora] SSE 合并前的 chunks 数量: ${chunks.length}`);
  console.log(`[Sora] SSE 各 chunk 的 content: ${chunks.map(c => c.choices?.[0]?.delta?.content || c.choices?.[0]?.message?.content || '(empty)').join(' | ')}`);
  console.log(`[Sora] SSE 合并后的 fullContent: "${fullContent}"`);
  
  if (fullContent) {
    logger.info(`[Sora] 合并后的 content 长度: ${fullContent.length}`);
    logger.info(`[Sora] 合并后的 content 预览: ${fullContent.substring(0, 200)}...`);
    return {
      choices: [
        {
          message: {
            content: fullContent
          }
        }
      ]
    };
  }
  
  // 如果没找到，返回所有 chunks 供调试
  logger.warn(`[Sora] ⚠️ 未找到包含 content 的 chunk`);
  logger.warn(`[Sora] 原始响应: ${sseText.substring(0, 500)}...`);
  return { chunks, raw: sseText };
}

/**
 * 生成视频
 * 通过 waule-api 网关调用，不需要 apiKey
 */
export async function generateVideo(options: SoraVideoGenerateOptions): Promise<string> {
  const {
    prompt,
    modelId,
    aspectRatio = '16:9',
    referenceImage,
    referenceVideo,
    duration = 10,
  } = options;

  // 根据比例选择模型
  const orientation = getOrientationFromRatio(aspectRatio);
  const durationSuffix = duration === 15 ? '15s' : '10s';
  let finalModelId = modelId;
  
  if (modelId === 'sora-video') {
    finalModelId = `sora-video-${orientation}-${durationSuffix}`;
  } else if (modelId === 'sora-video-portrait' || modelId === 'sora-video-landscape') {
    finalModelId = `${modelId}-${durationSuffix}`;
  }

  logger.info(`[Sora] 生成视频, 模型: ${finalModelId}, 比例: ${aspectRatio}`);

  // 构建消息内容
  let messageContent: any;
  
  if (referenceVideo) {
    // sora2api 需要 base64 格式
    const videoDataUrl = await urlToBase64DataUrl(referenceVideo, 'video/mp4');
    logger.info(`[Sora] 视频已转换为base64`);
    
    if (prompt && prompt.trim()) {
      messageContent = [
        { type: 'video_url', video_url: { url: videoDataUrl } },
        { type: 'text', text: prompt },
      ];
      logger.info(`[Sora] 使用视频+提示词进行生成（视频生视频模式）`);
    } else {
      messageContent = [
        { type: 'video_url', video_url: { url: videoDataUrl } },
      ];
      logger.info(`[Sora] 使用视频进行角色创建`);
    }
  } else if (referenceImage) {
    // 直接使用原始HTTP URL，让gateway下载并上传为文件
    messageContent = [
      { type: 'text', text: prompt || '' },
      { type: 'image_url', image_url: { url: referenceImage } },
    ];
    logger.info(`[Sora] 使用参考图进行生成（图生视频模式）, 图片URL: ${referenceImage.substring(0, 80)}...`);
  } else {
    messageContent = prompt;
    logger.info(`[Sora] 使用纯文本进行生成（文生视频模式）`);
  }
  
  const requestBody: any = {
    model: finalModelId,
    messages: [{ role: 'user', content: messageContent }],
    stream: true,
  };

  logger.info(`[Sora] 请求详情:`, {
    model: finalModelId,
    promptLength: prompt?.length || 0,
    hasReferenceImage: !!referenceImage,
    hasReferenceVideo: !!referenceVideo,
  });

  // 获取服务器配置
  const finalServerConfig = options.serverConfig || await getServerConfigByModelId(finalModelId);

  // 通过 waule-api 网关调用
  try {
    logger.info(`[Sora] 使用 waule-api 网关调用`);
    const response = await wauleApiClient.soraChatCompletions(requestBody, finalServerConfig);
    
    const content = response.choices?.[0]?.message?.content || '';
    const videoMatch = content.match(/<video[^>]+src=['"]([^'"]+)['"]/i);
    if (!videoMatch || !videoMatch[1]) {
      logger.error('[Sora] 无法从响应中提取视频URL:', content);
      throw new Error('Sora API响应中没有视频URL');
    }
    
    const videoUrl = videoMatch[1];
    logger.info(`[Sora] ✅ 视频生成成功`, { videoUrl: videoUrl.substring(0, 80) });
    return videoUrl;
  } catch (error: any) {
    logger.error('[Sora] 视频生成失败:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });
    throw new Error(`Sora视频生成失败: ${error.message}`);
  }
}

/**
 * 角色创建选项
 */
interface SoraCharacterCreateOptions {
  videoUrl: string;
  modelId?: string;
  serverConfig?: ServerConfig;
}

/**
 * 角色创建结果
 */
interface SoraCharacterResult {
  characterName: string;
  avatarUrl: string;
  videoUrl?: string;
}

/**
 * 创建角色（从视频中提取角色信息）
 * 通过 waule-api 网关调用，不需要 apiKey
 */
export async function createCharacter(options: SoraCharacterCreateOptions): Promise<SoraCharacterResult> {
  const { videoUrl, modelId = 'sora-video-landscape-10s', serverConfig } = options;

  // 获取服务器配置
  const finalServerConfig = serverConfig || await getServerConfigByModelId(modelId);

  let finalModelId = modelId;
  if (!modelId.match(/-(10|15|25)s$/)) {
    if (modelId === 'sora-video' || modelId.includes('sora')) {
      finalModelId = 'sora-video-landscape-10s';
    } else {
      finalModelId = `${modelId}-10s`;
    }
  }
  
  logger.info(`[Sora] 创建角色, 模型: ${finalModelId}`);
  logger.info(`[Sora] 使用视频URL: ${videoUrl.substring(0, 100)}...`);

  // 优先使用 future-sora-api 创建角色（需要原始HTTP URL）
  if (videoUrl.startsWith('http://') || videoUrl.startsWith('https://')) {
    try {
      logger.info(`[Sora] 使用 waule-api 网关 future-sora-api 创建角色`);
      
      const response = await wauleApiClient.futureSoraCreateCharacter({
        url: videoUrl,
        timestamps: '1,3',
      }, finalServerConfig);
      
      logger.info(`[Sora] future-sora-api 响应:`, JSON.stringify(response).substring(0, 300));
      
      const characterName = response.id || response.username || '';
      const avatarUrl = response.profile_picture_url || response.permalink || '';
      const generatedVideoUrl = response.video_url || '';
      
      if (characterName) {
        logger.info(`[Sora] ✅ 角色创建成功: @${characterName}`);
        return {
          characterName: `@${characterName}`,
          avatarUrl,
          videoUrl: generatedVideoUrl,
        };
      } else {
        logger.warn(`[Sora] future-sora-api 返回数据没有角色名:`, response);
        throw new Error('未能从响应中提取角色名称');
      }
    } catch (error: any) {
      logger.error(`[Sora] future-sora-api 创建角色失败:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      
      // 回退：使用 sora2api (需要 base64)
      logger.info(`[Sora] 回退使用 soraChatCompletions 创建角色`);
    }
  }

  // 使用 sora2api (需要 base64)
  try {
    const videoDataUrl = await urlToBase64DataUrl(videoUrl, 'video/mp4');
    logger.info(`[Sora] 视频已转换为base64, 大小约: ${(videoDataUrl.length / 1024 / 1024).toFixed(2)} MB`);

    const requestBody = {
      model: finalModelId,
      messages: [{
        role: 'user',
        content: [{ type: 'video_url', video_url: { url: videoDataUrl } }],
      }],
      stream: true,
    };
    
    const parsedData = await wauleApiClient.soraChatCompletions(requestBody, finalServerConfig);
    
    if (!parsedData?.choices?.length) {
      throw new Error('Sora API未返回有效的角色数据');
    }

    const content = parsedData.choices[0].message?.content || '';
    logger.info(`[Sora] 角色创建内容: "${content}"`);

    const nameMatch = content.match(/@[\w\u4e00-\u9fa5-]+/);
    const characterName = nameMatch ? nameMatch[0] : '';

    let avatarUrl = '';
    const avatarMatch = content.match(/头像[:：]([^\s,，]+)/) || 
                        content.match(/<img[^>]+src=['"]([^'"]+)['"]/i) ||
                        content.match(/https?:\/\/[^\s"'<>，,]+/i);
    if (avatarMatch) {
      avatarUrl = avatarMatch[1] || avatarMatch[0];
    }

    if (!characterName) {
      throw new Error('未能从响应中提取角色名称');
    }

    logger.info(`[Sora] ✅ 角色创建成功: ${characterName}`);
    return { characterName, avatarUrl };
  } catch (error: any) {
    logger.error('[Sora] 角色创建失败:', { message: error.message });
    throw new Error(`角色创建失败: ${error.message}`);
  }
}
