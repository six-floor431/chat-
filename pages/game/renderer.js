/**
 * 游戏页面渲染进程
 * 与核心模块集成
 */

import { getChatManager } from '../../assets/src/js/chat.js';
import { getCharacterSettingManager } from '../../assets/src/js/characterSetting.js';
import { getWorldviewManager } from '../../assets/src/js/worldview.js';
import { getMemoryManager } from '../../assets/src/memo/memory.js';
import { getSaveManager } from '../../assets/src/js/save.js';
import { getConfig, saveConfig } from '../../assets/src/js/config.js';
import { getLoadingManager } from '../../assets/src/js/loadingManager.js';
import gameLog, { LOG_CATEGORIES } from '../../assets/src/js/gameLog.js';
import { getTTSManager } from '../../assets/tts/index.js';
import { getLive2DManager } from '../../assets/live2d/index.js';

// 模块实例
let chatManager = null;
let characterManager = null;
let worldviewManager = null;
let memoryManager = null;
let saveManager = null;
let loadingManager = null;
let ttsManager = null;
let live2DManager = null;

// UI 状态
let isProcessing = false;
let chatPanelVisible = false;

// Live2D 状态（用于图片模式）
let live2DRenderer = null;
let live2DFollow = null;
let live2DModel = null;
let live2DAnimationId = null;
let mouseX = 0;
let mouseY = 0;
let targetX = 0;
let targetY = 0;

// ==================== 初始化 ====================

async function init() {
  // 显示加载界面
  showLoading('正在初始化游戏环境...');
  updateLoading(10, '正在初始化游戏环境...');

  // 清空并初始化日志
  await gameLog.clear();
  gameLog.info(LOG_CATEGORIES.SYSTEM, '游戏页面初始化开始');

  updateLoading(20, '正在加载模块...');

  // 获取模块实例
  chatManager = getChatManager();
  characterManager = getCharacterSettingManager();
  worldviewManager = getWorldviewManager();
  memoryManager = getMemoryManager();
  saveManager = getSaveManager();
  loadingManager = getLoadingManager();

  // 暴露到全局，供开发者工具使用
  window.gameCharacterManager = characterManager;
  window.gameChatManager = chatManager;
  window.gameMemoryManager = memoryManager;

  // 初始化各模块
  await characterManager.init();
  await worldviewManager.init();
  await memoryManager.init();

  gameLog.info(LOG_CATEGORIES.SYSTEM, '核心模块初始化完成');

  updateLoading(35, '正在检测深度思考支持...');

  // 检测模型是否支持深度思考
  try {
    // 动态导入检测模块（避免影响页面加载速度）
    const deepThinkingDetectorModule = await import('../../assets/src/js/deepThinkingDetector.js');
    const supports = await deepThinkingDetectorModule.autoDetectAndConfigureDeepThinking();
    gameLog.info(LOG_CATEGORIES.SYSTEM, '深度思考支持检测完成', { supports });
  } catch (error) {
    console.error('[Game] 深度思考检测失败:', error);
    gameLog.warn(LOG_CATEGORIES.SYSTEM, '深度思考检测失败，将使用默认配置');
    // 检测失败时，默认不支持深度思考
    const { setConfig } = await import('../../assets/src/js/config.js');
    setConfig({ supportsDeepThinking: false });
  }

  updateLoading(40, '正在初始化 TTS 服务...');

  // 初始化 TTS（检查配置开关）
  ttsManager = getTTSManager();
  await ttsManager.init();
  gameLog.info(LOG_CATEGORIES.SYSTEM, 'TTS 初始化完成', { enabled: ttsManager.isEnabled, configEnabled: ttsManager.config.enabled });

  // 如果配置中关闭了 TTS，则不启动服务
  const gameConfig = JSON.parse(localStorage.getItem('aiGameConfig') || '{}');
  if (!gameConfig.tts) {
    console.log('[Game] TTS 已关闭，跳过服务启动');
    gameLog.info(LOG_CATEGORIES.SYSTEM, 'TTS 已关闭');
  } else {
    // 连接 TTS 和 Live2D 口型同步
    setupTTSLive2DSync();

    // 检查 TTS 服务状态
    if (window.electronAPI && window.electronAPI.tts) {
      const status = await window.electronAPI.tts.status();
      if (!status.exists) {
        console.warn('[TTS] AstraTTS 服务不存在，请将 astra-server.exe 放到 AstraTTS 文件夹');
      }
    }
  }

  updateLoading(50, '正在加载角色数据...');

  // 清空聊天历史（每次进入游戏都重新开始）
  memoryManager.clearHistory();
  memoryManager.clearSessionMessages();
  gameLog.info(LOG_CATEGORIES.MEMORY, '清空聊天历史和会话消息');

  // 加载角色信息
  await loadCharacterInfo();
  gameLog.info(LOG_CATEGORIES.SYSTEM, '角色信息加载完成');

  // 显示欢迎消息（不加载历史）
  showWelcomeMessage();

  // 加载音量设置
  loadVolumeSettings();

  updateLoading(70, '正在加载角色模型...');

  // 初始化角色模型（Live2D 或图片）
  const live2dSuccess = await initLive2D();

  if (!live2dSuccess) {
    updateLoading(100, '⚠️ 模型加载失败，将进入无模型模式');
    gameLog.warn(LOG_CATEGORIES.LIVE2D, '模型加载失败，进入无模型模式');
    console.log('[Game] ⚠️ 模型加载失败，将进入无模型模式（不影响游戏）');
  } else {
    gameLog.info(LOG_CATEGORIES.LIVE2D, '角色模型加载成功');
  }
  
  updateLoading(90, '正在应用壁纸...');
  
  // 应用壁纸
  applyWallpaper();
  
  updateLoading(100, '准备完成！');
  
  // 短暂延迟后隐藏加载界面
  await new Promise(resolve => setTimeout(resolve, 300));
  hideLoading();
  
  // 添加全局键盘事件监听（ESC 键弹出设置）
  document.addEventListener('keydown', handleGlobalKeyDown);
  
  // 为输入框添加键盘事件监听（Enter 键发送）
  const userInput = document.getElementById('userInput');
  if (userInput) {
    userInput.addEventListener('keydown', handleKeyDown);
  }
  
  // 聚焦输入框
  if (userInput) {
    userInput.focus();
  }
  
  gameLog.info(LOG_CATEGORIES.SYSTEM, '游戏页面初始化完成');
  console.log('游戏页面初始化完成');
}

// ==================== TTS 与 Live2D 口型同步 ====================

/**
 * 设置 TTS 和 Live2D 的口型同步
 * TTS 播放时，Live2D 嘴巴也会动
 */
function setupTTSLive2DSync() {
  if (!ttsManager || !ttsManager.core) {
    console.warn('[Game] TTS not available for mouth sync');
    return;
  }
  
  // 设置 TTS 播放开始回调
  ttsManager.core.onSpeakStart = () => {
    if (live2DManager && live2DManager.model) {
      live2DManager.startSpeaking();
      console.log('[Game] Live2D mouth sync: start speaking');
    }
  };
  
  // 设置 TTS 播放结束回调
  ttsManager.core.onSpeakEnd = () => {
    if (live2DManager && live2DManager.model) {
      live2DManager.stopSpeaking();
      console.log('[Game] Live2D mouth sync: stop speaking');
    }
  };
  
  console.log('[Game] TTS-Live2D mouth sync setup complete');
}

// 全局键盘事件处理
function handleGlobalKeyDown(event) {
  // ESC 键弹出设置弹窗
  if (event.key === 'Escape') {
    event.preventDefault();
    openSettings();
  }
}

// ==================== 加载界面 ====================

// 显示加载界面
function showLoading(text = '正在加载...') {
  const overlay = document.getElementById('loadingOverlay');
  const loadingText = document.getElementById('loadingText');
  const progressFill = document.getElementById('progressFill');
  
  if (loadingText) loadingText.textContent = text;
  if (progressFill) progressFill.style.width = '0%';
  if (overlay) overlay.classList.add('active');
}

// 隐藏加载界面
function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('active');
}

// 更新加载进度
function updateLoading(progress, text) {
  const progressFill = document.getElementById('progressFill');
  const loadingText = document.getElementById('loadingText');
  
  if (progressFill) progressFill.style.width = `${progress}%`;
  if (text && loadingText) loadingText.textContent = text;
}

// ==================== Live2D 功能 ====================

