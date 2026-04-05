// Live2D模型渲染器

class Live2DRenderer {
  constructor() {
    this.canvas = null;
    this.context = null;
    this.model = null;
    this.scale = 1;
    this.position = { x: 0, y: 0 };
    this.anchor = { x: 0.5, y: 0.5 };
  }

  init(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
  }

  setModel(modelData) {
    this.model = modelData;
  }

  setScale(scale) {
    this.scale = scale;
  }

  setPosition(x, y) {
    this.position = { x, y };
  }

  setAnchor(x, y) {
    this.anchor = { x, y };
  }

  render(params = {}) {
    if (!this.context || !this.model) return;

    const ctx = this.context;
    const { width, height } = this.canvas;

    ctx.clearRect(0, 0, width, height);
    ctx.save();

    const centerX = width / 2 + this.position.x;
    const centerY = height / 2 + this.position.y;

    ctx.translate(centerX, centerY);
    ctx.scale(this.scale, this.scale);

    if (params.headX !== undefined) {
      ctx.rotate((params.headX || 0) * Math.PI / 180);
    }

    if (this.model.textures && this.model.textures.length > 0) {
      this.drawModel(params);
    }

    ctx.restore();
  }

  drawModel(params) {
    if (!this.context) return;

    const ctx = this.context;
    const texture = this.model.textures[0];

    if (!texture) return;

    if (texture instanceof HTMLImageElement || texture.complete) {
      const img = texture;
      const drawWidth = img.width || this.model.layout?.width || 512;
      const drawHeight = img.height || this.model.layout?.height || 512;

      let offsetX = params.eyeLookX ? params.eyeLookX * 3 : 0;
      let offsetY = params.eyeLookY ? params.eyeLookY * 3 : 0;

      ctx.drawImage(
        img,
        -drawWidth / 2 + offsetX,
        -drawHeight / 2 + offsetY,
        drawWidth,
        drawHeight
      );
    }
  }

  clear() {
    if (this.context && this.canvas) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  dispose() {
    this.model = null;
    this.canvas = null;
    this.context = null;
  }
}

const live2DRenderer = new Live2DRenderer();
export default live2DRenderer;
