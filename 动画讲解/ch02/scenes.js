// 第 2 章 数量级估算：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, packet, statCard, bullet, dbIcon } from '../lib/core.js';

export const meta = { no: 2, title: '数量级估算', en: 'Back-of-the-Envelope Estimation' };

const fmt = (n) => Math.round(n).toLocaleString('en-US');
const rollN = (v, p) => fmt(v * eOut(clamp(p)));
const fade = (lt, a, b = a + 0.7) => eOut(P(lt, a, b));
const SX = 800, SW = 1040; // 舞台行的左边界与宽度

// 一行玻璃卡（舞台通用）：返回 {x,y,w,h}
function rowCard(y, h, color, a = 1, hot = false) {
  glass(SX, y, SW, h, { a, accent: hot ? RED : color, r: 20 });
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = hot ? RED : color; glow(hot ? RED : color, 14); rr(SX + 24, y, 70, 4, 2); ctx.fill(); ctx.restore();
}

// ───────── 场景 1：2 的幂 ─────────
const POW = [
  { e: 10, ap: '≈ 1 千', u: 'KB' }, { e: 20, ap: '≈ 1 百万', u: 'MB' }, { e: 30, ap: '≈ 10 亿', u: 'GB' },
  { e: 40, ap: '≈ 1 万亿', u: 'TB' }, { e: 50, ap: '≈ 1 千万亿', u: 'PB' },
];
const POW_T = [2.9, 4.9, 6.9, 8.7, 10.5];
const SUP = { 10: '¹⁰', 20: '²⁰', 30: '³⁰', 40: '⁴⁰', 50: '⁵⁰' };
function scenePower(lt) {
  header(lt, '01', '2 的幂', SC[0], '每多 10 位，放大约 1,000 倍');
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
    const ua = fade(lt, 15.6 + i * 0.5, 16.2 + i * 0.5);
    if (ua > 0) { text(r.u, 1790, y + 68, { size: 34, weight: 800, font: MONO, color: SC[i], align: 'center', a: ua }); }
  });
  // ×1,000 连接
  for (let i = 0; i < 4; i++) {
    const a = fade(lt, 12.6 + i * 0.35, 13.2 + i * 0.35);
    text('↓ ×1,000', 1070, 190 + i * 140 + 104 + 28, { size: 22, weight: 700, font: MONO, color: SC[3], align: 'center', a });
  }
  bullet(0, '十位 ≈ 一千倍', fade(lt, 12.6, 13.4));
  statCard(110, 540, 640, '2³⁰ 精确值', rollN(1073741824, P(lt, 6.9, 8.2)), { color: SC[2], a: fade(lt, 6.9, 7.6) });
  text('先声明口径：KB 十进制，KiB 1024 进制', 110, 710, { size: 22, color: MUTE, a: fade(lt, 16.8, 17.6) });
}

// ───────── 场景 2：心算技巧 ─────────
function sceneRound(lt) {
  header(lt, '02', '心算技巧', SC[1], '先近似，再计算');
  // 面板 A
  const aa = fade(lt, 1.6, 2.4);
  glass(SX, 190, SW, 300, { a: aa, accent: SC[1] });
  text('1 天有多少秒', SX + 36, 244, { size: 26, color: MUTE, a: aa });
  const pa = eIO(P(lt, 3.4, 6.2));
  const secs = lerp(86400, 100000, pa);
  text(fmt(secs), SX + 36, 350, { size: 76, weight: 800, font: MONO, a: aa, color: pa > 0.98 ? SC[1] : INK });
  text('秒', SX + 36 + 76 * 0.62 * 7 + 30, 350, { size: 30, color: MUTE, a: aa });
  const fa = fade(lt, 6.0, 6.8);
  text('≈ 10⁵ 秒', 1500, 350, { size: 52, weight: 800, font: MONO, color: SC[1], align: 'center', a: fa });
  // 条：86,400 vs 100,000
  const bw = 940;
  ctx.save(); ctx.globalAlpha *= aa; rr(SX + 36, 396, bw, 30, 15); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
  ctx.fillStyle = SC[1]; glow(SC[1], 14); rr(SX + 36, 396, Math.max(30, bw * (secs / 100000)), 30, 15); ctx.fill(); ctx.restore();
  text('86,400 → 10⁵：只高估了不到 16%', SX + 36, 466, { size: 22, color: MUTE, a: fa });
  // 面板 B
  const ba = fade(lt, 8.6, 9.4);
  glass(SX, 520, SW, 340, { a: ba, accent: SC[3] });
  text('复杂算式先四舍五入', SX + 36, 574, { size: 26, color: MUTE, a: ba });
  text('99,987 ÷ 9.1', SX + 36, 650, { size: 52, weight: 800, font: MONO, a: ba, color: lt > 12 ? DIM : INK });
  const r1 = fade(lt, 12.2, 13.0);
  arrow(SX + 420, 636, SX + 520, 636, { color: SC[3], p: eOut(P(lt, 12.2, 12.9)), a: ba });
  text('100,000 ÷ 10', SX + 548, 650, { size: 52, weight: 800, font: MONO, color: SC[3], a: r1 });
  const r2 = fade(lt, 14.0, 14.8);
  text('= 10,000', SX + 548, 730, { size: 60, weight: 800, font: MONO, color: SC[3], a: r2 });
  text(`精确值约 ${fmt(99987 / 9.1)}，同一量级`, SX + 36, 800, { size: 24, color: MUTE, a: fade(lt, 15.2, 16) });
  bullet(0, '1 天 ≈ 10⁵ 秒', fade(lt, 3.0, 3.7));
  bullet(1, '过程比小数点重要', fade(lt, 15.4, 16.2));
  statCard(110, 560, 640, '两处近似的误差', '< 16%', { color: SC[1], a: fade(lt, 15.4, 16.2), note: '仍是同一量级' });
}

