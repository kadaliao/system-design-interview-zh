// 第 17 章 附近好友：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header,
         arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 17, title: '附近好友', en: 'Nearby Friends' };

// 角色配色（全片统一）：WS 服务器=靛 SC[1]、Redis 缓存=青 SC[0]、数据库=琥珀 SC[3]、频道/Pub-Sub=粉 SC[2]、新增/在范围内=青柠 SC[4]、丢弃/瓶颈=RED
const C_WS = SC[1], C_CACHE = SC[0], C_DB = SC[3], C_CH = SC[2], C_OK = SC[4];
const fade = (lt, a, b) => eOut(P(lt, a, b));
const NEUTRAL = '#9aa6d6';

// ───────── 通用组件 ─────────
function phone(cx, cy, color, label, { a = 1, s = 1, glowOn = 0 } = {}) {
  if (a <= 0 || s <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s);
  glow(color, 10 + glowOn * 26); rr(-26, -44, 52, 88, 12);
  ctx.fillStyle = color + (glowOn > 0.2 ? '55' : '22'); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke(); ctx.shadowBlur = 0;
  rr(-10, -35, 20, 5, 3); ctx.fillStyle = color; ctx.fill();
  if (label) text(label, 0, 12, { size: 26, weight: 800, align: 'center', color: INK });
  ctx.restore();
}
function pill(x, y, w, h, label, color, { a = 1, solid = true, size = 24, flash = 0 } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; glow(color, 8 + flash * 24); rr(x, y, w, h, h / 2);
  ctx.fillStyle = color + (flash > 0.2 ? '55' : '22'); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = color;
  if (!solid) ctx.setLineDash([8, 8]); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  text(label, x + w / 2, y + h / 2 + size * 0.35, { size, weight: 700, align: 'center', font: MONO });
  ctx.restore();
}
function mapPanel(x, y, w, h, a = 1) {
  glass(x, y, w, h, { a });
  ctx.save(); ctx.globalAlpha *= a; rr(x, y, w, h, 22); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 2;
  for (let gx = x + 50; gx < x + w; gx += 90) { ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, y + h); ctx.stroke(); }
  for (let gy = y + 40; gy < y + h; gy += 90) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x + w, gy); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(139,141,252,0.09)'; ctx.lineWidth = 12;
  ctx.beginPath(); ctx.moveTo(x, y + h * 0.78); ctx.lineTo(x + w * 0.55, y + h * 0.3); ctx.lineTo(x + w, y + h * 0.4); ctx.stroke();
  ctx.restore();
}
function avatar(x, y, color, { r = 15, a = 1, ring = 0, fillA = 1 } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; glow(color, 12 + ring * 18); ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = color + (fillA >= 1 ? 'ff' : '33'); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke(); ctx.restore();
}
function ripple(x, y, p, color, R = 60) {
  if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.globalAlpha *= (1 - p) * 0.8; ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.beginPath(); ctx.arc(x, y, 12 + R * eOut(p), 0, 7); ctx.stroke(); ctx.restore();
}
function cross(x, y, p, color = RED, r = 14) {
  if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.globalAlpha *= Math.sin(clamp(p) * Math.PI) ** 0.5; ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round'; glow(color, 14);
  const k = r * (0.7 + 0.5 * p);
  ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke(); ctx.restore();
}
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

// ───────── 一致性哈希环（分片两场景共用） ─────────
const RG = { x: 1480, y: 545, R: 235 };
const ang = (pos) => ((-90 + pos * 3.6) * Math.PI) / 180;
const rp = (pos, r = RG.R) => [RG.x + Math.cos(ang(pos)) * r, RG.y + Math.sin(ang(pos)) * r];
const NODES = [[20, 'R1', SC[0]], [45, 'R2', SC[1]], [70, 'R3', SC[3]], [92, 'R4', SC[2]]];
const NODE5 = [57, 'R5', C_OK];
const CHS = [4, 11, 16, 27, 33, 41, 47, 52, 56, 63, 66, 79, 86, 97];
const MOVED = [47, 52, 56];
const ownerOf = (pos, nodes) => { let best = null; for (const n of nodes) if (n[0] >= pos && (!best || n[0] < best[0])) best = n; return best || nodes.reduce((m, n) => (n[0] < m[0] ? n : m)); };
function ringBase(a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(139,141,252,0.45)'; glow('rgba(139,141,252,0.4)', 18);
  ctx.beginPath(); ctx.arc(RG.x, RG.y, RG.R, 0, 7); ctx.stroke(); ctx.restore();
}
function ringNode(n, { a = 1, s = 1, flash = 0 } = {}) {
  if (a <= 0 || s <= 0) return;
  const [x, y] = rp(n[0], RG.R);
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(s, s); glow(n[2], 14 + flash * 24);
  rr(-34, -22, 68, 44, 14); ctx.fillStyle = '#0c1226'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = n[2]; ctx.stroke(); ctx.shadowBlur = 0;
  text(n[1], 0, 8, { size: 24, weight: 800, align: 'center', font: MONO, color: n[2] }); ctx.restore();
}
function ringChan(pos, color, { a = 1, r = 8, flash = 0 } = {}) {
  if (a <= 0) return;
  const [x, y] = rp(pos, RG.R - 34);
  dot(x, y, r + flash * 4, color, { g: 8 + flash * 18, a });
}

