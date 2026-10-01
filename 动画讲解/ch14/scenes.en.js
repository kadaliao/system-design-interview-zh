// Chapter 14 Design YouTube: English scenes (shell and helpers from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge,
  arrow, box, dbIcon, packet, statCard, bullet, hbar } from '../lib/core.js';


// English headings are wider: auto-shrink so the title fits the 640px left column
function header(lt, num, title, accent, sub) {
  ctx.save(); ctx.font = `800 70px ${SANS}`; const w = ctx.measureText(title).width; ctx.restore();
  const size = Math.min(70, Math.floor(70 * 640 / Math.max(w, 1)));
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: 26, color: MUTE });
  ctx.restore();
}
function fitSize(str, weight, size, maxW) {
  ctx.save(); ctx.font = `${weight} ${size}px ${SANS}`; const w = ctx.measureText(str).width; ctx.restore();
  return Math.min(size, Math.floor(size * maxW / Math.max(w, 1)));
}

export const meta = { no: 14, title: 'Design YouTube', en: 'Design YouTube' };

// 角色配色（全片统一）
const C_CLIENT = '#9aa6d6', C_API = SC[1], C_STORE = SC[0], C_TC = SC[3], C_CDN = SC[2], C_OK = SC[4];
const fade = (lt, t0, dur = 0.6) => eOut(P(lt, t0, t0 + dur));

