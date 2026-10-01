// 架构多巴胺 · 背景层：机房/网络节点氛围，随演出阶段 stage(0..8) 逐级变热闹。
// 调用方给 canvas 设置 CSS 尺寸（建议 position:fixed; inset:0; width:100%; height:100%; z-index 低于内容）。

import {
  PALETTE,
  BG_COLORS,
  FONT_STACK,
  MAX_STAGE,
  clampStage,
  clampLevel,
  createPool,
  createRateLimiter,
  sharedFlashLimiter,
  spawnSpark,
  spawnConfetti,
  stepPool,
  drawPool,
  fitCanvas,
  requestFrame,
  cancelFrame,
  pageHidden,
} from './fx.js';

export const MAX_STROBE_HZ = 3;

/**
 * stage → 各层参数。layers[x] 为是否启用，intensity[x] 为 0..1 强度；
 * 对 stage 单调不减，越界 clamp 到 0..8。
 */
export function stageParams(stage) {
  const s = clampStage(stage);
  const start = { twinkle: 1, links: 2, bars: 3, beams: 4, bubbles: 5, aurora: 6, fireworks: 7, celebration: 8 };
  const layers = { grid: true };
  const intensity = { grid: 0.5 + 0.04 * s };
  for (const k of Object.keys(start)) {
    layers[k] = s >= start[k];
    // 刚出现时 0.45，之后每升一级再加强，4 级后满
    intensity[k] = s >= start[k] ? Math.min(1, 0.45 + (s - start[k]) * 0.14) : 0;
  }
  return { stage: s, energy: s / MAX_STAGE, layers, intensity, strobeHz: layers.celebration ? 1.25 : 0 };
}

/** 各 level 对背景的限制（0 = 静态，1 = 弱，2 = 标准）。 */
export function motionParams(level) {
  const l = clampLevel(level);
  return { level: l, animated: l > 0, countScale: l === 2 ? 1 : l === 1 ? 0.4 : 1, strobe: l === 2, confetti: l === 2, fps: l === 2 ? 60 : 30, particleLimit: [0, 90, 260][l] };
}

const rand = (a, b) => a + Math.random() * (b - a);
const pick = () => PALETTE[(Math.random() * PALETTE.length) | 0];
const TAU = Math.PI * 2;
const ICONS = ['CDN', 'CACHE', 'MQ', 'DB', 'LB', 'API'];

