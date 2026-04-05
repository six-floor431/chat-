// 聊天模块 - 处理对话

import { getConfig, getApiKey } from './config.js';
import { getMemoryManager } from '../memo/memory.js';
import { getWorldviewManager } from './worldview.js';
import { getCharacterSettingManager } from './characterSetting.js';
import { getNarratorManager } from './narrator.js';
import { getTimeAnalysisManager } from './timeAnalysis.js';
import { getLoadingManager } from './loadingManager.js';
import { getAffectionAnalyzer } from './affectionAnalyzer.js';
import { extractKeywords } from './keywordExtractor.js';

// 聊天管理器
export class ChatManager {
  constructor() {
    this.memoryManager = null;
    this.worldviewManager = null;
    this.characterSettingManager = null;
    this.narratorManager = null;
    this.timeAnalysisManager = null;
    this.loadingManager = null;
    
    this.isProcessing = false;
    this.thinkingHistory = [];
    this.maxThinkingHistory = 20;
    this.currentAbortController = null;
  }
  
  getMemoryManager() {
    if (!this.memoryManager) {
      this.memoryManager = getMemoryManager();
    }
    return this.memoryManager;
  }
  
  getWorldviewManager() {
    if (!this.worldviewManager) {
      this.worldviewManager = getWorldviewManager();
    }
    return this.worldviewManager;
  }
  
  getCharacterSettingManager() {
    if (!this.characterSettingManager) {
      this.characterSettingManager = getCharacterSettingManager();
    }
    return this.characterSettingManager;
  }
  
  getNarratorManager() {
    if (!this.narratorManager) {
      this.narratorManager = getNarratorManager();
    }
    return this.narratorManager;
  }
  
  getTimeAnalysisManager() {
    if (!this.timeAnalysisManager) {
      this.timeAnalysisManager = getTimeAnalysisManager();
    }
    return this.timeAnalysisManager;
  }

  getLoadingManager() {
    if (!this.loadingManager) {
      this.loadingManager = getLoadingManager();
    }
    return this.loadingManager;
  }
  
  getApiConfig() {
    const config = getConfig();
    return {
      baseUrl: config.apiBaseUrl || '',
      model: config.apiModel || '',
      apiKey: getApiKey() || ''
    };
  }

  /**
   * 流式发送消息
   * @param {string} userMessage - 用户消息
   * @returns {AsyncGenerator} 异步生成器，产生不同类型的 chunk
   */
  async *sendMessageStream(userMessage) {
    if (this.isProcessing) {
      throw new Error('正在处理中，请等待...');
    }

    this.isProcessing = true;

    try {
      // 初始化各模块
      const memoryManager = this.getMemoryManager();
      const worldviewManager = this.getWorldviewManager();
      const characterManager = this.getCharacterSettingManager();
      const narratorManager = this.getNarratorManager();
      const timeManager = this.getTimeAnalysisManager();
      const loadingManager = this.getLoadingManager();

      // 获取当前人设和世界观
      const persona = await characterManager.getCurrentPersona();
      const worldview = await worldviewManager.get();
      const playerName = worldviewManager.getPlayerName();

      // 获取当前时间戳（不分析时间推进）
      const currentTimestamp = timeManager.generateTimestamp();

      // 先获取初始记忆（不包含旁白信息）
      const initialMemories = await memoryManager.queryRelevantMemories(userMessage, {
        maxRecent: 8,
        maxImportant: 5,
        maxRelevant: 8,
        persona: persona,
        affection: characterManager.affection,
        trust: characterManager.trust
      }, worldview);

      // 获取最近的一条记忆
      const recentMemory = initialMemories.importantMemories?.[0] || initialMemories.relevantMemories?.[0] || null;

      // 生成旁白（AI 自己处理时间连续性）
      const narration = await narratorManager.generateNarration(persona, worldview, initialMemories.recentMessages, playerName, recentMemory);
      if (narration) {
        yield { type: 'narration', content: narration };
      }

      // 重新获取记忆（这次包含旁白信息）
      const memories = await memoryManager.queryRelevantMemories(userMessage, {
        maxRecent: 8,
        maxImportant: 5,
        maxRelevant: 8,
        persona: persona,
        affection: characterManager.affection,
        trust: characterManager.trust
      }, worldview, narration);

      // 构建系统提示
      const systemPrompt = this.buildSystemPrompt(persona, worldview, memories, playerName);

      // 构建消息历史
      const messages = this.buildMessages(systemPrompt, memories.recentMessages, userMessage, narration);

      // 调用API
      const config = getConfig();
      const apiConfig = this.getApiConfig();

      console.log('%c[对话回复(流式)] 开始构建 API 请求...', 'color: #3498db; font-weight: bold;');

      if (!apiConfig.apiKey) {
        throw new Error('请先配置API Key');
      }

      // 创建AbortController
      this.currentAbortController = loadingManager.createAbortController();

      // 构建API请求参数
      const apiParams = this.buildAPIParams(apiConfig, messages, config.deepThinking);

      // 打印请求参数到控制台
      console.log('%c[API 对话回复(流式)] 请求参数:', 'color: #3498db; font-weight: bold;');
      console.log(JSON.stringify(apiParams, null, 2));

      // 发送请求
      const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        body: JSON.stringify(apiParams),
        signal: this.currentAbortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Chat] 对话 API 错误详情:', errorText);
        throw new Error(`API请求失败: ${response.status} - ${errorText}`);
      }

      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let reasoningContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta;

