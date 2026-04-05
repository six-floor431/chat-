const { app, BrowserWindow, ipcMain, dialog, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const http = require('http');
const { URL } = require('url');

console.log('[Main] Starting application...');

// ==================== 游戏日志系统 ====================
const gameLogDir = path.join(__dirname, 'logs');
const gameLogFile = path.join(gameLogDir, 'game.log');

// 确保日志目录存在
if (!fs.existsSync(gameLogDir)) {
  fs.mkdirSync(gameLogDir, { recursive: true });
}

// 清空游戏日志
function clearGameLog() {
  try {
    if (fs.existsSync(gameLogFile)) {
      fs.writeFileSync(gameLogFile, '');
      console.log('[GameLog] Log cleared');
    }
  } catch (e) {
    console.error('[GameLog] Failed to clear log:', e);
  }
}

// 写入游戏日志
function writeGameLog(level, category, message, data = null) {
  try {
    const timestamp = new Date().toISOString();
    let logLine = `[${timestamp}] [${level}] [${category}] ${message}`;
    if (data) {
      logLine += ` | ${JSON.stringify(data)}`;
    }
    logLine += '\n';
    
    fs.appendFileSync(gameLogFile, logLine, 'utf8');
  } catch (e) {
    console.error('[GameLog] Failed to write log:', e);
  }
}

// 应用启动时清空日志
clearGameLog();

// ==================== 内存优化与性能优化 ====================

// ==================== Live2D HTTP 服务器（零依赖原生实现）====================
let live2dServer = null;
let live2dServerPort = 0;

/**
 * MIME 类型映射表
 */
const MIME_TYPES = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.moc3': 'application/octet-stream',
  '.moc': 'application/octet-stream',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.model3.json': 'application/json',
  '.model.json': 'application/json',
  '.js': 'application/javascript',
  '.css': 'text/css',
};

/**
 * 获取文件的 MIME 类型
 */
function getMimeType(filePath) {
  // 先检查完整扩展名（如 .model3.json）
  const fileName = path.basename(filePath).toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_TYPES)) {
    if (fileName.endsWith(ext)) {
      return mime;
    }
  }
  // 再检查单扩展名
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * 启动 Live2D 本地静态文件服务器（零依赖原生实现）
 * 完美支持中文路径、空格和特殊字符
 */
function startLive2DServer() {
  return new Promise((resolve, reject) => {
    if (live2dServer) {
      console.log('[Live2D Server] Server already running on port', live2dServerPort);
      resolve(live2dServerPort);
      return;
    }

    // 获取模型根目录
    const modelRootDir = getLive2DModelsDir();
    console.log('[Live2D Server] Serving models from:', modelRootDir);
    
    // 确保目录存在
    if (!fs.existsSync(modelRootDir)) {
      fs.mkdirSync(modelRootDir, { recursive: true });
    }

    // 创建原生 HTTP 服务器
    live2dServer = http.createServer((req, res) => {
      try {
        // 解析 URL 并解码（支持中文和空格）
        const parsedUrl = new URL(req.url, 'http://127.0.0.1');
        const decodedPath = decodeURIComponent(parsedUrl.pathname);
        const filePath = path.join(modelRootDir, decodedPath);
        
        console.log('[Live2D Server] Request:', decodedPath, '->', filePath);

        // 安全限制：只允许读取模型文件夹内的文件
        const normalizedPath = path.normalize(filePath);
        if (!normalizedPath.startsWith(modelRootDir)) {
          console.warn('[Live2D Server] Forbidden path:', normalizedPath);
          res.writeHead(403, { 'Content-Type': 'text/plain' });
          res.end('Forbidden');
          return;
        }

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
          console.warn('[Live2D Server] File not found:', filePath);
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }

        // 读取文件
        const data = fs.readFileSync(filePath);
        const mimeType = getMimeType(filePath);
        
        // 设置响应头
        res.writeHead(200, {
          'Content-Type': mimeType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
          'Content-Length': data.length
        });
        
        res.end(data);
        console.log('[Live2D Server] Served:', decodedPath, `(${data.length} bytes, ${mimeType})`);

      } catch (error) {
        console.error('[Live2D Server] Error:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error: ' + error.message);
      }
    });

    // 监听随机可用端口
    live2dServer.listen(0, '127.0.0.1', () => {
      live2dServerPort = live2dServer.address().port;
      console.log(`✅ [Live2D Server] Started on http://127.0.0.1:${live2dServerPort}`);
      console.log(`✅ [Live2D Server] Serving directory: ${modelRootDir}`);
      console.log(`✅ [Live2D Server] Zero-dependency native implementation`);
      resolve(live2dServerPort);
    });

    live2dServer.on('error', (err) => {
      console.error('[Live2D Server] Error:', err);
      reject(err);
    });
  });
}

/**
 * 获取模型的 HTTP URL
 * @param {string} modelDir - 模型目录绝对路径
 * @param {string} modelFile - 模型配置文件名（可选，默认自动检测）
 * @returns {string} HTTP URL
 */
function getLive2DModelUrl(modelDir, modelFile = null) {
  const modelRootDir = getLive2DModelsDir();
  
  // 计算相对路径
  let relativePath = path.relative(modelRootDir, modelDir);
  
  // 统一使用正斜杠，并编码中文和空格
  relativePath = relativePath.replace(/\\/g, '/');
  const encodedPath = encodeURI(relativePath);
  
  // 如果没有指定模型文件，自动检测
  if (!modelFile) {
    modelFile = findModelConfigFile(modelDir);
    if (modelFile) {
      modelFile = path.basename(modelFile);
    } else {
      modelFile = 'model3.json'; // 默认值
    }
  }
  
  const url = `http://127.0.0.1:${live2dServerPort}/${encodedPath}/${modelFile}`;
  console.log('[Live2D Server] Model URL:', url);
  return url;
}

