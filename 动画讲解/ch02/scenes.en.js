// Chapter 2 (EN): scenes (shell and tools from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, arrow, packet, statCard, bullet, dbIcon } from '../lib/core.js';

export const meta = { no: 2, title: 'Back-of-the-Envelope Estimation', en: 'Back-of-the-Envelope Estimation' };

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const rollN = (v, p) => fmt(v * eOut(clamp(p)));
const fade = (lt, a, b = a + 0.7) => eOut(P(lt, a, b));
const SX = 800, SW = 1040;
// header with auto-fit title (English is wider than Chinese)
function header(lt, num, title, accent, sub) {
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  let fs = 70; ctx.font = `800 ${fs}px ${SANS}`; const tw = ctx.measureText(title).width; if (tw > 650) fs = Math.floor(fs * 650 / tw);
  text(title, 108, 262, { size: fs, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: 26, color: MUTE });
  ctx.restore();
} // 舞台行的左边界与宽度

// 一行玻璃卡（舞台通用）：返回 {x,y,w,h}
function rowCard(y, h, color, a = 1, hot = false) {
  glass(SX, y, SW, h, { a, accent: hot ? RED : color, r: 20 });
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = hot ? RED : color; glow(hot ? RED : color, 14); rr(SX + 24, y, 70, 4, 2); ctx.fill(); ctx.restore();
}

// ───────── 场景 1：2 的幂 ─────────
const POW = [
  { e: 10, ap: '≈ 1 thousand', u: 'KB' }, { e: 20, ap: '≈ 1 million', u: 'MB' }, { e: 30, ap: '≈ 1 billion', u: 'GB' },
  { e: 40, ap: '≈ 1 trillion', u: 'TB' }, { e: 50, ap: '≈ 1 quadrillion', u: 'PB' },
];
const POW_T = [3.5, 7.2, 10.5, 12.8, 15.0];
const SUP = { 10: '¹⁰', 20: '²⁰', 30: '³⁰', 40: '⁴⁰', 50: '⁵⁰' };
function scenePower(lt) {
  header(lt, '01', 'Powers of two', SC[0], 'Every 10 bits: about 1,000x');
  POW.forEach((r, i) => {
    const y = 190 + i * 140, p = P(lt, POW_T[i], POW_T[i] + 1.4), a = fade(lt, POW_T[i], POW_T[i] + 0.5);
    if (a <= 0) return;
    rowCard(y, 104, SC[i], a);
    text(`2${SUP[r.e]}`, SX + 34, y + 68, { size: 40, weight: 800, font: MONO, color: SC[i], a });
    const bw = 220 * (r.e / 50) * eOut(p);
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = SC[i]; glow(SC[i], 14); rr(960, y + 36, Math.max(bw, 4), 30, 15); ctx.fill(); ctx.restore();
    const v = p >= 1 ? 2 ** r.e : Math.round(2 ** (r.e * eOut(p)));
    text(fmt(v), 1530, y + 66, { size: 26, weight: 700, font: MONO, align: 'right', a });
    text(r.ap, 1548, y + 64, { size: 24, color: MUTE, a: a * fade(lt, POW_T[i] + 1.0, POW_T[i] + 1.6) });
    const ua = fade(lt, 22.6 + i * 0.5, 23.2 + i * 0.5);
    if (ua > 0) { text(r.u, 1790, y + 68, { size: 34, weight: 800, font: MONO, color: SC[i], align: 'center', a: ua }); }
  });
  // ×1,000 连接
  for (let i = 0; i < 4; i++) {
    const a = fade(lt, 17.9 + i * 0.35, 18.5 + i * 0.35);
    text('↓ ×1,000', 1070, 190 + i * 140 + 104 + 28, { size: 22, weight: 700, font: MONO, color: SC[3], align: 'center', a });
  }
  bullet(0, '10 bits ≈ 1,000x', fade(lt, 17.9, 18.7));
  statCard(110, 540, 640, 'Exact value of 2³⁰', rollN(1073741824, P(lt, 10.5, 11.8)), { color: SC[2], a: fade(lt, 10.5, 11.2) });
  text('State your convention: KB decimal, KiB base-1024', 110, 710, { size: 22, color: MUTE, a: fade(lt, 25.4, 26.1) });
}

