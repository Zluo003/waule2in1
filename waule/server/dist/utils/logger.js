"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpLogger = exports.logger = void 0;
const winston_1 = __importDefault(require("winston"));
const isProduction = process.env.NODE_ENV === 'production';
// 🚀 生产环境优化：减少日志输出
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'info');
// 日志格式
const logFormat = winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), winston_1.default.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? '\n' + stack : ''}`;
}));
// 创建logger实例
exports.logger = winston_1.default.createLogger({
    level: logLevel,
    format: logFormat,
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(winston_1.default.format.colorize(), logFormat),
        }),
    ],
});
// 🔇 生产环境下采样 HTTP 日志（只记录 10% 的成功请求）
let requestCounter = 0;
const sampleRate = isProduction ? 10 : 1; // 生产环境每 10 个请求记录 1 个
// HTTP请求日志中间件
const httpLogger = (req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
        // 错误请求始终记录
        if (res.statusCode >= 500) {
            exports.logger.error(logMessage);
        }
        else if (res.statusCode >= 400) {
            exports.logger.warn(logMessage);
        }
        else {
            // 🔧 成功请求采样记录（减少日志量）
            requestCounter++;
            if (requestCounter % sampleRate === 0) {
                exports.logger.info(logMessage);
            }
            // 慢请求始终记录
            if (duration > 1000) {
                exports.logger.warn(`[慢请求] ${logMessage}`);
            }
        }
    });
    next();
};
exports.httpLogger = httpLogger;
exports.default = exports.logger;
//# sourceMappingURL=logger.js.map