/**
 * 获取 Live2D 模型的完整 HTTP URL（供渲染进程调用）
 * @param {string} modelDir - 模型目录绝对路径
 * @param {string} selectedFile - 用户选择的模型配置文件（可选）
 * @returns {object} 包含模型信息的对象
 */
function getLive2DModelInfo(modelDir, selectedFile = null) {
  const modelRootDir = getLive2DModelsDir();
  
  // 计算相对路径
  let relativePath = path.relative(modelRootDir, modelDir);
  relativePath = relativePath.replace(/\\/g, '/');
  const encodedPath = encodeURI(relativePath);
  
  // 确定模型文件
  let modelFile;
  if (selectedFile) {
    modelFile = path.basename(selectedFile);
  } else {
    const foundFile = findModelConfigFile(modelDir);
    modelFile = foundFile ? path.basename(foundFile) : 'model3.json';
  }
  
  // 判断模型类型
  const modelType = modelFile.includes('model3') ? 'cubism3' : 'cubism2';
  
  // 构建基础 URL 和模型 URL
  const baseUrl = `http://127.0.0.1:${live2dServerPort}/${encodedPath}`;
  const modelUrl = `${baseUrl}/${modelFile}`;
  
  console.log('[Live2D Server] Model info:', { baseUrl, modelUrl, modelType });
  
  return {
    _modelDir: modelDir,
    _modelFile: modelFile,
    _modelType: modelType,
    _serverPort: live2dServerPort,
    _modelBaseUrl: baseUrl,
    _modelJsonUrl: modelUrl
  };
}

/**
 * 内存优化配置
 */
const MEMORY_CONFIG = {
  // 内存警告阈值 (MB)
  warningThreshold: 512,
  // 内存临界阈值 (MB)，超过此值触发强制清理
  criticalThreshold: 768,
  // 最大堆内存限制 (MB)
  maxHeapSize: 1024,
  // 缓存清理间隔 (毫秒)
  cacheCleanupInterval: 5 * 60 * 1000, // 5分钟
  // 内存检查间隔 (毫秒)
  memoryCheckInterval: 30 * 1000, // 30秒
};

/**
 * 性能优化配置
 */
const PERFORMANCE_CONFIG = {
  // 启用硬件加速
  hardwareAcceleration: true,
  // GPU 进程内存限制 (MB)
  gpuMemoryLimit: 512,
  // 渲染进程 GPU 内存限制 (MB)
  rendererGpuMemoryLimit: 256,
  // 后台进程节流
  backgroundThrottling: false,
  // V8 引擎标志
  v8Flags: [
    '--max-old-space-size=1024',      // 老生代内存上限
    '--max-semi-space-size=64',       // 新生代半空间大小
    '--optimize-for-size=false',      // 不为大小优化，优先性能
    '--gc-interval=100',              // GC 间隔
  ],
};

// 内存统计
let memoryStats = {
  lastCheck: 0,
  peakMemory: 0,
  cleanupCount: 0,
};

/**
 * 获取当前内存使用情况
 */
function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),   // MB
    rss: Math.round(usage.rss / 1024 / 1024),             // MB (常驻内存)
    external: Math.round(usage.external / 1024 / 1024),   // MB
    arrayBuffers: Math.round(usage.arrayBuffers / 1024 / 1024), // MB
  };
}

/**
 * 记录内存使用情况
 */
function logMemoryUsage(prefix = '') {
  const usage = getMemoryUsage();
  const logLine = `${prefix} Memory: RSS=${usage.rss}MB, Heap=${usage.heapUsed}/${usage.heapTotal}MB, External=${usage.external}MB`;
  console.log(`[Memory] ${logLine}`);
  return usage;
}

/**
 * 检查内存使用并在需要时触发清理
 */
function checkAndCleanMemory() {
  const usage = getMemoryUsage();
  memoryStats.lastCheck = Date.now();
  
  // 更新峰值内存
  if (usage.rss > memoryStats.peakMemory) {
    memoryStats.peakMemory = usage.rss;
  }
  
  // 内存警告
  if (usage.rss > MEMORY_CONFIG.warningThreshold) {
    console.warn(`[Memory] Warning: Memory usage (${usage.rss}MB) exceeds warning threshold (${MEMORY_CONFIG.warningThreshold}MB)`);
  }
  
  // 内存临界 - 触发强制清理
  if (usage.rss > MEMORY_CONFIG.criticalThreshold) {
    console.warn(`[Memory] Critical: Memory usage (${usage.rss}MB) exceeds critical threshold (${MEMORY_CONFIG.criticalThreshold}MB)`);
    performMemoryCleanup(true);
  }
  
  return usage;
}

/**
 * 执行内存清理
 * @param {boolean} aggressive - 是否激进清理
 */
function performMemoryCleanup(aggressive = false) {
  console.log(`[Memory] Performing ${aggressive ? 'aggressive' : 'regular'} cleanup...`);
  
  // 清理日志（如果太大）
  try {
    const logStats = fs.statSync(gameLogFile);
    const logSizeMB = logStats.size / 1024 / 1024;
    if (logSizeMB > 10) { // 日志超过 10MB
      console.log(`[Memory] Trimming log file (${logSizeMB.toFixed(2)}MB)`);
      // 保留最后 1000 行
      const content = fs.readFileSync(gameLogFile, 'utf8');
      const lines = content.split('\n');
      if (lines.length > 1000) {
        fs.writeFileSync(gameLogFile, lines.slice(-1000).join('\n'));
      }
    }
  } catch (e) {
    // 忽略错误
  }
  
  // 通知渲染进程清理内存
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('memory-cleanup', { aggressive });
  }
  
  // 手动触发垃圾回收（如果可用）
  if (global.gc) {
    console.log('[Memory] Triggering manual garbage collection');
    global.gc();
  }
  
  memoryStats.cleanupCount++;
  console.log(`[Memory] Cleanup #${memoryStats.cleanupCount} completed`);
  
  // 记录清理后的内存
  setTimeout(() => {
    const usage = logMemoryUsage('After cleanup');
    console.log(`[Memory] Peak memory: ${memoryStats.peakMemory}MB, Cleanup count: ${memoryStats.cleanupCount}`);
  }, 1000);
}