// ───────── 场景 3：延迟数字 ─────────
const LAT = [
  { n: 'L1 缓存', ns: 0.5, t: '0.5 ns', c: SC[0], at: 2.4 },
  { n: 'L2 缓存', ns: 7, t: '7 ns', c: SC[0], at: 3.2 },
  { n: '主内存', ns: 100, t: '100 ns', c: SC[0], at: 4.6 },
  { n: 'SSD 随机读', ns: 150e3, t: '150 µs', c: SC[3], at: 6.6 },
  { n: '数据中心内往返', ns: 500e3, t: '500 µs', c: SC[1], at: 7.9 },
  { n: 'HDD 随机寻道', ns: 10e6, t: '10 ms', c: RED, at: 9.3 },
  { n: '跨地域往返', ns: 150e6, t: '150 ms', c: SC[1], at: 11.6 },
];
const lx = (ns) => 1060 + (500 * (Math.log10(ns) + 1)) / 9.5;
function sceneLatency(lt) {
  header(lt, '03', '延迟数字', SC[3], '用对数刻度比量级');
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
    text(r.n, 810, y + 38, { size: 26, weight: 600, a });
    const bw = (lx(r.ns) - 1060) * eOut(p);
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = r.c; glow(r.c, 14); rr(1060, y + 14, Math.max(bw, 6), 36, 18); ctx.fill(); ctx.restore();
    text(r.t, 1060 + Math.max(bw, 6) + 16, y + 42, { size: 28, weight: 700, font: MONO, color: r.c === SC[0] ? SC[0] : r.c, a: a * fade(lt, r.at + 0.5, r.at + 1.1) });
  });
  text('2020 年参考量级，非厂商 SLA；实测要看硬件与负载', 810, 880, { size: 22, color: DIM, a: fade(lt, 12.5, 13.3) });
  const hdd = P(lt, 9.8, 12.2);
  statCard(110, 560, 640, 'HDD 寻道 ÷ 主内存', `${rollN(100000, hdd)} 倍`, { color: RED, a: fade(lt, 9.6, 10.3) });
  statCard(110, 690, 640, 'SSD 随机读 ÷ 主内存', `${rollN(1500, P(lt, 7.0, 8.4))} 倍`, { color: SC[3], a: fade(lt, 6.8, 7.5) });
  bullet(0, '内存快，磁盘慢', fade(lt, 14.0, 14.8));
  bullet(1, '尽量避免磁盘寻道', fade(lt, 16.4, 17.2));
}