async function initLive2D() {
  // 获取模型类型
  const modelType = localStorage.getItem('live2d_model_type') || 'image';
  const modelPath = localStorage.getItem('live2d_model_path');

  console.log('[Game] Model type:', modelType, 'Path:', modelPath);

  // 如果是 Live2D 模型
  if (modelType === 'live2d' && modelPath) {
    const success = await initLive2DModel(modelPath);
    if (success) {
      return true;
    }

    // Live2D 加载失败，尝试回退到图片模式
    console.warn('[Game] Live2D 加载失败，尝试图片模式');
    gameLog.warn(LOG_CATEGORIES.LIVE2D, 'Live2D 加载失败，尝试图片模式');

    // 清理 Live2D 配置，下次尝试图片模式
    localStorage.setItem('live2d_model_type', 'image');
  }

  // 使用图片模式（如果没有模型，会显示占位符）
  return await initImageModel();
}

/**
 * 初始化真正的 Live2D 模型
 * @returns {Promise<boolean>} 是否成功
 */
async function initLive2DModel(modelPath) {
  console.log('========== Live2D 模型初始化 ==========');
  console.log('[Game] Model path:', modelPath);

  const container = document.getElementById('live2dContainer');
  if (!container) {
    console.error('[Game] ❌ Live2D container not found');
    return false;
  }

  console.log('[Game] Container found, size:', container.clientWidth, 'x', container.clientHeight);

  // 隐藏旧的 canvas（用于图片模式）
  const oldCanvas = document.getElementById('live2d-canvas');
  if (oldCanvas) {
    oldCanvas.style.display = 'none';
  }

  // 清理容器中可能存在的旧 PIXI canvas
  const existingPixiCanvas = container.querySelector('canvas:not(#live2d-canvas)');
  if (existingPixiCanvas) {
    existingPixiCanvas.remove();
  }

  try {
    // 检查 Live2D 依赖是否已加载
    console.log('[Game] 检查 Live2D 依赖...');
    console.log('[Game] - PIXI:', typeof window.PIXI);
    console.log('[Game] - PIXI.live2d:', typeof window.PIXI?.live2d);
    console.log('[Game] - Live2DModel:', typeof window.PIXI?.live2d?.Live2DModel);

    if (!window.PIXI?.live2d?.Live2DModel) {
      console.error('[Game] ❌ pixi-live2d-display 未加载');
      return false;
    }

    // 获取 Live2D 管理器
    live2DManager = getLive2DManager();

    // 获取配置
    const savedConfig = localStorage.getItem('live2dConfig');
    let live2dConfig = {};

    if (savedConfig) {
      try {
        live2dConfig = JSON.parse(savedConfig);
      } catch (e) {
        console.error('[Game] Parse live2dConfig error:', e);
      }
    }

    // 处理缩放值 - 兼容旧配置（可能是小数格式）
    let scale = live2dConfig.scale;
    if (scale !== undefined) {
      // 如果是小数格式（< 1），转换为百分比
      if (scale < 1) {
        scale = Math.round(scale * 100);
      }
    } else {
      scale = 100; // 默认 100%
    }

    // 确保缩放在有效范围内
    scale = Math.max(10, Math.min(500, scale));

    // 确保位置在有效范围内（默认居中 50）
    const posX = Math.max(0, Math.min(100, live2dConfig.posX ?? 50));
    const posY = Math.max(0, Math.min(100, live2dConfig.posY ?? 50));

    console.log('[Game] Live2D config - scale:', scale + '%', 'posX:', posX, 'posY:', posY);

    // 初始化管理器（不自动加载模型）
    console.log('[Game] 初始化 Live2D 管理器...');
    await live2DManager.init(container, {
      scale: scale / 100,  // 转换为小数格式
      posX: posX,
      posY: posY,
      followMouse: live2dConfig.followEnabled !== false,
      lockPosition: live2dConfig.lockPosition === true,
      autoLoad: false  // 不自动加载，我们手动加载
    });

    // 获取模型的 HTTP URL
    let modelHttpUrl = modelPath;
    if (window.electronAPI && window.electronAPI.loadLive2DModel) {
      console.log('[Game] 通过 IPC 获取模型 HTTP URL...');
      const modelInfo = await window.electronAPI.loadLive2DModel(modelPath);
      if (modelInfo && modelInfo._modelJsonUrl) {
        modelHttpUrl = modelInfo._modelJsonUrl;
        console.log('[Game] 获取到 HTTP URL:', modelHttpUrl);
      } else {
        console.warn('[Game] 未能获取模型 HTTP URL，使用原始路径');
      }
    }

    // 手动加载指定的模型
    console.log('[Game] 加载模型:', modelHttpUrl);
    const success = await live2DManager.loadModel(modelHttpUrl);

    // 检查模型是否加载成功
    if (!success || !live2DManager.model) {
      console.error('[Game] ❌ Live2D 模型加载失败');
      return false;
    }

    console.log('[Game] ✅ Live2D 模型加载成功');
    gameLog.info(LOG_CATEGORIES.LIVE2D, 'Live2D 模型加载成功', { path: modelPath, url: modelHttpUrl });

    return true;

  } catch (error) {
    console.error('[Game] ❌ Live2D init error:', error);
    console.error('[Game] Error stack:', error.stack);
    return false;
  }
}

/**
 * 初始化图片模型
 * @returns {Promise<boolean>} 是否成功
 */
async function initImageModel() {
  const canvas = document.getElementById('live2d-canvas');
  if (!canvas) {
    console.error('[Game] Live2D canvas not found');
    return false;
  }
  
  // 显示图片模式的 canvas
  canvas.style.display = 'block';
  
  // 移除可能存在的 PIXI canvas
  const container = document.getElementById('live2dContainer');
  if (container) {
    const pixiCanvas = container.querySelector('canvas:not(#live2d-canvas)');
    if (pixiCanvas) {
      pixiCanvas.remove();
      console.log('[Game] Removed PIXI canvas');
    }
  }
  
  const gameContent = document.getElementById('gameContent');
  if (!gameContent) {
    console.error('[Game] gameContent not found');
    return false;
  }
  
  // 等待容器渲染完成
  await new Promise(resolve => requestAnimationFrame(resolve));
  
  // 设置画布尺寸（确保容器有尺寸）
  let containerWidth = gameContent.offsetWidth;
  let containerHeight = gameContent.offsetHeight;
  
  // 如果尺寸为 0，使用默认值
  if (containerWidth === 0 || containerHeight === 0) {
    containerWidth = 800;
    containerHeight = 600;
    console.warn('[Game] gameContent has no size, using default');
  }
  
  canvas.width = containerWidth;
  canvas.height = containerHeight;
  console.log('[Game] Image canvas size:', containerWidth, 'x', containerHeight);
  
  // 获取保存的模型数据（base64 图片）
  const modelData = localStorage.getItem('live2d_model_data');
  if (!modelData) {
    console.log('[Game] No image model configured, will run without model');
    gameLog.info(LOG_CATEGORIES.LIVE2D, '未配置角色图片，将进入无模型模式');
    // 不返回 false，允许游戏继续（只是没有角色显示）
    return true;
  }
  
  // 获取 Live2D 配置
  const live2dConfig = JSON.parse(localStorage.getItem('live2dConfig') || '{}');
  
  // 初始化跟随控制器
  live2DFollow = {
    smoothing: live2dConfig.followSensitivity || 0.08,
    enabled: live2dConfig.followEnabled !== false,
    angles: { eyeX: 0, eyeY: 0, headX: 0, headY: 0 }
  };
  
  // 加载图片
  const img = new Image();
  img.src = modelData;
  
  try {
    await new Promise((resolve, reject) => {
      img.onload = () => {
        console.log('[Game] Image loaded:', img.width, 'x', img.height);
        resolve();
      };
      img.onerror = (e) => {
        console.error('[Game] Image load error:', e);
        reject(new Error('图片加载失败'));
      };
      // 设置超时
      setTimeout(() => reject(new Error('图片加载超时')), 10000);
    });
  } catch (err) {
    console.error('[Game] Failed to load image:', err);
    gameLog.warn(LOG_CATEGORIES.LIVE2D, '图片加载失败，将进入无模型模式');
    // 不返回 false，允许游戏继续（只是没有角色显示）
    return true;
  }
  
  // 创建模型对象
  live2DModel = {
    textures: [img],
    config: live2dConfig
  };
  
  // 添加鼠标监听
  gameContent.addEventListener('mousemove', handleMouseMove);
  gameContent.addEventListener('mouseleave', handleMouseLeave);
  
  // 开始渲染
  startLive2DRender();
  console.log('[Game] Image model loaded successfully');
  
  return true;
}

