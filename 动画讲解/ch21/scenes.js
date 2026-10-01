// 第 21 章 广告点击事件聚合：场景定义
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 21, title: '广告点击事件聚合', en: 'Ad Click Event Aggregation' };

const A = (lt, a, b) => eOut(P(lt, a, b));
const pad2 = (n) => String(n).padStart(2, '0');
const hms = (s) => `12:${pad2(Math.floor(s / 60))}:${pad2(Math.floor(s % 60))}`;
// 角色配色（全片统一）：事件=粉，队列=琥珀，聚合/计算=靛，库=青，成功=青柠，失败=红
const C_EV = SC[2], C_Q = SC[3], C_AGG = SC[1], C_DB = SC[0], C_OK = SC[4];

function ring(x, y, r, color, a = 1, w = 4) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = w; glow(color, 14);
  ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.restore();
}
function evDot(x, y, label, color, { r = 18, a = 1, rg = null } = {}) {
  if (a <= 0) return;
  dot(x, y, r, color, { g: 14, a });
  if (rg) ring(x, y, r + 8, rg, a);
  text(label, x, y + 7, { size: 20, weight: 800, align: 'center', font: MONO, color: '#06080f', a });
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = A(lt, 0.2, 1.2);
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 1000, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = A(lt, 0.4, 1.4); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 130px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('广告点击聚合', 104, 520); ctx.restore();
  text('Ad Click Event Aggregation', 112, 590, { size: 36, color: MUTE, font: MONO, a: A(lt, 0.8, 1.6) });
  text('第 21 章', 112, 680, { size: 34, weight: 700, a: A(lt, 1.2, 2) });
  // 右侧：点击落进三个一分钟窗口
  const bx = (k) => 1120 + k * 230, by = 330, bh = 360;
  const cnt = [0, 0, 0];
  for (let i = 0; i < 30; i++) { const b = i % 3, t0 = 1.8 + i * 0.15; if (lt >= t0 + 0.7) cnt[b]++; }
  for (let k = 0; k < 3; k++) {
    const ba = A(lt, 0.5 + k * 0.2, 1.3 + k * 0.2);
    glass(bx(k), by, 200, bh, { a: ba, accent: SC[0] });
    text(`12:0${k}`, bx(k) + 100, by - 14, { size: 24, color: MUTE, font: MONO, align: 'center', a: ba });
    text(String(cnt[k]), bx(k) + 100, by + 78, { size: 56, weight: 800, font: MONO, align: 'center', color: SC[0], a: ba });
  }
  for (let i = 0; i < 30; i++) {
    const b = i % 3, c = Math.floor(i / 3), t0 = 1.8 + i * 0.15, p = P(lt, t0, t0 + 0.7);
    if (p <= 0) continue;
    const tx = bx(b) + 28 + (c % 5) * 36, ty = by + bh - 34 - Math.floor(c / 5) * 36;
    const x = lerp(tx + (rnd(i) - 0.5) * 60, tx, eOut(p)), y = lerp(200, ty, p * p);
    dot(x, y, 11, C_EV, { g: 10, a: clamp(p * 4) });
  }
  const lp = P(lt, 5.4, 6.4);
  if (lp > 0) {
    const tx = bx(0) + 28 + 2 * 36, ty = by + bh - 34 - 2 * 36 - 36;
    dot(lerp(bx(0) + 100, tx, eOut(lp)), lerp(200, ty, eIO(lp)), 12, C_Q, { g: 18, a: clamp(lp * 4) });
    if (lp >= 1) text('迟到的点击也被接住', bx(0), by + bh + 50, { size: 24, color: C_Q, weight: 700, a: A(lt, 6.4, 7.0) });
  }
}

// ───────── 01 规模估算 ─────────
function sceneScale(lt) {
  header(lt, '01', '规模估算', SC[1], '书中的粗略数字');
  statCard(110, 430, 640, '每天点击', '10 亿', { color: C_EV, a: A(lt, 2.6, 3.2) });
  statCard(110, 560, 640, '平均 QPS', '≈ 1 万', { color: SC[0], a: A(lt, 5.8, 6.4) });
  statCard(110, 690, 640, '峰值 QPS（平均的 5 倍）', '5 万', { color: C_Q, a: A(lt, 8.8, 9.4) });
  const la = A(lt, 2.4, 3.2);
  text('点击事件流', 830, 230, { size: 26, color: MUTE, a: la });
  ctx.save(); ctx.globalAlpha *= la; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; ctx.setLineDash([4, 10]);
  ctx.beginPath(); ctx.moveTo(830, 340); ctx.lineTo(1800, 340); ctx.stroke(); ctx.restore();
  const tgt = 4 + 5 * eIO(P(lt, 5.8, 6.6)) + 31 * eIO(P(lt, 8.8, 9.8));
  for (let k = 0; k < 40; k++) {
    const u = (((k * 0.618034) % 1) + lt * 0.28) % 1, x = 830 + u * 970, y = 340 + Math.sin(k * 2.3) * 22;
    dot(x, y, 7, lt > 8.8 ? C_Q : C_EV, { g: 10, a: clamp(tgt - k) * la * Math.sin(u * Math.PI) });
  }
  const r1 = A(lt, 5.8, 6.6) * (1 - A(lt, 8.8, 9.6)), r2 = A(lt, 8.8, 9.6);
  text('≈ 10,000 次 / 秒', 1800, 270, { size: 34, weight: 800, font: MONO, align: 'right', color: SC[0], a: r1 });
  text('50,000 次 / 秒（峰值）', 1800, 270, { size: 34, weight: 800, font: MONO, align: 'right', color: C_Q, a: r2 });
  [['每条事件', '0.1 KB', 12.4, C_EV], ['每天', '≈ 100 GB', 14.6, SC[1]], ['每月', '≈ 3 TB', 16.6, SC[0]]].forEach(([l, v, t0, c], k) => {
    const a = A(lt, t0, t0 + 0.6), x = 830 + k * 350;
    glass(x, 500, 300, 150, { a, accent: c });
    text(l, x + 28, 550, { size: 24, color: MUTE, a });
    text(v, x + 28, 620, { size: 46, weight: 800, font: MONO, color: c, a });
    if (k < 2) arrow(x + 308, 575, x + 342, 575, { color: MUTE, a, w: 3, head: 10 });
  });
  const da = A(lt, 18.4, 19.2);
  dbIcon(950, 730, 120, 130, '原始事件 · 留底', { color: SC[0], a: da, fill: 0.9 * P(lt, 18.4, 19.8) });
  dbIcon(1500, 790, 70, 70, '聚合结果 · 小得多', { color: SC[0], a: da, fill: 0.5 * P(lt, 19.4, 20.4) });
  text('示意对比', 1760, 880, { size: 20, color: DIM, align: 'right', a: da });
}

