// Chapter 6 Key-Value Store (English): scene definitions
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, arrow, box, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 6, title: 'Key-Value Store', en: 'Key-Value Store' };

// header with auto-fit title size (English is wider than Chinese)
function header(lt, num, title, accent, sub) {
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  let sz = 70; ctx.font = `800 ${sz}px ${SANS}`;
  while (sz > 40 && ctx.measureText(title).width > 630) { sz -= 2; ctx.font = `800 ${sz}px ${SANS}`; }
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size: sz, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: 26, color: MUTE });
  ctx.restore();
}

const LIME = SC[4], AMBER = SC[3];
const NC = [SC[0], SC[1], SC[2], SC[3], SC[4], '#60a5fa'];      // 环上六台物理机
const REP = [SC[0], SC[1], SC[2]];                              // 副本 A / B / C
const ease = (a, b, lt) => eOut(P(lt, a, b));

// ───────── 哈希环（分区与复制） ─────────
const RG = { x: 1330, y: 535, R: 290 };
const rad = (d) => (d * Math.PI) / 180;
const rpt = (d, r = RG.R, g = RG) => [g.x + Math.cos(rad(d)) * r, g.y + Math.sin(rad(d)) * r];
const NODES = [300, 0, 60, 120, 180, 240];                      // S1..S6 在环上的角度（度，顺时针）
const ownerIdx = (d) => { d = ((d % 360) + 360) % 360; let b = 0, bd = 1e9; NODES.forEach((n, i) => { const df = (((n - d) % 360) + 360) % 360; if (df < bd) { bd = df; b = i; } }); return b; };
function ringBase(g = RG, prog = 1, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  const gr = ctx.createConicGradient(rad(-90), g.x, g.y);
  gr.addColorStop(0, '#34d5c8'); gr.addColorStop(0.5, '#8b8dfc'); gr.addColorStop(1, '#f472b6');
  ctx.lineWidth = 9; ctx.strokeStyle = gr; ctx.lineCap = 'round'; glow('rgba(139,141,252,0.5)', 24);
  ctx.beginPath(); ctx.arc(g.x, g.y, g.R, rad(-90), rad(-90 + 360 * Math.max(prog, 0.0001))); ctx.stroke();
  ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.setLineDash([3, 9]);
  ctx.beginPath(); ctx.arc(g.x, g.y, g.R - 56, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
}
function pnode(deg, label, color, { s = 1, a = 1, g = RG, r = 28, size = 22, hollow = false } = {}) {
  if (s <= 0 || a <= 0) return;
  const [x, y] = rpt(deg, g.R, g);
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(s, s);
  glow(color, hollow ? 8 : 26); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
  ctx.lineWidth = hollow ? 3 : 5; ctx.strokeStyle = color; if (hollow) ctx.setLineDash([5, 5]); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  text(label, 0, size * 0.36, { size, weight: 800, align: 'center', font: MONO, color: hollow ? color : INK });
  ctx.restore();
}
function keyDot(d, color, { r = 9, a = 1, rd = RG.R, g = RG } = {}) {
  const [x, y] = rpt(d, rd, g); dot(x, y, r, color, { g: 14, a });
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = '#06080f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.restore();
}
function arcSeg(a, b, rd, color, w, alpha = 1, g = 14) {
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineCap = 'round'; glow(color, g);
  ctx.beginPath(); ctx.arc(RG.x, RG.y, rd, rad(a), rad(b)); ctx.stroke(); ctx.restore();
}
function cross(x, y, s, color, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap = 'round'; glow(color, 12);
  ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); ctx.restore();
}

// ───────── 场景 1：分区与复制 ─────────
const PK = [-105, -80, -48, -22, 15, 35, 78, 98, 150, 168, 205, 222];
const KD = 270;      // 示例 key K 的位置
function scenePart(lt) {
  header(lt, '01', 'Partition & Replicate', SC[0], 'Partition for capacity, replicate for safety');
  ringBase(RG, ease(0.6, 2.6, lt));
  const dimK = 1 - 0.65 * ease(14.4, 15.0, lt);
  PK.forEach((d, k) => {
    const t0 = 8.4 + k * 0.33, a = ease(t0, t0 + 0.5, lt); if (a <= 0) return;
    const o = ownerIdx(d), nd = NODES[o], e = nd < d ? nd + 360 : nd;
    arcSeg(d, e, RG.R - 26, NC[o], 3, a * 0.45 * dimK, 6);
    keyDot(d, NC[o], { a: a * dimK });
  });
  const old = lt > 23.4 ? 0.35 : 1;
  NODES.forEach((d, i) => { const p = P(lt, 1.0 + i * 0.25, 1.6 + i * 0.25); pnode(d, `S${i + 1}`, NC[i], { s: eBack(p), a: clamp(p * 3) }); });
  // key K 与顺时针复制
  const ka = ease(14.4, 15.2, lt);
  if (ka > 0) {
    const [kx, ky] = rpt(KD, RG.R); dot(kx, ky, 13, '#fff', { g: 26, a: ka });
    const [lx, ly] = rpt(KD, RG.R + 40); text('K', lx, ly + 9, { size: 28, weight: 800, font: MONO, align: 'center', a: ka });
  }
  const S1 = 17.0, s1 = eIO(P(lt, S1, S1 + 2.7));
  if (s1 > 0) {
    const cur = KD + 150 * s1;
    arcSeg(KD, cur, RG.R + 22, '#ffffff', 7, old, 20);
    const [hx, hy] = rpt(cur, RG.R + 22); dot(hx, hy, 11, '#fff', { g: 26, a: old });
    [[300, 0.2, 0], [360, 0.6, 1], [420, 1.0, 2]].forEach(([nd, fr, k]) => {
      const q = P(s1, fr - 0.04, fr + 0.04); if (q <= 0) return;
      const [px, py] = rpt(nd, RG.R + (k === 1 ? 128 : 82));
      const pulse = P(lt, S1 + (fr - 0.04) * 2.7, S1 + 0.8 + (fr - 0.04) * 2.7);
      if (pulse < 1) { const [nx, ny] = rpt(nd); ctx.save(); ctx.strokeStyle = NC[nd % 360 === 300 ? 0 : nd % 360 === 0 ? 1 : 2]; ctx.globalAlpha = 1 - pulse; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(nx, ny, 32 + pulse * 40, 0, 7); ctx.stroke(); ctx.restore(); }
      text(`Replica ${k + 1}`, px, py + 8, { size: 24, weight: 800, color: NC[k], align: 'center', a: eOut(q) });
    });
  }
  // 虚拟节点：副本跳过同一台物理机
  const va = ease(23.4, 24.1, lt);
  if (va > 0) {
    pnode(330, 'S1′', NC[0], { s: eBack(P(lt, 23.4, 24.1)), a: va, r: 24, size: 20, hollow: true });
  }
  const s2 = eIO(P(lt, 24.0, 26.4));
  if (s2 > 0) {
    const cur = KD + 150 * s2;
    arcSeg(KD, cur, RG.R + 50, AMBER, 6, 1, 18);
    const [hx, hy] = rpt(cur, RG.R + 50); dot(hx, hy, 10, AMBER, { g: 22 });
    if (cur >= 330) {
      const [cx, cy] = rpt(330, RG.R); cross(cx, cy, 14, RED, eOut(P(cur, 330, 336)));
      const [tx, ty] = rpt(330, RG.R + 80); text('Same machine · skip', 1600, 262, { size: 22, weight: 700, color: RED, a: eOut(P(cur, 330, 340)) });
    }
  }
  bullet(0, 'Partition: keys go to different nodes', ease(8.4, 9.0, lt));
  bullet(1, 'Replicate: each key stored N times', ease(14.5, 15.1, lt));
  bullet(2, 'Replicas on different machines', ease(23.4, 24.0, lt));
  statCard(110, 620, 640, 'Replicas N', '3', { color: SC[0], a: ease(20.0, 20.7, lt), note: '3 nodes clockwise' });
}

