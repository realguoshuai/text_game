// -*- coding: utf-8 -*-
/**
 * 仙岛寻踪 · 高精仙侠物品图标生成器（纯 Node.js，无外部依赖）
 * 生成 2212×198 规格的 items_atlas.png 与 items_atlas.json
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const S = 64;
const BIG = 2; // 128
const PAD = 2;

// 像素画布类
class PixelCanvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Float64Array(w * h * 4); // r,g,b,a 0..255
  }

  get(x, y) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return [0, 0, 0, 0];
    const idx = (y * this.w + x) * 4;
    return [this.data[idx], this.data[idx + 1], this.data[idx + 2], this.data[idx + 3]];
  }

  set(x, y, r, g, b, a) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    const idx = (y * this.w + x) * 4;
    this.data[idx] = r;
    this.data[idx + 1] = g;
    this.data[idx + 2] = b;
    this.data[idx + 3] = a;
  }

  blend(x, y, r, g, b, a) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h || a <= 0) return;
    const idx = (y * this.w + x) * 4;
    const sa = Math.min(1, a / 255);
    const da = this.data[idx + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) return;
    this.data[idx] = (r * sa + this.data[idx] * da * (1 - sa)) / outA;
    this.data[idx + 1] = (g * sa + this.data[idx + 1] * da * (1 - sa)) / outA;
    this.data[idx + 2] = (b * sa + this.data[idx + 2] * da * (1 - sa)) / outA;
    this.data[idx + 3] = outA * 255;
  }

  fillCircle(cx, cy, r, [r1, g1, b1, a1 = 255], [r2, g2, b2, a2 = a1] = []) {
    const x0 = Math.max(0, Math.floor(cx - r - 2));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + r + 2));
    const y0 = Math.max(0, Math.floor(cy - r - 2));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r + 2));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r + 1.2) continue;
        const edge = Math.max(0, Math.min(1, r + 0.6 - d));
        if (edge <= 0) continue;
        const t = Math.max(0, Math.min(1, d / r));
        const cr = r1 + (r2 - r1) * t;
        const cg = g1 + (g2 - g1) * t;
        const cb = b1 + (b2 - b1) * t;
        const ca = (a1 + (a2 - a1) * t) * edge;
        this.blend(x, y, cr, cg, cb, ca);
      }
    }
  }

  fillEllipse(cx, cy, rx, ry, [r1, g1, b1, a1 = 255], [r2, g2, b2, a2 = a1] = [], angle = 0) {
    const maxR = Math.max(rx, ry);
    const x0 = Math.max(0, Math.floor(cx - maxR - 2));
    const x1 = Math.min(this.w - 1, Math.ceil(cx + maxR + 2));
    const y0 = Math.max(0, Math.floor(cy - maxR - 2));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + maxR + 2));
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const nx = (dx * cos + dy * sin) / rx;
        const ny = (-dx * sin + dy * cos) / ry;
        const d = Math.hypot(nx, ny);
        if (d > 1 + 1.2 / maxR) continue;
        const edge = Math.max(0, Math.min(1, (1 - d) * maxR + 0.6));
        if (edge <= 0) continue;
        const t = Math.max(0, Math.min(1, d));
        const cr = r1 + (r2 - r1) * t;
        const cg = g1 + (g2 - g1) * t;
        const cb = b1 + (b2 - b1) * t;
        const ca = (a1 + (a2 - a1) * t) * edge;
        this.blend(x, y, cr, cg, cb, ca);
      }
    }
  }

  fillPolygon(pts, [r, g, b, a = 255]) {
    let minX = this.w, maxX = 0, minY = this.h, maxY = 0;
    for (const [px, py] of pts) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    minX = Math.max(0, Math.floor(minX));
    maxX = Math.min(this.w - 1, Math.ceil(maxX));
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(this.h - 1, Math.ceil(maxY));

    const n = pts.length;
    for (let y = minY; y <= maxY; y++) {
      // 4x 超采样抗锯齿
      for (let x = minX; x <= maxX; x++) {
        let insideCount = 0;
        for (let sy = 0; sy < 2; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            const px = x + 0.25 + sx * 0.5;
            const py = y + 0.25 + sy * 0.5;
            let inside = false;
            for (let i = 0, j = n - 1; i < n; j = i++) {
              const xi = pts[i][0], yi = pts[i][1];
              const xj = pts[j][0], yj = pts[j][1];
              const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            if (inside) insideCount++;
          }
        }
        if (insideCount > 0) {
          this.blend(x, y, r, g, b, a * (insideCount / 4));
        }
      }
    }
  }

  fillLinearPoly(pts, [x1, y1], [r1, g1, b1, a1], [x2, y2], [r2, g2, b2, a2]) {
    let minX = this.w, maxX = 0, minY = this.h, maxY = 0;
    for (const [px, py] of pts) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    minX = Math.max(0, Math.floor(minX));
    maxX = Math.min(this.w - 1, Math.ceil(maxX));
    minY = Math.max(0, Math.floor(minY));
    maxY = Math.min(this.h - 1, Math.ceil(maxY));

    const n = pts.length;
    const ldx = x2 - x1, ldy = y2 - y1;
    const lsq = ldx * ldx + ldy * ldy || 1;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let insideCount = 0;
        for (let sy = 0; sy < 2; sy++) {
          for (let sx = 0; sx < 2; sx++) {
            const px = x + 0.25 + sx * 0.5;
            const py = y + 0.25 + sy * 0.5;
            let inside = false;
            for (let i = 0, j = n - 1; i < n; j = i++) {
              const xi = pts[i][0], yi = pts[i][1];
              const xj = pts[j][0], yj = pts[j][1];
              const intersect = ((yi > py) !== (yj > py)) &&
                (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
              if (intersect) inside = !inside;
            }
            if (inside) insideCount++;
          }
        }
        if (insideCount > 0) {
          const t = Math.max(0, Math.min(1, ((x - x1) * ldx + (y - y1) * ldy) / lsq));
          const cr = r1 + (r2 - r1) * t;
          const cg = g1 + (g2 - g1) * t;
          const cb = b1 + (b2 - b1) * t;
          const ca = (a1 + (a2 - a1) * t) * (insideCount / 4);
          this.blend(x, y, cr, cg, cb, ca);
        }
      }
    }
  }

  strokeLine(x0, y0, x1, y1, width, [r, g, b, a = 255]) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.ceil(len * 2);
    const rad = width / 2;
    for (let i = 0; i <= steps; i++) {
      const t = steps > 0 ? i / steps : 0;
      const cx = x0 + (x1 - x0) * t;
      const cy = y0 + (y1 - y0) * t;
      this.fillCircle(cx, cy, rad, [r, g, b, a]);
    }
  }

  addOutline(threshold = 30, [or, og, ob, oa = 220] = [20, 15, 14, 230], rad = 1.2) {
    const mask = new Uint8Array(this.w * this.h);
    for (let i = 0; i < this.w * this.h; i++) {
      if (this.data[i * 4 + 3] >= threshold) mask[i] = 1;
    }
    const out = new PixelCanvas(this.w, this.h);
    const rInt = Math.ceil(rad);

    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (mask[y * this.w + x]) continue; // 自身内部不画轮廓
        let near = false;
        for (let dy = -rInt; dy <= rInt && !near; dy++) {
          for (let dx = -rInt; dx <= rInt; dx++) {
            if (dx * dx + dy * dy <= rad * rad) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < this.w && ny >= 0 && ny < this.h && mask[ny * this.w + nx]) {
                near = true;
                break;
              }
            }
          }
        }
        if (near) {
          out.set(x, y, or, og, ob, oa);
        }
      }
    }
    // 把原有内容合并到 outline 上
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (c[3] > 0) {
          out.blend(x, y, c[0], c[1], c[2], c[3]);
        }
      }
    }
    this.data = out.data;
  }

  toBuffer() {
    const buf = Buffer.alloc(this.w * this.h * 4);
    for (let i = 0; i < this.w * this.h * 4; i++) {
      buf[i] = Math.max(0, Math.min(255, Math.round(this.data[i])));
    }
    return buf;
  }

  scaleUp(factor = 2) {
    const out = new PixelCanvas(this.w * factor, this.h * factor);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const [r, g, b, a] = this.get(x, y);
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            out.set(x * factor + dx, y * factor + dy, r, g, b, a);
          }
        }
      }
    }
    return out;
  }
}

// -----------------------------------------------------------
// 仙侠物品绘制器 (S = 64)
// -----------------------------------------------------------

function drawJinchuang() {
  // 金创药：白玉羊脂灵脂瓶 + 红色朱砂封红 + 金丝云纹系绳 + 灵丹仙露荧光
  const c = new PixelCanvas(S, S);
  // 底部柔和光晕
  c.fillCircle(32, 34, 21, [140, 240, 200, 60], [140, 240, 200, 0]);

  // 瓶身下半部（双圆弧葫芦/玉净瓶）
  c.fillCircle(32, 38, 14, [255, 255, 250, 255], [200, 215, 220, 255]);
  c.fillCircle(32, 24, 9, [255, 255, 250, 255], [210, 220, 225, 255]);
  // 瓶颈
  c.fillPolygon([[29, 13], [35, 13], [34, 19], [30, 19]], [245, 245, 240, 255]);
  // 瓶口金箍
  c.fillEllipse(32, 13, 4.5, 1.8, [255, 215, 90, 255], [190, 140, 30, 255]);
  // 红色朱砂封口布塞
  c.fillPolygon([[28, 7], [36, 7], [35, 13], [29, 13]], [220, 45, 40, 255]);
  c.fillEllipse(32, 7, 4.2, 1.6, [255, 90, 80, 255], [180, 30, 30, 255]);
  // 金色束带与红飘带
  c.fillEllipse(32, 18, 4.5, 1.5, [255, 220, 100, 255], [200, 140, 30, 255]);
  c.strokeLine(33, 19, 39, 28, 1.5, [230, 50, 45, 240]);
  c.strokeLine(31, 19, 25, 27, 1.5, [230, 50, 45, 240]);
  // 瓶腹朱砂「丹」字篆刻菱形标签
  c.fillPolygon([[32, 30], [39, 37], [32, 44], [25, 37]], [210, 40, 35, 250]);
  c.fillPolygon([[32, 32], [37, 37], [32, 42], [27, 37]], [255, 235, 200, 255]);
  c.fillCircle(32, 37, 2.2, [210, 40, 35, 255]);
  // 瓶身左侧羊脂玉高光条
  c.fillEllipse(27, 36, 2.2, 8, [255, 255, 255, 180], [255, 255, 255, 0], -0.2);
  c.fillCircle(28, 23, 2, [255, 255, 255, 220]);

  c.addOutline(30, [18, 22, 26, 240], 1.2);
  return c;
}

function drawXiaohuan() {
  // 小还丹：赤霄灵火丹丸 + 金色天地双环 + 碧绿仙草嫩芽 + 灵气漩涡
  const c = new PixelCanvas(S, S);
  // 红色与金色外放灵芒
  c.fillCircle(32, 32, 23, [255, 100, 80, 80], [255, 200, 60, 0]);

  // 金色外轨道双环
  c.fillEllipse(32, 32, 20, 7.5, [255, 225, 110, 230], [210, 150, 30, 0], -0.45);
  c.fillEllipse(32, 32, 17, 6, [255, 245, 160, 240], [210, 150, 30, 0], -0.45);

  // 主丹丸（朱红暖玉）
  c.fillCircle(32, 32, 14, [255, 110, 95, 255], [160, 30, 35, 255]);
  // 丹纹：金色太极云纹
  c.fillEllipse(32, 32, 12, 4.5, [255, 225, 110, 255], [210, 140, 30, 200], 0.35);
  c.fillCircle(32, 32, 4.5, [255, 240, 160, 255], [220, 70, 50, 255]);

  // 丹顶仙草灵叶（小把）
  c.fillPolygon([[32, 18], [28, 11], [33, 13]], [70, 190, 110, 255]);
  c.fillPolygon([[32, 18], [37, 10], [33, 13]], [100, 220, 130, 255]);
  c.fillCircle(32, 18, 1.8, [240, 200, 70, 255]);

  // 高光闪烁
  c.fillCircle(27, 26, 3.2, [255, 255, 255, 230], [255, 180, 180, 0]);
  c.fillCircle(26, 25, 1.2, [255, 255, 255, 255]);

  c.addOutline(30, [30, 14, 15, 240], 1.2);
  return c;
}

function drawDahuan() {
  // 大还丹：九转紫金神丹 + 祥云金莲底托 + 三色灵纹光环 + 璀璨星芒
  const c = new PixelCanvas(S, S);
  // 紫金重华灵光
  c.fillCircle(32, 32, 24, [190, 120, 255, 90], [255, 200, 60, 0]);

  // 金莲底托五瓣
  for (let a = -0.7; a <= 0.7; a += 0.35) {
    const px = 32 + Math.sin(a) * 14;
    const py = 39 + Math.cos(a) * 5;
    c.fillCircle(px, py, 4.5, [255, 225, 110, 255], [180, 120, 20, 255]);
  }

  // 丹体（九转紫金）
  c.fillCircle(32, 30, 14.5, [210, 140, 255, 255], [90, 30, 140, 255]);

  // 三道九转金纹
  c.fillEllipse(32, 27, 13, 4, [255, 235, 140, 240], [200, 130, 20, 180], -0.2);
  c.fillEllipse(32, 31, 14, 4.5, [255, 235, 140, 255], [200, 130, 20, 200], 0.15);
  c.fillEllipse(32, 35, 12, 3.8, [255, 235, 140, 230], [200, 130, 20, 180], -0.1);

  // 顶端金冠宝珠
  c.fillPolygon([[32, 11], [35, 16], [29, 16]], [255, 230, 110, 255]);
  c.fillCircle(32, 11, 2, [255, 250, 200, 255]);

  // 紫金星芒高光
  c.fillCircle(27, 24, 3.5, [255, 255, 255, 240], [230, 180, 255, 0]);
  c.fillCircle(26, 23, 1.5, [255, 255, 255, 255]);

  c.addOutline(30, [26, 12, 38, 240], 1.2);
  return c;
}

function drawYaodan() {
  // 妖丹：碧渊异兽内丹 + 内部青碧游丝 + 凶煞雷电纹 + 晶莹灵芒
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 23, [40, 220, 180, 85], [10, 120, 90, 0]);

  // 主体（幽绿兽晶）
  c.fillCircle(32, 32, 15, [130, 245, 215, 255], [15, 80, 70, 255]);

  // 内部两道青幽雷弧/灵雾
  c.fillEllipse(31, 30, 11, 5, [210, 255, 240, 240], [30, 170, 140, 0], 0.6);
  c.fillEllipse(33, 34, 10, 4.5, [180, 255, 230, 220], [20, 140, 110, 0], -0.5);

  // 妖兽符印金瞳核心
  c.fillCircle(32, 32, 4, [255, 225, 90, 255], [200, 140, 20, 255]);
  c.fillEllipse(32, 32, 1.2, 3.5, [30, 20, 10, 255]); // 竖瞳

  // 表面裂晶高光
  c.strokeLine(26, 23, 30, 27, 1.2, [230, 255, 245, 230]);
  c.fillCircle(25, 23, 2.5, [255, 255, 255, 240], [180, 255, 230, 0]);

  c.addOutline(30, [10, 30, 25, 240], 1.2);
  return c;
}

function drawLingshi() {
  // 灵石：纯净天青灵晶簇 + 晶体棱面切线 + 耀眼星辉高光
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 23, [100, 200, 255, 85], [30, 100, 220, 0]);

  // 主晶石（三簇直立多棱水晶）
  // 左小晶
  c.fillPolygon([[20, 25], [27, 18], [30, 30], [23, 44], [18, 38]], [80, 180, 240, 255]);
  c.fillPolygon([[20, 25], [27, 18], [25, 33], [18, 38]], [140, 215, 255, 255]); // 亮侧
  // 右小晶
  c.fillPolygon([[36, 26], [43, 20], [46, 38], [40, 46], [34, 36]], [60, 150, 220, 255]);
  c.fillPolygon([[36, 26], [43, 20], [42, 36], [40, 46]], [110, 195, 255, 255]);

  // 中央主晶柱
  c.fillPolygon([[32, 9], [38, 17], [38, 47], [32, 53], [26, 47], [26, 17]], [70, 160, 235, 255]);
  // 亮面（左半）
  c.fillPolygon([[32, 9], [32, 53], [26, 47], [26, 17]], [180, 235, 255, 255]);
  // 顶晶尖棱面
  c.fillPolygon([[32, 9], [38, 17], [32, 21], [26, 17]], [230, 250, 255, 255]);
  // 棱线刻画
  c.strokeLine(32, 9, 32, 53, 1.2, [240, 250, 255, 240]);

  // 纯净星芒十字闪光
  c.fillCircle(32, 17, 3, [255, 255, 255, 255]);
  c.strokeLine(26, 17, 38, 17, 1.2, [255, 255, 255, 230]);
  c.strokeLine(32, 11, 32, 23, 1.2, [255, 255, 255, 230]);

  c.addOutline(30, [12, 28, 48, 240], 1.2);
  return c;
}

function drawXuantie() {
  // 玄铁令：大千宗门黑金令牌 + 饕餮龙纹金边 + 朱砂血咒符印 + 猩红流苏
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 22, [240, 180, 60, 60], [240, 180, 60, 0]);

  // 令牌外形（上尖八角矩形）
  const pts = [
    [32, 9], [42, 15], [42, 45], [38, 49], [26, 49], [22, 45], [22, 15]
  ];
  // 黄金包边外壳
  c.fillPolygon(pts, [245, 195, 70, 255]);
  // 内部玄铁黑金胎身
  const innerPts = [
    [32, 12], [39, 16], [39, 43], [36, 46], [28, 46], [25, 43], [25, 16]
  ];
  c.fillLinearPoly(innerPts, [25, 12], [70, 75, 85, 255], [39, 46], [30, 32, 40, 255]);

  // 顶端穿带孔
  c.fillCircle(32, 16, 2.5, [255, 215, 90, 255]);
  c.fillCircle(32, 16, 1.5, [20, 20, 25, 255]);

  // 牌身朱砂金纹（「令」字云纹）
  c.fillPolygon([[32, 22], [35, 25], [32, 28], [29, 25]], [225, 45, 40, 255]);
  c.strokeLine(32, 28, 32, 38, 2, [225, 45, 40, 255]);
  c.strokeLine(28, 33, 36, 33, 2, [225, 45, 40, 255]);
  c.strokeLine(29, 40, 35, 40, 1.8, [245, 200, 70, 255]);

  // 底部红色挂绳流苏
  c.strokeLine(32, 49, 32, 58, 2.5, [220, 45, 40, 255]);
  c.fillCircle(32, 58, 2, [245, 200, 70, 255]);

  c.addOutline(30, [25, 22, 18, 240], 1.2);
  return c;
}

function drawGeJian() {
  // 青锋剑：凌霄飞剑 + 碧玉吞口 + 寒光剑刃 + 飞扬剑穗
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 22, [120, 210, 255, 75], [50, 120, 220, 0]);

  // 剑身（斜向 45 度，从右上到左下）
  // 剑锋
  c.fillPolygon([[48, 12], [52, 16], [29, 39], [25, 35]], [200, 235, 255, 255]); // 亮侧
  c.fillPolygon([[48, 12], [25, 35], [27, 41], [52, 16]], [140, 190, 230, 255]); // 暗侧
  // 剑尖
  c.fillPolygon([[48, 12], [55, 9], [52, 16]], [245, 255, 255, 255]);
  // 剑脊寒芒
  c.strokeLine(55, 9, 27, 37, 1.2, [255, 255, 255, 255]);

  // 黄金双翼剑格（吞口）
  c.fillPolygon([[24, 32], [32, 40], [28, 44], [20, 36]], [255, 215, 80, 255]);
  c.fillCircle(26, 38, 2.5, [40, 200, 160, 255]); // 翡翠宝珠

  // 剑柄
  c.strokeLine(24, 40, 15, 49, 3, [160, 60, 40, 255]); // 缠绳
  // 剑首
  c.fillCircle(14, 50, 3, [255, 215, 80, 255]);
  // 飘逸青色剑穗
  c.strokeLine(13, 52, 8, 59, 1.8, [60, 210, 190, 240]);
  c.strokeLine(14, 52, 13, 61, 1.8, [60, 210, 190, 240]);

  c.addOutline(30, [15, 25, 35, 240], 1.2);
  return c;
}

function drawGeJi() {
  // 重刃：赤焰裂空斩 + 龙纹金环 + 烈焰刀芒 + 浑厚重煞
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 23, [255, 120, 50, 75], [200, 50, 20, 0]);

  // 宽阔弧月重刃（斜向）
  const blade = [
    [54, 11], [40, 10], [26, 26], [32, 40], [48, 34], [56, 22]
  ];
  c.fillLinearPoly(blade, [26, 26], [160, 40, 30, 255], [54, 11], [255, 180, 70, 255]);
  // 刀刃开锋（金火极光）
  c.strokeLine(54, 11, 56, 22, 2.5, [255, 240, 160, 255]);
  c.strokeLine(56, 22, 48, 34, 2.5, [255, 220, 110, 255]);

  // 刀背血槽与三个金环
  c.fillCircle(38, 17, 2.5, [255, 215, 80, 255]);
  c.fillCircle(38, 17, 1.2, [20, 20, 20, 255]);
  c.fillCircle(45, 16, 2.5, [255, 215, 80, 255]);
  c.fillCircle(45, 16, 1.2, [20, 20, 20, 255]);

  // 龙头护手
  c.fillCircle(27, 37, 4.5, [255, 200, 60, 255], [180, 120, 20, 255]);
  // 缠布长握柄
  c.strokeLine(25, 39, 11, 53, 3.5, [60, 45, 40, 255]);
  c.strokeLine(25, 39, 11, 53, 1.5, [190, 80, 40, 255]);
  // 柄尾铁配重
  c.fillCircle(10, 54, 3, [255, 200, 60, 255]);

  c.addOutline(30, [35, 15, 12, 240], 1.2);
  return c;
}

function drawGeJia() {
  // 玄铁甲：龙鳞玄光宝铠 + 金狮吞头 + 护心琉璃镜 + 金边肩铠
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 22, [180, 200, 230, 60], [40, 60, 90, 0]);

  // 左右两肩黄金护肩
  c.fillEllipse(20, 20, 7, 4.5, [255, 215, 80, 255], [190, 140, 30, 255], -0.3);
  c.fillEllipse(44, 20, 7, 4.5, [255, 215, 80, 255], [190, 140, 30, 255], 0.3);

  // 胸甲外轮廓（倒梯形）
  const chest = [
    [22, 20], [42, 20], [44, 36], [38, 48], [26, 48], [20, 36]
  ];
  c.fillLinearPoly(chest, [22, 20], [80, 95, 115, 255], [38, 48], [35, 45, 55, 255]);

  // 胸甲龙鳞纹理
  for (let r = 26; r <= 42; r += 5) {
    c.strokeLine(24, r, 40, r, 1.2, [140, 160, 185, 230]);
  }

  // 中央护心金镜
  c.fillCircle(32, 32, 6, [255, 225, 110, 255], [200, 145, 30, 255]);
  c.fillCircle(32, 32, 4.2, [100, 220, 240, 255], [40, 140, 180, 255]); // 碧蓝琉璃心
  c.fillCircle(30, 30, 1.5, [255, 255, 255, 255]); // 镜面反光

  // 腰间战裙甲片
  c.fillPolygon([[24, 48], [31, 48], [30, 56], [25, 56]], [60, 75, 90, 255]);
  c.fillPolygon([[33, 48], [40, 48], [39, 56], [34, 56]], [60, 75, 90, 255]);

  c.addOutline(30, [15, 20, 28, 240], 1.2);
  return c;
}

function drawGePao() {
  // 云纹道袍：青玄仙鹤道袍 + 太极阴阳前襟 + 金丝祥云滚边 + 仙风玉带
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 22, [140, 220, 255, 60], [60, 140, 200, 0]);

  // 宽大道袍身躯与阔袖
  const robe = [
    [28, 14], [36, 14], [48, 25], [42, 38], [39, 54], [25, 54], [22, 38], [16, 25]
  ];
  c.fillLinearPoly(robe, [28, 14], [255, 255, 255, 255], [32, 54], [180, 220, 240, 255]);

  // 交领右衽（金色缘边）
  c.strokeLine(28, 14, 36, 28, 2, [255, 215, 80, 255]);
  c.strokeLine(36, 14, 28, 24, 2, [255, 215, 80, 255]);

  // 胸前八卦太极符徽
  c.fillCircle(32, 25, 4.2, [255, 225, 100, 255]);
  c.fillCircle(32, 25, 3.2, [30, 60, 80, 255]);
  c.fillCircle(31, 25, 1.2, [255, 255, 255, 255]);

  // 碧玉腰带与垂绦
  c.fillPolygon([[25, 36], [39, 36], [39, 40], [25, 40]], [40, 180, 140, 255]);
  c.fillCircle(32, 38, 2.2, [255, 215, 80, 255]);
  c.strokeLine(32, 40, 32, 55, 1.8, [40, 180, 140, 255]);

  // 下摆祥云滚金
  c.strokeLine(25, 53, 39, 53, 2, [255, 215, 80, 255]);

  c.addOutline(30, [18, 30, 42, 240], 1.2);
  return c;
}

function drawGePei() {
  // 灵犀玉佩：双鱼如意翡翠佩 + 中国结吉庆同心绳 + 滴水玉珠 + 双飘丝绦
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 22, [80, 230, 180, 70], [20, 120, 90, 0]);

  // 顶端中国结红绳
  c.fillPolygon([[32, 8], [35, 11], [32, 14], [29, 11]], [230, 45, 40, 255]);
  c.strokeLine(32, 14, 32, 19, 1.8, [230, 45, 40, 255]);

  // 翡翠镂空圆壁（双环）
  c.fillCircle(32, 33, 14, [160, 245, 215, 255], [35, 160, 125, 255]);
  c.fillCircle(32, 33, 6, [0, 0, 0, 0]); // 内部镂空

  // 双鱼环抱与云雷金纹
  c.fillEllipse(32, 26, 4, 2, [255, 220, 90, 255], [200, 150, 30, 255], 0.3);
  c.fillEllipse(32, 40, 4, 2, [255, 220, 90, 255], [200, 150, 30, 255], -0.3);

  // 玉佩莹润高光
  c.fillCircle(25, 27, 2.5, [255, 255, 255, 240]);
  c.strokeLine(23, 30, 23, 36, 1.5, [255, 255, 255, 180]);

  // 下挂双金环与红流苏
  c.fillCircle(32, 48, 2, [255, 220, 90, 255]);
  c.strokeLine(30, 49, 28, 59, 1.6, [230, 45, 40, 240]);
  c.strokeLine(34, 49, 36, 59, 1.6, [230, 45, 40, 240]);

  c.addOutline(30, [10, 35, 25, 240], 1.2);
  return c;
}

function drawGeZhu() {
  // 聚灵珠：苍穹星海明珠 + 金莲法座 + 周天星轨光环 + 浓缩灵眼
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 30, 24, [120, 180, 255, 95], [60, 80, 220, 0]);

  // 旋转星轨环（双椭圆）
  c.fillEllipse(32, 30, 22, 7.5, [255, 230, 120, 230], [210, 150, 30, 0], -0.5);
  c.fillEllipse(32, 30, 19, 6.5, [140, 240, 255, 240], [40, 140, 240, 0], 0.5);

  // 托珠金莲座
  c.fillPolygon([[20, 41], [32, 47], [44, 41], [38, 52], [26, 52]], [255, 215, 80, 255]);
  c.fillCircle(32, 46, 3, [255, 240, 150, 255]);

  // 主聚灵珠体（海蓝与深空紫）
  c.fillCircle(32, 30, 13.5, [180, 240, 255, 255], [30, 50, 150, 255]);
  // 核心灵眼
  c.fillCircle(32, 30, 5, [255, 255, 255, 255], [100, 200, 255, 255]);

  // 耀眼星芒十字
  c.fillCircle(27, 24, 2.5, [255, 255, 255, 255]);
  c.strokeLine(23, 24, 31, 24, 1.2, [255, 255, 255, 230]);
  c.strokeLine(27, 20, 27, 28, 1.2, [255, 255, 255, 230]);

  c.addOutline(30, [15, 25, 45, 240], 1.2);
  return c;
}

function drawRuijin() {
  // 锐金符：金煞斩魔符箓 + 赤金边框 + 锋锐剑气符胆 + 金羽符头
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 22, [255, 215, 80, 75], [220, 140, 20, 0]);

  // 黄纸符身（微倾斜飘逸）
  const talisman = [
    [22, 10], [42, 10], [40, 53], [37, 57], [27, 57], [24, 53]
  ];
  c.fillLinearPoly(talisman, [22, 10], [255, 235, 140, 255], [40, 57], [240, 185, 60, 255]);

  // 朱砂双勾外边框
  c.strokeLine(25, 13, 39, 13, 1.2, [210, 40, 35, 255]);
  c.strokeLine(39, 13, 37, 51, 1.2, [210, 40, 35, 255]);
  c.strokeLine(37, 51, 27, 51, 1.2, [210, 40, 35, 255]);
  c.strokeLine(27, 51, 25, 13, 1.2, [210, 40, 35, 255]);

  // 符头三清勾
  c.fillCircle(32, 16, 2, [210, 40, 35, 255]);
  c.fillCircle(28, 18, 1.5, [210, 40, 35, 255]);
  c.fillCircle(36, 18, 1.5, [210, 40, 35, 255]);

  // 金色太乙锐金剑形符文
  c.fillPolygon([[32, 22], [35, 27], [33, 46], [31, 46], [29, 27]], [255, 250, 180, 255]);
  c.strokeLine(32, 22, 32, 46, 2, [200, 35, 30, 255]);
  c.strokeLine(28, 32, 36, 32, 1.8, [200, 35, 30, 255]);
  c.strokeLine(27, 40, 37, 40, 1.8, [200, 35, 30, 255]);

  // 锐气星芒
  c.fillCircle(32, 22, 2, [255, 255, 255, 255]);

  c.addOutline(30, [35, 22, 10, 240], 1.2);
  return c;
}

function drawPanshi() {
  // 磐石符：厚土磐石神符 + 玄黄沉厚气象 + 泰山玄盾符印 + 灵岩金砂
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 22, [240, 180, 80, 75], [160, 90, 20, 0]);

  // 赭黄符纸
  const talisman = [
    [22, 10], [42, 10], [40, 53], [37, 57], [27, 57], [24, 53]
  ];
  c.fillLinearPoly(talisman, [22, 10], [245, 210, 130, 255], [40, 57], [200, 140, 50, 255]);

  // 玄黄地脉双框
  c.strokeLine(25, 13, 39, 13, 1.2, [160, 60, 20, 255]);
  c.strokeLine(39, 13, 37, 51, 1.2, [160, 60, 20, 255]);
  c.strokeLine(37, 51, 27, 51, 1.2, [160, 60, 20, 255]);
  c.strokeLine(27, 51, 25, 13, 1.2, [160, 60, 20, 255]);

  // 磐石盾印符胆（重山之形）
  c.fillPolygon([[32, 23], [38, 30], [36, 44], [32, 47], [28, 44], [26, 30]], [140, 80, 30, 255]);
  c.fillPolygon([[32, 26], [36, 31], [34, 42], [32, 44], [30, 42], [28, 31]], [255, 225, 120, 255]);
  c.strokeLine(32, 27, 32, 43, 2, [180, 50, 20, 255]);

  c.addOutline(30, [32, 20, 12, 240], 1.2);
  return c;
}

function drawShenxing() {
  // 神行符：九天神行飞仙符 + 青鸾仙羽 + 疾风流云符印
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 22, [80, 230, 200, 80], [30, 140, 120, 0]);

  // 青翠风行符纸
  const talisman = [
    [22, 10], [42, 10], [40, 53], [37, 57], [27, 57], [24, 53]
  ];
  c.fillLinearPoly(talisman, [22, 10], [180, 250, 235, 255], [40, 57], [80, 200, 175, 255]);

  // 碧幽飞仙外框
  c.strokeLine(25, 13, 39, 13, 1.2, [20, 120, 100, 255]);
  c.strokeLine(39, 13, 37, 51, 1.2, [20, 120, 100, 255]);
  c.strokeLine(37, 51, 27, 51, 1.2, [20, 120, 100, 255]);
  c.strokeLine(27, 51, 25, 13, 1.2, [20, 120, 100, 255]);

  // 双羽风翼符文（「甲马/神行」羽翼）
  c.fillPolygon([[32, 22], [40, 26], [35, 34], [32, 30]], [255, 255, 230, 255]);
  c.fillPolygon([[32, 22], [24, 26], [29, 34], [32, 30]], [255, 255, 230, 255]);
  c.strokeLine(32, 20, 32, 47, 2, [30, 140, 110, 255]);
  c.strokeLine(27, 42, 37, 36, 1.8, [30, 140, 110, 255]);

  c.addOutline(30, [12, 32, 28, 240], 1.2);
  return c;
}

function drawNingyuan() {
  // 凝元丹：乾坤凝元金丹 + 太阳精火金冕 + 极光双环 + 纯阳之气
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 32, 24, [255, 220, 90, 95], [230, 130, 20, 0]);

  // 纯阳真火灵光双环
  c.fillEllipse(32, 32, 21, 7.5, [255, 245, 160, 240], [230, 140, 20, 0], 0.4);
  c.fillEllipse(32, 32, 19, 6.5, [255, 245, 160, 240], [230, 140, 20, 0], -0.4);

  // 金丹本体（纯阳烈火金）
  c.fillCircle(32, 32, 14.5, [255, 250, 200, 255], [220, 120, 20, 255]);

  // 中央八角金阳钻石晶芒
  c.fillPolygon([[32, 18], [37, 32], [32, 46], [27, 32]], [255, 255, 255, 255]);
  c.fillPolygon([[18, 32], [32, 37], [46, 32], [32, 27]], [255, 255, 255, 255]);
  c.fillCircle(32, 32, 4, [255, 240, 130, 255]);

  // 耀眼高光
  c.fillCircle(27, 25, 3, [255, 255, 255, 255]);

  c.addOutline(30, [38, 20, 8, 240], 1.2);
  return c;
}

function drawYuxia() {
  // 储物玉匣：太乙八宝玉匣 + 羊脂温润玉身 + 黄金飞龙搭扣 + 灵宝瑞彩
  const c = new PixelCanvas(S, S);
  c.fillCircle(32, 34, 23, [120, 240, 200, 75], [40, 160, 130, 0]);

  // 匣盖与匣身（圆角青白玉匣）
  // 匣身
  c.fillPolygon([[14, 28], [50, 28], [47, 52], [17, 52]], [140, 230, 200, 255]);
  c.fillPolygon([[14, 28], [32, 28], [30, 52], [17, 52]], [210, 250, 235, 255]); // 亮侧
  // 匣盖
  c.fillPolygon([[11, 16], [53, 16], [50, 29], [14, 29]], [100, 195, 170, 255]);
  c.fillPolygon([[11, 16], [32, 16], [32, 29], [14, 29]], [190, 245, 225, 255]);

  // 匣缝金线
  c.strokeLine(13, 28, 51, 28, 1.5, [255, 215, 80, 255]);

  // 四角包金护角
  c.fillPolygon([[11, 16], [17, 16], [14, 22]], [255, 215, 80, 255]);
  c.fillPolygon([[53, 16], [47, 16], [50, 22]], [255, 215, 80, 255]);
  c.fillPolygon([[17, 52], [22, 52], [16, 46]], [255, 215, 80, 255]);
  c.fillPolygon([[47, 52], [42, 52], [48, 46]], [255, 215, 80, 255]);

  // 黄金飞龙吐珠搭扣
  c.fillPolygon([[27, 22], [37, 22], [35, 39], [29, 39]], [255, 225, 100, 255]);
  c.fillCircle(32, 30, 3.2, [255, 80, 70, 255]); // 红宝石锁眼
  c.fillCircle(32, 30, 1.2, [255, 255, 255, 255]);

  // 玉面柔和高光
  c.strokeLine(16, 20, 30, 20, 1.5, [255, 255, 255, 200]);

  c.addOutline(30, [14, 34, 28, 240], 1.2);
  return c;
}

// -----------------------------------------------------------
// 打包与 PNG 写入
// -----------------------------------------------------------

const SPEC = [
  ['jinchuang', drawJinchuang, '金创药', 'heal', 0.35, '常见 · 小怪掉落'],
  ['xiaohuan',  drawXiaohuan,  '小还丹', 'heal', 0.55, '中品 · 中怪掉落'],
  ['dahuan',    drawDahuan,    '大还丹', 'heal', 1.00, '上品 · 精英掉落'],
  ['yaodan',    drawYaodan,    '妖丹',   'mat',  0,    '材料 · 可换灵石'],
  ['lingshi',   drawLingshi,   '灵石',   'mat',  0,    '货币'],
  ['xuantie',   drawXuantie,   '玄铁令', 'rare', 0,    '稀有 · 精英专属'],
  ['ge_jian',   drawGeJian,    '青锋剑', 'equip', 0,   '武器 · 主攻'],
  ['ge_ji',     drawGeJi,      '重刃',   'equip', 0,   '武器 · 高攻'],
  ['ge_jia',    drawGeJia,     '玄铁甲', 'equip', 0,   '护甲 · 主防'],
  ['ge_pao',    drawGePao,     '云纹道袍', 'equip', 0, '护甲 · 气血'],
  ['ge_pei',    drawGePei,     '灵犀玉佩', 'equip', 0, '灵饰 · 气血'],
  ['ge_zhu',    drawGeZhu,     '聚灵珠', 'equip', 0,   '灵饰 · 攻血'],
  ['ruijin',    drawRuijin,    '锐金符',   'buff', 1.25, '符箓 · 攻 +25% / 90 秒'],
  ['panshi',    drawPanshi,    '磐石符',   'buff', 1.45, '符箓 · 御 +45% / 90 秒'],
  ['shenxing',  drawShenxing,  '神行符',   'buff', 1.25, '符箓 · 移速 +25% / 120 秒'],
  ['ningyuan',  drawNingyuan,  '凝元丹',   'rare', 150,  '秘宝 · 修为 +150（每重限 2 枚）'],
  ['yuxia',     drawYuxia,     '储物玉匣', 'rare', 4,    '秘宝 · 行囊 +4 格（最多 2 次）']
];

function createPNG(w, h, rgbaBuffer) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function crc32(buf) {
    let table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c;
    }
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeUInt32BE(crc, 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const ihdrChunk = makeChunk('IHDR', ihdr);

  const scanlines = Buffer.alloc(h * (w * 4 + 1));
  let srcOffset = 0, dstOffset = 0;
  for (let y = 0; y < h; y++) {
    scanlines[dstOffset++] = 0;
    rgbaBuffer.copy(scanlines, dstOffset, srcOffset, srcOffset + w * 4);
    dstOffset += w * 4;
    srcOffset += w * 4;
  }
  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function main() {
  const targetDir = path.resolve(__dirname, '../assets');
  const count = SPEC.length;
  const cw = S + PAD;
  const cwB = S * BIG + PAD;
  const W = Math.max(cw * count + PAD, cwB * count + PAD); // 2212
  const rowH_small = S + PAD; // 66
  const rowBigY = 68; // 保持与老 json 严格一致
  const H = 198;

  const atlas = new PixelCanvas(W, H);
  const rect = {}, rect_big = {};
  const items = {};

  let x = PAD;
  let xb = PAD;

  for (const [name, fn, cn, kind, val, note] of SPEC) {
    const img64 = fn();
    const img128 = img64.scaleUp(BIG);

    // 拷贝 64px 帧到上行 (y=2)
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const [r, g, b, a] = img64.get(px, py);
        atlas.set(x + px, PAD + py, r, g, b, a);
      }
    }
    rect[name] = [x, PAD, S, S];

    // 拷贝 128px 帧到下行 (y=68)
    for (let py = 0; py < S * BIG; py++) {
      for (let px = 0; px < S * BIG; px++) {
        const [r, g, b, a] = img128.get(px, py);
        atlas.set(xb + px, rowBigY + py, r, g, b, a);
      }
    }
    rect_big[name + '_big'] = [xb, rowBigY, S * BIG, S * BIG];

    items[name] = { cn, kind, val, note };

    x += cw;
    xb += cwB;
  }

  const jsonOut = {
    _meta: {
      size: S,
      big: BIG,
      box: 46,
      rowBig: rowBigY,
      atlasH: H,
      note: '仙道寻踪 · 全新精致国风仙侠物品图集 (build_beautiful_items.js)'
    },
    items,
    ...rect,
    ...rect_big
  };

  const pngBuf = createPNG(W, H, atlas.toBuffer());
  const outPngPath = path.join(targetDir, 'items_atlas.png');
  const outJsonPath = path.join(targetDir, 'items_atlas.json');

  fs.writeFileSync(outPngPath, pngBuf);
  fs.writeFileSync(outJsonPath, JSON.stringify(jsonOut));

  console.log(`✓ 仙侠物品图集生成成功！`);
  console.log(`  PNG:  ${outPngPath} (${(pngBuf.length / 1024).toFixed(1)} KB, ${W}×${H})`);
  console.log(`  JSON: ${outJsonPath}`);
}

main();