// ───────── 02 事件流 ─────────
function scenePipe(lt) {
  header(lt, '02', '点击事件流', SC[2], '队列 → 聚合 → 队列 → 库');
  const y = 330, cy = 395;
  const a1 = A(lt, 0.8, 1.4), a2 = A(lt, 3.0, 3.6), a3 = A(lt, 6.4, 7.0), a4 = A(lt, 12.0, 12.6), a5 = A(lt, 14.4, 15.0);
  box(820, y, 140, 130, '用户点击', { color: C_EV, a: a1, size: 26 });
  box(1010, y, 150, 130, '消息队列', { color: C_Q, a: a2, size: 26, sub: 'Kafka' });
  box(1210, y, 170, 130, '聚合服务', { color: C_AGG, a: a3, size: 28 });
  box(1430, y, 150, 130, '消息队列', { color: C_Q, a: a4, size: 26, sub: 'Kafka' });
  const down = lt > 17.2;
  dbIcon(1650, y - 10, 110, 130, '结果库', { color: down ? RED : C_DB, a: a5 });
  const segs = [[960, 1010, 3.0], [1160, 1210, 6.4], [1380, 1430, 12.0], [1580, 1650, 14.4]];
  segs.forEach(([x1, x2, t0], i) => {
    arrow(x1, cy, x2, cy, { color: MUTE, w: 3, head: 11, p: eOut(P(lt, t0 - 0.2, t0 + 0.3)) });
    const stop = i === 3 && down;
    if (lt > t0 + 0.3 && !stop) for (let k = 0; k < 2; k++) {
      const p = ((lt * 0.9 + k / 2 + i * 0.2) % 1);
      packet(x1 - 40, cy, x2 + 10, cy, p, i === 2 ? C_Q : C_EV, { r: 8 });
    }
  });
  // 聚合服务里的分钟计数
  if (lt > 7.6) {
    const n = Math.floor((lt * 2.5) % 5);
    text(`每分钟 · 计数`, 1295, y + 160, { size: 22, color: C_AGG, align: 'center', a: A(lt, 7.6, 8.4) });
  }
  // 两个队列里装的数据
  const ca = A(lt, 4.2, 5.0), cb = A(lt, 12.6, 13.4);
  glass(820, 600, 520, 110, { a: ca, accent: C_Q });
  text('第一队列：点击事件', 848, 642, { size: 22, color: MUTE, a: ca });
  text('ad_id · 时间 · user_id · ip · country', 848, 686, { size: 22, font: MONO, a: ca });
  glass(1370, 600, 450, 110, { a: cb, accent: C_Q });
  text('第二队列：每分钟聚合', 1398, 642, { size: 22, color: MUTE, a: cb });
  text('ad_id · 分钟 · count', 1398, 686, { size: 22, font: MONO, a: cb });
  // 下游故障：队列积压，上游照常
  const fa = A(lt, 17.2, 18.0);
  if (fa > 0) {
    if (lt < 17.6) ring(1705, y + 55, 70, RED, 1 - P(lt, 17.2, 17.6));
    text('下游挂了', 1705, 540, { size: 26, weight: 700, color: RED, align: 'center', a: fa });
    const depth = P(lt, 17.6, 21);
    rr(1430, 480, 150, 16, 8); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fill();
    ctx.fillStyle = C_Q; glow(C_Q, 12); rr(1430, 480, Math.max(8, 150 * depth), 16, 8); ctx.fill(); ctx.shadowBlur = 0;
    text('积压', 1505, 530, { size: 22, color: C_Q, align: 'center', a: fa });
    text('消息留在队列里，上游照常写入', 820, 790, { size: 28, weight: 600, a: A(lt, 18.2, 19) });
  }
  bullet(0, '用队列异步解耦', A(lt, 3.4, 4.0));
  bullet(1, '每分钟聚合一次', A(lt, 8.6, 9.2));
  bullet(2, '下游故障不堵上游', A(lt, 17.8, 18.4), { color: C_OK });
}

