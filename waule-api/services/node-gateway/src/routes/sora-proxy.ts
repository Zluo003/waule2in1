import { Router, Request, Response } from 'express';
import axios from 'axios';
import { downloadAndUploadToOss } from '../oss';

const router = Router();

const SORA2API_URL = process.env.SORA2API_URL || 'http://localhost:8000';

function log(msg: string, data?: any) {
  const time = new Date().toISOString();
  console.log(`[${time}] [SoraProxy] ${msg}`, data || '');
}

// 从内容中提取所有媒体 URL (视频和图片)
function extractAllMediaUrls(content: string): { url: string; type: 'video' | 'image' }[] {
  const results: { url: string; type: 'video' | 'image' }[] = [];
  
  // 提取所有视频 URL
  const videoRegex = /<video[^>]+src=['"]([^'"]+)['"]/gi;
  let match;
  while ((match = videoRegex.exec(content)) !== null) {
    results.push({ url: match[1], type: 'video' });
  }
  
  // 提取所有图片 URL
  const imgRegex = /<img[^>]+src=['"]([^'"]+)['"]/gi;
  while ((match = imgRegex.exec(content)) !== null) {
    results.push({ url: match[1], type: 'image' });
  }
  
  return results;
}

// 替换内容中的 URL
function replaceUrl(content: string, oldUrl: string, newUrl: string): string {
  return content.split(oldUrl).join(newUrl);
}

// 解析 SSE 响应
function parseSSEResponse(sseText: string): { content: string; rawChunks: any[] } {
  const lines = sseText.split('\n');
  const chunks: any[] = [];
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.substring(6).trim();
      if (data === '[DONE]') break;
      try {
        chunks.push(JSON.parse(data));
      } catch {}
    }
  }
  
  let fullContent = '';
  for (const chunk of chunks) {
    const deltaContent = chunk.choices?.[0]?.delta?.content;
    const messageContent = chunk.choices?.[0]?.message?.content;
    const content = deltaContent || messageContent;
    if (content && typeof content === 'string') {
      fullContent += content;
    }
  }
  
  return { content: fullContent, rawChunks: chunks };
}

// 代理 OpenAI API
router.post('/chat/completions', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const apiKey = req.headers.authorization;
  
  log('收到请求', { model: req.body.model, stream: req.body.stream });
  
  try {
    const response = await axios.post(
      `${SORA2API_URL}/v1/chat/completions`,
      req.body,
      {
        headers: {
          'Authorization': apiKey || '',
          'Content-Type': 'application/json',
        },
        responseType: 'text',
        timeout: 600000,
      }
    );
    
    const isSSE = response.headers['content-type']?.includes('text/event-stream');
    log(`收到 sora2api 响应, SSE=${isSSE}`);
    
    let finalResponse: any;
    
    if (isSSE) {
      const { content, rawChunks } = parseSSEResponse(response.data);
      log(`解析内容长度: ${content.length}`);
      log(`完整内容: ${content}`);
      
      // 提取所有媒体 URL
      const mediaUrls = extractAllMediaUrls(content);
      log(`发现 ${mediaUrls.length} 个媒体 URL`);
      if (mediaUrls.length === 0 && content.includes('http')) {
        log(`内容包含http但未匹配到媒体标签，原始内容: ${content}`);
      }
      
      // 直接使用 Sora 返回的原始 URL，不再上传 OSS
      let processedContent = content;
      for (const media of mediaUrls) {
        log(`使用原始 ${media.type} URL: ${media.url.substring(0, 80)}...`);
      }
      
      finalResponse = {
        id: rawChunks[0]?.id || `chatcmpl-${Date.now()}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: req.body.model,
        choices: [{
          index: 0,
          message: { role: 'assistant', content: processedContent },
          finish_reason: 'stop',
        }],
      };
    } else {
      const data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      let content = data.choices?.[0]?.message?.content || '';
      
      // 提取所有媒体 URL（直接使用原始 URL，不再上传 OSS）
      const mediaUrls = extractAllMediaUrls(content);
      log(`发现 ${mediaUrls.length} 个媒体 URL，直接使用原始 URL`);
      
      for (const media of mediaUrls) {
        log(`使用原始 ${media.type} URL: ${media.url.substring(0, 80)}...`);
      }
      
      data.choices[0].message.content = content;
      finalResponse = data;
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    log(`请求完成, 总耗时 ${totalTime}s`);
    
    res.json(finalResponse);
  } catch (error: any) {
    log(`请求失败: ${error.message}`);
    res.status(error.response?.status || 500).json({
      error: {
        message: error.message,
        type: 'proxy_error',
      },
    });
  }
});

export { router as soraProxyRouter };