function handleMouseMove(event) {
  const gameContent = document.getElementById('gameContent');
  if (!gameContent || !live2DFollow?.enabled) return;
  
  const rect = gameContent.getBoundingClientRect();
  targetX = (event.clientX - rect.left) / rect.width - 0.5;
  targetY = (event.clientY - rect.top) / rect.height - 0.5;
}

function handleMouseLeave() {
  targetX = 0;
  targetY = 0;
}

function startLive2DRender() {
  const canvas = document.getElementById('live2d-canvas');
  const ctx = canvas?.getContext('2d');
  if (!ctx) {
    console.error('[Game] Cannot get canvas context');
    return;
  }
  if (!live2DModel) {
    console.error('[Game] No Live2D model to render');
    return;
  }
  
  // 确保 canvas 有正确的尺寸
  const gameContent = document.getElementById('gameContent');
  if (gameContent && (canvas.width === 0 || canvas.height === 0)) {
    canvas.width = gameContent.offsetWidth || 800;
    canvas.height = gameContent.offsetHeight || 600;
  }
  
  console.log('[Game] Starting Live2D render, canvas:', canvas.width, 'x', canvas.height);
  
  function render() {
    if (!live2DModel || !live2DModel.textures || live2DModel.textures.length === 0) {
      live2DAnimationId = requestAnimationFrame(render);
      return;
    }
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const img = live2DModel.textures[0];
    if (!img) {
      live2DAnimationId = requestAnimationFrame(render);
      return;
    }
    
    // 检查图片是否加载完成
    if (!img.complete) {
      live2DAnimationId = requestAnimationFrame(render);
      return;
    }
    
    // 获取配置
    const config = live2DModel.config || {};
    const scale = (config.scale || 100) / 100;
    const posX = config.posX || 0;
    const posY = config.posY || 0;
    
    // 平滑跟随
    if (live2DFollow?.enabled && !config.lockPosition) {
      const smoothing = live2DFollow.smoothing;
      live2DFollow.angles.eyeX += (targetX * 0.3 - live2DFollow.angles.eyeX) * smoothing;
      live2DFollow.angles.eyeY += (targetY * 0.2 - live2DFollow.angles.eyeY) * smoothing;
      live2DFollow.angles.headX += (targetX * 0.1 - live2DFollow.angles.headX) * smoothing;
      live2DFollow.angles.headY += (targetY * 0.1 - live2DFollow.angles.headY) * smoothing;
    }
    
    // 计算模型位置（在输入框上方，居中）
    const baseHeight = canvas.height * 0.25; // 距离底部 25%（输入框上方）
    const modelScale = Math.min(canvas.width * 0.5 / img.width, canvas.height * 0.5 / img.height) * scale;
    const modelWidth = img.width * modelScale;
    const modelHeight = img.height * modelScale;
    
    // 居中 + 配置偏移 + 鼠标跟随
    const offsetX = (posX / 100) * canvas.width * 0.3;
    const offsetY = (posY / 100) * canvas.height * 0.3;
    const x = canvas.width / 2 - modelWidth / 2 + offsetX + (live2DFollow?.angles.headX || 0) * 30;
    const y = canvas.height - baseHeight - modelHeight + offsetY + (live2DFollow?.angles.headY || 0) * 20;
    
    // 绘制
    ctx.save();
    ctx.translate(x + modelWidth / 2, y + modelHeight / 2);
    ctx.rotate((live2DFollow?.angles.headX || 0) * 0.02);
    ctx.translate(-(x + modelWidth / 2), -(y + modelHeight / 2));
    ctx.drawImage(img, x, y, modelWidth, modelHeight);
    ctx.restore();
    
    live2DAnimationId = requestAnimationFrame(render);
  }
  
  // 停止之前的渲染循环
  if (live2DAnimationId) {
    cancelAnimationFrame(live2DAnimationId);
  }
  
  render();
  console.log('[Game] Live2D render loop started');
}

function stopLive2DRender() {
  // 停止图片渲染
  if (live2DAnimationId) {
    cancelAnimationFrame(live2DAnimationId);
    live2DAnimationId = null;
  }
  
  // 销毁 Live2D 管理器
  if (live2DManager) {
    live2DManager.destroy();
    live2DManager = null;
  }
}

// ==================== 聊天面板控制 ====================

function openChatPanel() {
  const chatPanel = document.getElementById('chatPanel');
  if (!chatPanelVisible) {
    chatPanel.classList.add('visible');
    chatPanelVisible = true;
  }
}

function closeChatPanel() {
  const chatPanel = document.getElementById('chatPanel');
  if (chatPanelVisible) {
    chatPanel.classList.remove('visible');
    chatPanelVisible = false;
  }
}

// ==================== 角色信息加载 ====================

async function loadCharacterInfo() {
  try {
    // 获取角色信息
    const roleInfo = characterManager.roleInfo;
    const stage = characterManager.getCurrentStage();
    const stageName = characterManager.getStageName(stage);
    const affection = characterManager.getAffection();
    const trust = characterManager.getTrust();

    if (roleInfo) {
      // 更新好感度弹窗中的角色名称
      document.getElementById('statsCharName').textContent = roleInfo.roleName;
      // 设置角色头像首字母
      document.getElementById('statsAvatar').textContent = roleInfo.roleName ? roleInfo.roleName.charAt(0) : '?';
    }

    // 更新阶段
    document.getElementById('statsCharStage').textContent = stageName || '初识';

    // 更新好感度和信任值
    updateStats(affection, trust);

  } catch (e) {
    console.error('加载角色信息失败:', e);
    document.getElementById('statsCharName').textContent = '妹妹';
    document.getElementById('statsAvatar').textContent = '妹';
  }
}

// ==================== 数据更新 ====================

function updateStats(affection, trust) {
  // 更新好感度弹窗中的数值显示
  // 好感度范围：-100 到 1000
  // 信任值范围：-100 到 100
  document.getElementById('statsAffectionValue').textContent = affection;
  document.getElementById('statsTrustValue').textContent = trust;
  
  // 更新进度条
  // 好感度范围：-100 到 1000，映射到 0-100%
  // 信任值范围：-100 到 100，映射到 0-100%
  const affectionPercent = Math.max(0, Math.min(100, (affection + 100) / 11));
  const trustPercent = Math.max(0, Math.min(100, (trust + 100) / 2));
  
  document.getElementById('statsAffectionBar').style.width = `${affectionPercent}%`;
  document.getElementById('statsTrustBar').style.width = `${trustPercent}%`;
}

// ==================== 对话历史 ====================

function showWelcomeMessage() {
  const chatMessages = document.getElementById('chatMessages');
  
  // 清空现有消息
  chatMessages.innerHTML = '';
  
  // 不显示欢迎消息，直接开始空白聊天
}

// ==================== 消息发送 ====================