// ───────── 03 MapReduce ─────────
const SEQ = [4, 3, 7, 4, 2, 9, 4, 3, 7, 5, 4, 2, 2, 7, 4, 6, 7, 3, 4, 2, 5, 1, 4, 7, 6, 8];
const NODE_ADS = [[3, 6, 9], [1, 4, 7], [2, 5, 8]];
const NX = 1120, NW = 260, NH = 170, NY = [200, 400, 600];
const MAPX = 820, MAPY = 420;
function countsAt(n) { const c = Array(10).fill(0); for (let i = 0; i < n; i++) c[SEQ[i]]++; return c; }
const FINAL = countsAt(SEQ.length);
function sceneMR(lt) {
  header(lt, '03', 'MapReduce 聚合', C_AGG, '按广告分区 · 求和 · 取 Top N');
  const t0 = 4.5, gap = 0.2, fl = 0.6;
  let arrived = 0;
  SEQ.forEach((_, i) => { if (lt >= t0 + i * gap + fl) arrived = i + 1; });
  const cnt = countsAt(arrived);
  const ma = A(lt, 3.6, 4.2);
  box(MAPX, MAPY, 150, 130, 'Map', { color: C_EV, a: ma, size: 32 });
  text('点击事件', MAPX + 75, MAPY - 16, { size: 22, color: MUTE, align: 'center', a: ma });
  text('按 ad_id 分发', MAPX + 75, MAPY + 164, { size: 22, color: C_EV, align: 'center', a: ma });
  const topSel = A(lt, 14.6, 15.4), keep = [[3, 6], [4, 7], [2, 5]];
  for (let k = 0; k < 3; k++) {
    const a = A(lt, 3.6 + k * 0.15, 4.4 + k * 0.15), x = NX, y = NY[k], c = SC[k];
    glass(x, y, NW, NH, { a, accent: c });
    text(`节点 ${k}`, x + 22, y + 36, { size: 24, weight: 700, color: c, a });
    text(`ad_id%3=${k}`, x + NW - 16, y + 36, { size: 20, color: MUTE, align: 'right', font: MONO, a });
    NODE_ADS[k].forEach((ad, r) => {
      const yy = y + 74 + r * 36, n = cnt[ad], isTop = keep[k].includes(ad);
      const dim = 1 - topSel * (isTop ? 0 : 0.6);
      text(`ad${ad}`, x + 22, yy, { size: 24, font: MONO, weight: 700, a: a * dim });
      ctx.save(); ctx.globalAlpha *= a * dim; ctx.fillStyle = c; if (isTop && topSel > 0) glow(c, 12);
      rr(x + 100, yy - 17, Math.max(n * 16, 0), 18, 6); if (n > 0) ctx.fill(); ctx.restore();
      text(String(n), x + NW - 18, yy, { size: 24, font: MONO, weight: 800, align: 'right', color: isTop && topSel > 0 ? INK : MUTE, a: a * dim });
    });
    arrow(MAPX + 150, MAPY + 65, x, y + NH / 2, { color: 'rgba(255,255,255,.22)', w: 2, head: 9, a: a });
  }
  SEQ.forEach((ad, i) => {
    const p = P(lt, t0 + i * gap, t0 + i * gap + fl);
    if (p <= 0 || p >= 1) return;
    const k = ad % 3, x = lerp(MAPX + 150, NX, eIO(p)), y = lerp(MAPY + 65, NY[k] + NH / 2, eIO(p));
    evDot(x, y, String(ad), SC[k], { r: 15 });
  });
  // Reduce
  const ra = A(lt, 13.6, 14.4), RX = 1560, RY = 360, RW = 260, RH = 250;
  glass(RX, RY, RW, RH, { a: ra, accent: C_Q });
  text('Reduce', RX + 22, RY + 40, { size: 28, weight: 800, color: C_Q, a: ra });
  text('合并局部 Top 2', RX + 22, RY + 72, { size: 20, color: MUTE, a: ra });
  keep.forEach((pair, k) => pair.forEach((ad, j) => {
    const t1 = 15.6 + k * 0.25 + j * 0.1, p = P(lt, t1, t1 + 0.9);
    if (p > 0 && p < 1) { const x = lerp(NX + NW, RX, eIO(p)), y = lerp(NY[k] + 100 + j * 36, RY + 130, eIO(p)); evDot(x, y, String(ad), SC[k], { r: 15 }); }
  }));
  const fa = A(lt, 17.4, 18.2);
  [[4, 7], [7, 5], [2, 4]].forEach(([ad, n], i) => {
    const yy = RY + 118 + i * 40, c = SC[ad % 3], a = A(lt, 17.4 + i * 0.3, 18.1 + i * 0.3);
    text(`${i + 1}`, RX + 22, yy, { size: 22, color: MUTE, font: MONO, a });
    text(`ad${ad}`, RX + 56, yy, { size: 26, font: MONO, weight: 800, color: c, a });
    text(`${n}`, RX + RW - 22, yy, { size: 26, font: MONO, weight: 800, align: 'right', a });
  });
  text('全局 Top 3（用堆维护）', RX + 22, RY + RH - 16, { size: 20, color: C_OK, a: fa });
  [0, 1, 2].forEach((k) => arrow(NX + NW + 6, NY[k] + NH / 2, RX - 4, RY + RH / 2, { color: 'rgba(255,255,255,.16)', w: 2, head: 9, a: ra, dash: [6, 7] }));
  const wa = A(lt, 21.4, 22.2);
  glass(820, 800, 1000, 84, { a: wa, accent: C_OK });
  text('同一个 ad_id 只在一个节点 → 局部榜单可以直接合并', 850, 852, { size: 28, weight: 700, a: wa });
  text('示意：9 个广告、26 条点击', 1820, 205, { size: 20, color: DIM, align: 'right', a: ma });
  bullet(0, 'Map：按 ad_id 分发', A(lt, 4.4, 5.0));
  bullet(1, 'Aggregate：内存计数', A(lt, 10.6, 11.2));
  bullet(2, 'Reduce：合并 Top N', A(lt, 14.6, 15.2));
  statCard(110, 640, 640, '每个 ad_id 的计数在', '1 个节点', { color: C_OK, a: A(lt, 22.4, 23.0) });
}

