// 世界观模块 - 管理世界设定

export class WorldviewManager {
  constructor() {
    this.worldview = null;
  }
  
  async init() {
    try {
      const data = await window.electronAPI.loadFullRoleData();
      this.worldview = data.worldview || {
        worldName: '未知世界',
        era: '未知',
        date: '1年1月1日',
        timeFormat: '',
        worldBackground: ''
      };
      return true;
    } catch (error) {
      console.error('加载世界观失败:', error);
      return false;
    }
  }
  
  async get() {
    if (!this.worldview) {
      await this.init();
    }
    return this.worldview;
  }
  
  async set(newWorldview) {
    this.worldview = {
      ...this.worldview,
      ...newWorldview
    };
    
    // 保存到文件
    const data = await window.electronAPI.loadFullRoleData();
    data.worldview = this.worldview;
    await window.electronAPI.saveFullRoleData(data);
    
    // 同步到localStorage
    localStorage.setItem('aiGameWorldview', JSON.stringify(this.worldview));
  }
  
  getPlayerName() {
    return this.worldview?.playerName || '玩家';
  }

  getCurrentTime() {
    if (!this.worldview) return null;

    // 返回日期字符串和纪元
    return {
      date: this.worldview.date || '1年1月1日',
      era: this.worldview.era || '未知'
    };
  }

  // advanceTime 方法已废弃，日期推进由 timeAnalysis 模块处理
  async advanceTime(days = 1) {
    console.warn('[Worldview] advanceTime 方法已废弃，请使用 timeAnalysis 模块');
    return;
  }
}

// 单例
let worldviewManagerInstance = null;

export function getWorldviewManager() {
  if (!worldviewManagerInstance) {
    worldviewManagerInstance = new WorldviewManager();
  }
  return worldviewManagerInstance;
}
