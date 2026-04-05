// 角色设定页面脚本
// 统一读取和保存 assets/role/jntm.json
// 数据结构：
// - user: 玩家信息
// - worldview: 世界观
// - affection/trust: 好感度/信任值
// - memories: 记忆
// - aiInfo: AI 基础信息（name, gender, age）
// - aiPersona.stages: AI 人设阶段

let currentStage = 'dislike';
let fullRoleData = null;  // 缓存完整角色数据

// 阶段配置
const STAGES = ['dislike', 'acquaintance', 'familiar', 'intimate', 'yandere'];

// Toast 通知系统
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  
  // 3秒后自动消失
  setTimeout(() => {
    toast.style.animation = 'toastIn 0.3s ease reverse';
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 3000);
}

// 确认对话框系统
let confirmResolve = null;

function showConfirm(message) {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmOverlay').classList.add('show');
  });
}

function closeConfirm(result) {
  document.getElementById('confirmOverlay').classList.remove('show');
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

// 返回主页
function goBack() {
  electronAPI.navigateTo('home');
}

// 切换阶段标签
function switchStage(stage) {
  currentStage = stage;
  
  // 更新标签样式
  document.querySelectorAll('.stage-tab').forEach(tab => {
    tab.classList.remove('active');
  });
  document.querySelector(`[onclick="switchStage('${stage}')"]`).classList.add('active');
  
  // 更新内容显示
  document.querySelectorAll('.stage-content').forEach(content => {
    content.classList.remove('active');
  });
  document.getElementById(`stage-${stage}`).classList.add('active');
}

// 加载角色数据（从 assets/role/jntm.json）
async function loadCharacterData() {
  try {
    // 使用 Electron API 读取完整数据
    fullRoleData = await electronAPI.loadFullRoleData();
    
    if (!fullRoleData) {
      console.error('无法加载角色数据');
      return;
    }
    
    console.log('加载角色数据:', fullRoleData);
    
    // 加载 AI 基础信息（aiInfo）
    if (fullRoleData.aiInfo) {
      document.getElementById('roleName').value = fullRoleData.aiInfo.name || '';
      document.getElementById('roleGender').value = fullRoleData.aiInfo.gender || 'female';
      document.getElementById('roleAge').value = fullRoleData.aiInfo.age || '';
    }
    
    // 加载玩家信息
    if (fullRoleData.user) {
      document.getElementById('playerName').value = fullRoleData.user.name || '';
      document.getElementById('playerGender').value = fullRoleData.user.gender || '男';
      document.getElementById('playerIdentity').value = fullRoleData.user.identity || '';
    }
    
    // 加载世界观
    if (fullRoleData.worldview) {
      document.getElementById('worldName').value = fullRoleData.worldview.worldName || '';
      document.getElementById('worldEra').value = fullRoleData.worldview.era || '';
      document.getElementById('worldDate').value = fullRoleData.worldview.date || '';
      document.getElementById('timeFormat').value = fullRoleData.worldview.timeFormat || '';
      document.getElementById('worldBackground').value = fullRoleData.worldview.worldBackground || '';
    }
    
    // 加载阶段人设（从 aiPersona.stages）
    const stages = fullRoleData.aiPersona?.stages || fullRoleData.stages || {};
    
    STAGES.forEach(stage => {
      const stageData = stages[stage];
      if (stageData) {
        document.getElementById(`stage-${stage}-description`).value = stageData.description || '';
        document.getElementById(`stage-${stage}-personality`).value = stageData.personality || '';
        document.getElementById(`stage-${stage}-scenario`).value = stageData.scenario || '';
        document.getElementById(`stage-${stage}-tags`).value = stageData.tags ? stageData.tags.join(', ') : '';
      }
    });
    
    console.log('角色数据加载成功');
  } catch (e) {
    console.error('加载角色数据失败:', e);
  }
}

// 保存设定
async function saveSettings() {
  try {
    if (!fullRoleData) {
      fullRoleData = {};
    }
    
    // 更新 AI 基础信息（aiInfo）
    if (!fullRoleData.aiInfo) {
      fullRoleData.aiInfo = {};
    }
    fullRoleData.aiInfo.name = document.getElementById('roleName').value || '角色';
    fullRoleData.aiInfo.gender = document.getElementById('roleGender').value;
    fullRoleData.aiInfo.age = parseInt(document.getElementById('roleAge').value) || 16;
    
    // 更新玩家信息
    if (!fullRoleData.user) {
      fullRoleData.user = {};
    }
    fullRoleData.user.name = document.getElementById('playerName').value || '旅行者';
    fullRoleData.user.gender = document.getElementById('playerGender').value;
    fullRoleData.user.identity = document.getElementById('playerIdentity').value || '冒险家';
    
    // 更新世界观
    if (!fullRoleData.worldview) {
      fullRoleData.worldview = {};
    }
    fullRoleData.worldview.worldName = document.getElementById('worldName').value || '现代世界';
    fullRoleData.worldview.era = document.getElementById('worldEra').value || '现代';
    fullRoleData.worldview.date = document.getElementById('worldDate').value || '1年1月1日';
    fullRoleData.worldview.timeFormat = document.getElementById('timeFormat').value || '';
    fullRoleData.worldview.worldBackground = document.getElementById('worldBackground').value || '';
    
    // 更新阶段人设（保存到 aiPersona.stages）
    if (!fullRoleData.aiPersona) {
      fullRoleData.aiPersona = {};
    }
    if (!fullRoleData.aiPersona.stages) {
      fullRoleData.aiPersona.stages = {};
    }
    
    STAGES.forEach(stage => {
      const tagsValue = document.getElementById(`stage-${stage}-tags`).value;
      const tags = tagsValue ? tagsValue.split(',').map(t => t.trim()).filter(t => t) : [];
      
      // 保留现有阶段的其他字段（如 creator_notes）
      const existingStage = fullRoleData.aiPersona.stages[stage] || {};
      
      fullRoleData.aiPersona.stages[stage] = {
        ...existingStage,  // 保留其他字段
        description: document.getElementById(`stage-${stage}-description`).value,
        personality: document.getElementById(`stage-${stage}-personality`).value,
        scenario: document.getElementById(`stage-${stage}-scenario`).value,
        tags: tags
      };
    });
    
    // 设置默认阶段
    fullRoleData.aiPersona.defaultStage = 'acquaintance';

    // 强制重置游戏进度（因为人设变了，之前的关系和记忆都不匹配了）
    fullRoleData.affection = 0;
    fullRoleData.trust = 0;
    fullRoleData.memories = [];

    console.log('保存角色数据（已重置游戏进度）:', fullRoleData);
    
    // 保存到文件
    const saved = await electronAPI.saveFullRoleData(fullRoleData);

    if (!saved) {
      showToast('保存角色文件失败！', 'error');
      return;
    }

    // 清空记忆文件（memo.json）- 因为人设变了，旧记忆不再适用
    const memoData = {
      version: '1.0',
      roleId: 'jntm',
      memories: [],
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalCount: 0
      }
    };
    await electronAPI.memoSave(memoData);
    console.log('[Character] 记忆文件已清空');
    
    // 同步更新 localStorage（用于快速访问）
    localStorage.setItem('aiGamePlayer', JSON.stringify(fullRoleData.user));
    localStorage.setItem('aiGameWorldview', JSON.stringify(fullRoleData.worldview));
    localStorage.setItem('aiGameCharacterSetting', JSON.stringify({
      affection: 0,  // 强制重置为0
      trust: 0       // 强制重置为0
    }));
    localStorage.setItem('aiGameMemories', JSON.stringify([]));  // 清空记忆缓存

    showToast('设定已保存！游戏进度已重置', 'success');
  } catch (e) {
    console.error('保存设定失败:', e);
    showToast('保存失败：' + e.message, 'error');
  }
}

