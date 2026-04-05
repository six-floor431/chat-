// 存档模块 - 管理存档导入导出

export class SaveManager {
  constructor() {
    this.requiredFields = ['user', 'worldview', 'affection', 'trust', 'aiInfo', 'aiPersona'];
  }
  
  async exportSave() {
    try {
      // 读取角色数据
      const roleData = await window.electronAPI.loadFullRoleData();

      // 读取记忆数据
      const memoData = await window.electronAPI.memoLoad();

      // 清理记忆数据，移除冗余字段
      const cleanedMemories = (memoData.memories || []).map(memory => ({
        id: memory.id,
        content: memory.content,
        importance: memory.importance,
        timestamp: memory.timestamp
      }));

      // 合并成完整存档
      const saveData = {
        ...roleData,
        memories: cleanedMemories
      };

      return saveData;
    } catch (error) {
      console.error('导出存档失败:', error);
      throw error;
    }
  }
  
  async exportSaveAsString() {
    const saveData = await this.exportSave();
    return JSON.stringify(saveData, null, 2);
  }
  
  async downloadSave(filename = 'save.json') {
    const content = await this.exportSaveAsString();
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    URL.revokeObjectURL(url);
  }
  
  async importSave(saveData) {
    try {
      // 验证存档格式
      const validation = this.validateSaveData(saveData);
      if (!validation.valid) {
        throw new Error(`存档格式不正确，缺少字段: ${validation.missing.join(', ')}`);
      }

      // 分离记忆数据，并清理冗余字段
      const memories = (saveData.memories || []).map(memory => ({
        id: memory.id,
        content: memory.content,
        importance: memory.importance,
        timestamp: memory.timestamp
      }));
      const roleData = { ...saveData };
      delete roleData.memories;

      // 保存角色数据
      await window.electronAPI.saveFullRoleData(roleData);

      // 保存记忆数据
      await window.electronAPI.memoSave({
        version: '1.0',
        roleId: 'jntm',
        memories: memories,
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          totalCount: memories.length
        }
      });

      return true;
    } catch (error) {
      console.error('导入存档失败:', error);
      throw error;
    }
  }
  
  async importSaveFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const content = e.target.result;
          const saveData = JSON.parse(content);
          await this.importSave(saveData);
          resolve(true);
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => reject(new Error('读取文件失败'));
      reader.readAsText(file);
    });
  }
  
  validateSaveData(data) {
    const missing = this.requiredFields.filter(field => !(field in data));
    return {
      valid: missing.length === 0,
      missing
    };
  }
  
  async resetCurrentRole() {
    const defaultData = {
      user: { name: '玩家', gender: '男', identity: '测试者' },
      worldview: {
        worldName: '测试世界',
        era: '测试纪元',
        date: '1年1月1日',
        timeFormat: 'year-month-day',
        worldBackground: ''
      },
      affection: 0,
      trust: 0,
      memories: [],
      aiInfo: { name: '测试角色', gender: 'female', age: 16 },
      aiPersona: {
        stages: {
          dislike: { description: '', personality: '', scenario: '', creator_notes: '', tags: [] },
          acquaintance: { description: '', personality: '', scenario: '', creator_notes: '', tags: [] },
          familiar: { description: '', personality: '', scenario: '', creator_notes: '', tags: [] },
          intimate: { description: '', personality: '', scenario: '', creator_notes: '', tags: [] },
          yandere: { description: '', personality: '', scenario: '', creator_notes: '', tags: [] }
        },
        defaultStage: 'acquaintance'
      }
    };

    await this.importSave(defaultData);
    return true;
  }
}

// 单例
let saveManagerInstance = null;

export function getSaveManager() {
  if (!saveManagerInstance) {
    saveManagerInstance = new SaveManager();
  }
  return saveManagerInstance;
}
