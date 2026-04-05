// Live2D管理器 - 基于pixi-live2d-display实现渲染
// 支持Cubism 2.x和4.x模型

// 检查依赖
function checkDependencies() {
  const result = {
    pixi: !!window.PIXI,
    pixiVersion: window.PIXI?.VERSION || 'unknown',
    live2d: !!window.PIXI?.live2d,
    live2dModel: !!window.PIXI?.live2d?.Live2DModel,
    cubism2: typeof window.Live2D !== 'undefined',
    cubism4: typeof window.Live2DCubismCore !== 'undefined'
  };
  
  console.log('[Live2D] 依赖检查:', result);
  
  if (!result.pixi) console.error('[Live2D] PIXI.js未加载');
  if (!result.live2d) console.error('[Live2D] pixi-live2d-display未加载');
  
  return result;
}

// 等待依赖加载
async function waitForDependencies(timeout = 10000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (window.PIXI?.live2d?.Live2DModel) {
      console.log('[Live2D] 依赖已加载');
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.error('[Live2D] 依赖加载超时');
  return false;
}

// 获取Live2DModel类
function getLive2DModelClass() {
  if (window.PIXI?.live2d?.Live2DModel) {
    return window.PIXI.live2d.Live2DModel;
  }
  if (window.Live2DModel) {
    return window.Live2DModel;
  }
  throw new Error('Live2DModel未找到');
}

// 资源加载器
class Live2DResourceLoader {
  constructor() {
    this.cache = new Map();
  }
  
  async load(url) {
    if (this.cache.has(url)) {
      return this.cache.get(url);
    }
    
    // 通过Electron读取本地文件
    if (url.startsWith('live2d://')) {
      const filePath = url.replace('live2d://', '');
      const data = await window.electronAPI.loadLive2DResource(filePath);
      this.cache.set(url, data);
      return data;
    }
    
    // 网络资源
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    this.cache.set(url, data);
    return data;
  }
  
  clearCache() {
    this.cache.clear();
  }
}

// Live2D管理器类
export class Live2DManager {
  constructor() {
    this.app = null;
    this.model = null;
    this.canvas = null;
    this.container = null;
    this.resourceLoader = new Live2DResourceLoader();
    this.isInitialized = false; // 标记是否已初始化
    this.baseScale = 1.0; // 缓存基准缩放值（模型加载时计算一次，后续不再改变）

    this.config = {
      scale: 1.0,
      posX: 50,
      posY: 50,
      followMouse: true
    };

    this.speaking = false;
    this.speakingInterval = null;
    this.resizeHandler = null; // 窗口resize事件处理器
  }
  
  async init(container, config = {}) {
    this.container = container;
    this.config = { ...this.config, ...config };

    // 等待依赖
    const ready = await waitForDependencies();
    if (!ready) {
      throw new Error('Live2D依赖加载失败');
    }

    // 创建PIXI应用
    const rect = container.getBoundingClientRect();
    this.canvas = document.createElement('canvas');
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);

    this.app = new window.PIXI.Application({
      view: this.canvas,
      width: rect.width,
      height: rect.height,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      eventMode: 'static'  // 启用事件系统
    });

    // 确保舞台可以接收事件
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;

    this.loadConfig();
    this.isInitialized = true; // 标记为已初始化

    // 添加窗口 resize 监听，自适应窗口大小变化
    this.resizeHandler = () => this.handleResize();
    window.addEventListener('resize', this.resizeHandler);

    console.log('[Live2D] 初始化完成，容器尺寸:', rect.width, 'x', rect.height);
    return true;
  }

  /**
   * 处理窗口大小变化
   */
  handleResize() {
    if (!this.app || !this.container) return;

    const rect = this.container.getBoundingClientRect();

    // 更新 PIXI 应用尺寸
    this.app.renderer.resize(rect.width, rect.height);

    // 更新模型缩放（因为容器高度变化，需要重新计算 baseScale）
    if (this.model) {
      // 重新计算基准缩放
      const containerHeight = this.app.screen.height;
      const modelHeight = this.model.height || this.model.texture?.height || containerHeight;
      this.baseScale = (containerHeight * 0.8) / modelHeight;

      // 应用用户设置的缩放
      const finalScale = this.baseScale * this.config.scale;
      this.model.scale.set(finalScale);

      // 更新位置
      this.updatePosition();

      console.log('[Live2D] 窗口resize - 新尺寸:', rect.width, 'x', rect.height, ', baseScale:', this.baseScale.toFixed(4), ', finalScale:', finalScale.toFixed(4));
    }
  }
  
  async loadModel(modelPath) {
    if (!this.app) {
      throw new Error('未初始化');
    }

    // 清除旧模型
    if (this.model) {
      this.app.stage.removeChild(this.model);
      this.model.destroy();
      this.model = null;
    }

    try {
      const Live2DModel = getLive2DModelClass();

      // 加载模型
      this.model = await Live2DModel.from(modelPath);

      // 设置锚点和位置
      this.model.anchor.set(0.5, 0.5);

      // 计算并缓存基准缩放值（模型高度为容器高度的80%）
      const containerHeight = this.app.screen.height;
      const modelHeight = this.model.height || this.model.texture?.height || containerHeight;
      this.baseScale = (containerHeight * 0.8) / modelHeight;
      console.log('[Live2D] 模型加载 - 计算基准缩放:', this.baseScale.toFixed(4), '(容器高度:', containerHeight, ', 模型高度:', modelHeight, ')');

      // 应用用户设置的缩放
      const scale = this.baseScale * this.config.scale;
      console.log('[Live2D] 应用缩放:', scale.toFixed(4), '(baseScale:', this.baseScale.toFixed(4), ', userScale:', this.config.scale, ')');
      this.model.scale.set(scale);

      // 设置位置
      this.updatePosition();

      // 添加到舞台
      this.app.stage.addChild(this.model);

      // 设置交互
      this.setupHitAreas();
      this.setupEyeTracking(this.config.followMouse);

      // 保存配置
      this.saveConfig();
      console.log('[Live2D] 模型加载成功，最终缩放:', scale);

      return true;
    } catch (e) {
      console.error('[Live2D] 模型加载失败:', e);
      throw e;
    }
  }
  
  async loadModelFromBase64(base64Data) {
    // 图片模式
    if (!this.app) {
      throw new Error('未初始化');
    }

    if (this.model) {
      this.app.stage.removeChild(this.model);
      this.model.destroy();
      this.model = null;
    }

    const texture = window.PIXI.Texture.from(base64Data);
    this.model = new window.PIXI.Sprite(texture);
    this.model.anchor.set(0.5, 0.5);

    // 计算并缓存基准缩放值（图片高度为容器高度的80%）
    const containerHeight = this.app.screen.height;
    const modelHeight = this.model.height || this.model.texture?.height || containerHeight;
    this.baseScale = (containerHeight * 0.8) / modelHeight;
    console.log('[Live2D] 图片模式 - 计算基准缩放:', this.baseScale.toFixed(4), '(容器高度:', containerHeight, ', 图片高度:', modelHeight, ')');

    // 应用缩放
    const scale = this.baseScale * this.config.scale;
    console.log('[Live2D] 图片模式 - 应用缩放:', scale.toFixed(4), '(baseScale:', this.baseScale.toFixed(4), ', userScale:', this.config.scale, ')');
    this.model.scale.set(scale);
    this.updatePosition();

    this.app.stage.addChild(this.model);

    return true;
  }
  
  calculateScale() {
    // 使用缓存的基准缩放值，避免每次都重新计算导致的不稳定
    if (!this.baseScale) return 1;

    // 应用用户设置的缩放
    const finalScale = this.baseScale * this.config.scale;

    console.log('[Live2D] 计算缩放: baseScale=', this.baseScale.toFixed(4), ', userScale=', this.config.scale, ', finalScale=', finalScale.toFixed(4));

    return finalScale;
  }
  
  updatePosition() {
    if (!this.model) return;

    const width = this.app.screen.width;
    const height = this.app.screen.height;

    const x = width * (this.config.posX / 100);
    const y = height * (this.config.posY / 100);

    this.model.x = x;
    this.model.y = y;

    console.log('[Live2D] 更新位置:', x, y, '(容器尺寸:', width, height, ')');
  }
  
  setupHitAreas() {
    if (!this.model || !this.model.internalModel?.hitAreas) return;
    
    this.model.eventMode = 'static';
    this.model.cursor = 'pointer';
    
    this.model.on('pointerdown', (event) => {
      const hitAreas = this.model.internalModel.hitTest(event.data.global.x, event.data.global.y);
      if (hitAreas && hitAreas.length > 0) {
        this.playMotion(`tap_${hitAreas[0].toLowerCase()}`);
      } else {
        this.playMotion('tap_body');
      }
    });
  }
  
  setupEyeTracking(enabled) {
    if (!this.model) return;

    // 移除之前的事件监听
    if (this._mouseMoveHandler) {
      window.removeEventListener('mousemove', this._mouseMoveHandler);
      this._mouseMoveHandler = null;
    }

    // 如果锁定了位置，不允许启用眼神追踪
    if (this.config.lockPosition && enabled) {
      console.log('[Live2D] 位置已锁定，禁用眼神追踪');
      this.model.autoInteract = false;
      return;
    }

    if (enabled) {
      // 方法1：autoInteract（pixi-live2d-display 内置功能）
      this.model.autoInteract = true;

      // 方法2：手动监听（备选方案）
      this._mouseMoveHandler = (event) => {
        const rect = this.canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);

        // 调用 focus 方法
        if (typeof this.model.focus === 'function') {
          this.model.focus(x, y);
        }

        // Cubism 4.x focusController
        if (this.model.internalModel?.focusController) {
          this.model.internalModel.focusController.focus(x, y);
        }

        // Cubism 2.x coreModel
        if (this.model.internalModel?.coreModel?.setFocus) {
          this.model.internalModel.coreModel.setFocus(x, y);
        }
      };

      window.addEventListener('mousemove', this._mouseMoveHandler);
      console.log('[Live2D] 眼神追踪已启用');
    } else {
      // 禁用
      this.model.autoInteract = false;

      // 重置眼睛位置
      if (typeof this.model.focus === 'function') {
        this.model.focus(0, 0);
      }

      console.log('[Live2D] 眼神追踪已禁用');
    }
  }

  setFollowEnabled(enabled) {
    // 如果锁定了位置，不允许启用跟随
    if (this.config.lockPosition && enabled) {
      console.log('[Live2D] 位置已锁定，忽略启用跟随请求');
      this.saveConfig();
      return;
    }

    this.config.followMouse = enabled;
    this.setupEyeTracking(enabled);
    this.saveConfig();
  }

  setLockPosition(locked) {
    this.config.lockPosition = locked;

    // 如果锁定位置，禁用跟随
    if (locked) {
      console.log('[Live2D] 锁定位置，禁用鼠标跟随');
      this.config.followMouse = false;
      this.setupEyeTracking(false);
    }

    this.saveConfig();
  }

  playMotion(name) {
    if (!this.model?.internalModel?.motionManager) return;
    
    try {
      this.model.internalModel.motionManager.startMotion(name, 0);
    } catch (e) {
      console.log('[Live2D] 动作播放失败:', name);
    }
  }
  
  playExpression(name) {
    if (!this.model?.internalModel?.motionManager) return;
    
    try {
      this.model.internalModel.motionManager.startExpression(name);
    } catch (e) {
      console.log('[Live2D] 表情播放失败:', name);
    }
  }
  
  // 口型同步
  startSpeaking() {
    if (this.speaking) return;
    this.speaking = true;
    
    this.speakingInterval = setInterval(() => {
      if (!this.model) return;
      
      const value = 0.3 + Math.random() * 0.7;
      
      // Cubism 2.x
      if (this.model.internalModel?.coreModel?.setParamFloat) {
        this.model.internalModel.coreModel.setParamFloat('PARAM_MOUTH_OPEN_Y', value);
      }
      // Cubism 4.x
      if (this.model.internalModel?.coreModel?.setParameterValueById) {
        this.model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', value);
      }
    }, 100);
  }
  
  stopSpeaking() {
    if (!this.speaking) return;
    this.speaking = false;
    
    if (this.speakingInterval) {
      clearInterval(this.speakingInterval);
      this.speakingInterval = null;
    }
    
    // 重置嘴部
    if (this.model) {
      if (this.model.internalModel?.coreModel?.setParamFloat) {
        this.model.internalModel.coreModel.setParamFloat('PARAM_MOUTH_OPEN_Y', 0);
      }
      if (this.model.internalModel?.coreModel?.setParameterValueById) {
        this.model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', 0);
      }
    }
  }
  
  setScale(scale) {
    // 限制缩放范围：0.01（1%）到 5.0（500%）
    this.config.scale = Math.max(0.01, Math.min(5, scale));
    console.log('[Live2D] 设置缩放:', this.config.scale);

    if (this.model) {
      // 使用缓存的baseScale计算最终缩放
      const finalScale = this.baseScale * this.config.scale;
      console.log('[Live2D] 应用缩放:', finalScale, '(baseScale:', this.baseScale?.toFixed(4) || 'N/A', ', userScale:', this.config.scale, ')');
      this.model.scale.set(finalScale);
    }
    this.saveConfig();
  }
  
  setPosition(x, y) {
    // 限制位置范围：0-100
    this.config.posX = Math.max(0, Math.min(100, x));
    this.config.posY = Math.max(0, Math.min(100, y));
    console.log('[Live2D] 设置位置:', this.config.posX, this.config.posY);

    this.updatePosition();
    this.saveConfig();
  }
  
  loadConfig() {
    try {
      const saved = localStorage.getItem('live2dConfig');
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('[Live2D] 加载配置:', parsed);
        this.config = { ...this.config, ...parsed };

        // 检查缩放值是否合理
        if (this.config.scale && (this.config.scale < 0.1 || this.config.scale > 5)) {
          console.warn('[Live2D] 配置中的缩放值超出范围:', this.config.scale, '已重置为 1.0');
          this.config.scale = 1.0;
        }
      }
    } catch (e) {
      console.error('[Live2D] 加载配置失败:', e);
    }
  }
  
  saveConfig() {
    try {
      localStorage.setItem('live2dConfig', JSON.stringify(this.config));
    } catch (e) {
      console.error('[Live2D] 保存配置失败:', e);
    }
  }
  
  destroy() {
    this.stopSpeaking();

    if (this.model) {
      this.app?.stage.removeChild(this.model);
      this.model.destroy();
      this.model = null;
    }

    if (this.app) {
      this.app.destroy(true);
      this.app = null;
    }

    if (this.canvas && this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }

    // 移除窗口 resize 监听
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }

    this.resourceLoader.clearCache();
    this.isInitialized = false; // 标记为未初始化

    console.log('[Live2D] 已销毁');
  }
}

// 单例
let live2DManagerInstance = null;

export function getLive2DManager() {
  if (!live2DManagerInstance) {
    live2DManagerInstance = new Live2DManager();
  }
  return live2DManagerInstance;
}

// 导出单例实例
export const live2DManager = new Live2DManager();
export default Live2DManager;