// 重置表单
async function resetForm() {
  const confirmed = await showConfirm('确定要重置所有设定吗？');
  if (confirmed) {
    // 清空玩家信息
    document.getElementById('playerName').value = '';
    document.getElementById('playerGender').value = '男';
    document.getElementById('playerIdentity').value = '';
    
    // 清空角色信息
    document.getElementById('roleName').value = '';
    document.getElementById('roleGender').value = 'female';
    document.getElementById('roleAge').value = '';
    
    // 清空世界观
    document.getElementById('worldName').value = '';
    document.getElementById('worldEra').value = '';
    document.getElementById('worldYear').value = '';
    document.getElementById('worldBackground').value = '';
    
    // 清空阶段人设
    STAGES.forEach(stage => {
      document.getElementById(`stage-${stage}-description`).value = '';
      document.getElementById(`stage-${stage}-personality`).value = '';
      document.getElementById(`stage-${stage}-scenario`).value = '';
      document.getElementById(`stage-${stage}-tags`).value = '';
    });
    
    showToast('设定已重置', 'success');
  }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', async () => {
  // 加载角色数据
  await loadCharacterData();
});

// ==================== 全局暴露 ====================

window.goBack = goBack;
window.switchStage = switchStage;
window.resetForm = resetForm;
window.saveSettings = saveSettings;
window.closeConfirm = closeConfirm;