/**
 * 启动内存监控
 */
function startMemoryMonitor() {
  // 定期检查内存
  setInterval(() => {
    checkAndCleanMemory();
  }, MEMORY_CONFIG.memoryCheckInterval);
  
  // 定期清理缓存
  setInterval(() => {
    performMemoryCleanup(false);
  }, MEMORY_CONFIG.cacheCleanupInterval);
  
  console.log('[Memory] Monitor started');
}

/**
 * 配置 V8 引擎参数
 */
function configureV8Engine() {
  const v8 = require('v8');
  
  // 设置 V8 标志
  PERFORMANCE_CONFIG.v8Flags.forEach(flag => {
    try {
      v8.setFlagsFromString(flag);
    } catch (e) {
      console.warn(`[Performance] Failed to set V8 flag: ${flag}`);
    }
  });
  
  console.log('[Performance] V8 engine configured');
}

/**
 * 配置 Electron 性能参数
 */
function configureElectronPerformance() {
  const { app } = require('electron');
  
  // 硬件加速
  if (!PERFORMANCE_CONFIG.hardwareAcceleration) {
    app.disableHardwareAcceleration();
    console.log('[Performance] Hardware acceleration disabled');
  }
  
  // GPU 进程配置
  app.commandLine.appendSwitch('js-flags', `--max-old-space-size=${PERFORMANCE_CONFIG.maxHeapSize}`);
  
  // GPU 内存限制
  app.commandLine.appendSwitch('gpu-rasterization-msaa-sample-count', '4');
  
  // 渲染进程 GPU 内存限制
  app.commandLine.appendSwitch('renderer-process-limit', '1');
  
  // 禁用不必要的功能以节省内存
  app.commandLine.appendSwitch('disable-features', 'MediaRouter,HardwareMediaKeyHandling');
  
  // 启用 GPU 加速
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  
  // 忽略 GPU 黑名单
  app.commandLine.appendSwitch('ignore-gpu-blacklist');
  
  // 设置 GPU 内存限制
  if (PERFORMANCE_CONFIG.gpuMemoryLimit) {
    app.commandLine.appendSwitch('gpu-memory-limit', PERFORMANCE_CONFIG.gpuMemoryLimit.toString());
  }
  
  console.log('[Performance] Electron performance configured');
}

/**
 * 获取性能统计信息
 */
function getPerformanceStats() {
  const usage = getMemoryUsage();
  const v8 = require('v8');
  const heapStats = v8.getHeapStatistics();
  
  return {
    memory: {
      ...usage,
      peak: memoryStats.peakMemory,
    },
    heap: {
      totalHeapSize: Math.round(heapStats.total_heap_size / 1024 / 1024),
      totalHeapSizeExecutable: Math.round(heapStats.total_heap_size_executable / 1024 / 1024),
      totalPhysicalSize: Math.round(heapStats.total_physical_size / 1024 / 1024),
      totalAvailableSize: Math.round(heapStats.total_available_size / 1024 / 1024),
      usedHeapSize: Math.round(heapStats.used_heap_size / 1024 / 1024),
      heapSizeLimit: Math.round(heapStats.heap_size_limit / 1024 / 1024),
      mallocatedMemory: Math.round(heapStats.malloced_memory / 1024 / 1024),
      peakMallocatedMemory: Math.round(heapStats.peak_malloced_memory / 1024 / 1024),
    },
    stats: {
      cleanupCount: memoryStats.cleanupCount,
      lastCheck: memoryStats.lastCheck,
    },
  };
}

/**
 * IPC: 获取内存使用情况
 */
ipcMain.handle('get-memory-usage', () => {
  return getMemoryUsage();
});

/**
 * IPC: 获取性能统计
 */
ipcMain.handle('get-performance-stats', () => {
  return getPerformanceStats();
});

/**
 * IPC: 手动触发内存清理
 */
ipcMain.handle('trigger-memory-cleanup', (event, aggressive = false) => {
  performMemoryCleanup(aggressive);
  return { success: true };
});

// 初始化性能配置
configureV8Engine();
configureElectronPerformance();

// ==================== TTS 服务管理 ====================
let ttsProcess = null;
const TTS_SERVER_PATH = path.join(__dirname, 'AstraTTS', 'astra-server.exe');
const TTS_PORT = 5000;

// 启动 TTS 服务
function startTTSService() {
  if (ttsProcess) {
    console.log('[TTS] Service already running');
    return true;
  }
  
  if (!fs.existsSync(TTS_SERVER_PATH)) {
    console.error('[TTS] Server not found:', TTS_SERVER_PATH);
    console.error('[TTS] Please put astra-server.exe in AstraTTS folder');
    return false;
  }
  
  try {
    console.log('[TTS] Starting server:', TTS_SERVER_PATH);
    
    ttsProcess = spawn(TTS_SERVER_PATH, [], {
      cwd: path.dirname(TTS_SERVER_PATH),
      windowsHide: true,
      detached: false
    });
    
    ttsProcess.stdout.on('data', (data) => {
      console.log(`[TTS Server] ${data.toString().trim()}`);
    });
    
    ttsProcess.stderr.on('data', (data) => {
      console.error(`[TTS Server Error] ${data.toString().trim()}`);
    });
    
    ttsProcess.on('close', (code) => {
      console.log(`[TTS] Server exited with code ${code}`);
      ttsProcess = null;
    });
    
    ttsProcess.on('error', (err) => {
      console.error('[TTS] Failed to start server:', err);
      ttsProcess = null;
    });
    
    console.log('[TTS] Server started on port', TTS_PORT);
    return true;
  } catch (e) {
    console.error('[TTS] Failed to start server:', e);
    return false;
  }
}

