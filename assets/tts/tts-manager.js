// TTS管理器

import { ttsCore } from './tts-core.js';

export class TTSManager {
  constructor() {
    this.core = ttsCore;
    this.isEnabled = false;
    this.isInitialized = false;
    
    this.config = {
      enabled: true,
      autoSpeakAI: true,
      avatarId: 'default',
      speed: 1.0,
      volume: 0.8
    };
    
    this.onSpeakStart = null;
    this.onSpeakEnd = null;
    this.onError = null;
  }
  
  async init(options = {}) {
    console.log('[TTS] Manager init called');

    if (this.isInitialized) {
      console.log('[TTS] 已经初始化，isEnabled:', this.isEnabled);
      return this.isEnabled;
    }

    this.config = { ...this.config, ...options };
    this.loadConfig();
    this.loadVolumeFromGameConfig();

    console.log('[TTS] 配置加载完成，enabled:', this.config.enabled, 'volume:', this.config.volume);

    // 只有在配置启用时才初始化服务
    let serviceReady = false;
    if (this.config.enabled) {
      serviceReady = await this.core.init({
        avatarId: this.config.avatarId,
        speed: this.config.speed,
        volume: this.config.volume
      });
      console.log('[TTS] 服务初始化结果:', serviceReady);
    } else {
      console.log('[TTS] 配置已禁用，跳过服务初始化');
    }

    this.isInitialized = true;
    this.isEnabled = this.config.enabled && serviceReady;

    console.log('[TTS] 初始化完成，isEnabled:', this.isEnabled);

    return this.isEnabled;
  }
  
  loadVolumeFromGameConfig() {
    try {
      const gameConfig = localStorage.getItem('aiGameConfig');
      if (gameConfig) {
        const config = JSON.parse(gameConfig);
        if (config.ttsVolume !== undefined) {
          this.config.volume = config.ttsVolume / 100;
        }
      }
    } catch (e) {
      console.error('[TTS] 加载音量失败:', e);
    }
  }
  
  async speak(text, type = 'ai') {
    if (!this.isEnabled || !this.config.enabled) return;
    if (type === 'ai' && !this.config.autoSpeakAI) return;

    console.log('[TTS] 准备朗读:', text.substring(0, 30) + '...', 'enabled:', this.isEnabled, 'config.enabled:', this.config.enabled);

    if (this.onSpeakStart) this.onSpeakStart(text, type);

    try {
      await this.core.speak(text, {
        avatarId: this.config.avatarId,
        speed: this.config.speed,
        volume: this.config.volume
      });

      if (this.onSpeakEnd) this.onSpeakEnd(text, type);
    } catch (e) {
      console.error('[TTS] 播放失败:', e);

      let errorMsg = 'TTS服务错误';
      if (e.message?.includes('400')) {
        errorMsg = 'TTS请求参数错误';
      } else if (e.message?.includes('Failed to fetch')) {
        errorMsg = 'TTS服务未启动';
      } else if (e.message?.includes('timeout')) {
        errorMsg = 'TTS服务超时';
      } else if (e.message?.includes('500')) {
        errorMsg = 'TTS服务内部错误';
      }

      if (this.onError) this.onError(new Error(errorMsg));
    }
  }
  
  async speakAIResponse(text) {
    return this.speak(text, 'ai');
  }
  
  stop() {
    this.core.stop();
  }
  
  setEnabled(enabled) {
    this.config.enabled = enabled;
    this.isEnabled = enabled;
    this.saveConfig();
    if (!enabled) this.stop();
  }
  
  setVolume(volume) {
    this.config.volume = Math.max(0, Math.min(1, volume / 100));
    this.core.setVolume(this.config.volume);
    this.saveConfig();
  }
  
  setSpeed(speed) {
    this.config.speed = Math.max(0.5, Math.min(2, speed));
    this.core.setSpeed(this.config.speed);
    this.saveConfig();
  }
  
  setAvatarId(avatarId) {
    this.config.avatarId = avatarId;
    this.core.setAvatarId(avatarId);
    this.saveConfig();
  }
  
  loadConfig() {
    try {
      // 首先从TTS专用配置加载（作为默认值）
      const saved = localStorage.getItem('ttsConfig');
      if (saved) {
        const ttsConfig = JSON.parse(saved);
        console.log('[TTS] 从TTS配置加载:', ttsConfig);
        this.config = { ...this.config, ...ttsConfig };
      }

      // 然后从游戏配置加载TTS设置（优先级更高）
      const gameConfig = localStorage.getItem('aiGameConfig');
      if (gameConfig) {
        const config = JSON.parse(gameConfig);
        console.log('[TTS] 从游戏配置加载:', config.tts, config.ttsVolume);
        if (config.tts !== undefined) {
          this.config.enabled = config.tts;
        }
        if (config.ttsVolume !== undefined) {
          this.config.volume = config.ttsVolume / 100;
        }
      }

      console.log('[TTS] 最终配置:', this.config);
    } catch (e) {
      console.error('[TTS] 加载配置失败:', e);
    }
  }
  
  saveConfig() {
    try {
      localStorage.setItem('ttsConfig', JSON.stringify(this.config));
    } catch (e) {
      console.error('[TTS] 保存配置失败:', e);
    }
  }
  
  getConfig() {
    return { ...this.config };
  }
}

// 单例
let ttsManagerInstance = null;

export function getTTSManager() {
  if (!ttsManagerInstance) {
    ttsManagerInstance = new TTSManager();
  }
  return ttsManagerInstance;
}

export const ttsManager = new TTSManager();
export default TTSManager;