// ───────── 副本方框（Quorum / 反例共用） ─────────
const RB = { xs: [880, 1180, 1480], y: 520, w: 260, h: 170 };
const rcx = (i) => RB.xs[i] + RB.w / 2;
const CX = 1310, CY0 = 330;       // 协调节点出线口
function replica(i, val, { a = 1, valColor = INK, sub = null, subColor = MUTE, ring = null, dim = 1 } = {}) {
  const x = RB.xs[i], y = RB.y, c = REP[i];
  ctx.save(); ctx.globalAlpha *= a * dim;
  glass(x, y, RB.w, RB.h, { accent: ring || c });
  ctx.fillStyle = ring || c; glow(ring || c, 14); rr(x + 24, y, RB.w - 48, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
  text(`Replica ${'ABC'[i]}`, x + 26, y + 50, { size: 28, weight: 800, color: c, font: MONO });
  text(`x = ${val}`, x + RB.w / 2, y + 116, { size: 50, weight: 800, align: 'center', font: MONO, color: valColor });
  if (sub) text(sub, x + RB.w / 2, y + 152, { size: 22, weight: 600, align: 'center', color: subColor });
  ctx.restore();
}
function coordLink(i, a = 1, color = 'rgba(255,255,255,0.16)', dash = null) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 2; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(CX, CY0); ctx.lineTo(rcx(i), RB.y); ctx.stroke(); ctx.restore();
}
function chipTag(cx, cy, label, color, a = 1, w = 150) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy + (1 - a) * 8);
  glass(-w / 2, -22, w, 44, { r: 22, accent: color, fill: 0.1 });
  text(label, 0, 8, { size: 24, weight: 700, align: 'center', font: MONO, color });
  ctx.restore();
}
function coordinator(a = 1) { box(1170, 230, 280, 100, 'Coordinator', { color: AMBER, a }); }
const down = (i, p, color) => packet(CX, CY0, rcx(i), RB.y, p, color, { r: 10 });
const up = (i, p, color) => packet(rcx(i), RB.y, CX, CY0, p, color, { r: 10 });

// ───────── 场景 2：N / W / R 仲裁 ─────────
function sceneQuorum(lt) {
  header(lt, '02', 'Quorum Reads & Writes', SC[3], 'How many acks and replies are needed');
  coordinator(ease(0.7, 1.4, lt));
  [0, 1, 2].forEach((i) => { coordLink(i, ease(1.0, 1.8, lt)); });
  const wDone = lt > 19.5;
  [0, 1, 2].forEach((i) => replica(i, i < 2 && wDone ? 1 : 0, { a: ease(0.7 + i * 0.2, 1.5 + i * 0.2, lt), valColor: i < 2 && wDone ? LIME : INK }));
  // 左栏：N W R
  statCard(110, 400, 640, 'N · number of replicas', '3', { color: SC[0], a: ease(6.4, 7.1, lt), h: 108 });
  statCard(110, 518, 640, 'W · acks a write waits for', '2', { color: LIME, a: ease(8.8, 9.5, lt), h: 108 });
  statCard(110, 636, 640, 'R · replies a read waits for', '2', { color: AMBER, a: ease(12.2, 12.9, lt), h: 108 });
  // 写：协调节点 → A、B，等两个确认
  [0, 1].forEach((i) => { down(i, P(lt, 18.7, 19.5), LIME); up(i, P(lt, 19.5, 20.2), LIME); });
  [0, 1].forEach((i) => chipTag(rcx(i), 745, 'Write ack ✓', LIME, ease(20.0, 20.6, lt), 200));
  // 读：协调节点 → B、C，取较新的
  [1, 2].forEach((i) => { down(i, P(lt, 20.8, 21.6), AMBER); up(i, P(lt, 21.6, 22.3), AMBER); });
  [1, 2].forEach((i) => chipTag(rcx(i), 805, 'Read reply ✓', AMBER, ease(22.2, 22.8, lt), 200));
  const rp = ease(22.3, 22.9, lt);
  chipTag(rcx(1), 482, 'reply x=1', LIME, rp, 170); chipTag(rcx(2), 482, 'reply x=0', MUTE, rp, 170);
  const pick = ease(23.0, 23.7, lt);
  if (pick > 0) text('Take newer version → x = 1', 1470, 290, { size: 26, weight: 700, color: LIME, a: pick });
  const ov = ease(24.0, 24.7, lt);
  if (ov > 0) {
    ctx.save(); ctx.globalAlpha *= ov; glow(AMBER, 24); ctx.strokeStyle = AMBER; ctx.lineWidth = 5; rr(RB.xs[1] - 8, RB.y - 8, RB.w + 16, RB.h + 16, 28); ctx.stroke(); ctx.restore();
    text('write {A,B} & read {B,C} share {B}', 1310, 868, { size: 32, weight: 800, font: MONO, align: 'center', a: ov });
  }
  const eq = ease(28.0, 28.7, lt);
  if (eq > 0) {
    glass(110, 780, 640, 96, { a: eq, accent: LIME });
    text('W + R = 4  >  N = 3', 430, 842, { size: 38, weight: 800, font: MONO, color: LIME, align: 'center', a: eq });
  }
}