// 停止 TTS 服务
function stopTTSService() {
  if (ttsProcess) {
    console.log('[TTS] Stopping server...');
    ttsProcess.kill();
    ttsProcess = null;
  }
}

// 检查 TTS 服务是否运行
function isTTSServiceRunning() {
  return ttsProcess !== null;
}

// 检查 TTS 服务是否存在
function checkTTSExists() {
  return fs.existsSync(TTS_SERVER_PATH);
}

let mainWindow;

// ==================== Windows 焦点修复 ====================
const isWindows = process.platform === 'win32';
let needsFocusFix = false;
let triggeringProgrammaticBlur = false;

// 强制聚焦窗口（终极方案）
function forceFocusWindow(win) {
  if (process.platform !== 'win32') {
    win.show();
    win.focus();
    win.webContents.focus();
    return;
  }

  // 模拟手动最小化再恢复，强制Windows重新分配前台权限
  if (win.isMinimized()) win.restore();
  win.minimize();
  win.restore();

  // 全链路强制同步焦点
  win.setAlwaysOnTop(true);
  win.show();
  win.focus();
  win.webContents.focus();
  win.setAlwaysOnTop(false);

  // 兜底延迟聚焦，确保异步操作完成
  setTimeout(() => {
    win.focus();
    win.webContents.focus();
  }, 50);
}

function createWindow() {
  console.log('[Main] Creating window...');
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#fff5f7',
    // ========== 焦点核心配置 ==========
    focusable: true,           // 必须显式开启
    skipTaskbar: false,        // 绝对不要开启
    alwaysOnTop: false,        // 非必要不要开启
    fullscreen: false,
    fullscreenable: true,
    show: false,               // 先不显示，等页面就绪再展示
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,  // 关闭后台节流
      webSecurity: false             // 允许加载本地文件（Live2D 模型需要）
    },
    icon: path.join(__dirname, 'assets', 'icon.png')
  });

  // ========== Windows 焦点修复事件监听 ==========
  // 监听窗口失焦，标记需要修复
  mainWindow.on('blur', () => {
    if (!triggeringProgrammaticBlur) {
      needsFocusFix = true;
    }
  });

  // 监听窗口聚焦，自动修复焦点链路
  mainWindow.on('focus', () => {
    if (isWindows && needsFocusFix) {
      needsFocusFix = false;
      triggeringProgrammaticBlur = true;
      // 模拟手动切出切回的焦点重置逻辑
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.blur();
          mainWindow.focus();
          mainWindow.webContents.focus();
          setTimeout(() => {
            triggeringProgrammaticBlur = false;
          }, 100);
        }
      }, 100);
    } else {
      // 正常聚焦时，强制同步渲染进程焦点
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.focus();
      }
    }
  });

  console.log('[Main] Opening DevTools...');
  mainWindow.webContents.openDevTools();

  const loadingPath = path.join(__dirname, 'pages', 'loading', 'index.html');
  console.log('[Main] Loading page:', loadingPath);
  console.log('[Main] File exists:', fs.existsSync(loadingPath));
  
  mainWindow.loadFile(loadingPath).then(() => {
    console.log('[Main] Loading page loaded successfully');
  }).catch((error) => {
    console.error('[Main] Failed to load page:', error);
  });

  // 关键：等窗口完全就绪再显示+聚焦
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // 先激活窗口，再聚焦渲染进程，顺序不能反
    mainWindow.focus();
    mainWindow.webContents.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 窗口控制
ipcMain.on('window-minimize', () => {
  console.log('[Main] Minimize window');
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  console.log('[Main] Maximize window');
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  console.log('[Main] Close window');
  mainWindow?.close();
});

// 强制聚焦 IPC（渲染进程可调用）
ipcMain.handle('force-focus', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    forceFocusWindow(mainWindow);
  }
});

// 显示弹窗后恢复焦点
ipcMain.handle('show-alert', async (event, message) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'info',
    message: message,
    buttons: ['确定']
  });
  
  // 弹窗关闭后，强制恢复焦点
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    mainWindow.webContents.focus();
  }
  
  return result;
});

// 页面导航
ipcMain.on('navigate-to', (event, page) => {
  console.log('[Main] Navigate to:', page);
  const pagePath = path.join(__dirname, 'pages', page, 'index.html');
  console.log('[Main] Page path:', pagePath);
  console.log('[Main] Page exists:', fs.existsSync(pagePath));
  mainWindow?.loadFile(pagePath);
});

// ==================== Live2D 模型管理 ====================

function getLive2DModelsDir() {
  const userDataPath = app.getPath('userData');
  const modelsDir = path.join(userDataPath, 'live2d_models');
  
  if (!fs.existsSync(modelsDir)) {
    fs.mkdirSync(modelsDir, { recursive: true });
  }
  
  return modelsDir;
}

ipcMain.handle('live2d-select-model', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 Live2D 模型（文件夹或 .model3.json 文件）',
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: 'Live2D 模型配置', extensions: ['model3.json', 'model.json', 'json'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });
    
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    
    const selectedPath = result.filePaths[0];
    console.log('[Live2D] Selected path:', selectedPath);
    
    // 检查是文件还是文件夹
    const stats = fs.statSync(selectedPath);
    
    if (stats.isFile()) {
      // 如果选择的是文件，返回该文件所在的文件夹路径
      const modelDir = path.dirname(selectedPath);
      const fileName = path.basename(selectedPath);
      
      // 检查是否是模型配置文件
      if (fileName.endsWith('.model3.json') || fileName.endsWith('.model.json') || fileName.endsWith('.json')) {
        console.log('[Live2D] Selected model config file:', fileName);
        // 返回文件夹路径，但标记选择的文件
        return { modelDir, selectedFile: fileName };
      } else {
        // 不是模型文件，返回文件夹
        return { modelDir: modelDir, selectedFile: null };
      }
    } else {
      // 选择的是文件夹
      return { modelDir: selectedPath, selectedFile: null };
    }
  } catch (error) {
    console.error('[Live2D] Select model error:', error);
    return null;
  }
});

