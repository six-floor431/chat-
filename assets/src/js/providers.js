// API提供商配置

export const API_PROVIDERS = {
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ],
    defaultModel: 'gpt-4o-mini',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    })
  },
  
  volcengine: {
    name: '火山引擎',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: [
      { value: 'doubao-pro-32k', label: 'Doubao Pro 32K' },
      { value: 'doubao-pro-128k', label: 'Doubao Pro 128K' },
      { value: 'doubao-lite-32k', label: 'Doubao Lite 32K' }
    ],
    defaultModel: 'doubao-pro-32k',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    })
  },
  
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat' },
      { value: 'deepseek-coder', label: 'DeepSeek Coder' }
    ],
    defaultModel: 'deepseek-chat',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    })
  }
};

export const DEFAULT_PROVIDER = 'openai';
