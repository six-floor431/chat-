// 关键词提取模块 - 使用 AI 智能提取关键词
import { getConfig, getApiKey } from './config.js';

/**
 * 使用 AI 智能提取关键词
 */
async function extractKeywordsWithAI(text) {
  const config = getConfig();
  const apiKey = getApiKey();

  // 必须配置 API
  if (!apiKey || !config.apiBaseUrl || !config.apiModel) {
    throw new Error('请先配置API才能使用关键词提取功能');
  }

  try {
    const prompt = `从以下文本中提取最重要的3-5个关键词，用于在记忆库中搜索相关内容。

文本：${text}

要求：
1. 提取文本中的核心名词、动词、重要实体
2. 关键词长度为2-4个字
3. 优先提取与事件、地点、人物相关的词
4. 不要提取停用词（的、了、是、在等）
5. 输出格式：用逗号分隔的关键词

示例：
输入："我昨天去了公园散步"
输出：昨天,公园,散步

输入："我很喜欢吃苹果和香蕉"
输出：喜欢,吃,苹果,香蕉

关键词：`;

    const baseUrl = config.apiBaseUrl.startsWith('http') ? config.apiBaseUrl : `https://${config.apiBaseUrl}`;
    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

    const requestParams = {
      model: config.apiModel,
      messages: [
        { role: 'system', content: '你是一个关键词提取助手，负责从文本中提取最重要的关键词。用逗号分隔输出。' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 200
    };

    // 打印请求参数到控制台
    console.log('%c[API 关键词提取] 请求参数:', 'color: #95a5a6; font-weight: bold;');
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

    // 解析关键词（按逗号分隔）
    const keywords = responseText
      .split(/[，,、\n]+/)
      .map(k => k.trim())
      .filter(k => k.length >= 2)
      .slice(0, 5);

    console.log('[KeywordExtractor] AI 提取的关键词:', keywords);

    if (keywords.length === 0) {
      throw new Error('API未返回任何关键词');
    }

    return keywords;
  } catch (e) {
    console.error('[KeywordExtractor] AI 提取失败:', e);
    throw e;
  }
}

/**
 * 提取关键词（使用 AI）
 */
export async function extractKeywords(text) {
  if (!text || text.trim().length < 2) return [];

  return await extractKeywordsWithAI(text);
}

/**
 * 提取关键词并计算得分
 */
export async function extractKeywordsWithScore(text) {
  const keywords = await extractKeywords(text);
  return keywords.map((word, index) => ({
    word,
    score: 1 - index * 0.1
  }));
}