async function sendMessage() {
  if (isProcessing) return;

  const input = document.getElementById('userInput');
  const message = input.value.trim();

  if (!message) return;

  gameLog.info(LOG_CATEGORIES.CHAT, '用户发送消息', { message });

  // 清空输入框
  input.value = '';

  // 打开聊天面板
  openChatPanel();

  // 添加用户消息到 UI
  addMessageToUI(message, 'user');

  // 记录到对话历史
  memoryManager.addToConversation('user', message);

  // 设置处理状态并锁定输入框
  isProcessing = true;
  lockInput();
  updateSendButton(true);

  try {
    const config = getConfig();

    // AI 消息占位符（在收到旁白后创建）
    let aiMessageEl = null;

    // 流式处理
    let fullContent = '';
    let thinkingContent = '';
    let isThinking = false;
    let narration = '';

    for await (const chunk of chatManager.sendMessageStream(message)) {
      console.log('[Game] 收到 chunk:', chunk.type, chunk.content?.substring?.(0, 50));

      if (chunk.type === 'narration') {
        // 先显示旁白
        narration = chunk.content;
        addNarrationToUI(chunk.content);
        gameLog.info(LOG_CATEGORIES.CHAT, '旁白生成', { narration: chunk.content.substring(0, 50) + '...' });
      } else if (chunk.type === 'thinking_start') {
        isThinking = true;
        console.log('%c[深度思考开始]', 'color: #9333ea; font-weight: bold; font-size: 14px;');
      } else if (chunk.type === 'thinking') {
        thinkingContent += chunk.content;
      } else if (chunk.type === 'thinking_end') {
        isThinking = false;
        // 将完整思考内容输出到控制台
        console.log('%c[thinking_end] 总长度:', 'color: #9333ea;', thinkingContent?.length);
        if (thinkingContent) {
          console.log('%c[深度思考结果]', 'color: #9333ea; font-weight: bold; font-size: 14px;');
          console.log(thinkingContent);
          console.log('%c[深度思考结束]', 'color: #9333ea; font-weight: bold; font-size: 14px;');
        }
      } else if (chunk.type === 'content') {
        // 更新显示内容
        fullContent += chunk.content;

        // 过滤思考标签后更新 UI
        if (!aiMessageEl) {
          aiMessageEl = createAIMessageElement();
        }
        // 过滤思考标签和指令内容
        const filteredDisplay = chatManager.filterThinkingTags(fullContent);
        updateAIMessageElement(aiMessageEl, filteredDisplay);
      }
    }

    // 最终过滤完整内容（移除思考标签和指令内容）
    fullContent = chatManager.filterThinkingTags(fullContent);

    // 记录 AI 回复到对话历史
    if (fullContent) {
      memoryManager.addToConversation('assistant', fullContent);
    }

    gameLog.info(LOG_CATEGORIES.CHAT, 'AI 回复完成', {
      userMessage: message.substring(0, 30) + '...',
      aiResponse: fullContent.substring(0, 50) + '...'
    });

    // TTS 朗读 AI 回复（过滤括号和旁白）
    // 检查配置开关和 TTS 状态
    const gameConfig = JSON.parse(localStorage.getItem('aiGameConfig') || '{}');
    if (gameConfig.tts && ttsManager && ttsManager.isEnabled && fullContent) {
      console.log('[Game] 开始 TTS 朗读，配置启用:', gameConfig.tts, 'TTS 启用:', ttsManager.isEnabled);
      ttsManager.speakAIResponse(fullContent).catch(e => {
        console.error('[TTS] 朗读失败:', e);
        addSystemMessage('TTS 服务连接失败，请确保 AstraTTS 服务已启动');
      });
    } else {
      console.log('[Game] 跳过 TTS 朗读，配置启用:', gameConfig.tts, 'TTS 启用:', ttsManager?.isEnabled);
    }

    // 更新好感度和信任值
    const affection = characterManager.getAffection();
    const trust = characterManager.getTrust();
    updateStats(affection, trust);

    // 更新阶段显示
    const stage = characterManager.getCurrentStage();
    const stageName = characterManager.getStageName(stage);
    document.getElementById('statsCharStage').textContent = stageName;

  } catch (e) {
    console.error('发送消息失败:', e);
    gameLog.error(LOG_CATEGORIES.CHAT, '发送消息失败', { error: e.message });

    // 检查是否是好感度分析错误
    if (e.message && e.message.includes('好感度分析失败')) {
      alert('好感度分析失败，请检查API配置');
    } else {
      addSystemMessage(`错误: ${e.message}`);
    }
  } finally {
    isProcessing = false;
    unlockInput();
    updateSendButton(false);
  }
}

// ==================== UI 辅助函数 ====================

function addNarrationToUI(content) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message narration';
  
  messageDiv.innerHTML = `
    <div class="message-content narration-content">${formatBracketContent(content)}</div>
  `;
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessageToUI(content, role, scroll = true) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${role === 'user' ? 'user' : 'ai'}`;
  
  // 获取角色名称
  let roleName = document.getElementById('statsCharName').textContent;
  if (!roleName && characterManager) {
    const info = characterManager.roleInfo;
    roleName = info?.roleName || '角色';
  }
  roleName = roleName || '角色';
  
  const senderName = role === 'user' ? '你' : roleName;

  messageDiv.innerHTML = `
    <div class="message-sender">${senderName}</div>
    <div class="message-content">${formatBracketContent(content)}</div>
  `;
  
  chatMessages.appendChild(messageDiv);
  
  if (scroll) {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

function addSystemMessage(content, type = 'info') {
  console.log('[系统消息]', content);
  
  // 根据消息内容判断类型
  const isError = content.includes('失败') || content.includes('错误') || content.includes('太大') || content.includes('不足');
  const isSuccess = content.includes('成功') || content.includes('已保存') || content.includes('已加载') || content.includes('已导入') || content.includes('已导出') || content.includes('已删除') || content.includes('已重置');
  
  if (isError) {
    showErrorModal(content);
  } else if (isSuccess) {
    showToast(content, 'success');
  } else {
    showToast(content, type);
  }
}

// 显示可爱错误弹窗
function showErrorModal(message) {
  // 移除已存在的弹窗
  const existing = document.querySelector('.cute-modal-overlay');
  if (existing) existing.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'cute-modal-overlay';
  overlay.innerHTML = `
    <div class="cute-modal">
      <div class="modal-icon">🥺</div>
      <div class="modal-title">哎呀，出错了</div>
      <div class="modal-message">${escapeHtml(message)}</div>
      <div class="modal-buttons">
        <button class="modal-btn modal-btn-primary" onclick="this.closest('.cute-modal-overlay').remove()">我知道啦 ♡</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // 点击背景关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// 显示可爱提示（自动消失）