// ───────── 04 窗口 ─────────
const WEV = [0.3, 0.7, 1.2, 1.5, 1.8, 2.4, 3.1, 3.3, 3.6, 4.2, 4.8, 5.5];
const wx = (m) => 860 + m * 160;
function sceneWindow(lt) {
  header(lt, '04', '聚合窗口', SC[0], '滚动 vs 滑动');
  const ya = 380, yb = 700;
  const axA = A(lt, 0.8, 1.6), axB = A(lt, 8.4, 9.2);
  [[ya, axA], [yb, axB]].forEach(([y, a]) => {
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(wx(0) - 20, y); ctx.lineTo(wx(6) + 10, y); ctx.stroke(); ctx.restore();
    for (let m = 0; m <= 6; m++) text(`12:0${m}`, wx(m), y + 40, { size: 20, color: MUTE, font: MONO, align: 'center', a });
  });
  text('滚动窗口 · 每 1 分钟一个，互不重叠', 860, 222, { size: 26, weight: 700, color: SC[0], a: A(lt, 3.0, 3.8) });
  text('滑动窗口 · 最近 M 分钟（示意 M = 3），每分钟滑一步', 860, 530, { size: 26, weight: 700, color: C_Q, a: A(lt, 9.0, 9.8) });
  WEV.forEach((t, i) => {
    const a1 = A(lt, 1.4 + i * 0.07, 2 + i * 0.07), a2 = A(lt, 8.8, 9.4);
    dot(wx(t), ya, 9, C_EV, { g: 10, a: a1 });
    dot(wx(t), yb, 9, C_EV, { g: 10, a: a2 });
  });
  const cs = [2, 3, 1, 3, 2, 1];
  cs.forEach((n, i) => {
    const a = A(lt, 3.6 + i * 0.8, 4.3 + i * 0.8);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - a) * 14);
    glass(wx(i) + 4, 250, 152, 100, { accent: SC[0], fill: 0.1 });
    text(String(n), wx(i) + 80, 318, { size: 54, weight: 800, font: MONO, align: 'center', color: SC[0] });
    ctx.restore();
  });
  const sc = [6, 7, 6, 6], t0s = [9.6, 11.6, 14.0, 16.4];
  let cur = 0; t0s.forEach((t, i) => { if (lt >= t) cur = i; });
  const mv = cur === 0 ? 0 : eIO(P(lt, t0s[cur], t0s[cur] + 0.9));
  const pos = cur === 0 ? 0 : lerp(cur - 1, cur, mv);
  const wa = A(lt, 9.6, 10.4);
  for (let i = 0; i < cur; i++) {
    ctx.save(); ctx.globalAlpha *= 0.28 * wa; ctx.strokeStyle = C_Q; ctx.setLineDash([6, 6]); ctx.lineWidth = 2;
    rr(wx(i), 600, 480, 90, 14); ctx.stroke(); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha *= wa; rr(wx(pos), 600, 480, 90, 14); ctx.fillStyle = C_Q + '26'; ctx.fill();
  ctx.strokeStyle = C_Q; ctx.lineWidth = 3; glow(C_Q, 14); ctx.stroke(); ctx.restore();
  text(`最近 3 分钟：${sc[cur]} 次`, wx(pos) + 240, 575, { size: 26, weight: 800, font: MONO, align: 'center', color: C_Q, a: wa });
  bullet(0, '滚动：一分钟一本账', A(lt, 3.4, 4.0));
  bullet(1, '滑动：每分钟看最近 M 分钟', A(lt, 9.4, 10.0));
  bullet(2, '窗口之间可以重叠', A(lt, 14.0, 14.6), { color: C_Q });
}

