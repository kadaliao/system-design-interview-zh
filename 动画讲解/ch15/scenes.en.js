// Chapter 15 Design Google Drive: English scenes (shell and helpers from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header as header0, arrow, box, dbIcon, statCard, bullet, hbar } from '../lib/core.js';

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

export const meta = { no: 15, title: 'Design Google Drive', en: 'Design Google Drive' };

// 角色配色：块存储=青，元数据=靛，通知=粉，待定/等待=琥珀，新增/成功=青柠，设备=灰蓝，冲突=红
const BLK = SC[0], META = SC[1], NOTI = SC[2], PEND = SC[3], NEW = SC[4], DEV = '#9aa6d6', API = '#c6cdf0';
const HS = ['a3f1', '7c2e', '9d40', '5b88', 'e1c7', '2f6a'];
const hx = (f) => ('0' + Math.round(clamp(f) * 255).toString(16)).slice(-2);

// ───────── 小工具 ─────────
function blk(x, y, w, h, label, color, { a = 1, s = 1, fill = 0.2, ring = null, dash = false, size = 22, tc = INK, lw = 2.2 } = {}) {
  if (a <= 0 || s <= 0) return;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  glow(ring || color, ring ? 24 : 8); rr(x, y, w, h, 12); ctx.fillStyle = color + hx(fill); ctx.fill();
  ctx.lineWidth = ring ? 3.5 : lw; ctx.strokeStyle = ring || color; if (dash) ctx.setLineDash([7, 6]); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  if (label) text(label, cx, cy + size * 0.35, { size, weight: 700, align: 'center', font: MONO, color: tc });
  ctx.restore();
}
function tick(x, y, s, color, a = 1) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; glow(color, 10);
  ctx.beginPath(); ctx.moveTo(x - s * 0.5, y); ctx.lineTo(x - s * 0.15, y + s * 0.4); ctx.lineTo(x + s * 0.55, y - s * 0.4); ctx.stroke(); ctx.restore();
}
function cross(x, y, s, color, a = 1) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round'; glow(color, 10);
  ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s * 0.45); ctx.lineTo(x + s * 0.45, y + s * 0.45); ctx.moveTo(x + s * 0.45, y - s * 0.45); ctx.lineTo(x - s * 0.45, y + s * 0.45); ctx.stroke(); ctx.restore();
}
function polyPos(pts, p) {
  const L = []; let tot = 0;
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); L.push(l); tot += l; }
  let d = clamp(p) * tot;
  for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) { const t = L[i] ? d / L[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], t), lerp(pts[i][1], pts[i + 1][1], t), Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])]; } d -= L[i]; }
  return [pts[0][0], pts[0][1], 0];
}
function pkt(pts, p, color, { r = 9, a = 1, trail = 0.14 } = {}) {
  if (p <= 0 || p >= 1) return;
  for (let k = 5; k >= 0; k--) { const q = clamp(p - (k * trail) / 5); const [x, y] = polyPos(pts, q); dot(x, y, r * (1 - k * 0.12), color, { g: k ? 0 : 20, a: a * (1 - k / 6) * 0.9 }); }
}
function line(pts, p, color, { w = 4, a = 1, dash = null, head = 14 } = {}) {
  if (p <= 0.001 || a <= 0) return;
  const [ex, ey, th] = polyPos(pts, p);
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  let acc = 0, tot = 0; const L = [];
  for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); L.push(l); tot += l; }
  const target = clamp(p) * tot;
  for (let i = 0; i < L.length; i++) { if (acc + L[i] <= target) { ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); acc += L[i]; } else { ctx.lineTo(ex, ey); break; } }
  ctx.stroke(); ctx.setLineDash([]);
  if (head) { ctx.translate(ex, ey); ctx.rotate(th); ctx.beginPath(); ctx.moveTo(head * 0.5, 0); ctx.lineTo(-head * 0.9, head * 0.7); ctx.lineTo(-head * 0.9, -head * 0.7); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function pill(x, y, label, color, { a = 1, s = 1, size = 24, solid = true } = {}) {
  if (a <= 0 || s <= 0) return 0;
  ctx.save(); ctx.font = `700 ${size}px ${MONO}`; const w = ctx.measureText(label).width + 36; ctx.restore();
  const cx = x + w / 2, cy = y + 24;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  glow(color, 14); rr(x, y, w, 48, 24); ctx.fillStyle = solid ? '#0a0d18' : color + '22'; ctx.fill(); ctx.fillStyle = color + '28'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.stroke(); ctx.shadowBlur = 0;
  text(label, x + w / 2, y + 33, { size, weight: 700, align: 'center', font: MONO, color });
  ctx.restore(); return w;
}
function tag(x, y, label, color, a = 1, size = 22, align = 'left') { text(label, x, y, { size, weight: 600, color, a, align }); }
const pop = (lt, t0, d = 0.6) => eBack(P(lt, t0, t0 + d));
const show = (lt, t0, d = 0.5) => eOut(P(lt, t0, t0 + d));

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  // 右侧：一个文件被切成块，块飞向云端
  const bx = 1060, by = 340;
  for (let i = 0; i < 6; i++) {
    const t0 = 1.0 + i * 0.25, p = pop(lt, t0, 0.7);
    const fly = eIO(P(lt, 3.2 + i * 0.2, 4.4 + i * 0.2));
    const x = bx + (i % 3) * 230, y = by + Math.floor(i / 3) * 150 - fly * 40;
    blk(x, y, 190, 100, HS[i], i === 2 ? NEW : BLK, { s: clamp(p), a: clamp(p * 2) * (1 - fly * 0.0), size: 30 });
  }
  const cl = show(lt, 2.2, 0.8);
  text('File → blocks → cloud', 1060, 270, { size: 28, color: MUTE, a: cl, weight: 600 });
  pill(1060, 590, 'Send only changed blocks', NEW, { a: show(lt, 4.2, 0.6), s: clamp(pop(lt, 4.2, 0.6)) });
  text('SYSTEM DESIGN INTERVIEW · ANIMATED GUIDE', 110, 360, { size: 24, weight: 600, color: SC[0], ls: 3, a });
  const g = ctx.createLinearGradient(110, 0, 900, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 112px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('Google Drive', 104, 520); ctx.restore();
  text('Design Google Drive', 112, 590, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('Chapter 15', 112, 680, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 01 内容与目录分开 ─────────
function sceneSplit(lt) {
  header(lt, '01', 'Content vs. Metadata', BLK, 'Block storage + metadata DB');
  const CL = [830, 430, 200, 120], AP = [1110, 430, 200, 120];
  box(...CL, 'Client', { color: DEV, a: show(lt, 0.4), s: pop(lt, 0.4) });
  box(...AP, 'API server', { color: API, a: show(lt, 0.6), s: pop(lt, 0.6), size: 26 });
  // 块存储
  const sp = show(lt, 3.0, 0.7);
  glass(1400, 600, 430, 230, { a: sp, accent: BLK });
  text('Block storage (S3)', 1430, 648, { size: 26, weight: 700, color: BLK, a: sp });
  text('large', 1810, 648, { size: 22, color: MUTE, align: 'right', a: sp });
  const store = [[930, 550], [930, 715], [1400, 715]];
  line(store, eOut(P(lt, 3.2, 4.2)), BLK, { a: sp, w: 5 });
  for (let i = 0; i < 6; i++) {
    const t0 = 4.4 + i * 0.5;
    pkt(store, P(lt, t0, t0 + 1.0), BLK, { r: 14 });
    const c = pop(lt, t0 + 0.9, 0.5);
    blk(1430 + (i % 4) * 98, 670 + Math.floor(i / 4) * 66, 80, 50, '', BLK, { s: clamp(c), a: clamp(c * 3) });
  }
  // 元数据
  const mp = show(lt, 7.0, 0.7);
  dbIcon(1420, 230, 110, 130, 'Metadata DB', { color: META, a: mp });
  glass(1560, 230, 270, 170, { a: show(lt, 8.0), accent: META });
  [['name · path', 9.0], ['version', 9.6], ['blocks [a3f1…]', 10.2]].forEach(([s, t], i) => text(s, 1582, 282 + i * 44, { size: 22, font: MONO, color: INK, a: show(lt, t - 0.8) }));
  text('small', 1810, 438, { size: 22, color: MUTE, align: 'right', a: show(lt, 11.4) });
  arrow(1030, 490, 1110, 490, { color: API, p: eOut(P(lt, 7.2, 7.8)) });
  arrow(1310, 470, 1425, 330, { color: META, p: eOut(P(lt, 7.5, 8.3)) });
  const meta = [[1030, 490], [1110, 490], [1310, 470], [1440, 320]];
  for (let i = 0; i < 4; i++) { const t0 = 9.0 + i * 0.9; pkt(meta, P(lt, t0, t0 + 1.0), META, { r: 6 }); }
  // 左栏
  bullet(0, 'Block storage: large contents', show(lt, 5.1), { color: INK });
  bullet(1, 'Metadata DB: small, changes often', show(lt, 11.0));
  bullet(2, 'Scale each independently', show(lt, 15.6));
  statCard(110, 660, 640, '10 GB file · blocks ≤ 4 MB', '≥ 2,560 blocks', { color: BLK, a: show(lt, 13.5, 0.7) });
  pill(1400, 150, 'scales alone', META, { a: show(lt, 15.8), s: clamp(pop(lt, 15.8)) });
  pill(1600, 534, 'scales alone', BLK, { a: show(lt, 16.4), s: clamp(pop(lt, 16.4)) });
}

// ───────── 02 切块与哈希 ─────────
function sceneChunk(lt) {
  header(lt, '02', 'Chunks and Hashes', BLK, 'Block list = assembly guide');
  const x0 = 840, w = 150, gap0 = 12, y = 290, h = 110;
  const cut = eIO(P(lt, 2.8, 5.0));
  const gap = gap0 * cut;
  const fa = show(lt, 0.4, 0.8);
  text('report.pdf · 24 MB (illustrative)', x0, 262, { size: 26, color: MUTE, weight: 600, a: fa });
  const bx = (i) => x0 + i * (w + gap);
  if (cut < 0.02) { // 整块文件
    glass(x0, y, 6 * w, h, { a: fa, accent: DEV, fill: 0.09 });
  }
  for (let i = 0; i < 6; i++) {
    if (cut >= 0.02) blk(bx(i), y, w, h, `Block ${i + 1}`, BLK, { fill: 0.22, size: 26 });
    // 剪切线
    if (i > 0 && cut < 0.98) { const cp = P(lt, 2.8 + i * 0.12, 3.4 + i * 0.12); if (cp > 0 && cp < 1) { ctx.save(); ctx.strokeStyle = SC[2]; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); glow(SC[2], 12); ctx.beginPath(); ctx.moveTo(x0 + i * w, y - 18); ctx.lineTo(x0 + i * w, y - 18 + (h + 36) * cp); ctx.stroke(); ctx.restore(); } }
  }
  if (cut < 0.02) text('One whole file', x0 + 3 * w, y + h / 2 + 10, { size: 30, color: INK, align: 'center', weight: 600, a: fa });
  text('each ≤ 4 MB', x0 + 3 * w, y + h + 50, { size: 24, color: BLK, align: 'center', weight: 700, a: show(lt, 4.6) * (1 - show(lt, 6.3)) });
  // 哈希
  for (let i = 0; i < 6; i++) {
    const t0 = 6.4 + i * 0.35, p = pop(lt, t0, 0.6);
    const cx = bx(i) + w / 2;
    if (p > 0.02) {
      line([[cx, y + h + 6], [cx, y + h + 44]], clamp(p), BLK, { w: 2, a: 0.6, head: 8 });
      blk(cx - 60, y + h + 52, 120, 46, HS[i], META, { s: clamp(p), a: clamp(p * 2), fill: 0.2, size: 24 });
    }
  }
  text('Hash = unique block ID (illustrative)', x0, y + h + 134, { size: 22, color: DIM, a: show(lt, 8.0) });
  // 块清单
  const mp = show(lt, 11.0, 0.6);
  glass(x0, 560, 6 * w + 5 * gap0, 118, { a: mp, accent: META });
  text('Block list (fixed order)', x0 + 30, 602, { size: 24, color: META, weight: 700, a: mp });
  for (let i = 0; i < 6; i++) {
    const t0 = 11.4 + i * 0.3, p = show(lt, t0, 0.35);
    const cx = x0 + 52 + i * 152;
    text(HS[i], cx, 654, { size: 28, weight: 800, font: MONO, color: META, a: p });
    if (i < 5) text('→', cx + 92, 652, { size: 26, color: MUTE, a: p });
  }
  // 还原
  const rp = P(lt, 15.6, 18.4);
  text('Join by the list to rebuild the file', x0, 744, { size: 24, color: NEW, weight: 700, a: show(lt, 15.6) });
  rr(x0, 764, 6 * w + 5 * gap0, 70, 16); ctx.save(); ctx.globalAlpha *= show(lt, 15.6); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.restore();
  for (let i = 0; i < 6; i++) {
    const p = eOut(P(lt, 16.6 + i * 0.28, 17.0 + i * 0.28));
    if (p > 0.02) blk(x0 + i * (w + gap0), 764, w, 70, HS[i], NEW, { a: clamp(p), s: 0.9 + 0.1 * clamp(p), fill: 0.25, size: 24 });
  }
  bullet(0, 'Each block ≤ 4 MB, stored alone', show(lt, 3.0));
  bullet(1, 'Hash = the block\'s ID', show(lt, 7.6));
  bullet(2, 'Block list = assembly guide', show(lt, 13.2));
  statCard(110, 660, 640, 'Max block size', '4 MB', { color: BLK, a: show(lt, 4.2, 0.7) });
}

// ───────── 03 增量同步 ─────────
function sceneDelta(lt) {
  header(lt, '03', 'Delta Sync', NEW, 'Upload only changed blocks');
  const x0 = 840, w = 120, gap = 12, cy = 250, sy = 640;
  const cx = (i) => x0 + i * (w + gap);
  const NEWH = 'e9b0';
  const ca = show(lt, 0.3, 0.8), sa = show(lt, 0.5, 0.8);
  text('Client (local)', x0, 228, { size: 24, color: DEV, weight: 700, a: ca });
  text('Cloud block storage', x0, 618, { size: 24, color: BLK, weight: 700, a: sa });
  const edit = P(lt, 3.0, 3.9);
  const sweep = P(lt, 4.9, 7.5);
  for (let i = 0; i < 6; i++) {
    const changed = i === 2 && edit > 0.5;
    const hot = sweep > 0 && sweep < 1 && Math.abs(sweep * 6.4 - 0.2 - i) < 0.7;
    const moveP = i === 2 ? eIO(P(lt, 14.7, 16.0)) : 0;
    const y = i === 2 ? lerp(cy, 740, moveP) : cy;
    const dimmed = i !== 2 ? lt > 14.7 ? 0.45 : 1 : 1;
    blk(cx(i), y, w, 70, changed ? NEWH : HS[i], changed ? NEW : BLK, { a: ca * dimmed, ring: hot ? '#ffffff' : (i === 2 && edit > 0 && edit < 1 ? NEW : null), fill: changed ? 0.3 : 0.2, size: 24 });
    // 云端旧块
    blk(cx(i), sy, w, 70, HS[i], BLK, { a: sa * (i === 2 && lt > 16.0 ? 0.35 : 1), dash: i === 2 && lt > 16.0, size: 24 });
  }
  if (edit > 0 && edit < 1.0 || (lt > 3.0 && lt < 5)) text('This block changed', cx(2) + w / 2, cy - 40 + 0, { size: 22, color: NEW, align: 'center', weight: 700, a: show(lt, 3.0) * (1 - show(lt, 4.6)) });
  // 清单消息
  const fa = lt > 14.2 ? 1 - 0.78 * show(lt, 14.2, 0.6) : 1;
  const m1 = show(lt, 7.9, 0.6) * fa;
  glass(840, 370, 460, 100, { a: m1, accent: META });
  text('① Submit new block list', 868, 404, { size: 22, color: META, weight: 700, a: m1 });
  text('a3f1 7c2e e9b0 5b88 e1c7 2f6a', 868, 446, { size: 22, font: MONO, a: m1 });
  const mp = eOut(P(lt, 7.9, 8.8));
  arrow(900, 330, 900, 366, { color: META, p: mp, a: fa });
  const m2 = show(lt, 10.7, 0.6) * fa;
  arrow(1305, 420, 1375, 420, { color: NEW, p: eOut(P(lt, 10.7, 11.5)), a: fa });
  glass(1380, 370, 450, 100, { a: m2, accent: NEW });
  text('② Server compares', 1408, 404, { size: 22, color: NEW, weight: 700, a: m2 });
  text('missing e9b0 (block 3)', 1408, 446, { size: 24, font: MONO, weight: 800, color: NEW, a: show(lt, 12.6, 0.5) * fa });
  // 上传落点
  if (lt > 14.7) { const up = P(lt, 14.7, 16.0); if (up > 0.02) pill(1080 - 4, 686 + 0, '', NEW, { a: 0 }); }
  tag(cx(2) + w + 18, 790, 'New block', NEW, show(lt, 16.0), 24);
  // 沿用
  const keep = P(lt, 16.8, 18.0);
  if (keep > 0) {
    ctx.save(); ctx.globalAlpha *= 0.55;
    for (let i = 0; i < 6; i++) if (i !== 2) line([[cx(i) + w / 2, cy + 76], [cx(i) + w / 2, sy - 8]], eOut(keep), BLK, { w: 2, dash: [6, 7], head: 0 });
    ctx.restore();
    const pa = show(lt, 17.0, 0.5);
    ctx.save(); ctx.globalAlpha *= pa; glow(BLK, 12); rr(1040, 535, 440, 48, 24); ctx.fillStyle = '#0a0d18'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = BLK; ctx.stroke(); ctx.shadowBlur = 0;
    text('Other 5 blocks exist, reused', 1260, 568, { size: 24, weight: 700, color: BLK, align: 'center' }); ctx.restore();
  }
  tag(x0, 880, 'Illustrative: 6-block file, only block 3 edited', DIM, show(lt, 16.0), 22);
  pill(1330, 812, 'Saves upload bandwidth', NEW, { a: show(lt, 20.6), s: clamp(pop(lt, 20.6)) });
  bullet(0, 'Split and hash locally', show(lt, 4.9));
  bullet(1, 'Ask only which blocks are missing', show(lt, 10.7));
  bullet(2, 'Upload missing, reuse the rest', show(lt, 14.7));
  statCard(110, 660, 640, 'This upload', '1 of 6 blocks', { color: NEW, a: show(lt, 18.7, 0.7) });
}

// ───────── 04 去重与压缩 ─────────
const FILES = [
  { n: 'A · v1', b: [0, 1, 2], t: 1.0 },
  { n: 'A · v2', b: [0, 1, 3], t: 3.2 },
  { n: 'B', b: [0, 4, 1], t: 5.4 },
];
const UH = ['a3f1', '7c2e', '9d40', 'e9b0', '5b88'];
function sceneDedup(lt) {
  header(lt, '04', 'Dedup and Compression', BLK, 'Identical content stored once');
  const sx = (i) => 860 + i * 188, sy = 700, sw = 140, sh = 78;
  const fy = (r) => 215 + r * 100;
  const compress = show(lt, 10.4, 0.6) * (1 - show(lt, 17.4, 0.6)); // 压缩面板可见度
  const filesA = 1 - compress;
  const delAt = 19.2;
  // 引用计数
  const refs = UH.map((_, u) => FILES.reduce((n, f, fi) => n + (f.b.includes(u) && !(fi === 0 && lt > delAt + 0.8) && lt > f.t + 0.9 ? 1 : 0), 0));
  // 存储块
  UH.forEach((h, u) => {
    const first = FILES.findIndex((f) => f.b.includes(u));
    const born = pop(lt, FILES[first].t + 0.9, 0.6);
    const orphan = refs[u] === 0 && lt > delAt + 0.8;
    const rec = show(lt, 22.1, 0.5);
    blk(sx(u), sy, sw, sh, h, orphan ? DIM : u === 3 ? NEW : BLK, { s: clamp(born), a: clamp(born * 2) * (orphan ? 1 - 0.4 * rec : 1), dash: orphan && lt > 22.1, size: 26, ring: lt > FILES[2].t + 1 && lt < FILES[2].t + 2.2 && (u === 0 || u === 4 || u === 1) ? '#fff' : null });
    if (born > 0.5 && !(orphan && lt > 22.1)) text(`refs ×${refs[u]}`, sx(u) + sw / 2, sy + sh + 32, { size: 22, font: MONO, color: refs[u] === 1 ? MUTE : BLK, align: 'center', weight: 700, a: clamp(born) });
  });
  text('Cloud block storage (named by hash)', 860, sy - 18, { size: 22, color: BLK, weight: 700, a: show(lt, 0.8) });
  // 文件行
  FILES.forEach((f, r) => {
    const p = show(lt, f.t, 0.7);
    const dead = r === 0 && lt > delAt;
    const al = p * filesA * (dead ? 1 - 0.65 * show(lt, delAt, 0.6) : 1);
    text(f.n, 860, fy(r) + 38, { size: 24, weight: 700, color: dead ? RED : INK, font: MONO, a: al });
    f.b.forEach((u, k) => {
      const x = 1010 + k * 130, y = fy(r) + 4;
      const shared = FILES.slice(0, r).some((g) => g.b.includes(u));
      blk(x, y, 110, 56, UH[u], shared ? BLK : (u === 3 ? NEW : BLK), { a: al, size: 22, fill: shared ? 0.12 : 0.28, dash: shared });
      const lp = eOut(P(lt, f.t + 0.4 + k * 0.25, f.t + 1.0 + k * 0.25));
      line([[x + 55, y + 60], [sx(u) + sw / 2, sy - 4]], lp, shared ? NEW : BLK, { w: 2.5, a: filesA * (dead ? 0.15 : 0.5), head: 0 });
    });
    if (r === 1) tag(1010 + 3 * 130 + 6, fy(r) + 40, 'one new block', NEW, show(lt, 4.2) * al, 22);
    if (r === 2) tag(1010 + 3 * 130 + 6, fy(r) + 40, 'all existing', BLK, show(lt, 6.4) * al, 22);
    if (dead) { ctx.save(); ctx.globalAlpha *= show(lt, delAt, 0.5); ctx.strokeStyle = RED; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1000, fy(r) + 32); ctx.lineTo(1400, fy(r) + 32); ctx.stroke(); ctx.restore(); }
  });
  // 压缩面板
  if (compress > 0.01) {
    ctx.save(); ctx.globalAlpha *= compress;
    rr(840, 215, 980, 340, 22); ctx.fillStyle = '#0a0d18'; ctx.fill(); glass(840, 215, 980, 340, { accent: PEND });
    text('Compression before upload (illustrative)', 880, 268, { size: 28, weight: 700, color: PEND });
    hbar(880, 300, 430, 'Docs', 0.95, DIM, { labelW: 140 });
    hbar(880, 346, 430, '', 0.33, PEND, { labelW: 140 });
    text('about 1/3 after', 1500, 372, { size: 24, weight: 700, color: PEND });
    hbar(880, 430, 430, 'Media', 0.95, DIM, { labelW: 140 });
    hbar(880, 476, 430, '', 0.9, MUTE, { labelW: 140 });
    text('already compressed', 1500, 502, { size: 24, color: MUTE, weight: 700 });
    ctx.restore();
  }
  bullet(0, 'Same hash = same block', show(lt, 2.7));
  bullet(1, 'Docs compress well, media barely', show(lt, 13.4));
  bullet(2, 'Check references before reclaiming', show(lt, 19.2));
  statCard(110, 660, 640, '9 references → actually stored', '5 blocks', { color: BLK, a: show(lt, 9.2, 0.7) });
  if (lt > 22.1) pill(sx(2) - 4, sy + sh + 60, 'no refs, reclaim after retention', PEND, { size: 22, a: show(lt, 22.1), s: clamp(pop(lt, 22.1)) });
}

// ───────── 05 上传：pending → uploaded ─────────
function scenePublish(lt) {
  header(lt, '05', 'Upload States', PEND, 'Publish only when all blocks are in');
  const phase2 = lt >= 16.2;
  box(830, 300, 200, 110, 'Client', { color: DEV, a: show(lt, 0.4), s: pop(lt, 0.4) });
  // 块存储
  glass(1180, 190, 650, 210, { a: show(lt, 0.6), accent: BLK });
  text('Block storage', 1210, 236, { size: 26, weight: 700, color: BLK, a: show(lt, 0.6) });
  const arrive = [9.3, 10.0, 10.7, 11.4];
  for (let i = 0; i < 4; i++) {
    const filled = phase2 ? i < 3 : lt > arrive[i] + 0.6;
    const p = phase2 ? (i < 3 ? 1 : 0) : pop(lt, arrive[i] + 0.5, 0.5);
    blk(1210 + i * 150, 275, 130, 86, `Block ${i + 1}`, BLK, { dash: !filled, a: filled ? 1 : 0.7, fill: filled ? 0.3 : 0.05, size: 24, s: filled ? clamp(lerp(1, 1, p)) : 1 });
    if (filled && phase2 && i === 2) {}
  }
  // 元数据
  glass(1180, 500, 650, 330, { a: show(lt, 0.8), accent: META });
  text('Metadata database', 1210, 546, { size: 26, weight: 700, color: META, a: show(lt, 0.8) });
  const rec = show(lt, 2.7, 0.6);
  text('report.pdf · v2', 1210, 600, { size: 30, weight: 800, font: MONO, a: rec });
  // 状态药丸
  let st = 'pending', sc = PEND, t0 = 2.7;
  if (!phase2 && lt >= 12.5) { st = 'uploaded'; sc = NEW; t0 = 12.5; }
  if (phase2) { st = 'pending'; sc = PEND; t0 = 16.2; }
  pill(1530, 570, st, sc, { a: show(lt, 2.7, 0.4), s: clamp(pop(lt, t0, 0.5)) });
  const ck = (i, label, t) => {
    const y = 660 + i * 50, on = phase2 ? false : lt > t;
    text(label, 1250, y + 8, { size: 24, color: on ? INK : MUTE, a: show(lt, 9.2, 0.6) });
    if (on) tick(1218, y - 2, 22, NEW, clamp(pop(lt, t, 0.4)));
    else if (phase2 && i === 0) cross(1218, y - 2, 20, RED, show(lt, 16.6));
    else dot(1218, y - 2, 6, DIM, { g: 0, a: show(lt, 9.2) });
  };
  ck(0, phase2 ? 'block list 3 / 4 (block 4 missing)' : 'block list complete', 10.6);
  ck(1, 'size matches', 11.2);
  ck(2, 'checksum matches', 11.8);
  // 其他设备
  box(830, 590, 200, 110, 'Other device', { color: DEV, a: show(lt, 6.8), s: pop(lt, 6.8), size: 26 });
  const visible = !phase2 && lt > 13.4;
  arrow(1180, 640, 1040, 640, { color: visible ? NEW : DIM, dash: visible ? null : [8, 8], p: eOut(P(lt, 7.0, 7.8)), a: visible ? 1 : 0.7 });
  if (!visible) { tag(930, 735, 'can\'t see pending', MUTE, show(lt, 7.4) * (1 - show(lt, 13.2)), 22, 'center'); }
  else tag(930, 735, 'visible, downloadable', NEW, show(lt, 13.4), 22, 'center');
  // 通知铃
  if (!phase2) { const bp = P(lt, 13.4, 14.6); pkt([[1480, 640], [1040, 640]], bp, NOTI, { r: 10 }); if (lt > 14.0) tag(930, 775, 'notification sent', NOTI, show(lt, 14.0), 22, 'center'); }
  // 上传到块存储 / 元数据
  const upl = [[1030, 345], [1180, 330]];
  if (!phase2) for (let i = 0; i < 4; i++) pkt(upl, P(lt, arrive[i], arrive[i] + 0.7), BLK, { r: 12 });
  line([[1030, 390], [1180, 560]], eOut(P(lt, 2.2, 3.0)), META, { w: 3, a: 0.8 });
  arrow(1030, 330, 1180, 330, { color: BLK, p: eOut(P(lt, 8.6, 9.2)), a: 0.9 });
  // 断线
  if (phase2) {
    const a = show(lt, 16.2, 0.5);
    text('Another upload: connection drops', 830, 176, { size: 24, weight: 700, color: RED, a });
    cross(1750 - 40, 318, 34, RED, show(lt, 16.6));
    tag(1210, 392 + 0, 'Uploaded blocks stay; resume at block 4', NEW, show(lt, 20.0), 22);
    ctx.save(); ctx.globalAlpha *= show(lt, 16.4); ctx.strokeStyle = RED; ctx.lineWidth = 4; ctx.setLineDash([5, 7]); glow(RED, 10); ctx.beginPath(); ctx.moveTo(1030, 345); ctx.lineTo(1110, 335); ctx.stroke(); ctx.restore();
  }
  bullet(0, 'pending: other devices can\'t see it', show(lt, 7.3));
  bullet(1, 'uploaded: published when all in', show(lt, 12.5));
  bullet(2, 'Drop: stays pending, then resumes', show(lt, 17.5));
}

// ───────── 06 通知与同步 ─────────
function sceneSync(lt) {
  header(lt, '06', 'Notify Other Devices', NOTI, 'Long poll → metadata → changed blocks');
  const A = [830, 200, 200, 110], N = [1190, 200, 240, 110], B = [1620, 200, 200, 110];
  const offline = lt > 20.4 && lt < 25.0;
  box(...A, 'Device A', { color: DEV, a: show(lt, 0.3), s: pop(lt, 0.3) });
  box(...N, 'Notification', { color: NOTI, a: show(lt, 0.5), s: pop(lt, 0.5), sub: 'long polling' });
  box(...B, 'Device B', { color: DEV, a: show(lt, 0.7) * (offline ? 0.4 : 1), s: pop(lt, 0.7) });
  const dm = lt > 11.8 ? 1 : 0.35;
  box(1330, 480, 300, 110, 'API + metadata', { color: API, a: show(lt, 0.9) * dm, s: pop(lt, 0.9), size: 26 });
  box(1330, 700, 300, 110, 'Block storage', { color: BLK, a: show(lt, 1.1) * (lt > 11.8 ? 1 : 0.35), s: pop(lt, 1.1) });
  box(830, 480, 300, 110, 'Offline backup queue', { color: PEND, a: show(lt, 20.0) * (lt > 20.0 ? 1 : 0), s: pop(lt, 20.0), size: 24 });
  // A 上传完成
  pill(830, 130, 'new version uploaded', NEW, { size: 20, a: show(lt, 2.0), s: clamp(pop(lt, 2.0)) * 1 });
  // 长轮询
  const hang = [[1620, 270], [1430, 270]];
  const hp = P(lt, 6.9, 7.6);
  const hungAlive = lt > 6.9 && lt < 10.4;
  line(hang, eOut(hp), NOTI, { a: lt < 10.4 ? 1 : 0.2, dash: [10, 8], head: 12 });
  if (hungAlive) { const t = (lt - 7.6) * 1.4; for (let k = 0; k < 3; k++) { const q = ((t + k / 3) % 1); if (lt > 7.6) dot(lerp(1620, 1430, q), 270, 5, NOTI, { g: 8, a: 0.8 * (1 - Math.abs(q - 0.5) * 1.2) }); } }
  tag(1525, 262 + 70 - 0, 'hanging request', NOTI, show(lt, 7.0) * (1 - show(lt, 10.4)), 22, 'center');
  const upP = [[1030, 255], [1190, 255]];
  arrow(1030, 255, 1190, 255, { color: NEW, p: eOut(P(lt, 9.1, 9.8)) });
  pkt(upP, P(lt, 9.1, 10.0), NEW, { r: 11 });
  const resp = [[1430, 235], [1620, 235]];
  if (lt >= 10.1) { arrow(1430, 235, 1620, 235, { color: NOTI, p: eOut(P(lt, 10.1, 10.8)), a: 1, w: 5 }); pkt(resp, P(lt, 10.1, 11.4), NOTI, { r: 11 }); tag(1525, 192, 'Changed!', NOTI, show(lt, 10.4), 22, 'center'); }
  // B → API
  const rApi = [[1680, 310], [1680, 535], [1630, 535]];
  const rSto = [[1760, 310], [1760, 755], [1630, 755]];
  line(rApi, eOut(P(lt, 11.8, 12.6)), API, { w: 4, a: lt > 19.2 && !(lt > 25.1) ? 0.3 : 1 });
  if (lt >= 12.6 && lt < 13.8) pkt([...rApi].reverse(), P(lt, 13.3, 14.4), API, { r: 9 });
  pkt(rApi, P(lt, 13.3, 14.4), API, { r: 9 });
  pkt([...rApi].reverse(), P(lt, 14.3, 15.4), META, { r: 9 });
  tag(1668, 470, 'latest metadata', API, show(lt, 14.0) * (1 - show(lt, 17.0)), 22, 'right');
  line(rSto, eOut(P(lt, 17.0, 17.8)), BLK, { w: 4, a: lt > 19.2 && !(lt > 25.1) ? 0.3 : 1 });
  pkt([...rSto].reverse(), P(lt, 17.6, 19.0), BLK, { r: 14 });
  tag(1750, 690, 'missing blocks', BLK, show(lt, 17.2) * (1 - show(lt, 20.0)), 22, 'right');
  // B 拼好
  const ba = show(lt, 19.1, 0.6) * (offline ? 0.4 : 1);
  if (lt > 18.9) {
    for (let i = 0; i < 6; i++) { blk(1620 + (i % 3) * 66, 340 + Math.floor(i / 3) * 40, 58, 32, '', i === 2 ? NEW : BLK, { a: ba, s: 1, fill: 0.3 }); }
    tag(1720, 438, 'joined in order', NEW, ba, 22, 'center');
  }
  // 离线
  if (offline) {
    pill(1590, 130, 'Device B offline', RED, { size: 20, a: show(lt, 20.4), s: clamp(pop(lt, 20.4)) });
    line([[1260, 310], [1130, 480]], eOut(P(lt, 22.5, 23.3)), PEND, { w: 3, dash: [8, 8] });
    pkt([[1260, 310], [1130, 480]], P(lt, 22.5, 23.5), PEND, { r: 9 });
  }
  if (lt > 25.0) {
    line([[1260, 310], [1130, 480]], 1, PEND, { w: 3, dash: [8, 8], a: 0.4 });
    pill(1530, 130, 'back online, catch up', NEW, { size: 20, a: show(lt, 25.1), s: clamp(pop(lt, 25.1)) });
    line([[1130, 535], [1330, 535]], eOut(P(lt, 25.1, 25.8)), PEND, { w: 4 });
  }
  if (lt > 25.6) tag(830, 640, 'Notifications may be lost; clients check version numbers', MUTE, show(lt, 25.6, 0.5) * 0, 22);
  bullet(0, 'Long poll: reply only on change', show(lt, 5.0));
  bullet(1, 'It only says "something changed"', show(lt, 11.8));
  bullet(2, 'Offline: queue it, catch up later', show(lt, 20.6));
  statCard(110, 660, 640, 'Notifications may be lost', 'version check', { color: NOTI, a: show(lt, 23.0, 0.7) });
}

// ───────── 07 冲突 ─────────
function sceneConflict(lt) {
  header(lt, '07', 'Multi-Device Conflicts', RED, 'First wins, the late one keeps a copy');
  box(830, 200, 230, 130, 'Device 1', { color: DEV, a: show(lt, 0.5), s: pop(lt, 0.5), sub: 'editing' });
  box(830, 440, 230, 130, 'Device 2', { color: DEV, a: show(lt, 0.7), s: pop(lt, 0.7), sub: 'editing' });
  pill(850, 345, 'base = v1', PEND, { size: 22, a: show(lt, 4.3), s: clamp(pop(lt, 4.3)) });
  pill(850, 585, 'base = v1', PEND, { size: 22, a: show(lt, 5.0), s: clamp(pop(lt, 5.0)) });
  // 服务器
  const sp = show(lt, 0.9, 0.6);
  glass(1290, 280, 480, 210, { a: sp, accent: META });
  text('Server · report.docx', 1322, 326, { size: 26, weight: 700, color: META, a: sp });
  const up = lt > 10.8;
  text(up ? 'v2' : 'v1', 1530, 438, { size: 96, weight: 900, font: MONO, align: 'center', color: up ? NEW : INK, a: sp, });
  if (up) tag(1750, 470, 'Device 1\'s version', NEW, show(lt, 10.8), 20, 'right');
  // 提交
  const r1 = [[1060, 290], [1290, 340]];
  const r2 = [[1060, 520], [1290, 440]];
  line(r1, eOut(P(lt, 7.9, 8.6)), DEV, { w: 4, a: 0.8 });
  pkt(r1, P(lt, 7.9, 9.0), PEND, { r: 11 });
  tick(1180, 262, 40, NEW, clamp(pop(lt, 9.2, 0.5)));
  tag(1200, 244, 'handled first · OK', NEW, show(lt, 9.2), 22, 'center');
  line(r2, eOut(P(lt, 12.1, 12.9)), DEV, { w: 4, a: 0.8 });
  pkt(r2, P(lt, 12.1, 13.6), PEND, { r: 11 });
  if (lt > 14.8) {
    const cp = show(lt, 14.8, 0.5);
    cross(1180, 560, 40, RED, clamp(pop(lt, 14.8, 0.4)));
    tag(1200, 610, 'late · conflict', RED, cp, 22, 'center');
    pill(1290, 506, 'base v1 ≠ current v2', RED, { size: 22, a: cp, s: clamp(pop(lt, 14.8)) });
  }
  // 两份都保留
  const c1 = pop(lt, 18.1, 0.7), c2 = pop(lt, 18.6, 0.7);
  if (c1 > 0.02) { glass(840, 690, 470, 130, { a: clamp(c1 * 2), accent: NEW }); text('Server version (v2)', 870, 736, { size: 24, weight: 700, color: NEW, a: clamp(c1 * 2) }); text('report.docx', 870, 782, { size: 28, font: MONO, a: clamp(c1 * 2) }); }
  if (c2 > 0.02) { glass(1340, 690, 480, 130, { a: clamp(c2 * 2), accent: RED }); text('Conflict copy (Device 2)', 1370, 736, { size: 24, weight: 700, color: RED, a: clamp(c2 * 2) }); text('report (conflict copy).docx', 1370, 782, { size: 24, font: MONO, a: clamp(c2 * 2) }); }
  pill(840, 842, 'Merge', SC[1], { size: 24, a: show(lt, 20.2), s: clamp(pop(lt, 20.2)) });
  pill(980, 842, 'Overwrite one with the other', SC[2], { size: 24, a: show(lt, 21.9), s: clamp(pop(lt, 21.9)) });
  tag(840, 918, 'Server version rules decide, not client clocks', DIM, show(lt, 23.0), 20);
  bullet(0, 'Commits carry the base version', show(lt, 4.3));
  bullet(1, 'First one wins, late one conflicts', show(lt, 12.1));
  bullet(2, 'Keep both, the user decides', show(lt, 18.1));
}

// ───────── 结尾 ─────────
function sceneEnd(lt) {
  text('Google Drive', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Design Google Drive', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['Chunking', 'Big files cut into ≤ 4 MB blocks', BLK, 2.5], ['Delta', 'Send changed blocks, dedup the rest', NEW, 3.4], ['Conflict copies', 'First wins, late one keeps a copy', RED, 4.5]].forEach(([w, s, c, t0], k) => {
    const p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    ctx.save(); ctx.font = `800 70px ${SANS}`; const ww = ctx.measureText(w).width; ctx.restore(); text(w, x + 36, 566, { size: Math.min(70, Math.floor(70 * 440 / Math.max(ww, 1))), weight: 800 });
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  const a = show(lt, 5.8, 0.8);
  text('Block storage holds contents, the metadata DB holds the directory', 110, 750, { size: 30, weight: 600, color: INK, a });
  badge(110, 790, 'Long polling + version numbers', NOTI, show(lt, 7.5));
  badge(590, 790, 'pending → uploaded', PEND, show(lt, 8.0));
  text('Illustrative data is labeled on screen', 110, 880, { size: 20, color: DIM, a: show(lt, 8.6) });
}


// 英语旁白时间 → 中文版动画时间（锚点：旁白提到该内容的时刻 → 对应画面事件的时刻），分段线性
const ANCH = {
  title: [[0.7, 0.7], [8.0, 6.0]],
  split: [[0.7, 0.7], [3.3, 3.0], [8.2, 7.0], [12.0, 9.6], [17.0, 11.4], [19.9, 15.6], [23.6, 20.2]],
  chunk: [[0.7, 0.7], [2.6, 2.8], [5.8, 6.4], [9.5, 11.0], [13.0, 15.6], [14.7, 16.6], [18.1, 19.5]],
  delta: [[0.7, 0.7], [2.6, 3.0], [5.3, 4.9], [9.1, 7.9], [12.0, 10.7], [16.3, 14.7], [18.9, 16.8], [22.4, 20.6], [25.3, 23.6]],
  dedup: [[0.7, 0.7], [2.0, 1.0], [5.7, 3.2], [8.0, 5.4], [10.5, 9.2], [11.9, 10.4], [18.5, 17.4], [19.3, 19.2], [24.8, 22.1], [29.6, 25.9]],
  publish: [[0.7, 0.7], [3.3, 2.7], [6.9, 6.8], [8.8, 9.3], [10.6, 10.6], [13.9, 12.5], [15.9, 13.4], [17.9, 16.2], [21.5, 20.0], [25.7, 22.5]],
  sync: [[0.7, 0.7], [2.5, 2.2], [7.8, 6.9], [9.6, 9.1], [11.9, 10.4], [13.3, 11.8], [17.1, 17.0], [19.8, 19.1], [22.1, 20.4], [23.3, 22.5], [26.3, 25.1], [27.6, 26.4]],
  conflict: [[0.7, 0.7], [4.6, 4.3], [7.7, 7.9], [9.9, 9.2], [11.0, 10.8], [12.9, 12.1], [16.1, 14.8], [19.9, 18.1], [23.3, 21.9], [25.3, 24.4]],
  end: [[0.7, 0.7], [2.4, 2.5], [3.6, 3.4], [4.6, 4.5], [5.7, 5.8], [10.5, 7.5], [11.5, 8.0], [12.5, 8.6], [15.3, 10.2]],
};
function warp(id, t) {
  const A = ANCH[id]; if (!A || t <= A[0][0]) return t;
  for (let i = 0; i < A.length - 1; i++) if (t <= A[i + 1][0]) { const [a0, b0] = A[i], [a1, b1] = A[i + 1]; return b0 + (t - a0) / (a1 - a0) * (b1 - b0); }
  const [a, b] = A[A.length - 1]; return b + (t - a);
}
const zh = { title: sceneTitle, split: sceneSplit, chunk: sceneChunk, delta: sceneDelta, dedup: sceneDedup, publish: scenePublish, sync: sceneSync, conflict: sceneConflict, end: sceneEnd };
export const scenes = Object.fromEntries(Object.entries(zh).map(([id, f]) => [id, (lt, d, sc) => f(warp(id, lt), d, sc)]));
