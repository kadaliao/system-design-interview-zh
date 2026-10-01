// 架构多巴胺 · 前景特效层（Canvas 2D，零依赖，可在 Node 中 import 测试纯逻辑）
// 约定：调用方给 canvas 设置 CSS 尺寸（如 position:fixed; inset:0; width:100%; height:100%; pointer-events:none），
// 所有坐标都是 canvas 相对的 CSS 像素。

export const PALETTE = ['#ff5d8f', '#ffb02e', '#3ddc97', '#4cc9f0', '#a78bfa'];
export const BG_COLORS = { deep: '#14123a', mid: '#1d1a4f' };
export const FONT_STACK = '"PingFang SC","Microsoft YaHei",system-ui,sans-serif';
export const MAX_STAGE = 8;
export const MAX_FLASH_PER_SEC = 3; // WCAG 2.3.1：任意 1 秒内闪烁不超过 3 次

// 粒子种类
export const K_SPARK = 0;
export const K_CONFETTI = 1;
export const K_ROCKET = 2;

/* ---------------------------------- 纯函数 ---------------------------------- */

export function clampStage(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > MAX_STAGE ? MAX_STAGE : n;
}

export function clampLevel(l) {
  if (l === undefined || l === null) return 2;
  l = Math.round(Number(l));
  if (!Number.isFinite(l)) return 2;
  return l < 0 ? 0 : l > 2 ? 2 : l;
}

/** 动效强度对粒子数的缩放：0 → 0，1 → ×0.4（至少 1 个），2 → 原样。 */
export function scaleCount(count, level) {
  const c = Number(count);
  if (!Number.isFinite(c) || c <= 0) return 0;
  const lv = clampLevel(level);
  if (lv === 0) return 0;
  if (lv === 1) return Math.max(1, Math.round(c * 0.4));
  return Math.round(c);
}

/** 各动效强度下的粒子池上限（level2 = 600）。 */
export function poolLimit(level) {
  return [0, 240, 600][clampLevel(level)];
}

/** burst 的参数随 stage 增强：粒子数、速度、多彩概率、尺寸。 */
export function burstParams(stage, opts) {
  const s = clampStage(stage);
  const o = opts || {};
  const base = Number.isFinite(o.count) && o.count > 0 ? o.count : 14;
  const power = Number.isFinite(o.power) && o.power > 0 ? o.power : 1;
  return {
    count: Math.round(base * (1 + 0.18 * s)),
    speed: (170 + 22 * s) * power,
    mix: s < 3 ? 0 : Math.min(0.85, (s - 2) * 0.14), // 调用方颜色之外混入其他强调色的概率
    size: 2 + s * 0.18,
    life: 0.55 + s * 0.04,
  };
}

const MILESTONES = {
  combo10: { confetti: 40, fireworks: 0, rings: 1, flash: 0 },
  combo20: { confetti: 70, fireworks: 1, rings: 2, flash: 0 },
  combo50: { confetti: 110, fireworks: 3, rings: 3, flash: 0.08 },
  dopa100: { confetti: 60, fireworks: 1, rings: 1, flash: 0 },
  dopa1000: { confetti: 90, fireworks: 2, rings: 2, flash: 0 },
  dopa1e4: { confetti: 120, fireworks: 3, rings: 3, flash: 0.08 },
  dopa1e6: { confetti: 160, fireworks: 5, rings: 4, flash: 0.1 },
  dopa1e8: { confetti: 220, fireworks: 8, rings: 5, flash: 0.1 },
  stage: { confetti: 100, fireworks: 3, rings: 3, flash: 0.08 },
};
export const MILESTONE_KINDS = Object.keys(MILESTONES);

/** 全屏庆祝配置（已按 level 缩放：1 档无彩带雨/无频闪，0 档全空）。未知 kind 回退为 'stage'。 */
export function milestoneSpec(kind, level) {
  const base = MILESTONES[kind] || MILESTONES.stage;
  const lv = clampLevel(level);
  if (lv === 0) return { confetti: 0, fireworks: 0, rings: 0, flash: 0 };
  if (lv === 1) {
    return {
      confetti: 0,
      fireworks: base.fireworks ? Math.max(1, Math.round(base.fireworks * 0.4)) : 0,
      rings: base.rings ? Math.max(1, Math.round(base.rings * 0.4)) : 0,
      flash: 0,
    };
  }
  return { ...base };
}