// ───────── 场景 3：反例，相交仍会倒退 ─────────
function sceneCounter(lt) {
  header(lt, '03', 'Overlap ≠ Consistency', RED, 'An unfinished write makes reads go backwards');
  coordinator(ease(0.7, 1.4, lt));
  [0, 1, 2].forEach((i) => coordLink(i, ease(1.0, 1.8, lt)));
  const aNew = lt > 5.0;
  replica(0, aNew ? 1 : 0, { a: ease(0.7, 1.4, lt), valColor: aNew ? AMBER : INK, sub: lt > 6.2 ? 'Write incomplete' : null, subColor: AMBER });
  replica(1, 0, { a: ease(0.9, 1.6, lt) }); replica(2, 0, { a: ease(1.1, 1.8, lt) });
  // 写 x=1：只到 A
  down(0, P(lt, 4.0, 5.0), AMBER);
  [1, 2].forEach((i) => {
    const p = P(lt, 4.0, 5.3);
    if (p > 0) { const x = lerp(CX, rcx(i), p * 0.55), y = lerp(CY0, RB.y, p * 0.55); if (lt < 5.7) dot(x, y, 8, AMBER, { g: 10, a: 0.9 }); }
    cross(lerp(CX, rcx(i), 0.55), lerp(CY0, RB.y, 0.55), 12, RED, ease(5.4, 5.9, lt));
  });
  const w1 = ease(8.2, 8.9, lt);
  if (w1 > 0) text('Only 1 ack < W = 2', 1480, 290, { size: 26, weight: 700, color: AMBER, a: w1 });
  // 读一：A、B
  [0, 1].forEach((i) => { down(i, P(lt, 10.4, 11.2), AMBER); up(i, P(lt, 11.3, 12.1), AMBER); });
  const r1 = ease(11.9, 12.5, lt) * (1 - ease(13.3, 13.8, lt));
  chipTag(rcx(0), 482, 'reply x=1', LIME, r1, 170); chipTag(rcx(1), 482, 'reply x=0', MUTE, r1, 170);
  // 读二：B、C
  [1, 2].forEach((i) => { down(i, P(lt, 14.0, 14.8), AMBER); up(i, P(lt, 14.9, 15.7), AMBER); });
  const r2 = ease(15.5, 16.1, lt);
  chipTag(rcx(1), 482, 'reply x=0', MUTE, r2, 170); chipTag(rcx(2), 482, 'reply x=0', MUTE, r2, 170);
  // 结果条
  const s1 = ease(12.8, 13.5, lt), s2 = ease(16.6, 17.3, lt);
  [[880, 'Read 1 · A,B → 1', LIME, s1], [1330, 'Read 2 · B,C → 0', RED, s2]].forEach(([x, s, c, a]) => {
    if (a <= 0) return; glass(x, 790, 430, 84, { a, accent: c }); text(s, x + 215, 842, { size: 26, weight: 800, font: MONO, align: 'center', color: c, a });
  });
  const bk = ease(18.6, 19.3, lt);
  statCard(110, 600, 640, 'Value the user sees', '1 → 0', { color: RED, a: bk, note: 'both reads R=2' });
  bullet(0, 'Write x=1 reaches only replica A', ease(3.9, 4.5, lt));
  bullet(1, 'Read 1: ask A, B → 1', ease(10.4, 11.0, lt));
  bullet(2, 'Read 2: ask B, C → 0', ease(14.0, 14.6, lt));
  bullet(0, 'W + R > N is only part of it', ease(23.4, 24.0, lt), { y0: 752 });
  bullet(1, 'Compare versions', ease(26.8, 27.4, lt), { y0: 752 });
  bullet(2, 'Read repair (write back)', ease(28.4, 29.0, lt), { y0: 752 });
  text('Illustrative: counterexample from the self-test quiz', 110, 392, { size: 20, color: DIM, a: ease(1.5, 2.2, lt), });
}