// Live2D 模型配置文件格式支持
// 支持: .model3.json (Cubism 3/4), .model.json (Cubium 2), model.json, model3.json
function findModelConfigFile(modelPath) {
  console.log('[Live2D] Searching for model config in:', modelPath);
  
  if (!fs.existsSync(modelPath)) {
    console.error('[Live2D] Model path does not exist:', modelPath);
    return null;
  }
  
  let files;
  try {
    files = fs.readdirSync(modelPath);
    console.log('[Live2D] Files in model directory:', files);
  } catch (e) {
    console.error('[Live2D] Failed to read directory:', e.message);
    return null;
  }
  
  // 优先级 1: xxx.model3.json (Cubism 3/4)
  const model3File = files.find(f => f.endsWith('.model3.json'));
  if (model3File) {
    console.log('[Live2D] Found Cubism 3/4 model:', model3File);
    return path.join(modelPath, model3File);
  }
  
  // 优先级 2: xxx.model.json (Cubism 2)
  const modelFile = files.find(f => f.endsWith('.model.json') && !f.endsWith('.model3.json'));
  if (modelFile) {
    console.log('[Live2D] Found Cubism 2 model:', modelFile);
    return path.join(modelPath, modelFile);
  }
  
  // 优先级 3: model3.json
  if (files.includes('model3.json')) {
    console.log('[Live2D] Found model3.json');
    return path.join(modelPath, 'model3.json');
  }
  
  // 优先级 4: model.json
  if (files.includes('model.json')) {
    console.log('[Live2D] Found model.json');
    return path.join(modelPath, 'model.json');
  }
  
  // 优先级 5: 查找任何可能的模型配置文件
  const jsonFiles = files.filter(f => {
    const lower = f.toLowerCase();
    return lower.endsWith('.json') && 
           !lower.includes('motion') && 
           !lower.includes('expr') &&
           !lower.includes('expression') &&
           !lower.includes('pose');
  });
  
  console.log('[Live2D] JSON files found:', jsonFiles);
  
  if (jsonFiles.length > 0) {
    // 尝试找到最可能是模型配置的文件
    for (const f of jsonFiles) {
      try {
        const fullPath = path.join(modelPath, f);
        const content = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
        console.log('[Live2D] Checking JSON file:', f, 'Keys:', Object.keys(content));
        
        // 检查是否包含模型配置的关键字段
        // Cubism 3/4 格式
        if (content.FileReferences) {
          console.log('[Live2D] Found Cubism 3/4 model config:', f);
          return fullPath;
        }
        
        // Cubism 2 格式
        if (content.model || content.textures || content.moc) {
          console.log('[Live2D] Found Cubism 2 model config:', f);
          return fullPath;
        }
        
        // 可能是 .moc3 文件列表
        if (content.FileReferences && content.FileReferences.Moc) {
          console.log('[Live2D] Found model with Moc reference:', f);
          return fullPath;
        }
      } catch (e) {
        console.log('[Live2D] Failed to parse JSON file:', f, e.message);
      }
    }
  }
  
  // 优先级 6: 如果没有找到 JSON 配置文件，尝试查找 .moc3 或 .moc 文件
  // 这种情况下需要动态生成配置
  const moc3Files = files.filter(f => f.endsWith('.moc3'));
  const mocFiles = files.filter(f => f.endsWith('.moc') && !f.endsWith('.moc3'));
  
  if (moc3Files.length > 0 || mocFiles.length > 0) {
    console.log('[Live2D] Found .moc3/.moc files, generating config...');
    // 生成一个简单的配置文件
    const generatedConfig = generateModelConfig(modelPath, files, moc3Files, mocFiles);
    if (generatedConfig) {
      return generatedConfig;
    }
  }
  
  console.error('[Live2D] No valid model config found in:', modelPath);
  console.error('[Live2D] Available files:', files);
  return null;
}

/**
 * 动态生成模型配置文件
 */
