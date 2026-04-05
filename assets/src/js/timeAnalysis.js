// 时间分析模块 - 分析对话中的时间变化（调用API分析）

import { getConfig, getApiKey } from './config.js';

export class TimeAnalysisManager {
  constructor() {
    this.currentTime = {
      hour: 12
    };
    this.timeFormat = null;  // 自定义时间格式
    this.worldview = null;  // 缓存世界观信息
    this.dateString = '1年1月1日';  // 日期字符串（直接传输）
  }

  init(worldview) {
    this.worldview = worldview;

    if (worldview) {
      this.dateString = worldview.date || '1年1月1日';
      this.timeFormat = worldview.timeFormat || null;
      this.currentTime = {
        hour: 12
      };
    }
  }

  generateTimestamp(hour = null) {
    const h = hour !== null ? hour : this.currentTime.hour;

    // 如果有自定义时间格式，使用自定义格式
    if (this.timeFormat) {
      return this.formatTimestamp(this.timeFormat, h);
    }

    // 默认格式：纪元 + 日期 + 小时
    const era = this.worldview?.era || '';
    if (era) {
      return `${era}${this.dateString} ${h}时`;
    } else {
      return `${this.dateString} ${h}时`;
    }
  }

  /**
   * 根据自定义格式生成时间戳
   * @param {string} format - 时间格式字符串，支持 {era}, {date}, {hour}
   * @param {number} hour - 小时
   * @returns {string} 格式化后的时间戳
   */
  formatTimestamp(format, hour) {
    const era = this.worldview?.era || '';

    return format
      .replace('{era}', era)
      .replace('{date}', this.dateString)
      .replace('{hour}', hour);
  }