// ───────── 场景 0：片头 ─────────
function sceneTitle(lt, d) {
  const a = eOut(P(lt, 0.2, 1.2));
  const cx = 1400, cy = 540;
  ctx.save(); ctx.globalAlpha *= fade(lt, 0.3, 1.4);
  for (let i = 0; i < 9; i++) {
    const th = (i / 9) * 6.283 + lt * 0.12, rad = 190 + (i % 3) * 70 + Math.sin(lt * 0.7 + i) * 14;
    const x = cx + Math.cos(th) * rad, y = cy + Math.sin(th) * rad * 0.8;
    const q = ((lt * 0.55 + i * 0.37) % 1.6);
    ctx.save(); ctx.globalAlpha *= 0.35; ctx.strokeStyle = C_CH; ctx.lineWidth = 2; ctx.setLineDash([6, 10]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke(); ctx.restore();
    if (q < 1) dot(lerp(cx, x, q), lerp(cy, y, q), 6, C_CH, { g: 14, a: Math.sin(q * Math.PI) });
    avatar(x, y, [C_OK, NEUTRAL, C_CACHE][i % 3], { r: 14, a: fade(lt, 1 + i * 0.12, 1.6 + i * 0.12) });
  }
  ripple(cx, cy, (lt * 0.6) % 1, C_CH, 130);
  avatar(cx, cy, C_CH, { r: 26, ring: 1 });
  ctx.restore();
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = eOut(P(lt, 0.4, 1.4)); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 150px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('附近好友', 104, 520); ctx.restore();
  text('Nearby Friends', 112, 590, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 17 章', 112, 680, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 1：人是会动的 ─────────
const PD = [[900, 260], [1080, 330], [1260, 250], [1440, 340], [940, 470], [1130, 520], [1330, 480], [1000, 700], [1220, 740], [1420, 660]];
function sceneProblem(lt, d) {
  header(lt, '01', '人是会动的', SC[0], '不扫全库，设备主动上报');
  mapPanel(830, 170, 990, 740, fade(lt, 0.3, 1));
  const sx = 1640, sy = 540;
  box(sx - 80, sy - 70, 160, 140, 'WS', { color: C_WS, sub: '服务器', a: fade(lt, 0.9, 1.6), size: 32 });
  PD.forEach(([bx, by], i) => {
    const born = eBack(P(lt, 0.7 + i * 0.1, 1.3 + i * 0.1));
    const x = bx + 38 * Math.sin(lt * 0.5 + i * 1.7), y = by + 28 * Math.cos(lt * 0.42 + i * 1.3);
    const col = [C_OK, NEUTRAL, C_CACHE, SC[3], SC[2]][i % 5];
    const cyc = 3.4, ph = ((lt - 2 - i * 0.34) % cyc + cyc) % cyc;
    if (born > 0.02) avatar(x, y, col, { r: 15 * clamp(born), a: clamp(born * 2) });
    if (lt > 2 + i * 0.34 && born > 0.5) {
      // 倒计时弧：充满即上报
      const q = ph / cyc;
      if (q < 0.9) { ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha *= 0.55; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 25, -Math.PI / 2, -Math.PI / 2 + q / 0.9 * 6.283); ctx.stroke(); ctx.restore(); }
      else {
        const p = (q - 0.9) / 0.1; ripple(x, y, p, col, 40);
      }
      const t1 = (ph - cyc * 0.9) / 1.0; // 上报包飞向服务器
      if (ph >= cyc * 0.9 - 0.02) { /* handled below via packet over next cycle */ }
      const pk = ph < 1.0 ? eIO(ph / 1.0) : 0;
      if (pk > 0) packet(x, y, sx - 80, sy + (i - 4.5) * 8, pk, col, { r: 7, trail: 0.2 });
    }
  });
  text('示意：每个人约 30 秒上报一次', 860, 880, { size: 22, color: MUTE, a: fade(lt, 8.5, 9.3) });
  bullet(0, '好友一直在走', fade(lt, 1.0, 1.6));
  bullet(1, '不扫全库', fade(lt, 5.0, 5.6));
  bullet(2, '设备每 30 秒主动上报', fade(lt, 9.5, 10.1));
  statCard(110, 640, 640, '同时在线', '1000 万', { color: SC[0], a: fade(lt, 13.6, 14.3), note: '假设' });
  statCard(110, 770, 640, '位置更新', '≈33.4 万/秒', { color: C_CH, a: fade(lt, 17.0, 17.7) });
}

// ───────── 场景 2：WebSocket 长连接 ─────────
function sceneWs(lt, d) {
  header(lt, '02', 'WebSocket 长连接', SC[1], '连一次，双向实时');
  // 上：普通请求/响应
  const a1 = fade(lt, 0.8, 1.6);
  glass(830, 190, 990, 270, { a: a1 });
  text('普通请求/响应', 860, 238, { size: 24, weight: 700, color: MUTE, a: a1 });
  phone(920, 350, NEUTRAL, '', { a: a1 }); box(1620, 300, 170, 100, '服务器', { color: DIM, a: a1, size: 26 });
  for (let k = 0; k < 3; k++) {
    const t0 = 1.6 + k * 1.2;
    packet(990, 335, 1620, 335, eIO(P(lt, t0, t0 + 0.7)), NEUTRAL, { r: 8, a: a1 });
    packet(1620, 370, 990, 370, eIO(P(lt, t0 + 0.7, t0 + 1.1)), DIM, { r: 6, a: a1 * 0.7 });
  }
  text('服务器只能被动等着问', 1130, 432, { size: 22, color: MUTE, a: fade(lt, 3.2, 3.9) * a1 });
  // 下：长连接
  const a2 = fade(lt, 4.0, 4.8);
  glass(830, 500, 990, 400, { a: a2, accent: C_WS });
  text('WebSocket：一直连着', 860, 548, { size: 24, weight: 700, color: C_WS, a: a2 });
  phone(920, 700, C_CH, 'A', { a: a2 }); box(1620, 630, 170, 140, 'WS 服务器', { color: C_WS, a: a2, size: 24 });
  const pg = ctx.createLinearGradient(990, 0, 1620, 0); pg.addColorStop(0, C_CH + '66'); pg.addColorStop(1, C_WS + '66');
  ctx.save(); ctx.globalAlpha *= a2 * clamp(P(lt, 4.4, 5.6)); glow(C_WS, 18); rr(990, 690, 630 * eOut(P(lt, 4.4, 5.6)), 20, 10); ctx.fillStyle = pg; ctx.fill(); ctx.restore();
  const times = [6.0, 7.4, 8.8, 10.2, 11.6, 13.0, 14.4, 15.8, 17.2];
  times.forEach((t0, k) => {
    if (k % 2 === 0) { packet(990, 700, 1620, 700, eIO(P(lt, t0, t0 + 1.0)), C_CH, { r: 9, a: a2 }); }
    else { packet(1620, 700, 990, 700, eIO(P(lt, t0, t0 + 1.0)), C_OK, { r: 9, a: a2 }); }
  });
  text('上报 →', 1180, 668, { size: 22, color: C_CH, weight: 700, a: fade(lt, 6.5, 7.2) * a2 });
  text('← 推送', 1380, 748, { size: 22, color: C_OK, weight: 700, a: fade(lt, 8.8, 9.5) * a2 });
  bullet(0, '连一次，一直保持', fade(lt, 4.3, 4.9));
  bullet(1, '双向：上报 + 推送', fade(lt, 7.5, 8.1));
  bullet(2, 'P2P 不实用：网络不稳、费电', fade(lt, 11.0, 11.6));
  bullet(3, '后端统一转发', fade(lt, 17.0, 17.6), { color: C_OK });
}

// ───────── 场景 3：每人一个频道 ─────────
function sceneChannel(lt, d) {
  header(lt, '03', '每人一个频道', C_CH, 'Redis Pub/Sub');
  // 其他人的频道（暗）
  [['E', 250], ['F', 350], ['G', 730], ['H', 830]].forEach(([n, y], i) => {
    const a = fade(lt, 4.6 + i * 0.25, 5.4 + i * 0.25) * 0.4;
    phone(900, y, DIM, '', { a, s: 0.55 }); pill(1090, y - 24, 260, 48, `频道 ${n}`, DIM, { a, size: 22 });
  });
  const pa = fade(lt, 0.8, 1.5);
  phone(900, 540, C_CH, 'A', { a: pa });
  const pf = eBack(P(lt, 1.6, 2.4));
  const pubs = [12.0, 14.8];
  const flash = pubs.reduce((m, t) => Math.max(m, Math.sin(clamp(P(lt, t + 0.8, t + 1.8)) * Math.PI) * (lt > t + 0.8 ? 1 : 0)), 0);
  pill(1090, 505, 260, 70, '频道 A', C_CH, { a: clamp(pf * 2), size: 28, flash });
  text('A 的频道', 1220, 480, { size: 22, color: MUTE, align: 'center', a: fade(lt, 5.2, 5.9) });
  // 订阅者
  const subs = [['好友 B', 380], ['好友 C', 500], ['好友 D', 620]];
  subs.forEach(([n, y], i) => {
    const sa = eBack(P(lt, 7.0 + i * 0.5, 7.7 + i * 0.5));
    const ft = Math.max(0, ...pubs.map((t) => Math.sin(clamp(P(lt, t + 1.8, t + 2.6)) * Math.PI)));
    box(1530, y, 240, 90, 'WS 服务器', { color: C_WS, sub: n, a: clamp(sa * 2), s: clamp(sa, 0.01, 1.05), size: 32, hot: false });
    if (ft > 0) { ctx.save(); ctx.globalAlpha *= ft * 0.5; glow(C_OK, 26); rr(1530, y, 240, 90, 22); ctx.strokeStyle = C_OK; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); }
    const ap = P(lt, 8.3 + i * 0.5, 9.1 + i * 0.5);
    arrow(1530, y + 45, 1352, 540 + (i - 1) * 14, { color: C_WS, p: eOut(ap), dash: [10, 8], w: 3, a: 0.9 });
    pubs.forEach((t) => packet(1352, 540 + (i - 1) * 14, 1530, y + 45, eIO(P(lt, t + 0.9, t + 1.8)), C_CH, { r: 9 }));
  });
  text('订阅', 1440, 660 - 190, { size: 22, color: C_WS, weight: 700, a: fade(lt, 9.3, 10) });
  pubs.forEach((t) => packet(970, 540, 1090, 540, eIO(P(lt, t, t + 0.9)), C_CH, { r: 10 }));
  text('发布', 1030, 505, { size: 22, color: C_CH, weight: 700, align: 'center', a: fade(lt, 11.6, 12.2) });
  bullet(0, '每个用户一个频道', fade(lt, 4.6, 5.2));
  bullet(1, '频道属于被关注的人', fade(lt, 6.3, 6.9));
  bullet(2, '好友的服务器订阅它', fade(lt, 8.0, 8.6));
  bullet(3, '一次发布，全部收到', fade(lt, 12.0, 12.6), { color: C_OK });
}

// ───────── 场景 4：一次上报的完整路径 ─────────
function sceneFlow(lt, d) {
  header(lt, '04', '一次上报的路径', C_WS, '周期位置更新');
  const A = [900, 560], W1 = [1010, 500, 190, 120], HI = [1330, 190], CA = [1330, 380], PS = [1290, 660, 240, 110], W2 = [1640, 520, 190, 100], W3 = [1640, 700, 190, 100];
  phone(A[0], A[1], C_CH, 'A', { a: fade(lt, 0.3, 1) });
  box(...W1, 'WS 服务器', { color: C_WS, sub: 'A 的连接', a: fade(lt, 0.5, 1.2), size: 32 });
  const hf = Math.sin(clamp(P(lt, 6.4, 7.4)) * Math.PI), cf = Math.sin(clamp(P(lt, 8.2, 9.2)) * Math.PI);
  dbIcon(HI[0], HI[1], 120, 100, '位置历史库', { color: C_DB, a: fade(lt, 0.7, 1.4), fill: 0.2 + 0.5 * P(lt, 6.2, 7.2) });
  dbIcon(CA[0], CA[1], 120, 100, '位置缓存', { color: C_CACHE, a: fade(lt, 0.9, 1.6), fill: 0.3 + 0.4 * P(lt, 8, 9) });
  box(...PS, 'Redis Pub/Sub', { color: C_CH, sub: '频道 A', a: fade(lt, 1.1, 1.8), size: 30 });
  box(...W2, 'WS 服务器', { color: C_WS, sub: '好友 B', a: fade(lt, 1.3, 2.0), size: 32 });
  box(...W3, 'WS 服务器', { color: C_WS, sub: '好友 C', a: fade(lt, 1.5, 2.2), size: 32 });
  const steps = [
    [1.4, A[0] + 50, A[1] - 10, 1010, 560, C_CH],
    [5.8, 1200, 520, 1325, 260, C_DB],
    [7.6, 1200, 545, 1325, 440, C_CACHE],
    [9.6, 1200, 590, 1300, 700, C_CH],
  ];
  steps.forEach(([t0, x1, y1, x2, y2, col]) => {
    arrow(x1, y1, x2, y2, { color: col, p: eOut(P(lt, t0, t0 + 0.7)), w: 3.5, a: 0.85 });
    packet(x1, y1, x2, y2, eIO(P(lt, t0 + 0.2, t0 + 1.2)), col, { r: 10 });
  });
  const fan = [[1520, 700, 1640, 575, 13.0], [1520, 730, 1640, 750, 13.0]];
  fan.forEach(([x1, y1, x2, y2, t0]) => {
    arrow(x1, y1, x2, y2, { color: C_CH, p: eOut(P(lt, t0, t0 + 0.6)), w: 3.5, a: 0.85 });
    packet(x1, y1, x2, y2, eIO(P(lt, t0 + 0.2, t0 + 1.3)), C_CH, { r: 10 });
  });
  [[W2, 1], [W3, 2]].forEach(([w, k]) => { const f = Math.sin(clamp(P(lt, 14.3, 15.3)) * Math.PI) * (lt > 14.3 ? 1 : 0); if (f > 0) { ctx.save(); ctx.globalAlpha *= f * 0.6; glow(C_OK, 24); rr(w[0], w[1], w[2], w[3], 22); ctx.strokeStyle = C_OK; ctx.lineWidth = 4; ctx.stroke(); ctx.restore(); } });
  text('好友所在的服务器', 1735, 650, { size: 22, color: MUTE, align: 'center', a: fade(lt, 13.8, 14.5) });
  text('接下来：订阅端按距离过滤', 1230, 880, { size: 26, color: MUTE, a: fade(lt, 15.6, 16.3) });
  ['1 上报到 WS 服务器', '2 写入位置历史库', '3 更新位置缓存', '4 发布到自己的频道', '5 广播给订阅服务器'].forEach((s, i) => {
    bullet(i, s, fade(lt, [1.4, 5.8, 7.6, 9.6, 13.0][i], [2.0, 6.4, 8.2, 10.2, 13.6][i]));
  });
}

// ───────── 场景 5：按距离过滤（核心地图动画） ─────────
const MAPR = 230;
const FR = [
  [1260, 330, 1], [1380, 430, 1], [1000, 600, 1], [1610, 520, 1], [1170, 800, 1], [1550, 300, 1], [1450, 700, 0], [950, 330, 0], [1700, 760, 1],
];
const aPos = (lt) => { const u = clamp(lt / 19); return [lerp(1150, 1420, u), lerp(560, 500, u)]; };
const TICKS = [1.2, 3.6, 6.0, 8.4, 10.8, 13.2, 15.6, 18.0];
function sceneFilter(lt, d) {
  header(lt, '05', '按距离过滤', C_DB, '订阅端服务器来判断');
  mapPanel(830, 170, 990, 740, fade(lt, 0.2, 0.8));
  const [ax, ay] = aPos(lt);
  // 半径圈
  const ra = fade(lt, 0.4, 1.2);
  ctx.save(); ctx.globalAlpha *= ra; ctx.strokeStyle = C_DB; ctx.lineWidth = 3; ctx.setLineDash([12, 10]); glow(C_DB, 10);
  ctx.beginPath(); ctx.arc(ax, ay, MAPR, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  ctx.fillStyle = C_DB + '0d'; ctx.fill(); ctx.restore();
  text('5 英里（示意比例）', ax, ay - MAPR - 14, { size: 22, color: C_DB, align: 'center', weight: 700, a: ra });
  // 最近一次已到达的结果
  const state = FR.map((f, j) => {
    let st = null, k = -1;
    TICKS.forEach((t, ti) => { if (f[2] && lt >= t + 1.0) { const [pa, pb] = aPos(t); const dd = dist(pa, pb, f[0], f[1]); st = { inr: dd <= MAPR, mi: dd / MAPR * 5, t }; k = ti; } });
    return st;
  });
  // 好友
  FR.forEach(([fx, fy, on], j) => {
    const x = fx + 6 * Math.sin(lt * 0.6 + j), y = fy + 5 * Math.cos(lt * 0.5 + j * 2);
    const born = fade(lt, 0.6 + j * 0.08, 1.2 + j * 0.08);
    const st = state[j];
    const col = !on ? DIM : !st ? NEUTRAL : st.inr ? C_OK : DIM;
    avatar(x, y, col, { r: 15, a: born, ring: st && st.inr ? 1 : 0, fillA: on ? 1 : 0.2 });
    if (!on) text('离线', x, y + 40, { size: 20, color: DIM, align: 'center', a: born * fade(lt, 1.2, 1.8) });
    else if (st) {
      if (st.inr) text(`${st.mi.toFixed(1)} 英里`, x, y + 42, { size: 22, color: C_OK, align: 'center', weight: 700, font: MONO });
      else text('已过滤', x, y + 40, { size: 20, color: RED, align: 'center', a: 0.8 });
    }
  });
  // 消息扇出
  TICKS.forEach((t) => {
    const [pa, pb] = aPos(t);
    ripple(pa, pb, P(lt, t, t + 0.8), C_CH, 70);
    FR.forEach(([fx, fy, on], j) => {
      if (!on) return;
      const x = fx + 6 * Math.sin(t * 0.6 + j), y = fy + 5 * Math.cos(t * 0.5 + j * 2);
      const dd = dist(pa, pb, x, y), inr = dd <= MAPR, frac = inr ? 1 : MAPR / dd;
      const p = eIO(P(lt, t + 0.1, t + 0.1 + 0.9)) * frac;
      const ex = lerp(pa, x, frac), ey = lerp(pb, y, frac);
      if (lt < t + 0.1 || lt > t + 1.1) return;
      const pr = p / 1; const q = P(lt, t + 0.1, t + 1.0);
      if (q < 1) packet(pa, pb, x, y, clamp(p), C_CH, { r: 8, trail: 0.15 });
      if (!inr) cross(ex, ey, P(lt, t + 0.95, t + 1.55));
    });
  });
  avatar(ax, ay, C_CH, { r: 21, ring: 1, a: fade(lt, 0.3, 0.9) });
  text('A', ax, ay + 8, { size: 22, weight: 800, align: 'center', a: fade(lt, 0.3, 0.9) });
  bullet(0, '订阅端服务器算距离', fade(lt, 1.4, 2.0));
  bullet(1, '5 英里内：推送给客户端', fade(lt, 5.2, 5.8), { color: C_OK });
  bullet(2, '超出半径：直接丢弃', fade(lt, 8.2, 8.8), { color: RED });
  statCard(110, 640, 640, '一次上报的扇出', '≈ 40 份', { color: C_CH, a: fade(lt, 15.0, 15.8), note: '400 好友 × 10% 在线' });
}

// ───────── 场景 6：位置缓存 + TTL ─────────
const ROWS = [
  { u: 'u_1042', ll: '37.77,-122.41', up: [0, 5.5, 11.5] },
  { u: 'u_2217', ll: '37.79,-122.39', up: [0, 6.2, 12.5] },
  { u: 'u_3390', ll: '37.74,-122.44', up: [0, 5.0] },
  { u: 'u_4128', ll: '37.80,-122.42', up: [0, 4.4, 10.6, 16.4] },
];
const TTL = 8.0, R0 = 1.4;
function sceneCache(lt, d) {
  header(lt, '06', '位置缓存 + TTL', C_CACHE, '只存最新，过期即离线');
  const pa = fade(lt, 0.3, 1.0);
  glass(830, 190, 700, 520, { a: pa, accent: C_CACHE });
  text('Redis 位置缓存', 862, 240, { size: 26, weight: 800, color: C_CACHE, a: pa });
  [['user_id', 862], ['(纬度, 经度)', 1000], ['timestamp', 1230], ['TTL', 1390]].forEach(([s, x]) => text(s, x, 288, { size: 20, color: DIM, font: MONO, a: pa }));
  dbIcon(1620, 300, 150, 190, '位置历史库', { color: C_DB, a: fade(lt, 0.8, 1.5), fill: clamp(0.08 + 0.1 * (lt > 5 ? (lt - 5) / 4 : 0), 0, 0.85) });
  text('Cassandra · 只追加', 1695, 560, { size: 20, color: MUTE, align: 'center', a: fade(lt, 14.2, 15) });
  ROWS.forEach((r, i) => {
    const y = 316 + i * 96, born = fade(lt, 0.9 + i * 0.25, 1.5 + i * 0.25);
    let last = R0, k = 0;
    r.up.forEach((u, ui) => { const tt = u === 0 ? R0 : u; if (lt >= tt) { last = tt; k = ui; } });
    const age = lt - last, rem = clamp(1 - age / TTL);
    const dead = P(lt, last + TTL, last + TTL + 0.8);
    const fl = Math.max(0, 1 - (lt - last) / 0.7) * (k > 0 ? 1 : 0);
    ctx.save(); ctx.globalAlpha *= born * (1 - dead * 0.85);
    glass(850, y, 660, 80, { r: 16, accent: fl > 0 ? C_OK : null });
    text(r.u, 872, y + 49, { size: 24, weight: 700, font: MONO });
    text(r.ll, 1000, y + 49, { size: 22, font: MONO, color: INK });
    text(`10:0${k}:${12 + i * 7}`, 1230, y + 49, { size: 22, font: MONO, color: fl > 0 ? C_OK : MUTE });
    rr(1390, y + 30, 100, 18, 9); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    if (rem > 0.01) { ctx.fillStyle = rem < 0.3 ? RED : C_CACHE; glow(rem < 0.3 ? RED : C_CACHE, 10); rr(1390, y + 30, Math.max(14, 100 * rem), 18, 9); ctx.fill(); }
    ctx.restore();
    // 上报：包飞向缓存行，同时追加到历史库
    r.up.forEach((u) => { if (u === 0) return;
      packet(1500, y + 40, 1620, 400, eIO(P(lt, u + 0.15, u + 1.1)), C_DB, { r: 7 });
    });
    if (dead > 0.2) { text('已过期', 1390, y + 49, { size: 24, color: RED, weight: 800, a: dead }); }
  });
  const exp = fade(lt, 13.6, 14.4);
  if (exp > 0) badge(850, 744, '过期 = 视为不活跃，离线', RED, exp);
  bullet(0, 'user_id → 位置 + 时间戳', fade(lt, 1.4, 2.0));
  bullet(1, '设了 TTL：不上报就过期', fade(lt, 9.4, 10.0));
  bullet(2, '历史另存，不进读路径', fade(lt, 14.8, 15.4), { color: C_DB });
  statCard(110, 640, 640, '读附近列表', '只看缓存', { color: C_CACHE, a: fade(lt, 16.2, 17), note: '示意：TTL 已压缩' });
}

// ───────── 场景 7：为什么选 Pub/Sub ─────────
function sceneWhy(lt, d) {
  header(lt, '07', '为什么选 Pub/Sub', C_CH, '轻，而且够用');
  // lane 1
  const a1 = fade(lt, 4.4, 5.2);
  glass(830, 200, 990, 200, { a: a1, accent: C_CH });
  text('没人订阅 → 直接丢弃', 862, 250, { size: 26, weight: 700, color: C_CH, a: a1 });
  text('不像消息队列，要把消息留着', 862, 286, { size: 22, color: MUTE, a: a1 });
  avatar(1230, 340, C_CH, { r: 16, a: a1 }); pill(1420, 312, 230, 56, '频道 X · 0 订阅者', C_CH, { a: a1, size: 20, solid: false });
  for (let k = 0; k < 3; k++) {
    const t0 = 5.2 + k * 1.6, p = P(lt, t0, t0 + 1.0);
    if (p > 0 && p < 1) { const x = lerp(1250, 1500, eIO(p)); dot(x, 340, 8 * (1 - Math.max(0, p - 0.7) * 3), C_CH, { g: 16, a: p > 0.8 ? 1 - (p - 0.8) * 5 : 1 }); if (p > 0.78) cross(1520, 340, (p - 0.78) / 0.22, MUTE, 10); }
  }
  // lane 2
  const a2 = fade(lt, 10.0, 10.8);
  glass(830, 430, 990, 200, { a: a2, accent: C_CH });
  text('频道名提前约定', 862, 480, { size: 26, weight: 700, color: C_CH, a: a2 });
  text('用户一上线，直接订阅即可', 862, 516, { size: 22, color: MUTE, a: a2 });
  pill(1230, 540, 300, 56, 'loc:{用户ID}', C_CH, { a: a2, size: 24, solid: lt > 12.6 });
  text('示意命名', 1380, 530, { size: 20, color: DIM, align: 'center', a: a2 });
  const up = eBack(P(lt, 11.4, 12.2)); if (up > 0.02) avatar(1620, 568, C_OK, { r: 16 * clamp(up), a: clamp(up * 2) });
  arrow(1600, 568, 1536, 568, { color: C_OK, p: eOut(P(lt, 12.2, 12.8)), w: 3.5, dash: [8, 6] });
  text('订阅', 1580, 548, { size: 22, color: C_OK, align: 'center', weight: 700, a: fade(lt, 12.6, 13.2) });
  // lane 3
  const a3 = fade(lt, 15.0, 15.8);
  glass(830, 660, 990, 240, { a: a3, accent: C_CH });
  text('偶尔丢一个点，可以接受', 862, 710, { size: 26, weight: 700, color: C_CH, a: a3 });
  const xs = [940, 1130, 1320, 1510, 1700];
  ctx.save(); ctx.globalAlpha *= a3; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(900, 810); ctx.lineTo(1750, 810); ctx.stroke(); ctx.restore();
  xs.forEach((x, i) => {
    const p = eBack(P(lt, 15.8 + i * 0.35, 16.4 + i * 0.35));
    const lost = i === 2 && lt > 17.6;
    if (p > 0.02) {
      if (lost) { ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(x, 810, 13, 0, 7); ctx.stroke(); ctx.restore(); cross(x, 810, 0.5, RED, 8); }
      else avatar(x, 810, C_OK, { r: 13 * clamp(p), a: clamp(p * 2) });
      text(`${i * 30} 秒`, x, 856, { size: 20, color: MUTE, align: 'center', font: MONO, a: clamp(p * 2) });
    }
  });
  if (lt > 17.6) { text('丢了', 1320, 770, { size: 22, color: RED, align: 'center', weight: 700, a: fade(lt, 17.6, 18.2) });
    arrow(1330, 788, 1500, 788, { color: C_OK, p: eOut(P(lt, 18.4, 19.2)), w: 3, a: 0.9 }); text('下一次补上', 1470, 770, { size: 22, color: C_OK, align: 'center', a: fade(lt, 19.0, 19.6) }); }
  bullet(0, '无订阅者 → 不留消息', fade(lt, 4.8, 5.4));
  bullet(1, '频道名提前约定', fade(lt, 10.2, 10.8));
  bullet(2, '丢一个点，30 秒后补上', fade(lt, 15.4, 16.0), { color: C_OK });
}

// ───────── 场景 8：瓶颈在吞吐 ─────────
function sceneScale(lt, d) {
  header(lt, '08', '瓶颈在吞吐', RED, '容量和吞吐，是两张账');
  const cards = [[830, 310, '位置更新', '33.4 万/秒', C_CH, 2.6], [1160, 200, '扇出', '× 40', C_CH, 4.6]];
  cards.forEach(([x, w, l, v, c, t0]) => { const a = fade(lt, t0, t0 + 0.7); glass(x, 200, w, 150, { a, accent: c }); text(l, x + 24, 246, { size: 22, color: MUTE, a }); text(v, x + 24, 316, { size: 46, weight: 800, font: MONO, color: c, a }); });
  text('=', 1395, 292, { size: 56, weight: 800, color: MUTE, align: 'center', a: fade(lt, 6.4, 7) });
  const ra = fade(lt, 6.8, 7.6);
  glass(1430, 200, 390, 150, { a: ra, accent: RED });
  text('推送量', 1454, 246, { size: 22, color: MUTE, a: ra });
  const cnt = Math.round(1400 * eOut(P(lt, 7.0, 9.6)));
  text(`≈ ${cnt} 万/秒`, 1454, 316, { size: 46, weight: 800, font: MONO, color: RED, a: ra });
  // 容量账
  const ma = fade(lt, 10.6, 11.4);
  text('容量：频道内存', 830, 424, { size: 24, weight: 700, color: C_CACHE, a: ma });
  const bw = eOut(P(lt, 11.0, 12.4));
  ctx.save(); ctx.globalAlpha *= ma; rr(830, 446, 990, 56, 14); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.restore();
  [0, 1].forEach((i) => { const p = eOut(P(lt, 12.2 + i * 0.5, 13.0 + i * 0.5)); if (p > 0) { ctx.save(); ctx.globalAlpha *= p; glow(C_OK, 14); rr(832 + i * 494, 448, 486 * p, 52, 12); ctx.fillStyle = C_OK + '55'; ctx.fill(); ctx.strokeStyle = C_OK; ctx.lineWidth = 2.5; ctx.stroke(); ctx.shadowBlur = 0; ctx.restore(); text('Redis 100 GB', 832 + i * 494 + 243, 484, { size: 24, weight: 700, align: 'center', font: MONO, a: p }); } });
  text('≈200 GB，两台就够', 1820, 424, { size: 24, weight: 700, color: C_OK, align: 'right', a: fade(lt, 14, 14.8) });
  // 吞吐账
  const ga = fade(lt, 15.4, 16.2);
  text('吞吐：单机 10 万次/秒', 830, 592, { size: 24, weight: 700, color: RED, a: ga });
  const n = Math.floor(140 * eIO(P(lt, 16.0, 19.6)));
  for (let i = 0; i < 140; i++) {
    const c = i % 35, r = Math.floor(i / 35), x = 836 + c * 27.4, y = 628 + r * 40;
    ctx.save(); ctx.globalAlpha *= ga; rr(x, y, 21, 30, 5); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
    if (i < n) { const col = i < 2 ? C_OK : RED; ctx.fillStyle = col + (i < 2 ? 'cc' : '99'); glow(col, i < 2 ? 10 : 0); rr(x, y, 21, 30, 5); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); }
    ctx.restore();
  }
  text(`至少 ${Math.min(140, n)} 台`, 1820, 592, { size: 26, weight: 800, font: MONO, color: RED, align: 'right', a: ga });
  text('原书估算，实际需压测', 830, 840, { size: 22, color: DIM, a: fade(lt, 19.2, 20) });
  bullet(0, '容量：两台 Redis 够', fade(lt, 10.8, 11.4), { color: C_OK });
  bullet(1, '吞吐：140 台起步', fade(lt, 15.6, 16.2), { color: RED });
  statCard(110, 640, 640, '频道内存', '≈ 200 GB', { color: C_CACHE, a: fade(lt, 12.0, 12.7) });
  statCard(110, 770, 640, '推送吞吐', '≈ 1400 万/秒', { color: RED, a: fade(lt, 8.6, 9.3) });
}

// ───────── 场景 9：频道分片 ─────────
function drawRing(lt, nodes, t0, opts = {}) {
  ringBase(fade(lt, t0, t0 + 0.8));
  nodes.forEach((n, i) => ringNode(n, { s: clamp(eBack(P(lt, t0 + 0.3 + i * 0.25, t0 + 0.9 + i * 0.25)), 0.01, 1.1), a: clamp(P(lt, t0 + 0.3 + i * 0.25, t0 + 0.7 + i * 0.25) * 2) }));
}
function sceneShard(lt, d) {
  header(lt, '09', '频道分片', SC[1], 'Redis 集群 + 一致性哈希');
  drawRing(lt, NODES, 0.8);
  CHS.forEach((c, i) => { const o = ownerOf(c, NODES); ringChan(c, o[2], { a: fade(lt, 2.6 + i * 0.1, 3.2 + i * 0.1), flash: c === 33 && lt > 12 ? 1 : 0 }); });
  text('频道按哈希分布在各节点', RG.x, RG.y + 6, { size: 22, color: MUTE, align: 'center', a: fade(lt, 3.6, 4.4) });
  // ZooKeeper
  const za = fade(lt, 4.8, 5.6);
  box(830, 210, 290, 110, 'ZooKeeper', { color: C_WS, sub: '节点 + 频道分布', a: za, size: 32 });
  NODES.forEach((n, i) => { const [x, y] = rp(n[0]); const p = P(lt, 5.4 + i * 0.3, 6.2 + i * 0.3);
    if (p > 0) { ctx.save(); ctx.globalAlpha *= 0.3; ctx.strokeStyle = n[2]; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(1120, 265); ctx.lineTo(lerp(1120, x, p), lerp(265, y, p)); ctx.stroke(); ctx.restore(); } });
  text('存活节点', 1150, 240, { size: 20, color: MUTE, a: fade(lt, 6.4, 7.0) });
  // WS 服务器查哈希环
  const wa = fade(lt, 8.6, 9.4);
  box(830, 600, 220, 110, 'WS 服务器', { color: C_WS, sub: '缓存哈希环', a: wa, size: 32 });
  arrow(940, 310, 940, 596, { color: C_WS, p: eOut(P(lt, 8.0, 9.0)), w: 3, dash: [8, 8], a: 0.8 });
  text('分布数据', 960, 470, { size: 20, color: MUTE, a: fade(lt, 8.6, 9.2) });
  const [tx, ty] = rp(45), [cx2, cy2] = rp(33, RG.R - 34);
  const fl = P(lt, 11.4, 12.2);
  if (fl > 0) {
    const [hx, hy] = rp(33, RG.R - 34);
    dot(hx, hy, 12, C_CH, { g: 22, a: 0.9 });
    text('频道 A', hx, hy - 24, { size: 22, color: C_CH, weight: 800, align: 'center', a: clamp(fl * 2) });
    arrow(1050, 660, hx - 12, hy + 6, { color: C_WS, p: eOut(P(lt, 12.2, 13.0)), w: 3, dash: [8, 8], a: 0.9 });
    text('哈希 → R2', 1140, 780, { size: 22, color: MUTE, a: fade(lt, 12.6, 13.2) });
    packet(1050, 665, tx, ty, eIO(P(lt, 13.4, 14.4)), C_CH, { r: 10 });
    packet(1050, 665, tx, ty, eIO(P(lt, 15.0, 16.0)), C_OK, { r: 10 });
    const nf = Math.max(Math.sin(clamp(P(lt, 14.3, 15.0)) * Math.PI), Math.sin(clamp(P(lt, 15.9, 16.6)) * Math.PI));
    ringNode(NODES[1], { flash: nf });
  }
  text('发布、订阅都去 R2', 830, 776, { size: 22, color: C_OK, weight: 700, a: fade(lt, 14.6, 15.4) });
  bullet(0, '频道分片到 Redis 集群', fade(lt, 1.0, 1.6));
  bullet(1, 'ZooKeeper 记录节点与分布', fade(lt, 5.0, 5.6));
  bullet(2, 'WS 服务器算出频道在哪台', fade(lt, 10.0, 10.6));
  bullet(3, '分片：一致性哈希', fade(lt, 17.0, 17.6), { color: SC[1] });
}

// ───────── 场景 10：节点增减与重新订阅 ─────────
function sceneMove(lt, d) {
  header(lt, '10', '节点增减的代价', RED, '频道带着订阅状态');
  const tMove = 8.0;
  const nodes = lt >= tMove ? [...NODES, NODE5] : NODES;
  drawRing(lt, NODES, 0.5);
  CHS.forEach((c, i) => {
    const mv = MOVED.includes(c) && lt >= tMove + 0.4;
    const o = mv ? NODE5 : ownerOf(c, NODES);
    const fl = MOVED.includes(c) ? Math.sin(clamp(P(lt, tMove + 0.4, tMove + 1.4)) * Math.PI) : 0;
    ringChan(c, o[2], { a: fade(lt, 1.6 + i * 0.08, 2.2 + i * 0.08), flash: fl });
  });
  // 订阅者
  const subs = [330, 450, 570];
  subs.forEach((y, i) => box(830, y, 210, 84, 'WS 服务器', { color: C_WS, sub: `订阅者 ${i + 1}`, a: fade(lt, 2.6 + i * 0.2, 3.2 + i * 0.2), size: 32 }));
  subs.forEach((y, i) => { const [x, yy] = rp(70); const p = P(lt, 3.6 + i * 0.25, 4.4 + i * 0.25);
    if (p > 0) { ctx.save(); ctx.globalAlpha *= 0.4; ctx.strokeStyle = C_WS; ctx.lineWidth = 2; ctx.setLineDash([6, 8]); ctx.beginPath(); ctx.moveTo(1040, y + 42); ctx.lineTo(lerp(1040, x - 40, p), lerp(y + 42, yy, p)); ctx.stroke(); ctx.restore(); } });
  text('频道上的订阅状态', 940, 300, { size: 22, color: MUTE, align: 'center', a: fade(lt, 4.0, 4.8) });
  // 新增 R5
  const n5 = eBack(P(lt, tMove - 0.4, tMove + 0.4));
  if (lt > tMove - 0.5) ringNode(NODE5, { s: clamp(n5, 0.01, 1.1), a: clamp(n5 * 2), flash: Math.sin(clamp(P(lt, tMove, tMove + 1)) * Math.PI) });
  text('新增节点', ...rp(57, RG.R + 62), { size: 22, color: C_OK, weight: 700, align: 'center', a: fade(lt, tMove, tMove + 0.6) });
  // 重新订阅
  const [n5x, n5y] = rp(57);
  subs.forEach((y, i) => {
    const t0 = 10.0 + i * 0.35;
    arrow(1040, y + 42, n5x - 38, n5y - 4 + (i - 1) * 8, { color: C_OK, p: eOut(P(lt, t0, t0 + 0.7)), w: 3.5, a: 0.9, dash: [10, 8] });
    packet(1040, y + 42, n5x - 38, n5y - 4 + (i - 1) * 8, eIO(P(lt, t0 + 0.2, t0 + 1.1)), C_OK, { r: 9 });
  });
  text('重新订阅', 1110, 700, { size: 24, color: C_OK, weight: 700, a: fade(lt, 10.4, 11.1) });
  text('只搬 3 / 14 个频道', RG.x, RG.y + 6, { size: 22, color: MUTE, align: 'center', a: fade(lt, 18.4, 19.2) });
  // 漏点示意条
  const sa = fade(lt, 12.2, 13.0);
  text('迁移期间（示意）', 830, 790, { size: 22, color: MUTE, a: sa });
  [0, 1, 2, 3].forEach((i) => {
    const x = 860 + i * 120, lost = i === 2 && lt > 14;
    if (lost) { ctx.save(); ctx.globalAlpha *= sa; ctx.strokeStyle = RED; ctx.setLineDash([5, 5]); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, 840, 13, 0, 7); ctx.stroke(); ctx.restore(); }
    else avatar(x, 840, C_OK, { r: 13, a: sa });
  });
  text('漏一点，可接受', 1300, 850, { size: 24, color: RED, weight: 700, a: fade(lt, 14.2, 14.9) });
  bullet(0, '节点不是无状态的', fade(lt, 1.6, 2.2));
  bullet(1, '频道搬家 → 重新订阅', fade(lt, 8.0, 8.6));
  bullet(2, '期间可能漏点，放低峰', fade(lt, 13.0, 13.6));
  bullet(3, '一致性哈希：搬得最少', fade(lt, 18.0, 18.6), { color: C_OK });
}

