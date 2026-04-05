// 深度思考支持检测工具
import { getConfig, setConfig, getApiKey } from './config.js';

/**
 * 检测当前模型是否支持深度思考
 * 通过发送测试请求并检查返回结果中是否有 reasoning_content
 */
export async function detectDeepThinkingSupport() {
  const config = getConfig();
  const apiKey = getApiKey();

  // 如果没有配置 API 或未开启深度思考，跳过检测
  if (!config.apiBaseUrl || !config.apiModel || !apiKey || !config.deepThinking) {
    console.log('[DeepThinkingDetect] 跳过检测：未配置API或未开启深度思考');
    return false;
  }

  try {
    console.log('[DeepThinkingDetect] 开始检测模型是否支持深度思考...');

    const baseUrl = config.apiBaseUrl.startsWith('http') ? config.apiBaseUrl : `https://${config.apiBaseUrl}`;
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const requestParams = {
      model: config.apiModel,
      messages: [{ role: 'user', content: '1+1=?' }],
      thinking: { type: 'enabled' },
      temperature: 0.5,
      max_tokens: 100
    };

    // 打印请求参数到控制台
    console.log('%c[API 深度思考检测] 请求参数:', 'color: #8e44ad; font-weight: bold;');
    console.log(JSON.stringify(requestParams, null, 2));

    // 发送测试请求
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestParams)
    });

    if (!response.ok) {
      // 如果返回 400 或其他错误，说明不支持深度思考参数
      console.log('[DeepThinkingDetect] 检测失败（API返回错误）:', response.status);
      return false;
    }

    const data = await response.json();
    console.log('[DeepThinkingDetect] 测试响应:', JSON.stringify(data, null, 2));

    // 检查返回结果中是否有 reasoning_content
    const hasReasoningContent = !!(
      data.choices?.[0]?.message?.reasoning_content ||
      data.choices?.[0]?.delta?.reasoning_content
    );

    console.log('[DeepThinkingDetect] 检测结果:', hasReasoningContent ? '支持深度思考' : '不支持深度思考');

    return hasReasoningContent;

  } catch (error) {
    console.error('[DeepThinkingDetect] 检测失败:', error);
    return false;
  }
}

/**
 * 检测并自动配置深度思考支持
 * 在游戏页面加载时调用
 */
export async function autoDetectAndConfigureDeepThinking() {
  const config = getConfig();

  // 只有在用户开启深度思考时才进行检测
  if (!config.deepThinking) {
    console.log('[DeepThinkingDetect] 用户未开启深度思考，跳过检测');
    setConfig({ supportsDeepThinking: false });
    return false;
  }

  console.log('[DeepThinkingDetect] 用户已开启深度思考，开始检测...');

  // 检测模型是否支持
  const supports = await detectDeepThinkingSupport();

  // 保存检测结果
  setConfig({ supportsDeepThinking: supports });

  if (!supports) {
    console.warn('[DeepThinkingDetect] 模型不支持深度思考，已自动关闭深度思考功能');
    setConfig({ deepThinking: false });
  } else {
    console.log('[DeepThinkingDetect] 模型支持深度思考，功能已启用');
  }

  return supports;
}
