// 记忆模块 - 管理对话记忆

import { getConfig, getApiKey } from '../js/config.js';
import { getCharacterSettingManager } from '../js/characterSetting.js';
import { getWorldviewManager } from '../js/worldview.js';

// 记忆上限常量
const MAX_MEMORIES = 999;

// 记忆管理器
export class MemoryManager {
  constructor() {
    this.memories = [];
    this.maxMemories = MAX_MEMORIES;  // 记忆上限 999 条
    this.conversationHistory = [];  // 对话历史（临时的）
    this.maxConversationHistory = 20;
    this.memoryAddCount = 0;  // 用于遗忘机制
  }
  
  async init() {
    try {
      const data = await window.electronAPI.memoLoad();
      this.memories = data.memories || [];
      return true;
    } catch (error) {
      console.error('加载记忆失败:', error);
      this.memories = [];
      return false;
    }
  }

  /**
   * 调用 API 分析记忆重要度
   * @param {string} content - 记忆内容
   * @param {Object} persona - AI 人设信息
   * @param {number} affection - 好感度
   * @param {number} trust - 信任值
   * @param {Object} worldview - 世界观设定
   * @param {Array} recentMemories - 以前的记忆（最近的10条）
   * @returns {Promise<number>} 重要度 (1-5)
   */
  async analyzeImportance(content, persona = null, affection = 0, trust = 0, worldview = null, recentMemories = []) {
    const config = getConfig();
    const apiKey = getApiKey();

    // 如果没有配置 API，返回默认值
    if (!apiKey || !config.apiBaseUrl || !config.apiModel) {
      console.log('[Memory] API未配置，使用默认重要度3');
      return 3;
    }

    try {
      // 构建世界观信息
      let worldviewInfo = '';
      if (worldview) {
        worldviewInfo += `\n【世界观设定】\n`;
        if (worldview.worldName) worldviewInfo += `世界名称：${worldview.worldName}\n`;
        if (worldview.era) worldviewInfo += `纪元：${worldview.era}\n`;
        if (worldview.date) worldviewInfo += `当前时间：${worldview.date}\n`;
        if (worldview.worldBackground) worldviewInfo += `世界背景：${worldview.worldBackground}\n`;
      }

      // 构建人设信息
      let personaInfo = '';
      if (persona) {
        personaInfo += `\n【角色信息】\n`;
        if (persona.name) personaInfo += `名字：${persona.name}\n`;
        if (persona.description) personaInfo += `设定：${persona.description}\n`;
        if (persona.personality) personaInfo += `性格：${persona.personality}\n`;
        if (persona.scenario) personaInfo += `场景：${persona.scenario}\n`;
        if (persona.creator_notes) personaInfo += `创作者说明：${persona.creator_notes}\n`;
        if (persona.tags && persona.tags.length > 0) personaInfo += `标签：${persona.tags.join('、')}\n`;
        personaInfo += `好感度：${affection}\n`;
        personaInfo += `信任值：${trust}\n`;
      }

      // 构建历史记忆信息（最近15条）
      let recentMemoriesInfo = '';
      if (recentMemories && recentMemories.length > 0) {
        recentMemoriesInfo += `\n【历史记忆（最近15条）】\n`;
        recentMemories.slice(0, 15).forEach((mem, index) => {
          const importanceLabel = '★'.repeat(mem.importance || 3) + '☆'.repeat(5 - (mem.importance || 3));
          recentMemoriesInfo += `${index + 1}. [${importanceLabel}] ${mem.content}\n`;
        });
      } else {
        recentMemoriesInfo += `\n【历史记忆】暂无历史记忆\n`;
      }

      const prompt = `请分析以下记忆的重要程度，给出 1-5 的评分。

【当前记忆内容】
${content}
${worldviewInfo}
${personaInfo}
${recentMemoriesInfo}

评分标准：
1分（★☆☆☆☆ 微不足道）：日常琐事，无关紧要的细节，或者与历史记忆完全重复
2分（★★☆☆☆ 略微重要）：一般互动，可有可无的信息，或者与历史记忆有少量重复
3分（★★★☆☆ 普通记忆）：正常对话，值得记录的信息，与历史记忆无明显重复
4分（★★★★☆ 重点关注）：重要事件，影响关系发展，或者在当前世界观下具有重要意义
5分（★★★★★ 刻骨铭心）：极其重要，影响深远，必须保留，或者填补了历史记忆的重要空白

分析要点：
1. 对AI角色的重要性：是否符合角色核心特质、是否影响性格发展
2. 对关系发展的影响：是否改变好感度/信任值、是否为关系转折点
3. 在世界观中的意义：是否符合世界背景、是否涉及世界观核心事件
4. 与历史记忆的关系：是否重复、是否填补空白、是否提供新信息
5. 情感因素：是否涉及重要情感表达、是否引起情感变化

请综合以上因素，给出准确的评分。

请直接输出一个数字（1-5），不要输出其他内容：`;

      const baseUrl = config.apiBaseUrl.startsWith('http') ? config.apiBaseUrl : `https://${config.apiBaseUrl}`;
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

      const requestParams = {
        model: config.apiModel,
        messages: [
          { role: 'system', content: '你是一个记忆重要度评估助手，根据记忆内容、世界观、人设、历史记忆综合评估重要程度，给出 1-5 的评分。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6
      };

      // 打印请求参数到控制台
      console.log('%c[API 重要度分析] 请求参数:', 'color: #9b59b6; font-weight: bold;');
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
        console.error('[Memory] API调用失败:', response.status);
        return 3;
      }

      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || '3';

      // 提取数字
      const match = responseText.match(/[1-5]/);
      const importance = match ? parseInt(match[0]) : 3;

      console.log(`[Memory] 重要度分析: ${content.substring(0, 30)}... → ${importance} ★`);

      return importance;
    } catch (error) {
      console.error('[Memory] 分析重要度失败:', error);
      return 3;
    }
  }

  async addMemory(memory) {
    // 如果没有提供重要度，调用 API 分析
    let importance = memory.importance;
    if (importance === undefined || importance === null) {
      // 获取人设信息
      const characterManager = getCharacterSettingManager();
      let persona = null;
      let affection = 0;
      let trust = 0;

      if (characterManager) {
        try {
          persona = await characterManager.getCurrentPersona();
          affection = characterManager.getAffection();
          trust = characterManager.getTrust();
        } catch (e) {
          console.log('[Memory] 获取人设信息失败，使用默认值');
        }
      }

      // 获取世界观信息
      let worldview = null;
      const worldviewManager = getWorldviewManager();
      if (worldviewManager) {
        try {
          worldview = await worldviewManager.get();
        } catch (e) {
          console.log('[Memory] 获取世界观信息失败');
        }
      }

      // 获取历史记忆（最近10条）
      const recentMemories = this.getRecentMemories(10);

      importance = await this.analyzeImportance(memory.content, persona, affection, trust, worldview, recentMemories);
    }

    const newMemory = {
      id: Date.now() + Math.random(),
      content: memory.content,
      importance: importance,
      timestamp: memory.timestamp || new Date().toISOString(),  // 显示用的时间戳（可以是任意格式）
      internalTimestamp: memory.internalTimestamp || Date.now()  // 内部时间戳（毫秒，用于排序和时间分析）
    };

    // 检查是否达到记忆上限
    if (this.memories.length >= this.maxMemories) {
      console.warn(`[Memory] 已达到记忆上限 ${this.maxMemories} 条，尝试删除最旧的低重要度记忆`);

      // 删除最旧的1-2条重要性低于3的记忆
      const lowImportance = this.memories
        .filter(m => m.importance < 3)  // 低于3，即1和2
        .sort((a, b) => a.internalTimestamp - b.internalTimestamp);  // 按内部时间戳排序

      if (lowImportance.length > 0) {
        const count = Math.min(Math.floor(Math.random() * 2) + 1, lowImportance.length);
        const toRemove = lowImportance.slice(0, count).map(m => m.id);

        // 获取被删除的记忆（用于通知）
        const removedMemories = this.memories.filter(m => toRemove.includes(m.id));
        console.log(`[Memory] 已删除 ${removedMemories.length} 条最旧的低重要度记忆:`, removedMemories.map(m => m.content.substring(0, 20) + '...'));

        // 直接删除
        this.memories = this.memories.filter(m => !toRemove.includes(m.id));

        // 如果有被删除的记忆，添加到新记忆的 removedMemories 字段
        newMemory.removedMemories = removedMemories;
      } else {
        // 如果没有低重要度记忆可以删除，记录警告但不阻止添加
        console.warn(`[Memory] 没有低重要度记忆可删除，当前记忆数量: ${this.memories.length}`);
      }
    }

    this.memories.push(newMemory);
    this.memoryAddCount++;

    // 触发遗忘机制
    const removedMemories = await this.checkForgetting();

    // 保存
    await this.save();

    // 如果有被删除的记忆，返回给调用方
    if (removedMemories.length > 0) {
      newMemory.removedMemories = removedMemories;
    }

    return newMemory;
  }
  
  async checkForgetting() {
    let toRemove = [];

    // 每20条随机删除1-2条重要性低于3的记忆（删除最远的）
    if (this.memoryAddCount % 20 === 0) {
      const lowImportance = this.memories
        .filter(m => m.importance < 3)  // 低于3，即1和2
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));  // 按时间戳排序

      // 随机删除1-2条
      const count = Math.min(Math.floor(Math.random() * 2) + 1, lowImportance.length);
      toRemove = lowImportance.slice(0, count).map(m => m.id);
    }