function showToast(message, type = 'info') {
  // 移除已存在的toast
  const existing = document.querySelector('.cute-toast');
  if (existing) existing.remove();
  
  const icons = {
    success: '✨',
    error: '💔',
    info: '💕'
  };
  
  const toast = document.createElement('div');
  toast.className = `cute-toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || icons.info}</span>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;
  
  document.body.appendChild(toast);
  
  // 2秒后自动消失
  setTimeout(() => {
    toast.style.animation = 'toastFadeOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

function createAIMessageElement() {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message ai';
  messageDiv.id = 'current-ai-message';
  
  // 获取角色名称
  let roleName = document.getElementById('statsCharName').textContent;
  if (!roleName && characterManager) {
    const info = characterManager.roleInfo;
    roleName = info?.roleName || '角色';
  }
  roleName = roleName || '角色';
  
  messageDiv.innerHTML = `
    <div class="message-sender">${roleName}</div>
    <div class="message-content"></div>
  `;
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  
  return messageDiv;
}

function updateAIMessageElement(element, content) {
  const contentEl = element.querySelector('.message-content');
  if (contentEl) {
    contentEl.innerHTML = formatBracketContent(content);
  }
  const chatMessages = document.getElementById('chatMessages');
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateSendButton(processing) {
  const sendBtn = document.getElementById('sendBtn');
  sendBtn.disabled = processing;
  sendBtn.textContent = processing ? '...' : '发送';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 格式化括号内容为灰色
 * 支持：()（）[]【】{}｛｝<>
 */
function formatBracketContent(text) {
  // 先转义HTML
  let result = escapeHtml(text);
  
  // 匹配各种括号内的内容，添加灰色样式
  // 中文括号：（）【】｛｝
  // 英文括号：() [] {} <>
  const bracketPatterns = [
    /\（([^）]*?)\）/g,      // 中文圆括号
    /\(([^)]*?)\)/g,        // 英文圆括号
    /\【([^】]*?)\】/g,      // 中文方括号
    /\[([^\]]*?)\]/g,       // 英文方括号
    /\｛([^｝]*?)\｝/g,      // 中文花括号
    /\{([^}]*?)\}/g,        // 英文花括号
    /<([^>]*?)>/g           // 英文尖括号
  ];
  
  for (const pattern of bracketPatterns) {
    result = result.replace(pattern, '<span class="bracket-text">$&</span>');
  }
  
  return result;
}

// ==================== 设置弹窗 ====================

function openSettings() {
  document.getElementById('settingsModal').classList.add('active');
  loadVolumeSettings();
}

function closeSettings() {
  document.getElementById('settingsModal').classList.remove('active');
}

function closeSettingsOnBg(event) {
  if (event.target.id === 'settingsModal') {
    closeSettings();
  }
}

// ==================== 好感度浮动窗口 ====================

let statsPopupVisible = false;

function toggleStats() {
  const popup = document.getElementById('statsPopup');
  statsPopupVisible = !statsPopupVisible;
  
  if (statsPopupVisible) {
    popup.classList.add('visible');
  } else {
    popup.classList.remove('visible');
  }
}

// 点击其他地方关闭
document.addEventListener('click', (event) => {
  const popup = document.getElementById('statsPopup');
  const wrapper = document.querySelector('.stats-trigger-wrapper');
  
  if (statsPopupVisible && popup && wrapper) {
    if (!wrapper.contains(event.target)) {
      popup.classList.remove('visible');
      statsPopupVisible = false;
    }
  }
});

// ==================== 音量设置 ====================

function loadVolumeSettings() {
  const config = getConfig();
  document.getElementById('bgmVolume').value = config.bgmVolume ?? 50;
  document.getElementById('ttsVolume').value = config.ttsVolume ?? 50;
}

function saveVolume() {
  const config = getConfig();
  config.bgmVolume = parseInt(document.getElementById('bgmVolume').value);
  config.ttsVolume = parseInt(document.getElementById('ttsVolume').value);
  saveConfig(config);
  
  // 实时应用到 TTS
  if (ttsManager) {
    ttsManager.setVolume(config.ttsVolume);
  }
}

// ==================== 记忆档案全屏弹窗 ====================

/**
 * 解析时间戳为可比较的数值
 * @param {string} timestamp - 格式：2024年1月1日 14时
 * @returns {number} 可比较的时间数值
 */
function parseTimestamp(timestamp) {
  if (!timestamp) return 0;

  // 解析格式：2024年1月1日 14时
  const match = timestamp.match(/(\d+)年(\d+)月(\d+)日\s*(\d+)?时?/);
  if (match) {
    const [, year, month, day, hour = 0] = match;
    // 转换为数字便于比较（年*1000000 + 月*10000 + 日*100 + 时）
    return parseInt(year) * 1000000 + parseInt(month) * 10000 + parseInt(day) * 100 + parseInt(hour);
  }

  // 解析自定义格式：13.9.2 14时 或 13.9.2
  const customMatch = timestamp.match(/(\d+)\.(\d+)\.(\d+)\s*(\d+)?时?/);
  if (customMatch) {
    const [, year, month, day, hour = 0] = customMatch;
    return parseInt(year) * 1000000 + parseInt(month) * 10000 + parseInt(day) * 100 + parseInt(hour);
  }

  // 尝试解析 ISO 格式
  try {
    return new Date(timestamp).getTime();
  } catch {
    return 0;
  }
}

async function openMemory() {
  const memoryList = document.getElementById('memoryList');

  // 从 memo.json 加载记忆数据
  await memoryManager.loadMemories();

  // 获取所有记忆（带重要性标签）
  const allMemories = memoryManager.getAllMemories();
  const memoryCount = allMemories ? allMemories.length : 0;
  const maxMemories = 999;

  // 更新记忆数量显示
  const memoryCountEl = document.getElementById('memoryCount');
  if (memoryCountEl) {
    memoryCountEl.textContent = `记忆数量：${memoryCount}/${maxMemories}`;

    // 如果接近上限（超过 900 条），显示警告颜色
    if (memoryCount >= 900) {
      memoryCountEl.style.color = '#e74c3c';  // 红色警告
    } else if (memoryCount >= 800) {
      memoryCountEl.style.color = '#f39c12';  // 橙色提示
    } else {
      memoryCountEl.style.color = '#95a5a6';  // 默认灰色
    }
  }

  if (!allMemories || allMemories.length === 0) {
    memoryList.innerHTML = '<div class="memory-item-empty">暂无记忆记录</div>';
  } else {
    // 按 id 降序排列（id 越大表示记忆越新，最新的在最上面）
    const sortedMemories = [...allMemories].sort((a, b) => {
      return (b.id || 0) - (a.id || 0);
    });

    memoryList.innerHTML = sortedMemories.map(memory => {
      const content = memory.content || memory;
      // 时间戳可以是任意格式（包含文字、数字、特殊符号）
      const time = memory.timestamp || '';
      const importance = memory.importance || 3;
      const importanceLabel = `${'★'.repeat(importance)}${'☆'.repeat(5-importance)}`;

      return `
        <div class="memory-item" data-id="${memory.id}">
          ${time ? `<div class="memory-time">${time}</div>` : ''}
          <div class="memory-content">${escapeHtml(content)}</div>
          <div class="memory-meta">
            <span class="memory-importance">${importanceLabel}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  document.getElementById('memoryModal').classList.add('active');
}

function closeMemory() {
  document.getElementById('memoryModal').classList.remove('active');
}

// ==================== 存档功能 ====================

async function saveGame() {
  try {
    await saveManager.saveCurrentRole();
    addSystemMessage('游戏已保存');
    closeSettings();
  } catch (e) {
    addSystemMessage(`保存失败: ${e.message}`);
  }
}

async function loadGame() {
  try {
    await saveManager.loadCurrentRole();
    await loadCharacterInfo();
    // 不加载对话历史，因为 conversationHistory 是临时的，不会被保存到存档
    addSystemMessage('存档已加载');
    closeSettings();
  } catch (e) {
    addSystemMessage(`加载失败: ${e.message}`);
  }
}