// ───────── 向量时钟 ─────────
function vec(x, y, [a, b], { size = 40, hlA = false, hlB = false, al = 1, hlColor = AMBER } = {}) {
  const cw = size * 0.6, bx = x + cw * 5;
  [[x, 'A', a, hlA, SC[0]], [bx, 'B', b, hlB, SC[1]]].forEach(([px, n, v, hl, c]) => {
    if (hl) { ctx.save(); ctx.globalAlpha *= al; ctx.fillStyle = hlColor + '40'; glow(hlColor, 14); rr(px - 8, y - size * 0.86, cw * 3 + 16, size * 1.2, 10); ctx.fill(); ctx.restore(); }
    text(`${n}:`, px, y, { size, weight: 800, font: MONO, color: c, a: al });
    text(String(v), px + cw * 2, y, { size, weight: 800, font: MONO, color: hl ? hlColor : INK, a: al });
  });
}
const vecW = (size = 40) => size * 0.6 * 8;

function sceneVclock(lt) {
  header(lt, '04', 'Vector Clocks', SC[2], 'Stamp every modification');
  bullet(0, 'Version = [server:count] pairs', ease(5.0, 5.6, lt));
  bullet(1, 'A edits the name → Zhang Ming', ease(8.8, 9.4, lt));
  bullet(2, 'B edits at the same time → Li Min', ease(13.9, 14.5, lt));
  bullet(3, 'Editor adds 1 to its own entry', ease(19.6, 20.2, lt));
  // 根版本
  const ra = ease(2.9, 3.7, lt);
  glass(830, 455, 300, 150, { a: ra, accent: '#8b8dfc' });
  text('name = Zhang Min', 856, 508, { size: 27, weight: 700, a: ra });
  vec(860, 570, [1, 1], { size: 36, al: ra });
  // 网络断开
  const ba = ease(7.7, 8.5, lt);
  if (ba > 0) {
    ctx.save(); ctx.globalAlpha *= ba; ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.setLineDash([8, 9]);
    ctx.beginPath(); ctx.moveTo(1550, 450); ctx.lineTo(1550, 610); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    cross(1550, 530, 14, RED, ba); text('Network split', 1584, 538, { size: 26, weight: 700, color: RED, a: ba });
  }
  // A 分支（上）
  const aa = ease(8.8, 9.6, lt);
  arrow(1130, 510, 1296, 345, { color: SC[0], w: 4, p: eIO(P(lt, 8.8, 9.6)), g: 8 });
  text('Server A edits', 1000, 395, { size: 24, weight: 700, color: SC[0], a: aa });
  glass(1300, 270, 500, 150, { a: aa, accent: SC[0] });
  text(`name = ${lt > 9.6 ? 'Zhang Ming' : 'Zhang Min'}`, 1334, 322, { size: 30, weight: 700, a: aa });
  const aFlip = lt >= 11.2, aPulse = 1 - P(lt, 11.2, 12.4);
  vec(1334, 384, [aFlip ? 2 : 1, 1], { size: 38, hlA: aFlip && aPulse > 0.02 || aFlip, al: aa });
  // B 分支（下）
  const bb = ease(13.9, 14.7, lt);
  arrow(1130, 550, 1296, 715, { color: SC[1], w: 4, p: eIO(P(lt, 13.9, 14.7)), g: 8 });
  text('Server B edits too', 1000, 668, { size: 24, weight: 700, color: SC[1], a: bb });
  glass(1300, 630, 500, 150, { a: bb, accent: SC[1] });
  text(`name = ${lt > 14.7 ? 'Li Min' : 'Zhang Min'}`, 1334, 682, { size: 30, weight: 700, a: bb });
  const bFlip = lt >= 16.3;
  vec(1334, 744, [1, bFlip ? 2 : 1], { size: 38, hlB: bFlip, al: bb });
  const ca = ease(20.6, 21.4, lt);
  if (ca > 0) text('Neither has seen the other\'s edit', 1310, 880, { size: 28, weight: 700, color: MUTE, align: 'center', a: ca });
}

// ───────── 场景 5：怎么比较、怎么合并 ─────────
function cmpRow(y, h, X, Y, { a = 1, hlX = [false, false], hlY = [false, false], verdict = '', vColor = INK, va = 0, hlColor = AMBER } = {}) {
  glass(830, y, 1000, h, { a, accent: vColor === INK ? null : (va > 0 ? vColor : null) });
  text('X', 870, y + 84, { size: 34, weight: 800, color: MUTE, font: MONO, a });
  vec(920, y + 84, X, { size: 38, hlA: hlX[0], hlB: hlX[1], al: a, hlColor });
  text('vs', 1230, y + 84, { size: 28, color: DIM, a, align: 'center', font: MONO });
  text('Y', 1290, y + 84, { size: 34, weight: 800, color: MUTE, font: MONO, a });
  vec(1340, y + 84, Y, { size: 38, hlA: hlY[0], hlB: hlY[1], al: a, hlColor });
  if (va > 0) {
    ctx.save(); ctx.globalAlpha *= va; ctx.translate((1 - va) * 14, 0);
    text(verdict, 1810, y + 36, { size: 26, weight: 800, color: vColor, align: 'right' });
    ctx.restore();
  }
}
function sceneMerge(lt) {
  header(lt, '05', 'Ancestor or Concurrent', SC[2], 'Compare entry by entry; missing = 0');
  cmpRow(190, 120, [1, 1], [2, 1], { a: ease(2.2, 2.9, lt), hlY: [true, false], hlColor: LIME, verdict: 'X is an ancestor · overwrite', vColor: LIME, va: ease(5.6, 6.3, lt) });
  const hl = lt >= 10.6;
  cmpRow(330, 120, [2, 1], [1, 2], { a: ease(9.0, 9.7, lt), hlX: [hl, false], hlY: [false, hl], verdict: 'Conflict · sibling versions', vColor: RED, va: ease(13.4, 14.1, lt), hlColor: RED });
  // 合并
  const ma = ease(19.8, 20.5, lt);
  glass(830, 470, 1000, 400, { a: ma, accent: '#8b8dfc' });
  text('Merge: decided by the app / user', 870, 520, { size: 26, color: MUTE, weight: 700, a: ma });
  const pick = ease(22.0, 22.7, lt);
  [[870, 'Zhang Ming', [2, 1]], [1260, 'Li Min', [1, 2]]].forEach(([x, n, v], k) => {
    const chosen = k === 0;
    glass(x, 550, 380, 100, { a: ma * (chosen ? 1 : 1 - 0.55 * pick), accent: chosen && pick > 0 ? LIME : null, r: 18 });
    text(n, x + 28, 588, { size: 28, weight: 800, a: ma * (chosen ? 1 : 1 - 0.55 * pick) });
    vec(x + 28, 634, v, { size: 32, al: ma * (chosen ? 1 : 1 - 0.55 * pick) });
  });
  if (pick > 0) text('User picks "Zhang Ming"', 1050, 700, { size: 24, weight: 700, color: LIME, align: 'center', a: pick, base: 'alphabetic' });
  const m1 = ease(24.3, 25.0, lt);
  if (m1 > 0) {
    text('Max per entry', 870, 780, { size: 26, color: MUTE, weight: 700, a: m1 });
    arrow(1090, 768, 1170, 768, { color: MUTE, a: m1, p: 1 });
    vec(1210, 780, [2, 2], { size: 40, al: m1 });
  }
  const m2 = ease(27.0, 27.7, lt);
  if (m2 > 0) {
    arrow(1510, 768, 1570, 768, { color: AMBER, a: m2 });
    text('A +1', 1520, 740, { size: 24, weight: 800, color: AMBER, font: MONO, a: m2 });
    vec(1600, 780, [3, 2], { size: 40, hlA: true, al: m2, hlColor: LIME });
  }
  bullet(0, 'Ancestor: just overwrite', ease(6.0, 6.6, lt));
  bullet(1, 'Concurrent: keep siblings', ease(13.8, 14.4, lt));
  bullet(2, 'Detects conflicts, never decides', ease(17.4, 18.0, lt));
  statCard(110, 640, 640, 'Merged version', 'A:3 B:2', { color: LIME, a: ease(29.0, 29.7, lt), note: 'includes both edits' });
}

