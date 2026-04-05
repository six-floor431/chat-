// TTS核心模块 - 调用AstraTTS服务

import { ttsFilter } from './tts-filter.js';

export class TTSCore {
  constructor() {
    this.config = {
      baseUrl: 'http://localhost:5000',
      timeout: 30000,
      avatarId: 'default',
      speed: 1.0,
      volume: 0.8
    };
    
    this.isSpeaking = false;
    this.isEnabled = false;
    this.serviceReady = false;
    this.currentAudio = null;
    this.filter = ttsFilter;
    
    // 回调
    this.onSpeakStart = null;
    this.onSpeakEnd = null;
  }
  
  async init(options = {}) {
    console.log('[TTS] 初始化...');

    this.config = { ...this.config, ...options };

    // 启动AstraTTS服务
    if (window.electronAPI && window.electronAPI.tts) {
      try {
        const result = await window.electronAPI.tts.start();
        if (result.success) {
          console.log('[TTS] 服务已启动，端口:', result.port);
          this.isEnabled = true;
          this.serviceReady = true;
        } else {
          console.error('[TTS] 启动失败:', result.error);
          this.isEnabled = false;
          this.serviceReady = false;
        }
      } catch (e) {
        console.error('[TTS] 启动失败:', e);
        this.isEnabled = false;
        this.serviceReady = false;
      }
    } else {
      console.warn('[TTS] electronAPI.tts 不存在');
      this.isEnabled = false;
      this.serviceReady = false;
    }

    return this.serviceReady;
  }
  
  async speak(text, options = {}) {
    console.log('[TTS] speak called, isEnabled:', this.isEnabled, 'serviceReady:', this.serviceReady);

    if (!this.isEnabled || !this.serviceReady) {
      console.warn('[TTS] 未启用或服务未就绪');
      return;
    }
    if (this.isSpeaking) this.stop();

    // 合并配置
    const config = {
      ...this.config,
      ...options
    };

    // 过滤文本
    const filteredText = this.filter.filter(text);
    if (!filteredText) {
      console.warn('[TTS] 过滤后文本为空');
      return;
    }

    console.log('[TTS] 开始播放，文本:', filteredText.substring(0, 50) + '...');

    this.isSpeaking = true;

    // 触发开始回调
    if (this.onSpeakStart) this.onSpeakStart();

    try {
      const response = await fetch(`${this.config.baseUrl}/api/tts/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: filteredText,
          avatarId: config.avatarId,
          speed: config.speed,
          format: 'wav'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      console.log('[TTS] 响应成功，创建音频对象');
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      this.currentAudio = new Audio(audioUrl);
      this.currentAudio.volume = config.volume;

      this.currentAudio.onended = () => {
        console.log('[TTS] 播放完成');
        this.isSpeaking = false;
        URL.revokeObjectURL(audioUrl);
        if (this.onSpeakEnd) this.onSpeakEnd();
      };

      this.currentAudio.onerror = (e) => {
        console.error('[TTS] 音频播放错误:', e);
        this.isSpeaking = false;
        URL.revokeObjectURL(audioUrl);
        if (this.onSpeakEnd) this.onSpeakEnd();
      };

      await this.currentAudio.play();
      console.log('[TTS] 音频开始播放');

    } catch (e) {
      console.error('[TTS] 播放失败:', e);
      this.isSpeaking = false;
      if (this.onSpeakEnd) this.onSpeakEnd();
      throw e;
    }
  }
  
  stop() {
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.isSpeaking = false;
    if (this.onSpeakEnd) this.onSpeakEnd();
  }
  
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) this.stop();
  }
  
  setVolume(volume) {
    this.config.volume = volume;
    if (this.currentAudio) {
      this.currentAudio.volume = volume;
    }
  }

  setSpeed(speed) {
    this.config.speed = speed;
  }

  setAvatarId(avatarId) {
    this.config.avatarId = avatarId;
  }

  async destroy() {
    this.stop();

    if (window.electronAPI && window.electronAPI.tts) {
      try {
        await window.electronAPI.tts.stop();
      } catch (e) {
        console.error('[TTS] 停止服务失败:', e);
      }
    }

    this.serviceReady = false;
  }
}

// 导出单例实例
export const ttsCore = new TTSCore();
export default TTSCore;
