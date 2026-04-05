// TTS过滤器 - 过滤不需要朗读的内容

export class TTSFilter {
  constructor() {
    // 要过滤的括号
    this.bracketPatterns = [
      { start: '（', end: '）' },
      { start: '(', end: ')' },
      { start: '【', end: '】' },
      { start: '[', end: ']' },
      { start: '｛', end: '｝' },
      { start: '{', end: '}' },
      { start: '<', end: '>' },
      { start: '《', end: '》' },
      { start: '「', end: '」' },
      { start: '『', end: '』' }
    ];
    
    // 旁白标记
    this.narrationKeywords = [
      '【清晨】', '【上午】', '【中午】', '【下午】', '【傍晚】', '【夜晚】', '【深夜】',
      '【黎明】', '【黄昏】', '【午夜】',
      '【日常】', '【场景】', '【时间】',
      '地点：', '时间：', '纪元：'
    ];
    
    // 装饰符号
    this.decorationsSymbols = [
      '…', '...', '···',
      '★', '☆', '♡', '♥', '♦', '♢',
      '♪', '♫', '♬', '♩',
      '✧', '✦', '※', '†', '‡',
      '○', '●', '◎', '◇', '◆',
      '□', '■', '△', '▲', '▽', '▼',
      '♠', '♣'
    ];
    
    // 系统消息前缀
    this.systemPrefixes = [
      '系统提示', '错误：', '警告：', '提示：', '注意：'
    ];
  }
  
  filter(text, options = {}) {
    if (!text || typeof text !== 'string') return '';
    
    let result = text;
    
    // 过滤旁白行
    if (options.filterNarration !== false) {
      result = this.filterNarrationLines(result);
    }
    
    // 过滤括号
    if (options.filterBrackets !== false) {
      result = this.filterBrackets(result);
    }
    
    // 移除装饰符号
    if (options.filterDecorations !== false) {
      result = this.removeDecorations(result);
    }
    
    // 过滤系统消息
    if (options.filterSystem !== false) {
      result = this.filterSystemMessages(result);
    }
    
    // 清理空白
    result = this.cleanText(result);
    
    return result.trim();
  }
  
  filterBrackets(text) {
    let result = text;
    
    for (const { start, end } of this.bracketPatterns) {
      const regex = new RegExp(
        this.escapeRegex(start) + '[^' + this.escapeRegex(end) + ']*' + this.escapeRegex(end),
        'g'
      );
      result = result.replace(regex, '');
    }
    
    return result;
  }
  
  filterNarrationLines(text) {
    const lines = text.split('\n');
    
    const filteredLines = lines.filter(line => {
      const trimmedLine = line.trim();
      
      for (const keyword of this.narrationKeywords) {
        if (trimmedLine.startsWith(keyword) || trimmedLine === keyword) {
          return false;
        }
      }
      
      return true;
    });
    
    return filteredLines.join('\n');
  }
  
  removeDecorations(text) {
    let result = text;
    
    for (const symbol of this.decorationsSymbols) {
      result = result.split(symbol).join('');
    }
    
    return result;
  }
  
  filterSystemMessages(text) {
    const lines = text.split('\n');
    
    const filteredLines = lines.filter(line => {
      const trimmedLine = line.trim();
      
      for (const prefix of this.systemPrefixes) {
        if (trimmedLine.startsWith(prefix)) {
          return false;
        }
      }
      
      return true;
    });
    
    return filteredLines.join('\n');
  }
  
  cleanText(text) {
    return text
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .replace(/^\s+|\s+$/gm, '')
      .replace(/\s+([，。！？、；：])/g, '$1')
      .replace(/([，。！？、；：])\s+/g, '$1');
  }
  
  escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  
  shouldSpeak(text) {
    if (!text || typeof text !== 'string') return false;
    return this.filter(text).length > 0;
  }
  
  estimateDuration(text, charsPerSecond = 5) {
    return this.filter(text).length / charsPerSecond;
  }
}

export const ttsFilter = new TTSFilter();
export default TTSFilter;