async function exportSave() {
  try {
    const saveData = await saveManager.exportSaveAsString();
    const blob = new Blob([saveData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `save_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addSystemMessage('存档已导出');
    closeSettings();
  } catch (e) {
    addSystemMessage(`导出失败: ${e.message}`);
  }
}

function importSave() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        await saveManager.importSaveFromFile(file);
        await loadCharacterInfo();
        // 不加载对话历史，因为 conversationHistory 是临时的，不会被保存到存档
        addSystemMessage('存档已导入');
        closeSettings();
      } catch (e) {
        addSystemMessage(`导入失败: ${e.message}`);
      }
    }
  };
  input.click();
}

// ==================== 输入框锁定 ====================

function lockInput() {
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  
  // 获取 AI 名字
  const aiName = document.getElementById('statsCharName').textContent || 'AI';
  
  input.disabled = true;
  input.placeholder = `${aiName}正在思考...`;
  input.value = '';
  sendBtn.disabled = true;
}

function unlockInput() {
  const input = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  
  input.disabled = false;
  input.placeholder = '输入你的对话...';
  sendBtn.disabled = false;
}

// ==================== 结束聊天功能 ====================

async function endChat() {
  if (isProcessing) {
    return; // 正在处理消息时不允许结束
  }
  
  gameLog.info(LOG_CATEGORIES.CHAT, '结束聊天，准备保存记忆');
  
  // 先缩回聊天面板
  closeChatPanel();
  
  // 锁定输入框
  lockInput();
  isProcessing = true;
  
  const endChatBtn = document.getElementById('endChatBtn');
  endChatBtn.disabled = true;
  endChatBtn.textContent = '总结中...';
  
  try {
    // 调用聊天管理器的结束聊天方法
    const result = await chatManager.endChatAndSaveMemory();

    if (result && result.summary) {
      gameLog.info(LOG_CATEGORIES.MEMORY, '记忆保存成功', { summary: result.summary.substring(0, 50) + '...' });
      // 显示成功提示
      showMemoryToast(true);

      // 如果有遗忘提示，显示在聊天框中
      if (result.forgettingMessage) {
        addSystemMessage(result.forgettingMessage);
      }
    } else {
      gameLog.info(LOG_CATEGORIES.MEMORY, '无消息需要总结');
      // 显示失败提示
      showMemoryToast(false);
    }
    
  } catch (e) {
    console.error('结束聊天失败:', e);
    gameLog.error(LOG_CATEGORIES.CHAT, '结束聊天失败', { error: e.message });
    // 显示失败提示
    showMemoryToast(false);
  } finally {
    endChatBtn.disabled = false;
    endChatBtn.textContent = '结束聊天';
    isProcessing = false;
    // 解锁输入框
    unlockInput();

    // ========== 清空聊天框所有内容 ==========
    const chatMessages = document.getElementById('chatMessages');
    if (chatMessages) {
      chatMessages.innerHTML = '';
      console.log('[Game] 已清空聊天框所有内容');
    }

    // ========== 清空输入框 ==========
    const input = document.getElementById('userInput');
    if (input) {
      input.value = '';
    }

    gameLog.info(LOG_CATEGORIES.CHAT, '聊天框已清空');
  }
}

// ==================== 记忆提示弹窗 ====================

function showMemoryToast(success) {
  const toast = document.getElementById('memoryToast');
  const icon = toast.querySelector('.memory-toast-icon');
  const text = document.getElementById('memoryToastText');
  
  if (success) {
    toast.className = 'memory-toast success';
    icon.textContent = '♡';
    text.textContent = '刚刚又有新的记忆呢...';
  } else {
    toast.className = 'memory-toast error';
    icon.textContent = '✧';
    text.textContent = '哎呀...完蛋了..失忆了';
  }
  
  // 显示弹窗
  toast.classList.add('visible');
  
  // 2秒后自动关闭
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 2000);
}

// ==================== 事件处理 ====================

function handleKeyDown(event) {
  // Enter 键发送消息
  if (event.key === 'Enter') {
    event.preventDefault();
    sendMessage();
  }
}

// 清理步骤配置
const CLEANUP_STEPS = [
  { text: '中断网络请求...', duration: 150 },
  { text: '清理 Live2D 资源...', duration: 150 },
  { text: '停止音频播放...', duration: 100 },
  { text: '清理定时器...', duration: 100 },
  { text: '重置游戏状态...', duration: 100 }
];

// 执行清理动画
async function playCleanupAnimation() {
  const totalSteps = CLEANUP_STEPS.length;
  let currentProgress = 0;
  
  for (let i = 0; i < totalSteps; i++) {
    const step = CLEANUP_STEPS[i];
    updateLoading(currentProgress, step.text);
    
    await new Promise(resolve => setTimeout(resolve, step.duration));
    
    currentProgress = ((i + 1) / totalSteps) * 100;
    updateLoading(currentProgress, null);
  }
  
  updateLoading(100, '完成');
}

async function goBack() {
  // 如果正在处理消息，先中断
  if (isProcessing) {
    isProcessing = false;
    // 中断所有 API 请求
    if (loadingManager) {
      loadingManager.abortAllRequests();
    }
  }

  // 显示加载界面
  showLoading('正在保存记忆并返回主页...');

  try {
    // 先生成记忆总结（如果有对话历史）
    try {
      const result = await chatManager.endChatAndSaveMemory();
      if (result && result.summary) {
        gameLog.info(LOG_CATEGORIES.MEMORY, '返回主页前记忆保存成功', { summary: result.summary.substring(0, 50) + '...' });
      } else {
        gameLog.info(LOG_CATEGORIES.MEMORY, '返回主页前无消息需要总结');
      }
    } catch (e) {
      console.error('[Game] 返回主页前保存记忆失败:', e);
      // 不影响返回主页流程
    }

    // 停止 TTS 播放
    if (ttsManager) {
      ttsManager.stop();
      gameLog.info(LOG_CATEGORIES.SYSTEM, 'TTS 已停止');
    }

    // 清理 Live2D
    stopLive2DRender();

    const gameContent = document.getElementById('gameContent');
    if (gameContent) {
      gameContent.removeEventListener('mousemove', handleMouseMove);
      gameContent.removeEventListener('mouseleave', handleMouseLeave);
    }

    // 执行清理动画
    await playCleanupAnimation();

    // 短暂延迟后导航
    await new Promise(resolve => setTimeout(resolve, 200));

    // 导航到主页
    electronAPI.navigateTo('home');

  } catch (e) {
    console.error('返回主页失败:', e);
    hideLoading();
    // 即使失败也导航
    electronAPI.navigateTo('home');
  }
}

// ==================== 个性化弹窗 ====================

function openCustomize() {
  document.getElementById('customizeModal').classList.add('visible');
  loadCustomizeSettings();
}

function closeCustomize() {
  document.getElementById('customizeModal').classList.remove('visible');
}

function closeCustomizeOnBg(event) {
  if (event.target.id === 'customizeModal') {
    closeCustomize();
  }
}

function loadCustomizeSettings() {
  // 加载 Live2D 配置
  const savedConfig = localStorage.getItem('live2dConfig');
  let live2dConfig = {};

  if (savedConfig) {
    try {
      live2dConfig = JSON.parse(savedConfig);
    } catch (e) {
      console.error('[Game] Parse live2dConfig error:', e);
    }
  }

  // 模型名称
  const modelName = localStorage.getItem('live2d_model_name');
  document.getElementById('currentModelName').textContent = modelName || '未设置';

  // 缩放 - 配置存储的是百分比值（100 = 100%）
  // 兼容处理：如果存储的是小数格式（0.1-5.0），转换为百分比
  let scale = live2dConfig.scale || 100; // 默认 100%
  if (scale > 0 && scale < 10) {
    // 小数格式，转换为百分比
    scale = Math.round(scale * 100);
  }
  // 确保在有效范围内
  scale = Math.max(10, Math.min(500, scale));

  document.getElementById('modelScale').value = scale;
  document.getElementById('modelScaleValue').textContent = `${scale}%`;

  // 位置 - 范围 0-100
  const posX = Math.max(0, Math.min(100, live2dConfig.posX ?? 50));
  const posY = Math.max(0, Math.min(100, live2dConfig.posY ?? 50));

  document.getElementById('modelPosX').value = posX;
  document.getElementById('modelPosY').value = posY;
  document.getElementById('modelPosXValue').textContent = `${posX}%`;
  document.getElementById('modelPosYValue').textContent = `${posY}%`;

  // 鼠标跟随
  document.getElementById('mouseFollow').checked = live2dConfig.followEnabled !== false;

  // 固定位置
  document.getElementById('lockPosition').checked = live2dConfig.lockPosition === true;

  // 壁纸设置
  loadWallpaperSettings();

  console.log('[Game] Loaded customize settings, scale:', scale, 'posX:', posX, 'posY:', posY);
}

function saveCustomizeSettings() {
  try {
    // 保存 Live2D 配置
    const live2dConfig = {
      scale: parseInt(document.getElementById('modelScale').value),
      posX: parseInt(document.getElementById('modelPosX').value),
      posY: parseInt(document.getElementById('modelPosY').value),
      followEnabled: document.getElementById('mouseFollow').checked,
      lockPosition: document.getElementById('lockPosition').checked
    };
    
    localStorage.setItem('live2dConfig', JSON.stringify(live2dConfig));

    // 应用设置到 Live2D 模型
    if (live2DManager && live2DManager.isInitialized) {
      const scaleValue = live2dConfig.scale / 100; // 转换为 0.1-5.0
      live2DManager.setScale(scaleValue);
      live2DManager.setPosition(live2dConfig.posX, live2dConfig.posY);
      live2DManager.setFollowEnabled(live2dConfig.followEnabled);
      live2DManager.setLockPosition(live2dConfig.lockPosition);
      console.log('[Game] 应用 Live2D 配置 - 缩放:', scaleValue, '位置:', live2dConfig.posX, live2dConfig.posY);
    }
    
    // 保存壁纸设置
    const wallpaperEnabled = document.getElementById('wallpaperEnabled').checked;
    localStorage.setItem('wallpaper_enabled', wallpaperEnabled ? 'true' : 'false');
    
    if (wallpaperEnabled) {
      applyWallpaper();
    } else {
      removeWallpaper();
    }
    
    addSystemMessage('设置已保存');
    closeCustomize();
    
    console.log('[Game] Customize settings saved:', live2dConfig);
  } catch (err) {
    console.error('[Game] Save customize settings error:', err);
    addSystemMessage('保存设置失败');
  }
}

// ==================== 壁纸功能 ====================

function loadWallpaperSettings() {
  const wallpaperName = localStorage.getItem('wallpaper_name') || '未设置';
  const wallpaperEnabled = localStorage.getItem('wallpaper_enabled') !== 'false';
  
  document.getElementById('currentWallpaperName').textContent = wallpaperName;
  document.getElementById('wallpaperEnabled').checked = wallpaperEnabled;
}

function importWallpaper() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,.png,.jpg,.jpeg,.gif,.webp';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
      // 检查文件大小
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        addSystemMessage('图片太大，请选择小于 10MB 的图片');
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const base64Data = event.target.result;
          
          // 保存壁纸数据
          localStorage.setItem('wallpaper_data', base64Data);
          localStorage.setItem('wallpaper_name', file.name);
          localStorage.setItem('wallpaper_enabled', 'true');
          
          // 更新 UI
          document.getElementById('currentWallpaperName').textContent = file.name;
          document.getElementById('wallpaperEnabled').checked = true;
          
          // 应用壁纸
          applyWallpaper();
          
          addSystemMessage('壁纸已导入');
        } catch (err) {
          console.error('[Game] Save wallpaper error:', err);
          addSystemMessage('壁纸保存失败');
        }
      };
      
      reader.onerror = () => {
        addSystemMessage('读取文件失败');
      };
      
      reader.readAsDataURL(file);
      
    } catch (err) {
      console.error('[Game] Import wallpaper error:', err);
      addSystemMessage(`导入失败: ${err.message}`);
    }
  };
  
  input.click();
}

function deleteWallpaper() {
  // 清除壁纸数据
  localStorage.removeItem('wallpaper_data');
  localStorage.removeItem('wallpaper_name');
  localStorage.setItem('wallpaper_enabled', 'false');
  
  // 更新 UI
  document.getElementById('currentWallpaperName').textContent = '未设置';
  document.getElementById('wallpaperEnabled').checked = false;
  
  // 移除壁纸
  removeWallpaper();
  
  addSystemMessage('壁纸已删除');
}

function toggleWallpaper(enabled) {
  localStorage.setItem('wallpaper_enabled', enabled ? 'true' : 'false');
  
  if (enabled) {
    applyWallpaper();
  } else {
    removeWallpaper();
  }
}

function applyWallpaper() {
  const wallpaperData = localStorage.getItem('wallpaper_data');
  const wallpaperEnabled = localStorage.getItem('wallpaper_enabled') !== 'false';
  
  const gameLayout = document.querySelector('.game-layout');
  if (!gameLayout) return;
  
  if (wallpaperEnabled && wallpaperData) {
    gameLayout.style.backgroundImage = `url(${wallpaperData})`;
    gameLayout.style.backgroundSize = 'cover';
    gameLayout.style.backgroundPosition = 'center';
    gameLayout.style.backgroundRepeat = 'no-repeat';
  } else {
    removeWallpaper();
  }
}

function removeWallpaper() {
  const gameLayout = document.querySelector('.game-layout');
  if (!gameLayout) return;
  
  // 恢复默认渐变背景
  gameLayout.style.backgroundImage = 'none';
  gameLayout.style.background = 'linear-gradient(135deg, #fff5f7 0%, #ffe4ec 50%, #ffd6e0 100%)';
}

function updateModelScale(value) {
  // 更新显示值
  const displayValue = Math.max(10, Math.min(500, parseInt(value)));
  document.getElementById('modelScaleValue').textContent = `${displayValue}%`;

  // 保存配置
  saveLive2DConfig('scale', displayValue);

  // 直接应用到 Live2D（不需要重新加载配置）
  if (live2DManager && live2DManager.isInitialized) {
    const scaleValue = displayValue / 100; // 转换为 0.1-5.0
    live2DManager.setScale(scaleValue);
    console.log('[Live2D] 实时更新缩放:', scaleValue, '(滑块值:', displayValue, ')');
  }
}

function updateModelPosX(value) {
  const displayValue = parseInt(value);
  document.getElementById('modelPosXValue').textContent = `${displayValue}%`;
  saveLive2DConfig('posX', displayValue);

  // 直接应用到 Live2D
  if (live2DManager && live2DManager.isInitialized) {
    live2DManager.setPosition(displayValue, live2DManager.config.posY ?? 50);
  }
}

function updateModelPosY(value) {
  const displayValue = parseInt(value);
  document.getElementById('modelPosYValue').textContent = `${displayValue}%`;
  saveLive2DConfig('posY', displayValue);

  // 直接应用到 Live2D
  if (live2DManager && live2DManager.isInitialized) {
    live2DManager.setPosition(live2DManager.config.posX ?? 50, displayValue);
  }
}

function toggleMouseFollow(checked) {
  saveLive2DConfig('followEnabled', checked);

  // 更新 Live2D 跟随状态（Live2D 模式）
  if (live2DManager && live2DManager.isInitialized) {
    live2DManager.setFollowEnabled(checked);
  }

  // 更新图片模式跟随状态
  if (live2DFollow) {
    live2DFollow.enabled = checked;
  }

  if (!checked) {
    // 如果关闭跟随，重置目标位置
    targetX = 0;
    targetY = 0;
  }
}

function toggleLockPosition(checked) {
  saveLive2DConfig('lockPosition', checked);
}

function saveLive2DConfig(key, value) {
  const config = JSON.parse(localStorage.getItem('live2dConfig') || '{}');
  config[key] = value;
  localStorage.setItem('live2dConfig', JSON.stringify(config));
}

function applyLive2DConfig() {
  const config = JSON.parse(localStorage.getItem('live2dConfig') || '{}');
  console.log('[Live2D] 应用配置:', config);

  // 更新 Live2D 管理器配置
  if (live2DManager && live2DManager.isInitialized) {
    // 缩放值：范围 10-500，转换为 0.1-5.0
    const scaleValue = (config.scale || 100) / 100;
    console.log('[Live2D] 应用缩放:', scaleValue, '来自配置:', config.scale);

    live2DManager.setScale(scaleValue);

    // 位置：范围 0-100
    const posX = config.posX ?? 50;
    const posY = config.posY ?? 50;
    live2DManager.setPosition(posX, posY);

    // 鼠标跟随
    live2DManager.setFollowEnabled(config.followEnabled !== false);
    live2DManager.setLockPosition(config.lockPosition === true);

    console.log('[Live2D] 配置应用完成 - 缩放:', scaleValue, '位置:', posX, posY);
  }

  // 更新图片模型配置
  if (live2DModel) {
    live2DModel.config = config;

    // 更新跟随设置
    if (live2DFollow) {
      live2DFollow.smoothing = config.followSensitivity || 0.08;
      live2DFollow.enabled = config.followEnabled !== false;
    }
  }
}

async function importLive2DModel() {
  // 创建选择对话框
  const choice = await showImportChoice();
  
  if (choice === 'image') {
    // 导入图片
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.png,.jpg,.jpeg,.gif,.webp';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          // 检查文件大小（localStorage 限制约 5MB）
          const maxSize = 4 * 1024 * 1024; // 4MB
          if (file.size > maxSize) {
            addSystemMessage('图片太大，请选择小于 4MB 的图片');
            return;
          }
          
          // 读取图片文件并转为 base64
          const reader = new FileReader();
          reader.onload = async (event) => {
            try {
              const base64Data = event.target.result;
              console.log('[Game] Image loaded, base64 length:', base64Data.length);
              
              // 尝试保存到 localStorage
              try {
                localStorage.setItem('live2d_model_data', base64Data);
                localStorage.setItem('live2d_model_name', file.name);
                localStorage.setItem('live2d_model_type', 'image');
              } catch (storageErr) {
                console.error('[Game] localStorage save error:', storageErr);
                addSystemMessage('存储空间不足，请清理浏览器缓存后重试');
                return;
              }
              
              // 更新 UI
              const nameEl = document.getElementById('currentModelName');
              if (nameEl) nameEl.textContent = file.name;

              addSystemMessage('角色图片已导入');

              // 重置缩放和位置 UI
              document.getElementById('modelScale').value = 100;
              document.getElementById('modelScaleValue').textContent = '100%';
              document.getElementById('modelPosX').value = 50;
              document.getElementById('modelPosXValue').textContent = '50%';
              document.getElementById('modelPosY').value = 50;
              document.getElementById('modelPosYValue').textContent = '50%';

              // 清除之前的配置
              localStorage.removeItem('live2dConfig');

              // 重新初始化 Live2D
              stopLive2DRender();
              live2DModel = null;
              await initLive2D();
            } catch (err) {
              console.error('[Game] Import image error:', err);
              addSystemMessage(`导入失败: ${err.message}`);
            }
          };
          reader.onerror = (err) => {
            console.error('[Game] FileReader error:', err);
            addSystemMessage('读取文件失败');
          };
          reader.readAsDataURL(file);
          
        } catch (err) {
          console.error('导入图片失败:', err);
          addSystemMessage(`导入失败: ${err.message}`);
        }
      }
    };
    input.click();
  } else if (choice === 'live2d') {
    // 导入 Live2D 模型（通过 Electron IPC）
    try {
      if (window.electronAPI && window.electronAPI.selectLive2DModel) {
        const selectedResult = await window.electronAPI.selectLive2DModel();
        if (!selectedResult) return;
        
        addSystemMessage('正在导入模型...');
        
        // 处理返回结果
        // 可能是字符串路径（旧格式）或对象 { modelDir, selectedFile }（新格式）
        let modelDir, selectedFile;
        if (typeof selectedResult === 'string') {
          modelDir = selectedResult;
        } else {
          modelDir = selectedResult.modelDir;
          selectedFile = selectedResult.selectedFile;
        }
        
        console.log('[Game] Selected model dir:', modelDir, 'File:', selectedFile);
        
        // 导入模型到应用目录
        let importedPath = modelDir;
        if (window.electronAPI.importLive2DModel) {
          importedPath = await window.electronAPI.importLive2DModel(modelDir);
          if (!importedPath) {
            addSystemMessage('模型导入失败');
            return;
          }
        }
        
        // 加载模型配置获取名称
        // 如果用户选择了特定文件，传递对象格式
        const loadParam = selectedFile 
          ? { modelDir: importedPath, selectedFile } 
          : importedPath;
        const modelConfig = await window.electronAPI.loadLive2DModel(loadParam);
        const modelName = modelConfig?.name || modelConfig?.ModelName || importedPath.split(/[\\/]/).pop();
        
        localStorage.setItem('live2d_model_path', importedPath);
        localStorage.setItem('live2d_model_name', modelName);
        localStorage.setItem('live2d_model_type', 'live2d');
        
        // 添加到模型列表
        const savedList = localStorage.getItem('live2d_model_list');
        let modelList = savedList ? JSON.parse(savedList) : [];
        const existingIndex = modelList.findIndex(m => m.path === importedPath);
        const modelInfo = {
          path: importedPath,
          name: modelName,
          updatedAt: new Date().toISOString()
        };
        if (existingIndex >= 0) {
          modelList[existingIndex] = modelInfo;
        } else {
          modelList.push(modelInfo);
        }
        localStorage.setItem('live2d_model_list', JSON.stringify(modelList));
        
        // 更新 UI
        const nameEl = document.getElementById('currentModelName');
        if (nameEl) nameEl.textContent = modelName;
        
        addSystemMessage('Live2D 模型已导入');

        // 重置缩放和位置 UI
        document.getElementById('modelScale').value = 100;
        document.getElementById('modelScaleValue').textContent = '100%';
        document.getElementById('modelPosX').value = 50;
        document.getElementById('modelPosXValue').textContent = '50%';
        document.getElementById('modelPosY').value = 50;
        document.getElementById('modelPosYValue').textContent = '50%';

        // 清除之前的配置
        localStorage.removeItem('live2dConfig');

        // 重新初始化 Live2D
        stopLive2DRender();
        live2DModel = null;
        await initLive2D();
      } else {
        addSystemMessage('Live2D 模型导入需要在桌面应用中使用');
      }
    } catch (err) {
      console.error('导入 Live2D 模型失败:', err);
      addSystemMessage(`导入失败: ${err.message}`);
    }
  }
}

// 显示导入选择对话框
function showImportChoice() {
  return new Promise((resolve) => {
    // 创建对话框
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
    `;
    
    const dialog = document.createElement('div');
    dialog.style.cssText = `
      background: white;
      border-radius: 12px;
      padding: 24px;
      max-width: 320px;
      text-align: center;
    `;
    
    dialog.innerHTML = `
      <h3 style="margin: 0 0 16px; color: #333;">选择导入类型</h3>
      <div style="display: flex; gap: 12px; justify-content: center;">
        <button id="importImageBtn" style="
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
          color: white;
          cursor: pointer;
          font-size: 14px;
        ">角色图片</button>
        <button id="importLive2DBtn" style="
          padding: 12px 24px;
          border: none;
          border-radius: 8px;
          background: linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%);
          color: white;
          cursor: pointer;
          font-size: 14px;
        ">Live2D 模型</button>
      </div>
      <button id="cancelImportBtn" style="
        margin-top: 16px;
        padding: 8px 16px;
        border: 1px solid #ddd;
        border-radius: 6px;
        background: white;
        color: #666;
        cursor: pointer;
      ">取消</button>
    `;
    
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    
    // 事件绑定
    document.getElementById('importImageBtn').onclick = () => {
      document.body.removeChild(overlay);
      resolve('image');
    };
    document.getElementById('importLive2DBtn').onclick = () => {
      document.body.removeChild(overlay);
      resolve('live2d');
    };
    document.getElementById('cancelImportBtn').onclick = () => {
      document.body.removeChild(overlay);
      resolve(null);
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        resolve(null);
      }
    };
  });
}