  /**
   * 调用API分析聊天内容的时间变化
   * @param {string} content - 聊天内容（包含旁白和对话）
   * @param {string} baseTimestamp - 基准时间戳（最近记忆的时间戳）
   * @returns {Promise<Object>} 分析结果
   */
  async analyzeTimeFromChat(content, baseTimestamp = null) {
    const config = getConfig();
    const apiKey = getApiKey();

    // 必须配置API
    if (!apiKey || !config.apiBaseUrl || !config.apiModel) {
      throw new Error('请先配置API才能使用时间分析功能');
    }

    // 使用传入的基准时间戳或当前时间
    const currentTime = baseTimestamp || this.generateTimestamp();

    // 从基准时间戳中提取日期部分和当前小时
    const extractDateAndHour = (timestamp) => {
      // 格式1：纪元 日期 时（如"2024年3月15日 18时"）
      const match1 = timestamp.match(/(.+?)\s+(\d+)时$/);
      if (match1) {
        return { datePart: match1[1], hour: parseInt(match1[2]) };
      }

      // 格式2：日期 时（如"13.9.2 18时"）
      const match2 = timestamp.match(/(.+?)\s+(\d+)时$/);
      if (match2) {
        return { datePart: match2[1], hour: parseInt(match2[2]) };
      }

      // 默认返回
      return { datePart: timestamp, hour: 12 };
    };

    const { datePart: currentDateStr, hour: currentHour } = extractDateAndHour(currentTime);

    // 确定时间戳格式
    const era = this.worldview?.era || '';
    let timestampFormat = '';

    if (this.timeFormat) {
      // 使用自定义格式
      timestampFormat = this.timeFormat
        .replace('{era}', era)
        .replace('{date}', currentDateStr)
        .replace('{hour}', '{hour}');
    } else if (era) {
      // 使用纪元 + 日期格式
      timestampFormat = `${era}${currentDateStr} {hour}时`;
    } else {
      // 使用日期格式
      timestampFormat = `${currentDateStr} {hour}时`;
    }

    try {
      console.log('[TimeAnalysis] 开始调用API分析时间...');
      console.log('[TimeAnalysis] 上下文内容:', content.substring(0, 200));
      console.log('[TimeAnalysis] 基准时间戳:', currentTime);
      console.log('[TimeAnalysis] 时间戳格式:', timestampFormat);
      console.log('[TimeAnalysis] 当前日期:', currentDateStr, '当前小时:', currentHour);

      const prompt = `分析对话，判断时间变化。

基准时间戳：${currentTime}（下限，必须 >= 此值）
时间戳格式：${timestampFormat}

内容：${content}

规则：
1. 时间推进（优先级从高到低）：
   - 过了纪元/世纪 → 推进纪元（例：过了2个世纪 → 纪元+200年；过了新纪元 → 切换纪元）
   - 过了X年 → 年份+X（例：过了6年 → 年份+6）
   - 过了X个月 → 月份+X（例：过了3个月 → 月份+3，跨年自动处理）
   - 过了X天 → 日期+X（例：过了10天 → 日期+10，跨月跨年自动处理）
   - 过了X小时 → 小时+X（例：过了5小时 → 小时+5，跨天自动处理）
   - 过了几周/过了一个月 → 推进1个月
   - 过了几个月 → 推进3-6个月
   - 过了几年 → 推进3-5年
   - 过了几天/几天后/过了一个星期 → 推进3-7天
   - 过了好几天 → 推进5-7天
   - 过了一会儿 → 推进30分钟-1小时
   - 过了很久 → 推进2-4小时
2. 跳转未来：提到时间 > 当前 → 跳转（例：3月说5月 → 5月）
3. 回忆过去：提到时间 <= 当前 + 完成态（就...了）→ 不跳转，推进+1小时
4. 对话结束/长度：推进1-2小时
5. 旁白时间：【黄昏】→ 19-21时，【清晨】→ 6-9时，【正午】→ 12-14时

约束：时间戳必须 >= 基准时间戳

输出JSON：{"changed":bool,"dayAdvanced":bool,"newHour":int,"timestamp":"...","reason":"..."}

示例：
当前21世纪2024年3月15日 19时："（过了6年）你在干嘛啊" → {"changed":true,"dayAdvanced":true,"newHour":19,"timestamp":"21世纪2030年3月15日 19时","reason":"过了6年，年份+6"}
当前21世纪2024年3月15日 19时："（过了3个月）..." → {"changed":true,"dayAdvanced":true,"newHour":19,"timestamp":"21世纪2024年6月15日 19时","reason":"过了3个月，月份+3"}
当前21世纪2024年3月15日 19时："（过了10天）..." → {"changed":true,"dayAdvanced":true,"newHour":19,"timestamp":"21世纪2024年3月25日 19时","reason":"过了10天，日期+10"}
当前21世纪2024年3月15日 19时："（过了5小时）..." → {"changed":true,"dayAdvanced":true,"newHour":0,"timestamp":"21世纪2024年3月16日 0时","reason":"过了5小时，跨越到次日"}
当前21世纪2024年3月15日 19时："（过了几个世纪）..." → {"changed":true,"dayAdvanced":true,"newHour":19,"timestamp":"23世纪2024年3月15日 19时","reason":"过了几个世纪，纪元推进"}
当前21世纪2024年3月15日 19时："（过了好几天）你在干嘛啊" → {"changed":true,"dayAdvanced":true,"newHour":10,"timestamp":"21世纪2024年3月20日 10时","reason":"过了好几天，推进5天"}
当前3月15日 15时："我5月份的时候..." → {"changed":true,"dayAdvanced":true,"newHour":10,"timestamp":"5月1日 10时","reason":"3月<5月，跳转"}
当前6月15日 14时："我5月份的时候就..." → {"changed":true,"dayAdvanced":false,"newHour":15,"timestamp":"6月15日 15时","reason":"5月<=6月且完成态，回忆，推进+1h"}
当前今天14时："上周去了游乐园" → {"changed":true,"dayAdvanced":false,"newHour":15,"timestamp":"今天 15时","reason":"上周<=今天，回忆，推进+1h"}
当前今天14时：对话结束 → {"changed":true,"dayAdvanced":false,"newHour":16,"timestamp":"今天 16时","reason":"对话结束，推进2h"}

输出JSON：`;

      console.log('[TimeAnalysis] 开始调用API分析时间...');
      console.log('[TimeAnalysis] 上下文内容:', content.substring(0, 200));
      console.log('[TimeAnalysis] 基准时间戳:', currentTime);

      const baseUrl = config.apiBaseUrl.startsWith('http') ? config.apiBaseUrl : `https://${config.apiBaseUrl}`;
      const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;

      const requestParams = {
        model: config.apiModel,
        messages: [
          { role: 'system', content: '你是一个时间分析助手，负责分析对话内容的时间变化。输出JSON格式，不使用深度思考。对话结束时如果有人离开或场景转换，要合理推进时间。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.6
      };

      // 打印请求参数到控制台
      console.log('%c[API 时间分析] 请求参数:', 'color: #1abc9c; font-weight: bold;');
      console.log(JSON.stringify(requestParams, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestParams)
      });

      console.log('[TimeAnalysis] API响应状态:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TimeAnalysis] API错误响应:', errorText);
        throw new Error(`API错误: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const responseText = data.choices[0]?.message?.content || '';

      console.log('[TimeAnalysis] API响应内容:', responseText);

      // 解析JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const result = JSON.parse(jsonMatch[0]);

          // 更新时间
          if (result.changed && result.newHour !== undefined) {
            if (result.dayAdvanced) {
              this.advanceDay(result.newHour);
              console.log(`[TimeAnalysis] API分析：推进到下一天（${result.reason}）`);
            } else {
              this.currentTime.hour = result.newHour;
              console.log(`[TimeAnalysis] API分析：时间更新（${result.reason}）`);
            }
          }

          // 优先使用 API 返回的 timestamp（可能包含月份更新）
          // 如果 API 没有返回或为空，才使用内部生成的 timestamp
          let timestamp = result.timestamp && result.timestamp.trim() ? result.timestamp : this.generateTimestamp();

          // 🔒 验证时间戳必须 >= 基准时间戳
          if (timestamp < currentTime) {
            console.warn(`[TimeAnalysis] ⚠️ AI返回的时间戳早于基准时间戳！`);
            console.warn(`[TimeAnalysis] 基准时间戳: ${currentTime}`);
            console.warn(`[TimeAnalysis] AI返回时间戳: ${timestamp}`);
            console.warn(`[TimeAnalysis] 强制使用基准时间戳 + 1小时`);
            // 使用基准时间戳 + 1小时作为兜底
            timestamp = this.generateTimestamp(currentHour + 1);
          }

          // 从 API 返回的 timestamp 中提取日期信息更新内部状态（无论是否有自定义格式）
          if (result.timestamp && result.timestamp.trim()) {
            this.updateDateFromTimestamp(result.timestamp);
          }

          // 检测时间冲突
          this.detectTimeConflict(content, currentTime, timestamp);

          return {
            changed: result.changed || false,
            dayAdvanced: result.dayAdvanced || false,
            hour: this.currentTime.hour,
            timestamp: timestamp,
            reason: result.reason || ''
          };
        } catch (parseError) {
          console.error('[TimeAnalysis] JSON解析失败:', parseError);
          console.error('[TimeAnalysis] JSON内容:', jsonMatch[0]);
          throw new Error('时间分析API返回JSON格式错误');
        }
      }

      throw new Error('时间分析API返回数据格式错误：无法找到JSON');
    } catch (e) {
      console.error('[TimeAnalysis] API分析失败:', e);
      throw e;
    }
  }

  /**
   * 检测时间是否回退（从晚到早，说明过了一天）
   * @param {number} newHour - 新的小时
   * @returns {boolean} 是否过了一天
   */
  detectDayAdvanced(newHour) {
    const currentHour = this.currentTime.hour;

    // 时间段定义
    const morning = [5, 6, 7, 8, 9, 10, 11];
    const noon = [12, 13, 14, 15, 16];
    const afternoon = [17, 18];
    const evening = [19, 20, 21];
    const night = [22, 23, 0, 1, 2, 3, 4];

    const getCurrentPeriod = (hour) => {
      if (morning.includes(hour)) return 'morning';
      if (noon.includes(hour)) return 'noon';
      if (afternoon.includes(hour)) return 'afternoon';
      if (evening.includes(hour)) return 'evening';
      if (night.includes(hour)) return 'night';
      return 'unknown';
    };

    const currentPeriod = getCurrentPeriod(currentHour);
    const newPeriod = getCurrentPeriod(newHour);

    const periodOrder = ['morning', 'noon', 'afternoon', 'evening', 'night'];
    const currentIndex = periodOrder.indexOf(currentPeriod);
    const newIndex = periodOrder.indexOf(newPeriod);

    if (currentIndex !== -1 && newIndex !== -1 && newIndex < currentIndex) {
      return true;
    }

    if (newHour < currentHour && currentHour - newHour > 6) {
      return true;
    }

    return false;
  }

  advanceDay(hour = 8) {
    // 日期字符串保持不变，只是推进了一天
    // 由AI在时间分析时处理日期变化
    this.currentTime.hour = hour;

    return this.currentTime;
  }

  /**
   * 从 API 返回的 timestamp 中提取日期信息并更新内部状态
   * @param {string} timestamp - API 返回的时间戳
   */
  updateDateFromTimestamp(timestamp) {
    if (!timestamp) return;

    console.log(`[TimeAnalysis] 从 timestamp 更新日期字符串: ${timestamp}`);

    // 提取日期字符串（不含时）
    // 正则会匹配到 "2024年3月15日" 或 "21世纪2024年3月15日" 或 "13.9.2"
    const dateMatch = timestamp.match(/(.+?)\s*\d+时/);

    if (dateMatch) {
      this.dateString = dateMatch[1];
      console.log(`[TimeAnalysis] 日期字符串已更新: ${this.dateString}`);
    } else {
      // 如果匹配失败，尝试另一种格式（不带"时"的情况）
      const dateMatch2 = timestamp.match(/(.+)$/);
      if (dateMatch2) {
        this.dateString = dateMatch2[1];
        console.log(`[TimeAnalysis] 日期字符串已更新（无时间）: ${this.dateString}`);
      }
    }

    // 解析格式：2024年3月15日 或 13.9.2
    const yearMonthMatch = this.dateString.match(/(\d+)年(\d+)月|(\d+)\.(\d+)\./);

    if (yearMonthMatch) {
      let year, month;
      if (yearMonthMatch[1]) {
        // 格式：2024年3月
        year = parseInt(yearMonthMatch[1]);
        month = parseInt(yearMonthMatch[2]);
      } else {
        // 格式：13.9.
        year = parseInt(yearMonthMatch[3]);
        month = parseInt(yearMonthMatch[4]);
      }

      console.log(`[TimeAnalysis] 从 timestamp 更新月份: ${year}年${month}月`);
    }
  }

  /**
   * 检测时间冲突
   * @param {string} content - 对话内容
   * @param {string} currentTime - 当前时间戳
   * @param {string} newTimestamp - 新时间戳
   */
  detectTimeConflict(content, currentTime, newTimestamp) {
    // 检测对话中是否提到了月份
    const monthMatches = content.match(/(\d+)月|([一二三四五六七八九十]+)月/g);
    if (monthMatches) {
      // 提取当前时间的月份
      const currentMonthMatch = currentTime.match(/(\d+)月/);
      const currentMonth = currentMonthMatch ? parseInt(currentMonthMatch[1]) : null;

      // 提取对话中提到的月份
      const mentionedMonths = monthMatches.map(match => {
        const numMatch = match.match(/(\d+)月/);
        if (numMatch) return parseInt(numMatch[1]);

        // 中文数字转阿拉伯数字
        const chineseNums = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
        const chineseMatch = match.match(/([一二三四五六七八九十]+)月/);
        if (chineseMatch) {
          const index = chineseNums.indexOf(chineseMatch[1]);
          return index !== -1 ? index + 1 : null;
        }
        return null;
      }).filter(m => m !== null);

      // 检查是否有时间冲突
      if (currentMonth && mentionedMonths.length > 0) {
        mentionedMonths.forEach(mentionedMonth => {
          if (mentionedMonth > currentMonth) {
            console.warn(`%c⚠️ 时间冲突警告：对话中提到了 ${mentionedMonth} 月，但当前时间是 ${currentMonth} 月！`, 'color: #e74c3c; font-weight: bold; font-size: 14px;');
            console.warn(`   建议：请检查世界观设定中的时间，或将当前时间改为 ${mentionedMonth} 月`);
          }
        });
      }
    }

    // 检测是否提到了"明天"、"下周"等未来时间
    const futureKeywords = ['明天', '后天', '下周', '下个月', '明年'];
    const hasFutureKeyword = futureKeywords.some(keyword => content.includes(keyword));
    if (hasFutureKeyword) {
      console.warn(`%c⚠️ 未来时间检测：对话中提到了未来时间（明天/下周等），但时间分析可能没有推进到相应时间`, 'color: #f39c12; font-weight: bold;');
    }
  }

  getCurrentTime() {
    return { ...this.currentTime };
  }

  setTime(hour = 12) {
    this.currentTime.hour = hour;
    return this.currentTime;
  }
}

// 单例
let timeAnalysisManagerInstance = null;

export function getTimeAnalysisManager() {
  if (!timeAnalysisManagerInstance) {
    timeAnalysisManagerInstance = new TimeAnalysisManager();
  }
  return timeAnalysisManagerInstance;
}
