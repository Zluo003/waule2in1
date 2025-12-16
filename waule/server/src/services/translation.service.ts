import axios from 'axios';
import crypto from 'crypto';

/**
 * 百度翻译服务
 * 文档：https://fanyi-api.baidu.com/doc/21
 */
class TranslationService {
  private appid: string;
  private secret: string;
  private apiUrl = 'https://fanyi-api.baidu.com/api/trans/vip/translate';

  constructor() {
    this.appid = process.env.BAIDU_TRANSLATE_APPID || '';
    this.secret = process.env.BAIDU_TRANSLATE_SECRET || '';
    
    if (!this.appid || !this.secret) {
      console.warn('⚠️ [翻译服务] 百度翻译 API 未配置');
    } else {
      console.log('✅ [翻译服务] 百度翻译 API 已配置');
    }
  }

  /**
   * 生成签名
   * sign = MD5(appid + query + salt + secret)
   */
  private generateSign(query: string, salt: string): string {
    const str = this.appid + query + salt + this.secret;
    return crypto.createHash('md5').update(str).digest('hex');
  }

  /**
   * 检测语言
   * @param text 要检测的文本
   * @returns 语言代码 (en, zh, ja, ko, etc.)
   */
  async detectLanguage(text: string): Promise<string> {
    if (!this.appid || !this.secret) {
      throw new Error('百度翻译 API 未配置');
    }

    try {
      const salt = Date.now().toString();
      const sign = this.generateSign(text, salt);

      const response = await axios.get(this.apiUrl, {
        params: {
          q: text,
          from: 'auto',
          to: 'en',
          appid: this.appid,
          salt: salt,
          sign: sign,
        },
      });

      if (response.data.error_code) {
        throw new Error(`百度翻译 API 错误: ${response.data.error_msg} (${response.data.error_code})`);
      }

      // 返回检测到的源语言
      return response.data.from || 'en';
    } catch (error: any) {
      console.error('❌ [翻译服务] 语言检测失败:', error.message);
      throw error;
    }
  }

  /**
   * 翻译文本
   * @param text 要翻译的文本
   * @param from 源语言 (auto 为自动检测)
   * @param to 目标语言
   * @returns 翻译结果
   */
  async translate(text: string, from: string = 'auto', to: string = 'en'): Promise<{
    translatedText: string;
    detectedLanguage: string;
  }> {
    if (!this.appid || !this.secret) {
      throw new Error('百度翻译 API 未配置，请在 .env 文件中配置 BAIDU_TRANSLATE_APPID 和 BAIDU_TRANSLATE_SECRET');
    }

    // 如果文本为空或太短，直接返回
    if (!text || text.trim().length === 0) {
      return {
        translatedText: text,
        detectedLanguage: from,
      };
    }

    try {
      const salt = Date.now().toString();
      const sign = this.generateSign(text, salt);

      console.log('🌐 [翻译服务] 翻译请求:', {
        textLength: text.length,
        from,
        to,
      });

      const response = await axios.get(this.apiUrl, {
        params: {
          q: text,
          from: from,
          to: to,
          appid: this.appid,
          salt: salt,
          sign: sign,
        },
        timeout: 10000, // 10秒超时
      });

      if (response.data.error_code) {
        console.error('❌ [翻译服务] API 错误:', response.data.error_msg);
        throw new Error(`百度翻译 API 错误: ${response.data.error_msg} (${response.data.error_code})`);
      }

      const result = response.data.trans_result;
      if (!result || result.length === 0) {
        throw new Error('翻译结果为空');
      }

      // 拼接所有翻译结果（支持多段文本）
      const translatedText = result.map((item: any) => item.dst).join('\n');
      const detectedLanguage = response.data.from || from;

      console.log('✅ [翻译服务] 翻译成功:', {
        detectedLanguage,
        translatedLength: translatedText.length,
      });

      return {
        translatedText,
        detectedLanguage,
      };
    } catch (error: any) {
      console.error('❌ [翻译服务] 翻译失败:', error.message);
      
      // 如果是网络错误或超时，提供更友好的错误信息
      if (error.code === 'ECONNABORTED') {
        throw new Error('翻译请求超时，请稍后重试');
      }
      
      throw error;
    }
  }

  /**
   * 检查是否为英文文本
   * @param text 要检查的文本
   * @returns 是否为英文
   */
  isEnglish(text: string): boolean {
    if (!text || text.trim().length === 0) return true;
    
    // 简单检测：如果文本中英文字符占比超过 80%，认为是英文
    const englishChars = text.match(/[a-zA-Z]/g) || [];
    const totalChars = text.replace(/\s/g, '').length;
    
    if (totalChars === 0) return true;
    
    const englishRatio = englishChars.length / totalChars;
    return englishRatio > 0.8;
  }

  /**
   * 智能翻译：自动检测语言，如果不是英文则翻译
   * @param text 要翻译的文本
   * @returns 翻译结果
   */
  async smartTranslate(text: string): Promise<{
    translatedText: string;
    detectedLanguage: string;
    needsTranslation: boolean;
  }> {
    // 快速检测是否为英文
    if (this.isEnglish(text)) {
      console.log('✅ [翻译服务] 检测到英文，无需翻译');
      return {
        translatedText: text,
        detectedLanguage: 'en',
        needsTranslation: false,
      };
    }

    // 需要翻译
    console.log('🌐 [翻译服务] 检测到非英文，开始翻译');
    const result = await this.translate(text, 'auto', 'en');
    
    return {
      translatedText: result.translatedText,
      detectedLanguage: result.detectedLanguage,
      needsTranslation: true,
    };
  }
}

export const translationService = new TranslationService();

