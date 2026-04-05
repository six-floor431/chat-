// 旁白模块 - 生成场景描述
import { getConfig, getApiKey } from './config.js';

export class NarratorManager {
  constructor() {
    this.lastNarration = null;  // { timestamp: string, content: string, location: string }
  }

  /**
   * 过滤旁白中的思考标签和内容
   * @param {string} content - 原始旁白内容
   * @returns {string} 过滤后的旁白内容
   */
  filterThinkingTags(content) {
    if (!content) return '';

    // 过滤掉 <think> 标签及其内容
    let filtered = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // 过滤掉 [思考开始] 相关的标签
    filtered = filtered.replace(/\[思考开始\][\s\S]*?\[思考结束\]/gi, '');

    // 过滤掉 [深度思考开始] 相关的标签
    filtered = filtered.replace(/\[深度思考开始\][\s\S]*?\[深度思考结束\]/gi, '');

    // 过滤掉 <深度思考开始> 相关的标签
    filtered = filtered.replace(/<深度思考开始>[\s\S]*?<深度思考结束>/gi, '');

    // 过滤掉其他指令标记
    filtered = filtered
      .replace(/\[系统提示:.*?\]/gi, '')
      .replace(/\[指令:.*?\]/gi, '')
      .replace(/\[场景:.*?\]/gi, '');

    return filtered.trim();
  }

  /**
   * 检测旁白是否包含思考内容
   * @param {string} content - 旁白内容
   * @returns {boolean} 是否包含思考内容
   */
  hasThinkingContent(content) {
    if (!content) return false;

    const thinkingPatterns = [
      /<think>/i,
      /\[思考开始\]/i,
      /\[深度思考开始\]/i,
      /<深度思考开始>/i,
      /reasoning/i,
      /深度思考/i
    ];

    return thinkingPatterns.some(pattern => pattern.test(content));
  }

  /**
   * 验证旁白格式是否符合要求
   * @param {string} content - 旁白内容
   * @returns {boolean} 是否符合格式要求
   */
  isValidNarration(content) {
    if (!content) return false;

    // 验证是否包含 【时间·地点】 格式
    return /【.+?·.+?】/.test(content);
  }

  async generateNarration(persona, worldview, recentMessages = [], playerName = '', recentMemory = null) {
    const config = getConfig();
    const apiKey = getApiKey();
    const baseUrl = config.apiBaseUrl || '';

    // 调试日志
    console.log('[Narrator] generateNarration 配置:', {
      hasBaseUrl: !!baseUrl,
      hasApiKey: !!apiKey,
      deepThinking: config.deepThinking,
      supportsDeepThinking: config.supportsDeepThinking
    });

    // 必须配置 API
    if (!baseUrl || !apiKey) {
      throw new Error('请先配置API才能使用旁白生成功能');
    }

    try {
      const narration = await this.generateAINarration(persona, worldview, baseUrl, apiKey, config.apiModel, recentMessages, recentMemory, playerName);

      // 检测并过滤思考内容
      if (this.hasThinkingContent(narration)) {
        console.warn('[Narrator] 检测到旁白包含思考内容，已自动过滤');
        const filteredNarration = this.filterThinkingTags(narration);

        // 验证过滤后的格式
        if (!this.isValidNarration(filteredNarration)) {
          throw new Error('旁白格式不符合要求');
        }

        // 保存旁白信息
        this.lastNarration = {
          timestamp: Date.now(),
          content: filteredNarration,
          location: this.extractLocation(filteredNarration)
        };

        return filteredNarration;
      }

      // 验证原始格式
      if (!this.isValidNarration(narration)) {
        throw new Error('旁白格式不符合要求');
      }

      // 保存旁白信息
      this.lastNarration = {
        timestamp: Date.now(),
        content: narration,
        location: this.extractLocation(narration)
      };

      return narration;
    } catch (error) {
      console.error('[Narrator] AI 生成旁白失败:', error);
      throw error;
    }
  }