function generateModelConfig(modelPath, files, moc3Files, mocFiles) {
  try {
    const isCubism3 = moc3Files.length > 0;
    const mocFile = isCubism3 ? moc3Files[0] : mocFiles[0];
    
    // 查找纹理文件
    const textureFiles = files.filter(f => {
      const lower = f.toLowerCase();
      return (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.webp'));
    });
    
    if (isCubism3) {
      // Cubism 3/4 格式
      const config = {
        Version: 3,
        FileReferences: {
          Moc: mocFile,
          Textures: textureFiles.slice(0, 1) // 通常只需要第一个纹理
        }
      };
      
      // 写入临时配置文件
      const configPath = path.join(modelPath, '_generated.model3.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('[Live2D] Generated Cubism 3 config:', configPath);
      return configPath;
    } else {
      // Cubism 2 格式
      const config = {
        model: mocFile,
        textures: textureFiles.slice(0, 1)
      };
      
      // 写入临时配置文件
      const configPath = path.join(modelPath, '_generated.model.json');
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log('[Live2D] Generated Cubism 2 config:', configPath);
      return configPath;
    }
  } catch (e) {
    console.error('[Live2D] Failed to generate config:', e);
    return null;
  }
}

ipcMain.handle('live2d-load-model', async (event, modelPathOrObj) => {
  try {
    // 支持传入字符串路径或对象 { modelDir, selectedFile }
    let modelPath, selectedFile;
    
    if (typeof modelPathOrObj === 'string') {
      modelPath = modelPathOrObj;
    } else if (modelPathOrObj && modelPathOrObj.modelDir) {
      modelPath = modelPathOrObj.modelDir;
      selectedFile = modelPathOrObj.selectedFile;
    } else {
      console.error('[Live2D] Invalid model path:', modelPathOrObj);
      return null;
    }
    
    console.log('[Live2D] Received load model request for:', modelPath, 'Selected file:', selectedFile);
    
    // 检查路径是否存在
    if (!fs.existsSync(modelPath)) {
      console.error('[Live2D] Model path does not exist:', modelPath);
      return null;
    }
    
    // 确保 HTTP 服务器已启动
    if (!live2dServerPort) {
      console.log('[Live2D] Starting HTTP server...');
      try {
        await startLive2DServer();
        console.log('[Live2D] HTTP server started on port:', live2dServerPort);
      } catch (serverError) {
        console.error('[Live2D] Failed to start HTTP server:', serverError);
        return null;
      }
    }
    
    // 获取模型信息（使用零依赖原生服务器）
    const modelInfo = getLive2DModelInfo(modelPath, selectedFile);
    
    // 读取模型配置文件内容
    const modelFile = path.join(modelPath, modelInfo._modelFile);
    const modelData = JSON.parse(fs.readFileSync(modelFile, 'utf-8'));
    
    // 合并模型信息和配置
    const result = {
      ...modelData,
      ...modelInfo  // 覆盖内部标记字段
    };
    
    console.log('[Live2D] Model HTTP URL:', result._modelJsonUrl);
    console.log('[Live2D] Model config loaded successfully, type:', result._modelType);
    
    return result;
  } catch (error) {
    console.error('[Live2D] Load model error:', error);
    return null;
  }
});

ipcMain.handle('live2d-load-texture', async (event, modelPath, texPath) => {
  try {
    // texPath 可能包含子目录，需要正确拼接
    const texFile = path.join(modelPath, texPath);
    
    if (!fs.existsSync(texFile)) {
      console.error('[Live2D] Texture not found:', texFile);
      return null;
    }
    
    const buffer = fs.readFileSync(texFile);
    // 返回 ArrayBuffer 而不是 Node.js Buffer
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  } catch (error) {
    console.error('[Live2D] Load texture error:', error);
    return null;
  }
});

// 获取 Live2D HTTP 服务器状态
ipcMain.handle('live2d-get-server-status', async () => {
  return {
    running: live2dServer !== null,
    port: live2dServerPort
  };
});

ipcMain.handle('live2d-get-model-list', async () => {
  try {
    const modelsDir = getLive2DModelsDir();
    const entries = fs.readdirSync(modelsDir, { withFileTypes: true });
    
    const list = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const modelPath = path.join(modelsDir, entry.name);
        const modelFile = findModelConfigFile(modelPath);
        
        if (modelFile) {
          try {
            const modelData = JSON.parse(fs.readFileSync(modelFile, 'utf-8'));
            list.push({
              path: modelPath,
              name: modelData.name || modelData.ModelName || entry.name,
              type: modelFile.endsWith('.model3.json') || modelFile.endsWith('model3.json') 
                ? 'cubism3' : 'cubism2',
              updatedAt: fs.statSync(modelPath).mtime.toISOString()
            });
          } catch (e) {
            console.warn('[Live2D] Invalid model:', entry.name);
          }
        }
      }
    }
    
    return list;
  } catch (error) {
    console.error('[Live2D] Get model list error:', error);
    return [];
  }
});

ipcMain.on('live2d-delete-model', (event, modelPath) => {
  try {
    const modelsDir = getLive2DModelsDir();
    
    // 规范化路径比较（处理不同平台的路径分隔符）
    const normalizedPath = path.normalize(modelPath);
    const normalizedModelsDir = path.normalize(modelsDir);
    
    if (!normalizedPath.startsWith(normalizedModelsDir)) {
      console.error('[Live2D] Invalid delete path:', modelPath, '(expected in:', modelsDir, ')');
      return;
    }
    
    if (fs.existsSync(modelPath)) {
      fs.rmSync(modelPath, { recursive: true, force: true });
      console.log('[Live2D] Model deleted:', modelPath);
    } else {
      console.log('[Live2D] Model path not found (already deleted?):', modelPath);
    }
  } catch (error) {
    console.error('[Live2D] Delete model error:', error);
  }
});

ipcMain.handle('live2d-import-model', async (event, sourcePath) => {
  try {
    const modelsDir = getLive2DModelsDir();
    
    const sourceName = path.basename(sourcePath);
    
    let targetPath = path.join(modelsDir, sourceName);
    let counter = 1;
    
    while (fs.existsSync(targetPath)) {
      targetPath = path.join(modelsDir, `${sourceName}_${counter}`);
      counter++;
    }
    
    await copyDirectory(sourcePath, targetPath);
    
    console.log('[Live2D] Model imported to:', targetPath);
    return targetPath;
  } catch (error) {
    console.error('[Live2D] Import model error:', error);
    return null;
  }
});

function copyDirectory(src, dest) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(dest, { recursive: true });
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
    
    resolve();
  });
}