// ───────── 05 事件时间 vs 处理时间 ─────────
const TEV = [[1, 10, 14], [2, 35, 40], [3, 52, 83], [4, 70, 76], [5, 95, 99]];
const tx = (s) => 860 + s * (920 / 120);
function sceneTime(lt) {
  header(lt, '05', '事件时间 vs 处理时间', C_EV, '以哪个钟为准');
  const ye = 360, yp = 640;
  const axa = A(lt, 1.0, 1.8), axb = A(lt, 6.4, 7.2);
  [[ye, axa, '事件时间 · 点击真正发生', C_EV], [yp, axb, '处理时间 · 服务器收到', C_AGG]].forEach(([y, a, lab, c]) => {
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(tx(0) - 20, y); ctx.lineTo(tx(120) + 20, y); ctx.stroke(); ctx.restore();
    text(lab, 860, y - 60, { size: 26, weight: 700, color: c, a });
    [0, 60, 120].forEach((s) => text(hms(s).slice(0, 5), tx(s), y + 40, { size: 20, color: MUTE, font: MONO, align: 'center', a }));
  });
  const ba = A(lt, 10.0, 10.8);
  [ye, yp].forEach((y) => { ctx.save(); ctx.globalAlpha *= ba; rr(tx(0), y - 32, tx(60) - tx(0), 64, 12); ctx.fillStyle = C_DB + '22'; ctx.fill(); ctx.strokeStyle = C_DB + '99'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); });
  text('窗口 [12:00, 12:01)', tx(30), ye + 82, { size: 22, color: C_DB, align: 'center', a: ba });
  TEV.forEach(([id, et, pt], i) => {
    const a1 = A(lt, 2.4 + i * 0.7, 3.0 + i * 0.7), a2 = A(lt, 7.0 + i * 0.6, 7.6 + i * 0.6), la = P(lt, 7.0 + i * 0.6, 8.0 + i * 0.6);
    if (la > 0) {
      ctx.save(); ctx.globalAlpha *= 0.5 * clamp(la * 2); ctx.strokeStyle = C_Q; ctx.lineWidth = 2; ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.moveTo(tx(et), ye + 20); ctx.lineTo(lerp(tx(et), tx(pt), eIO(la)), lerp(ye + 20, yp - 20, eIO(la))); ctx.stroke(); ctx.restore();
    }
    evDot(tx(et), ye, `e${id}`, C_EV, { a: a1, rg: id === 3 && lt > 15 ? C_OK : null });
    evDot(tx(pt), yp, `e${id}`, C_AGG, { a: a2, rg: id === 3 && lt > 11.5 && lt < 15 ? RED : null });
  });
  const oa = A(lt, 11.0, 11.8);
  text('到达顺序：e1  e2  e4  e3  e5', 880, 830, { size: 30, weight: 700, font: MONO, a: oa });
  text('← 乱序', 1560, 830, { size: 30, weight: 800, color: RED, a: oa });
  const pa = A(lt, 12.0, 12.8) * (1 - A(lt, 14.6, 15.2));
  text('按处理时间：e3 被算进下一分钟', tx(83), yp + 90, { size: 22, color: RED, align: 'center', a: pa });
  const ea = A(lt, 15.2, 16.0);
  text('按事件时间：e3 归 12:00 这一分钟', tx(52), ye + 130, { size: 22, color: C_OK, align: 'center', a: ea });
  bullet(0, '事件时间：点击发生时', A(lt, 2.2, 2.8));
  bullet(1, '处理时间：服务器收到时', A(lt, 6.8, 7.4));
  bullet(2, '两者会差很多，还会乱序', A(lt, 10.8, 11.4));
  bullet(3, '本章：按事件时间', A(lt, 15.6, 16.2), { color: C_OK });
  text('代价：客户端时钟可能不准', 110, 740, { size: 24, color: MUTE, a: A(lt, 17.0, 17.8) });
}

