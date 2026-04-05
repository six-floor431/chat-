// 人设阶段模块 - 读取角色配置

// 阶段顺序（病娇优先检查）
const STAGE_ORDER = ['yandere', 'intimate', 'familiar', 'acquaintance', 'dislike'];

const STAGE_CONFIG = {
  dislike: {
    name: '厌恶',
    order: 1,
    affectionRange: [-Infinity, -20],
    trustRange: [-Infinity, Infinity],
    affectionMin: -Infinity,
    affectionMax: -20
  },
  acquaintance: {
    name: '初识',
    order: 2,
    affectionRange: [-19, 20],
    trustRange: [-Infinity, Infinity],
    affectionMin: -19,
    affectionMax: 20
  },
  familiar: {
    name: '熟悉',
    order: 3,
    affectionRange: [21, 70],
    trustRange: [-Infinity, Infinity],
    affectionMin: 21,
    affectionMax: 70
  },
  intimate: {
    name: '亲密',
    order: 4,
    affectionRange: [71, 1000],
    trustRange: [0, 100],
    affectionMin: 71,
    affectionMax: 1000,
    trustMin: 0,
    trustMax: 100
  },
  yandere: {
    name: '病娇',
    order: 5,
    affectionRange: [100, 1000],
    trustRange: [-Infinity, -1],
    affectionMin: 100,
    affectionMax: 1000,
    trustMin: -Infinity,
    trustMax: -1
  }
};

// 默认人设
const DEFAULT_PERSONA = {
  description: '',
  personality: '',
  scenario: '',
  creator_notes: '',
  tags: []
};

// 人设管理器
export class CharacterSettingManager {
  constructor() {
    this.affection = 0;   // 好感度
    this.trust = 0;       // 信任值
    this.currentStage = 'acquaintance';
    this.roleData = null;
    this.onStageChange = null;  // 阶段变化回调
  }
  
  async init() {
    try {
      const data = await window.electronAPI.loadFullRoleData();
      this.roleData = data;
      
      // 读取好感度和信任值
      this.affection = data.affection || 0;
      this.trust = data.trust || 0;
      
      // 计算当前阶段
      this.currentStage = this.calculateStage(this.affection, this.trust);
      
      // 同步到localStorage
      this.saveAffectionAndTrust();
      
      return true;
    } catch (error) {
      console.error('初始化角色设定失败:', error);
      return false;
    }
  }
  
  calculateStage(affection, trust) {
    // 先检查病娇（优先级最高）
    if (affection >= 100 && trust < 0) {
      return 'yandere';
    }
    
    // 其他阶段按好感度判断
    if (affection >= 71) return 'intimate';
    if (affection >= 21) return 'familiar';
    if (affection >= -19) return 'acquaintance';
    return 'dislike';
  }
  
  getCurrentStage() {
    return this.currentStage;
  }
  
  getStageName(stage) {
    return STAGE_CONFIG[stage]?.name || '未知';
  }
  
  async getCurrentPersona() {
    if (!this.roleData) {
      await this.init();
    }
    
    const stage = this.currentStage;
    const persona = this.roleData?.aiPersona?.stages?.[stage] || DEFAULT_PERSONA;
    
    return {
      ...persona,
      name: this.roleData?.aiInfo?.name || '角色',
      stage: stage,
      stageName: this.getStageName(stage)
    };
  }
  
  getAffection() {
    return this.affection;
  }
  
  getTrust() {
    return this.trust;
  }
  
  async addAffection(delta) {
    const oldStage = this.currentStage;
    this.affection = Math.max(-100, Math.min(1000, this.affection + delta));
    this.currentStage = this.calculateStage(this.affection, this.trust);
    
    await this.saveAffectionAndTrust();
    
    // 触发阶段变化回调
    if (oldStage !== this.currentStage && this.onStageChange) {
      this.onStageChange(oldStage, this.currentStage);
    }
    
    return this.affection;
  }
  
  async addTrust(delta) {
    const oldStage = this.currentStage;
    this.trust = Math.max(-100, Math.min(100, this.trust + delta));
    this.currentStage = this.calculateStage(this.affection, this.trust);
    
    await this.saveAffectionAndTrust();
    
    if (oldStage !== this.currentStage && this.onStageChange) {
      this.onStageChange(oldStage, this.currentStage);
    }
    
    return this.trust;
  }
  
  async saveAffectionAndTrust() {
    // 更新roleData
    if (this.roleData) {
      this.roleData.affection = this.affection;
      this.roleData.trust = this.trust;
      
      // 保存到文件
      await window.electronAPI.saveFullRoleData(this.roleData);
    }
    
    // 同步到localStorage
    localStorage.setItem('aiGameCharacterSetting', JSON.stringify({
      affection: this.affection,
      trust: this.trust,
      stage: this.currentStage
    }));
  }
  
  get roleInfo() {
    return {
      roleName: this.roleData?.aiInfo?.name || '角色',
      roleGender: this.roleData?.aiInfo?.gender || 'female',
      roleAge: this.roleData?.aiInfo?.age || 16,
      playerName: this.roleData?.user?.name || '玩家',
      playerGender: this.roleData?.user?.gender || '男',
      playerIdentity: this.roleData?.user?.identity || '玩家'
    };
  }
}

// 单例
let characterSettingManagerInstance = null;

export function getCharacterSettingManager() {
  if (!characterSettingManagerInstance) {
    characterSettingManagerInstance = new CharacterSettingManager();
  }
  return characterSettingManagerInstance;
}
