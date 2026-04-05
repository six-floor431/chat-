const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Script starting...');

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // 强制聚焦（修复焦点问题）
  forceFocus: () => ipcRenderer.invoke('force-focus'),
  
  // 安全弹窗（不会导致焦点丢失）
  showAlert: (message) => ipcRenderer.invoke('show-alert', message),

  // 页面导航
  navigateTo: (page) => ipcRenderer.send('navigate-to', page),

  // 角色文件读取（统一读取 assets/role/jntm.json）
  loadRoleFile: (roleId, fileName) => ipcRenderer.invoke('role:load-file', roleId, fileName),
  saveRoleFile: (roleId, fileName, data) => ipcRenderer.invoke('role:save-file', roleId, fileName, data),
  loadFullRoleData: () => ipcRenderer.invoke('role:load-full'),
  saveFullRoleData: (data) => ipcRenderer.invoke('role:save-full', data),

  // Live2D 模型管理
  selectLive2DModel: () => ipcRenderer.invoke('live2d-select-model'),
  loadLive2DModel: (modelPath) => ipcRenderer.invoke('live2d-load-model', modelPath),
  loadLive2DTexture: (modelPath, texPath) => ipcRenderer.invoke('live2d-load-texture', modelPath, texPath),
  getLive2DModelList: () => ipcRenderer.invoke('live2d-get-model-list'),
  deleteLive2DModel: (modelPath) => ipcRenderer.send('live2d-delete-model', modelPath),
  importLive2DModel: (sourcePath) => ipcRenderer.invoke('live2d-import-model', sourcePath),
  getLive2DServerStatus: () => ipcRenderer.invoke('live2d-get-server-status'),

  // 游戏日志 API
  gameLog: {
    clear: () => ipcRenderer.invoke('gamelog:clear'),
    write: (level, category, message, data) => ipcRenderer.invoke('gamelog:write', level, category, message, data),
    read: () => ipcRenderer.invoke('gamelog:read')
  },
  
  // TTS 服务 API
  tts: {
    start: () => ipcRenderer.invoke('tts:start'),
    stop: () => ipcRenderer.invoke('tts:stop'),
    status: () => ipcRenderer.invoke('tts:status')
  },

  // 记忆文件 API
  memoLoad: () => ipcRenderer.invoke('memo:load'),
  memoSave: (data) => ipcRenderer.invoke('memo:save', data),
  
  // 内存与性能 API
  performance: {
    getMemoryUsage: () => ipcRenderer.invoke('get-memory-usage'),
    getStats: () => ipcRenderer.invoke('get-performance-stats'),
    triggerCleanup: (aggressive) => ipcRenderer.invoke('trigger-memory-cleanup', aggressive),
    onCleanupRequest: (callback) => ipcRenderer.on('memory-cleanup', (event, data) => callback(data))
  }
});

console.log('[Preload] electronAPI exposed successfully');