function copyDirRecursive(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ==================== 角色文件管理 ====================

// 角色文件路径 - 统一使用 assets/role/jntm.json
const ROLE_FILE_PATH = path.join(__dirname, 'assets', 'role', 'jntm.json');

// 加载角色文件
ipcMain.handle('role:load-file', async (event, roleId, fileName) => {
  try {
    console.log('[Role] Loading file:', ROLE_FILE_PATH);
    
    if (!fs.existsSync(ROLE_FILE_PATH)) {
      console.log('[Role] File not found:', ROLE_FILE_PATH);
      return null;
    }
    
    const content = fs.readFileSync(ROLE_FILE_PATH, 'utf-8');
    const data = JSON.parse(content);
    
    // 如果请求的是 index.json，返回角色基础信息
    if (fileName === 'index.json') {
      return {
        roleId: data.roleId,
        roleName: data.roleName,
        roleNameEn: data.roleNameEn,
        data: data.data,
        basicInfo: data.basicInfo,
        appearance: data.appearance,
        likes: data.likes,
        dislikes: data.dislikes,
        stages: data.stages,
        defaultStage: data.defaultStage
      };
    }
    
    // 如果请求的是阶段文件，返回对应阶段的人设
    const stageId = fileName.replace('.json', '');
    if (data.stages && data.stages[stageId]) {
      return data.stages[stageId];
    }
    
    // 返回完整数据
    return data;
  } catch (error) {
    console.error('[Role] Load file error:', error);
    return null;
  }
});

// 保存角色文件
ipcMain.handle('role:save-file', async (event, roleId, fileName, data) => {
  try {
    // 确保目录存在
    const roleDir = path.dirname(ROLE_FILE_PATH);
    if (!fs.existsSync(roleDir)) {
      fs.mkdirSync(roleDir, { recursive: true });
    }
    
    // 读取现有数据
    let existingData = {};
    if (fs.existsSync(ROLE_FILE_PATH)) {
      const content = fs.readFileSync(ROLE_FILE_PATH, 'utf-8');
      existingData = JSON.parse(content);
    }
    
    // 如果保存的是 index.json，更新基础信息
    if (fileName === 'index.json') {
      existingData.roleId = data.roleId || existingData.roleId;
      existingData.roleName = data.roleName || existingData.roleName;
      existingData.basicInfo = data.basicInfo || existingData.basicInfo;
      existingData.data = data.data || existingData.data;
    }
    // 如果保存的是阶段文件，更新对应阶段
    else {
      const stageId = fileName.replace('.json', '');
      if (!existingData.stages) {
        existingData.stages = {};
      }
      existingData.stages[stageId] = data;
    }
    
    fs.writeFileSync(ROLE_FILE_PATH, JSON.stringify(existingData, null, 2), 'utf-8');
    console.log('[Role] File saved:', ROLE_FILE_PATH);
    return true;
  } catch (error) {
    console.error('[Role] Save file error:', error);
    return false;
  }
});

// 加载完整角色数据（新API）
ipcMain.handle('role:load-full', async () => {
  try {
    console.log('[Role] Loading full data:', ROLE_FILE_PATH);
    
    if (!fs.existsSync(ROLE_FILE_PATH)) {
      console.log('[Role] File not found:', ROLE_FILE_PATH);
      return null;
    }
    
    const content = fs.readFileSync(ROLE_FILE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[Role] Load full data error:', error);
    return null;
  }
});

// 保存完整角色数据（新API）
ipcMain.handle('role:save-full', async (event, data) => {
  try {
    const roleDir = path.dirname(ROLE_FILE_PATH);
    if (!fs.existsSync(roleDir)) {
      fs.mkdirSync(roleDir, { recursive: true });
    }
    
    fs.writeFileSync(ROLE_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[Role] Full data saved:', ROLE_FILE_PATH);
    
    // 保存后恢复焦点
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.focus();
      mainWindow.webContents.focus();
    }
    
    return true;
  } catch (error) {
    console.error('[Role] Save full data error:', error);
    return false;
  }
});

// ==================== 游戏日志 IPC ====================

// 清空日志
ipcMain.handle('gamelog:clear', async () => {
  clearGameLog();
  return true;
});

// 写入日志
ipcMain.handle('gamelog:write', async (event, level, category, message, data) => {
  writeGameLog(level, category, message, data);
  return true;
});

// 读取日志
ipcMain.handle('gamelog:read', async () => {
  try {
    if (fs.existsSync(gameLogFile)) {
      return fs.readFileSync(gameLogFile, 'utf8');
    }
    return '';
  } catch (e) {
    console.error('[GameLog] Failed to read log:', e);
    return '';
  }
});

// ==================== TTS 服务 IPC ====================

// 启动 TTS 服务
ipcMain.handle('tts:start', async () => {
  // 先检查服务是否存在
  if (!checkTTSExists()) {
    return { 
      success: false, 
      error: 'AstraTTS 服务不存在',
      path: TTS_SERVER_PATH
    };
  }
  
  const success = startTTSService();
  return { success, port: TTS_PORT };
});

// 停止 TTS 服务
ipcMain.handle('tts:stop', async () => {
  stopTTSService();
  return { success: true };
});

// 检查 TTS 服务状态
ipcMain.handle('tts:status', async () => {
  return { 
    running: isTTSServiceRunning(), 
    exists: checkTTSExists(),
    port: TTS_PORT,
    path: TTS_SERVER_PATH
  };
});

// ==================== 记忆文件 IPC ====================

const MEMO_FILE_PATH = path.join(__dirname, 'assets', 'src', 'memo', 'memo.json');

// 加载记忆文件
ipcMain.handle('memo:load', async () => {
  try {
    console.log('[Memo] Loading file:', MEMO_FILE_PATH);
    
    if (!fs.existsSync(MEMO_FILE_PATH)) {
      // 创建默认文件
      const defaultData = {
        version: '1.0',
        roleId: 'jntm',
        memories: [],
        metadata: {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          totalCount: 0
        }
      };
      
      // 确保目录存在
      const memoDir = path.dirname(MEMO_FILE_PATH);
      if (!fs.existsSync(memoDir)) {
        fs.mkdirSync(memoDir, { recursive: true });
      }
      
      fs.writeFileSync(MEMO_FILE_PATH, JSON.stringify(defaultData, null, 2), 'utf-8');
      console.log('[Memo] Created default file');
      return defaultData;
    }
    
    const content = fs.readFileSync(MEMO_FILE_PATH, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error('[Memo] Load error:', error);
    return null;
  }
});

// 保存记忆文件
ipcMain.handle('memo:save', async (event, data) => {
  try {
    // 确保目录存在
    const memoDir = path.dirname(MEMO_FILE_PATH);
    if (!fs.existsSync(memoDir)) {
      fs.mkdirSync(memoDir, { recursive: true });
    }
    
    fs.writeFileSync(MEMO_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
    console.log('[Memo] File saved:', MEMO_FILE_PATH);
    return true;
  } catch (error) {
    console.error('[Memo] Save error:', error);
    return false;
  }
});

// ==================== Live2D 自定义协议 ====================
// 必须在 app ready 之前注册协议方案
function registerLive2DScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'live2d',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        bypassCSP: true
      }
    }
  ]);
  console.log('[Live2D Protocol] Scheme registered');
}