function chunk(x, y, w, h, label, color, { a = 1, ring = null, size = 22, fill = '30', weight = 700 } = {}) {
  if (a <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= a;
  glow(ring || color, ring ? 20 : 8); rr(x, y, w, h, 10); ctx.fillStyle = color + fill; ctx.fill();
  ctx.lineWidth = ring ? 3 : 2; ctx.strokeStyle = ring || color; ctx.stroke(); ctx.shadowBlur = 0;
  if (label) text(label, x + w / 2, y + h / 2 + size * 0.36, { size, weight, align: 'center', font: MONO });
  ctx.restore();
}
function flow(lt, t0, x1, y1, x2, y2, color, { n = 3, period = 1.5, r = 8, a = 1 } = {}) {
  if (lt < t0) return;
  for (let k = 0; k < n; k++) { const p = ((lt - t0) / period + k / n) % 1; packet(x1, y1, x2, y2, p, color, { r, a }); }
}
function tag(x, y, s, color, a = 1, { size = 22, align = 'left' } = {}) { text(s, x, y, { size, weight: 700, color, a, align }); }

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  // 右侧：切块 → 并行处理 → 拼接 的小动画
  const N = 8, pitch = 100, w = 88, x0 = 980;
  const ys = [330, 520, 710];
  const rowLab = ['Split', 'Process in parallel', 'Merge'];
  rowLab.forEach((s, k) => text(s, x0, ys[k] - 24, { size: 24, weight: 700, color: [C_CLIENT, C_TC, C_OK][k], a: fade(lt, 0.8 + k * 1.4) }));
  const split = eIO(P(lt, 1.6, 2.6)), drop = eIO(P(lt, 3.6, 4.8)), merge = eIO(P(lt, 6.6, 8.0));
  for (let i = 0; i < N; i++) {
    const born = eOut(P(lt, 0.5 + i * 0.05, 1.2 + i * 0.05));
    const xs = lerp(x0 + i * 88, x0 + i * pitch, split);       // 连续条 → 分开
    const xm = lerp(x0 + i * pitch, x0 + i * 90, merge);
    const x = merge > 0 ? xm : xs;
    const ww = merge > 0 ? lerp(w, 90, merge) : lerp(88, w, split);
    let y = lerp(ys[0], ys[1], drop); y = lerp(y, ys[2], merge);
    const processing = lt > 4.6 && lt < 7.0;
    const col = merge > 0.5 ? C_OK : drop > 0.5 ? C_TC : C_CLIENT;
    const bump = processing ? Math.sin(lt * 5 + i) * 0.5 + 0.5 : 0;
    chunk(x, y + (processing ? 0 : 0), ww, 74, String(i + 1), col, { a: born, ring: processing && bump > 0.7 ? '#ffffff' : null, size: 26 });
  }
  text('System Design Interview', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 4, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = eOut(P(lt, 0.4, 1.4)); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 100px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '1px'; ctx.fillText('Design YouTube', 104, 500); ctx.restore();
  text('Animated walkthrough', 112, 570, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('Chapter 14', 112, 660, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 1：整体架构 ─────────
function sceneArch(lt) {
  header(lt, '01', 'Architecture Overview', C_API, 'Control and video data take separate paths');
  const A = (t) => fade(lt, t);
  // 节点
  box(820, 470, 140, 100, 'Client', { color: C_CLIENT, a: A(1.0), size: 26 });
  box(1060, 230, 200, 100, 'API', { color: C_API, sub: 'auth · metadata', a: A(1.4), size: 28 });
  dbIcon(1420, 215, 100, 110, 'Metadata DB', { color: C_STORE, a: A(1.8) });
  dbIcon(1100, 470, 100, 120, 'Raw storage', { color: C_STORE, a: A(6.8) });
  box(1330, 480, 200, 100, 'Transcoders', { color: C_TC, a: A(11.0), size: 26 });
  dbIcon(1655, 470, 100, 120, 'Encoded storage', { color: C_STORE, a: A(12.6) });
  box(1330, 740, 200, 100, 'CDN', { color: C_CDN, sub: 'edge nodes', a: A(15.0), size: 28 });
  // 控制面
  arrow(930, 470, 1070, 330, { color: C_API, p: eOut(P(lt, 2.4, 3.2)), g: 6 });
  arrow(1260, 280, 1410, 272, { color: C_API, p: eOut(P(lt, 3.0, 3.8)), g: 6 });
  flow(lt, 3.6, 930, 470, 1070, 330, C_API, { n: 2, period: 1.6, r: 7 });
  flow(lt, 4.2, 1260, 280, 1410, 272, C_API, { n: 2, period: 1.6, r: 7 });
  // 数据面
  arrow(960, 520, 1095, 520, { color: C_STORE, p: eOut(P(lt, 7.2, 8.0)), g: 6 });
  flow(lt, 8.0, 960, 520, 1095, 520, C_STORE, { n: 3, period: 1.2, r: 9 });
  arrow(1210, 530, 1325, 530, { color: C_TC, p: eOut(P(lt, 11.4, 12.0)), g: 6 });
  flow(lt, 12.0, 1210, 530, 1325, 530, C_TC, { n: 3, period: 1.2, r: 9 });
  arrow(1535, 530, 1645, 530, { color: C_TC, p: eOut(P(lt, 12.8, 13.4)), g: 6 });
  flow(lt, 13.4, 1535, 530, 1645, 530, C_TC, { n: 3, period: 1.2, r: 9 });
  arrow(1705, 650, 1535, 770, { color: C_CDN, p: eOut(P(lt, 15.3, 16.0)), g: 6 });
  flow(lt, 16.0, 1705, 650, 1535, 770, C_CDN, { n: 2, period: 1.4, r: 9 });
  arrow(1325, 800, 900, 580, { color: C_CDN, p: eOut(P(lt, 16.2, 17.2)), g: 6 });
  flow(lt, 17.2, 1325, 800, 900, 580, C_CDN, { n: 3, period: 1.8, r: 10 });
  tag(1430, 880, 'Playback: straight from CDN', C_CDN, A(17.0), { align: 'center' });
  tag(1088, 442, 'Video bytes bypass the API', C_STORE, A(7.8), { size: 22 });
  bullet(0, 'Control plane: API auth + metadata', A(2.2));
  bullet(1, 'Data plane: video goes to storage', A(7.4));
  bullet(2, 'Async transcoding, CDN delivery', A(14.0));
  let bx = 110;
  [['Upload once', C_STORE], ['Encode many', C_TC], ['Play at edge', C_CDN]].forEach(([s, c], k) => { bx += badge(bx, 700, s, c, A(20.2 + k * 0.35)) + 14; });
}

// ───────── 场景 2：分块上传 ─────────
const UP = { x0: 830, pitch: 88, w: 78, y: 300, h: 70, sy: 700 };
const upX = (i) => UP.x0 + i * UP.pitch;
function sceneUpload(lt) {
  header(lt, '02', 'Chunked Upload', C_STORE, 'Never send a big file in one shot');
  const A = (t) => fade(lt, t);
  // 原片条 → 切成 8 块
  const split = eIO(P(lt, 5.0, 6.2));
  text('Original · avg 300 MB, max 1 GB', UP.x0, UP.y - 18, { size: 22, color: MUTE, a: A(1.0) });
  // 对象存储
  glass(UP.x0 - 8, 640, 8 * UP.pitch + 6, 150, { a: A(2.0), accent: C_STORE });
  text('Object storage', UP.x0 + 14, 676, { size: 24, weight: 700, color: C_STORE, a: A(2.0) });
  for (let i = 0; i < 8; i++) { ctx.save(); ctx.globalAlpha *= A(2.0); ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1.5; rr(upX(i), UP.sy, UP.w, 70, 10); ctx.stroke(); ctx.restore(); }
  // API 与预签名
  box(1600, 290, 230, 100, 'API', { color: C_API, sub: 'auth', a: A(9.0), size: 28 });
  const tok = P(lt, 9.8, 11.2);
  arrow(1600, 340, 1540, 340, { color: C_API, p: eOut(P(lt, 9.6, 10.4)), g: 6 });
  if (tok > 0) badge(1560, 420, 'Pre-signed URL', C_API, A(10.0));
  text('time-limited · scoped', 1568, 502, { size: 22, color: MUTE, a: A(10.4) });
  // 8 块
  const fails = 5;
  for (let i = 0; i < 8; i++) {
    const wave = i < 4 ? 0 : 1;
    const t0 = wave === 0 ? 12.2 : 14.4, dur = 1.8;
    let p = eIO(P(lt, t0, t0 + dur)), y = lerp(UP.y, UP.sy, p), col = C_CLIENT, ring = null, a = 1;
    if (i === fails) {
      const go = eIO(P(lt, t0, t0 + 1.3)) * 0.62;
      const back = eIO(P(lt, 16.8, 17.5));
      const re = eIO(P(lt, 17.8, 19.3));
      if (lt < 16.8) y = lerp(UP.y, UP.sy, go);
      else if (lt < 17.8) y = lerp(lerp(UP.y, UP.sy, 0.62), UP.y, back);
      else y = lerp(UP.y, UP.sy, re);
      if (lt >= 15.7 && lt < 17.4) { col = RED; ring = RED; }
      p = lt >= 19.3 ? 1 : 0;
    }
    if (p >= 1) col = C_OK;
    const x = upX(i), wd = lerp(88, UP.w, split);
    const inCol = lt < 5.0 ? C_CLIENT : col;
    chunk(x, y, wd, UP.h, split > 0.3 ? String(i + 1) : '', inCol, { ring, size: 26, a: A(0.8 + i * 0.04) });
    if (i === fails && lt >= 15.9 && lt < 17.4) text('✕', x + UP.w / 2, y - 12, { size: 30, weight: 800, color: RED, align: 'center' });
  }
  if (lt > 12.2) tag(1600, 580, '4 in parallel', C_STORE, A(12.2), { size: 28 });
  if (lt > 12.2) text('Direct to storage', 1600, 620, { size: 22, color: MUTE, a: A(12.6) });
  if (lt > 15.9) text('Chunk 6 fails, resend it', 1600, 700, { size: 22, color: RED, weight: 700, a: A(16.0) });
  bullet(0, 'Pre-signed URL: time-limited', A(9.6));
  bullet(1, 'Parallel chunks, direct to storage', A(12.4));
  bullet(2, 'Retry only the failed chunk', A(16.6));
  statCard(110, 640, 640, 'Re-sent chunks', '1 of 8', { color: C_TC, a: A(17.6), note: 'illustrative' });
}

// ───────── 场景 3：按 GOP 切分 ─────────
function sceneGop(lt) {
  header(lt, '03', 'Cutting by GOP', C_TC, 'Frames depend on each other');
  const A = (t) => fade(lt, t);
  const fx = (i) => 840 + i * 80, FY = 380, FW = 68, FH = 92;
  const isI = (i) => i % 4 === 0;
  // 依赖弧线
  const refA = A(6.8) * (1 - A(12.6) * 0);
  for (let i = 1; i < 12; i++) {
    if (isI(i)) continue;
    const cross = i === 6;
    const k = P(lt, 6.8 + i * 0.12, 7.6 + i * 0.12);
    if (k <= 0) continue;
    const x1 = fx(i) + FW / 2, x0 = fx(i - 1) + FW / 2;
    const col = cross && lt > 10 && lt < 12.8 ? RED : '#8f98b0';
    let al = k; if (lt > 12.8) al = k * (1 - eOut(P(lt, 12.8, 13.6)) * (cross ? 1 : 0.55));
    ctx.save(); ctx.globalAlpha *= al; ctx.strokeStyle = col; ctx.lineWidth = cross && col === RED ? 4 : 2.5; if (col === RED) glow(RED, 10);
    ctx.beginPath(); ctx.moveTo(x1 - 6, FY - 2); ctx.quadraticCurveTo((x1 + x0) / 2, FY - 62, x0 + 6, FY - 4); ctx.stroke();
    ctx.fillStyle = col; ctx.translate(x0 + 6, FY - 4); ctx.rotate(Math.PI * 0.62); ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-6, 6); ctx.lineTo(-6, -6); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  for (let i = 0; i < 12; i++) {
    const a = A(1.0 + i * 0.16);
    const bad = (i === 6 || i === 7) && lt > 10 && lt < 12.8;
    chunk(fx(i), FY, FW, FH, isI(i) ? 'I' : 'P', isI(i) ? C_TC : C_CLIENT, { a, ring: bad ? RED : null, size: 30, fill: isI(i) ? '44' : '24' });
  }
  text('I = key frame (self-contained)    P = refers to earlier frames (illustrative)', 840, 330 - 0, { size: 22, color: MUTE, a: A(2.8) * (1 - A(6.6)) });
  // 错误切法
  const cutX = fx(6) - 6;
  const wa = A(4.0) * (1 - A(12.8));
  if (wa > 0.01) {
    ctx.save(); ctx.globalAlpha *= wa; ctx.strokeStyle = RED; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); glow(RED, 12);
    ctx.beginPath(); ctx.moveTo(cutX, 320); ctx.lineTo(cutX, 560); ctx.stroke(); ctx.restore();
    tag(cutX, 596, 'Cut at arbitrary bytes', RED, wa, { size: 26, align: 'center' });
    if (lt > 10) tag(cutX, 636, 'No reference frame · cannot decode', RED, wa * A(10.4), { size: 22, align: 'center' });
  }
  // 正确切法
  const rc = A(13.0);
  [4, 8].forEach((i, k) => {
    const p = eOut(P(lt, 13.0 + k * 0.4, 13.8 + k * 0.4)); if (p <= 0) return;
    ctx.save(); ctx.globalAlpha *= p; ctx.strokeStyle = C_OK; ctx.lineWidth = 4; ctx.setLineDash([10, 8]); glow(C_OK, 12);
    ctx.beginPath(); ctx.moveTo(fx(i) - 6, 320); ctx.lineTo(fx(i) - 6, 440 + 40 * p); ctx.stroke(); ctx.restore();
  });
  const bc = [SC[0], SC[2], C_OK];
  for (let g = 0; g < 3; g++) {
    const a = A(14.6 + g * 0.5), x = fx(g * 4), w = 3 * 80 + FW;
    glass(x, 480, w, 70, { a, accent: bc[g], r: 16 });
    text(`GOP ${g + 1}`, x + 22, 524, { size: 26, weight: 800, font: MONO, color: bc[g], a });
    text('Decodes alone', x + w - 20, 524, { size: 22, color: MUTE, align: 'right', a });
    const wa2 = A(17.2 + g * 0.35);
    arrow(x + w / 2, 556, x + w / 2, 640, { color: C_TC, p: eOut(P(lt, 17.2 + g * 0.35, 17.9 + g * 0.35)), g: 6 });
    box(x, 650, w, 100, 'Worker', { color: C_TC, sub: 'one chunk each', a: wa2, size: 28 });
  }
  bullet(0, 'Frames depend on each other', A(7.2));
  bullet(1, 'Cut at GOP boundaries', A(13.2));
  statCard(110, 600, 640, 'Every chunk starts with', 'Key frame I', { color: C_TC, a: A(16.6) });
}

// ───────── 场景 4：DAG ─────────
const DG = {
  src: [830, 560, 130, 70, 'Original', SC[0]],
  video: [1010, 430, 140, 64, 'Video', C_API],
  audio: [1010, 720, 140, 64, 'Audio', C_API],
  meta: [1010, 810, 140, 64, 'Metadata', C_API],
  t: [
    [1250, 250, 'Encode 360p'], [1250, 340, 'Encode 720p'], [1250, 430, 'Encode 1080p'], [1250, 520, 'Thumbnails'], [1250, 610, 'Watermark'],
    [1250, 720, 'Audio encode'], [1250, 810, 'Metadata job'],
  ],
  out: [1620, 525, 200, 80, 'Final output', C_OK],
};
function dnode(cx, cy, w, h, label, color, a = 1, { prog = -1, done = false, size = 24 } = {}) {
  if (a <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= a;
  glass(cx - w / 2, cy - h / 2, w, h, { accent: done ? C_OK : color, r: 16 });
  if (prog >= 0) { ctx.save(); rr(cx - w / 2, cy - h / 2, w, h, 16); ctx.clip(); ctx.fillStyle = (done ? C_OK : color) + '40'; ctx.fillRect(cx - w / 2, cy - h / 2, w * prog, h); ctx.restore(); }
  text(label, cx, cy + size * 0.36, { size, weight: 700, align: 'center', color: INK });
  ctx.restore();
}
function sceneDag(lt) {
  header(lt, '04', 'Transcoding DAG', C_TC, 'Tasks + dependencies = a DAG');
  const A = (t) => fade(lt, t);
  const stg = [['Split', 1080, 7.0], ['Parallel tasks', 1355, 11.5], ['Merge', 1720, 15.2]];
  stg.forEach(([s, x, t]) => text(s, x, 196, { size: 22, color: MUTE, align: 'center', weight: 700, a: A(t) }));
  const [sx, sy, sw, sh, sl, sc] = DG.src;
  // 边
  const edge = (x1, y1, x2, y2, t0, col = '#566078', k = 0.7) => arrow(x1, y1, x2, y2, { color: col, w: 2.5, p: eOut(P(lt, t0, t0 + k)), head: 10 });
  const run0 = 17.3;
  const tp = (k) => { const dur = [1.1, 1.3, 1.5, 0.9, 1.0, 0.8, 0.7][k]; return clamp((lt - run0) / dur); };
  const mids = [DG.video, DG.audio, DG.meta];
  mids.forEach((m, k) => edge(sx + sw / 2, sy, m[0] - m[2] / 2, m[1], 7.2 + k * 0.5));
  DG.t.forEach(([x, y], k) => {
    const from = k < 5 ? DG.video : k === 5 ? DG.audio : DG.meta;
    edge(from[0] + from[2] / 2, from[1], x - 105, y, 11.8 + k * 0.35, '#566078', 0.5);
    edge(x + 105, y, DG.out[0] - DG.out[2] / 2, DG.out[1], 15.0 + k * 0.1, tp(k) >= 1 ? C_OK + '99' : '#566078', 0.7);
  });
  dnode(sx, sy, sw, sh, sl, sc, A(1.0));
  mids.forEach((m, k) => dnode(m[0], m[1], m[2], m[3], m[4], m[5], A(7.6 + k * 0.5)));
  DG.t.forEach(([x, y, l], k) => {
    const born = A(12.0 + k * 0.35); const p = tp(k);
    dnode(x, y, 210, 62, l, C_TC, born, { prog: lt >= run0 ? p : -1, done: p >= 1 });
  });
  const allDone = lt > run0 + 1.6;
  dnode(DG.out[0], DG.out[1], DG.out[2], DG.out[3], DG.out[4], DG.out[5], A(15.4), { done: allDone, prog: allDone ? 1 : -1, size: 26 });
  if (lt > 11.5) tag(1250, 886, 'Illustrative DAG', DIM, A(12), { size: 20, align: 'center' });
  bullet(0, 'Node = task', A(7.4));
  bullet(1, 'Arrow = dependency', A(9.0));
  bullet(2, 'No dependency: run together', A(17.2));
  statCard(110, 640, 640, 'Tasks that can run at once', '7', { color: C_TC, a: A(17.6), note: 'illustrative' });
}

// ───────── 场景 5：并行 worker ─────────
const WK = { qx: 840, qy: 232, qp: 84, qw: 74, wy: 400, wx: [830, 1090, 1350], ww: 220, wh: 170, oy: 740 };
const SCH = [
  // [worker, start, end]  下标=切片号 0..7
  [0, 7.6, 9.6], [1, 7.6, 9.6], [2, 7.6, 9.6],
  [0, 9.9, 11.9], [1, 9.9, 11.4], [2, 9.9, 11.9],
  [0, 12.2, 14.2], [1, 12.2, 14.2],
];
const RETRY = [4, 2, 12.2, 14.2]; // 切片4 失败后在 worker2 重试
function sceneWorkers(lt) {
  header(lt, '05', 'Process, Then Merge', C_TC, 'A failure retries one chunk');
  const A = (t) => fade(lt, t);
  // 资源管理器
  glass(WK.qx - 20, 168, 8 * WK.qp + 20, 126, { a: A(1.0), accent: C_API });
  text('Resource manager · task queue', WK.qx, 200, { size: 22, weight: 700, color: C_API, a: A(1.0) });
  WK.wx.forEach((x, k) => {
    box(x, WK.wy, WK.ww, WK.wh, '', { color: C_TC, a: A(3.6 + k * 0.3) }); text(`Worker ${k + 1}`, x + WK.ww / 2, WK.wy + 38, { size: 24, weight: 700, align: 'center', a: A(3.6 + k * 0.3) });
  });
  dbIcon(1650, 400, 110, 130, 'Temp storage', { color: C_STORE, a: A(5.0), fill: clamp(0) });
  text('Output · merged in order', WK.qx, WK.oy - 22, { size: 22, color: MUTE, a: A(5.4) });
  const slotX = (i, m) => lerp(WK.qx + i * 92, WK.qx + i * 80, m);
  for (let i = 0; i < 8; i++) { ctx.save(); ctx.globalAlpha *= A(5.4); ctx.setLineDash([6, 6]); ctx.strokeStyle = 'rgba(255,255,255,.16)'; ctx.lineWidth = 1.5; rr(WK.qx + i * 92, WK.oy, 80, 74, 10); ctx.stroke(); ctx.restore(); }
  const merge = eIO(P(lt, 19.4, 20.6));
  const wpos = (w) => [WK.wx[w] + (WK.ww - WK.qw) / 2, WK.wy + 54];
  let done = 0;
  const wBusy = [false, false, false];
  for (let i = 0; i < 8; i++) {
    const qx = WK.qx + i * WK.qp, qy = WK.qy + 20;
    const born = eBack(P(lt, 1.4 + i * 0.12, 2.0 + i * 0.12));
    const a = clamp(born * 1.5);
    const [w, ts, te] = SCH[i];
    let x = qx, y = qy, col = C_CLIENT, ring = null;
    const outP = [WK.qx + i * 92, WK.oy + 0];
    const outX = slotX(i, merge) , outY = WK.oy;
    if (i === RETRY[0]) {
      const [rw, rs, re] = [RETRY[1], RETRY[2], RETRY[3]];
      const w1 = wpos(w), w2 = wpos(rw);
      if (lt < ts) { x = qx; y = qy; }
      else if (lt < ts + 0.5) { const p = eIO(P(lt, ts, ts + 0.5)); x = lerp(qx, w1[0], p); y = lerp(qy, w1[1], p); col = C_TC; }
      else if (lt < 11.9) { x = w1[0]; y = w1[1]; col = lt > 11.3 ? RED : C_TC; ring = lt > 11.3 ? RED : null; }
      else if (lt < rs + 0.5) { const p = eIO(P(lt, 11.9, rs + 0.5)); x = lerp(w1[0], w2[0], p); y = lerp(w1[1], w2[1], p); col = C_TC; }
      else if (lt < re) { x = w2[0]; y = w2[1]; col = C_TC; }
      else { const p = eIO(P(lt, re, re + 0.7)); x = lerp(w2[0], outX, p); y = lerp(w2[1], outY, p); col = p > 0.6 ? C_OK : C_TC; if (p >= 1) done++; }
      if (lt >= re + 0.7) { x = outX; y = outY; col = C_OK; }
    } else {
      const wp = wpos(w);
      if (lt < ts) { x = qx; y = qy; }
      else if (lt < ts + 0.5) { const p = eIO(P(lt, ts, ts + 0.5)); x = lerp(qx, wp[0], p); y = lerp(qy, wp[1], p); col = C_TC; }
      else if (lt < te) { x = wp[0]; y = wp[1]; col = C_TC; }
      else { const p = eIO(P(lt, te, te + 0.7)); x = lerp(wp[0], outX, p); y = lerp(wp[1], outY, p); col = p > 0.6 ? C_OK : C_TC; if (p >= 1) done++; }
      if (lt >= te + 0.7) { x = outX; y = outY; col = C_OK; }
    }
    const wd = (lt >= te + 0.7 && i !== RETRY[0]) || (i === RETRY[0] && lt >= RETRY[3] + 0.7) ? lerp(80, 80, merge) : WK.qw;
    chunk(x, y, wd, 74, String(i + 1), col, { a, ring, size: 26 });
  }
  // worker 进度条
  const work = (w, ts, te, t0 = ts + 0.5) => { if (lt > t0 && lt < te) { const p = (lt - t0) / (te - t0); const x = WK.wx[w] + 20, y = WK.wy + WK.wh - 26; ctx.save(); rr(x, y, WK.ww - 40, 10, 5); ctx.fillStyle = 'rgba(255,255,255,.1)'; ctx.fill(); ctx.fillStyle = C_TC; glow(C_TC, 10); rr(x, y, (WK.ww - 40) * p, 10, 5); ctx.fill(); ctx.restore(); } };
  SCH.forEach(([w, ts, te], i) => { if (i === 4) { if (lt < 11.9) work(w, ts, 11.5); } else work(w, ts, te); });
  work(RETRY[1], RETRY[2], RETRY[3]);
  if (lt > 11.5 && lt < 13.6) { tag(WK.wx[1] + WK.ww / 2, WK.wy - 14, 'Chunk 5 failed', RED, A(11.5), { align: 'center', size: 22 }); }
  if (lt > 12.4 && lt < 14.5) { tag(WK.wx[2] + WK.ww / 2, WK.wy + WK.wh + 34, 'Retry on Worker 3', C_TC, A(12.4), { align: 'center', size: 22 }); }
  // 临时存储填充
  const fillP = clamp((SCH.filter(([w, ts, te]) => lt > te).length) / 8);
  if (lt > 5) dbIcon(1650, 400, 110, 130, 'Temp storage', { color: C_STORE, a: 1, fill: fillP });
  if (lt > 20) { const m = A(20.0); text('Complete output', WK.qx + 8 * 40, WK.oy + 124, { size: 26, weight: 800, color: C_OK, align: 'center', a: m }); }
  bullet(0, 'Scheduler assigns tasks', A(3.0));
  bullet(1, '8 chunks, 3 in parallel', A(7.4));
  bullet(2, 'Failure retries 1 chunk', A(12.0));
  bullet(3, 'Merge when all are done', A(19.2));
  tag(1705, 612, 'Intermediate results', MUTE, A(5.4), { size: 20, align: 'center' });
}

// ───────── 场景 6：何时算完成 ─────────
function sceneReady(lt) {
  header(lt, '06', 'When Is It Done?', C_OK, 'Persist and verify, then publish');
  const A = (t) => fade(lt, t);
  const X0 = 880, X1 = 1780;
  // 错误
  glass(820, 190, 1010, 270, { a: A(1.0), accent: RED });
  text('Wrong: completion event comes first', 850, 238, { size: 26, weight: 800, color: RED, a: A(1.0) });
  ctx.save(); ctx.globalAlpha *= A(1.0); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X0, 330); ctx.lineTo(X1, 330); ctx.stroke(); ctx.restore();
  const cur1 = lerp(X0, X1, eIO(P(lt, 4.6, 13.0)));
  const ev1 = [[1000, 'Event sent first', 5.6, RED], [1300, 'User hits play', 8.2, RED], [1620, 'File lands late', 11.2, DIM]];
  ev1.forEach(([x, s, t, c]) => { const on = cur1 >= x; dot(x, 330, 11, on ? c : DIM, { g: on ? 14 : 0, a: A(1.0) }); text(s, x, 378, { size: 22, color: on ? INK : DIM, align: 'center', weight: 600, a: A(1.0) }); });
  if (cur1 >= 1000 && lt > 5.2) text('Notify: playable', 1000, 300, { size: 22, color: C_OK, align: 'center', weight: 700, a: A(5.8) });
  if (cur1 >= 1300) { const a = eBack(P(lt, 9.0, 9.6)); text('404', 1300, 296, { size: 44, weight: 900, font: MONO, color: RED, align: 'center', a: clamp(a) }); }
  if (lt < 14) dot(cur1, 330, 7, '#fff', { g: 20, a: A(4.6) });
  // 正确
  glass(820, 500, 1010, 270, { a: A(13.2), accent: C_OK });
  text('Right: persist, verify, then publish ready', 850, 548, { size: 26, weight: 800, color: C_OK, a: A(13.2) });
  ctx.save(); ctx.globalAlpha *= A(13.2); ctx.strokeStyle = 'rgba(255,255,255,.2)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X0, 640); ctx.lineTo(X1, 640); ctx.stroke(); ctx.restore();
  const cur2 = lerp(X0, X1, eIO(P(lt, 13.8, 20.2)));
  const ev2 = [[980, 'Output on disk'], [1210, 'Manifest verified'], [1440, 'Publish ready'], [1680, 'Playback works']];
  ev2.forEach(([x, s], k) => { const on = cur2 >= x; dot(x, 640, 11, on ? C_OK : DIM, { g: on ? 14 : 0, a: A(13.2) }); text(s, x, 688, { size: 22, color: on ? INK : DIM, align: 'center', weight: 600, a: A(13.2) }); });
  if (lt > 13.8 && lt < 21) dot(cur2, 640, 7, '#fff', { g: 20, a: A(13.8) });
  if (cur2 >= 1680) text('200 OK', 1680, 606, { size: 36, weight: 900, font: MONO, color: C_OK, align: 'center', a: A(19.4) });
  bullet(0, 'Persist output + manifest first', A(13.6));
  bullet(1, 'Publish ready after checks', A(15.6));
  // 清晰度逐级
  glass(110, 600, 640, 270, { a: A(20.4), accent: C_TC });
  text('Higher quality can follow later', 140, 642, { size: 24, weight: 700, color: C_TC, a: A(20.4) });
  hbar(140, 668, 360, '360p', 1, C_OK, { a: A(20.6), valueText: 'Playable', labelW: 90 });
  hbar(140, 724, 360, '720p', 1, C_OK, { a: A(21.0), valueText: 'Playable', labelW: 90 });
  hbar(140, 780, 360, '1080p', clamp(0.35 + 0.35 * P(lt, 21.4, 23)), C_TC, { a: A(21.4), valueText: 'Encoding', labelW: 90 });
}

// ───────── 场景 7：自适应码率 ─────────
const LV = { 1080: [C_OK, 128], 720: [SC[0], 88], 360: [C_TC, 52] };
const ABRL = [1080, 1080, 1080, 1080, 1080, 720, 360, 360, 720, 1080];
const BW = [0.92, 0.95, 0.9, 0.88, 0.86, 0.58, 0.26, 0.28, 0.6, 0.92];
function sceneAbr(lt) {
  header(lt, '07', 'Segmented Streaming', C_CDN, 'Manifest + segments + adaptive bitrate');
  const A = (t) => fade(lt, t);
  const sx = (k) => 840 + k * 98;
  // 播放清单
  glass(830, 190, 360, 230, { a: A(1.0), accent: C_CDN });
  text('Playback manifest', 856, 232, { size: 24, weight: 700, color: C_CDN, a: A(1.0) });
  [[1080, '1080p'], [720, '720p'], [360, '360p']].forEach(([q, s], k) => {
    const a = A(1.8 + k * 0.4); const y = 280 + k * 46;
    dot(866, y - 8, 7, LV[q][0], { g: 8, a }); text(s, 888, y, { size: 26, weight: 700, font: MONO, a }); text('seg1 seg2 …', 1000, y, { size: 22, color: MUTE, font: MONO, a });
  });
  let bx = 1230;
  [['MPEG-DASH', 4.8], ['Apple HLS', 5.8]].forEach(([s, t], k) => { bx += badge(bx, 210 + k * 70, s, C_CDN, A(t)) + 14; bx = 1230; });
  // 片段与播放头
  const ap = A(2.4);
  text('Downloaded segments (height = quality)', 840, 470, { size: 22, color: MUTE, a: ap });
  const base = 700;
  ctx.save(); ctx.globalAlpha *= ap; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(830, base + 6); ctx.lineTo(1830, base + 6); ctx.stroke(); ctx.restore();
  const tSeg = (k) => (k < 3 ? 2.8 + k * 0.8 : 8.8 + (k - 3) * 1.3);
  ABRL.forEach((q, k) => {
    const t = tSeg(k), p = eBack(P(lt, t, t + 0.6)); if (P(lt, t, t + 0.6) <= 0.02) return;
    const h = LV[q][1] * clamp(p, 0, 1.05), [c] = LV[q];
    chunk(sx(k), base - h, 88, h, '', c, { fill: '55' });
    text(String(k + 1), sx(k) + 44, base + 36, { size: 22, color: MUTE, align: 'center', font: MONO });
  });
  // 吞吐曲线
  const ca = A(8.0);
  glass(830, 770, 1000, 150, { a: ca, r: 20 });
  text('Network throughput (illustrative)', 852, 802, { size: 20, color: MUTE, a: ca });
  ctx.save(); ctx.globalAlpha *= ca;
  const pr = P(lt, 8.8, 17.9) * 9;
  ctx.beginPath(); ctx.lineWidth = 4; ctx.strokeStyle = C_STORE; glow(C_STORE, 10); ctx.lineJoin = 'round';
  for (let u = 0; u <= pr + 0.001; u += 0.1) { const i = Math.min(9, Math.floor(u)), f = u - i, v = lerp(BW[i], BW[Math.min(9, i + 1)], f); const x = sx(0) + 44 + u * 98, y = 906 - v * 100; u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke(); ctx.restore();
  if (lt > 12.8) { const a = A(12.8); text('Throughput drops: step down', 1290, 802, { size: 22, color: C_TC, weight: 700, a }); }
  bullet(0, 'Manifest first, then segments', A(2.6));
  bullet(1, 'Switch by throughput + buffer', A(9.2));
  bullet(2, 'Goal: no stalling', A(14.6));
  statCard(110, 640, 640, 'Current quality', lt < 11.4 ? '1080p' : lt < 12.7 ? '720p' : lt < 15.3 ? '360p' : lt < 17.8 ? '720p' : '1080p', { color: lt < 11.4 || lt > 17.6 ? C_OK : lt < 12.7 || lt > 15.3 ? SC[0] : C_TC, a: A(9.6) });
}

// ───────── 场景 8：CDN 分层与回源 ─────────
function sceneCdn(lt) {
  header(lt, '08', 'CDN: Hits and Misses', C_CDN, 'The nearest node answers first');
  const A = (t) => fade(lt, t);
  const V1 = [830, 410, 130, 90], V2 = [830, 660, 130, 90], ED = [1060, 520, 200, 120], RG = [1360, 520, 190, 120], OR = [1680, 505, 110, 130];
  box(V1[0], V1[1], V1[2], V1[3], 'Viewer A', { color: C_CLIENT, a: A(1.0), size: 24 });
  box(V2[0], V2[1], V2[2], V2[3], 'Viewer B', { color: C_CLIENT, a: A(1.0), size: 24 });
  box(ED[0], ED[1], ED[2], ED[3], 'CDN edge', { color: C_CDN, sub: 'nearest to user', a: A(1.4), size: 26 });
  box(RG[0], RG[1], RG[2], RG[3], 'Upper tier', { color: C_CDN, sub: 'illustrative', a: A(1.8) * 0.85, size: 26 });
  dbIcon(OR[0], OR[1], OR[2], OR[3], 'Encoded storage', { color: C_STORE, a: A(2.2) });
  const ey = ED[1] + 60, ry = RG[1] + 60, oy = OR[1] + 60;
  const e1 = ED[0] + ED[2], r0 = RG[0], r1 = RG[0] + RG[2];
  // 静态连线
  [[ED[0] + ED[2], ey, r0, ry], [r1, ry, OR[0], oy]].forEach(([a, b, c, d]) => arrow(a, b, c, d, { color: '#566078', w: 2.5, a: A(2.4), head: 10 }));
  // 缓存内容
  const cacheChip = (x, y, s, on, a = 1) => chunk(x, y, 56, 36, s, on ? C_OK : DIM, { a, size: 20, fill: on ? '30' : '10' });
  text('Cache', ED[0] + 16, ED[1] + ED[3] + 38, { size: 20, color: MUTE, a: A(2.6) });
  cacheChip(ED[0] + 92, ED[1] + ED[3] + 10, 'A', true, A(2.8));
  const eB = lt >= 12.6 ? eBack(P(lt, 12.6, 13.2)) : 0;
  cacheChip(ED[0] + 158, ED[1] + ED[3] + 10, 'B', true, clamp(eB));
  const rB = lt >= 11.6 ? eBack(P(lt, 11.6, 12.2)) : 0;
  text('Cache', RG[0] + 16, RG[1] + RG[3] + 38, { size: 20, color: MUTE, a: A(2.6) * 0.8 });
  cacheChip(RG[0] + 92, RG[1] + RG[3] + 10, 'B', true, clamp(rB));
  const miss = (x, y, t) => { const a = P(lt, t, t + 0.3) * (1 - P(lt, t + 1.1, t + 1.5)); if (a > 0) text('Miss', x, y, { size: 24, weight: 800, color: RED, align: 'center', a }); };
  const hit = (x, y, t, k = 1.5) => { const a = P(lt, t, t + 0.3) * (1 - P(lt, t + k, t + k + 0.4)); if (a > 0) text('Hit', x, y, { size: 26, weight: 800, color: C_OK, align: 'center', a }); };
  const R = (id, x1, y1, x2, y2, t0, d, col) => { const p = P(lt, t0, t0 + d); if (p > 0) packet(x1, y1, x2, y2, p, col, { r: 9 }); };
  // 观众 A：段A 命中（4.8~6.6）
  R(1, V1[0] + V1[2], V1[1] + 45, ED[0], ey - 20, 4.8, 0.9, C_CLIENT);
  hit(ED[0] + ED[2] / 2, ED[1] - 14, 5.7);
  R(2, ED[0], ey + 20, V1[0] + V1[2], V1[1] + 55, 5.8, 0.9, C_CDN);
  // 观众 A：段B 未命中，回源（7.6~14）
  R(3, V1[0] + V1[2], V1[1] + 45, ED[0], ey - 20, 8.0, 0.8, C_CLIENT);
  miss(ED[0] + ED[2] / 2, ED[1] - 14, 8.8);
  R(4, e1, ey - 10, r0, ry - 10, 9.0, 0.7, C_CLIENT);
  miss(RG[0] + RG[2] / 2, RG[1] - 14, 9.7);
  R(5, r1, ry - 10, OR[0], oy - 10, 9.9, 0.7, C_CLIENT);
  R(6, OR[0], oy + 12, r1, ry + 12, 10.8, 0.8, C_STORE);
  R(7, r0, ry + 12, e1, ey + 12, 11.6, 0.8, C_STORE);
  R(8, ED[0], ey + 20, V1[0] + V1[2], V1[1] + 55, 12.5, 0.9, C_CDN);
  // 观众 B：段B 命中（15.4~）
  R(9, V2[0] + V2[2], V2[1] + 30, ED[0], ey + 20, 14.8, 0.8, C_CLIENT);
  hit(ED[0] + ED[2] / 2, ED[1] + ED[3] + 98, 15.6, 2.4);
  R(10, ED[0], ey + 35, V2[0] + V2[2], V2[1] + 40, 15.7, 0.8, C_CDN);
  if (lt > 8.0 && lt < 14.6) tag(1150, 450, 'Request segment B', MUTE, A(8.0) * (1 - P(lt, 13.8, 14.4)), { size: 22, align: 'center' });
  bullet(0, 'Ask the nearest edge first', A(2.8));
  bullet(1, 'Hit: return immediately', A(6.0));
  bullet(2, 'Miss: go to origin, then cache', A(9.4));
  bullet(3, 'Next viewer gets a hit', A(14.6));
}

// ───────── 场景 9：成本取舍 ─────────
function sceneCost(lt) {
  header(lt, '09', 'The Cost Trade-off', RED, 'Cold videos may not need a CDN');
  const A = (t) => fade(lt, t);
  const chips = [['5M', 'daily active users'], ['5', 'videos per user'], ['0.3 GB', 'per video'], ['$0.02', 'per GB']];
  chips.forEach(([v, l], k) => {
    const a = A(4.2 + k * 1.1), x = 830 + k * 260;
    glass(x, 200, 200, 104, { a, accent: SC[k] });
    text(v, x + 100, 252, { size: 40, weight: 800, font: MONO, align: 'center', color: SC[k], a });
    text(l, x + 100, 286, { size: 20, color: MUTE, align: 'center', a });
    if (k < 3) text('×', x + 230, 262, { size: 36, weight: 700, color: MUTE, align: 'center', a });
  });
  tag(830, 336, 'Book assumptions · rough, at historical prices', DIM, A(6), { size: 20 });
  statCard(110, 430, 640, 'CDN cost per day', '$150,000', { color: RED, a: A(9.2), note: 'per day' });
  // 长尾柱
  const v = [100, 62, 44, 32, 24, 18, 14, 11, 9, 7, 6, 5];
  const base = 700;
  const sp = P(lt, 13.4, 14.4);
  v.forEach((x, i) => {
    const a = A(11.0 + i * 0.1), h = x / 100 * 200;
    const head = i < 3;
    ctx.save(); ctx.globalAlpha *= a;
    const col = lerp(0, 1, sp) > 0.5 ? (head ? C_CDN : C_TC) : C_CLIENT;
    glow(col, 10); rr(840 + i * 80, base - h * a, 60, h * a, 8); ctx.fillStyle = col + '88'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); ctx.restore();
  });
  text('Views (illustrative)', 840, 478, { size: 20, color: DIM, a: A(11.4) * (1 - A(14.4)) });
  ctx.save(); ctx.globalAlpha *= A(11); ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(830, base + 6); ctx.lineTo(1810, base + 6); ctx.stroke(); ctx.restore();
  tag(840, 470, 'Popular', C_CDN, A(14.2), { size: 26 });
  tag(1130, 600, 'Unpopular (long tail)', C_TC, A(15.2), { size: 26 });
  tag(840, 744, 'CDN edge: fast but costly', C_CDN, A(14.6), { size: 24 });
  tag(1200, 744, 'Big servers · on-demand transcode', C_TC, A(15.8), { size: 24 });
  glass(830, 790, 480, 104, { a: A(19.2), accent: C_OK });
  text('Saves', 856, 832, { size: 22, color: C_OK, weight: 800, a: A(19.2) });
  text('Bandwidth + compute', 856, 872, { size: 28, weight: 700, a: A(19.2) });
  glass(1340, 790, 490, 104, { a: A(21.0), accent: RED });
  text('Cost', 1366, 832, { size: 22, color: RED, weight: 800, a: A(21.0) });
  text('Slow first play · origin load', 1366, 872, { size: 28, weight: 700, a: A(21.0) });
  bullet(0, 'Popular: via CDN', A(14.4), { y0: 620 });
  bullet(1, 'Unpopular: from origin', A(16.0), { y0: 620 });
  bullet(2, 'Unpopular: transcode on demand', A(17.6), { y0: 620 });
}

// ───────── 场景 10：总结 ─────────
function sceneEnd(lt) {
  const N = 8;
  for (let i = 0; i < N; i++) { const a = eOut(P(lt, 0.3 + i * 0.08, 1 + i * 0.08)) * 0.7; chunk(1130 + i * 84, 200 + Math.sin(lt * 1.6 + i * 0.7) * 6, 72, 54, '', i % 3 === 0 ? C_OK : C_TC, { a, fill: '22' }); }
  text('Design YouTube', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Chapter 14', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['Chunked upload', 'Direct upload, retry one chunk', C_STORE], ['DAG transcoding', 'Split at GOPs, run in parallel', C_TC], ['CDN playback', 'Segments, adaptive bitrate', C_CDN]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.5, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: fitSize(w, 800, 66, 450), weight: 800 });
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  const aa = eOut(P(lt, 6.0, 6.8));
  glass(110, 710, 1640, 120, { a: aa, accent: RED });
  text('Cost depends on', 140, 758, { size: 22, color: MUTE, a: aa });
  text('Viewing traffic · cache hits · number of versions, not just the per-GB price', 140, 806, { size: 34, weight: 700, a: aa });
}

export const scenes = { title: sceneTitle, arch: sceneArch, upload: sceneUpload, gop: sceneGop, dag: sceneDag, workers: sceneWorkers, ready: sceneReady, abr: sceneAbr, cdn: sceneCdn, cost: sceneCost, end: sceneEnd };

// ───────── 英语旁白时间轴对齐 ─────────
// 动画节拍按中文版旁白编排；英语旁白每句的起点不同，这里按「句」分段线性重映射场景时间：
// [英语场景时间, 中文场景时间] 锚点，由英语旁白中对应短语的字符位置占比（估算说到该短语的时刻）与中文版画面节拍时刻配对。
const ANCH = {"title":[[0,0],[1.4,1.4],[7.82,4.6],[9.74,6.6],[12.02,11.71]],"arch":[[0,0],[0.7,0.7],[2.67,1.9],[10.76,6.9],[13.93,10.8],[17.52,14.6],[20.05,20.2],[24.64,24.36]],"upload":[[0,0],[0.7,0.7],[6.47,5],[11.38,9],[16.64,12],[21.4,15.8],[24.86,19.3],[27.67,22.36]],"gop":[[0,0],[0.7,0.7],[5.41,6.6],[7.84,9.8],[11.23,12.9],[16.29,16],[18.85,17.2],[23.04,22.03]],"dag":[[0,0],[0.7,0.7],[6.18,7],[10.42,11.4],[17.98,17.2],[23.49,20.16]],"workers":[[0,0],[0.7,0.7],[4.84,3.4],[7.39,7.3],[10.9,11.4],[14,14.5],[17.52,18.8],[23.28,22]],"ready":[[0,0],[0.7,0.7],[4.2,4.8],[8.24,8],[10.39,9.2],[12.81,13.2],[17.52,17.6],[20.21,20.4],[24.31,23.73]],"abr":[[0,0],[0.7,0.7],[7.51,4.8],[10.56,8],[16.88,12.4],[20.07,14.4],[22.77,20.42]],"cdn":[[0,0],[0.7,0.7],[5.35,4.7],[7.75,7.9],[9.16,9],[12.4,11.5],[13.46,14.6],[15.64,16.5],[20.59,18.81]],"cost":[[0,0],[0.7,0.7],[2.59,2.8],[6.93,5.2],[8.54,6.4],[10.49,8.2],[15.11,10.8],[17.14,13.4],[19.59,15],[22.95,17.4],[25.32,20.2],[30.45,25.2]],"end":[[0,0],[0.7,0.7],[2.56,1.9],[3.81,3.4],[6.29,5],[7.69,6.4],[16.28,14.72]]};
const remap = (id, t) => {
  const A = ANCH[id]; if (!A || t <= 0) return t;
  for (let i = 1; i < A.length; i++) if (t <= A[i][0]) { const [x0, y0] = A[i - 1], [x1, y1] = A[i]; return y0 + (y1 - y0) * (t - x0) / (x1 - x0); }
  const [x0, y0] = A[A.length - 2], [x1, y1] = A[A.length - 1]; return y1 + (t - x1) * (y1 - y0) / (x1 - x0);
};
for (const id of Object.keys(scenes)) { const f = scenes[id]; scenes[id] = (lt, d, sc) => f(remap(id, lt), d, sc); }