// ───────── 场景 6：写路径 ─────────
const WC = { y: 350, h: 380, log: { x: 1010, w: 230 }, mem: { x: 1320, w: 230 }, sst: { x: 1610, w: 220 } };
function comp(c, title, sub, color, a = 1) {
  glass(c.x, WC.y, c.w, WC.h, { a, accent: color });
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; glow(color, 16); rr(c.x + 24, WC.y, c.w - 48, 5, 3); ctx.fill(); ctx.restore();
  text(title, c.x + 22, WC.y + 52, { size: 28, weight: 800, a });
  text(sub, c.x + 22, WC.y + 82, { size: 20, color: MUTE, font: MONO, a });
}
function rowBox(x, y, label, color, a = 1) {
  if (a <= 0) return;
  glass(x, y, 190, 44, { r: 12, accent: color, a, fill: 0.09 }); text(label, x + 95, y + 31, { size: 24, weight: 700, font: MONO, align: 'center', a });
}
const REC = ['k7', 'k2', 'k9'];
const logSlot = (k) => [WC.log.x + 20, WC.y + 108 + k * 56];
const memSlot = (k) => [WC.mem.x + 20, WC.y + 108 + k * 56];
const sstSlot = (k) => [WC.sst.x + 15, WC.y + 108 + k * 56];
function sceneWrite(lt) {
  header(lt, '06', 'Write Path', SC[2], 'Log for safety, memory for speed');
  const A = ease(0.7, 1.5, lt);
  box(820, 490, 150, 100, 'put', { color: '#8b8dfc', sub: '(k, v)', a: A, size: 30 });
  comp(WC.log, 'Commit log', 'sequential', SC[2], A); comp(WC.mem, 'Memtable', 'in memory', SC[0], A); comp(WC.sst, 'SSTable', 'sorted · disk', SC[1], A);
  arrow(975, 540, 1005, 540, { color: DIM, a: A, w: 3, head: 10 }); arrow(1245, 540, 1315, 540, { color: DIM, a: A, w: 3, head: 10 }); arrow(1555, 540, 1605, 540, { color: DIM, a: A, w: 3, head: 10 });
  // 步骤标号
  [[WC.log.x + WC.log.w / 2, '①', 4.6, SC[2]], [WC.mem.x + WC.mem.w / 2, '②', 9.7, SC[0]], [WC.sst.x + WC.sst.w / 2, '③', 13.8, SC[1]]].forEach(([x, s, t, c]) => {
    const a = ease(t, t + 0.5, lt); if (a > 0) { dot(x, 308, 24, c, { g: 16, a }); text(s, x, 318, { size: 30, weight: 800, color: '#06080f', align: 'center', a }); }
  });
  // 记录 → 提交日志
  const t1 = [5.4, 6.3, 7.2], t2 = [10.5, 11.3, 12.1];
  REC.forEach((n, k) => {
    const [lx, ly] = logSlot(k), [mx, my] = memSlot(k);
    const p1 = eIO(P(lt, t1[k], t1[k] + 0.8)), p2 = eIO(P(lt, t2[k], t2[k] + 0.8));
    // 提交日志里的行
    if (p1 > 0) {
      const x = lerp(850, lx, p1), y = lerp(520, ly, p1);
      rowBox(x, y, `put ${n}`, SC[2], clamp(p1 * 3));
    }
    // 内存表里的行（落地前一直在日志中；落地后复制到内存）
    if (p2 > 0) {
      const flushP = eIO(P(lt, 17.2 + k * 0.35, 18.2 + k * 0.35));
      const rank = [1, 0, 2][k];                 // 排序后：k2 k7 k9
      const [sx, sy] = sstSlot(rank);
      const x = flushP > 0 ? lerp(mx, sx, flushP) : lerp(lx, mx, p2), y = flushP > 0 ? lerp(my, sy, flushP) : lerp(ly, my, p2);
      rowBox(x, y, n, flushP > 0.5 ? SC[1] : SC[0], flushP >= 1 && false ? 0 : 1);
    }
  });
  // memtable 容量条
  const mf = lt < 10.5 ? 0 : lt < 17.2 ? lerp(0.1, 1, eIO(P(lt, 12.6, 15.4))) : lerp(1, 0, eIO(P(lt, 18.4, 19.4)));
  const mb = ease(9.9, 10.6, lt);
  if (mb > 0) {
    const bx = WC.mem.x + 20, by = WC.y + WC.h - 62, bw = WC.mem.w - 40;
    ctx.save(); ctx.globalAlpha *= mb; rr(bx, by, bw, 22, 11); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    const full = mf > 0.97; ctx.fillStyle = full ? AMBER : SC[0]; glow(full ? AMBER : SC[0], 12); rr(bx, by, Math.max(22, bw * mf), 22, 11); ctx.fill(); ctx.restore();
    text('Memory used', bx, by - 10, { size: 20, color: MUTE, a: mb });
  }
  const th = ease(15.0, 15.6, lt) * (1 - ease(18.0, 18.5, lt));
  if (th > 0) text('Threshold hit → flush', WC.mem.x + WC.mem.w / 2, WC.y + WC.h + 44, { size: 26, weight: 800, color: AMBER, align: 'center', a: th });
  // 磁盘 / 内存 标签
  text('Disk · append-only', WC.log.x + WC.log.w / 2, WC.y + WC.h + 44, { size: 22, color: MUTE, align: 'center', a: ease(5, 6, lt) });
  const lk = ease(20.6, 21.3, lt);
  if (lk > 0) { glass(WC.sst.x, WC.y + WC.h + 18, WC.sst.w, 52, { a: lk, accent: SC[1], r: 26 }); text('Never modified', WC.sst.x + WC.sst.w / 2, WC.y + WC.h + 52, { size: 24, weight: 700, color: SC[1], align: 'center', a: lk }); }
  bullet(0, '① Append to log · crash recovery', ease(5.0, 5.6, lt));
  bullet(1, '② Write into the memtable', ease(10.0, 10.6, lt));
  bullet(2, '③ Flush to a sorted SSTable', ease(14.8, 15.4, lt));
}

