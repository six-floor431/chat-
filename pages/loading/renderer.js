// 加载页面渲染进程
console.log('[Loading] Page loaded');

// 加载步骤配置
const LOADING_STEPS = [
  { text: '初始化游戏引擎...', duration: 300 },
  { text: '加载核心模块...', duration: 400 },
  { text: '准备角色数据...', duration: 300 },
  { text: '初始化世界观...', duration: 200 },
  { text: '检查 API 配置...', duration: 300 },
  { text: '加载完成!', duration: 200 }
];

// 更新进度条和文本
function updateProgress(percent, text) {
  const progressFill = document.getElementById('progressFill');
  const loadingText = document.getElementById('loadingText');
  
  if (progressFill) {
    progressFill.style.width = `${percent}%`;
  }
  if (loadingText && text) {
    loadingText.textContent = text;
  }
}

// 执行加载动画
async function playLoadingAnimation() {
  const totalSteps = LOADING_STEPS.length;
  let currentProgress = 0;
  
  for (let i = 0; i < totalSteps; i++) {
    const step = LOADING_STEPS[i];
    updateProgress(currentProgress, step.text);
    
    // 等待指定时间
    await new Promise(resolve => setTimeout(resolve, step.duration));
    
    // 更新进度
    currentProgress = ((i + 1) / totalSteps) * 100;
    updateProgress(currentProgress, null);
  }
  
  // 确保 100%
  updateProgress(100, LOADING_STEPS[totalSteps - 1].text);
  
  // 短暂延迟后跳转
  await new Promise(resolve => setTimeout(resolve, 300));
}

// 页面加载时执行
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[Loading] Starting loading animation...');
  
  try {
    await playLoadingAnimation();
    console.log('[Loading] Redirecting to home...');
    electronAPI.navigateTo('home');
  } catch (e) {
    console.error('[Loading] Error:', e);
    // 即使出错也跳转
    setTimeout(() => {
      electronAPI.navigateTo('home');
    }, 1000);
  }
});
