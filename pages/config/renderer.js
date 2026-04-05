// 配置页面渲染进程

// 配置键名
const CONFIG_KEY = 'aiGameConfig';
const API_KEY_STORAGE = 'aiGameApiKey';

// 是否有未保存的更改
let hasChanges = false;

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
async function goBack() {
  if (hasChanges) {
    const confirmed = await showConfirm('有未保存的更改，确定要离开吗？');
    if (!confirmed) {
      return;
    }
  }
  electronAPI.navigateTo('home');
}

// ========== 配置管理 ==========

function getConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (!saved) {
      return getDefaultConfig();
    }

    const config = JSON.parse(saved);

    // 兼容旧的键名 ttsEnabled -> tts
    if (config.ttsEnabled !== undefined && config.tts === undefined) {
      config.tts = config.ttsEnabled;
      delete config.ttsEnabled;
    }

    return config;
  } catch (e) {
    return getDefaultConfig();
  }
}

function getDefaultConfig() {
  return {
    deepThinking: true,
    apiBaseUrl: '',
    apiModel: '',
    tts: true
  };
}

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

// ========== 标记更改 ==========

function markChanged() {
  hasChanges = true;
}

// ========== API 测试 ==========

async function testApi() {
  const apiKey = document.getElementById('api-key').value.trim();
  const apiUrl = document.getElementById('api-base-url').value.trim();
  const model = document.getElementById('api-model').value.trim();
  
  const statusDiv = document.getElementById('api-status');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const testBtn = document.getElementById('test-btn');
  
  if (!apiKey) {
    showStatus(false, '请先输入 API Key');
    return;
  }
  
  if (!apiUrl) {
    showStatus(false, '请输入 API 地址');
    return;
  }
  
  if (!model) {
    showStatus(false, '请输入模型名称');
    return;
  }
  
  // 开始测试
  statusDiv.className = 'api-status show';
  statusDot.className = 'status-dot testing';
  statusText.textContent = '测试中...';
  testBtn.disabled = true;
  
  try {
    // 确保 URL 格式正确
    let baseUrl = apiUrl;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }
    // 移除末尾的斜杠
    baseUrl = baseUrl.replace(/\/+$/, '');
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'user', content: '回复"OK"两个字' }]
      }),
      signal: AbortSignal.timeout(15000)
    });
    
    if (response.ok) {
      const data = await response.json();
      showStatus(true, `连接成功！模型: ${data.model || model}`);
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status}`;
      showStatus(false, errorMsg);
    }
  } catch (error) {
    showStatus(false, error.message || '网络连接失败');
  } finally {
    testBtn.disabled = false;
  }
}

function showStatus(success, message) {
  const statusDiv = document.getElementById('api-status');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  
  statusDiv.className = `api-status show ${success ? 'success' : 'error'}`;
  statusDot.className = `status-dot ${success ? 'success' : 'error'}`;
  statusText.textContent = success ? `✓ ${message}` : `✕ ${message}`;
}

// ========== 保存设置 ==========

function saveSettings() {
  // 保存 API Key
  const apiKey = document.getElementById('api-key').value.trim();
  localStorage.setItem(API_KEY_STORAGE, apiKey);
  
  // 保存配置
  const config = {
    deepThinking: document.getElementById('deepThinking').checked,
    apiBaseUrl: document.getElementById('api-base-url').value.trim(),
    apiModel: document.getElementById('api-model').value.trim(),
    tts: document.getElementById('ttsEnabled').checked
  };
  
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  
  // 清除更改标记
  hasChanges = false;
  
  // 显示保存成功提示
  showToast('设置已保存');
}

function showToast(message, isError = false) {
  const toast = document.getElementById('save-toast');
  toast.textContent = message;
  toast.className = `save-toast show ${isError ? 'toast-error' : ''}`;
  
  setTimeout(() => {
    toast.className = 'save-toast';
  }, 2000);
}

// ========== 初始化 ==========

function loadConfig() {
  const config = getConfig();
  const apiKey = getApiKey();
  
  // API 配置
  document.getElementById('api-key').value = apiKey || '';
  document.getElementById('api-base-url').value = config.apiBaseUrl || '';
  document.getElementById('api-model').value = config.apiModel || '';
  
  // 深度思考
  document.getElementById('deepThinking').checked = config.deepThinking !== false;
  
  // TTS
  document.getElementById('ttsEnabled').checked = config.tts !== false;
  
  // 重置更改标记
  hasChanges = false;
  
  // 显示已配置状态
  if (apiKey && config.apiBaseUrl && config.apiModel) {
    const statusDiv = document.getElementById('api-status');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    statusDiv.className = 'api-status show';
    statusDot.className = 'status-dot';
    statusText.textContent = '已配置';
  }
}

// 页面加载时初始化
document.addEventListener('DOMContentLoaded', loadConfig);

// ==================== 全局暴露 ====================

window.goBack = goBack;
window.testApi = testApi;
window.markChanged = markChanged;
window.saveSettings = saveSettings;
window.closeConfirm = closeConfirm;
