// 内存管理模块（渲染进程）

export class RenderMemoryManager {
  constructor() {
    this.cleanupCallbacks = [];
    this.initialized = false;
  }
  
  init() {
    if (this.initialized) return;
    this.initialized = true;
    
    // 监听主进程的清理请求
    if (window.electronAPI?.performance?.onCleanupRequest) {
      window.electronAPI.performance.onCleanupRequest((aggressive) => {
        this.triggerCleanup(aggressive);
      });
    }
  }
  
  registerCleanupCallback(callback) {
    this.cleanupCallbacks.push(callback);
  }
  
  async triggerCleanup(aggressive = false) {
    // 执行清理回调
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback(aggressive);
      } catch (e) {
        console.error('清理回调失败:', e);
      }
    }
    
    // 清理临时数据
    if (aggressive) {
      this.clearTempData();
    }
  }
  
  clearTempData() {
    // 清理临时创建的URL
    if (window.URL) {
      // 这里可以添加具体的清理逻辑
    }
  }
  
  async getMemoryUsage() {
    if (window.electronAPI?.performance?.getMemoryUsage) {
      return await window.electronAPI.performance.getMemoryUsage();
    }
    return null;
  }
}

// 单例
let renderMemoryManagerInstance = null;

export function getRenderMemoryManager() {
  if (!renderMemoryManagerInstance) {
    renderMemoryManagerInstance = new RenderMemoryManager();
  }
  return renderMemoryManagerInstance;
}
