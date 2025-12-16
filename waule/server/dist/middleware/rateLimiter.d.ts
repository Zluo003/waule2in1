/**
 * 通用 API 速率限制
 * 默认: 15分钟内最多100次请求
 */
export declare const generalLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * 认证相关接口速率限制（更严格）
 * 1分钟内最多10次请求（防止暴力破解）
 */
export declare const authLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * 验证码发送速率限制（非常严格）
 * 1分钟内最多1次，1小时内最多5次
 */
export declare const smsLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * 每小时短信限制（防止短信轰炸）
 */
export declare const smsHourlyLimiter: import("express-rate-limit").RateLimitRequestHandler;
/**
 * AI 生成接口速率限制
 * 1分钟内最多20次请求
 */
export declare const aiLimiter: import("express-rate-limit").RateLimitRequestHandler;
declare const _default: {
    generalLimiter: import("express-rate-limit").RateLimitRequestHandler;
    authLimiter: import("express-rate-limit").RateLimitRequestHandler;
    smsLimiter: import("express-rate-limit").RateLimitRequestHandler;
    smsHourlyLimiter: import("express-rate-limit").RateLimitRequestHandler;
    aiLimiter: import("express-rate-limit").RateLimitRequestHandler;
};
export default _default;
//# sourceMappingURL=rateLimiter.d.ts.map