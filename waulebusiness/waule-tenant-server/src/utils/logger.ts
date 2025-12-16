/**
 * 简单的日志工具
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

const currentLevel = LOG_LEVELS.INFO;

function formatTime(): string {
  return new Date().toISOString();
}

export const logger = {
  debug: (message: string, ...args: any[]) => {
    if (currentLevel <= LOG_LEVELS.DEBUG) {
      console.log(`[${formatTime()}] [DEBUG] ${message}`, ...args);
    }
  },
  
  info: (message: string, ...args: any[]) => {
    if (currentLevel <= LOG_LEVELS.INFO) {
      console.log(`[${formatTime()}] [INFO] ${message}`, ...args);
    }
  },
  
  warn: (message: string, ...args: any[]) => {
    if (currentLevel <= LOG_LEVELS.WARN) {
      console.warn(`[${formatTime()}] [WARN] ${message}`, ...args);
    }
  },
  
  error: (message: string, ...args: any[]) => {
    if (currentLevel <= LOG_LEVELS.ERROR) {
      console.error(`[${formatTime()}] [ERROR] ${message}`, ...args);
    }
  },
};

export default logger;