function resetLive2DModel() {
  console.log('[Game] Resetting Live2D model...');
  
  // 清除模型数据
  localStorage.removeItem('live2d_model_data');
  localStorage.removeItem('live2d_model_name');
  localStorage.removeItem('live2d_model_path');
  localStorage.removeItem('live2d_model_type');
  
  // 重置为默认配置
  const defaultConfig = {
    scale: 100,
    posX: 0,
    posY: 0,
    followEnabled: true,
    lockPosition: false,
    followSensitivity: 0.08
  };
  localStorage.setItem('live2dConfig', JSON.stringify(defaultConfig));
  
  // 更新 UI
  const nameEl = document.getElementById('currentModelName');
  if (nameEl) nameEl.textContent = '未设置';
  
  const scaleEl = document.getElementById('modelScale');
  if (scaleEl) scaleEl.value = 100;
  const scaleValueEl = document.getElementById('modelScaleValue');
  if (scaleValueEl) scaleValueEl.textContent = '100%';
  
  const posXEl = document.getElementById('modelPosX');
  if (posXEl) posXEl.value = 0;
  const posXValueEl = document.getElementById('modelPosXValue');
  if (posXValueEl) posXValueEl.textContent = '0%';
  
  const posYEl = document.getElementById('modelPosY');
  if (posYEl) posYEl.value = 0;
  const posYValueEl = document.getElementById('modelPosYValue');
  if (posYValueEl) posYValueEl.textContent = '0%';
  
  const followEl = document.getElementById('mouseFollow');
  if (followEl) followEl.checked = true;
  
  const lockEl = document.getElementById('lockPosition');
  if (lockEl) lockEl.checked = false;
  
  // 停止渲染并重新初始化
  stopLive2DRender();
  live2DModel = null;
  
  addSystemMessage('模型已重置');
}