export function createBackground(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 300;
  let H = 150;
  let dpr = 1;
  let stage = 0;
  let sp = stageParams(0);
  let mp = motionParams(2);
  let running = false;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  let tSec = 0;
  let beat = 0; // 节拍能量，衰减
  let flashA = 0;
  let flashColor = PALETTE[3];
  let nextStrobe = 0;
  let quality = 1;
  let slowFrames = 0;
  let emaDt = 1 / 60;
  let listening = false;
  let accum = 0;
  let base = null; // 预渲染底图（渐变 + 网格）

  // 节点网格（CSR 邻接）
  let cols = 0;
  let rows = 0;
  let nodeN = 0;
  let nx = new Float32Array(0);
  let ny = new Float32Array(0);
  let nph = new Float32Array(0);
  let adjOff = new Int32Array(1);
  let adjTo = new Int32Array(0);
  // 数据包
  const PK = 48;
  const pf = new Int32Array(PK);
  const pt = new Int32Array(PK);
  const pp = new Float32Array(PK);
  const ps = new Float32Array(PK);
  const pc = new Array(PK).fill(PALETTE[3]);
  // 气泡
  const BB = 12;
  const bx = new Float32Array(BB);
  const by = new Float32Array(BB);
  const br = new Float32Array(BB);
  const bv = new Float32Array(BB);
  const bph = new Float32Array(BB);
  const bk = new Uint8Array(BB);
  // 烟花/彩带
  const pool = createPool(260);
  let nextFw = 1;
  let confAcc = 0;
  const limiter = createRateLimiter(3, 1000); // 本模块内部也限频，叠加全局共享额度

  pool.limit = mp.particleLimit;

  /* ---- 布局 ---- */

  function buildNodes() {
    const spacing = Math.max(64, Math.sqrt((W * H) / 70));
    cols = Math.max(2, Math.ceil(W / spacing) + 1);
    rows = Math.max(2, Math.ceil(H / spacing) + 1);
    nodeN = cols * rows;
    nx = new Float32Array(nodeN);
    ny = new Float32Array(nodeN);
    nph = new Float32Array(nodeN);
    const sx = W / (cols - 1);
    const sy = H / (rows - 1);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const edge = c === 0 || r === 0 || c === cols - 1 || r === rows - 1;
        nx[i] = c * sx + (edge ? 0 : rand(-0.22, 0.22) * sx);
        ny[i] = r * sy + (edge ? 0 : rand(-0.22, 0.22) * sy);
        nph[i] = Math.random() * TAU;
      }
    }
    adjOff = new Int32Array(nodeN + 1);
    const tmp = [];
    for (let i = 0; i < nodeN; i++) {
      adjOff[i] = tmp.length;
      const c = i % cols;
      const r = (i / cols) | 0;
      if (c > 0) tmp.push(i - 1);
      if (c < cols - 1) tmp.push(i + 1);
      if (r > 0) tmp.push(i - cols);
      if (r < rows - 1) tmp.push(i + cols);
    }
    adjOff[nodeN] = tmp.length;
    adjTo = Int32Array.from(tmp);
    for (let k = 0; k < PK; k++) resetPacket(k, true);
    // 气泡
    for (let k = 0; k < BB; k++) resetBubble(k, true);
  }

  function resetPacket(k, init) {
    const f = (Math.random() * nodeN) | 0;
    pf[k] = f;
    pt[k] = pickNext(f, -1);
    pp[k] = init ? Math.random() : 0;
    ps[k] = rand(0.35, 0.9);
    pc[k] = pick();
  }
  function pickNext(f, avoid) {
    const a = adjOff[f];
    const n = adjOff[f + 1] - a;
    let t = adjTo[a + ((Math.random() * n) | 0)];
    if (t === avoid && n > 1) t = adjTo[a + ((Math.random() * n) | 0)];
    return t;
  }
  function resetBubble(k, init) {
    br[k] = rand(17, 27);
    bx[k] = rand(br[k] + 8, Math.max(br[k] + 9, W - br[k] - 8));
    by[k] = init ? rand(0, H) : H + br[k] + 10;
    bv[k] = rand(12, 30);
    bph[k] = Math.random() * TAU;
    bk[k] = (Math.random() * ICONS.length) | 0;
  }

  function buildBase() {
    if (typeof document === 'undefined') return;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const grad = g.createLinearGradient(0, 0, W * 0.3, H);
    grad.addColorStop(0, BG_COLORS.deep);
    grad.addColorStop(1, BG_COLORS.mid);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
    // 极淡网格
    g.strokeStyle = 'rgba(160,150,255,0.06)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0.5; x < W; x += 44) {
      g.moveTo(x, 0);
      g.lineTo(x, H);
    }
    for (let y = 0.5; y < H; y += 44) {
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
    // 暗角，让中间内容区更突出
    const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(5,4,25,0.45)');
    g.fillStyle = v;
    g.fillRect(0, 0, W, H);
    base = c;
  }

  function resize() {
    if (destroyed || !ctx) return;
    const s = fitCanvas(canvas, ctx);
    W = s.w;
    H = s.h;
    dpr = s.dpr;
    buildBase();
    buildNodes();
    pool.clear();
    if (!mp.animated || !running) render(0, 0);
  }

  /* ---- 绘制各层 ---- */

  function drawBase() {
    if (base) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    } else {
      const g = ctx.createLinearGradient(0, 0, W * 0.3, H);
      g.addColorStop(0, BG_COLORS.deep);
      g.addColorStop(1, BG_COLORS.mid);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawAurora(t, k) {
    const ribbons = quality < 0.7 ? 2 : 3;
    const pairs = [
      [PALETTE[2], PALETTE[3]],
      [PALETTE[4], PALETTE[0]],
      [PALETTE[3], PALETTE[4]],
    ];
    ctx.globalCompositeOperation = 'lighter';
    for (let r = 0; r < ribbons; r++) {
      const y0 = H * (0.2 + r * 0.22) + Math.sin(t * 0.15 + r) * H * 0.05;
      const amp = H * 0.06;
      const bandH = H * 0.28;
      const g = ctx.createLinearGradient(0, y0 - amp, 0, y0 + bandH - amp);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.25, hexA(pairs[r][0], 0.34 * k));
      g.addColorStop(0.6, hexA(pairs[r][1], 0.2 * k));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      const step = Math.max(24, W / 22);
      for (let x = -step; x <= W + step; x += step) {
        const y = y0 + Math.sin(x * 0.004 + t * 0.28 + r * 2.1) * amp + Math.sin(x * 0.011 - t * 0.41 + r) * amp * 0.4;
        if (x === -step) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let x = W + step; x >= -step; x -= step) {
        const y = y0 + bandH + Math.sin(x * 0.005 - t * 0.22 + r * 1.3) * amp * 0.8;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBeams(t, k) {
    ctx.globalCompositeOperation = 'lighter';
    const n = quality < 0.7 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const ox = i === 0 ? W * 0.05 : i === 1 ? W * 0.95 : W * 0.5;
      const a = Math.PI / 2 + (i === 0 ? 0.35 : i === 1 ? -0.35 : 0) + Math.sin(t * 0.55 + i * 2) * 0.45;
      const len = Math.hypot(W, H) * 1.1;
      const half = 0.07 + beat * 0.02;
      const ex1 = ox + Math.cos(a - half) * len;
      const ey1 = Math.sin(a - half) * len;
      const ex2 = ox + Math.cos(a + half) * len;
      const ey2 = Math.sin(a + half) * len;
      const g = ctx.createLinearGradient(ox, 0, ox + Math.cos(a) * len, Math.sin(a) * len);
      g.addColorStop(0, hexA(PALETTE[(i * 2 + 3) % 5], 0.3 * k));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(ox, -4);
      ctx.lineTo(ex1, ey1);
      ctx.lineTo(ex2, ey2);
      ctx.closePath();
      ctx.fill();
    }
    // 扫描线
    const y = ((t * 0.12) % 1.2) * H - H * 0.1;
    const g = ctx.createLinearGradient(0, y - 70, 0, y + 2);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, hexA(PALETTE[3], 0.14 * k));
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 70, W, 72);
    ctx.fillStyle = hexA(PALETTE[3], 0.35 * k);
    ctx.fillRect(0, y, W, 1.5);
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawLinks(k, animated, dt) {
    // 静态连线
    ctx.strokeStyle = `rgba(120,160,255,${(0.1 + 0.08 * k + beat * 0.05).toFixed(3)})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < nodeN; i++) {
      if (i % cols < cols - 1) {
        ctx.moveTo(nx[i], ny[i]);
        ctx.lineTo(nx[i + 1], ny[i + 1]);
      }
      if (i + cols < nodeN) {
        ctx.moveTo(nx[i], ny[i]);
        ctx.lineTo(nx[i + cols], ny[i + cols]);
      }
    }
    ctx.stroke();
    if (!animated) return;
    // 数据包：沿连线流动的小亮点
    const n = Math.min(PK, Math.round(PK * k * mp.countScale * quality * (nodeN / 80 > 1 ? 1 : nodeN / 80 + 0.3)));
    ctx.globalCompositeOperation = 'lighter';
    for (let q = 0; q < n; q++) {
      pp[q] += ps[q] * dt * (1 + beat * 0.8);
      if (pp[q] >= 1) {
        const from = pt[q];
        const prev = pf[q];
        pf[q] = from;
        pt[q] = pickNext(from, prev);
        pp[q] = 0;
        if (Math.random() < 0.3) pc[q] = pick();
      }
      const f = pf[q];
      const to = pt[q];
      const x = nx[f] + (nx[to] - nx[f]) * pp[q];
      const y = ny[f] + (ny[to] - ny[f]) * pp[q];
      ctx.fillStyle = pc[q];
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 2.3, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.beginPath();
      ctx.arc(x, y, 5.5, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawNodes(t, animated, k) {
    for (let i = 0; i < nodeN; i++) {
      const tw = animated ? 0.5 + 0.5 * Math.sin(t * 1.6 + nph[i]) : 0.6;
      const a = (0.18 + 0.62 * tw * k + beat * 0.2) * (k > 0 ? 1 : 0.5);
      ctx.fillStyle = `rgba(190,200,255,${Math.min(1, a).toFixed(3)})`;
      ctx.fillRect(nx[i] - 1.5, ny[i] - 1.5, 3, 3);
    }
  }

  function drawBars(t, animated, k) {
    const bw = W < 500 ? 7 : 9;
    const gap = W < 500 ? 4 : 5;
    const n = Math.floor(W / (bw + gap));
    const maxH = H * (W < 500 ? 0.16 : 0.22) * (0.6 + 0.4 * k);
    const x0 = (W - n * (bw + gap) + gap) / 2;
    for (let i = 0; i < n; i++) {
      const wave = animated ? 0.5 + 0.5 * Math.sin(t * (1.6 + (i % 5) * 0.35) + i * 0.7) : 0.45;
      const level = Math.min(1, 0.12 + wave * 0.55 + beat * 0.3 * (0.5 + 0.5 * Math.sin(i * 1.3)));
      const h = Math.max(3, level * maxH);
      const x = x0 + i * (bw + gap);
      ctx.fillStyle = hexA(PALETTE[i % 5], 0.5 * (0.6 + 0.4 * k));
      ctx.fillRect(x, H - h, bw, h);
      ctx.fillStyle = hexA(PALETTE[i % 5], 0.95);
      ctx.fillRect(x, H - h, bw, 2);
    }
    // 机架指示灯：两侧竖列，逐灯独立闪烁
    const leds = Math.floor(H / 22);
    for (let i = 0; i < leds; i++) {
      const y = 12 + i * 22;
      const on = animated ? ((Math.sin(t * 2.2 + i * 12.9898) * 43758.5453) % 1) + 1 : 0.7;
      const a = on % 1 > 0.35 ? 0.85 : 0.18;
      ctx.fillStyle = hexA(PALETTE[(i * 2) % 5], a);
      ctx.fillRect(5, y, 4, 4);
      ctx.fillStyle = hexA(PALETTE[(i * 2 + 1) % 5], on % 1 > 0.55 ? 0.85 : 0.18);
      ctx.fillRect(W - 9, y, 4, 4);
    }
  }

  function drawBubbles(t, animated, k, dt) {
    const n = Math.min(BB, Math.max(2, Math.round(BB * k * mp.countScale * quality)));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (let i = 0; i < n; i++) {
      if (animated) {
        by[i] -= bv[i] * dt;
        if (by[i] < -br[i] - 20) resetBubble(i, false);
      }
      const r = br[i];
      const x = bx[i] + (animated ? Math.sin(t * 0.8 + bph[i]) * 8 : 0);
      const y = by[i];
      const col = PALETTE[(bk[i] + i) % 5];
      ctx.fillStyle = hexA(col, 0.13);
      ctx.strokeStyle = hexA(col, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y - r * 0.12);
      ctx.scale(r / 22, r / 22);
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      drawIcon(bk[i]);
      ctx.restore();
      ctx.font = `700 ${Math.round(r * 0.42)}px ${FONT_STACK}`;
      ctx.fillStyle = hexA(col, 0.95);
      ctx.fillText(ICONS[bk[i]], x, y + r * 0.62);
    }
  }

  function drawIcon(kind) {
    ctx.beginPath();
    switch (kind) {
      case 0: // CDN：地球
        ctx.arc(0, -2, 9, 0, TAU);
        ctx.moveTo(-9, -2);
        ctx.lineTo(9, -2);
        ctx.ellipse(0, -2, 4, 9, 0, 0, TAU);
        break;
      case 1: // 缓存：闪电
        ctx.moveTo(3, -12);
        ctx.lineTo(-5, -1);
        ctx.lineTo(0, -1);
        ctx.lineTo(-3, 9);
        ctx.lineTo(6, -4);
        ctx.lineTo(1, -4);
        ctx.closePath();
        break;
      case 2: // 队列：三个排队方块
        ctx.rect(-11, -8, 5, 10);
        ctx.rect(-3, -8, 5, 10);
        ctx.rect(5, -8, 5, 10);
        break;
      case 3: // 数据库：圆柱
        ctx.ellipse(0, -8, 8, 3.5, 0, 0, TAU);
        ctx.moveTo(-8, -8);
        ctx.lineTo(-8, 4);
        ctx.ellipse(0, 4, 8, 3.5, 0, Math.PI, 0, true);
        ctx.moveTo(8, -8);
        ctx.lineTo(8, 4);
        break;
      case 4: // 负载均衡：一分二
        ctx.moveTo(0, 6);
        ctx.lineTo(0, -1);
        ctx.lineTo(-8, -9);
        ctx.moveTo(0, -1);
        ctx.lineTo(8, -9);
        break;
      default: // API：尖括号
        ctx.moveTo(-3, -10);
        ctx.lineTo(-10, -2);
        ctx.lineTo(-3, 6);
        ctx.moveTo(3, -10);
        ctx.lineTo(10, -2);
        ctx.lineTo(3, 6);
    }
    ctx.stroke();
  }

  function spawnFirework() {
    const x = rand(W * 0.12, W * 0.88);
    const y = rand(H * 0.12, H * 0.5);
    const color = pick();
    const n = Math.round((40 + stage * 3) * mp.countScale * quality);
    const sp = rand(130, 210);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * TAU + rand(-0.04, 0.04);
      const c = Math.random() < 0.7 ? color : pick();
      if (spawnSpark(pool, x, y, a, sp * (k % 2 ? rand(0.9, 1) : rand(0.35, 1)), c, rand(1.5, 2.4), rand(1, 1.6), 80, 1.5) < 0) break;
    }
  }

  function drawCelebration(t, k) {
    // 霓虹边框呼吸（不是闪烁：亮度平滑变化，幅度小）
    const pulse = 0.55 + 0.25 * Math.sin(t * 1.2) + beat * 0.15;
    const g = ctx.createLinearGradient(0, 0, W, H);
    for (let i = 0; i < 5; i++) g.addColorStop(i / 4, hexA(PALETTE[(i + ((t * 0.3) | 0)) % 5], 0.7 * pulse));
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 10;
    ctx.globalAlpha = 0.18 * k;
    ctx.strokeRect(5, 5, W - 10, H - 10);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* ---- 单帧 ---- */

  function render(t, dt) {
    const animated = mp.animated && running && dt > 0;
    const I = sp.intensity;
    const L = sp.layers;
    drawBase();
    if (L.aurora) drawAurora(t, I.aurora);
    if (L.beams) drawBeams(t, I.beams);
    if (L.links) drawLinks(I.links, animated, dt);
    drawNodes(t, animated, L.twinkle ? I.twinkle : 0);
    if (L.bars) drawBars(t, animated, I.bars);
    if (L.bubbles) drawBubbles(t, animated, I.bubbles, dt);
    if (animated) {
      if (mp.level >= 1 && L.fireworks) {
        nextFw -= dt;
        if (nextFw <= 0) {
          spawnFirework();
          nextFw = L.celebration ? rand(0.5, 0.9) : rand(2.6, 4.2);
        }
      }
      if (L.celebration && mp.confetti) {
        confAcc += dt * 16 * quality;
        while (confAcc >= 1) {
          confAcc -= 1;
          spawnConfetti(pool, rand(0, W), -10, rand(-25, 25), rand(40, 100), pick(), rand(5, 9), 9);
        }
      }
      stepPool(pool, dt, H, null);
      drawPool(ctx, pool, dpr);
      // 柔和“闪光”事件：全部走限频器，任意 1 秒内 ≤ 3 次，且低对比、缓慢衰减
      if (L.celebration && mp.strobe && t >= nextStrobe) {
        nextStrobe = t + 1 / sp.strobeHz;
        triggerFlash(0.09);
      }
      if (flashA > 0.002) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = flashA;
        ctx.fillStyle = flashColor;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        flashA = Math.max(0, flashA - dt * 0.28);
      }
      beat = Math.max(0, beat - dt * 2.2);
    }
    if (L.celebration) drawCelebration(t, I.celebration);
  }

  function triggerFlash(a) {
    if (!mp.strobe) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!limiter.take(now) || !sharedFlashLimiter.take(now)) return false;
    flashA = Math.max(flashA, Math.min(0.12, a));
    flashColor = PALETTE[Math.floor(now / 400) % 5];
    return true;
  }

  function frame(ts) {
    raf = 0;
    if (!running || destroyed || !mp.animated) return;
    if (pageHidden()) return;
    let dt = last ? Math.min(0.05, Math.max(0, (ts - last) / 1000)) : 1 / 60;
    if (last && mp.fps < 60) {
      accum += dt;
      if (accum < 1 / mp.fps - 0.002) {
        raf = requestFrame(frame);
        last = ts;
        return;
      }
      dt = accum;
      accum = 0;
    }
    last = ts;
    tSec += dt;
    emaDt = emaDt * 0.95 + dt * 0.05;
    if (emaDt > 0.034 && quality > 0.6 && ++slowFrames > 90) {
      quality = 0.6; // 低端机自动降级：减少数据包/气泡/极光条数
      slowFrames = 0;
    }
    render(tSec, dt);
    raf = requestFrame(frame);
  }

  /* ---- API ---- */

  function wake() {
    if (!running || destroyed || raf || !mp.animated || pageHidden()) return;
    last = 0;
    raf = requestFrame(frame);
  }
  function onVisibility() {
    if (pageHidden()) {
      if (raf) cancelFrame(raf);
      raf = 0;
    } else wake();
  }

  function setStage(n) {
    stage = clampStage(n);
    sp = stageParams(stage);
    if (!mp.animated || !running) render(tSec, 0);
  }

  function setMotion(l) {
    mp = motionParams(l);
    pool.limit = mp.particleLimit;
    if (!mp.animated) {
      if (raf) cancelFrame(raf);
      raf = 0;
      pool.clear();
      flashA = 0;
      if (ctx) render(0, 0);
    } else wake();
  }

  function start() {
    if (destroyed) return;
    running = true;
    if (!listening && typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', onVisibility);
      listening = true;
    }
    wake();
    if (!mp.animated) render(0, 0);
  }

  function stop() {
    running = false;
    if (raf) cancelFrame(raf);
    raf = 0;
    if (listening && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility);
      listening = false;
    }
  }

  function pulse(strength = 1) {
    if (destroyed || !mp.animated) return;
    const s = Math.max(0, Math.min(2, Number(strength) || 0));
    beat = Math.min(1.6, beat + s * 0.8);
    if (sp.stage >= 3 && s >= 0.5) triggerFlash(0.05 * s);
  }

  function destroy() {
    if (destroyed) return;
    stop();
    pool.clear();
    destroyed = true;
  }

  resize();
  return { setStage, setMotion, resize, start, stop, pulse, destroy };
}

// '#rrggbb' + alpha → rgba()
const hexCache = new Map();
function hexA(hex, a) {
  const key = hex + (a * 100 + 0.5 | 0);
  let v = hexCache.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  v = `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(2)})`;
  if (hexCache.size > 800) hexCache.clear();
  hexCache.set(key, v);
  return v;
}