// ───────── 06 水位线 ─────────
const WE = [[1, 10, 4.4], [2, 35, 6.2], [4, 70, 9.5], [3, 52, 15.0], [5, 95, 20.5], [6, 20, 26.0]];
const ex = (s) => 860 + s * (920 / 120);
const WM_K = [[5.1, -5], [6.9, 20], [10.2, 55], [21.2, 80]];
function wmAt(lt) {
  let v = -5, tPrev = 0;
  for (const [t, nv] of WM_K) { if (lt >= t) { v = lerp(v, nv, eIO(P(lt, t, t + 0.8))); } }
  // 逐段累计：重新按段计算保证连续
  let cur = -5;
  for (const [t, nv] of WM_K) { const p = eIO(P(lt, t, t + 0.8)); if (lt < t) break; cur = lerp(cur, nv, p); }
  return cur;
}
function sceneWM(lt) {
  header(lt, '06', '水位线', C_Q, '接住迟到的事件');
  const ay = 600, fired = lt > 21.6;
  const baseA = A(lt, 0.8, 1.6);
  ctx.save(); ctx.globalAlpha *= baseA; ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(ex(0) - 20, ay); ctx.lineTo(ex(120) + 20, ay); ctx.stroke(); ctx.restore();
  [0, 60, 120].forEach((s) => text(hms(s).slice(0, 5), ex(s), ay + 40, { size: 20, color: MUTE, font: MONO, align: 'center', a: baseA }));
  text('事件时间轴', 1800, ay + 78, { size: 20, color: DIM, align: 'right', a: baseA });
  // 窗口
  const pf = fired ? P(lt, 21.6, 22.4) : 0;
  const wc = fired ? C_OK : C_DB;
  ctx.save(); ctx.globalAlpha *= baseA; rr(ex(0), 440, ex(60) - ex(0), 160, 14); ctx.fillStyle = wc + (fired ? '30' : '1c'); ctx.fill();
  ctx.strokeStyle = wc + 'cc'; ctx.lineWidth = 2.5; if (fired) glow(C_OK, 18 * (1 - pf) + 6); ctx.stroke(); ctx.restore();
  let n = 0; WE.forEach(([id, et, ta]) => { if (et < 60 && id !== 6 && lt >= ta + 0.7) n++; });
  text(`count = ${n}`, ex(30), 492, { size: 40, weight: 800, font: MONO, align: 'center', color: fired ? C_OK : INK, a: baseA });
  text('窗口 [12:00, 12:01)', ex(30), 700, { size: 26, weight: 700, color: wc, align: 'center', a: baseA });
  const st = fired ? '已输出' : lt > 9.0 ? '等待中：水位线还没过终点' : '';
  if (st) text(st, ex(30), 740, { size: 24, color: fired ? C_OK : C_Q, align: 'center', weight: 700, a: fired ? A(lt, 21.6, 22.2) : A(lt, 9.0, 9.8) });
  // 水位线
  const wa = A(lt, 3.0, 3.8), wm = wmAt(lt), wmx = ex(clamp(wm, 0, 120));
  if (wa > 0) {
    ctx.save(); ctx.globalAlpha *= wa; ctx.strokeStyle = C_Q; ctx.lineWidth = 4; glow(C_Q, 16);
    ctx.beginPath(); ctx.moveTo(wmx, 410); ctx.lineTo(wmx, ay + 24); ctx.stroke(); ctx.restore();
    text(wm < 0 ? '水位线' : `水位线 ${hms(Math.floor(wm))}`, wmx, 394, { size: 24, weight: 800, color: C_Q, align: 'center', font: MONO, a: wa });
  }
  text('水位线 = 已见最大事件时间 − 容忍 15 秒（示意）', 860, 205, { size: 24, color: MUTE, a: A(lt, 4.0, 4.8) });
  // 侧输出
  const sa = A(lt, 24.4, 25.2);
  glass(1480, 200, 320, 110, { a: sa, accent: C_Q });
  text('侧输出', 1510, 246, { size: 28, weight: 800, color: C_Q, a: sa });
  text('迟到太久的点击', 1510, 286, { size: 22, color: MUTE, a: sa });
  // 事件
  WE.forEach(([id, et, ta], i) => {
    const p = P(lt, ta, ta + 0.7);
    if (p <= 0) return;
    const x = ex(et), late = id === 6, y0 = 270, yEnd = late ? 500 : 566;
    const lab = hms(et);
    if (late && lt > ta + 0.7) {
      const q = eIO(P(lt, ta + 0.9, ta + 1.9)), qx = lerp(x, 1745, q), qy = lerp(yEnd, 255, q) - Math.sin(q * Math.PI) * 60;
      evDot(qx, qy, 'e6', C_Q, { r: 18, rg: RED });
      if (q < 1) text(lab, qx, qy - 30, { size: 20, font: MONO, color: MUTE, align: 'center', a: 1 - q });
      if (q < 0.05) ring(x, yEnd, 34, RED, 1, 3);
      return;
    }
    const y = lerp(y0, yEnd, eOut(p)), ok = !late && et < 60;
    const col = id === 6 ? C_Q : C_EV;
    evDot(x, y, `e${id}`, col, { r: 18, rg: id === 3 && lt > 15.7 && lt < 18.5 ? C_OK : null });
    text(lab, x, y - 34 - (i % 2) * 0, { size: 20, font: MONO, color: MUTE, align: 'center', a: P(lt, ta + 0.3, ta + 0.8) * (late && lt > ta + 0.7 ? 0 : 1) });
    void ok;
  });
  // 到达顺序提示
  const ta = A(lt, 15.0, 15.8) * (1 - A(lt, 19.0, 19.6));
  text('e3 迟到，但窗口还开着 → 算进来', ex(30), 800, { size: 28, weight: 700, color: C_OK, align: 'center', a: ta });
  const la = A(lt, 26.8, 27.6);
  text('窗口早已输出 → 进侧输出，留给对账修正', ex(60), 800, { size: 28, weight: 700, color: C_Q, align: 'center', a: la });
  bullet(0, '水位线 = 事件时间的进度', A(lt, 3.4, 4.0));
  bullet(1, '越过窗口终点才输出', A(lt, 10.0, 10.6));
  bullet(2, '赶在这之前的迟到点击：算进来', A(lt, 15.2, 15.8), { color: C_OK });
  bullet(3, '容忍短：延迟低，易漏', A(lt, 19.6, 20.2));
  bullet(4, '容忍长：更准，输出慢', A(lt, 22.0, 22.6));
  bullet(5, '太晚的：侧输出 + 对账', A(lt, 26.2, 26.8), { color: C_Q });
}