// ───────── 场景 7：读路径 ─────────
const RY = [300, 510, 720];
const SSTK = [['k3', 'k8'], ['k1', 'k5'], ['k8', 'k9']];
function sceneRead(lt) {
  header(lt, '07', 'Read Path', SC[0], 'Memory first, then Bloom filters');
  const A = ease(0.7, 1.4, lt);
  comp({ x: 980, w: 200 }, 'Memtable', 'in memory', SC[0], A);
  // 重绘 memtable 为较矮方框（覆盖 comp 的高度）——这里直接用 comp 的高度即可
  text('k2 · k5', 1080, WC.y + 160, { size: 28, weight: 700, font: MONO, align: 'center', a: A });
  // 查询包
  const q1 = P(lt, 3.2, 4.1), q2 = P(lt, 6.0, 6.8);
  const key = lt < 5.8 ? 'k2' : 'k8';
    text(`get(${key})`, 820, 470, { size: 30, weight: 800, font: MONO, color: INK, a: lt < 5.6 ? ease(2.8, 3.3, lt) : ease(5.8, 6.1, lt) });
  packet(830, 540, 980, 540, lt < 5.6 ? q1 : q2, '#ffffff');
  const hit = ease(4.1, 4.6, lt) * (1 - ease(5.5, 5.8, lt));
  if (hit > 0) { text('Hit', 1080, 330, { size: 36, weight: 800, color: LIME, align: 'center', a: hit }); arrow(980, 600, 830, 600, { color: LIME, a: hit, g: 8 }); text('Return', 880, 640, { size: 24, color: LIME, weight: 700, a: hit }); }
  const miss = ease(6.8, 7.3, lt);
  if (miss > 0) text('Miss', 1080, 330, { size: 36, weight: 800, color: RED, align: 'center', a: miss });
  // SSTable 与布隆过滤器
  const mid = [1180, 510];
  SSTK.forEach((ks, i) => {
    const sa = ease(7.0 + i * 0.5, 7.7 + i * 0.5, lt), cy = RY[i];
    const skip = i === 1 ? ease(22.4, 23.1, lt) : 0, dimA = 1 - 0.7 * skip;
    ctx.save(); ctx.globalAlpha *= sa * 0.35; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.setLineDash([5, 7]);
    ctx.beginPath(); ctx.moveTo(1180, 510); ctx.lineTo(1290, cy); ctx.stroke(); ctx.restore();
    ctx.save(); ctx.globalAlpha *= dimA;
    glass(1500, cy - 70, 330, 140, { a: sa, accent: SC[1] });
    text(`SSTable ${i + 1}`, 1522, cy - 22, { size: 26, weight: 800, a: sa, color: SC[1] });
    ks.forEach((k, j) => text(k, 1530 + j * 100, cy + 38, { size: 32, weight: 800, font: MONO, a: sa, color: k === 'k8' && lt > 10.0 ? AMBER : INK }));
    if (lt > 10.0) ks.forEach((k, j) => { if (k !== 'k8') return; const a = ease(10.0, 10.7, lt); ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = AMBER; glow(AMBER, 10); ctx.lineWidth = 3; rr(1520 + j * 100, cy + 8, 66, 42, 10); ctx.stroke(); ctx.restore(); });
    ctx.restore();
    // 布隆过滤器
    const ba = ease(15.3 + i * 0.5, 16.0 + i * 0.5, lt);
    if (ba > 0) {
      ctx.save(); ctx.globalAlpha *= ba * dimA;
      glass(1290, cy - 40, 170, 80, { accent: AMBER, fill: 0.09 }); text('Bloom filter', 1375, cy + 9, { size: 22, weight: 700, align: 'center', color: AMBER });
      ctx.restore();
    }
    // 询问 → 回答
    packet(1180, 510, 1290, cy, P(lt, 19.2 + i * 0.15, 19.9 + i * 0.15), '#ffffff', { r: 8 });
    const ans = ease(20.0 + i * 0.2, 20.6 + i * 0.2, lt);
    const maybe = i !== 1;
    if (ans > 0) text(maybe ? 'Maybe' : 'Definitely not', 1375, cy - 52, { size: 24, weight: 800, color: maybe ? AMBER : RED, align: 'center', a: ans });
    if (!maybe && skip > 0) cross(1375, cy, 22, RED, skip);
    // 通过则去读 SSTable
    if (maybe) packet(1460, cy, 1500, cy, P(lt, 23.4, 24.1), LIME, { r: 8 });
    if (maybe && lt > 23.9) { ctx.save(); ctx.globalAlpha *= ease(23.9, 24.5, lt); glow(LIME, 18); ctx.strokeStyle = LIME; ctx.lineWidth = 3; rr(1500, cy - 70, 330, 140, 22); ctx.stroke(); ctx.restore(); }
  });
  bullet(0, '① Memory first · return on hit', ease(3.2, 3.8, lt));
  bullet(1, '② One key, several files', ease(10.0, 10.6, lt));
  bullet(2, '③ Bloom filter screens first', ease(15.3, 15.9, lt));
  bullet(3, '④ Read only "maybe" files', ease(23.9, 24.5, lt));
  text('Then check the index and merge versions', 110, 700, { size: 24, color: MUTE, a: ease(24.4, 25.0, lt) });
}

