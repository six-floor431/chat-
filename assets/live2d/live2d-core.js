// Live2D核心模块

// 初始化PIXI资源协议
function initPIXIAssetsFileProtocol() {
  if (typeof PIXI === 'undefined' || !PIXI.Assets) return;

  try {
    if (PIXI.Assets.loader) {
      PIXI.Assets.loader.add({
        test: (url) => url.startsWith('file://'),
        load: async (url) => {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`加载失败: ${url}`);
          
          const extension = url.split('.').pop().toLowerCase();
          if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
            const blob = await response.blob();
            const blobUrl = URL.createObjectURL(blob);
            return PIXI.Texture.from(blobUrl);
          } else if (extension === 'json') {
            return await response.json();
          } else {
            return await response.arrayBuffer();
          }
        }
      });
    }
  } catch (e) {
    console.warn('[Live2D] 初始化协议失败:', e);
  }
}

// 自动初始化
if (typeof window !== 'undefined') {
  if (window.PIXI) {
    initPIXIAssetsFileProtocol();
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      if (window.PIXI) initPIXIAssetsFileProtocol();
    });
  }
}

class Live2DCore {
  constructor() {
    this.live2DModel = null;
    this.modelJson = null;
    this.textures = [];
    this.motions = {};
    this.isInitialized = false;
    this.modelType = null;
  }

  findModelConfigFile(modelPath, fileExists, listFiles) {
    const files = listFiles(modelPath);
    
    const model3File = files.find(f => f.endsWith('.model3.json'));
    if (model3File) return { file: model3File, type: 'cubism3' };
    
    const modelFile = files.find(f => f.endsWith('.model.json') && !f.endsWith('.model3.json'));
    if (modelFile) return { file: modelFile, type: 'cubism2' };
    
    if (files.includes('model3.json')) return { file: 'model3.json', type: 'cubism3' };
    if (files.includes('model.json')) return { file: 'model.json', type: 'cubism2' };
    
    return null;
  }

  async loadModel(modelPath, modelFile = null) {
    try {
      if (!modelFile) {
        const config = await this.findModelConfigFileAsync(modelPath);
        if (config) {
          modelFile = config.file;
          this.modelType = config.type;
        } else {
          throw new Error('找不到模型配置文件');
        }
      }
      
      const response = await fetch(`${modelPath}/${modelFile}`);
      if (!response.ok) throw new Error(`加载配置失败: ${response.status}`);
      
      this.modelJson = await response.json();
      await this.loadTextures(modelPath);
      await this.loadMotions(modelPath);

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[Live2D] 加载模型失败:', error);
      return false;
    }
  }

  async findModelConfigFileAsync(modelPath) {
    const candidates = [
      { file: 'model3.json', type: 'cubism3' },
      { file: 'model.json', type: 'cubism2' }
    ];
    
    for (const candidate of candidates) {
      try {
        const response = await fetch(`${modelPath}/${candidate.file}`, { method: 'HEAD' });
        if (response.ok) return candidate;
      } catch (e) {}
    }
    
    return null;
  }

  async loadTextures(modelPath) {
    const texturePaths = this.modelType === 'cubism3' 
      ? (this.modelJson.FileReferences?.Textures || [])
      : (this.modelJson.textures || []);
    
    for (const texPath of texturePaths) {
      try {
        const texResponse = await fetch(`${modelPath}/${texPath}`);
        if (texResponse.ok) {
          const blob = await texResponse.blob();
          const url = URL.createObjectURL(blob);
          this.textures.push(url);
        }
      } catch (e) {
        console.warn(`[Live2D] 加载纹理失败: ${texPath}`);
      }
    }
  }

  async loadMotions(modelPath) {
    const motionsConfig = this.modelType === 'cubism3'
      ? (this.modelJson.FileReferences?.Motions || {})
      : (this.modelJson.motions || {});
    
    for (const [groupName, motions] of Object.entries(motionsConfig)) {
      this.motions[groupName] = [];
      for (const motion of motions) {
        try {
          const motionFile = motion.File || motion.file;
          const response = await fetch(`${modelPath}/${motionFile}`);
          if (response.ok) {
            const data = await response.json();
            this.motions[groupName].push({ ...data, file: motionFile });
          }
        } catch (e) {}
      }
    }
  }

  getLayout() {
    return this.modelJson?.layout || { width: 512, height: 512 };
  }

  dispose() {
    this.textures.forEach(url => URL.revokeObjectURL(url));
    this.textures = [];
    this.motions = {};
    this.live2DModel = null;
    this.isInitialized = false;
    this.modelType = null;
  }
}

const live2DCore = new Live2DCore();
export default live2DCore;