// ───────── 场景 2：心算技巧 ─────────
function sceneRound(lt) {
  header(lt, '02', 'Mental math', SC[1], 'Approximate first, then compute');
  // 面板 A
  const aa = fade(lt, 1.8, 2.6);
  glass(SX, 190, SW, 300, { a: aa, accent: SC[1] });
  text('Seconds in one day', SX + 36, 244, { size: 26, color: MUTE, a: aa });
  const pa = eIO(P(lt, 4.2, 7.4));
  const secs = lerp(86400, 100000, pa);
  text(fmt(secs), SX + 36, 350, { size: 76, weight: 800, font: MONO, a: aa, color: pa > 0.98 ? SC[1] : INK });
  text('seconds', SX + 36 + 76 * 0.62 * 7 + 30, 350, { size: 30, color: MUTE, a: aa });
  const fa = fade(lt, 7.2, 8.0);
  text('≈ 10⁵ sec', 1500, 350, { size: 52, weight: 800, font: MONO, color: SC[1], align: 'center', a: fa });
  // 条：86,400 vs 100,000
  const bw = 940;
  ctx.save(); ctx.globalAlpha *= aa; rr(SX + 36, 396, bw, 30, 15); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.fillStyle = SC[1]; glow(SC[1], 14); rr(SX + 36, 396, Math.max(30, bw * (secs / 100000)), 30, 15); ctx.fill(); ctx.restore();
  text('86,400 → 10⁵: overestimates by less than 16%', SX + 36, 466, { size: 22, color: MUTE, a: fa });
  // 面板 B
  const ba = fade(lt, 9.0, 9.8);
  glass(SX, 520, SW, 340, { a: ba, accent: SC[3] });
  text('Round the arithmetic first', SX + 36, 574, { size: 26, color: MUTE, a: ba });
  text('99,987 ÷ 9.1', SX + 36, 650, { size: 52, weight: 800, font: MONO, a: ba, color: lt > 15.4 ? DIM : INK });
  const r1 = fade(lt, 15.6, 16.4);
  arrow(SX + 420, 636, SX + 520, 636, { color: SC[3], p: eOut(P(lt, 15.4, 16.1)), a: ba });
  text('100,000 ÷ 10', SX + 548, 650, { size: 52, weight: 800, font: MONO, color: SC[3], a: r1 });
  const r2 = fade(lt, 19.5, 20.3);
  text('= 10,000', SX + 548, 730, { size: 60, weight: 800, font: MONO, color: SC[3], a: r2 });
  text(`Exact value is about ${fmt(99987 / 9.1)}: same order of magnitude`, SX + 36, 800, { size: 24, color: MUTE, a: fade(lt, 20.8, 21.6) });
  bullet(0, '1 day ≈ 10⁵ seconds', fade(lt, 5.9, 6.6));
  bullet(1, 'Magnitude beats decimals', fade(lt, 20.8, 21.6));
  statCard(110, 560, 640, 'Error from both roundings', '< 16%', { color: SC[1], a: fade(lt, 21.4, 22.2), note: 'same magnitude' });
}