async function deleteCurrentModel() {
  // 确认删除
  if (!confirm('确定要删除当前模型吗？')) return;
  
  console.log('[Game] Deleting current Live2D model...');
  
  // 先获取当前模型路径（在清除之前）
  const modelPath = localStorage.getItem('live2d_model_path');
  
  // 停止渲染
  stopLive2DRender();
  live2DModel = null;
  
  // 清除所有模型数据
  localStorage.removeItem('live2d_model_data');
  localStorage.removeItem('live2d_model_name');
  localStorage.removeItem('live2d_model_path');
  localStorage.removeItem('live2d_model_type');
  
  // 从模型列表中移除
  if (modelPath) {
    // 从文件系统中删除
    if (window.electronAPI && window.electronAPI.deleteLive2DModel) {
      window.electronAPI.deleteLive2DModel(modelPath);
    }
    
    // 更新模型列表
    const savedList = localStorage.getItem('live2d_model_list');
    if (savedList) {
      const list = JSON.parse(savedList);
      const newList = list.filter(m => m.path !== modelPath);
      localStorage.setItem('live2d_model_list', JSON.stringify(newList));
    }
  }
  
  // 更新 UI
  const nameEl = document.getElementById('currentModelName');
  if (nameEl) nameEl.textContent = '未设置';
  
  addSystemMessage('模型已删除');
}

// ==================== 全局暴露 ====================

window.sendMessage = sendMessage;
window.handleKeyDown = handleKeyDown;
window.goBack = goBack;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.closeSettingsOnBg = closeSettingsOnBg;
window.saveVolume = saveVolume;
window.openMemory = openMemory;
window.closeMemory = closeMemory;
window.toggleStats = toggleStats;
window.saveGame = saveGame;
window.loadGame = loadGame;
window.exportSave = exportSave;
window.importSave = importSave;
window.openChatPanel = openChatPanel;
window.closeChatPanel = closeChatPanel;
window.endChat = endChat;
window.openCustomize = openCustomize;
window.closeCustomize = closeCustomize;
window.closeCustomizeOnBg = closeCustomizeOnBg;
window.saveCustomizeSettings = saveCustomizeSettings;
window.updateModelScale = updateModelScale;
window.updateModelPosX = updateModelPosX;
window.updateModelPosY = updateModelPosY;
window.toggleMouseFollow = toggleMouseFollow;
window.toggleLockPosition = toggleLockPosition;
window.importLive2DModel = importLive2DModel;
window.resetLive2DModel = resetLive2DModel;
window.deleteCurrentModel = deleteCurrentModel;
window.importWallpaper = importWallpaper;
window.deleteWallpaper = deleteWallpaper;
window.toggleWallpaper = toggleWallpaper;

// ==================== 页面加载 ====================

document.addEventListener('DOMContentLoaded', init);

// 监听浏览器返回操作，弹出设置弹窗
window.addEventListener('popstate', (event) => {
  event.preventDefault();
  openSettings();
  // 重新添加历史记录，防止真正退出
  history.pushState(null, '', location.href);
});

// 初始化时添加一个历史记录
history.pushState(null, '', location.href);
