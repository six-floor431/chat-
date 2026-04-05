// API请求模块

import { getConfig, getApiKey } from './config.js';

// API客户端
export class AIClient {
  constructor(config = {}) {
    this.config = {
      apiKey: config.apiKey || '',
      model: config.model || '',
      baseUrl: config.baseUrl || '',
      timeout: config.timeout || 120000
    };
  }
  
  loadFromStorage() {
    const savedConfig = getConfig();
    const apiKey = getApiKey();
    
    this.config.apiKey = apiKey;
    this.config.model = savedConfig.apiModel || '';
    this.config.baseUrl = savedConfig.apiBaseUrl || '';
    
    return this;
  }
  
  getRequestUrl() {
    if (!this.config.baseUrl) {
      throw new Error('API地址未配置');
    }
    
    let baseUrl = this.config.baseUrl;
    if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
      baseUrl = 'https://' + baseUrl;
    }
    baseUrl = baseUrl.replace(/\/+$/, '');
    
    return `${baseUrl}/chat/completions`;
  }
  
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`
    };
  }
  
  getModel() {
    return this.config.model;
  }
  
  async testConnection() {
    if (!this.config.apiKey) {
      return { success: false, error: '未配置API Key' };
    }
    
    if (!this.config.baseUrl) {
      return { success: false, error: '未配置API地址' };
    }
    
    if (!this.config.model) {
      return { success: false, error: '未配置模型名称' };
    }
    
    try {
      const response = await fetch(this.getRequestUrl(), {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.getModel(),
          messages: [{ role: 'user', content: '回复OK' }]
        }),
        signal: AbortSignal.timeout(15000)
      });
      
      if (response.ok) {
        const data = await response.json();
        return { success: true, model: data.model || this.getModel() };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return { success: false, error: errorData.error?.message || `HTTP ${response.status}` };
      }
    } catch (error) {
      return { success: false, error: error.message || '网络连接失败' };
    }
  }
  
  async chat(messages, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('未配置API Key');
    }
    
    if (!this.config.model) {
      throw new Error('未配置模型名称');
    }
    
    const response = await fetch(this.getRequestUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModel(),
        messages,
        temperature: options.temperature || 0.7,
        stream: false,
        ...options.extra
      }),
      signal: AbortSignal.timeout(this.config.timeout)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return {
      success: true,
      model: data.model,
      content: data.choices[0]?.message?.content || '',
      usage: data.usage
    };
  }
  
  async *chatStream(messages, options = {}) {
    if (!this.config.apiKey) {
      throw new Error('未配置API Key');
    }
    
    if (!this.config.model) {
      throw new Error('未配置模型名称');
    }
    
    const response = await fetch(this.getRequestUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.getModel(),
        messages,
        temperature: options.temperature || 0.7,
        stream: true,
        ...options.extra
      }),
      signal: AbortSignal.timeout(this.config.timeout)
    });
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content || '';
            if (content) {
              yield { model: parsed.model, content };
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }
  }
  
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

// 单例
let aiClientInstance = null;

export function getAIClient(config) {
  if (!aiClientInstance) {
    aiClientInstance = new AIClient(config);
  } else if (config) {
    aiClientInstance.updateConfig(config);
  }
  return aiClientInstance;
}

export function createClient() {
  const client = new AIClient();
  client.loadFromStorage();
  return client;
}

export default AIClient;