// ───────── 07 恰好一次 ─────────
function sceneOnce(lt) {
  header(lt, '07', '恰好一次', C_OK, '宕机发生在两步之间');
  const nx = 830, ny = 280, ox = 830, oy = 560, dx = 1600, dy = 250;
  const ia = A(lt, 1.0, 1.8);
  // 阶段
  const ph = lt < 11 ? 0 : lt < 17.5 ? 1 : lt < 23 ? 2 : 3;
  const u = ph === 1 ? lt - 11 : ph === 2 ? lt - 17.5 : ph === 3 ? lt - 23 : 0;
  let dbKey = '', dbText = '', dbCol = INK, offV = 99, crashed = false, nodeSub = '算出 count = 100（示意）';
  let lines = [], tag = null, packE = 0, packO = 0, ringNode = null;
  if (ph === 1) {
    packE = P(u, 0.3, 1.1);
    if (u > 1.1) { dbText = 'count = 100'; dbCol = C_OK; }
    crashed = u > 1.7 && u < 3.0;
    if (u > 1.8) lines.push(['宕机：进度没记上', RED, 1.8]);
    if (u > 3.0) lines.push(['重启：从 99 重读', INK, 3.0]);
    const pk2 = P(u, 3.6, 4.4); if (pk2 > 0) packE = pk2;
    if (u > 4.4) { dbText = 'count = 200'; dbCol = RED; lines.push(['结果又发了一次', RED, 4.4]); tag = ['重复', RED]; }
  } else if (ph === 2) {
    packO = P(u, 0.3, 1.0);
    if (u > 1.0) offV = 100;
    crashed = u > 1.5 && u < 2.7;
    if (u > 1.0) lines.push(['先记下 offset = 100', INK, 1.0]);
    if (u > 1.7) lines.push(['宕机：结果没发出', RED, 1.7]);
    if (u > 2.8) lines.push(['重启：从 100 继续', INK, 2.8]);
    if (u > 3.6) { dbText = 'count = 空'; dbCol = RED; lines.push(['那条结果永远丢了', RED, 3.6]); tag = ['丢失', RED]; }
  } else if (ph === 3) {
    packE = P(u, 0.3, 1.1); packO = P(u, 0.3, 1.1);
    if (u > 1.1) { offV = 100; dbText = '= 100'; dbKey = 'ad001 · 12:01'; dbCol = C_OK; }
    if (u > 0.4) lines.push(['发结果 + 记进度，原子提交', C_OK, 0.4]);
    const rp = P(u, 2.2, 3.0); if (rp > 0 && rp < 1) packE = rp;
    if (u > 2.2) lines.push(['重启重放：再写一次', INK, 2.2]);
    if (u > 3.0) { lines.push(['同一个键，仍然是 100', C_OK, 3.0]); tag = ['恰好一次', C_OK]; }
  }
  box(nx, ny, 250, 140, '聚合节点', { color: crashed ? RED : C_AGG, a: ia, size: 32, sub: nodeSub, hot: crashed });
  box(ox, oy, 250, 130, '进度 offset', { color: C_Q, a: ia, size: 30, sub: `offset = ${offV}` });
  dbIcon(dx, dy, 140, 170, '结果库', { color: C_DB, a: ia });
  const arA = A(lt, 4.6, 5.4), arB = A(lt, 7.6, 8.4);
  arrow(1090, 350, 1590, 350, { color: MUTE, w: 3, head: 12, p: arA, a: 1 });
  text('① 发结果', 1340, 332, { size: 26, weight: 700, align: 'center', a: arA });
  arrow(955, 428, 955, 552, { color: MUTE, w: 3, head: 12, p: arB });
  text('② 记进度', 985, 500, { size: 26, weight: 700, a: arB });
  if (packE > 0 && packE < 1) packet(1090, 350, 1590, 350, packE, C_EV, { r: 11 });
  if (packO > 0 && packO < 1) packet(955, 428, 955, 552, packO, C_Q, { r: 11 });
  if (crashed) text('宕机', nx + 125, ny - 18, { size: 32, weight: 800, color: RED, align: 'center' });
  if (ph === 3 && u > 0.2) {
    ctx.save(); ctx.strokeStyle = C_OK; ctx.lineWidth = 3; ctx.setLineDash([10, 8]); glow(C_OK, 12); ctx.globalAlpha *= A(u, 0.2, 0.8);
    rr(810, 250, 760, 450, 26); ctx.stroke(); ctx.restore();
  }
  const dba = dbText ? 1 : 0;
  text(dbKey, 1670, 506, { size: 22, color: MUTE, align: 'center', font: MONO, a: dba });
  text(dbText, 1670, 548, { size: 34, weight: 800, font: MONO, color: dbCol, align: 'center', a: dba });
  const sw = ph >= 1 ? A(ph === 1 ? u : ph === 2 ? u : u, 0.0, 0.5) : 0;
  const titles = [null, ['先发后记', RED], ['先记后发', RED], ['原子提交 / 幂等写', C_OK]];
  if (titles[ph]) badge(830, 170, titles[ph][0], titles[ph][1], sw);
  lines.forEach(([s, c, t0], i) => text(s, 1120, 570 + i * 40, { size: 26, weight: 600, color: c, a: A(u, t0, t0 + 0.5) }));
  if (tag) badge(1590, 600, tag[0], tag[1], A(u, ph === 3 ? 3.0 : ph === 1 ? 4.4 : 3.6, (ph === 3 ? 3.0 : ph === 1 ? 4.4 : 3.6) + 0.6));
  text('示意数字', 1800, 880, { size: 20, color: DIM, align: 'right', a: ia });
  bullet(0, '目标：不重复，也不漏', A(lt, 1.6, 2.2));
  statCard(110, 520, 640, '先发后记', '结果重复', { color: RED, a: A(lt, 16.6, 17.2) });
  statCard(110, 640, 640, '先记后发', '结果丢失', { color: RED, a: A(lt, 22.0, 22.6) });
  statCard(110, 760, 640, '原子提交 / 幂等写', '恰好一次', { color: C_OK, a: A(lt, 26.0, 26.6) });
}

