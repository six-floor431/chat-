// 好感度分析模块 - 分析对话中的情感变化
import { getConfig, getApiKey } from './config.js';

export class AffectionAnalyzer {
  constructor() {
    this.positiveKeywords = ['喜欢', '爱', '开心', '高兴', '谢谢', '感谢', '你好', '可爱', '温柔', '善良'];
    this.negativeKeywords = ['讨厌', '恨', '生气', '烦', '滚', '闭嘴', '笨蛋', '傻'];
  }

  /**
   * 分析好感度和信任值变化（使用 AI）
   */
  async analyze(userMessage, aiResponse, context, persona, memories, narration = '') {
    // 尝试使用 AI 分析
    const result = await this.analyzeWithAI(userMessage, aiResponse, context, persona, memories, narration);

    // 如果 AI 分析失败，使用关键词分析作为回退
    if (!result) {
      console.log('[AffectionAnalyzer] AI 分析失败，使用关键词分析');
      return this.analyzeWithKeywords(userMessage, aiResponse);
    }

    return result;
  }

  /**
   * 使用关键词分析好感度和信任值变化（备选方案）
   */
  analyzeWithKeywords(userMessage, aiResponse) {
    const text = `${userMessage} ${aiResponse || ''}`;

    // 分析好感度变化
    let affectionDelta = 0;
    for (const keyword of this.positiveKeywords) {
      if (text.includes(keyword)) {
        affectionDelta += 1;
      }
    }
    for (const keyword of this.negativeKeywords) {
      if (text.includes(keyword)) {
        affectionDelta -= 1;
      }
    }

    // 限制好感度变化范围：-5 到 +5
    affectionDelta = Math.max(-5, Math.min(5, affectionDelta));

    // 分析信任值变化（简化：与好感度变化相关，但范围较小）
    let trustDelta = 0;
    if (affectionDelta > 0) {
      // 正向互动增加信任
      trustDelta = Math.max(1, Math.min(3, Math.abs(affectionDelta)));
    } else if (affectionDelta < 0) {
      // 负向互动减少信任
      trustDelta = Math.max(-3, Math.min(-1, -Math.abs(affectionDelta)));
    } else {
      // 中性互动，默认微增信任
      trustDelta = 1;
    }

    // 确保信任值变化范围：-3 到 +3
    trustDelta = Math.max(-3, Math.min(3, trustDelta));

    console.log('[AffectionAnalyzer] 关键词分析结果:', { affectionDelta, trustDelta });

    return {
      affectionDelta,
      trustDelta,
      reason: '关键词分析结果'
    };
  }

  /**
   * 使用 AI 分析好感度和信任值变化
   */
  async analyzeWithAI(userMessage, aiResponse, context, persona, memories, narration = '') {
    const config = getConfig();
    const apiKey = getApiKey();

    // 如果没有配置 API，返回 null 使用关键词分析
    if (!apiKey || !config.apiBaseUrl || !config.apiModel) {
      return null;
    }

    try {
      // 构建对话文本
      let conversationText = `玩家：${userMessage}\n`;
      if (aiResponse) {
        conversationText += `AI：${aiResponse}\n`;
      }

      // 构建人设信息
      let personaInfo = '';
      if (persona) {
        personaInfo += `\n【角色信息】\n`;
        if (persona.name) personaInfo += `名字: ${persona.name}\n`;
        if (persona.description) personaInfo += `设定: ${persona.description}\n`;
        if (persona.personality) personaInfo += `性格: ${persona.personality}\n`;
        if (persona.scenario) personaInfo += `场景: ${persona.scenario}\n`;
        if (persona.creator_notes) personaInfo += `创作者说明: ${persona.creator_notes}\n`;
        if (persona.tags && persona.tags.length > 0) personaInfo += `标签: ${persona.tags.join('、')}\n`;
        if (persona.stage) personaInfo += `当前阶段: ${persona.stage}\n`;
      }

      // 构建旁白信息
      let narrationInfo = '';
      if (narration) {
        narrationInfo += `\n【当前场景】\n${narration}\n`;
      }

      // 构建记忆信息（最多3条）
      let memoryInfo = '';
      if (memories && memories.length > 0) {
        memoryInfo += `\n【相关记忆】\n`;
        memories.slice(0, 3).forEach(m => {
          memoryInfo += `- ${m.content}\n`;
        });
      }

      // 构建 prompt
      const prompt = `分析以下对话对角色好感度和信任值的影响。

${personaInfo}
【当前状态】
好感度：${context.affection || 0}
信任值：${context.trust || 0}
${narrationInfo}${memoryInfo}
【对话内容】
${conversationText}

【分析要求】
1. 根据对话内容的情感倾向，判断好感度变化
2. 根据互动的正负程度，判断信任值变化
3. 结合角色当前人设、性格和阶段特点
4. 考虑当前场景和氛围对情感的影响
5. 变化范围：好感度 -5 到 +5，信任值 -3 到 +3
6. **必须同时给出好感度和信任值的变化**，不能其中一个为0

【输出格式】
请严格按照以下JSON格式输出，不要包含其他内容：
{
  "affectionDelta": -5 到 5 之间的整数（不能为0）,
  "trustDelta": -3 到 3 之间的整数（不能为0）,
  "reason": "简短说明理由（10-20字）"
}`;

      const baseUrl = config.apiBaseUrl.startsWith('http') ? config.apiBaseUrl : `https://${config.apiBaseUrl}`;
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

      const requestParams = {
        model: config.apiModel,
        messages: [
          { role: 'system', content: '你是一个情感分析助手，负责分析对话对角色好感度和信任值的影响。输出JSON格式。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6
      };

      // 打印请求参数到控制台
      console.log('%c[API 好感度分析] 请求参数:', 'color: #e74c3c; font-weight: bold;');
      console.log(JSON.stringify(requestParams, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestParams)
      });

      if (!response.ok) {
        throw new Error(`API错误: ${response.status}`);
      }

      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || '';

      // 解析 JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);

        // 限制范围
        let affectionDelta = Math.max(-5, Math.min(5, result.affectionDelta || 0));
        let trustDelta = Math.max(-3, Math.min(3, result.trustDelta || 0));

        // 确保两个值都不为0（必须同时变化）
        if (affectionDelta === 0) {
          affectionDelta = 1; // 默认 +1
        }
        if (trustDelta === 0) {
          trustDelta = 1; // 默认 +1
        }

        console.log('[AffectionAnalyzer] AI 分析结果:', result);
        console.log('[AffectionAnalyzer] 修正后的值:', { affectionDelta, trustDelta });

        return {
          affectionDelta,
          trustDelta,
          reason: result.reason || 'AI 分析结果'
        };
      }
    } catch (e) {
      console.error('[AffectionAnalyzer] AI 分析失败，使用关键词分析:', e);
    }

    return null;
  }
  
  async analyzeAndApply(userMessage, aiResponse, context, persona, memories, narration = '') {
    const result = await this.analyze(userMessage, aiResponse, context, persona, memories, narration);

    console.log('[AffectionAnalyzer] 分析结果:', {
      affectionDelta: result.affectionDelta,
      trustDelta: result.trustDelta,
      reason: result.reason
    });

    return {
      affection: result.affectionDelta,
      trust: result.trustDelta,
      affectionDelta: result.affectionDelta,
      trustDelta: result.trustDelta,
      reason: result.reason
    };
  }
}

// 单例
let affectionAnalyzerInstance = null;

export function getAffectionAnalyzer() {
  if (!affectionAnalyzerInstance) {
    affectionAnalyzerInstance = new AffectionAnalyzer();
  }
  return affectionAnalyzerInstance;
}