// ───────── 场景 3：延迟数字 ─────────
const LAT = [
  { n: 'L1 cache', ns: 0.5, t: '0.5 ns', c: SC[0], at: 2.0 },
  { n: 'L2 cache', ns: 7, t: '7 ns', c: SC[0], at: 3.8 },
  { n: 'Main memory', ns: 100, t: '100 ns', c: SC[0], at: 5.6 },
  { n: 'SSD random read', ns: 150e3, t: '150 µs', c: SC[3], at: 8.4 },
  { n: 'Same-DC round trip', ns: 500e3, t: '500 µs', c: SC[1], at: 10.8 },
  { n: 'HDD random seek', ns: 10e6, t: '10 ms', c: RED, at: 13.2 },
  { n: 'Cross-region trip', ns: 150e6, t: '150 ms', c: SC[1], at: 15.6 },
];
const lx = (ns) => 1060 + (500 * (Math.log10(ns) + 1)) / 9.5;
function sceneLatency(lt) {
  header(lt, '03', 'Latency numbers', SC[3], 'Compare on a log scale');
  const ga = fade(lt, 1.0, 1.8);
  [[1, '1 ns'], [1e3, '1 µs'], [1e6, '1 ms']].forEach(([ns, l]) => {
    const x = lx(ns);
    ctx.save(); ctx.globalAlpha *= ga; ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 8]);
    ctx.beginPath(); ctx.moveTo(x, 180); ctx.lineTo(x, 790); ctx.stroke(); ctx.restore();
    text(l, x, 822, { size: 22, color: MUTE, align: 'center', font: MONO, a: ga });
  });
  LAT.forEach((r, i) => {
    const y = 190 + i * 84, p = P(lt, r.at, r.at + 1.0), a = fade(lt, r.at, r.at + 0.4);
    if (a <= 0) return;
    text(r.n, 810, y + 38, { size: 24, weight: 600, a });
    const bw = (lx(r.ns) - 1060) * eOut(p);
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = r.c; glow(r.c, 14); rr(1060, y + 14, Math.max(bw, 6), 36, 18); ctx.fill(); ctx.restore();
    text(r.t, 1060 + Math.max(bw, 6) + 16, y + 42, { size: 28, weight: 700, font: MONO, color: r.c === SC[0] ? SC[0] : r.c, a: a * fade(lt, r.at + 0.5, r.at + 1.1) });
  });
  text('2020 reference magnitudes, not vendor SLAs; measure on real hardware', 810, 880, { size: 22, color: DIM, a: fade(lt, 17.2, 18.0) });
  const hdd = P(lt, 14.0, 16.4);
  statCard(110, 560, 640, 'HDD seek ÷ main memory', `${rollN(100000, hdd)}x`, { color: RED, a: fade(lt, 13.8, 14.5) });
  statCard(110, 690, 640, 'SSD random read ÷ main memory', `${rollN(1500, P(lt, 9.0, 10.4))}x`, { color: SC[3], a: fade(lt, 8.8, 9.5) });
  bullet(0, 'Memory fast, disk slow', fade(lt, 20.2, 21.0));
  bullet(1, 'Avoid disk seeks', fade(lt, 23.1, 23.9));
}

