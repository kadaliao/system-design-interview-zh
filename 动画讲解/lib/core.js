// 动画讲解 · 共享绘制库：工具函数、背景、外壳（章节标签/进度/字幕）、通用组件。
// 每个章节的 scenes.js 只负责"画什么"，外观一致性由这里保证。
export const W = 1920, H = 1080;
export const cv = document.getElementById('c');
export const ctx = cv.getContext('2d');

// ───────── 工具 ─────────
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const P = (t, a, b) => clamp((t - a) / (b - a));
export const eOut = (t) => 1 - Math.pow(1 - t, 3);
export const eIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const eBack = (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
export const eExpo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const MONO = '"SF Mono","Menlo","JetBrains Mono",monospace';
export let SANS = '"PingFang SC","Hiragino Sans GB","Helvetica Neue",sans-serif';
export const INK = '#eef1fa', MUTE = '#8f98b0', DIM = '#566078', RED = '#ff5d73';
export const SC = ['#34d5c8', '#8b8dfc', '#f472b6', '#fbbf24', '#a3e635'];
export const hash32 = (s) => { let x = 2166136261; for (const c of s) { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619); } x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return ((x >>> 0) / 4294967296) * 100; };
export const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

export function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
export function glass(x, y, w, h, { r = 22, a = 1, accent = null, fill = 0.055 } = {}) {
  ctx.save(); ctx.globalAlpha *= a;
  rr(x, y, w, h, r); ctx.fillStyle = `rgba(255,255,255,${fill})`; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = accent ? accent + '88' : 'rgba(255,255,255,0.13)'; ctx.stroke();
  ctx.restore();
}
export function text(s, x, y, { size = 32, weight = 500, color = INK, align = 'left', font = SANS, a = 1, ls = 0, base = 'alphabetic' } = {}) {
  ctx.save(); ctx.globalAlpha *= a; ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color;
  ctx.textAlign = align; ctx.textBaseline = base; ctx.letterSpacing = `${ls}px`; ctx.fillText(s, x, y); ctx.restore();
}
export function glow(color, blur) { ctx.shadowColor = color; ctx.shadowBlur = blur; }
export function dot(x, y, r, color, { g = 18, a = 1 } = {}) {
  ctx.save(); ctx.globalAlpha *= a; glow(color, g); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore();
}

