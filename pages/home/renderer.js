// 主页渲染进程
// 不依赖外部模块，保持简单

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

// 加载步骤配置
const LOADING_STEPS = [
  { text: '初始化游戏环境...', duration: 200 },
  { text: '加载核心模块...', duration: 300 },
  { text: '准备角色数据...', duration: 200 },
  { text: '检查 API 配置...', duration: 200 },
  { text: '准备完成!', duration: 100 }
];

// 显示加载界面
function showLoading(text = '正在加载...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const progressFill = document.getElementById('progressFill');
  
  if (loadingText) loadingText.textContent = text;
  if (progressFill) progressFill.style.width = '0%';
  if (overlay) overlay.classList.add('active');
}

// 隐藏加载界面
function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

// 更新加载进度
function updateLoading(progress, text) {
  const progressFill = document.getElementById('progressFill');
  const loadingText = document.getElementById('loadingText');
  
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (text && loadingText) loadingText.textContent = text;
}

// 执行加载动画
async function playLoadingAnimation() {
  const totalSteps = LOADING_STEPS.length;
  let currentProgress = 0;
  
  for (let i = 0; i < totalSteps; i++) {
    const step = LOADING_STEPS[i];
    updateLoading(currentProgress, step.text);
    
    // 等待指定时间
    await new Promise(resolve => setTimeout(resolve, step.duration));
    
    // 更新进度
    currentProgress = ((i + 1) / totalSteps) * 100;
    updateLoading(currentProgress, null);
  }
  
  // 确保 100%
  updateLoading(100, LOADING_STEPS[totalSteps - 1].text);
}

// 普通页面导航（不需要加载）
function navigateTo(page) {
  electronAPI.navigateTo(page);
}

// 进入游戏（带加载界面）
async function enterGame() {
  showLoading('正在准备游戏环境...');
  
  try {
    // 执行加载动画
    await playLoadingAnimation();
    
    // 短暂延迟后导航
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // 导航到游戏页面
    electronAPI.navigateTo('game');
    
  } catch (e) {
    console.error('进入游戏失败:', e);
    hideLoading();
    showToast('进入游戏失败: ' + e.message, 'error');
  }
}

// 全局暴露
window.navigateTo = navigateTo;
window.enterGame = enterGame;
