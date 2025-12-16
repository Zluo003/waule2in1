/**
 * 百度翻译服务
 * 文档：https://fanyi-api.baidu.com/doc/21
 */
declare class TranslationService {
    private appid;
    private secret;
    private apiUrl;
    constructor();
    /**
     * 生成签名
     * sign = MD5(appid + query + salt + secret)
     */
    private generateSign;
    /**
     * 检测语言
     * @param text 要检测的文本
     * @returns 语言代码 (en, zh, ja, ko, etc.)
     */
    detectLanguage(text: string): Promise<string>;
    /**
     * 翻译文本
     * @param text 要翻译的文本
     * @param from 源语言 (auto 为自动检测)
     * @param to 目标语言
     * @returns 翻译结果
     */
    translate(text: string, from?: string, to?: string): Promise<{
        translatedText: string;
        detectedLanguage: string;
    }>;
    /**
     * 检查是否为英文文本
     * @param text 要检查的文本
     * @returns 是否为英文
     */
    isEnglish(text: string): boolean;
    /**
     * 智能翻译：自动检测语言，如果不是英文则翻译
     * @param text 要翻译的文本
     * @returns 翻译结果
     */
    smartTranslate(text: string): Promise<{
        translatedText: string;
        detectedLanguage: string;
        needsTranslation: boolean;
    }>;
}
export declare const translationService: TranslationService;
export {};
//# sourceMappingURL=translation.service.d.ts.map