// ───────── 背景 / 通用外壳 ─────────
export function background(t) {
  ctx.fillStyle = '#06080f'; ctx.fillRect(0, 0, W, H);
  const g1 = ctx.createRadialGradient(1500 + Math.sin(t * 0.2) * 80, 180, 0, 1500, 180, 900);
  g1.addColorStop(0, 'rgba(120,90,255,0.20)'); g1.addColorStop(1, 'rgba(120,90,255,0)');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, W, H);
  const g2 = ctx.createRadialGradient(250, 950 + Math.cos(t * 0.17) * 60, 0, 250, 950, 800);
  g2.addColorStop(0, 'rgba(40,210,200,0.14)'); g2.addColorStop(1, 'rgba(40,210,200,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  const o = (t * 6) % 60;
  for (let x = -60 + o; x < W + 60; x += 60) for (let y = 30; y < H; y += 60) ctx.fillRect(x, y, 2, 2);
  for (let i = 0; i < 26; i++) {
    const px = (rnd(i) * W + t * (6 + rnd(i + 9) * 14)) % W, py = (rnd(i + 40) * H - t * (4 + rnd(i + 3) * 9) + H * 3) % H;
    ctx.fillStyle = `rgba(190,200,255,${0.05 + rnd(i + 70) * 0.12})`; ctx.beginPath(); ctx.arc(px, py, 1.5 + rnd(i + 5) * 2, 0, 7); ctx.fill();
  }
  const v = ctx.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 1250);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
}
export function chrome(si, n, meta) {
  ctx.save(); ctx.font = `600 24px ${SANS}`; const cw = ctx.measureText(`CH ${String(meta.no).padStart(2, '0')} · ${meta.title}`).width + 92; ctx.restore();
  glass(70, 52, cw, 54, { r: 27 });
  dot(104, 79, 6, '#34d5c8', { g: 12 });
  text(`CH ${String(meta.no).padStart(2, '0')} · ${meta.title}`, 126, 88, { size: 24, weight: 600, color: INK, ls: 1 });
  for (let i = 0; i < n; i++) {
    const x = 1850 - (n - i) * 34, on = i === si;
    ctx.fillStyle = on ? '#8b8dfc' : i < si ? 'rgba(139,141,252,0.45)' : 'rgba(255,255,255,0.14)';
    rr(x, 76, on ? 26 : 18, 6, 3); ctx.fill();
  }
}
export let LANG = 'zh';
export function setLang(l) { LANG = l; if (l !== 'zh') SANS = '-apple-system,"SF Pro Display","Helvetica Neue",Arial,sans-serif'; }
// 把旁白切成字幕短句。中文按标点；英文按标点，并把过长的句子均匀拆成不超过 9 个词的几段，保证字幕始终单行。
function subChunks(text) {
  if (LANG === 'zh') {
    const parts = text.split(/(?<=[，。：、；！？])/).map((s) => s.trim()).filter(Boolean), ch = [];
    for (let i = 0; i < parts.length; i++) {
      let p = parts[i];
      while (p.replace(/[，。：、；！？]/g, '').length < 6 && i + 1 < parts.length) p += parts[++i];
      ch.push(p);
    }
    return ch.map((c) => c.replace(/[，。：、；！？]$/, ''));
  }
  const clauses = text.split(/(?<=[,.;:!?])\s+/).map((s) => s.trim()).filter(Boolean), merged = [];
  for (let i = 0; i < clauses.length; i++) {
    let c = clauses[i];
    while (c.split(/\s+/).length < 4 && i + 1 < clauses.length) c += ' ' + clauses[++i];
    merged.push(c);
  }
  const out = [];
  for (const c of merged) {
    const w = c.split(/\s+/), n = Math.ceil(w.length / 9), size = Math.ceil(w.length / n);
    for (let k = 0; k < n; k++) out.push(w.slice(k * size, (k + 1) * size).join(' '));
  }
  return out.map((c) => c.replace(/[,.;:]$/, ''));
}
export function subtitle(sc, lt) {
  const ch = subChunks(sc.text);
  const wts = ch.map((c) => c.length), tot = wts.reduce((a, b) => a + b, 0);
  let t0 = sc.lead; const tv = lt - sc.lead;
  if (tv < -0.15 || tv > sc.voiceDur + 0.5) return;
  for (let i = 0; i < ch.length; i++) {
    const t1 = t0 + (wts[i] / tot) * sc.voiceDur;
    if (lt >= t0 - 0.05 && (lt < t1 || i === ch.length - 1)) {
      const a = Math.min(P(lt, t0 - 0.05, t0 + 0.25), 1 - P(lt, sc.lead + sc.voiceDur + 0.1, sc.lead + sc.voiceDur + 0.5));
      const s = ch[i];
      let size = LANG === 'zh' ? 42 : 40;
      ctx.save(); ctx.font = `600 ${size}px ${SANS}`; let w = ctx.measureText(s).width + 80;
      if (w > 1760) { size = Math.floor(size * 1760 / w); ctx.font = `600 ${size}px ${SANS}`; w = ctx.measureText(s).width + 80; } ctx.restore();
      ctx.save(); ctx.globalAlpha = a; ctx.translate(0, (1 - eOut(clamp(a))) * 12);
      glass(W / 2 - w / 2, 944, w, 76, { r: 38, fill: 0.09 });
      text(s, W / 2, 996, { size, weight: 600, align: 'center' });
      ctx.restore();
      return;
    }
    t0 = t1;
  }
}
export function header(lt, num, title, accent, sub) {
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size: 70, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: 26, color: MUTE });
  ctx.restore();
}
export function badge(x, y, label, color, a = 1) {
  ctx.save(); ctx.font = `600 24px ${SANS}`; const w = ctx.measureText(label).width + 44; ctx.restore();
  glass(x, y, w, 52, { r: 26, a, accent: color }); text(label, x + 22, y + 35, { size: 24, weight: 600, color, a }); return w;
}


// ───────── 通用组件（所有章节共用，保证外观一致） ─────────
// 版面约定：左栏 x∈[110,750] 放标题/要点/数字卡；舞台 x∈[800,1840]、y∈[150,920]；y≥940 留给字幕。

