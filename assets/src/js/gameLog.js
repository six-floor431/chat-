// 游戏日志模块

// 日志分类
export const LOG_CATEGORIES = {
  SYSTEM: 'SYSTEM',
  CHAT: 'CHAT',
  MEMORY: 'MEMORY',
  API: 'API',
  UI: 'UI',
  LIVE2D: 'LIVE2D'
};

class GameLogger {
  constructor() {
    this.logQueue = [];
    this.flushInterval = null;
  }

  async init() {
    // 清空旧日志
    await this.clear();

    // 定期刷新日志
    this.flushInterval = setInterval(() => this.flush(), 5000);

    return true;
  }

  async clear() {
    if (window.electronAPI?.gameLog?.clear) {
      await window.electronAPI.gameLog.clear();
    }
    this.logQueue = [];
  }

  write(level, category, message, data = null) {
    const entry = {
      time: new Date().toISOString(),
      level,
      category,
      message,
      data
    };

    this.logQueue.push(entry);

    // 立即输出到控制台
    const logMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log';
    console[logMethod](`[${category}] ${message}`, data || '');
  }

  async flush() {
    if (this.logQueue.length === 0) return;

    const logs = [...this.logQueue];
    this.logQueue = [];

    if (window.electronAPI?.gameLog?.write) {
      for (const log of logs) {
        await window.electronAPI.gameLog.write(log.level, log.category, log.message, log.data);
      }
    }
  }

  async read() {
    if (window.electronAPI?.gameLog?.read) {
      return await window.electronAPI.gameLog.read();
    }
    return '';
  }

  info(category, message, data) {
    this.write('INFO', category, message, data);
  }

  warn(category, message, data) {
    this.write('WARN', category, message, data);
  }

  error(category, message, data) {
    this.write('ERROR', category, message, data);
  }

  debug(category, message, data) {
    this.write('DEBUG', category, message, data);
  }
}

// 创建单例实例
const gameLog = new GameLogger();

// 导出
export default gameLog;
export { gameLog };

// 兼容旧的 getGameLogger 函数
export function getGameLogger() {
  return gameLog;
}
