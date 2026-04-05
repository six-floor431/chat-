// Live2D鼠标跟随控制器

class Live2DFollowController {
  constructor() {
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetX = 0;
    this.targetY = 0;
    
    this.smoothing = 0.08;
    this.angleRange = {
      eyeX: 0.25,
      eyeY: 0.15,
      headX: 0.15,
      headY: 0.1
    };
    
    this.enabled = true;
    this.animationId = null;
    this.onUpdateCallback = null;
    
    this.onMouseMove = this.onMouseMove.bind(this);
    this.update = this.update.bind(this);
  }

  init(targetElement) {
    if (!targetElement) return;
    
    targetElement.addEventListener('mousemove', this.onMouseMove);
    targetElement.addEventListener('mouseleave', () => {
      this.targetX = 0;
      this.targetY = 0;
    });
    
    this.startUpdate();
  }

  destroy(targetElement) {
    if (targetElement) {
      targetElement.removeEventListener('mousemove', this.onMouseMove);
    }
    this.stopUpdate();
  }

  onMouseMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    this.targetX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.targetY = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  startUpdate() {
    if (this.animationId) return;
    this.update();
  }

  stopUpdate() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  update() {
    this.mouseX += (this.targetX - this.mouseX) * this.smoothing;
    this.mouseY += (this.targetY - this.mouseY) * this.smoothing;

    if (this.onUpdateCallback) {
      this.onUpdateCallback({
        eyeX: this.mouseX * this.angleRange.eyeX,
        eyeY: this.mouseY * this.angleRange.eyeY,
        headX: this.mouseX * this.angleRange.headX,
        headY: this.mouseY * this.angleRange.headY
      });
    }

    this.animationId = requestAnimationFrame(this.update);
  }

  setUpdateCallback(callback) {
    this.onUpdateCallback = callback;
  }

  setSmoothing(value) {
    this.smoothing = Math.max(0.01, Math.min(1, value));
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.mouseX = 0;
      this.mouseY = 0;
      this.targetX = 0;
      this.targetY = 0;
    }
  }

  getMousePosition() {
    return { x: this.mouseX, y: this.mouseY };
  }
}

const live2DFollowController = new Live2DFollowController();
export default live2DFollowController;