/** shake 的关键帧（power 0..1，越界 clamp）。 */
export function shakeKeyframes(power) {
  let p = Number(power);
  if (!Number.isFinite(p)) p = 0.5;
  p = p < 0 ? 0 : p > 1 ? 1 : p;
  const a = 3 + 9 * p;
  const f = [0, -1, 0.85, -0.65, 0.4, -0.2, 0];
  return f.map((m) => ({ transform: `translate(${(m * a).toFixed(2)}px, ${(-m * a * 0.35).toFixed(2)}px)` }));
}

/** 滑动窗口限频器：任意 windowMs 内最多放行 max 次。 */
export function createRateLimiter(max = MAX_FLASH_PER_SEC, windowMs = 1000) {
  const stamps = [];
  return {
    take(now) {
      if (now === undefined) now = nowMs();
      while (stamps.length && now - stamps[0] >= windowMs) stamps.shift();
      if (stamps.length >= max) return false;
      stamps.push(now);
      return true;
    },
    reset() {
      stamps.length = 0;
    },
  };
}
/** 全局共享：前景 fx 与背景 bg 的“闪光”共用同一个额度，合计不超过 3 次/秒。 */
export const sharedFlashLimiter = createRateLimiter(MAX_FLASH_PER_SEC, 1000);

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

/* ---------------------------------- 粒子池 ---------------------------------- */

/** 结构数组式对象池：初始化后不再分配；alloc 返回下标或 -1（池满/超过 limit）。 */
export function createPool(n) {
  const cap = Math.max(0, n | 0);
  const stack = new Int32Array(cap);
  for (let i = 0; i < cap; i++) stack[i] = cap - 1 - i;
  const p = {
    cap,
    limit: cap,
    count: 0,
    hi: 0, // 高水位：遍历到此为止
    sp: cap,
    x: new Float32Array(cap),
    y: new Float32Array(cap),
    vx: new Float32Array(cap),
    vy: new Float32Array(cap),
    life: new Float32Array(cap),
    maxLife: new Float32Array(cap),
    size: new Float32Array(cap),
    rot: new Float32Array(cap),
    vr: new Float32Array(cap),
    gravity: new Float32Array(cap),
    drag: new Float32Array(cap),
    data: new Float32Array(cap), // 通用槽：rocket 存爆炸粒子数
    kind: new Uint8Array(cap),
    alive: new Uint8Array(cap),
    color: new Array(cap).fill('#ffffff'),
    alloc() {
      if (p.count >= p.limit || p.sp === 0) return -1;
      const i = stack[--p.sp];
      p.alive[i] = 1;
      p.count++;
      if (i >= p.hi) p.hi = i + 1;
      return i;
    },
    free(i) {
      if (i < 0 || i >= cap || !p.alive[i]) return;
      p.alive[i] = 0;
      stack[p.sp++] = i;
      p.count--;
    },
    clear() {
      for (let i = 0; i < p.hi; i++) if (p.alive[i]) p.free(i);
    },
  };
  return p;
}

export function spawnSpark(p, x, y, angle, speed, color, size, life, gravity, drag) {
  const i = p.alloc();
  if (i < 0) return -1;
  p.kind[i] = K_SPARK;
  p.x[i] = x;
  p.y[i] = y;
  p.vx[i] = Math.cos(angle) * speed;
  p.vy[i] = Math.sin(angle) * speed;
  p.life[i] = p.maxLife[i] = life;
  p.size[i] = size;
  p.gravity[i] = gravity;
  p.drag[i] = drag;
  p.color[i] = color;
  return i;
}

export function spawnConfetti(p, x, y, vx, vy, color, size, life) {
  const i = p.alloc();
  if (i < 0) return -1;
  p.kind[i] = K_CONFETTI;
  p.x[i] = x;
  p.y[i] = y;
  p.vx[i] = vx;
  p.vy[i] = vy;
  p.life[i] = p.maxLife[i] = life;
  p.size[i] = size;
  p.rot[i] = Math.random() * 6.28;
  p.vr[i] = (Math.random() - 0.5) * 12;
  p.gravity[i] = 110;
  p.drag[i] = 0.9;
  p.color[i] = color;
  return i;
}