// ───────── 场景 4：几个 9 ─────────
const NINES = [
  { p: '99%', k: 'two nines', min: 5256, v: 3.65, dp: 2, u: 'days', at: 3.0, c: SC[3] },
  { p: '99.9%', k: 'three nines', min: 525.6, v: 8.8, dp: 1, u: 'hours', at: 8.4, c: SC[2] },
  { p: '99.99%', k: 'four nines', min: 52.56, v: 52, dp: 0, u: 'min', at: 11.3, c: SC[1] },
  { p: '99.999%', k: 'five nines', min: 5.256, v: 5.3, dp: 1, u: 'min', at: 13.4, c: SC[0] },
  { p: '99.9999%', k: 'six nines', min: 0.5256, v: 31.56, dp: 2, u: 'sec', at: 16.4, c: SC[4] },
];
function sceneNines(lt) {
  header(lt, '04', 'Counting nines', SC[2], 'Allowed downtime per year');
  NINES.forEach((r, i) => {
    const y = 190 + i * 140, p = P(lt, r.at, r.at + 1.2), a = fade(lt, r.at, r.at + 0.5);
    if (a <= 0) return;
    rowCard(y, 104, r.c, a);
    text(r.p, SX + 34, y + 58, { size: 34, weight: 800, font: MONO, color: r.c, a });
    text(r.k, SX + 34, y + 90, { size: 20, color: MUTE, a });
    const full = 560, bw = Math.max(8, full * (r.min / 5256)) * eOut(p);
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = r.c; glow(r.c, 14); rr(1070, y + 34, Math.max(bw, 6), 36, 18); ctx.fill(); ctx.restore();
    const val = (r.v * eOut(p)).toFixed(r.dp);
    text(`${val} ${r.u}`, 1070 + Math.max(bw, 6) + 20, y + 66, { size: 32, weight: 800, font: MONO, a: a * fade(lt, r.at + 0.4, r.at + 1) });
  });
  for (let i = 0; i < 4; i++) {
    const a = fade(lt, 19.6 + i * 0.3, 20.2 + i * 0.3);
    text('↓ ÷10', 1070, 190 + i * 140 + 104 + 28, { size: 22, weight: 700, font: MONO, color: MUTE, align: 'left', a });
  }
  const fa = fade(lt, 1.6, 2.4);
  text('Downtime min/yr ≈', 110, 440, { size: 24, color: MUTE, a: fa });
  text('365×24×60×(1 − avail.)', 110, 488, { size: 30, weight: 700, font: MONO, a: fa });
  statCard(110, 560, 640, 'Each extra nine', 'downtime ÷ 10', { color: SC[2], a: fade(lt, 20.0, 20.8) });
  text('All yearly downtime, same bar scale', 110, 730, { size: 22, color: DIM, a: fade(lt, 21.6, 22.4) });
}