// ───────── 场景 8：布隆过滤器 ─────────
const BC = { x0: 860, w: 100, gap: 12, y: 450, h: 100 };
const bcx = (i) => BC.x0 + i * (BC.w + BC.gap);
function sceneBloom(lt) {
  header(lt, '08', 'Bloom Filter', AMBER, 'A 0 rules it out; all 1s is only suspicion');
  const A = ease(0.7, 1.5, lt);
  // 位的归属与时间
  const setT = { 1: [['alpha', 9.6]], 4: [['alpha', 9.9], ['beta', 12.4]], 6: [['beta', 12.8]] };
  const keyCol = { alpha: SC[0], beta: SC[1] };
  for (let i = 0; i < 8; i++) {
    const own = (setT[i] || []).filter(([, t]) => lt >= t);
    const x = bcx(i), y = BC.y;
    ctx.save(); ctx.globalAlpha *= A;
    rr(x, y, BC.w, BC.h, 16); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.stroke();
    if (own.length) {
      const t0 = Math.max(...own.map((o) => o[1])), pop = 1 + 0.12 * Math.sin(P(lt, t0, t0 + 0.4) * Math.PI);
      ctx.save(); ctx.translate(x + BC.w / 2, y + BC.h / 2); ctx.scale(pop, pop); ctx.translate(-BC.w / 2, -BC.h / 2);
      glow(keyCol[own[0][0]], 14);
      ctx.save(); rr(0, 0, BC.w, BC.h, 16); ctx.clip();
      if (own.length === 2) { ctx.fillStyle = keyCol[own[0][0]] + '88'; ctx.fillRect(0, 0, BC.w / 2, BC.h); ctx.fillStyle = keyCol[own[1][0]] + '88'; ctx.fillRect(BC.w / 2, 0, BC.w / 2, BC.h); }
      else { ctx.fillStyle = keyCol[own[0][0]] + '88'; ctx.fillRect(0, 0, BC.w, BC.h); }
      ctx.restore(); ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = own.length === 2 ? '#fff' : keyCol[own[0][0]]; rr(0, 0, BC.w, BC.h, 16); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
    text(own.length ? '1' : '0', x + BC.w / 2, y + 68, { size: 48, weight: 800, font: MONO, align: 'center', color: own.length ? INK : DIM, a: A });
    text(String(i), x + BC.w / 2, y + BC.h + 36, { size: 24, color: MUTE, font: MONO, align: 'center', a: A });
  }
  text('bit index · illustrative: 8 bits, 2 hash functions', 860, y2(), { size: 22, color: DIM, a: ease(4.6, 5.3, lt) });
  // 操作：key 与哈希箭头
  const ops = [
    { name: 'alpha', col: SC[0], bits: [1, 4], t: 8.0, arrowEnd: 9.5, label: 'Insert' },
    { name: 'beta', col: SC[1], bits: [4, 6], t: 10.9, arrowEnd: 12.3, label: 'Insert' },
    { name: 'gamma', col: AMBER, bits: [1, 6], t: 13.6, arrowEnd: 17.4, aStart: 15.6, label: 'Query' },
    { name: 'omega', col: SC[2], bits: [2, 7], t: 22.6, arrowEnd: 25.0, aStart: 23.4, label: 'Query' },
  ];
  let active = null;
  ops.forEach((o, k) => { const end = ops[k + 1] ? ops[k + 1].t - 0.2 : 99; if (lt >= o.t && lt < end) active = o; });
  if (active) {
    const o = active, a = ease(o.t, o.t + 0.5, lt);
    ctx.save(); ctx.globalAlpha *= a; glass(1180, 215, 260, 56, { r: 28, accent: o.col, fill: 0.1 });
    text(`${o.label}  ${o.name}`, 1310, 252, { size: 28, weight: 800, font: MONO, align: 'center', color: o.col }); ctx.restore();
    const as = o.aStart || o.t + 0.5;
    o.bits.forEach((b) => arrow(1310, 276, bcx(b) + BC.w / 2, BC.y - 6, { color: o.col, w: 3, p: eIO(P(lt, as, o.arrowEnd - (o.bits.indexOf(b) ? 0 : 0.3))), g: 6 }));
  }
  // 查询 gamma：高亮所查的位
  const g = ease(17.6, 18.3, lt) * (1 - ease(22.0, 22.4, lt));
  if (g > 0) [1, 6].forEach((b) => { ctx.save(); ctx.globalAlpha *= g; glow(AMBER, 20); ctx.strokeStyle = AMBER; ctx.lineWidth = 4; rr(bcx(b) - 5, BC.y - 5, BC.w + 10, BC.h + 10, 20); ctx.stroke(); ctx.restore(); });
    const ov = ease(26.5, 27.2, lt), om = ease(25.2, 25.8, lt);
  if (om > 0) [2, 7].forEach((b) => { ctx.save(); ctx.globalAlpha *= om; glow(LIME, 18); ctx.strokeStyle = b === 2 ? LIME : 'rgba(255,255,255,0.4)'; ctx.lineWidth = 4; rr(bcx(b) - 5, BC.y - 5, BC.w + 10, BC.h + 10, 20); ctx.stroke(); ctx.restore(); });
  // 结论面板
  const ga = ease(19.2, 19.9, lt) * (1 - ease(22.0, 22.5, lt));
  if (ga > 0) {
    glass(860, 665, 896, 160, { a: ga, accent: AMBER });
    text('Bit 1 = 1, bit 6 = 1 → maybe present', 1308, 725, { size: 36, weight: 800, color: AMBER, align: 'center', a: ga });
    text('gamma was never inserted: a false positive, so read the file', 1308, 781, { size: 26, weight: 600, color: RED, align: 'center', a: ga });
  }
  if (ov > 0) {
    glass(860, 665, 896, 160, { a: ov, accent: LIME });
    text('Bit 2 = 0 → definitely absent', 1308, 725, { size: 36, weight: 800, color: LIME, align: 'center', a: ov });
    text('Skip this file, no disk read needed', 1308, 781, { size: 26, weight: 600, color: MUTE, align: 'center', a: ov });
  }
  bullet(0, 'Insert: set a few bits to 1', ease(8.4, 9.0, lt));
  bullet(1, 'All 1s → maybe, still read disk', ease(19.2, 19.8, lt));
  bullet(2, 'Any bit 0 → definitely absent', ease(26.5, 27.1, lt));
}
function y2() { return 628; }

// ───────── 总结 ─────────
function sceneEnd(lt) {
  ctx.save(); ctx.globalAlpha *= 0.55;
  const g = { x: 1640, y: 235, R: 118 };
  ringBase(g, 1, 0.8);
  NODES.forEach((d, i) => pnode(d, '', NC[i], { g, r: 12, a: 0.9 }));
  ctx.restore();
  text('Key-Value Store', 110, 250, { size: 84, weight: 900, a: ease(0.2, 0.9, lt) });
  text('System Design Interview · Chapter 6', 112, 304, { size: 28, color: MUTE, font: MONO, a: ease(0.4, 1.1, lt) });
  [['N · W · R', ['Replicas, write acks, read replies:', 'trade consistency for latency'], SC[0], 2.1],
   ['Vector clocks', ['Detect concurrent conflicts,', 'never judge who is right'], SC[2], 6.0],
   ['Storage engine', ['Commit log, memtable, SSTable,', 'plus Bloom filters'], SC[1], 11.2]].forEach(([w, s, c, t0], k) => {
    const p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 250, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 560, { size: w.length > 9 ? 54 : 70, weight: 800 });
    text(s[0], x + 36, 612, { size: 24, color: MUTE });
    text(s[1], x + 36, 646, { size: 24, color: MUTE });
    ctx.restore();
  });
  const aa = ease(19.0, 19.8, lt);
  text('Also in the book, only mentioned briefly', 110, 750, { size: 24, color: MUTE, a: aa });
  let bx = 110;
  ['Gossip failure detection', 'Sloppy quorum & hinted handoff', 'Merkle tree anti-entropy'].forEach((s, k) => { bx += badge(bx, 780, s, '#8b8dfc', ease(19.2 + k * 0.5, 20 + k * 0.5, lt)) + 16; });
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = ease(0.2, 1.2, lt);
  const g = { x: 1380, y: 540, R: 330 };
  ctx.save(); ctx.globalAlpha *= 0.9;
  ringBase(g, ease(0.3, 2.2, lt));
  NODES.forEach((d, i) => { const p = P(lt, 1.2 + i * 0.25, 1.8 + i * 0.25); pnode(d, `S${i + 1}`, NC[i], { g, s: eBack(p), a: clamp(p * 3) }); });
  for (let i = 0; i < 14; i++) { const d = (i * 25.7 + lt * 6) % 360; keyDot(d, NC[ownerIdx(d)], { g, r: 5, a: ease(2.2 + i * 0.05, 2.8 + i * 0.05, lt) * 0.9, rd: g.R - 52 }); }
  ctx.restore();
  text('SYSTEM DESIGN INTERVIEW', 110, 340, { size: 28, weight: 600, color: SC[0], ls: 5, a });
  const gr = ctx.createLinearGradient(110, 0, 800, 0); gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#b4b7ff');
  ctx.save(); ctx.globalAlpha *= ease(0.4, 1.4, lt); ctx.translate(0, (1 - ease(0.4, 1.4, lt)) * 30);
  ctx.font = `900 130px ${SANS}`; ctx.fillStyle = gr; ctx.letterSpacing = '2px'; ctx.fillText('Key-Value', 104, 470); ctx.fillText('Store', 104, 600); ctx.restore();
  text('Chapter 6', 112, 690, { size: 34, weight: 700, color: INK, a: ease(1.2, 2, lt) });
}

export const scenes = { title: sceneTitle, part: scenePart, quorum: sceneQuorum, counter: sceneCounter, vclock: sceneVclock, merge: sceneMerge, write: sceneWrite, read: sceneRead, bloom: sceneBloom, end: sceneEnd };