/** 箭头：from→to，p∈[0,1] 为已画出的比例，dash 为虚线 */
export function arrow(x1, y1, x2, y2, { color = '#8f98b0', w = 4, a = 1, p = 1, dash = null, head = 14, g = 0 } = {}) {
  if (a <= 0 || p <= 0) return;
  const x = lerp(x1, x2, p), y = lerp(y1, y2, p), th = Math.atan2(y2 - y1, x2 - x1);
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  if (g) glow(color, g); if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x - Math.cos(th) * head * 0.6, y - Math.sin(th) * head * 0.6); ctx.stroke(); ctx.setLineDash([]);
  ctx.translate(x, y); ctx.rotate(th); ctx.beginPath(); ctx.moveTo(head, 0); ctx.lineTo(-head * 0.7, head * 0.7); ctx.lineTo(-head * 0.7, -head * 0.7); ctx.closePath(); ctx.fill();
  ctx.restore();
}
/** 服务/组件方框：以 (x,y) 为左上角；s 为缩放（弹出动画用），hot 画红色告警描边 */
export function box(x, y, w, h, label, { color = '#8b8dfc', sub = null, a = 1, s = 1, hot = false, size = 28 } = {}) {
  if (a <= 0 || s <= 0) return;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  glass(x, y, w, h, { accent: hot ? RED : color });
  ctx.fillStyle = hot ? RED : color; glow(hot ? RED : color, 16); rr(x + 24, y, w - 48, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
  text(label, cx, sub ? cy - 2 : cy + size * 0.35, { size, weight: 700, align: 'center', color: INK });
  if (sub) text(sub, cx, cy + 32, { size: Math.round(size * 0.62), align: 'center', color: MUTE, font: MONO });
  ctx.restore();
}
/** 数据库圆柱 */
export function dbIcon(x, y, w, h, label, { color = '#34d5c8', a = 1, fill = 0 } = {}) {
  if (a <= 0) return;
  const ry = h * 0.14;
  ctx.save(); ctx.globalAlpha *= a; ctx.lineWidth = 3; ctx.strokeStyle = color; glow(color, 14);
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + ry, w / 2, ry, 0, 0, 7); ctx.fillStyle = color + '22'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y + ry); ctx.lineTo(x, y + h - ry); ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, Math.PI, 0, true); ctx.lineTo(x + w, y + ry); ctx.stroke();
  ctx.shadowBlur = 0;
  if (fill > 0) { ctx.fillStyle = color + '44'; ctx.fillRect(x + 4, y + h - ry - (h - 2 * ry) * fill, w - 8, (h - 2 * ry) * fill); }
  ctx.beginPath(); ctx.ellipse(x + w / 2, y + h - ry, w / 2, ry, 0, 0, Math.PI); ctx.stroke();
  ctx.restore();
  if (label) text(label, x + w / 2, y + h + 34, { size: 24, weight: 600, align: 'center', color: INK, a });
}
/** 沿直线移动的数据包（带拖尾）；p∈[0,1] */
export function packet(x1, y1, x2, y2, p, color, { r = 9, a = 1, trail = 0.12 } = {}) {
  if (p <= 0 || p >= 1) return;
  for (let k = 5; k >= 0; k--) { const q = clamp(p - k * trail / 5); dot(lerp(x1, x2, q), lerp(y1, y2, q), r * (1 - k * 0.12), color, { g: k ? 0 : 20, a: a * (1 - k / 6) * 0.9 }); }
}
/** 左栏数字卡：标签 + 大数字 */
export function statCard(x, y, w, label, value, { color = '#8b8dfc', a = 1, h = 112, note = null } = {}) {
  if (a <= 0) return;
  glass(x, y, w, h, { a, accent: color });
  text(label, x + 30, y + 44, { size: 22, color: MUTE, a });
  text(value, x + 30, y + 94, { size: 48, weight: 800, font: MONO, color, a });
  if (note) text(note, x + w - 30, y + 94, { size: 26, color: MUTE, align: 'right', a });
}
/** 左栏要点：第 i 条，y 从 430 起每 64px 一行 */
export function bullet(i, str, a, { color = INK, y0 = 430, step = 64, size = 30 } = {}) {
  if (a <= 0) return; const y = y0 + i * step;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-20 * (1 - a), 0);
  dot(122, y - 10, 5, '#8b8dfc', { g: 10 }); text(str, 146, y, { size, weight: 600, color }); ctx.restore();
}
/** 水平条：值 v∈[0,1]，label 在左，valueText 在右 */
export function hbar(x, y, w, label, v, color, { a = 1, valueText = null, labelW = 56 } = {}) {
  text(label, x, y + 30, { size: 26, weight: 800, color, font: MONO, a });
  ctx.save(); ctx.globalAlpha *= a; rr(x + labelW, y + 8, w, 30, 15); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.fillStyle = color; glow(color, 14); rr(x + labelW, y + 8, Math.max(30, v * w), 30, 15); ctx.fill(); ctx.restore();
  if (valueText) text(valueText, x + labelW + w + 22, y + 33, { size: 26, weight: 700, font: MONO, a });
}
/** 默认片头（章节没有自定义 title 场景时使用） */
export function defaultTitle(lt, meta) {
  const a = eOut(P(lt, 0.2, 1.2));
  text(LANG === 'zh' ? '系统设计面试 · 动画讲解' : 'SYSTEM DESIGN INTERVIEW · ANIMATED GUIDE', 110, 400, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 1100, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = eOut(P(lt, 0.4, 1.4)); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  let fs = LANG === 'zh' ? (meta.title.length > 9 ? 110 : 140) : 120;
  ctx.font = `900 ${fs}px ${SANS}`; ctx.letterSpacing = '4px';
  const tw = ctx.measureText(meta.title).width; if (tw > 1700) fs = Math.floor(fs * 1700 / tw);
  ctx.font = `900 ${fs}px ${SANS}`; ctx.fillStyle = g; ctx.fillText(meta.title, 104, 560); ctx.restore();
  if (LANG === 'zh') text(meta.en || '', 112, 630, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text(LANG === 'zh' ? `第 ${meta.no} 章` : `Chapter ${meta.no}`, 112, 720, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}
