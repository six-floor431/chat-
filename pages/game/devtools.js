// ==================== 开发者工具 ====================
// 用于快速测试和调试好感度/信任值系统

(function() {
  'use strict';

  // 检查是否已经在运行
  if (window.gameDevTools) {
    console.log('[DevTools] 开发者工具已存在，跳过加载');
    return;
  }

  // 开发者工具类
  class GameDevTools {
    constructor() {
      this.visible = false;
      this.panel = null;
      this.affectionInput = null;
      this.trustInput = null;
      this.stageDisplay = null;
      this.init();
    }

    init() {
      console.log('[DevTools] 初始化开发者工具...');
      this.createPanel();
      this.bindEvents();
      this.updateValues();
      console.log('[DevTools] 开发者工具初始化完成');
    }

    createPanel() {
      // 创建悬浮面板
      this.panel = document.createElement('div');
      this.panel.id = 'game-devtools';
      this.panel.innerHTML = `
        <div id="devtools-toggle">🔧 开发者工具</div>
        <div id="devtools-content">
          <div class="devtools-header">
            <h3>开发者工具</h3>
            <button class="devtools-close">×</button>
          </div>

          <div class="devtools-section">
            <label class="devtools-label">
              <span>好感度: <span id="devtools-affection-value">0</span></span>
              <input type="range" id="devtools-affection-slider" min="-100" max="1000" value="0">
              <input type="number" id="devtools-affection-input" min="-100" max="1000" value="0" class="devtools-number">
            </label>
            <div class="devtools-presets">
              <button data-affection="-20">厌恶 (-20)</button>
              <button data-affection="0">初识 (0)</button>
              <button data-affection="50">熟悉 (50)</button>
              <button data-affection="85">亲密 (85)</button>
              <button data-affection="100">病娇 (100)</button>
            </div>
          </div>

          <div class="devtools-section">
            <label class="devtools-label">
              <span>信任值: <span id="devtools-trust-value">0</span></span>
              <input type="range" id="devtools-trust-slider" min="-100" max="100" value="0">
              <input type="number" id="devtools-trust-input" min="-100" max="100" value="0" class="devtools-number">
            </label>
            <div class="devtools-presets">
              <button data-trust="-50">不信任 (-50)</button>
              <button data-trust="0">普通 (0)</button>
              <button data-trust="50">信任 (50)</button>
              <button data-trust="100">完全信任 (100)</button>
            </div>
          </div>

          <div class="devtools-section">
            <div class="devtools-info">
              <strong>当前阶段:</strong> <span id="devtools-stage">初识</span>
            </div>
            <div class="devtools-info">
              <strong>阶段说明:</strong> <span id="devtools-stage-desc">好感度 -19 到 20</span>
            </div>
          </div>

          <div class="devtools-section">
            <button id="devtools-apply" class="devtools-btn primary">应用更改</button>
            <button id="devtools-reset" class="devtools-btn">重置为初始值</button>
          </div>

          <div class="devtools-section">
            <button id="devtools-export" class="devtools-btn">导出当前存档</button>
            <button id="devtools-clear-memo" class="devtools-btn warning">清空记忆</button>
          </div>
        </div>
      `;

      // 添加样式
      this.addStyles();

      // 添加到页面
      document.body.appendChild(this.panel);
    }

    addStyles() {
      if (document.getElementById('devtools-styles')) {
        return;
      }

      const styles = document.createElement('style');
      styles.id = 'devtools-styles';
      styles.textContent = `
        #game-devtools {
          position: fixed;
          top: 20px;
          left: 20px;
          z-index: 1000;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          font-size: 13px;
        }

        #devtools-toggle {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 12px 20px;
          border-radius: 25px;
          cursor: pointer;
          font-weight: 600;
          box-shadow: 0 4px 16px rgba(102, 126, 234, 0.4);
          transition: all 0.3s ease;
          user-select: none;
        }

        #devtools-toggle:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
        }

        #devtools-content {
          display: none;
          position: absolute;
          top: 60px;
          left: 0;
          width: 320px;
          background: rgba(30, 30, 40, 0.95);
          backdrop-filter: blur(20px);
          border-radius: 16px;
          padding: 20px;
          color: #fff;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        #devtools-content.show {
          display: block;
          animation: slideDown 0.3s ease;
        }

        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .devtools-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .devtools-header h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          background: linear-gradient(135deg, #667eea, #764ba2);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .devtools-close {
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: #fff;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          transition: all 0.2s;
        }

        .devtools-close:hover {
          background: rgba(255, 100, 100, 0.3);
        }

        .devtools-section {
          margin-bottom: 20px;
        }

        .devtools-section:last-child {
          margin-bottom: 0;
        }

        .devtools-label {
          display: flex;
          flex-direction: column;
          gap: 8px;
          font-size: 13px;
        }

        .devtools-label span {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        #devtools-affection-value,
        #devtools-trust-value {
          font-weight: 600;
          color: #667eea;
        }

        .devtools-label input[type="range"] {
          width: 100%;
          height: 6px;
          -webkit-appearance: none;
          background: rgba(255, 255, 255, 0.1);
          border-radius: 3px;
          outline: none;
        }

        .devtools-label input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 18px;
          height: 18px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.2s;
        }

        .devtools-label input[type="range"]::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }

        .devtools-number {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 8px;
          color: #fff;
          padding: 8px 12px;
          font-size: 13px;
          width: 100%;
          margin-top: 4px;
          outline: none;
          transition: border-color 0.2s;
        }

        .devtools-number:focus {
          border-color: #667eea;
        }

        .devtools-presets {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px;
          margin-top: 10px;
        }

        .devtools-presets button {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #fff;
          padding: 8px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          transition: all 0.2s;
        }

        .devtools-presets button:hover {
          background: rgba(102, 126, 234, 0.3);
          border-color: rgba(102, 126, 234, 0.5);
        }

        .devtools-info {
          background: rgba(255, 255, 255, 0.05);
          padding: 10px 12px;
          border-radius: 8px;
          font-size: 12px;
          line-height: 1.6;
        }

        .devtools-info strong {
          color: #667eea;
        }

        .devtools-btn {
          width: 100%;
          padding: 10px 16px;
          border: none;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          background: rgba(255, 255, 255, 0.1);
          color: #fff;
          margin-bottom: 8px;
        }

        .devtools-btn:last-child {
          margin-bottom: 0;
        }

        .devtools-btn:hover {
          transform: translateY(-2px);
        }

        .devtools-btn.primary {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        }

        .devtools-btn.warning {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          box-shadow: 0 4px 12px rgba(245, 87, 108, 0.3);
        }
      `;
      document.head.appendChild(styles);
    }

    bindEvents() {
      const toggle = this.panel.querySelector('#devtools-toggle');
      const content = this.panel.querySelector('#devtools-content');
      const close = this.panel.querySelector('.devtools-close');

      // 切换显示/隐藏
      toggle.addEventListener('click', () => {
        this.visible = !this.visible;
        content.classList.toggle('show', this.visible);
      });

      // 关闭
      close.addEventListener('click', () => {
        this.visible = false;
        content.classList.remove('show');
      });

      // 好感度滑块
      this.affectionSlider = this.panel.querySelector('#devtools-affection-slider');
      this.affectionInput = this.panel.querySelector('#devtools-affection-input');
      this.affectionSlider.addEventListener('input', () => {
        this.affectionInput.value = this.affectionSlider.value;
        this.updateStageDisplay();
      });
      this.affectionInput.addEventListener('input', () => {
        this.affectionSlider.value = this.affectionInput.value;
        this.updateStageDisplay();
      });

      // 信任值滑块
      this.trustSlider = this.panel.querySelector('#devtools-trust-slider');
      this.trustInput = this.panel.querySelector('#devtools-trust-input');
      this.trustSlider.addEventListener('input', () => {
        this.trustInput.value = this.trustSlider.value;
        this.updateStageDisplay();
      });
      this.trustInput.addEventListener('input', () => {
        this.trustSlider.value = this.trustInput.value;
        this.updateStageDisplay();
      });

      // 预设按钮
      this.panel.querySelectorAll('.devtools-presets button').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.affection !== undefined) {
            this.affectionSlider.value = btn.dataset.affection;
            this.affectionInput.value = btn.dataset.affection;
          }
          if (btn.dataset.trust !== undefined) {
            this.trustSlider.value = btn.dataset.trust;
            this.trustInput.value = btn.dataset.trust;
          }
          this.updateStageDisplay();
        });
      });

      // 应用按钮
      this.panel.querySelector('#devtools-apply').addEventListener('click', () => {
        this.applyChanges();
      });

      // 重置按钮
      this.panel.querySelector('#devtools-reset').addEventListener('click', () => {
        this.resetValues();
      });

      // 导出存档
      this.panel.querySelector('#devtools-export').addEventListener('click', () => {
        this.exportSave();
      });

      // 清空记忆
      this.panel.querySelector('#devtools-clear-memo').addEventListener('click', () => {
        this.clearMemories();
      });
    }

    async updateValues() {
      try {
        // 从 localStorage 读取当前值
        const charSetting = JSON.parse(localStorage.getItem('aiGameCharacterSetting') || '{}');
        const affection = charSetting.affection || 0;
        const trust = charSetting.trust || 0;

        // 更新输入框
        this.affectionSlider.value = affection;
        this.affectionInput.value = affection;
        this.trustSlider.value = trust;
        this.trustInput.value = trust;

        // 更新显示
        this.panel.querySelector('#devtools-affection-value').textContent = affection;
        this.panel.querySelector('#devtools-trust-value').textContent = trust;

        // 更新阶段显示
        this.updateStageDisplay();

        console.log('[DevTools] 值已更新:', { affection, trust });
      } catch (e) {
        console.error('[DevTools] 更新值失败:', e);
      }
    }

    updateStageDisplay() {
      const affection = parseInt(this.affectionSlider.value);
      const trust = parseInt(this.trustSlider.value);

      let stage = '';
      let desc = '';

      // 病娇（优先级最高）
      if (affection >= 100 && trust < 0) {
        stage = '病娇';
        desc = '好感度 ≥ 100 且 信任值 < 0';
      }
      // 亲密
      else if (affection >= 71 && trust >= 0 && trust <= 100) {
        stage = '亲密';
        desc = '好感度 71-1000 且 信任值 0-100';
      }
      // 熟悉
      else if (affection >= 21) {
        stage = '熟悉';
        desc = '好感度 21-70';
      }
      // 初识
      else if (affection >= -19) {
        stage = '初识';
        desc = '好感度 -19 到 20';
      }
      // 厌恶
      else {
        stage = '厌恶';
        desc = '好感度 ≤ -20';
      }

      this.panel.querySelector('#devtools-stage').textContent = stage;
      this.panel.querySelector('#devtools-stage-desc').textContent = desc;
    }

    async applyChanges() {
      try {
        const affection = parseInt(this.affectionInput.value);
        const trust = parseInt(this.trustInput.value);

        // 检查是否有 gameCharacterManager（游戏页面暴露的角色管理器）
        const charManager = window.gameCharacterManager;

        if (charManager) {
          console.log('[DevTools] 使用 gameCharacterManager 更新数据...');

          // 直接修改实例属性
          charManager.affection = affection;
          charManager.trust = trust;

          // 重新计算阶段
          charManager.currentStage = charManager.calculateStage(affection, trust);

          // 保存到文件和 localStorage
          await charManager.saveAffectionAndTrust();

          console.log('[DevTools] gameCharacterManager 已更新:', {
            affection: charManager.affection,
            trust: charManager.trust,
            stage: charManager.currentStage
          });
        } else {
          console.warn('[DevTools] gameCharacterManager 不可用，尝试使用直接文件访问...');

          // 直接更新文件
          if (window.electronAPI && window.electronAPI.loadFullRoleData && window.electronAPI.saveFullRoleData) {
            try {
              const fullData = await window.electronAPI.loadFullRoleData();
              if (fullData) {
                fullData.affection = affection;
                fullData.trust = trust;
                await window.electronAPI.saveFullRoleData(fullData);
                console.log('[DevTools] 文件已更新');
              }
            } catch (e) {
              console.warn('[DevTools] 更新文件失败:', e);
            }
          }

          // 更新 localStorage
          localStorage.setItem('aiGameCharacterSetting', JSON.stringify({
            affection: affection,
            trust: trust,
            stage: this.panel.querySelector('#devtools-stage').textContent
          }));
        }

        // 更新显示
        this.panel.querySelector('#devtools-affection-value').textContent = affection;
        this.panel.querySelector('#devtools-trust-value').textContent = trust;

        // 触发游戏页面更新（如果存在）
        if (typeof updateStats === 'function') {
          updateStats(affection, trust);
        }

        // 更新好感度弹窗中的阶段显示
        if (typeof loadCharacterInfo === 'function') {
          await loadCharacterInfo();
        }

        console.log('[DevTools] 已应用更改:', { affection, trust });
        alert(`✅ 已应用更改\n\n好感度: ${affection}\n信任值: ${trust}\n阶段: ${this.panel.querySelector('#devtools-stage').textContent}`);
      } catch (e) {
        console.error('[DevTools] 应用更改失败:', e);
        alert('❌ 应用更改失败: ' + e.message);
      }
    }

    async resetValues() {
      if (!confirm('确定要重置为初始值吗？\n\n好感度: 0\n信任值: 0')) {
        return;
      }

      this.affectionSlider.value = 0;
      this.affectionInput.value = 0;
      this.trustSlider.value = 0;
      this.trustInput.value = 0;

      this.updateStageDisplay();
      await this.applyChanges();

      console.log('[DevTools] 已重置为初始值');
    }

    async exportSave() {
      try {
        if (window.electronAPI && window.electronAPI.loadFullRoleData) {
          const data = await window.electronAPI.loadFullRoleData();
          if (data) {
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `save_${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);
            console.log('[DevTools] 存档已导出');
            alert('✅ 存档已导出');
          }
        } else {
          alert('❌ 无法导出存档：Electron API 不可用');
        }
      } catch (e) {
        console.error('[DevTools] 导出存档失败:', e);
        alert('❌ 导出存档失败: ' + e.message);
      }
    }

    async clearMemories() {
      if (!confirm('⚠️ 警告：确定要清空所有记忆吗？\n\n此操作不可撤销！')) {
        return;
      }

      try {
        // 清空 localStorage
        localStorage.setItem('aiGameMemories', JSON.stringify([]));

        // 清空文件（如果可用）
        if (window.electronAPI && window.electronAPI.memoSave) {
          const memoData = {
            version: '1.0',
            roleId: 'jntm',
            memories: [],
            metadata: {
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              totalCount: 0
            }
          };
          await window.electronAPI.memoSave(memoData);
        }

        console.log('[DevTools] 记忆已清空');
        alert('✅ 记忆已清空');
      } catch (e) {
        console.error('[DevTools] 清空记忆失败:', e);
        alert('❌ 清空记忆失败: ' + e.message);
      }
    }
  }

  // 创建实例
  window.gameDevTools = new GameDevTools();
  console.log('[DevTools] 开发者工具已加载');
})();