// ───────── 场景 5：串联相乘 ─────────
const CHAIN = [['API', SC[1]], ['Database', SC[0]], ['Payments', SC[2]]];
function sceneSeries(lt) {
  header(lt, '05', 'Chained nines', RED, 'Weaker than any single link');
  const bx = [820, 1140, 1460];
  CHAIN.forEach(([n, c], i) => {
    const p = eBack(P(lt, 0.8 + i * 0.4, 1.5 + i * 0.4)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(bx[i] + 130, 260); ctx.scale(clamp(p, 0, 1.05), clamp(p, 0, 1.05)); ctx.translate(-bx[i] - 130, -260);
    glass(bx[i], 200, 260, 120, { accent: c }); text(n, bx[i] + 130, 250, { size: 30, weight: 700, align: 'center' });
    text('99.9%', bx[i] + 130, 296, { size: 26, weight: 700, font: MONO, color: c, align: 'center' });
    ctx.restore();
    if (i < 2) arrow(bx[i] + 270, 260, bx[i + 1] - 10, 260, { color: MUTE, w: 3, a: fade(lt, 1.6 + i * 0.4, 2.2 + i * 0.4), head: 12 });
  });
  // 数据包依次通过
  const pk = P(lt, 7.6, 11.6);
  if (pk > 0 && pk < 1) packet(790, 260, 1730, 260, pk, '#ffffff', { r: 10, trail: 0.06 });
  // 累积可用性
  const cum = [0.999, 0.999 ** 2, 0.999 ** 3], ct = [8.6, 10.0, 11.6];
  cum.forEach((v, i) => {
    const a = fade(lt, ct[i], ct[i] + 0.6); if (a <= 0) return;
    text('Cumulative availability', bx[i] + 130, 372, { size: 20, color: MUTE, align: 'center', a });
    text(`${(v * 100).toFixed(3)}%`, bx[i] + 130, 420, { size: 40, weight: 800, font: MONO, align: 'center', color: i === 2 ? SC[3] : INK, a });
  });
  const fa = fade(lt, 14.7, 15.5);
  text('0.999 × 0.999 × 0.999 ≈ 0.997', 1270, 510, { size: 40, weight: 800, font: MONO, align: 'center', color: SC[3], a: fa });
  // 停机对比
  const ba = fade(lt, 19.6, 20.4), pp = P(lt, 19.6, 21.2);
  glass(SX, 560, SW, 230, { a: ba, accent: RED });
  text('Allowed downtime per year', SX + 30, 606, { size: 22, color: MUTE, a: ba });
  [['One part, 99.9%', 8.76, '8.8 hours', SC[2], 0], ['Whole chain ≈99.7%', 26.25, '≈ 26 hours', RED, 1]].forEach(([l, v, t, c, k]) => {
    const y = 630 + k * 74, bw = 520 * (v / 26.25) * eOut(pp);
    text(l, SX + 30, y + 34, { size: 22, weight: 600, a: ba });
    ctx.save(); ctx.globalAlpha *= ba; ctx.fillStyle = c; glow(c, 14); rr(SX + 280, y + 8, Math.max(bw, 6), 34, 17); ctx.fill(); ctx.restore();
    text(t, SX + 280 + Math.max(bw, 6) + 18, y + 38, { size: 28, weight: 800, font: MONO, color: c, a: ba });
  });
  text('Assumes independent failures; redundancy or a shared data center changes the math', 820, 850, { size: 22, color: DIM, a: fade(lt, 21.4, 22.2) });
  bullet(0, 'Success = all three online', fade(lt, 11.8, 12.6));
  bullet(1, 'Probabilities multiply', fade(lt, 13.4, 14.2));
  statCard(110, 570, 640, 'End-to-end availability', '≈ 99.7%', { color: SC[3], a: fade(lt, 17.0, 17.8) });
  statCard(110, 700, 640, 'Downtime per year', '≈ 26 h', { color: RED, a: fade(lt, 19.8, 20.6), note: 'single: 8.8 h' });
}

// ───────── 推算链通用行 ─────────
function chainRow(lt, y, h, x, w, { name, op, val, unit, color, at, dur = 1.4, prefix = '', suffix = '' }) {
  const a = fade(lt, at, at + 0.5), p = P(lt, at + 0.2, at + 0.2 + dur);
  if (a <= 0) return;
  glass(x, y, w, h, { a, accent: color, r: 20 });
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; glow(color, 14); rr(x + 24, y, 70, 4, 2); ctx.fill(); ctx.restore();
  text(name, x + 30, y + 46, { size: 28, weight: 700, a });
  text(op, x + 30, y + 90, { size: 26, color: MUTE, font: MONO, a });
  text(`${prefix}${fmt(val * eOut(p))}${suffix}`, x + w - 28, y + 66, { size: 54, weight: 800, font: MONO, color, align: 'right', a });
  text(unit, x + w - 28, y + 98, { size: 22, color: MUTE, align: 'right', a });
}

// ───────── 场景 6：QPS 推算链 ─────────
function sceneQps(lt) {
  header(lt, '06', 'The QPS chain', SC[0], 'Twitter as the example');
  const rows = [
    { name: 'Monthly actives (MAU)', op: 'assumption', val: 300, suffix: 'M', unit: 'users', color: SC[1], at: 3.2 },
    { name: 'Daily actives (DAU)', op: '× 50%', val: 150, suffix: 'M', unit: 'users', color: SC[1], at: 5.8 },
    { name: 'Tweets per day', op: '× 2 tweets / user', val: 300, suffix: 'M', unit: 'tweets / day', color: SC[0], at: 9.6 },
    { name: 'Average QPS', op: '÷ 86,400 sec', val: 3500, prefix: '≈ ', unit: 'tweets / sec', color: SC[3], at: 15.4, dur: 3.2 },
    { name: 'Peak QPS', op: '× 2 (peak factor)', val: 7000, prefix: '≈ ', unit: 'tweets / sec', color: SC[2], at: 21.4, dur: 2.2 },
  ];
  rows.forEach((r, i) => chainRow(lt, 175 + i * 140, 112, SX, SW, r));
  for (let i = 0; i < 4; i++) { const a = fade(lt, rows[i + 1].at - 0.3, rows[i + 1].at + 0.2) * 0.8; text('↓', 1320, 175 + i * 140 + 112 + 26, { size: 26, color: DIM, align: 'center', a, weight: 700 }); }
  bullet(0, 'Assumptions first, then derive', fade(lt, 3.0, 3.8));
  statCard(110, 540, 640, 'Average QPS', '≈ 3,500', { color: SC[3], a: fade(lt, 19.2, 20.0), note: 'tweets/sec' });
  statCard(110, 670, 640, 'Peak QPS', '≈ 7,000', { color: SC[2], a: fade(lt, 23.2, 24.0), note: 'tweets/sec' });
}

// ───────── 场景 7：存储推算 ─────────
function sceneStorage(lt) {
  header(lt, '07', 'Storage', SC[4], 'Media dwarfs the text');
  const w = 700;
  const rows = [
    { name: 'Tweets with media', op: '1 in 10', val: 10, suffix: '%', unit: 'share', color: SC[1], at: 2.0 },
    { name: 'Media size each', op: 'assumption', val: 1, suffix: ' MB', unit: 'per item', color: SC[1], at: 4.0 },
    { name: 'Media per day', op: '150M × 2 × 10% × 1 MB', val: 30, suffix: ' TB', unit: 'per day', color: SC[0], at: 7.0, dur: 6.4 },
    { name: 'Five-year total', op: '× 365 × 5', val: 55, prefix: '≈ ', suffix: ' PB', unit: 'cumulative', color: SC[2], at: 15.6, dur: 3.6 },
  ];
  rows.forEach((r, i) => chainRow(lt, 190 + i * 135, 112, SX, w, r));
  // 数据库圆柱：随 5 年总量填满
  const fa = fade(lt, 15.6, 16.4);
  const dbx = 1600, dby = 230, fill = 0.85 * eOut(P(lt, 16.0, 19.4));
  if (fa > 0) {
    dbIcon(dbx, dby, 200, 360, '', { color: SC[2], a: fa, fill });
    text('≈ 55 PB', dbx + 100, dby + 436, { size: 34, weight: 800, font: MONO, color: SC[2], align: 'center', a: fa });
  }
  const na = fade(lt, 22.4, 23.2);
  glass(SX, 740, 1040, 110, { a: na, accent: SC[3] });
  text('Raw data only: replicas, indexes, backups add more', SX + 30, 788, { size: 26, weight: 600, a: na });
  text('For capacity planning, add a 2–4x redundancy factor', SX + 30, 828, { size: 24, color: MUTE, a: na });
  bullet(0, 'Media first, ignore the IDs', fade(lt, 4.2, 5.0));
  statCard(110, 540, 640, 'Per day', '30 TB', { color: SC[0], a: fade(lt, 14.0, 14.8) });
  statCard(110, 670, 640, 'Kept for 5 years', '≈ 55 PB', { color: SC[2], a: fade(lt, 19.6, 20.4), note: '× 1,825 days' });
}

// ───────── 场景 8：峰值与实例数 ─────────
const dayQ = (h) => 2417 + 4583 * Math.exp(-(((h - 20.5) / 3.2) ** 2));
function scenePeak(lt) {
  header(lt, '08', 'Peak and instances', SC[3], 'Budget on average, survive on peak');
  // 曲线面板
  const pa = fade(lt, 0.6, 1.4), cx = SX, cy = 180, cw = SW, ch = 380;
  glass(cx, cy, cw, ch, { a: pa, r: 22 });
  const gx = (h) => cx + 80 + (h / 24) * (cw - 130), gy = (q) => cy + ch - 56 - (q / 8000) * (ch - 100);
  ctx.save(); ctx.globalAlpha *= pa;
  [0, 6, 12, 18, 24].forEach((h) => text(`${h}h`, gx(h), cy + ch - 20, { size: 20, color: MUTE, align: 'center', font: MONO }));
  ctx.restore();
  // 曲线
  const prog = P(lt, 0.8, 4.4);
  ctx.save(); ctx.globalAlpha *= pa; ctx.lineWidth = 5; ctx.strokeStyle = SC[0]; glow(SC[0], 12); ctx.lineJoin = 'round'; ctx.beginPath();
  for (let h = 0; h <= 24 * prog + 1e-6; h += 0.25) { const x = gx(h), y = gy(dayQ(h)); h === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke(); ctx.restore();
  // 平均线 / 峰值线
  const la = fade(lt, 2.0, 2.8), ha = fade(lt, 6.6, 7.4);
  ctx.save(); ctx.setLineDash([8, 8]); ctx.lineWidth = 2.5;
  ctx.globalAlpha = la; ctx.strokeStyle = SC[3]; ctx.beginPath(); ctx.moveTo(gx(0), gy(3500)); ctx.lineTo(gx(24), gy(3500)); ctx.stroke();
  ctx.globalAlpha = ha; ctx.strokeStyle = RED; ctx.beginPath(); ctx.moveTo(gx(0), gy(7000)); ctx.lineTo(gx(24), gy(7000)); ctx.stroke(); ctx.restore();
  text('Average 3,500', gx(0) + 8, gy(3500) - 12, { size: 24, weight: 700, font: MONO, color: SC[3], a: la });
  text('Peak 7,000', gx(0) + 8, gy(7000) - 12, { size: 24, weight: 700, font: MONO, color: RED, a: ha });
  text('Illustrative: writes over one day', cx + cw - 24, cy + 40, { size: 20, color: DIM, align: 'right', a: pa });
  // 实例方块
  const sq = (n, x0, y, color, t0, k = 0) => { for (let i = 0; i < n; i++) { const a = eBack(P(lt, t0 + i * 0.06, t0 + 0.4 + i * 0.06)); if (a <= 0) continue; ctx.save(); ctx.globalAlpha *= clamp(a); ctx.translate(x0 + i * 38 + 15, y + 15); ctx.scale(a, a); glow(color, 10); ctx.fillStyle = color + 'cc'; rr(-15, -15, 30, 30, 7); ctx.fill(); ctx.restore(); } };
  const ra = fade(lt, 3.2, 4.0);
  text('Buy for average: 3,500 ÷ 350', SX, 620, { size: 24, weight: 600, a: ra });
  text('10 instances', SX + SW, 620, { size: 28, weight: 800, font: MONO, color: SC[3], align: 'right', a: ra });
  sq(10, SX + 4, 636, SC[3], 3.6);
  const bad = fade(lt, 7.0, 7.8);
  text('Short at peak', SX + 4 + 10 * 38 + 14, 662, { size: 24, weight: 700, color: RED, a: bad });
  const rb = fade(lt, 8.0, 8.8);
  text('Buy for peak: 7,000 ÷ 350', SX, 730, { size: 24, weight: 600, a: rb });
  text('20 + 6 ≈ 26 instances', SX + SW, 730, { size: 28, weight: 800, font: MONO, color: SC[4], align: 'right', a: rb });
  sq(20, SX + 4, 746, SC[4], 8.8);
  sq(6, SX + 4 + 20 * 38 + 10, 746, SC[3], 11.3);
  text('+30% headroom', SX + 4 + 20 * 38 + 10, 806, { size: 22, color: SC[3], a: fade(lt, 11.5, 12.3) });
  text('350 QPS per instance would come from load tests; assumed here', SX, 870, { size: 22, color: DIM, a: fade(lt, 13.0, 13.8) });
  bullet(0, '1 instance = 350 QPS', fade(lt, 3.8, 4.6));
  statCard(110, 540, 640, 'Instances needed', '≈ 26', { color: SC[4], a: fade(lt, 12.0, 12.8), note: '20 + headroom' });
  statCard(110, 670, 640, 'Posts per user per day: 2 → 10', 'QPS × 5', { color: SC[2], a: fade(lt, 16.0, 16.8), note: 'storage × 5 too' });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('Estimation', 110, 296, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Back-of-the-Envelope', 112, 196, { size: 34, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['10⁵', 1450], ['3,500', 1620], ['55 PB', 1650]].forEach(([s, x], k) => {
    text(s, x, 190 + k * 56, { size: 40, weight: 800, font: MONO, color: DIM, a: fade(lt, 0.6 + k * 0.3, 1.4 + k * 0.3) * 0.8 });
  });
  [['Assumptions', 'Written down, easy to swap', SC[1]], ['Units', 'Write 5 MB, not just 5', SC[0]], ['Peak', 'Average to budget, peak to survive', SC[2]]].forEach(([w, s, c], k) => {
    const t0 = 1.8 + k * 0.9, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 400, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 400, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 460, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 546, { size: 70, weight: 800 });
    text(s, x + 36, 600, { size: 26, color: MUTE });
    ctx.restore();
  });
  const aa = fade(lt, 6.4, 7.2);
  text('90-second interview template', 110, 710, { size: 24, color: MUTE, a: aa });
  let bx = 110;
  ['Confirm goal', 'List assumptions', 'Average and peak', 'Capacity', 'Back to design'].forEach((s, k) => {
    const a = fade(lt, 6.6 + k * 0.3, 7.4 + k * 0.3);
    const w = badge(bx, 740, s, ['#8b8dfc', SC[1], SC[3], SC[4], SC[0]][k], a);
    if (k < 4) text('›', bx + w + 12, 776, { size: 28, color: DIM, a, align: 'center' });
    bx += w + 28;
  });
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  // 右侧：量级阶梯逐级长高
  const labs = ['10³', '10⁶', '10⁹', '10¹²', '10¹⁵'];
  labs.forEach((s, i) => {
    const p = eOut(P(lt, 1.2 + i * 0.45, 2.4 + i * 0.45)), x = 1230 + i * 118, h = 90 + i * 100 * p + (p ? 0 : 0);
    const hh = (90 + i * 105) * p;
    ctx.save(); ctx.fillStyle = SC[i] + 'cc'; glow(SC[i], 20); rr(x, 820 - hh, 84, Math.max(hh, 2), 14); ctx.fill(); ctx.restore();
    text(s, x + 42, 860, { size: 26, weight: 800, font: MONO, color: SC[i], align: 'center', a: p });
    void h;
  });
  text('SYSTEM DESIGN INTERVIEW · ANIMATED GUIDE', 110, 360, { size: 28, weight: 600, color: SC[0], ls: 5, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 0.4, 1.4)); ctx.translate(0, (1 - eOut(P(lt, 0.4, 1.4))) * 30);
  let fs = 110; ctx.font = `900 ${fs}px ${SANS}`; ctx.letterSpacing = '2px';
  const tw = ctx.measureText('Back-of-the-Envelope').width; if (tw > 1050) fs = Math.floor(fs * 1050 / tw);
  ctx.font = `900 ${fs}px ${SANS}`; ctx.fillStyle = g; ctx.fillText('Back-of-the-Envelope', 104, 500); ctx.fillText('Estimation', 104, 500 + fs * 1.1); ctx.restore();
  text('Chapter 2', 112, 500 + fs * 1.1 + 90, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

export const scenes = { title: sceneTitle, power: scenePower, round: sceneRound, latency: sceneLatency, nines: sceneNines, series: sceneSeries, qps: sceneQps, storage: sceneStorage, peak: scenePeak, end: sceneEnd };