// ───────── 08 批流与对账 ─────────
function sceneRecon(lt) {
  header(lt, '08', '批流与对账', SC[3], 'Lambda · Kappa · 每日对账');
  const r1 = A(lt, 3.0, 3.8), r2 = A(lt, 9.6, 10.4), r3 = A(lt, 16.2, 17.0);
  // Lambda
  badge(820, 180, 'Lambda 架构', C_Q, r1);
  box(820, 255, 150, 100, '原始事件', { color: C_EV, a: r1, size: 24 });
  box(1050, 230, 240, 64, '批处理 · 代码 A', { color: C_AGG, a: A(lt, 4.2, 4.9), size: 24 });
  box(1050, 316, 240, 64, '流处理 · 代码 B', { color: C_AGG, a: A(lt, 5.0, 5.7), size: 24 });
  box(1400, 255, 200, 100, '合并结果', { color: C_DB, a: A(lt, 5.8, 6.5), size: 24 });
  [[970, 290, 1050, 262, 4.2], [970, 320, 1050, 348, 5.0], [1290, 262, 1400, 290, 5.8], [1290, 348, 1400, 320, 6.0]].forEach(([a, b, c, d, t]) => arrow(a, b, c, d, { color: MUTE, w: 3, head: 10, p: eOut(P(lt, t, t + 0.5)) }));
  badge(1650, 278, '两套代码', RED, A(lt, 7.4, 8.2));
  // Kappa
  badge(820, 420, 'Kappa 架构', C_OK, r2);
  box(820, 470, 150, 100, '原始事件', { color: C_EV, a: r2, size: 24 });
  box(1090, 470, 330, 100, '流处理引擎', { color: C_AGG, a: A(lt, 11.0, 11.7), size: 28, sub: '同一套代码' });
  box(1560, 470, 210, 100, '聚合结果', { color: C_DB, a: A(lt, 12.4, 13.1), size: 24 });
  arrow(970, 520, 1090, 520, { color: MUTE, w: 3, head: 10, p: eOut(P(lt, 10.8, 11.4)) });
  arrow(1420, 520, 1560, 520, { color: MUTE, w: 3, head: 10, p: eOut(P(lt, 12.2, 12.8)) });
  text('实时处理 + 重放历史，走同一逻辑', 1255, 606, { size: 22, color: MUTE, align: 'center', a: A(lt, 13.4, 14.2) });
  // 对账
  badge(820, 650, '每日对账', SC[3], r3);
  box(820, 700, 300, 100, '原始事件重算', { color: C_EV, a: r3, size: 26 });
  const ca = A(lt, 18.0, 18.8);
  ctx.save(); ctx.globalAlpha *= ca; ctx.beginPath(); ctx.arc(1260, 750, 50, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill(); ctx.strokeStyle = SC[3]; ctx.lineWidth = 3; glow(SC[3], 14); ctx.stroke(); ctx.restore();
  text('对比', 1260, 760, { size: 26, weight: 800, align: 'center', a: ca });
  box(1400, 700, 300, 100, '聚合库结果', { color: C_DB, a: A(lt, 17.4, 18.1), size: 26 });
  arrow(1120, 750, 1206, 750, { color: MUTE, w: 3, head: 10, p: eOut(P(lt, 17.8, 18.4)) });
  arrow(1400, 750, 1314, 750, { color: MUTE, w: 3, head: 10, p: eOut(P(lt, 17.8, 18.4)) });
  badge(1060, 830, '一致', C_OK, A(lt, 19.6, 20.2));
  badge(1220, 830, '有差异 → 审核修正', SC[3], A(lt, 20.6, 21.2));
  bullet(0, 'Lambda：批流两套代码', A(lt, 3.6, 4.2));
  bullet(1, 'Kappa：一套逻辑，重放', A(lt, 10.0, 10.6));
  bullet(2, '每天对账，可重算修正', A(lt, 16.6, 17.2), { color: SC[3] });
  text('两边要同一口径：时区、过滤、去重', 110, 640, { size: 24, color: MUTE, a: A(lt, 21.6, 22.4) });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('广告点击事件聚合', 110, 220, { size: 84, weight: 900, a: A(lt, 0.2, 0.9) });
  text('Ad Click Event Aggregation', 112, 280, { size: 32, color: MUTE, font: MONO, a: A(lt, 0.4, 1.1) });
  [['水位线', '窗口按事件时间归属', '迟到事件被接住', C_Q, 2.2], ['原子提交', '状态、进度、结果一起提交', '下游幂等写入', C_OK, 8.8], ['对账重算', '原始事件留底', '每天重算，发现差异就修正', SC[0], 14.8]].forEach(([w, s1, s2, c, t0], k) => {
    const p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 360, 520, 290, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 360, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 420, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 510, { size: 70, weight: 800 });
    text(s1, x + 36, 566, { size: 26, color: MUTE });
    text(s2, x + 36, 606, { size: 26, color: MUTE });
    ctx.restore();
  });
  // 底部：点击流入窗口
  const la = A(lt, 18.0, 18.8), y = 790;
  for (let k = 0; k < 4; k++) {
    ctx.save(); ctx.globalAlpha *= la; rr(110 + k * 430, y - 40, 410, 80, 16); ctx.fillStyle = 'rgba(255,255,255,.04)'; ctx.fill();
    ctx.strokeStyle = SC[0] + '88'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
  for (let i = 0; i < 28; i++) {
    const u = (((i * 0.618034) % 1) + lt * 0.05) % 1;
    dot(110 + u * 1700, y + Math.sin(i * 2.1) * 22, 6, C_EV, { g: 8, a: la * 0.9 });
  }
  text('计费不能出错，靠的是这几道保险', 110, 880, { size: 26, color: MUTE, a: A(lt, 19.6, 20.4) });
}

export const scenes = { title: sceneTitle, scale: sceneScale, pipe: scenePipe, mr: sceneMR, window: sceneWindow, time: sceneTime, wm: sceneWM, once: sceneOnce, recon: sceneRecon, end: sceneEnd };