// ───────── 场景 11：总结 ─────────
function sceneEnd(lt, d) {
  text('附近好友', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Nearby Friends', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['长连接', 'WebSocket 双向实时', SC[1]], ['每人一频道', '好友服务器订阅，一发多收', SC[2]], ['距离过滤', '五英里内才推送', SC[3]]].forEach(([w, s, c], k) => {
    const t0 = 1.0 + k * 1.2, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 62, weight: 800 });
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  text('规模上来之后', 110, 750, { size: 24, color: MUTE, a: fade(lt, 4.6, 5.4) });
  let bx = 110;
  ['频道分片', '一致性哈希', '位置缓存 + TTL'].forEach((s, k) => { bx += badge(bx, 780, s, '#8b8dfc', fade(lt, 4.8 + k * 0.25, 5.6 + k * 0.25)) + 16; });
  text('Geohash 频道池是「附近陌生人」的扩展，不是本章主方案', 110, 880, { size: 20, color: DIM, a: fade(lt, 6.4, 7.2) });
}

export const scenes = { title: sceneTitle, problem: sceneProblem, ws: sceneWs, channel: sceneChannel, flow: sceneFlow, filter: sceneFilter, cache: sceneCache, why: sceneWhy, scale: sceneScale, shard: sceneShard, move: sceneMove, end: sceneEnd };
