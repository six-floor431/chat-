// 加载管理器 - 管理页面加载和资源清理

export class LoadingManager {
  constructor() {
    this.abortControllers = new Map();
    this.cleanupCallbacks = [];
  }
  
  createAbortController(id = 'default') {
    const controller = new AbortController();
    this.abortControllers.set(id, controller);
    return controller;
  }
  
  abortController(id = 'default') {
    const controller = this.abortControllers.get(id);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(id);
    }
  }
  
  abortAllRequests() {
    this.abortControllers.forEach(controller => controller.abort());
    this.abortControllers.clear();
  }
  
  registerCleanupCallback(callback) {
    this.cleanupCallbacks.push(callback);
  }
  
  async cleanupResources() {
    // 中断所有请求
    this.abortAllRequests();
    
    // 执行清理回调
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (e) {
        console.error('清理回调执行失败:', e);
      }
    }
    this.cleanupCallbacks = [];
  }
  
  async loadForGameEntry() {
    await this.cleanupResources();
    
    // 重置状态
    const result = {
      success: true,
      message: ''
    };
    
    try {
      // 检查API配置
      const config = localStorage.getItem('aiGameConfig');
      const apiKey = localStorage.getItem('aiGameApiKey');
      
      if (!config || !apiKey) {
        result.success = false;
        result.message = '请先配置API';
      }
    } catch (e) {
      result.success = false;
      result.message = e.message;
    }
    
    return result;
  }
  
  async loadForHomeEntry() {
    await this.cleanupResources();
    return { success: true };
  }
}

// 单例
let loadingManagerInstance = null;

export function getLoadingManager() {
  if (!loadingManagerInstance) {
    loadingManagerInstance = new LoadingManager();
  }
  return loadingManagerInstance;
}