    if (toRemove.length > 0) {
      // 获取被删除的记忆（用于通知）
      const removedMemories = this.memories.filter(m => toRemove.includes(m.id));

      // 直接删除
      this.memories = this.memories.filter(m => !toRemove.includes(m.id));

      console.log(`[Memory] 已遗忘 ${removedMemories.length} 条记忆:`, removedMemories.map(m => m.content.substring(0, 20) + '...'));

      return removedMemories;
    }

    return [];
  }
  
  async save() {
    const data = {
      version: '1.0',
      roleId: 'jntm',
      memories: this.memories,
      metadata: {
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        totalCount: this.memories.length
      }
    };
    
    await window.electronAPI.memoSave(data);
    
    // 同步到localStorage
    localStorage.setItem('aiGameMemories', JSON.stringify(this.memories));
  }
  
  // 获取最近的对话
  addToConversation(role, content) {
    this.conversationHistory.push({
      role: role,
      content: content,
      timestamp: Date.now()
    });
    
    // 限制历史长度
    if (this.conversationHistory.length > this.maxConversationHistory) {
      this.conversationHistory.shift();
    }
  }
  
  getRecentConversation(count = 10) {
    return this.conversationHistory.slice(-count);
  }
  
  clearConversation() {
    this.conversationHistory = [];
  }

  // 清空历史（别名）
  clearHistory() {
    this.clearConversation();
  }

  // 清空会话消息（别名）
  clearSessionMessages() {
    this.clearConversation();
  }

  // 获取历史（别名）
  getHistory() {
    return this.conversationHistory;
  }

  // 加载记忆（别名）
  async loadMemories() {
    return await this.init();
  }

  // 获取所有记忆
  getAllMemories() {
    return [...this.memories];
  }

  // 搜索记忆
  fuzzySearch(keyword, limit = 10) {
    if (!keyword) return [];
    
    const lowerKeyword = keyword.toLowerCase();
    return this.memories
      .filter(m => m.content.toLowerCase().includes(lowerKeyword))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }
  
  exactSearch(keyword, limit = 10) {
    if (!keyword) return [];
    
    return this.memories
      .filter(m => m.content.includes(keyword))
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }
  
  // 解析游戏内时间戳为可比较的时间戳（毫秒）
  parseGameTimestamp(timestamp) {
    if (!timestamp) return 0;

    try {
      // 格式1：纪元 日期 时（如"2024年3月15日 18时"）
      const match1 = timestamp.match(/(\d+)年(\d+)月(\d+)日\s+(\d+)时$/);
      if (match1) {
        const [, year, month, day, hour] = match1;
        const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour));
        return date.getTime();
      }

      // 格式2：日期 时（如"13.9.2 18时"）
      const match2 = timestamp.match(/(\d+)\.(\d+)\.(\d+)\s+(\d+)时$/);
      if (match2) {
        const [, year, month, day, hour] = match2;
        const date = new Date(2000 + parseInt(year), parseInt(month) - 1, parseInt(day), parseInt(hour));
        return date.getTime();
      }

      // 格式3：ISO格式或其他标准格式
      const date = new Date(timestamp);
      if (!isNaN(date.getTime())) {
        return date.getTime();
      }

      return 0;
    } catch (e) {
      console.warn('[Memory] 解析时间戳失败:', timestamp, e);
      return 0;
    }
  }

  getRecentMemories(limit = 10) {
    return [...this.memories]
      .sort((a, b) => (b.id || 0) - (a.id || 0))  // 使用 id 排序，最新的在最上面
      .slice(0, limit);
  }

  // 获取最新记忆的内部时间戳（用于时间分析的基准）
  getLatestInternalTimestamp() {
    if (this.memories.length === 0) return null;

    // 按内部时间戳排序，获取最新的
    const latest = [...this.memories].sort((a, b) => {
      return (b.internalTimestamp || 0) - (a.internalTimestamp || 0);
    })[0];

    return latest?.internalTimestamp || null;
  }
  
  getImportantMemories(threshold = 4, limit = 10) {
    return this.memories
      .filter(m => m.importance >= threshold)
      .sort((a, b) => b.importance - a.importance)
      .slice(0, limit);
  }
  // 查询相关记忆（使用AI检索）
  async queryRelevantMemories(userMessage, options = {}) {
    const { maxRecent = 8, maxImportant = 5, maxRelevant = 8, persona, affection, trust } = options;

    // 1. 重要性最高的记忆（优先级最高）
    const importantMemories = this.getImportantMemories(4, maxImportant);

    // 2. 使用AI检索相关的记忆（基于用户消息）
    const relevantMemories = await this.searchWithAI(userMessage, maxRelevant, persona, affection, trust);

    // 3. 最近的记忆（最近8条）
    const recentMemories = this.getRecentMemories(maxRecent);

    // 合并去重（先重要，后相关，最后最近）
    const allIds = new Set();
    const allMemories = [];

    // 先添加重要性高的
    importantMemories.forEach(m => {
      if (!allIds.has(m.id)) {
        allIds.add(m.id);
        allMemories.push(m);
      }
    });

    // 再添加相关的
    relevantMemories.forEach(m => {
      if (!allIds.has(m.id)) {
        allIds.add(m.id);
        allMemories.push(m);
      }
    });

    // 最后添加最近的
    recentMemories.forEach(m => {
      if (!allIds.has(m.id)) {
        allIds.add(m.id);
        allMemories.push(m);
      }
    });

    return {
      importantMemories,
      relevantMemories,
      recentMemories,
      allMemories,
      recentMessages: this.conversationHistory
    };
  }

  /**
   * 使用AI检索相关记忆
   * @param {string} userMessage - 用户消息
   * @param {number} limit - 返回数量
   * @param {object} persona - 角色人设
   * @param {number} affection - 好感度
   * @param {number} trust - 信任值
   * @returns {Promise<Array>} 相关记忆列表
   */
  async searchWithAI(userMessage, limit, persona, affection, trust) {
    // 导入config
    const configModule = await import('../js/config.js');
    const config = configModule.getConfig();
    const apiKey = configModule.getApiKey();

    // 如果没有配置API，使用简单的关键词匹配
    if (!apiKey || !config.apiBaseUrl || !config.apiModel) {
      return this.fuzzySearch(userMessage, limit);
    }

    try {
      // 获取所有记忆
      const allMemories = this.memories;

      // 如果没有记忆，返回空
      if (allMemories.length === 0) {
        return [];
      }

      // 如果记忆很少，返回全部
      if (allMemories.length <= limit) {
        return allMemories;
      }

      // 构建记忆列表（带编号和重要度）
      const memoryList = allMemories.map((m, index) => {
        const importanceLabel = '★'.repeat(m.importance || 3) + '☆'.repeat(5 - (m.importance || 3));
        return `${index + 1}. [${importanceLabel}] ${m.content}`;
      }).join('\n');

      // 构建提示词
      const prompt = `分析以下用户消息，从记忆列表中找出最相关的${limit}条记忆。

【用户消息】
${userMessage}

【记忆列表】
${memoryList}

【角色信息】
${persona ? `名字: ${persona.name}\n设定: ${persona.description}\n性格: ${persona.personality}` : ''}
好感度: ${affection || 0}
信任值: ${trust || 0}

【要求】
1. 只返回记忆的编号（数字），不要返回记忆内容
2. 选择与用户消息最相关、最有用的记忆
3. 优先选择重要度高的记忆（★★★★★、★★★★☆）
4. 优先考虑对角色人设重要的记忆
5. 优先考虑最近发生的记忆
6. 最多选择${limit}条
7. 输出格式：用逗号分隔的数字，如 "1,3,5"

请输出相关的记忆编号：`;

      // 调用API
      const baseUrl = config.apiBaseUrl.startsWith('http') ? config.apiBaseUrl : `https://${config.apiBaseUrl}`;
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

      const requestParams = {
        model: config.apiModel,
        messages: [
          { role: 'system', content: '你是一个记忆检索助手，负责从记忆列表中找出最相关的记忆。输出数字编号。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      };

      // 打印请求参数到控制台
      console.log('%c[API 相关记忆查询] 请求参数:', 'color: #f39c12; font-weight: bold;');
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
        console.error('[Memory] AI检索失败，使用关键词匹配');
        return this.fuzzySearch(userMessage, limit);
      }

      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || '';

      // 解析编号
      const numbers = responseText.match(/\d+/g);
      if (!numbers || numbers.length === 0) {
        console.warn('[Memory] AI未返回有效编号，使用关键词匹配');
        return this.fuzzySearch(userMessage, limit);
      }

      // 获取对应的记忆
      const relevantMemories = [];
      const usedIndices = new Set();

      numbers.forEach(num => {
        const index = parseInt(num) - 1;
        if (index >= 0 && index < allMemories.length && !usedIndices.has(index)) {
          relevantMemories.push(allMemories[index]);
          usedIndices.add(index);
        }
      });

      console.log(`[Memory] AI检索找到${relevantMemories.length}条相关记忆`);

      return relevantMemories;
    } catch (error) {
      console.error('[Memory] AI检索失败:', error);
      // 降级到关键词匹配
      return this.fuzzySearch(userMessage, limit);
    }
  }
  
  getForgettingStatus() {
    const nextMilestone = Math.ceil(this.memoryAddCount / 5) * 5;
    return {
      memoryAddCount: this.memoryAddCount,
      totalMemories: this.memories.length,
      nextMilestone: {
        target: nextMilestone,
        remaining: nextMilestone - this.memoryAddCount
      }
    };
  }
}

// 单例
let memoryManagerInstance = null;

export function getMemoryManager() {
  if (!memoryManagerInstance) {
    memoryManagerInstance = new MemoryManager();
  }
  return memoryManagerInstance;
}

// 导出记忆上限常量
export { MAX_MEMORIES };