export function stepPool(p, dt, h, onDie) {
  for (let i = 0; i < p.hi; i++) {
    if (!p.alive[i]) continue;
    const k = p.kind[i];
    p.life[i] -= dt;
    if (p.life[i] <= 0 || (k === K_CONFETTI && p.y[i] > h + 30)) {
      if (k === K_ROCKET && p.life[i] <= 0 && onDie) onDie(i);
      p.free(i);
      continue;
    }
    const d = Math.max(0, 1 - p.drag[i] * dt);
    p.vx[i] *= d;
    p.vy[i] = p.vy[i] * d + p.gravity[i] * dt;
    if (k === K_CONFETTI) {
      p.rot[i] += p.vr[i] * dt;
      p.x[i] += Math.sin(p.rot[i] * 0.6 + i) * 18 * dt;
    }
    p.x[i] += p.vx[i] * dt;
    p.y[i] += p.vy[i] * dt;
  }
}

export function drawPool(ctx, p, dpr) {
  if (!p.count) return;
  // 1) 彩带：普通混合
  ctx.globalCompositeOperation = 'source-over';
  let last = '';
  for (let i = 0; i < p.hi; i++) {
    if (!p.alive[i] || p.kind[i] !== K_CONFETTI) continue;
    const c = p.color[i];
    if (c !== last) {
      ctx.fillStyle = c;
      last = c;
    }
    const a = Math.min(1, p.life[i] * 1.5);
    ctx.globalAlpha = a;
    const r = p.rot[i];
    const co = Math.cos(r) * dpr;
    const si = Math.sin(r) * dpr;
    ctx.setTransform(co, si, -si, co, p.x[i] * dpr, p.y[i] * dpr);
    const w = p.size[i];
    const hh = Math.max(0.6, w * 0.55 * Math.abs(Math.cos(r * 0.7 + i)));
    ctx.fillRect(-w / 2, -hh / 2, w, hh);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // 2) 火花与火箭：叠加混合，短拖尾
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  last = '';
  for (let i = 0; i < p.hi; i++) {
    if (!p.alive[i]) continue;
    const k = p.kind[i];
    if (k === K_CONFETTI) continue;
    const c = p.color[i];
    if (c !== last) {
      ctx.strokeStyle = c;
      last = c;
    }
    const f = Math.max(0, Math.min(1, p.life[i] / p.maxLife[i]));
    ctx.globalAlpha = k === K_ROCKET ? 1 : f * f;
    ctx.lineWidth = k === K_ROCKET ? p.size[i] : Math.max(0.6, p.size[i] * (0.4 + 0.6 * f));
    const tl = k === K_ROCKET ? 0.07 : 0.035;
    ctx.beginPath();
    ctx.moveTo(p.x[i] - p.vx[i] * tl, p.y[i] - p.vy[i] * tl);
    ctx.lineTo(p.x[i], p.y[i]);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** 让 canvas 位图尺寸匹配其 CSS 尺寸（dpr 最多 2），返回逻辑尺寸。 */
export function fitCanvas(canvas, ctx) {
  const dpr = Math.min(2, (typeof devicePixelRatio === 'number' && devicePixelRatio) || 1);
  let w = 0;
  let h = 0;
  if (canvas.getBoundingClientRect) {
    const r = canvas.getBoundingClientRect();
    w = r.width;
    h = r.height;
  }
  w = Math.round(w || canvas.clientWidth || (typeof innerWidth === 'number' ? innerWidth : 0) || 300);
  h = Math.round(h || canvas.clientHeight || (typeof innerHeight === 'number' ? innerHeight : 0) || 150);
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h, dpr };
}

export function requestFrame(cb) {
  if (typeof requestAnimationFrame === 'function') return requestAnimationFrame(cb);
  return setTimeout(() => cb(nowMs()), 16);
}
export function cancelFrame(id) {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
}
export function pageHidden() {
  return typeof document !== 'undefined' && !!document.hidden;
}

/* ------------------------------------ Fx ------------------------------------ */

const MAX_TEXTS = 16;
const MAX_RINGS = 12;
const MAX_QUEUE = 48;
const Q_FIREWORK = 0;
const Q_RING = 1;
const Q_BURST = 2;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = () => PALETTE[(Math.random() * PALETTE.length) | 0];
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

export function createFx(canvas) {
  const ctx = canvas.getContext('2d');
  const pool = createPool(600);
  const texts = Array.from({ length: MAX_TEXTS }, () => ({ on: false, x: 0, y: 0, text: '', color: '#fff', size: 28, age: 0, life: 1, rise: 70 }));
  const rings = Array.from({ length: MAX_RINGS }, () => ({ on: false, x: 0, y: 0, r0: 0, r1: 0, age: 0, life: 0.8, color: '#fff' }));
  const queue = Array.from({ length: MAX_QUEUE }, () => ({ on: false, t: 0, kind: 0, x: 0, y: 0, color: '', count: 0 }));

  let W = 300;
  let H = 150;
  let dpr = 1;
  let level = 2;
  let stage = 0;
  let running = false;
  let destroyed = false;
  let raf = 0;
  let last = 0;
  let flashA = 0;
  let flashColor = PALETTE[3];
  let listening = false;
  pool.limit = poolLimit(level);

  function resize() {
    if (destroyed || !ctx) return;
    const s = fitCanvas(canvas, ctx);
    W = s.w;
    H = s.h;
    dpr = s.dpr;
    if (!isActive()) ctx.clearRect(0, 0, W, H);
  }

  function setMotion(l) {
    level = clampLevel(l);
    pool.limit = poolLimit(level);
    if (level === 0) {
      pool.clear();
      for (const r of rings) r.on = false;
      for (const q of queue) q.on = false;
      flashA = 0;
    }
  }
  function setStage(n) {
    stage = clampStage(n);
  }

  function isActive() {
    if (pool.count > 0 || flashA > 0.002) return true;
    for (const t of texts) if (t.on) return true;
    for (const r of rings) if (r.on) return true;
    for (const q of queue) if (q.on) return true;
    return false;
  }

  function wake() {
    if (!running || destroyed || raf || pageHidden()) return;
    last = 0;
    raf = requestFrame(frame);
  }

  function onVisibility() {
    if (pageHidden()) {
      if (raf) cancelFrame(raf);
      raf = 0;
    } else if (isActive()) wake();
  }

  /* ---- 发射 ---- */

  function emitBurst(x, y, opts) {
    const bp = burstParams(stage, opts);
    const n = scaleCount(bp.count, level);
    const base = opts && opts.color;
    for (let k = 0; k < n; k++) {
      const c = base && Math.random() >= bp.mix ? base : pick();
      const a = Math.random() * 6.2832;
      const sp = bp.speed * rand(0.25, 1);
      if (spawnSpark(pool, x, y, a, sp, c, bp.size * rand(0.7, 1.3), bp.life * rand(0.7, 1.2), 260, 2.2) < 0) break;
    }
  }

  function explode(x, y, color, count) {
    const n = scaleCount(count, level);
    const shape = Math.random();
    const sp = rand(150, 230) + stage * 8;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.2832 + rand(-0.05, 0.05);
      // 一半火花走固定半径圈，一半随机，营造层次
      const s = shape < 0.5 || k % 2 ? sp * rand(0.9, 1) : sp * rand(0.3, 1);
      const c = color && Math.random() < 0.7 ? color : pick();
      if (spawnSpark(pool, x, y, a, s, c, rand(1.6, 2.6), rand(0.9, 1.5), 90, 1.6) < 0) break;
    }
  }

  function launch(x, y, opts) {
    if (level === 0) return;
    const color = (opts && opts.color) || pick();
    const count = (opts && opts.count) || 42 + stage * 4;
    const i = pool.alloc();
    if (i < 0) return;
    const T = rand(0.55, 0.85);
    const sx = x + rand(-30, 30);
    pool.kind[i] = K_ROCKET;
    pool.x[i] = sx;
    pool.y[i] = H + 8;
    pool.vx[i] = (x - sx) / T;
    pool.vy[i] = (y - H - 8) / T;
    pool.life[i] = pool.maxLife[i] = T;
    pool.size[i] = 2.6;
    pool.gravity[i] = 0;
    pool.drag[i] = 0;
    pool.color[i] = color;
    pool.data[i] = count;
  }

  function addRing(x, y, color, r1, life) {
    for (const r of rings) {
      if (r.on) continue;
      r.on = true;
      r.x = x;
      r.y = y;
      r.r0 = 6;
      r.r1 = r1;
      r.age = 0;
      r.life = life;
      r.color = color;
      return;
    }
  }

  function later(delay, kind, x, y, color, count) {
    if (delay <= 0) return runQueued(kind, x, y, color, count);
    for (const q of queue) {
      if (q.on) continue;
      q.on = true;
      q.t = delay;
      q.kind = kind;
      q.x = x;
      q.y = y;
      q.color = color;
      q.count = count;
      return;
    }
  }
  function runQueued(kind, x, y, color, count) {
    if (kind === Q_FIREWORK) launch(x, y, { color, count });
    else if (kind === Q_RING) addRing(x, y, color, Math.max(W, H) * 0.55, 1.1);
    else if (kind === Q_BURST) emitBurst(x, y, { color, count });
  }

  function flash(alpha, color) {
    if (level < 2 || !(alpha > 0)) return;
    if (!sharedFlashLimiter.take()) return;
    flashA = Math.min(0.12, alpha); // 低对比、柔和衰减，不会出现大面积白屏
    flashColor = color;
  }

  /* ---- 公开 API ---- */

  function burst(x, y, opts) {
    if (destroyed || level === 0) return;
    emitBurst(x, y, opts || {});
    if (stage >= 2) addRing(x, y, (opts && opts.color) || pick(), 50 + stage * 9, 0.5);
    wake();
  }

  function confetti(opts) {
    if (destroyed || level === 0) return;
    const o = opts || {};
    const n = scaleCount(o.count || 60, level);
    if (o.x !== undefined && o.y !== undefined) {
      // 定点喷射式彩带
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + rand(-0.9, 0.9);
        const sp = rand(220, 520) * (o.power || 1);
        const i = spawnConfetti(pool, o.x, o.y, Math.cos(a) * sp, Math.sin(a) * sp, pick(), rand(5, 9), rand(2.2, 3.6));
        if (i < 0) break;
      }
    } else {
      if (level < 2) return; // 1 档无彩带雨
      for (let k = 0; k < n; k++) {
        const i = spawnConfetti(pool, rand(0, W), rand(-H * 0.5, -10), rand(-30, 30), rand(30, 120), pick(), rand(5, 9), rand(4, 7));
        if (i < 0) break;
      }
    }
    wake();
  }

  function fireworks(x, y, opts) {
    if (destroyed || level === 0) return;
    const o = opts || {};
    const shells = Math.max(1, Math.round(o.shells || 1));
    for (let k = 0; k < shells; k++) {
      const px = k === 0 ? x : x + rand(-W * 0.2, W * 0.2);
      const py = k === 0 ? y : y + rand(-H * 0.1, H * 0.1);
      later(k * 0.22, Q_FIREWORK, px, py, o.color || pick(), o.count || 0);
    }
    wake();
  }

  function floatText(x, y, text, opts) {
    if (destroyed) return;
    const o = opts || {};
    let slot = null;
    for (const t of texts) {
      if (!t.on) {
        slot = t;
        break;
      }
    }
    if (!slot) {
      // 全满则复用最老的一条
      slot = texts[0];
      for (const t of texts) if (t.age > slot.age) slot = t;
    }
    slot.on = true;
    slot.x = x;
    slot.y = y;
    slot.text = String(text);
    slot.color = o.color || '#ffb02e';
    slot.size = o.size || 28;
    slot.age = 0;
    slot.life = o.life || 1.1;
    slot.rise = o.rise === undefined ? 70 : o.rise;
    wake();
  }

  function shake(el, power) {
    if (destroyed || level === 0 || !el || typeof el.animate !== 'function') return null;
    try {
      return el.animate(shakeKeyframes(power), { duration: 260 + 120 * Math.min(1, Math.max(0, Number(power) || 0)), easing: 'ease-out', composite: 'add' });
    } catch (e) {
      return null;
    }
  }

  function ring(x, y, color) {
    if (destroyed || level === 0) return;
    addRing(x, y, color || pick(), 90 + stage * 14, 0.7);
    wake();
  }

  function milestone(kind) {
    if (destroyed) return;
    const spec = milestoneSpec(kind, level);
    if (level === 0) return;
    const cx = W / 2;
    const cy = H * 0.42;
    for (let k = 0; k < spec.rings; k++) later(k * 0.16, Q_RING, cx, cy, PALETTE[k % PALETTE.length], 0);
    for (let k = 0; k < spec.fireworks; k++) later(0.1 + k * 0.2, Q_FIREWORK, rand(W * 0.15, W * 0.85), rand(H * 0.15, H * 0.5), PALETTE[(k + 1) % PALETTE.length], 0);
    if (spec.confetti) {
      const half = Math.round(spec.confetti / 2);
      confetti({ count: half }); // 彩带雨
      confetti({ count: spec.confetti - half, x: cx, y: H * 0.85, power: 1.3 }); // 底部喷射
    }
    if (spec.flash) flash(spec.flash, PALETTE[Math.floor(Math.random() * PALETTE.length)]);
    wake();
  }

  function clear() {
    pool.clear();
    for (const t of texts) t.on = false;
    for (const r of rings) r.on = false;
    for (const q of queue) q.on = false;
    flashA = 0;
    if (ctx) ctx.clearRect(0, 0, W, H);
  }

  /* ---- 帧循环 ---- */

  function frame(ts) {
    raf = 0;
    if (!running || destroyed) return;
    if (pageHidden()) return; // 可见后由 visibilitychange 唤醒
    const dt = last ? Math.min(0.05, Math.max(0, (ts - last) / 1000)) : 1 / 60;
    last = ts;
    update(dt);
    draw();
    if (isActive()) raf = requestFrame(frame);
    else ctx.clearRect(0, 0, W, H); // 休眠，等待下次发射唤醒
  }

  function update(dt) {
    for (const q of queue) {
      if (!q.on) continue;
      q.t -= dt;
      if (q.t <= 0) {
        q.on = false;
        runQueued(q.kind, q.x, q.y, q.color, q.count);
      }
    }
    stepPool(pool, dt, H, (i) => explode(pool.x[i], pool.y[i], pool.color[i], pool.data[i]));
    for (const t of texts) if (t.on && (t.age += dt) >= t.life) t.on = false;
    for (const r of rings) if (r.on && (r.age += dt) >= r.life) r.on = false;
    if (flashA > 0) flashA = Math.max(0, flashA - dt * 0.3);
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (flashA > 0.002) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = flashA;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    drawRings();
    drawPool(ctx, pool, dpr);
    drawTexts();
  }

  function drawRings() {
    ctx.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      if (!r.on) continue;
      const p = r.age / r.life;
      ctx.globalAlpha = (1 - p) * 0.9;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 1 + 5 * (1 - p);
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * easeOut(p), 0, 6.2832);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawTexts() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of texts) {
      if (!t.on) continue;
      const p = t.age / t.life;
      // 淡入 12% → 保持 → 后 40% 淡出
      const a = p < 0.12 ? p / 0.12 : p > 0.6 ? Math.max(0, (1 - p) / 0.4) : 1;
      const moving = level > 0;
      const y = t.y - (moving ? t.rise * easeOut(p) : 0);
      const pop = moving && p < 0.15 ? 1 + (1 - p / 0.15) * 0.35 : 1;
      let size = t.size * pop;
      ctx.font = `800 ${size}px ${FONT_STACK}`;
      let w = ctx.measureText(t.text).width;
      const maxW = W - 24;
      if (w > maxW && w > 0) {
        size *= maxW / w;
        ctx.font = `800 ${size}px ${FONT_STACK}`;
        w = maxW;
      }
      const x = Math.min(Math.max(t.x, w / 2 + 12), Math.max(w / 2 + 12, W - w / 2 - 12));
      ctx.globalAlpha = a;
      ctx.lineWidth = Math.max(3, size * 0.2);
      ctx.strokeStyle = 'rgba(20,18,58,0.92)';
      ctx.strokeText(t.text, x, y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, x, y);
    }
    ctx.globalAlpha = 1;
  }

  function start() {
    if (destroyed) return;
    running = true;
    if (!listening && typeof document !== 'undefined' && document.addEventListener) {
      document.addEventListener('visibilitychange', onVisibility);
      listening = true;
    }
    if (isActive()) wake();
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

  function destroy() {
    if (destroyed) return;
    stop();
    clear();
    destroyed = true;
  }

  function stats() {
    return { active: pool.count, limit: pool.limit, level, stage, running, sleeping: running && !raf };
  }

  resize();
  return { resize, setMotion, setStage, burst, confetti, fireworks, floatText, shake, ring, milestone, clear, start, stop, destroy, stats };
}