// ───────── 场景 4：几个 9 ─────────
const NINES = [
  { p: '99%', k: '两个 9', min: 5256, v: 3.65, dp: 2, u: '天', at: 2.9, c: SC[3] },
  { p: '99.9%', k: '三个 9', min: 525.6, v: 8.8, dp: 1, u: '小时', at: 5.9, c: SC[2] },
  { p: '99.99%', k: '四个 9', min: 52.56, v: 52, dp: 0, u: '分钟', at: 8.3, c: SC[1] },
  { p: '99.999%', k: '五个 9', min: 5.256, v: 5.3, dp: 1, u: '分钟', at: 10.7, c: SC[0] },
  { p: '99.9999%', k: '六个 9', min: 0.5256, v: 31.56, dp: 2, u: '秒', at: 13.1, c: SC[4] },
];
function sceneNines(lt) {
  header(lt, '04', '几个 9', SC[2], '一年里允许停多久');
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
    const a = fade(lt, 16.3 + i * 0.3, 16.9 + i * 0.3);
    text('↓ ÷10', 1070, 190 + i * 140 + 104 + 28, { size: 22, weight: 700, font: MONO, color: MUTE, align: 'left', a });
  }
  const fa = fade(lt, 2.0, 2.8);
  text('年停机分钟 ≈', 110, 440, { size: 24, color: MUTE, a: fa });
  text('365×24×60×(1 − 可用性)', 110, 488, { size: 30, weight: 700, font: MONO, a: fa });
  statCard(110, 560, 640, '每多一个 9', '停机 ÷ 10', { color: SC[2], a: fade(lt, 16.2, 17) });
  text('全部按每年停机时间计，条长同一刻度', 110, 730, { size: 22, color: DIM, a: fade(lt, 17.6, 18.4) });
}

// ───────── 场景 5：串联相乘 ─────────
const CHAIN = [['API', SC[1]], ['数据库', SC[0]], ['第三方支付', SC[2]]];
function sceneSeries(lt) {
  header(lt, '05', '串联相乘', RED, '链路比任何一环都脆');
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
  const pk = P(lt, 5.4, 9.2);
  if (pk > 0 && pk < 1) packet(790, 260, 1730, 260, pk, '#ffffff', { r: 10, trail: 0.06 });
  // 累积可用性
  const cum = [0.999, 0.999 ** 2, 0.999 ** 3], ct = [6.4, 7.8, 9.4];
  cum.forEach((v, i) => {
    const a = fade(lt, ct[i], ct[i] + 0.6); if (a <= 0) return;
    text('累积可用性', bx[i] + 130, 372, { size: 20, color: MUTE, align: 'center', a });
    text(`${(v * 100).toFixed(3)}%`, bx[i] + 130, 420, { size: 40, weight: 800, font: MONO, align: 'center', color: i === 2 ? SC[3] : INK, a });
  });
  const fa = fade(lt, 12.6, 13.4);
  text('0.999 × 0.999 × 0.999 ≈ 0.997', 1270, 510, { size: 40, weight: 800, font: MONO, align: 'center', color: SC[3], a: fa });
  // 停机对比
  const ba = fade(lt, 17.0, 17.8), pp = P(lt, 17.0, 18.6);
  glass(SX, 560, SW, 230, { a: ba, accent: RED });
  text('一年允许停机', SX + 30, 606, { size: 22, color: MUTE, a: ba });
  [['单个组件 99.9%', 8.76, '8.8 小时', SC[2], 0], ['整条链路 ≈99.7%', 26.25, '≈ 26 小时', RED, 1]].forEach(([l, v, t, c, k]) => {
    const y = 630 + k * 74, bw = 520 * (v / 26.25) * eOut(pp);
    text(l, SX + 30, y + 34, { size: 24, weight: 600, a: ba });
    ctx.save(); ctx.globalAlpha *= ba; ctx.fillStyle = c; glow(c, 14); rr(SX + 280, y + 8, Math.max(bw, 6), 34, 17); ctx.fill(); ctx.restore();
    text(t, SX + 280 + Math.max(bw, 6) + 18, y + 38, { size: 28, weight: 800, font: MONO, color: c, a: ba });
  });
  text('前提：故障相互独立，三者缺一不可；冗余或共用机房要另算', 820, 850, { size: 22, color: DIM, a: fade(lt, 18.2, 19) });
  bullet(0, '成功 = 三者同时在线', fade(lt, 9.4, 10.2));
  bullet(1, '概率相乘，只会更低', fade(lt, 11.6, 12.4));
  statCard(110, 570, 640, '端到端可用性', '≈ 99.7%', { color: SC[3], a: fade(lt, 14.8, 15.6) });
  statCard(110, 700, 640, '一年停机', '≈ 26 小时', { color: RED, a: fade(lt, 17.0, 17.8), note: '单个 8.8' });
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
  header(lt, '06', 'QPS 推算链', SC[0], '以 Twitter 为例');
  const rows = [
    { name: '月活 MAU', op: '假设', val: 300, suffix: 'M', unit: '用户', color: SC[1], at: 3.1 },
    { name: '日活 DAU', op: '× 50%', val: 150, suffix: 'M', unit: '用户', color: SC[1], at: 4.6 },
    { name: '每天推文', op: '× 2 条 / 人', val: 300, suffix: 'M', unit: '条 / 天', color: SC[0], at: 6.8 },
    { name: '平均 QPS', op: '÷ 86,400 秒', val: 3500, prefix: '≈ ', unit: '条 / 秒', color: SC[3], at: 10.2, dur: 2.2 },
    { name: '峰值 QPS', op: '× 2（峰值系数）', val: 7000, prefix: '≈ ', unit: '条 / 秒', color: SC[2], at: 15.8, dur: 2.2 },
  ];
  rows.forEach((r, i) => chainRow(lt, 175 + i * 140, 112, SX, SW, r));
  for (let i = 0; i < 4; i++) { const a = fade(lt, rows[i + 1].at - 0.3, rows[i + 1].at + 0.2) * 0.8; text('↓', 1320, 175 + i * 140 + 112 + 26, { size: 26, color: DIM, align: 'center', a, weight: 700 }); }
  bullet(0, '先写假设，再逐步推', fade(lt, 2.4, 3.2));
  statCard(110, 540, 640, '平均 QPS', '≈ 3,500', { color: SC[3], a: fade(lt, 14.4, 15.2), note: '条/秒' });
  statCard(110, 670, 640, '峰值 QPS', '≈ 7,000', { color: SC[2], a: fade(lt, 18.2, 19.0), note: '条/秒' });
}

