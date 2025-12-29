"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cdnTransformMiddleware = void 0;
const oss_1 = require("../utils/oss");
/**
 * 递归转换对象中的 OSS URL 为 CDN URL
 */
function transformUrls(obj) {
    if (!obj)
        return obj;
    if (typeof obj === 'string') {
        return obj.includes('.aliyuncs.com/') ? (0, oss_1.toCdnUrl)(obj) : obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(transformUrls);
    }
    if (typeof obj === 'object') {
        const result = {};
        for (const key of Object.keys(obj)) {
            result[key] = transformUrls(obj[key]);
        }
        return result;
    }
    return obj;
}
/**
 * 中间件：自动将响应中的 OSS URL 转换为 CDN URL
 */
const cdnTransformMiddleware = (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        return originalJson(transformUrls(body));
    };
    next();
};
exports.cdnTransformMiddleware = cdnTransformMiddleware;
//# sourceMappingURL=cdnTransform.js.map