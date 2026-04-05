// 配置模块 - 管理游戏设置

const DEFAULT_CONFIG = {
  // 显示
  fullscreen: false,
  scale: '1',

  // 音频
  bgm: true,
  tts: true,
  bgmVolume: 50,
  ttsVolume: 50,

  // AI
  aiStyle: 'formal',
  replyLength: 'medium',
  deepThinking: false,  // 默认关闭，由用户主动开启
  supportsDeepThinking: false,  // 模型是否支持深度思考（检测结果）

  // API
  apiBaseUrl: '',
  apiModel: ''
};

export function getConfig() {
  try {
    const stored = localStorage.getItem('aiGameConfig');
    if (stored) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('读取配置失败:', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function setConfig(config) {
  try {
    const current = getConfig();
    const newConfig = { ...current, ...config };
    localStorage.setItem('aiGameConfig', JSON.stringify(newConfig));
    return true;
  } catch (e) {
    console.error('保存配置失败:', e);
    return false;
  }
}

// 别名，兼容旧的 saveConfig 调用
export function saveConfig(config) {
  return setConfig(config);
}

export function getApiKey() {
  try {
    return localStorage.getItem('aiGameApiKey') || '';
  } catch (e) {
    return '';
  }
}

export function setApiKey(key) {
  try {
    localStorage.setItem('aiGameApiKey', key);
    return true;
  } catch (e) {
    return false;
  }
}

export function clearConfig() {
  localStorage.removeItem('aiGameConfig');
  localStorage.removeItem('aiGameApiKey');
}
