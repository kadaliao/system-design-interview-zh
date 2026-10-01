// Chapter 19 Distributed Message Queue: English scenes (shell and helpers from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC,
         rr, glass, text, glow, dot, badge, header as header0, arrow, box, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 19, title: 'Distributed Message Queue', en: 'Distributed Message Queue' };

const PC = [SC[0], SC[1], SC[2], SC[3]];   // 分区 P0..P3 的颜色
const GREEN = SC[4], AMBER = SC[3];

// English titles are wider: shrink the font so it never exceeds the 640px left column
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

// ───────── 通用：日志单元格 ─────────
function cell(x, y, w, h, label, color, { a = 1, s = 1, hollow = false, dashed = false, sz = 24, hl = false, tint = '33' } = {}) {
  if (a <= 0 || s <= 0.02) return;
  const cx = x + w / 2, cy = y + h / 2;
  ctx.save(); ctx.globalAlpha *= clamp(a); ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  if (hl) glow(color, 20);
  rr(x, y, w, h, 10);
  if (!hollow) { ctx.fillStyle = color + tint; ctx.fill(); }
  ctx.lineWidth = hl ? 3.5 : 2; ctx.strokeStyle = color; if (dashed) ctx.setLineDash([7, 6]); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  if (label != null) text(String(label), cx, cy + sz * 0.36, { size: sz, weight: 700, align: 'center', font: MONO });
  ctx.restore();
}
function ring(x, y, w, h, color, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; glow(color, 24); ctx.lineWidth = 4; ctx.strokeStyle = color; rr(x - 7, y - 7, w + 14, h + 14, 14); ctx.stroke(); ctx.restore();
}
function tri(x, y, up, color, a = 1, s = 14) {
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; glow(color, 14); ctx.beginPath();
  if (up) { ctx.moveTo(x, y); ctx.lineTo(x - s, y + s * 1.6); ctx.lineTo(x + s, y + s * 1.6); }
  else { ctx.moveTo(x, y); ctx.lineTo(x - s, y - s * 1.6); ctx.lineTo(x + s, y - s * 1.6); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function cross(x, y, r, color, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round'; glow(color, 14);
  ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke(); ctx.restore();
}
const frame = (x, y, w, h, color, a = 1, dash = true, r = 26) => {
  ctx.save(); ctx.globalAlpha *= a; ctx.lineWidth = 2.5; ctx.strokeStyle = color; if (dash) ctx.setLineDash([10, 9]); rr(x, y, w, h, r); ctx.stroke(); ctx.restore();
};

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  for (let r = 0; r < 3; r++) {
    const y = 380 + r * 150; const ra = eOut(P(lt, 0.5 + r * 0.25, 1.3 + r * 0.25));
    glass(1030, y, 780, 108, { a: ra, accent: PC[r] });
    text(`P${r}`, 1056, y + 64, { size: 32, weight: 800, color: PC[r], font: MONO, a: ra });
    for (let k = 0; k < 9; k++) {
      const t0 = 1.8 + k * 0.38 + r * 0.17, p = eBack(P(lt, t0, t0 + 0.5));
      cell(1130 + k * 74, y + 24, 62, 60, k, PC[r], { s: p, a: p > 0.02 ? 1 : 0, sz: 22 });
    }
  }
  text('SYSTEM DESIGN INTERVIEW', 110, 340, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 900, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 108px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '1px'; ctx.fillText('Distributed', 104, 480); ctx.fillText('Message Queue', 104, 600); ctx.restore();
  text('Animated walkthrough', 112, 670, { size: 36, color: MUTE, a: eOut(P(lt, 0.8, 1.6)) });
  text('Chapter 19', 112, 740, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 1：主题 → 分区 → 分区键 ─────────
const TY = [270, 450, 630];
const tcx = (k) => 1250 + k * 70;
const TM = [['u1', 0], ['u2', 1], ['u3', 2], ['u1', 0], ['u2', 1], ['u1', 0], ['u3', 2], ['u2', 1]];
function sceneTopic(lt, d) {
  header(lt, '01', 'Topics & Partitions', SC[0], 'How messages are split and placed');
  const t0m = 10.4, step = 0.8;
  box(810, 430, 190, 110, 'Producer', { color: SC[4], sub: null, a: eOut(P(lt, 0.8, 1.5)) });
  const fa = eOut(P(lt, 1.2, 2.0));
  frame(1060, 190, 780, 600, '#8b8dfc', fa);
  text('Topic · orders', 1090, 235, { size: 26, weight: 700, color: '#8b8dfc', font: MONO, a: fa });
  for (let r = 0; r < 3; r++) {
    const ra = eOut(P(lt, 3.6 + r * 0.5, 4.4 + r * 0.5)), y = TY[r];
    glass(1080, y, 750, 100, { a: ra, accent: PC[r] });
    text(`P${r}`, 1100, y + 50, { size: 32, weight: 800, color: PC[r], font: MONO, a: ra });
    text(`Broker ${r + 1}`, 1100, y + 84, { size: 20, color: MUTE, font: MONO, a: ra });
    arrow(1000, 485, 1076, y + 50, { color: PC[r] + 'aa', w: 3, head: 10, p: eOut(P(lt, 6.0 + r * 0.3, 6.8 + r * 0.3)), dash: [6, 7] });
  }
  const cnt = [0, 0, 0], land = [];
  let cur = -1;
  TM.forEach(([key, p], i) => {
    const k = cnt[p]++, t0 = t0m + i * step, f = eIO(P(lt, t0, t0 + 0.8));
    const tx = tcx(k), ty = TY[p] + 10;
    if (lt >= t0 && lt < t0 + step) cur = i;
    land.push([key, p, k, tx, ty]);
    if (lt < t0) return;
    const x = lerp(1010, tx, f), y = lerp(458, ty, f) - Math.sin(f * Math.PI) * 26;
    cell(x, y, 64, 56, key, PC[p], { sz: 22, hl: f < 1 });
    if (f >= 1) text(String(k), tx + 32, TY[p] + 90, { size: 20, color: MUTE, font: MONO, align: 'center', a: eOut(P(lt, t0 + 0.8, t0 + 1.2)) });
  });
  text('Illustrative: u1, u2, u3 are the partition keys of three users', 1090, 830, { size: 22, color: DIM, a: eOut(P(lt, 10.2, 11)) });
  bullet(0, 'Grouped by topic first', eOut(P(lt, 1.6, 2.2)), { y0: 410 });
  bullet(1, 'Split into partitions on brokers', eOut(P(lt, 3.8, 4.4)), { y0: 410 });
  if (cur >= 0) {
    const [key, p] = TM[cur], a = eOut(P(lt, t0m, t0m + 0.5));
    glass(110, 560, 640, 110, { a, accent: PC[p] });
    text('Partition key mod 3', 140, 604, { size: 22, color: MUTE, a });
    text(`hash(${key}) % 3 = ${p}  →  P${p}`, 140, 650, { size: 36, weight: 700, font: MONO, color: PC[p], a });
  }
  const ha = eOut(P(lt, 16.8, 17.6));
  if (ha > 0) {
    land.filter((v) => v[0] === 'u1').forEach(([, , , x, y]) => ring(x, y, 64, 56, SC[3], ha * 0.9));
    statCard(110, 700, 640, 'Ordering guaranteed', 'Within one partition', { color: SC[3], a: ha });
  }
}

// ───────── 场景 2：追加写日志与分段 ─────────
const lcx = (i) => 820 + Math.floor(i / 4) * 345 + (i % 4) * 82;
function sceneLog(lt, d) {
  header(lt, '02', 'Append-Only Log', SC[1], 'Write at the end, never edit');
  const LY = 520, LH = 90;
  // 段框
  const sa = eOut(P(lt, 12.0, 12.8));
  const expire = eIO(P(lt, 20.6, 21.9));
  [0, 1, 2].forEach((s) => {
    const x = 820 + s * 345 - 10, col = s === 2 ? GREEN : s === 0 && expire > 0 ? RED : '#8f98b0';
    frame(x, 490, 342, 150, col, sa * (s === 0 ? 1 - expire * 0.55 : 1), s === 2 ? false : true, 20);
    const lab = s === 2 ? 'Active · writable' : s === 0 && expire > 0.3 ? 'Expired · dropped' : 'Old · read-only';
    text(lab, x + 171, 678, { size: 22, weight: 600, color: col, align: 'center', a: sa * (s === 0 ? 1 - expire * 0.4 : 1) });
    text(`Segment ${s}`, x + 14, 480, { size: 20, color: MUTE, font: MONO, a: sa });
  });
  for (let i = 0; i < 12; i++) {
    const t0 = i < 10 ? 1.0 + i * 0.28 : 4.2, p = i < 10 ? eBack(P(lt, t0, t0 + 0.45)) : eBack(P(lt, t0, t0 + 0.5));
    const seg0 = i < 4, fade = seg0 ? 1 - expire * 0.75 : 1;
    if (i >= 10 && i !== 10) { cell(lcx(i), LY, 76, LH, null, '#8f98b0', { hollow: true, dashed: true, a: 0.5 * sa + 0.3, s: 1 }); continue; }
    if (i === 10 && p <= 0.02) { cell(lcx(i), LY, 76, LH, null, '#8f98b0', { hollow: true, dashed: true, a: 0.7 }); continue; }
    const isNew = i === 10;
    cell(lcx(i), LY, 76, LH, i, isNew ? GREEN : SC[1], { s: p, a: fade * (p > 0.02 ? 1 : 0), sz: 28, hl: isNew && lt < 7.0, hollow: false });
    if (seg0 && expire > 0.5) cross(lcx(i) + 38, LY + 45, 12, RED, (expire - 0.5) * 1.6 * 0.6);
  }
  // 写入位置
  const wa = eOut(P(lt, 3.6, 4.2)) * (1 - eOut(P(lt, 6.9, 7.5)));
  if (wa > 0) { arrow(lcx(10) + 38, 440, lcx(10) + 38, 505, { color: GREEN, a: wa, g: 10 }); text('Append at the end', lcx(10) + 38, 428, { size: 24, weight: 700, color: GREEN, align: 'center', a: wa }); }
  // 定位三元组
  const ta = eOut(P(lt, 7.2, 8.0));
  if (ta > 0) {
    glass(820, 190, 1020, 150, { a: ta, accent: SC[1] });
    text('Locating one message', 850, 232, { size: 22, color: MUTE, a: ta });
    const parts = [['topic', 'orders', SC[0]], ['partition', '0', SC[2]], ['offset', '7', SC[3]]];
    parts.forEach(([k, v, c], j) => {
      const x = 850 + j * 330, aa = eOut(P(lt, 8.0 + j * 1.1, 8.7 + j * 1.1));
      text(k, x, 270, { size: 20, color: c, font: MONO, weight: 700, a: aa });
      text(v, x, 322, { size: 44, weight: 800, font: MONO, a: aa });
    });
    const ha = eOut(P(lt, 10.8, 11.6));
    if (ha > 0) { ring(lcx(7), LY, 76, LH, SC[3], ha); arrow(1590, 340, lcx(7) + 38, 478, { color: SC[3], a: ha, w: 3, p: ha }); }
    text('Each message also has: key, value, timestamp, size, CRC', 820, 396, { size: 24, color: MUTE, a: eOut(P(lt, 11.4, 12.2)) });
  }
  bullet(0, 'Append only, no edits', eOut(P(lt, 1.4, 2.0)), { y0: 410 });
  bullet(1, 'Offset = position in partition', eOut(P(lt, 7.4, 8.0)), { y0: 410 });
  bullet(2, 'Old segments read-only', eOut(P(lt, 14.2, 14.8)), { y0: 410 });
  const ra = eOut(P(lt, 18.5, 19.3));
  statCard(110, 640, 640, 'Retention', '2 weeks', { color: SC[3], a: ra, note: 'whole segment' });
  if (expire > 0.3) text('No per-message delete', 1000, 760, { size: 28, weight: 700, color: RED, a: eOut(P(lt, 21.4, 22.0)) });
}

// ───────── 场景 3：消费组各自的偏移量 ─────────
const ocx = (i) => 826 + i * 84;
function sceneOffsets(lt, d) {
  header(lt, '03', 'Offsets', SC[3], 'Reading never deletes');
  const RY = 480;
  const ra = eOut(P(lt, 0.6, 1.4));
  for (let i = 0; i < 12; i++) {
    const p = eBack(P(lt, 0.6 + i * 0.06, 1.1 + i * 0.06));
    cell(ocx(i), RY, 78, 90, i, '#8b8dfc', { s: p, a: p > 0.02 ? 1 : 0, sz: 28 });
  }
  text('Partition 0 · only one copy of the log', 826, 810, { size: 24, color: MUTE, a: ra });
  // 指针
  const ordF = P(lt, 3.8, 8.6), ord = 6 * eIO(ordF) + eIO(P(lt, 11.4, 12.4));
  const stF = P(lt, 3.8, 10.4), stRewind = eIO(P(lt, 14.3, 16.5));
  const sta = 9 * eIO(stF), st = sta - stRewind * 6;
  const ordA = eOut(P(lt, 3.3, 3.9)), stA = ordA;
  const ox = 826 + ord * 84 - 3, sx = 826 + st * 84 - 3;
  // 已读进度条
  ctx.save(); ctx.globalAlpha *= ordA; ctx.fillStyle = SC[0]; glow(SC[0], 12); rr(826, 462, Math.max(ox - 826, 6), 8, 4); ctx.fill(); ctx.restore();
  ctx.save(); ctx.globalAlpha *= stA; ctx.fillStyle = SC[3]; glow(SC[3], 12); rr(826, 590, Math.max(sx - 826, 6), 8, 4); ctx.fill(); ctx.restore();
  tri(ox, 470, false, SC[0], ordA); tri(sx, 590, true, SC[3], stA);
  text('Orders', clamp(ox, 826, 1700), 410 - 0, { size: 26, weight: 800, color: SC[0], align: 'center', a: ordA });
  text('Analytics', clamp(sx, 826, 1700), 658, { size: 26, weight: 800, color: SC[3], align: 'center', a: stA });
  const rw = eOut(P(lt, 14.5, 15.2));
  if (rw > 0) text('Replay: move the offset back', 1060, 730, { size: 30, weight: 700, color: SC[3], align: 'center', a: rw });
  // 左栏
  bullet(0, 'Messages stay after reading', eOut(P(lt, 1.0, 1.6)), { y0: 400 });
  bullet(1, 'Each group stores its own offset', eOut(P(lt, 3.4, 4.0)), { y0: 400 });
  bullet(2, 'Move it back to replay', eOut(P(lt, 14.3, 14.9)), { y0: 400 });
  statCard(110, 580, 640, 'Orders group offset', String(Math.floor(ord + 0.001)), { color: SC[0], a: eOut(P(lt, 4.0, 4.8)) });
  statCard(110, 710, 640, 'Analytics group offset', String(Math.floor(st + 0.001)), { color: SC[3], a: eOut(P(lt, 4.0, 4.8)) });
}

// ───────── 场景 4：一个分区只给组内一个消费者 ─────────
const GY = [260, 410, 560, 710];
function sceneGroup(lt, d) {
  header(lt, '04', 'Consumer Groups', SC[2], 'One partition, one consumer');
  const p3 = eBack(P(lt, 21.8, 22.5)), c4on = lt > 22.9;
  text('Topic partitions', 830, 212, { size: 24, color: MUTE, a: eOut(P(lt, 0.6, 1.2)) });
  const ga = eOut(P(lt, 0.8, 1.6));
  frame(1385, 175, 400, 665, SC[0], ga);
  text('Consumer group 1', 1415, 214, { size: 24, weight: 700, color: SC[0], a: ga });
  for (let i = 0; i < 4; i++) {
    const pa = i < 3 ? eOut(P(lt, 0.6 + i * 0.25, 1.3 + i * 0.25)) : clamp(p3 * 1.5), ps = i < 3 ? 1 : lerp(0.85, 1, clamp(p3));
    box(830, GY[i], 220, 100, `P${i}`, { color: PC[i], sub: 'Partition', a: pa, s: ps });
    const ca = i < 3 ? eOut(P(lt, 0.8 + i * 0.25, 1.5 + i * 0.25)) : 0;
    if (i < 3) box(1415, GY[i], 340, 100, `C${i + 1}`, { color: SC[0], sub: 'Consumer', a: ca });
  }
  // C4
  const c4 = eBack(P(lt, 13.5, 14.2)); const idle = !c4on;
  if (c4 > 0.02) {
    box(1415, GY[3], 340, 100, 'C4', { color: idle ? DIM : SC[0], sub: idle ? 'idle · no partition' : 'Consumer', a: clamp(c4) * (idle ? 0.8 : 1), s: lerp(0.85, 1, clamp(c4)) });
  }
  // 越权尝试 P0 -> C2
  const tryA = eOut(P(lt, 2.8, 3.4)) * (1 - eOut(P(lt, 6.8, 7.4)));
  if (tryA > 0) {
    arrow(1050, 330, 1415, 455, { color: RED, w: 4, a: tryA, dash: [9, 8], p: eOut(P(lt, 2.8, 3.8)) });
    if (lt > 3.7) cross(1232, 392, 20, RED, tryA);
    text('One partition cannot go to two consumers', 830, 800, { size: 24, weight: 600, color: RED, a: tryA });
  }
  // 1:1 箭头
  for (let i = 0; i < 4; i++) {
    const t0 = i < 3 ? 10.0 + i * 0.6 : 22.6;
    const pr = eOut(P(lt, t0, t0 + 0.7)); if (pr <= 0) continue;
    arrow(1050, GY[i] + 50, 1415, GY[i] + 50, { color: PC[i], w: 4, p: pr, g: 8 });
    const fl = ((lt * 0.7 + i * 0.31) % 1);
    if (pr >= 1) packet(1050, GY[i] + 50, 1415, GY[i] + 50, fl, PC[i], { r: 9, trail: 0.1 });
  }
  if (lt > 14.0 && lt < 21.8) { const a = eOut(P(lt, 14.0, 14.8)) * (1 - eOut(P(lt, 21.2, 21.8)));
    text('The extra one just waits', 830, 800, { size: 26, weight: 700, color: MUTE, a }); }
  bullet(0, 'In a group: 1 partition, 1 consumer', eOut(P(lt, 1.0, 1.6)), { y0: 410 });
  bullet(1, 'So order inside it stays intact', eOut(P(lt, 6.8, 7.4)), { y0: 410 });
  bullet(2, 'Extra consumers sit idle', eOut(P(lt, 13.6, 14.2)), { y0: 410 });
  const sa = eOut(P(lt, 17.3, 18.1));
  statCard(110, 640, 640, 'Active consumers ≤ partitions', lt < 22.7 ? '3 ≤ 3' : '4 ≤ 4', { color: SC[2], a: sa });
  if (lt > 21.0) text('More parallelism: add partitions', 110, 800, { size: 28, weight: 700, color: GREEN, a: eOut(P(lt, 21.0, 21.8)) });
}

// ───────── 场景 5：重平衡 ─────────
function sceneRebalance(lt, d) {
  header(lt, '05', 'Rebalancing', SC[3], 'A handoff of partitions');
  // 左栏：触发条件
  [['Member joins', 1.0], ['Member leaves', 2.1], ['Heartbeat times out', 3.2]].forEach(([s, t], k) => badge(110, 410 + k * 72, s, [SC[4], SC[1], RED][k], eOut(P(lt, t, t + 0.6))));
  text('Any of these triggers a rebalance', 110, 650, { size: 26, color: MUTE, a: eOut(P(lt, 5.2, 5.9)) });
  // 角色
  const A = { x: 860, y: 430, w: 220, h: 100 }, B = { x: 1560, y: 430, w: 220, h: 100 }, CO = { x: 1170, y: 190, w: 340, h: 100 };
  box(CO.x, CO.y, CO.w, CO.h, 'Coordinator', { color: SC[3], sub: 'Group', a: eOut(P(lt, 0.6, 1.3)) });
  const bDead = lt > 18.9;
  const bIn = eOut(P(lt, 1.0, 1.8));
  box(A.x, A.y, A.w, A.h, 'A', { color: SC[0], sub: lt > 12.4 && lt < 19 ? 'leader' : 'Consumer', a: eOut(P(lt, 0.6, 1.3)) });
  box(B.x, B.y, B.w, B.h, 'B', { color: bDead ? RED : SC[4], sub: bDead ? 'crashed' : 'Consumer', a: bIn * (lt < 7.4 ? 0.45 : 1), hot: bDead });
  if (bDead) cross(B.x + B.w / 2, B.y + B.h / 2, 26, RED, eOut(P(lt, 18.9, 19.4)));
  // 分区
  const PX = [1100, 1290, 1480];
  PX.forEach((x, i) => { const a = eOut(P(lt, 0.8 + i * 0.2, 1.4 + i * 0.2)); box(x, 740, 150, 80, `P${i}`, { color: PC[i], a, size: 30 }); });
  // 所有权区间 [from,to,owner]（owner: 0=A, 1=B）
  const own = (i) => [[0, 11.4, 0], [16.3, 18.9, i < 2 ? 0 : 1], [23.3, 99, 0]];
  const ownerPt = (o) => (o === 0 ? [A.x + A.w / 2, A.y + A.h] : [B.x + B.w / 2, B.y + B.h]);
  for (let i = 0; i < 3; i++) own(i).forEach(([f, t, o]) => {
    const a = eOut(P(lt, f, f + 0.6)) * (1 - eOut(P(lt, t, t + 0.5)));
    if (a <= 0.01) return;
    const [ox, oy] = ownerPt(o);
    arrow(ox, oy + 4, PX[i] + 75, 736, { color: o === 0 ? SC[0] : SC[4], w: 4, a, p: 1, head: 12 });
  });
  // 心跳
  const hb = (t0, from, to, color, aOn) => { const p = P(lt, t0, t0 + 0.9); if (p > 0 && p < 1) packet(from[0], from[1], to[0], to[1], p, color, { r: 8, trail: 0.15, a: aOn }); };
  const ac = [A.x + A.w / 2, A.y], coc = [CO.x + 60, CO.y + CO.h], cob = [CO.x + CO.w - 60, CO.y + CO.h], bc = [B.x + B.w / 2, B.y];
  [7.0, 8.2].forEach((t) => hb(t, ac, coc, '#9aa6d6', 1));
  hb(7.6, bc, cob, SC[4], 1);                      // B 请求加入
  hb(10.2, coc, ac, RED, 1);
  hb(10.6, cob, bc, RED, 1);
  if (lt > 7.6 && lt < 10.2) text('B asks to join', 1560, 410, { size: 22, color: SC[4], weight: 700, a: eOut(P(lt, 7.6, 8.1)) });
  if (lt > 10.2 && lt < 12.6) text('Heartbeat reply: rejoin', 1190, 330, { size: 24, color: RED, weight: 700, a: eOut(P(lt, 10.2, 10.7)) });
  // 暂停提示
  const pauseA = Math.max(eOut(P(lt, 11.4, 12.0)) * (1 - eOut(P(lt, 16.0, 16.6))), eOut(P(lt, 21.6, 22.2)) * (1 - eOut(P(lt, 23.2, 23.7))));
  if (pauseA > 0) text('Rebalancing · stop first', 1130, 690, { size: 32, weight: 700, color: SC[3], a: pauseA });
  // 分配方案
  const pa = eOut(P(lt, 12.8, 13.6));
  if (pa > 0 && lt < 18.9) {
    glass(1120, 325, 440, 70, { a: pa, accent: SC[3] }); text('Leader plan  A: P0 P1   B: P2', 1140, 369, { size: 24, weight: 600, font: MONO, a: pa });
  }
  if (lt >= 18.9 && lt < 21.6) text('B stopped heartbeating', 1090, 640, { size: 28, color: RED, weight: 700, a: eOut(P(lt, 19.3, 19.9)) });
  const ha = eOut(P(lt, 23.0, 23.8));
  statCard(110, 700, 640, 'Handoff rule', 'Stop, then take over', { color: SC[3], a: ha });
}

// ───────── 场景 6：副本、Leader、ISR ─────────
const RY6 = [215, 385, 555, 725];
const rcx = (o) => 1090 + (o - 9) * 88;
function sceneReplicate(lt, d) {
  header(lt, '06', 'Replicas & ISR', SC[0], 'Only in-sync replicas count');
  const rows = [
    { name: 'Leader', sub: 'Broker 1', col: SC[0], have: 15 },
    { name: 'Replica 2', sub: 'Follower · Broker 2', col: SC[1], have: 13 },
    { name: 'Replica 3', sub: 'Follower · Broker 3', col: SC[1], have: 13 },
    { name: 'Replica 4', sub: 'Follower · Broker 4', col: SC[1], have: 11 },
  ];
  const commitP = eIO(P(lt, 24.8, 25.8));
  const out4 = eOut(P(lt, 21.0, 21.8));
  rows.forEach((r, ri) => {
    const y = RY6[ri], ra = eOut(P(lt, 0.5 + ri * 0.25, 1.2 + ri * 0.25));
    const lag = ri === 3 && out4 > 0;
    glass(820, y, 1020, 110, { a: ra, accent: lag ? RED : r.col });
    text(r.name, 842, y + 54, { size: 32, weight: 800, color: lag ? RED : r.col, a: ra });
    text(r.sub, 842, y + 90, { size: 20, color: MUTE, font: MONO, a: ra });
    for (let o = 9; o <= 15; o++) {
      const x = rcx(o), cy = y + 12;
      let present, t0;
      if (o <= Math.min(r.have, 13)) { t0 = 1.0 + (o - 9) * 0.25 + ri * 0.1; present = eBack(P(lt, t0, t0 + 0.4)); cell(x, cy, 80, 86, o, r.col, { s: present, a: present > 0.02 ? 1 : 0, sz: 28 }); continue; }
      const unc = 1 - commitP;           // 未提交 → 提交
      if (ri === 0 && o >= 14) {         // Leader 新写的两条
        t0 = 12.0 + (o - 14) * 0.7; present = eBack(P(lt, t0, t0 + 0.5));
        cell(x, cy, 80, 86, o, unc > 0.5 ? AMBER : r.col, { s: present, a: present > 0.02 ? 1 : 0, sz: 28, dashed: unc > 0.5, hollow: unc > 0.5 });
        continue;
      }
      if ((ri === 1 || ri === 2) && o >= 14) {  // Follower 拉取
        t0 = 15.0 + (o - 14) * 0.6 + (ri - 1) * 0.5; const f = eIO(P(lt, t0, t0 + 0.9));
        if (lt >= t0) { const sy = RY6[0] + 12, yy = lerp(sy, cy, f); cell(x, yy, 80, 86, o, unc > 0.5 ? AMBER : r.col, { sz: 28, dashed: unc > 0.5, hollow: unc > 0.5, hl: f < 1 }); }
        else cell(x, cy, 80, 86, null, '#8f98b0', { hollow: true, dashed: true, a: 0.25 });
        continue;
      }
      // 副本 4 缺的槽位
      cell(x, cy, 80, 86, null, lag ? RED : '#8f98b0', { hollow: true, dashed: true, a: lag ? 0.8 * out4 + 0.2 : 0.25 });
    }
    // ISR 标签
    if (ri < 3) { const ia = eOut(P(lt, 17.4, 18.1)); text('ISR', 1750, y + 66, { size: 30, weight: 800, color: GREEN, font: MONO, a: ia }); }
    else if (out4 > 0) { text('out', 1740, y + 52, { size: 28, weight: 800, color: RED, font: MONO, a: out4 }); text('ISR', 1740, y + 88, { size: 24, weight: 800, color: RED, font: MONO, a: out4 }); }
  });
  // 提交线
  const cx = lerp(rcx(13) + 84, rcx(15) + 84, commitP), ca = eOut(P(lt, 10.5, 11.3));
  ctx.save(); ctx.globalAlpha *= ca; ctx.strokeStyle = GREEN; ctx.lineWidth = 3; ctx.setLineDash([8, 7]); glow(GREEN, 10);
  ctx.beginPath(); ctx.moveTo(cx, 200); ctx.lineTo(cx, 850); ctx.stroke(); ctx.restore();
  text(`Committed offset = ${commitP > 0.5 ? 15 : 13}`, cx, 192, { size: 22, weight: 700, color: GREEN, font: MONO, align: 'center', a: ca });
  // 文案
  bullet(0, 'Write to leader, followers pull', eOut(P(lt, 6.8, 7.4)), { y0: 410 });
  bullet(1, 'ISR = replicas keeping up', eOut(P(lt, 16.6, 17.2)), { y0: 410 });
  bullet(2, 'Committed when all ISR have it', eOut(P(lt, 24.4, 25.0)), { y0: 410 });
  statCard(110, 600, 640, 'Committed offset', commitP > 0.5 ? '15' : '13', { color: GREEN, a: eOut(P(lt, 10.5, 11.3)) });
  if (lt > 12.0) text('14 and 15 written, not committed', 110, 770, { size: 26, color: AMBER, weight: 600, a: eOut(P(lt, 12.8, 13.6)) * (1 - commitP) });
  if (lt > 25.8) text('Replica 4 lags, but does not slow commits', 110, 770, { size: 26, color: RED, weight: 600, a: eOut(P(lt, 26.0, 26.8)) });
}

// ───────── 场景 7：ACK 0 / 1 / all ─────────
function ackPanel(lt, y0, mode, t0, color) {
  const lp = lt - t0, on = eOut(P(lt, t0 - 0.6, t0 - 0.1));
  glass(820, y0, 1020, 200, { a: 0.35 + on * 0.65, accent: on > 0.5 ? color : null });
  const a = 0.25 + on * 0.75;
  text(`ACK = ${mode}`, 850, y0 + 66, { size: 40, weight: 800, color, font: MONO, a });
  text(mode === '0' ? 'Fire and forget' : mode === '1' ? 'Leader acks on receipt' : 'Confirm after all ISR sync', 850, y0 + 104, { size: 22, color: MUTE, a });
  const PX = [1160, y0 + 100], LX = [1310, y0 + 100], F1 = [1620, y0 + 50], F2 = [1620, y0 + 150];
  const crashAt = mode === '0' ? 2.4 : mode === '1' ? 2.8 : 3.8;
  const dead = lp > crashAt;
  // 节点
  dot(PX[0], PX[1], 30, SC[4], { g: 14, a: a }); text('Producer', PX[0], PX[1] + 66, { size: 20, color: MUTE, align: 'center', a });
  ctx.save(); ctx.globalAlpha *= a; glass(LX[0] - 70, LX[1] - 44, 140, 88, { accent: dead ? RED : SC[0], r: 18 }); ctx.restore();
  text('Leader', LX[0], LX[1] + 9, { size: 26, weight: 700, align: 'center', color: dead ? RED : INK, a: dead ? a * 0.45 : a });
  [F1, F2].forEach((f, i) => { ctx.save(); ctx.globalAlpha *= a; glass(f[0] - 60, f[1] - 30, 120, 60, { accent: SC[1], r: 14 }); ctx.restore(); text(`Follower`, f[0], f[1] + 8, { size: 20, align: 'center', a }); });
  if (on < 0.3) return;
  // 发送
  const send = P(lp, 0.3, 1.0); if (send > 0 && send < 1) packet(PX[0] + 30, PX[1], LX[0] - 70, LX[1], send, SC[4], { r: 9 });
  if (lp > 1.0 && lp < 1.0 + 0) { }
  if (lp >= 1.0) { const ga = lp > 1.0 ? 1 : 0; cell(LX[0] - 26, LX[1] - 70, 60, 34, 'msg', SC[4], { sz: 18, a: dead ? 0.35 : ga }); }
  if (mode === '1') { const ak = P(lp, 1.0, 1.8); if (ak > 0 && ak < 1) packet(LX[0] - 70, LX[1] + 6, PX[0] + 30, PX[1] + 6, ak, GREEN, { r: 8 }); if (lp > 1.8 && lp < 3.4) text('ACK', 1235, y0 + 150, { size: 22, weight: 800, color: GREEN, font: MONO, align: 'center', a: eOut(P(lp, 1.8, 2.2)) }); }
  if (mode === 'all') {
    [F1, F2].forEach((f, i) => {
      const r = P(lp, 1.0 + i * 0.2, 1.9 + i * 0.2); if (r > 0 && r < 1) packet(LX[0] + 70, LX[1], f[0] - 60, f[1], r, SC[1], { r: 8 });
      if (lp >= 1.9 + i * 0.2) cell(f[0] - 26, f[1] - 70 + (i ? 100 : 0) + (i ? 0 : 6) - 6 + (i ? -2 : 0) * 0, 60, 34, 'msg', SC[4], { sz: 18 });
    });
    const ak = P(lp, 2.2, 3.0); if (ak > 0 && ak < 1) packet(LX[0] - 70, LX[1] + 6, PX[0] + 30, PX[1] + 6, ak, GREEN, { r: 8 });
    if (lp > 3.0) text('ACK', 1235, y0 + 150, { size: 22, weight: 800, color: GREEN, font: MONO, align: 'center', a: eOut(P(lp, 3.0, 3.4)) });
  }
  if (dead) {
    cross(LX[0] + 52, LX[1] - 30, 12, RED, eOut(P(lp, crashAt, crashAt + 0.3)));
    text('Leader crashed', LX[0], y0 + 28, { size: 20, color: RED, weight: 700, align: 'center', a: eOut(P(lp, crashAt, crashAt + 0.3)) });
    const ra = eOut(P(lp, crashAt + 0.5, crashAt + 1.0));
    const [msg, c] = mode === '0' ? ['Lost, nobody knows', RED] : mode === '1' ? ['Confirmed, yet lost', RED] : ['Safe, highest latency', GREEN];
    text(msg, 850, y0 + 160, { size: 25, weight: 800, color: c, a: ra });
    if (mode === 'all') { cell(F1[0] - 26, F1[1] - 70, 60, 34, 'msg', GREEN, { sz: 18, hl: true }); }
  }
}
function sceneAcks(lt, d) {
  header(lt, '07', 'ACK Levels', SC[3], 'Latency vs. durability');
  ackPanel(lt, 180, '0', 5.4, RED);
  ackPanel(lt, 400, '1', 12.9, SC[3]);
  ackPanel(lt, 620, 'all', 21.6, GREEN);
  bullet(0, 'ACK=0  fastest, silent loss', eOut(P(lt, 4.4, 5.0)), { y0: 410 });
  bullet(1, 'ACK=1  crash before copy: lost', eOut(P(lt, 12.2, 12.8)), { y0: 410 });
  bullet(2, 'ACK=all  slowest, safest', eOut(P(lt, 21.0, 21.6)), { y0: 410 });
  text('Illustrative: the crash happens before replication', 820, 870, { size: 20, color: DIM, a: eOut(P(lt, 5, 6)) });
}

// ───────── 场景 8：投递语义（先提交 / 先处理） ─────────
function semPanel(lt, y0, mode, t0, color) {
  const lp = lt - t0, amo = mode === 'amo';
  const on = eOut(P(lt, 1.0, 1.8));
  glass(820, y0, 1020, 300, { a: on, accent: color });
  text(amo ? 'At-most-once' : 'At-least-once', 850, y0 + 48, { size: 32, weight: 800, color, a: on });
  text(amo ? 'Producer sends async, no retry on failure' : 'Producer uses ack=1 or all, retries on error', 850, y0 + 82, { size: 22, color: MUTE, a: on });
  // 步骤
  const steps = amo ? ['① Commit', '② Process'] : ['① Process', '② Commit'];
  const crashAt = 3.0;
  steps.forEach((s, i) => {
    const x = 850 + i * 250, lit = lp > (i === 0 ? 1.4 : 99), dead = i === 1 && lp > crashAt;
    const c = dead ? RED : lit ? color : '#8f98b0';
    glass(x, y0 + 110, 220, 56, { a: on, accent: c, r: 16 });
    text(s, x + 110, y0 + 147, { size: 24, weight: 700, align: 'center', color: dead ? RED : INK, a: on });
    if (dead) cross(x + 196, y0 + 110, 12, RED, eOut(P(lp, crashAt, crashAt + 0.3)));
  });
  arrow(1072, y0 + 138, 1100, y0 + 138, { color: MUTE, a: on, w: 3, head: 9 });
  if (lp > crashAt) text('Crash', 1350, y0 + 147, { size: 26, weight: 800, color: RED, a: eOut(P(lp, crashAt, crashAt + 0.3)) });
  // 日志与偏移量
  for (let k = 0; k < 5; k++) {
    const o = 4 + k, hot = o === 6;
    const lost = amo && hot && lp > 4.6;
    cell(850 + k * 100, y0 + 200, 88, 56, o, lost ? RED : hot ? SC[3] : '#8b8dfc', { a: on, sz: 26, hl: hot && lp > 0.4 && lp < 4.6, hollow: lost, dashed: lost });
  }
  const committed = amo ? (lp > 1.8 ? 7 : 6) : (lp > 99 ? 7 : 6);
  const px = lerp(850 + 2 * 100, 850 + 3 * 100, amo ? eIO(P(lp, 1.6, 2.2)) : 0) - 6;
  tri(px, y0 + 262, true, color, on * 0.9, 12);
  text(`Committed offset=${committed}`, 850, y0 + 296, { size: 20, color, font: MONO, weight: 700, a: on });
  // 结果
  const ra = eOut(P(lp, 4.4, 5.2));
  if (ra > 0) {
    glass(1400, y0 + 190, 420, 90, { a: ra, accent: amo ? RED : AMBER });
    text(amo ? 'Message 6 is never processed' : 'Re-read after restart: done twice', 1420, y0 + 242, { size: 22, weight: 700, color: amo ? RED : AMBER, a: ra });
  }
}
function sceneSemantics(lt, d) {
  header(lt, '08', 'Delivery Semantics', SC[2], 'Order decides: lost or repeated');
  semPanel(lt, 175, 'amo', 5.0, RED);
  semPanel(lt, 505, 'alo', 13.6, AMBER);
  bullet(0, 'Commit, then process: may lose', eOut(P(lt, 8.4, 9.0)), { y0: 410 });
  bullet(1, 'Process, then commit: may repeat', eOut(P(lt, 17.0, 17.6)), { y0: 410 });
}

// ───────── 场景 9：三种语义对比 + 恰好一次 ─────────
function sceneExact(lt, d) {
  header(lt, '09', 'Exactly-Once', SC[4], 'Friendliest, and costliest');
  const rows = [
    ['At-most-once', 'commit, then process', SC[3], 'Maybe', 'Never', 'Low', 0.9],
    ['At-least-once', 'process, then commit', SC[1], 'Never', 'Maybe', 'Mid', 3.4],
    ['Exactly-once', 'needs more than ordering', GREEN, 'Never', 'Never', 'High', 10.3],
  ];
  ['May lose', 'May duplicate', 'Cost'].forEach((h, k) => text(h, [1260, 1470, 1700][k], 190, { size: 22, color: MUTE, align: 'center', a: eOut(P(lt, 0.6, 1.2)) }));
  rows.forEach(([n, en, c, lose, dup, cost, t0], i) => {
    const y = 215 + i * 165, a = eOut(P(lt, t0, t0 + 0.7)), s = lerp(0.97, 1, a);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - a) * 20);
    glass(820, y, 1020, 140, { accent: c });
    text(n, 850, y + 62, { size: 40, weight: 800, color: c });
    text(en, 850, y + 104, { size: 22, color: MUTE, font: MONO });
    [[lose, 1260, true], [dup, 1470, true]].forEach(([v, x]) => {
      const bad = v === 'Maybe';
      dot(x - 56, y + 70, 9, bad ? RED : GREEN, { g: 10 });
      text(v, x - 36, y + 80, { size: 30, weight: 700, color: bad ? RED : GREEN });
    });
    text(cost, 1700, y + 84, { size: 44, weight: 800, align: 'center', color: i === 2 ? RED : INK });
    ctx.restore();
  });
  const na = eOut(P(lt, 15.0, 15.8));
  glass(820, 725, 1020, 150, { a: na, accent: GREEN });
  text('Exactly-once takes more than reordering commits', 850, 775, { size: 28, weight: 700, a: na });
  text('An external DB or payment API also needs:', 850, 822, { size: 24, color: MUTE, a: na });
  badge(1380, 790, 'Transactions', GREEN, eOut(P(lt, 17.8, 18.4))); badge(1580, 790, 'Idempotency', SC[0], eOut(P(lt, 18.4, 19.0)));
  bullet(0, 'At-most-once: may lose', eOut(P(lt, 1.2, 1.8)), { y0: 410 });
  bullet(1, 'At-least-once: may repeat', eOut(P(lt, 3.6, 4.2)), { y0: 410 });
  bullet(2, 'Exactly-once: highest cost', eOut(P(lt, 10.4, 11.0)), { y0: 410 });
  statCard(110, 640, 640, 'In practice: at-least-once, plus', 'Idempotency', { color: GREEN, a: eOut(P(lt, 7.0, 7.8)), note: '' });
}

// ───────── 总结 ─────────
function sceneEnd(lt, d) {
  for (let r = 0; r < 3; r++) for (let k = 0; k < 7; k++) {
    const a = eOut(P(lt, 0.3 + k * 0.08 + r * 0.1, 0.8 + k * 0.08 + r * 0.1));
    cell(1380 + k * 56, 150 + r * 60, 48, 44, k, PC[r], { a: a * 0.6, sz: 18 });
  }
  text('Distributed Message Queue', 110, 250, { size: 76, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Chapter 19 recap', 112, 304, { size: 32, color: MUTE, a: eOut(P(lt, 0.4, 1.1)) });
  [['Partitioned log', 'Append-only, ordered per partition', SC[0]], ['Consumer groups', 'Offsets track progress', SC[2]], ['Replicas & ISR', 'ACK trades latency for durability', SC[3]]].forEach(([w, s, c], k) => {
    const t0 = 2.7 + k * 3.7, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 40, weight: 800 });
    text(s, x + 36, 620, { size: 24, color: MUTE });
    ctx.restore();
  });
  const aa = eOut(P(lt, 12.0, 12.8));
  text('Delivery semantics depend on when the offset is committed', 110, 750, { size: 24, color: MUTE, a: aa });
  let bx = 110;
  [['At-most-once', SC[3]], ['At-least-once', SC[1]], ['Exactly-once', GREEN]].forEach(([s, c], k) => { bx += badge(bx, 780, s, c, eOut(P(lt, 12.3 + k * 0.3, 13.1 + k * 0.3))) + 16; });
  text('A teaching model; real products differ in the details', 110, 880, { size: 20, color: DIM, a: eOut(P(lt, 13.4, 14.0)) });
}

export const scenes = { title: sceneTitle, topic: sceneTopic, log: sceneLog, offsets: sceneOffsets, group: sceneGroup, rebalance: sceneRebalance, replicate: sceneReplicate, acks: sceneAcks, semantics: sceneSemantics, exact: sceneExact, end: sceneEnd };