// ───────── 场景 7：存储推算 ─────────
function sceneStorage(lt) {
  header(lt, '07', '存储推算', SC[4], '媒体体积远大于文字');
  const w = 700;
  const rows = [
    { name: '含媒体的推文', op: '每 10 条有 1 条', val: 10, suffix: '%', unit: '占比', color: SC[1], at: 2.4 },
    { name: '每条媒体大小', op: '假设', val: 1, suffix: ' MB', unit: '每条', color: SC[1], at: 4.6 },
    { name: '每天媒体存储', op: '150M × 2 × 10% × 1 MB', val: 30, suffix: ' TB', unit: '每天', color: SC[0], at: 6.4, dur: 3.6 },
    { name: '保存 5 年', op: '× 365 × 5', val: 55, prefix: '≈ ', suffix: ' PB', unit: '累计', color: SC[2], at: 12.6, dur: 3.4 },
  ];
  rows.forEach((r, i) => chainRow(lt, 190 + i * 135, 112, SX, w, r));
  // 数据库圆柱：随 5 年总量填满
  const fa = fade(lt, 12.6, 13.4);
  const dbx = 1600, dby = 230, fill = 0.85 * eOut(P(lt, 13.0, 16.2));
  if (fa > 0) {
    dbIcon(dbx, dby, 200, 360, '', { color: SC[2], a: fa, fill });
    text('≈ 55 PB', dbx + 100, dby + 436, { size: 34, weight: 800, font: MONO, color: SC[2], align: 'center', a: fa });
  }
  const na = fade(lt, 18.4, 19.2);
  glass(SX, 740, 1040, 110, { a: na, accent: SC[3] });
  text('只算了裸数据：副本、缩略图、索引、备份还要再乘', SX + 30, 788, { size: 26, weight: 600, a: na });
  text('容量规划可再乘 2 ～ 4 倍冗余系数', SX + 30, 828, { size: 24, color: MUTE, a: na });
  bullet(0, '先算媒体，别被 ID 干扰', fade(lt, 4.0, 4.8));
  statCard(110, 540, 640, '每天', '30 TB', { color: SC[0], a: fade(lt, 11.8, 12.6) });
  statCard(110, 670, 640, '保存 5 年', '≈ 55 PB', { color: SC[2], a: fade(lt, 16.9, 17.7), note: '× 1,825 天' });
}