  /**
   * 使用 AI 生成旁白（参考上一个旁白和对话内容）
   * AI 自己处理时间连续性，不需要时间分析结果
   */
  async generateAINarration(persona, worldview, baseUrl, apiKey, model, recentMessages = [], recentMemory = null, playerName = '') {
    const worldName = worldview?.worldName || '这个世界';
    const background = worldview?.worldBackground || '';

    // 使用新的 date 字段
    const date = worldview?.date || '1年1月1日';
    const era = worldview?.era || '';

    // 构建上下文信息
    let contextPrompt = '';

    // 添加上一个旁白信息（AI 根据这个判断时间连续性）
    if (this.lastNarration) {
      contextPrompt += `上一个旁白：${this.lastNarration.content}\n`;
    }

    // 添加 AI 人设信息
    if (persona) {
      contextPrompt += `\n【角色信息】\n`;
      if (persona.name) contextPrompt += `名字: ${persona.name}\n`;
      if (persona.description) contextPrompt += `设定: ${persona.description}\n`;
      if (persona.personality) contextPrompt += `性格: ${persona.personality}\n`;
      if (persona.scenario) contextPrompt += `场景: ${persona.scenario}\n`;
      if (persona.creator_notes) contextPrompt += `创作者说明: ${persona.creator_notes}\n`;
      if (persona.tags && persona.tags.length > 0) contextPrompt += `标签: ${persona.tags.join('、')}\n`;
    }

    // 添加玩家名字
    if (playerName && playerName !== '玩家') {
      contextPrompt += `\n【玩家】\n名字: ${playerName}\n`;
    }

    // 添加最近的记忆
    if (recentMemory) {
      contextPrompt += `\n【最近记忆】\n${recentMemory.content}\n`;
    }

    // 添加最近的对话内容（最多3条）
    if (recentMessages && recentMessages.length > 0) {
      contextPrompt += `\n【最近对话】\n`;
      recentMessages.slice(-3).forEach(msg => {
        if (msg.role === 'user') {
          contextPrompt += `用户：${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          contextPrompt += `AI：${msg.content}\n`;
        }
      });
    }

    // 构建旁白 prompt
    const prompt = `根据当前场景、角色、对话和记忆，生成一段简洁的场景描述旁白，格式：【时间·地点】场景描述。

要求：
1. 时间可以是：黎明、上午、正午、下午、黄昏、夜晚、深夜
2. 地点：${worldName}
3. 场景描述要简短，不超过30字
4. 参考上一个旁白，保持场景的连续性和连贯性
5. 如果从对话中感受到时间变化（如"过了一夜"、"到了傍晚"等），要相应调整时间并在场景描述中体现
6. 如果地点发生变化，要明确新的地点
7. 结合 AI 角色信息（名字、性格、设定）来描述场景
8. 可以结合玩家名字和最近记忆来描述场景氛围
9. 结合世界背景：${background}

当前时间：${era}${date}

${contextPrompt}

旁白：`;

    // 构建请求参数
    const params = {
      model: model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.6
    };

    // 如果用户开启深度思考且模型支持，添加深度思考参数
    const config = getConfig();
    console.log('[Narrator] 深度思考配置检查:', {
      deepThinking: config.deepThinking,
      supportsDeepThinking: config.supportsDeepThinking,
      willUseThinking: config.deepThinking && config.supportsDeepThinking
    });

    if (config.deepThinking && config.supportsDeepThinking) {
      params.thinking = { type: 'enabled' };
      console.log('[Narrator] 旁白使用深度思考模式');
    } else {
      console.log('[Narrator] 旁白不使用深度思考模式');
    }

    // 调试：打印完整请求参数
    console.log('%c[API 旁白生成] 请求参数:', 'color: #2ecc71; font-weight: bold;');
    console.log(JSON.stringify(params, null, 2));

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(params)
    });

    if (!response.ok) {
      // 读取错误详情
      const errorText = await response.text();
      console.error('[Narrator] API 错误详情:', errorText);
      throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 详细日志，用于诊断
    console.log('[Narrator] API 响应数据:', JSON.stringify(data, null, 2));

    // 检查 finish_reason
    const finishReason = data.choices?.[0]?.finish_reason;
    console.log('[Narrator] finish_reason:', finishReason);

    // 尝试多种路径获取内容
    let narration = data.choices?.[0]?.message?.content?.trim() ||
                     data.choices?.[0]?.delta?.content?.trim() ||
                     '';

    // 如果还是空，尝试其他可能的字段
    if (!narration) {
      console.warn('[Narrator] 标准路径获取内容失败，尝试其他路径');

      // 尝试从 reasoning_content 获取（深度思考模型）
      const reasoningContent = data.choices?.[0]?.message?.reasoning_content?.trim() || '';
      if (reasoningContent) {
        console.warn('[Narrator] 从 reasoning_content 获取到内容');
        // 对于深度思考模型，尝试从 reasoning_content 的最后部分提取实际回复
        // 通常实际回复在推理过程之后
        const lines = reasoningContent.split('\n');
        const lastLines = lines.slice(-5).join('\n').trim();
        if (lastLines && !lastLines.includes('首先') && !lastLines.includes('分析')) {
          narration = lastLines;
          console.log('[Narrator] 从 reasoning_content 的最后部分提取到内容:', narration);
        }
      }
    }

    // 过滤掉可能的思考标签和内容
    if (narration) {
      // 检测是否包含思考内容
      if (this.hasThinkingContent(narration)) {
        console.warn('[Narrator] API 返回的旁白包含思考内容，已自动过滤');
        narration = this.filterThinkingTags(narration);
      }

      // 如果过滤后为空，抛出错误
      if (!narration) {
        throw new Error('过滤思考内容后为空');
      }

      console.log('[Narrator] AI 生成的旁白:', narration);
      return narration;
    }

    throw new Error('AI 返回空内容，完整响应: ' + JSON.stringify(data));
  }

  /**
   * 从旁白中提取地点信息
   * @param {string} narration - 旁白内容
   * @returns {string} 地点
   */
  extractLocation(narration) {
    // 从【时间·地点】格式中提取地点
    const match = narration.match(/【.+?·(.+?)】/);
    if (match) {
      return match[1].trim();
    }
    return '未知地点';
  }
}

// 单例
let narratorManagerInstance = null;

export function getNarratorManager() {
  if (!narratorManagerInstance) {
    narratorManagerInstance = new NarratorManager();
  }
  return narratorManagerInstance;
}
