import winston from 'winston';
import path from 'path';
import { Request, Response, NextFunction } from 'express';

const isProduction = process.env.NODE_ENV === 'production';

// 🚀 生产环境优化：减少日志输出
const logLevel = process.env.LOG_LEVEL || (isProduction ? 'warn' : 'info');

// 日志格式
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${message}${stack ? '\n' + stack : ''}`;
  })
);

// 创建logger实例
export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
  ],
});

// 🔇 生产环境下采样 HTTP 日志（只记录 10% 的成功请求）
let requestCounter = 0;
const sampleRate = isProduction ? 10 : 1; // 生产环境每 10 个请求记录 1 个

// HTTP请求日志中间件
export const httpLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logMessage = `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`;
    
    // 错误请求始终记录
    if (res.statusCode >= 500) {
      logger.error(logMessage);
    } else if (res.statusCode >= 400) {
      logger.warn(logMessage);
    } else {
      // 🔧 成功请求采样记录（减少日志量）
      requestCounter++;
      if (requestCounter % sampleRate === 0) {
        logger.info(logMessage);
      }
      // 慢请求始终记录
      if (duration > 1000) {
        logger.warn(`[慢请求] ${logMessage}`);
      }
    }
  });
  
  next();
};

export default logger;