// ───────── 场景 8：峰值与实例数 ─────────
const dayQ = (h) => 2417 + 4583 * Math.exp(-(((h - 20.5) / 3.2) ** 2));
function scenePeak(lt) {
  header(lt, '08', '峰值与实例数', SC[3], '平均算账，峰值保命');
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
  const la = fade(lt, 2.4, 3.2), ha = fade(lt, 6.4, 7.2);
  ctx.save(); ctx.setLineDash([8, 8]); ctx.lineWidth = 2.5;
  ctx.globalAlpha = la; ctx.strokeStyle = SC[3]; ctx.beginPath(); ctx.moveTo(gx(0), gy(3500)); ctx.lineTo(gx(24), gy(3500)); ctx.stroke();
  ctx.globalAlpha = ha; ctx.strokeStyle = RED; ctx.beginPath(); ctx.moveTo(gx(0), gy(7000)); ctx.lineTo(gx(24), gy(7000)); ctx.stroke(); ctx.restore();
  text('平均 3,500', gx(0) + 8, gy(3500) - 12, { size: 24, weight: 700, font: MONO, color: SC[3], a: la });
  text('峰值 7,000', gx(0) + 8, gy(7000) - 12, { size: 24, weight: 700, font: MONO, color: RED, a: ha });
  text('示意：一天的写入曲线', cx + cw - 24, cy + 40, { size: 20, color: DIM, align: 'right', a: pa });
  // 实例方块
  const sq = (n, x0, y, color, t0, k = 0) => { for (let i = 0; i < n; i++) { const a = eBack(P(lt, t0 + i * 0.06, t0 + 0.4 + i * 0.06)); if (a <= 0) continue; ctx.save(); ctx.globalAlpha *= clamp(a); ctx.translate(x0 + i * 38 + 15, y + 15); ctx.scale(a, a); glow(color, 10); ctx.fillStyle = color + 'cc'; rr(-15, -15, 30, 30, 7); ctx.fill(); ctx.restore(); } };
  const ra = fade(lt, 2.6, 3.4);
  text('按平均买：3,500 ÷ 350', SX, 620, { size: 24, weight: 600, a: ra });
  text('10 台', SX + SW, 620, { size: 28, weight: 800, font: MONO, color: SC[3], align: 'right', a: ra });
  sq(10, SX + 4, 636, SC[3], 3.0);
  const bad = fade(lt, 7.0, 7.8);
  text('峰值时不够', SX + 4 + 10 * 38 + 14, 662, { size: 24, weight: 700, color: RED, a: bad });
  const rb = fade(lt, 7.6, 8.4);
  text('按峰值买：7,000 ÷ 350', SX, 730, { size: 24, weight: 600, a: rb });
  text('20 + 6 ≈ 26 台', SX + SW, 730, { size: 28, weight: 800, font: MONO, color: SC[4], align: 'right', a: rb });
  sq(20, SX + 4, 746, SC[4], 8.0);
  sq(6, SX + 4 + 20 * 38 + 10, 746, SC[3], 10.2);
  text('+30% 余量', SX + 4 + 20 * 38 + 10, 806, { size: 22, color: SC[3], a: fade(lt, 10.4, 11.2) });
  text('350 QPS / 台 来自压测，此处为假设', SX, 870, { size: 22, color: DIM, a: fade(lt, 11.4, 12.2) });
  bullet(0, '单实例稳定 350 QPS', fade(lt, 4.2, 5.0));
  statCard(110, 540, 640, '所需实例', '≈ 26 台', { color: SC[4], a: fade(lt, 10.0, 10.8), note: '20 + 余量' });
  statCard(110, 670, 640, '每人每天 2 → 10 次', 'QPS × 5', { color: SC[2], a: fade(lt, 14.4, 15.2), note: '存储也 × 5' });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('数量级估算', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Back-of-the-Envelope Estimation', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['10⁵', 1450], ['3,500', 1620], ['55 PB', 1650]].forEach(([s, x], k) => {
    text(s, x, 190 + k * 56, { size: 40, weight: 800, font: MONO, color: DIM, a: fade(lt, 0.6 + k * 0.3, 1.4 + k * 0.3) * 0.8 });
  });
  [['假设', '写下来，一个参数可替换', SC[1]], ['单位', '写 5 MB，不要只写 5', SC[0]], ['峰值', '平均算账，峰值保命', SC[2]]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.5, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 400, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 400, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 460, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 546, { size: 70, weight: 800 });
    text(s, x + 36, 600, { size: 26, color: MUTE });
    ctx.restore();
  });
  const aa = fade(lt, 6.0, 6.8);
  text('90 秒面试模板', 110, 710, { size: 24, color: MUTE, a: aa });
  let bx = 110;
  ['确认目标', '列假设', '算平均与峰值', '算容量', '回到设计'].forEach((s, k) => {
    const a = fade(lt, 6.2 + k * 0.3, 7 + k * 0.3);
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
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 0.4, 1.4)); ctx.translate(0, (1 - eOut(P(lt, 0.4, 1.4))) * 30);
  ctx.font = `900 150px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('数量级估算', 104, 520); ctx.restore();
  text('Back-of-the-Envelope Estimation', 112, 590, { size: 36, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 2 章', 112, 680, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

export const scenes = { title: sceneTitle, power: scenePower, round: sceneRound, latency: sceneLatency, nines: sceneNines, series: sceneSeries, qps: sceneQps, storage: sceneStorage, peak: scenePeak, end: sceneEnd };