              if (delta?.reasoning_content) {
                // 深度思考开始
                if (reasoningContent.length === 0 && delta.reasoning_content.length > 0) {
                  yield { type: 'thinking_start' };
                }
                // 深度思考内容
                reasoningContent += delta.reasoning_content;
                yield { type: 'thinking', content: delta.reasoning_content };
              }

              if (delta?.content) {
                // 如果之前有思考内容，现在开始输出正式内容
                if (reasoningContent.length > 0 && fullContent.length === 0) {
                  yield { type: 'thinking_end' };
                }
                fullContent += delta.content;
                yield { type: 'content', content: delta.content };
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 深度思考结束标记
      if (reasoningContent.length > 0) {
        yield { type: 'thinking_end' };
      }

      // 分析好感度变化
      const affectionAnalyzer = getAffectionAnalyzer();
      const affectionResult = await affectionAnalyzer.analyzeAndApply(
        userMessage,
        fullContent,
        memories.recentMessages,
        persona,
        memories.allMemories
      );

      // 应用好感度和信任值变化
      if (affectionResult.affectionDelta !== 0) {
        await characterManager.addAffection(affectionResult.affectionDelta);
      }
      if (affectionResult.trustDelta !== 0) {
        await characterManager.addTrust(affectionResult.trustDelta);
      }

    } catch (error) {
      console.error('聊天错误:', error);
      throw error;
    } finally {
      this.isProcessing = false;
      this.currentAbortController = null;
    }
  }

  /**
   * 过滤思考标签和指令内容
   * @param {string} content - 原始内容
   * @returns {string} 过滤后的内容
   */
  filterThinkingTags(content) {
    if (!content) return '';

    // 过滤掉 <think> 标签及其内容
    let filtered = content.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // 过滤掉 [思考] 相关的标签
    filtered = filtered.replace(/\[思考开始\][\s\S]*?\[思考结束\]/gi, '');

    // 过滤掉其他指令标记
    filtered = filtered
      .replace(/\[系统提示:.*?\]/gi, '')
      .replace(/\[指令:.*?\]/gi, '')
      .replace(/\[场景:.*?\]/gi, '');

    return filtered.trim();
  }

  async chat(userMessage, onMessage, onComplete, onError) {
    if (this.isProcessing) {
      onError(new Error('正在处理中，请等待...'));
      return;
    }
    
    this.isProcessing = true;
    const startTime = Date.now();
    
    try {
      // 初始化各模块
      const memoryManager = this.getMemoryManager();
      const worldviewManager = this.getWorldviewManager();
      const characterManager = this.getCharacterSettingManager();
      const narratorManager = this.getNarratorManager();
      const timeManager = this.getTimeAnalysisManager();
      const loadingManager = this.getLoadingManager();
      
      // 获取当前人设和世界观
      const persona = await characterManager.getCurrentPersona();
      const worldview = await worldviewManager.get();
      const playerName = worldviewManager.getPlayerName();

      // 获取记忆
      const memories = await memoryManager.queryRelevantMemories(userMessage, {
        maxRecent: 8,
        maxImportant: 5,
        maxRelevant: 8,
        persona: persona,
        affection: characterManager.affection,
        trust: characterManager.trust
      });

      // 生成旁白（AI 自己处理时间连续性）
      const narration = await narratorManager.generateNarration(persona, worldview, memories.recentMessages);
      if (narration) {
        onMessage({ type: 'narration', content: narration });
      }
      
      // 构建系统提示（包含旁白内容）
      const systemPrompt = this.buildSystemPrompt(persona, worldview, memories, playerName, narration || '');
      
      // 构建消息历史（包含旁白）
      const messages = this.buildMessages(systemPrompt, memories.recentMessages, userMessage, narration || '');
      
      // 调用API
      const config = getConfig();
      const apiConfig = this.getApiConfig();

      console.log('%c[对话回复] 开始构建 API 请求...', 'color: #3498db; font-weight: bold;');

      if (!apiConfig.apiKey) {
        throw new Error('请先配置API Key');
      }

      // 创建AbortController
      this.currentAbortController = loadingManager.createAbortController();

      // 构建API请求参数
      const apiParams = this.buildAPIParams(apiConfig, messages, config.deepThinking);

      // 打印请求参数到控制台
      console.log('%c[API 对话回复] 请求参数:', 'color: #3498db; font-weight: bold;');
      console.log(JSON.stringify(apiParams, null, 2));

      // 发送请求
      const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        body: JSON.stringify(apiParams),
        signal: this.currentAbortController.signal
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }
      
      // 处理流式响应
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let reasoningContent = '';
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta;
              
              if (delta?.reasoning_content) {
                // 深度思考内容 - 只输出到控制台
                reasoningContent += delta.reasoning_content;
                console.log('%c[思考] ' + delta.reasoning_content, 'color: #9b59b6');
              }
              
              if (delta?.content) {
                fullContent += delta.content;
                onMessage({ type: 'content', content: delta.content });
              }
            } catch (e) {
              // 忽略解析错误
            }
          }
        }
      }

      // 分析好感度变化
      const affectionAnalyzer = getAffectionAnalyzer();
      const affectionResult = await affectionAnalyzer.analyzeAndApply(
        userMessage,
        fullContent,
        { affection: characterManager.affection, trust: characterManager.trust },
        persona,
        memories.importantMemories || [],
        narration || ''
      );

      // 应用好感度和信任值变化
      if (affectionResult.affectionDelta !== 0) {
        await characterManager.addAffection(affectionResult.affectionDelta);
      }
      if (affectionResult.trustDelta !== 0) {
        await characterManager.addTrust(affectionResult.trustDelta);
      }

      // 完成回调
      onComplete({
        affection: affectionResult.affection,
        trust: affectionResult.trust,
        affectionDelta: affectionResult.delta?.affectionDelta,
        trustDelta: affectionResult.delta?.trustDelta
      });

    } catch (error) {
      console.error('聊天错误:', error);
      onError(error);
    } finally {
      this.isProcessing = false;
      this.currentAbortController = null;
    }
  }
  
  buildSystemPrompt(persona, worldview, memories, playerName, currentNarration = '') {
    let prompt = '';

    // 角色信息（自然叙述方式）
    prompt += `你是${persona.name || '角色'}。`;
    if (persona.description) {
      prompt += `\n\n你的人设是：${persona.description}`;
    }
    if (persona.personality) {
      prompt += `\n\n你的性格是：${persona.personality}`;
    }
    if (persona.scenario) {
      prompt += `\n\n你经历过的场景是：${persona.scenario}`;
    }
    if (persona.creator_notes) {
      prompt += `\n\n这是来自创作者的说明：${persona.creator_notes}`;
    }
    if (persona.tags && persona.tags.length > 0) {
      prompt += `\n\n标签：${persona.tags.join('、')}`;
    }
    prompt += '\n\n';

    // 世界观
    prompt += `【世界观】\n`;
    prompt += `世界: ${worldview.worldName || '未知世界'}\n`;
    prompt += `纪元: ${worldview.era || '未知'}\n`;

    // 优先使用 date 字段，否则使用旧的 year/month/day
    if (worldview.date) {
      prompt += `时间: ${worldview.date}\n`;
    } else if (worldview.year !== undefined && worldview.month !== undefined && worldview.day !== undefined) {
      prompt += `时间: ${worldview.year}年${worldview.month}月${worldview.day}日\n`;
    }

    if (worldview.worldBackground) {
      prompt += `背景: ${worldview.worldBackground}\n`;
    }
    prompt += '\n';

    // 玩家信息
    prompt += `【玩家】\n`;
    prompt += `名字: ${playerName || '玩家'}\n\n`;

    // 当前场景（旁白）- 重要！让角色知道当前在什么场景
    if (currentNarration) {
      prompt += `【当前场景】\n`;
      prompt += `${currentNarration}\n`;
      prompt += `（你的回复必须符合上述场景，不能出现与场景不符的情况）\n\n`;
    }

    // ============ 记忆系统（去重后合并） ============
    
    // 收集所有记忆（检索的记忆 + 最近5条记忆）
    const allMemoryIds = new Set();
    const allUniqueMemories = [];

    // 1. 重要性高的记忆
    if (memories.importantMemories?.length > 0) {
      memories.importantMemories.forEach(m => {
        if (!allMemoryIds.has(m.id)) {
          allMemoryIds.add(m.id);
          allUniqueMemories.push({
            ...m,
            source: '重要记忆'
          });
        }
      });
    }

    // 2. 相关记忆（AI检索）
    if (memories.relevantMemories?.length > 0) {
      memories.relevantMemories.forEach(m => {
        if (!allMemoryIds.has(m.id)) {
          allMemoryIds.add(m.id);
          allUniqueMemories.push({
            ...m,
            source: '相关记忆'
          });
        }
      });
    }

    // 3. 最近的5条记忆
    if (memories.recentMemories?.length > 0) {
      memories.recentMemories.slice(0, 5).forEach(m => {
        if (!allMemoryIds.has(m.id)) {
          allMemoryIds.add(m.id);
          allUniqueMemories.push({
            ...m,
            source: '最近记忆'
          });
        }
      });
    }

    // 构建记忆提示（包含时间戳）
    if (allUniqueMemories.length > 0) {
      prompt += `【记忆】\n`;
      allUniqueMemories.forEach(m => {
        const time = m.timestamp || '';
        const content = m.content || '';
        prompt += `[${time}] ${content}\n`;
      });
      prompt += '\n';
    }

    return prompt;
  }
  
  buildMessages(systemPrompt, recentMessages, userMessage, narration = '') {
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // 添加旁白（如果有）
    if (narration) {
      messages.push({
        role: 'assistant',
        content: `【场景描述】${narration}`
      });
    }

    // 添加最近的对话历史
    if (recentMessages && recentMessages.length > 0) {
      recentMessages.forEach(msg => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        }
      });
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: userMessage });

    return messages;
  }
  
  buildAPIParams(apiConfig, messages, deepThinking) {
    const params = {
      model: apiConfig.model,
      messages: messages,
      stream: true,
      temperature: 0.8
    };

    // 如果用户开启深度思考且模型支持，添加深度思考参数
    const config = getConfig();
    console.log('[Chat] 对话回复深度思考配置:', deepThinking, '模型支持深度思考:', config.supportsDeepThinking);
    if (deepThinking && config.supportsDeepThinking) {
      params.thinking = { type: 'enabled' };
    }

    return params;
  }
  
  abort() {
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
  }

  /**
   * 结束聊天并保存记忆总结
   * @returns {Promise<string|null>} 记忆总结，如果没有消息则返回 null
   */
  /**
   * 生成对话的记忆总结（使用深度思考）
   * @param {Array} messages - 对话消息数组
   * @param {string} playerName - 玩家名字
   * @param {Object} persona - AI 当前人设
   * @param {Array} recentNarrations - 最近的旁白内容
   * @param {Object} worldview - 世界观信息
   * @returns {Promise<string>} 记忆总结
   */
  async generateMemorySummary(messages, playerName, persona = null, recentNarrations = [], worldview = null) {
    const apiConfig = this.getApiConfig();
    const config = getConfig();

    // 确保 player name 不为空且不是"玩家"
    const safePlayerName = (playerName && playerName !== '玩家') ? playerName : '他';

    // 必须配置 API
    if (!apiConfig.baseUrl || !apiConfig.apiKey) {
      throw new Error('请先配置API才能使用记忆总结功能');
    }

    try {
      // 构建对话文本
      const conversationText = messages
        .map(msg => `${msg.role === 'user' ? safePlayerName : '我'}: ${msg.content}`)
        .join('\n');

      // 构建世界观信息
      let worldviewInfo = '';
      if (worldview) {
        worldviewInfo += '\n【世界观】\n';
        if (worldview.worldName) worldviewInfo += `世界: ${worldview.worldName}\n`;
        if (worldview.era) worldviewInfo += `纪元: ${worldview.era}\n`;
        // 优先使用 date 字段，否则使用旧的 year/month/day
        if (worldview.date) {
          worldviewInfo += `时间: ${worldview.date}\n`;
        } else if (worldview.year !== undefined && worldview.month !== undefined && worldview.day !== undefined) {
          worldviewInfo += `时间: ${worldview.year}年${worldview.month}月${worldview.day}日\n`;
        }
        if (worldview.worldBackground) worldviewInfo += `背景: ${worldview.worldBackground}\n`;
        worldviewInfo += '\n';
      }

      // 构建人设信息
      let personaInfo = '';
      if (persona) {
        personaInfo += '\n【角色信息】\n';
        if (persona.name) personaInfo += `名字: ${persona.name}\n`;
        if (persona.description) personaInfo += `设定: ${persona.description}\n`;
        if (persona.personality) personaInfo += `性格: ${persona.personality}\n`;
        if (persona.scenario) personaInfo += `场景: ${persona.scenario}\n`;
        if (persona.creator_notes) personaInfo += `创作者说明: ${persona.creator_notes}\n`;
        if (persona.tags && persona.tags.length > 0) personaInfo += `标签: ${persona.tags.join('、')}\n`;
        personaInfo += '\n';
      }

      // 构建旁白信息
      let narrationInfo = '';
      if (recentNarrations && recentNarrations.length > 0) {
        narrationInfo += '\n【场景背景】\n';
        recentNarrations.forEach(n => {
          narrationInfo += `${n}\n`;
        });
        narrationInfo += '\n';
      }

      // 构建总结 prompt（要求深度思考来提取重要信息）
      const prompt = `用第一人称日记风格记录这段对话，像写日记一样生动。

要求（非常重要，必须严格遵守）：
1. 完全代入"我"的视角，带着情感写日记
2. 用具体的名字指代对方（"${safePlayerName}"），绝对不要使用"他"、"她"等代词
3. 生动描述场景、动作、表情、语气，不要死板概括
4. 用有温度的文字记录真实感受和情绪变化
5. 不要超过 500 字，详细但精炼，记录重要的对话细节和情感变化
6. 不要写时间或日期（时间由系统管理）
7. 使用日记式的叙述，带点私密感和真实感
8. **必须符合角色${persona.name}的性格特点、说话方式和语气风格**
9. **体现角色的内心独白和真实想法，带有人设特有的表达习惯**
10. **如果是病娇角色，要体现占有欲和执念；如果是温柔角色，要体现关怀和温暖**

${personaInfo ? `【角色人设参考】
名字：${persona.name}
性格：${persona.personality}
设定：${persona.description}
场景：${persona.scenario}
创作者说明：${persona.creator_notes}` : ''}

${worldviewInfo}
${narrationInfo}

【对话内容】
${conversationText}

【我的日记】
（请按照${persona.name}的性格风格和说话方式，用第一人称写一篇生动、符合人设的日记，体现角色的内心独白和真实感受）`;

      // 构建 API 参数
      const params = {
        model: apiConfig.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7  // 提高温度，让文字更有情感色彩
      };

      // 如果用户开启深度思考且模型支持，添加深度思考参数
      console.log('[Chat] 记忆总结深度思考配置:', config.deepThinking, '模型支持深度思考:', config.supportsDeepThinking);
      if (config.deepThinking && config.supportsDeepThinking) {
        params.thinking = { type: 'enabled' };
        console.log('[Chat] 记忆总结使用深度思考模式');
      }

      // 打印请求参数到控制台
      console.log('%c[API 记忆总结] 请求参数:', 'color: #e67e22; font-weight: bold;');
      console.log(JSON.stringify(params, null, 2));

      const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiConfig.apiKey}`
        },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Chat] 记忆总结 API 错误详情:', errorText);
        throw new Error(`API 请求失败: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      // 详细日志，用于诊断
      console.log('[Chat] 记忆总结 API 响应数据:', JSON.stringify(data, null, 2));

      // 检查 finish_reason
      const finishReason = data.choices?.[0]?.finish_reason;
      console.log('[Chat] finish_reason:', finishReason);

      // 尝试多种路径获取内容
      let summary = data.choices?.[0]?.message?.content?.trim() ||
                    data.choices?.[0]?.delta?.content?.trim() ||
                    '';

      // 如果还是空，尝试其他可能的字段
      if (!summary) {
        console.warn('[Chat] 标准路径获取内容失败，尝试其他路径');
        // 尝试从 reasoning_content 获取（深度思考模型）
        const reasoningContent = data.choices?.[0]?.message?.reasoning_content?.trim() || '';
        if (reasoningContent) {
          console.warn('[Chat] 从 reasoning_content 获取到内容');
          // 对于深度思考模型，尝试从 reasoning_content 的最后部分提取实际回复
          // 通常实际回复在推理过程之后
          const lines = reasoningContent.split('\n');
          const lastLines = lines.slice(-5).join('\n').trim();
          if (lastLines && !lastLines.includes('首先') && !lastLines.includes('分析') && !lastLines.includes('用户')) {
            summary = lastLines;
            console.log('[Chat] 从 reasoning_content 的最后部分提取到内容:', summary);
          }
        }
      }

      if (!summary) {
        throw new Error('AI 返回空内容');
      }

      // 确保总结不太长（超过 500 字就截断）
      if (summary.length > 500) {
        const lastPeriod = summary.lastIndexOf('。');
        const cutPos = lastPeriod > 0 ? lastPeriod : 499;
        summary = summary.substring(0, cutPos + 1);
      }

      console.log('[Chat] AI 生成的记忆总结:', summary);
      return summary;

    } catch (error) {
      console.error('[Chat] AI 生成记忆总结失败:', error.message);
      throw error;
    }
  }

  async endChatAndSaveMemory() {
    try {
      const memoryManager = this.getMemoryManager();
      const worldviewManager = this.getWorldviewManager();
      const characterManager = this.getCharacterSettingManager();
      const narratorManager = this.getNarratorManager();
      const timeManager = this.getTimeAnalysisManager();

      // 获取最近的对话历史
      const recentMessages = memoryManager.getRecentConversation(20);

      // 如果没有对话历史，直接返回
      if (!recentMessages || recentMessages.length === 0) {
        console.log('[Chat] 无对话历史需要总结');
        return null;
      }

      // 获取角色信息
      const persona = await characterManager.getCurrentPersona();

      // 获取世界观
      const worldview = await worldviewManager.get();

      // 获取玩家名字
      const playerName = worldviewManager.getPlayerName();

      // 获取最近的旁白信息（用于上下文）
      const recentNarrations = narratorManager.lastNarration ? [narratorManager.lastNarration.content] : [];

      // ========== 步骤1: 时间分析（生成时间戳）==========
      console.log('[Chat] 步骤1: 分析时间...');

      // 构建完整上下文（旁白 + 对话）
      const narration = recentNarrations[0] || '';
      const conversation = recentMessages.map(m => `${m.role === 'user' ? '玩家' : 'AI'}: ${m.content}`).join('\n');
      const fullContext = `旁白：${narration}\n对话：\n${conversation}`;
      console.log('[Chat] 时间分析上下文:', fullContext);

      // 获取基准时间戳：优先使用最新记忆，没有则使用世界观时间
      const recentMemories = memoryManager.getRecentMemories(1);
      let baseTimestamp;
      if (recentMemories.length > 0) {
        // 优先使用最新记忆的时间戳
        baseTimestamp = recentMemories[0].timestamp;
        console.log('[Chat] 基准时间戳（来自最新记忆）:', baseTimestamp);
      } else {
        // 没有记忆，使用世界观时间
        const era = worldview.era || '';
        baseTimestamp = worldview.date
          ? `${era}${worldview.date} 12时`
          : `${era}${worldview.year || 2024}年${worldview.month || 1}月${worldview.day || 1}日 12时`;
        console.log('[Chat] 基准时间戳（来自世界观）:', baseTimestamp);
      }

      let timestamp = baseTimestamp;
      try {
        const timeAnalysisResult = await timeManager.analyzeTimeFromChat(fullContext, baseTimestamp);
        timestamp = timeAnalysisResult.timestamp;
        console.log(`[Chat] 时间分析完成，时间戳: ${timestamp}`);
      } catch (timeError) {
        console.error('[Chat] 时间分析失败，使用基准时间戳:', timeError);
        console.error('[Chat] 时间分析错误详情:', timeError.message);
        // 使用基准时间戳作为兜底
        timestamp = baseTimestamp;
      }

      // ========== 步骤2: 生成记忆总结 ==========
      console.log('[Chat] 步骤2: 生成记忆总结...');
      const summary = await this.generateMemorySummary(recentMessages, playerName, persona, recentNarrations, worldview);

      // ========== 步骤3: 添加记忆 ==========
      console.log('[Chat] 步骤3: 添加记忆...');
      const memoryData = {
        content: summary,
        timestamp: timestamp,  // 显示用的时间戳（可以是任意格式）
        internalTimestamp: Date.now()  // 内部时间戳（毫秒，用于排序）
      };
      const addedMemory = await memoryManager.addMemory(memoryData);
      console.log('[Chat] 记忆添加完成，重要性:', addedMemory.importance);

      // 检查是否有记忆被遗忘
      let forgettingMessage = null;
      if (addedMemory.removedMemories && addedMemory.removedMemories.length > 0) {
        const persona = await characterManager.getCurrentPersona();
        const aiName = persona?.name || '我';
        const count = addedMemory.removedMemories.length;

        console.log('[Chat] 检测到记忆遗忘:', count, '条');
        forgettingMessage = `（${aiName}好像忘记了什么事情...）`;
      }

      // ========== 步骤4: 清空对话历史 ==========
      console.log('[Chat] 步骤4: 清空对话历史缓存...');
      memoryManager.clearConversation();

      // ========== 步骤5: 清空思考历史缓存 ==========
      console.log('[Chat] 步骤5: 清空思考历史缓存...');
      this.thinkingHistory = [];

      // ========== 步骤6: 清空旁白缓存 ==========
      console.log('[Chat] 步骤6: 清空旁白缓存...');
      if (this.narratorManager && this.narratorManager.lastNarration) {
        this.narratorManager.lastNarration = null;
        console.log('[Chat] 旁白缓存已清空');
      }

      console.log('[Chat] 记忆保存完成，所有缓存已清空');
      return {
        summary: summary,
        forgettingMessage: forgettingMessage
      };

    } catch (error) {
      console.error('[Chat] 保存记忆总结失败:', error);
      throw error;
    }
  }
}

// 单例
let chatManagerInstance = null;

export function getChatManager() {
  if (!chatManagerInstance) {
    chatManagerInstance = new ChatManager();
  }
  return chatManagerInstance;
}