// 在 app ready 后注册协议处理器
function registerLive2DProtocolHandler() {
  // 检查是否支持 protocol.handle (Electron 23+)
  if (typeof protocol.handle === 'function') {
    protocol.handle('live2d', async (request) => {
      try {
        let url = request.url;
        console.log('[Live2D Protocol] Request URL:', url);
        
        // 移除 'live2d://' 前缀
        if (url.startsWith('live2d://')) {
          url = url.substring(9);
        }
        
        // 移除可能的前导斜杠（来自 live2d:///path 格式）
        // live2d:///C%3A/Users/... -> C%3A/Users/...
        while (url.startsWith('/')) {
          url = url.substring(1);
        }
        
        // 解码 URL（处理中文、空格和特殊编码）
        let filePath = decodeURIComponent(url);
        
        // 在 Windows 上，确保路径格式正确
        if (process.platform === 'win32') {
          // 路径可能是 C:/Users/... (已解码) 或 C%3A/Users/... (冒号已编码)
          // 检查是否缺少冒号（URL 解析可能把 C: 变成了 C）
          const driveLetterMatch = filePath.match(/^([a-zA-Z])\/(.*)$/);
          if (driveLetterMatch && !filePath.match(/^[a-zA-Z]:/)) {
            // 缺少冒号，添加冒号
            filePath = `${driveLetterMatch[1].toUpperCase()}:/${driveLetterMatch[2]}`;
          }
          // 转换 / 为 \
          filePath = filePath.replace(/\//g, '\\');
        }
        
        console.log('[Live2D Protocol] Resolved file path:', filePath);
        
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
          console.error('[Live2D Protocol] File not found:', filePath);
          return new Response('File not found', { status: 404 });
        }
        
        // 读取文件并返回
        const buffer = fs.readFileSync(filePath);
        const ext = path.extname(filePath).toLowerCase();
        
        // 根据扩展名设置 MIME 类型
        const mimeTypes = {
          '.json': 'application/json',
          '.moc': 'application/octet-stream',
          '.moc3': 'application/octet-stream',
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.webp': 'image/webp',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav'
        };
        
        const mimeType = mimeTypes[ext] || 'application/octet-stream';
        
        console.log('[Live2D Protocol] Serving file:', filePath, 'MIME:', mimeType);
        
        return new Response(buffer, {
          headers: {
            'Content-Type': mimeType,
            'Access-Control-Allow-Origin': '*'
          }
        });
        
      } catch (error) {
        console.error('[Live2D Protocol] Error:', error);
        return new Response('Internal error', { status: 500 });
      }
    });
  } else {
    // 回退到旧版 API
    protocol.registerFileProtocol('live2d', (request, callback) => {
      try {
        let url = request.url;
        console.log('[Live2D Protocol] Request URL (legacy):', url);
        
        if (url.startsWith('live2d://')) {
          url = url.substring(9);
        }
        
        // 移除可能的前导斜杠
        while (url.startsWith('/')) {
          url = url.substring(1);
        }
        
        let filePath = decodeURIComponent(url);
        
        if (process.platform === 'win32') {
          const driveLetterMatch = filePath.match(/^([a-zA-Z])\/(.*)$/);
          if (driveLetterMatch && !filePath.match(/^[a-zA-Z]:/)) {
            filePath = `${driveLetterMatch[1].toUpperCase()}:/${driveLetterMatch[2]}`;
          }
          filePath = filePath.replace(/\//g, '\\');
        }
        
        console.log('[Live2D Protocol] Resolved file path:', filePath);
        callback(filePath);
        
      } catch (error) {
        console.error('[Live2D Protocol] Error:', error);
        callback({ error: -2 });
      }
    });
  }
  console.log('[Live2D Protocol] Handler registered');
}

// 在 app ready 之前注册协议方案
registerLive2DScheme();

// 应用启动
app.whenReady().then(async () => {
  console.log('[Main] App ready, creating window...');
  
  // 注册 Live2D 协议处理器
  registerLive2DProtocolHandler();
  
  // 启动 Live2D HTTP 服务器
  try {
    await startLive2DServer();
    console.log('[Main] Live2D HTTP server started on port:', live2dServerPort);
  } catch (err) {
    console.error('[Main] Failed to start Live2D HTTP server:', err);
  }
  
  createWindow();
  
  // 启动内存监控
  startMemoryMonitor();
  
  // 记录初始内存
  logMemoryUsage('Initial');

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  console.log('[Main] All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('[Main] App quitting...');
  
  // 记录最终内存统计
  const stats = getPerformanceStats();
  console.log('[Memory] Final stats:', JSON.stringify(stats, null, 2));
  
  // 停止 TTS 服务
  stopTTSService();
});

console.log('[Main] Script loaded, waiting for app ready...');
