// 第 4 章 限流器：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 4, title: 'Rate Limiter', en: 'Rate Limiter' };

// 角色配色：请求(未决) 浅灰蓝 · 放行 青柠 · 拒绝 红 · 限流器 靛 · 令牌 琥珀 · 队列/服务 青
const REQC = '#cfd6f0', PASS = SC[4], GATE = SC[1], TOK = SC[3], QUE = SC[0], PINK = SC[2], VIO = '#b794f6';

// ───────── 通用小组件 ─────────
const reqDot = (x, y, c, a = 1, r = 13) => dot(x, y, r, c, { g: 14, a });
function cross(x, y, a = 1, s = 6, color = '#06080f') {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); ctx.restore();
}
function gateBar(x, yc, h, { a = 1, s = 1, label = 'Rate limiter' } = {}) {
  if (a <= 0 || s <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, yc); ctx.scale(s, s);
  glow(GATE, 24); rr(-20, -h / 2, 40, h, 16); ctx.fillStyle = GATE + '44'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = GATE; ctx.stroke(); ctx.shadowBlur = 0;
  if (label) text(label, 0, -h / 2 - 18, { size: 26, weight: 700, align: 'center' });
  ctx.restore();
}
/** 请求沿车道走到闸口，放行则继续前进，拒绝则掉落消失 */
function laneReq(lt, ta, x0, xg, xe, y, pass, o = {}) {
  const tr = o.travel ?? 0.7, af = o.after ?? 1.0, fall = o.fall ?? 110, r = o.r ?? 13;
  if (lt < ta - tr) return;
  if (lt < ta) { const p = (lt - (ta - tr)) / tr; reqDot(lerp(x0, xg, p), y, REQC, clamp(p * 4), r); return; }
  const s = lt - ta;
  if (pass) { const p = clamp(s / af); const a = 1 - P(p, 0.85, 1); if (a > 0) reqDot(lerp(xg, xe, p), y, PASS, a, r); return; }
  const a = 1 - P(s, 0.6, 1.4); if (a <= 0) return;
  const yy = y + fall * eOut(clamp(s / 0.7));
  reqDot(xg, yy, RED, a, r); cross(xg, yy, a);
  if (o.tag) text('429', xg + 24, yy + 7, { size: 20, weight: 700, color: RED, font: MONO, a });
}
const mapU = (kn, lt) => { if (lt <= kn[0][0]) return kn[0][1]; for (let i = 1; i < kn.length; i++) { if (lt <= kn[i][0]) return lerp(kn[i - 1][1], kn[i][1], (lt - kn[i - 1][0]) / (kn[i][0] - kn[i - 1][0])); } return kn[kn.length - 1][1]; };

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  gateBar(1560, 540, 280, { s: eBack(P(lt, 1.0, 1.7)), a: eOut(P(lt, 1.0, 1.4)), label: null });
  for (let i = 0; i < 40; i++) { const ta = 2.0 + i * 0.2; laneReq(lt, ta, 1250, 1560, 1850, 540 + (rnd(i + 5) - 0.5) * 120, i % 3 === 0, { travel: 1.0, after: 1.0, fall: 130 }); }
  text('SYSTEM DESIGN INTERVIEW · ANIMATED GUIDE', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = eOut(P(lt, 0.4, 1.4)); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 130px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('Rate Limiter', 104, 520); ctx.restore();
  text('Chapter 4', 112, 610, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 01 为什么要限流 ─────────
function sceneWhy(lt) {
  header(lt, '01', 'Why rate limit', GATE, 'Too many requests? Stop them at the door');
  const gx = 1250, gy = 540, tGate = 4.6;
  gateBar(gx, gy, 300, { s: eBack(P(lt, 3.8, 4.5)), a: eOut(P(lt, 3.8, 4.2)), label: 'Rate limiter' });
  let load = 0;
  for (let i = 0; i < 130; i++) {
    const ta = 1.2 + i * 0.12, pass = ta < tGate || i % 6 === 0, y = gy + (rnd(i + 3) - 0.5) * 80;
    laneReq(lt, ta, 830, gx, 1640, y, pass, { travel: 1.0, after: 1.0, tag: i % 4 === 1, r: 10, fall: 90 });
    if (pass && lt > ta + 1.0) load += 1 - P(lt - ta - 1.0, 0, 1.6);
  }
  const hot = load >= 6;
  box(1640, 470, 190, 140, 'Service', { color: SC[0], hot, sub: hot ? 'overloaded' : 'normal', size: 30 });
  text('Load', 1640, 650, { size: 22, color: MUTE });
  glass(1640, 664, 190, 18, { r: 9 });
  ctx.fillStyle = hot ? RED : PASS; rr(1642, 666, Math.max(10, clamp(load / 9) * 186), 14, 7); ctx.fill();
  const c1 = lt < tGate ? 'No limiter: every request hits the service' : 'With a limiter: extras are stopped at the door';
  text(c1, 830, 215, { size: 28, weight: 600, color: lt < tGate ? RED : PASS });
  bullet(0, 'Blocks denial-of-service (DoS)', eOut(P(lt, 9.0, 9.6)));
  bullet(1, 'Cuts cost', eOut(P(lt, 11.2, 11.8)));
  bullet(2, 'Avoids server overload', eOut(P(lt, 12.8, 13.4)));
  statCard(110, 660, 640, 'HTTP status code', '429', { color: RED, a: eOut(P(lt, 14.8, 15.5)), note: 'Too Many Requests' });
}

// ───────── 02 放在哪里 ─────────
function sceneWhere(lt) {
  header(lt, '02', 'Where to put it', SC[0], 'Client vs. server / gateway');
  const a1 = eOut(P(lt, 0.8, 1.5));
  text('1  In the client', 830, 215, { size: 28, weight: 700, a: a1 });
  box(830, 240, 250, 120, 'Client', { color: SC[0], sub: 'countdown', a: a1, size: 30 });
  const hot = lt > 6.4;
  box(1570, 240, 250, 120, 'Server API', { color: SC[1], a: a1, hot });
  arrow(1090, 300, 1550, 300, { color: DIM, dash: [10, 10], a: a1, w: 3 });
  for (let k = 0; k < 3; k++) packet(1090, 300, 1550, 300, (lt - (1.6 + k * 1.2)) / 1.2, PASS, { r: 8 });
  const sa = eOut(P(lt, 4.4, 5.0));
  box(1150, 410, 230, 70, 'Script', { color: PINK, a: sa, size: 26 });
  arrow(1390, 440, 1630, 372, { color: RED, a: sa, p: eOut(P(lt, 4.6, 5.2)), w: 3 });
  for (let k = 0; k < 10; k++) packet(1390, 440, 1630, 372, (lt - (5.0 + k * 0.4)) / 0.8, RED, { r: 8 });
  text('Calls the API directly', 1265, 512, { size: 22, color: MUTE, align: 'center', a: sa });
  if (hot) text('Still gets hit', 1695, 420, { size: 24, weight: 700, color: RED, align: 'center', a: eOut(P(lt, 6.4, 7.0)) });
  // 行 2
  const a2 = eOut(P(lt, 7.6, 8.3));
  text('2  Server / API gateway', 830, 585, { size: 28, weight: 700, a: a2 });
  box(830, 625, 250, 110, 'Client', { color: SC[0], a: a2 });
  box(1580, 625, 230, 110, 'Server API', { color: SC[1], a: a2 });
  gateBar(1330, 680, 170, { s: eBack(P(lt, 7.8, 8.5)), a: a2, label: 'Gateway · limiter' });
  for (let i = 0; i < 20; i++) laneReq(lt, 8.8 + i * 0.5, 1090, 1330, 1570, 680, i % 3 === 0, { travel: 0.6, after: 0.7, fall: 80, r: 11 });
  bullet(0, 'Client: easy to bypass', eOut(P(lt, 3.0, 3.6)), { color: RED });
  bullet(1, 'Server / gateway: all traffic', eOut(P(lt, 11.0, 11.6)), { color: PASS });
  const qa = eOut(P(lt, 13.4, 14.1));
  glass(110, 600, 640, 100, { a: qa, accent: GATE });
  text('Buttons hint. Servers enforce.', 140, 662, { size: 30, weight: 700, a: qa });
}

// ───────── 03 令牌桶 ─────────
const TK = { B: 5, t0: 1.5, L0: 2 };
const TREQ = [9.8, 11.4, 20.6, 20.75, 20.9, 21.05, 21.2, 21.35, 21.5, ...Array.from({ length: 11 }, (_, i) => 26.4 + i * 0.4)];
const TSIM = (() => { let L = TK.L0, t = TK.t0; return TREQ.map((ta) => { L = Math.min(TK.B, L + (ta - t)); t = ta; const ok = L >= 1, Lb = L; if (ok) L -= 1; return { ta, ok, Lb, La: L }; }); })();
function tokLevel(lt) { if (lt < TK.t0) return TK.L0; let L = TK.L0, t = TK.t0; for (const e of TSIM) { if (e.ta > lt) break; L = e.La; t = e.ta; } return Math.min(TK.B, L + (lt - t)); }
const SLOT = [[1020, 470], [1110, 470], [1200, 470], [1065, 390], [1155, 390]];
function coin(x, y, frac, a = 1, r = 32) {
  ctx.save(); ctx.globalAlpha *= a;
  if (frac >= 1) { glow(TOK, 16); ctx.fillStyle = TOK + '55'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = TOK; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = TOK + 'aa'; ctx.beginPath(); ctx.arc(x, y, r * 0.58, 0, 7); ctx.stroke(); }
  else { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    if (frac > 0.02) { ctx.lineWidth = 5; ctx.strokeStyle = TOK; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke(); } }
  ctx.restore();
}
function sceneToken(lt) {
  header(lt, '03', 'Token bucket', TOK, 'Pass = take one token');
  const ba = eOut(P(lt, 0.5, 1.3));
  glass(960, 230, 300, 310, { accent: TOK, r: 26, a: ba });
  text('Token bucket', 940, 266, { size: 26, weight: 700, color: TOK, align: 'right', a: ba });
  text('Capacity 5', 940, 300, { size: 24, color: MUTE, align: 'right', a: ba });
  text('Refill 1 / sec', 940, 332, { size: 24, color: MUTE, align: 'right', a: ba });
  text('(illustrative)', 940, 364, { size: 20, color: DIM, align: 'right', a: ba });
  arrow(1110, 165, 1110, 226, { color: TOK, a: ba, w: 4 });
  text('+1 / sec', 1136, 204, { size: 24, weight: 700, color: TOK, font: MONO, a: ba });
  const L = tokLevel(lt), full = Math.floor(L + 1e-9);
  if (ba > 0.5) SLOT.forEach(([x, y], i) => { coin(x, y, i < full ? 1 : i === full ? L - full : 0, ba); });
  // 满了溢出
  if (L >= TK.B - 1e-6 && lt > 4.5 && lt < 9.6) for (let k = 0; k < 3; k++) { const u = (lt * 0.9 + k / 3) % 1; dot(1268 + u * 26, 250 + u * u * 270, 9, TOK, { g: 10, a: 0.9 * (1 - u) * eOut(P(lt, 5.6, 6.1)) }); }
  text('Full: extra tokens are dropped', 1300, 340, { size: 26, color: MUTE, a: eOut(P(lt, 5.8, 6.4)) * (1 - P(lt, 9.0, 9.6)) });
  if (lt > 24.4) { // 容量 / 速率 强调
    const k = eOut(P(lt, 24.4, 25.1)); ctx.save(); ctx.globalAlpha *= k; ctx.strokeStyle = TOK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(1290, 240); ctx.lineTo(1304, 240); ctx.lineTo(1304, 530); ctx.lineTo(1290, 530); ctx.stroke(); ctx.restore();
    text('Capacity 5: burst size', 1326, 395, { size: 26, weight: 700, color: TOK, a: k });
    text('Refill rate: long-run speed', 1296, 204, { size: 26, weight: 700, color: TOK, a: eOut(P(lt, 28.0, 28.7)) });
  }
  // 车道
  const ly = 700;
  ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.beginPath(); ctx.moveTo(840, ly); ctx.lineTo(1690, ly); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha *= 0.5; ctx.beginPath(); ctx.moveTo(1110, 545); ctx.lineTo(1110, ly - 20); ctx.stroke(); ctx.restore();
  box(1700, 650, 130, 100, 'Service', { color: SC[0], size: 24, a: ba });
  TSIM.forEach((e) => {
    laneReq(lt, e.ta, 840, 1110, 1690, ly, e.ok, { travel: 0.6, after: 1.0, fall: 85, r: 14 });
    if (e.ok && lt >= e.ta && lt < e.ta + 0.4) { // 令牌飞出去
      const p = eIO((lt - e.ta) / 0.4), si = Math.max(0, Math.floor(e.Lb + 1e-9) - 1), [sx, sy] = SLOT[si];
      coin(lerp(sx, 1110, p), lerp(sy, ly, p), 1, 1 - p * 0.6, 32 - 10 * p);
    }
  });
  const capA = eOut(P(lt, 17.0, 17.6)) * (1 - P(lt, 24.0, 24.6)), capB = eOut(P(lt, 26.6, 27.2));
  text('After a quiet spell, 7 arrive at once (illustrative)', 840, 860, { size: 24, color: MUTE, a: capA });
  text('Steady 2.5 per second: only about 1 per second passes (illustrative)', 840, 860, { size: 24, color: MUTE, a: capB });
  const pn = TSIM.filter((e) => e.ok && e.ta <= lt).length, rn = TSIM.filter((e) => !e.ok && e.ta <= lt).length;
  bullet(0, 'Refill at a fixed rate', eOut(P(lt, 2.8, 3.4)));
  bullet(1, 'Each request takes one token', eOut(P(lt, 9.8, 10.4)));
  bullet(2, 'No token: rejected', eOut(P(lt, 12.0, 12.6)), { color: RED });
  bullet(3, 'Capacity: how big a burst', eOut(P(lt, 24.6, 25.2)));
  bullet(4, 'Rate: how fast, long-run', eOut(P(lt, 28.0, 28.6)));
  const ca = eOut(P(lt, 9.4, 10.0));
  statCard(110, 760, 305, 'Passed', String(pn), { color: PASS, a: ca, h: 104 });
  statCard(445, 760, 305, 'Rejected', String(rn), { color: RED, a: ca, h: 104 });
}

// ───────── 04 漏桶 ─────────
const LQ = { cap: 5, T: 1.0 };
const burst = (t, n = 8) => Array.from({ length: n }, (_, i) => t + i * 0.15);
const LARR = [...burst(3.6, 5), ...burst(11.6)];
const LSIM = (() => { const acc = []; let lastS = -1e9; return LARR.map((a, i) => { const inq = acc.filter((e) => e.s > a).length; if (inq >= LQ.cap) return { a, ok: false, id: (i % 8) + 1 }; const s = Math.max(a + 0.4, lastS + LQ.T); lastS = s; const e = { a, ok: true, s, id: (i % 8) + 1 }; acc.push(e); return e; }); })();
const LMAXWAIT = Math.max(...LSIM.filter((e) => e.ok).map((e) => e.s - e.a));
const LB = { x: 1000, y: 250, w: 240, h: 330 }, LX = 1120, LANE = 650;
const slotY = (r) => LB.y + LB.h - 42 - r * 60;
function sceneLeaky(lt) {
  header(lt, '04', 'Leaky bucket', QUE, 'A queue with steady outflow');
  const ba = eOut(P(lt, 0.8, 1.5));
  glass(LB.x, LB.y, LB.w, LB.h, { accent: QUE, r: 24, a: ba });
  for (let i = 1; i < 5; i++) { ctx.save(); ctx.globalAlpha *= ba * 0.5; ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(LB.x + 14, slotY(i) + 30); ctx.lineTo(LB.x + LB.w - 14, slotY(i) + 30); ctx.stroke(); ctx.restore(); }
  const qa = eOut(P(lt, 2.8, 3.4));
  text('FIFO queue', 980, 305, { size: 26, weight: 700, color: QUE, align: 'right', a: qa });
  text('Capacity 5', 980, 340, { size: 24, color: MUTE, align: 'right', a: qa });
  const oa = eOut(P(lt, 4.4, 5.0));
  arrow(LX, LB.y + LB.h, LX, LANE - 4, { color: DIM, dash: [8, 8], a: oa, w: 3, head: 10 });
  ctx.save(); ctx.globalAlpha *= oa; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 2; ctx.setLineDash([6, 10]); ctx.beginPath(); ctx.moveTo(LX, LANE); ctx.lineTo(1690, LANE); ctx.stroke(); ctx.restore();
  text('Fixed rate: 1 / sec (illustrative)', 1130, 705, { size: 24, color: MUTE, a: oa });
  box(1700, 605, 130, 90, 'Service', { color: SC[0], size: 24, a: ba });
  text('Requests', 840, 232, { size: 22, color: MUTE, a: ba });
  // 请求与队列
  const oks = LSIM.map((e, i) => ({ ...e, i })).filter((e) => e.ok);
  LSIM.forEach((e, i) => {
    if (lt < e.a - 0.6) return;
    if (!e.ok) { // 队满：被丢弃
      if (lt < e.a) { const p = (lt - (e.a - 0.6)) / 0.6; reqDot(lerp(840, LX, p), 200, REQC, clamp(p * 4), 13); return; }
      const s = lt - e.a, q = clamp(s / 0.9), al = 1 - P(s, 0.6, 1.4); if (al <= 0) return;
      const x = LX - 90 * eOut(q) - 20 * q, y = 200 + 360 * q * q; reqDot(x, y, RED, al, 13); cross(x, y, al); return;
    }
    const t = lt, rank = oks.filter((o) => o.i < i).reduce((s, o) => s + (t < o.s ? 1 : 1 - eIO(P(t, o.s, o.s + 0.35))), 0);
    let x = LX, y, col = QUE, al = 1;
    if (t < e.a) { const p = (t - (e.a - 0.6)) / 0.6; x = lerp(840, LX, p); y = 200; col = REQC; al = clamp(p * 4); reqDot(x, y, col, al, 13); return; }
    if (t < e.s) { y = lerp(200, slotY(rank), eOut(P(t, e.a, e.a + 0.4))); }
    else if (t < e.s + 1.3) { const d = eIO(P(t, e.s, e.s + 0.3)); y = lerp(slotY(0), LANE, d); x = lerp(LX, 1690, P(t, e.s + 0.3, e.s + 1.3)); col = PASS; al = 1 - P(t, e.s + 1.1, e.s + 1.3); if (d >= 1) { reqDot(x, y, col, al, 13); return; } }
    else return;
    const big = t < e.s + 0.3;
    ctx.save(); ctx.globalAlpha *= al; glow(col, 10); rr(x - 95, y - 24, 190, 48, 12); ctx.fillStyle = col + '33'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = col; ctx.stroke(); ctx.restore();
    text(`#${e.id}`, x, y + 8, { size: 24, weight: 700, font: MONO, align: 'center', a: al });
    if (big && t > e.a + 0.4) text(`waits ${(e.s - e.a).toFixed(1)} s`, 1258, y + 8, { size: 22, weight: 700, color: TOK, font: MONO, a: 0.95 * (t < e.s ? 1 : 1 - P(t, e.s, e.s + 0.3)) });
  });
  const full = LSIM.some((e) => !e.ok && e.a >= 10 && lt >= e.a + 0.4);
  text('Queue full: new requests dropped', 1130, 800, { size: 26, weight: 700, color: RED, a: eOut(P(lt, 12.6, 13.2)) });
  text(`Last in line waits ${LMAXWAIT.toFixed(1)} s`, 1130, 846, { size: 26, weight: 700, color: TOK, a: eOut(P(lt, 15.2, 15.8)) });
  void full;
  const qn = LSIM.filter((e) => e.ok && e.a <= lt && e.s > lt).length;
  bullet(0, 'First-in, first-out queue', eOut(P(lt, 3.4, 4.0)));
  bullet(1, 'Fixed outflow rate: smooth', eOut(P(lt, 9.0, 9.6)));
  bullet(2, 'Queue full: new ones dropped', eOut(P(lt, 12.8, 13.4)), { color: RED });
  bullet(3, 'Back of the line waits long', eOut(P(lt, 15.4, 16.0)), { color: TOK });
  statCard(110, 760, 640, 'Queue length', `${qn} / ${LQ.cap}`, { color: qn >= LQ.cap ? RED : QUE, a: ba, h: 104 });
}

// ───────── 05-08 窗口类算法（共用时间轴） ─────────
const TX0 = 850, TX1 = 1810, TT = 12, AXY = 740, WIN = 6, QUOTA = 5;
const tx = (u) => TX0 + (u / TT) * (TX1 - TX0);
const FT = [0.8, 1.6, 2.3, 3.0, 3.8, 4.6, 5.3, 6.5, 7.1, 7.8, 8.6, 9.2, 9.9, 11.0];
const BT = [5.5, 5.6, 5.7, 5.8, 5.9, 6.1, 6.2, 6.3, 6.4, 6.5, 7.6, 9.0, 11.7];
const BT10 = BT.slice(0, 10);
const stackIdx = (rq) => rq.map((t, i) => { let k = 0; for (let j = i - 1; j >= 0 && rq[j + 1] - rq[j] <= 0.151; j--) k++; return k; });
function fixedSim(rq) { const c = {}; return rq.map((t) => { const w = Math.floor(t / WIN); c[w] = c[w] || 0; const ok = c[w] < QUOTA; if (ok) c[w]++; return { ok }; }); }
function logSim(rq) { const ps = []; return rq.map((t) => { const n = ps.filter((s) => s > t - WIN + 1e-9).length; const ok = n < QUOTA; if (ok) ps.push(t); return { ok, n }; }); }
function counterSim(rq) {
  const c = {}; return rq.map((t) => {
    const w = Math.floor(t / WIN), prev = c[w - 1] || 0, cur = c[w] || 0, ov = 1 - (t - w * WIN) / WIN, tot = cur + 1 + prev * ov, ok = tot <= QUOTA + 1e-9;
    if (ok) c[w] = cur + 1; return { ok, prev, cur, ov, tot };
  });
}
const SIMS = { F: fixedSim(FT), B10: fixedSim(BT10), Bl: logSim(BT), Bc: counterSim(BT) };
const IDX = { F: stackIdx(FT), B10: stackIdx(BT10), B: stackIdx(BT) };

function axis(ba) {
  ctx.save(); ctx.globalAlpha *= ba; ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(TX0, AXY); ctx.lineTo(TX1 + 14, AXY); ctx.stroke();
  for (let s = 0; s <= TT; s += 2) { ctx.beginPath(); ctx.moveTo(tx(s), AXY); ctx.lineTo(tx(s), AXY + 10); ctx.stroke(); text(String(s), tx(s), AXY + 36, { size: 20, color: MUTE, align: 'center', font: MONO }); }
  text('Time (s, illustrative)', TX1, AXY + 70, { size: 20, color: DIM, align: 'right' });
  ctx.restore();
}
function winBox(w, ba, label, cnt, { pips = false, accent } = {}) {
  const x1 = tx(w * WIN) + 4, x2 = tx((w + 1) * WIN) - 4;
  glass(x1, 290, x2 - x1, 470, { accent: accent ?? (w ? SC[0] : SC[1]), a: ba, fill: 0.035 });
  text(label, x1 + 24, 338, { size: 26, weight: 700, a: ba });
  text(`${cnt} / ${QUOTA}`, x2 - 24, 340, { size: 28, weight: 800, font: MONO, align: 'right', color: cnt >= QUOTA ? TOK : INK, a: ba });
  if (pips) for (let i = 0; i < QUOTA; i++) { const px = x1 + 36 + i * 36; ctx.save(); ctx.globalAlpha *= ba; ctx.beginPath(); ctx.arc(px, 382, 12, 0, 7); if (i < cnt) { glow(PASS, 10); ctx.fillStyle = PASS; ctx.fill(); } else { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke(); } ctx.restore(); }
}
function blocks(u, rq, res, idx, drop, { expire = false } = {}) {
  rq.forEach((t, i) => {
    if (t > u) return;
    const p = eOut(clamp((u - t) / drop)), ok = res[i].ok, c = ok ? PASS : RED;
    const dim = expire ? 1 - 0.68 * P(u - WIN, t, t + 0.3) : 1;
    const x = tx(t), y = AXY - 8 - 34 - idx[i] * 40 + (1 - p) * -70;
    ctx.save(); ctx.globalAlpha *= p * dim; glow(c, expire && dim < 1 ? 0 : 10); rr(x - 15, y, 30, 34, 7); ctx.fillStyle = c; ctx.fill(); ctx.restore();
    if (!ok) { ctx.save(); ctx.globalAlpha *= p * dim; cross(x, y + 17, 1, 6); ctx.restore(); }
  });
}
function cursor(u, ba) {
  if (u <= 0.01) return; const x = tx(u);
  ctx.save(); ctx.globalAlpha *= ba * 0.5; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 7]); ctx.beginPath(); ctx.moveTo(x, 285); ctx.lineTo(x, AXY); ctx.stroke(); ctx.restore();
  dot(x, AXY, 8, '#fff', { g: 20, a: ba });
}
const cntIn = (rq, res, u, a, b) => rq.filter((t, i) => res[i].ok && t <= u && t >= a && t < b).length;
function legend(ba) {
  ctx.save(); ctx.globalAlpha *= ba;
  rr(850, 806, 24, 24, 6); ctx.fillStyle = PASS; ctx.fill(); text('Pass', 884, 826, { size: 22, color: MUTE });
  rr(960, 806, 24, 24, 6); ctx.fillStyle = RED; ctx.fill(); cross(972, 818, 1, 5); text('Reject', 994, 826, { size: 22, color: MUTE });
  ctx.restore();
}

// 05 固定窗口
const KN_F = [[3.8, 0], [7.6, 0.6], [9.8, 3.8], [11.0, 5.4], [12.3, 6.0], [14.8, 9.0], [15.9, 10.0], [16.7, 11.2], [17.2, 12]];
function sceneFixed(lt) {
  header(lt, '05', 'Fixed window', SC[1], 'One counter per time window');
  const u = mapU(KN_F, lt), ba = eOut(P(lt, 3.6, 4.4));
  axis(ba); legend(ba);
  const res = SIMS.F;
  winBox(0, ba, 'Window 1', cntIn(FT, res, u, 0, 6), { pips: true });
  winBox(1, ba, 'Window 2', cntIn(FT, res, u, 6, 12), { pips: true });
  text('Quota 5 · window 6 s (illustrative)', 830, 232, { size: 26, color: MUTE, a: ba });
  const flash = P(u, 6, 6.2) * (1 - P(u, 6.6, 7.3)); if (u > 5.99) text('Reset', tx(6) + 28, 440, { size: 30, weight: 800, color: SC[0], a: flash });
  blocks(u, FT, res, IDX.F, 0.3);
  cursor(u, ba);
  bullet(0, 'One counter per window', eOut(P(lt, 4.6, 5.2)));
  bullet(1, 'Under quota: pass', eOut(P(lt, 7.6, 8.2)), { color: PASS });
  bullet(2, 'At quota: reject', eOut(P(lt, 10.2, 10.8)), { color: RED });
  bullet(3, 'New window: counter resets', eOut(P(lt, 12.4, 13.0)));
  statCard(110, 730, 640, 'Stored per window', '1 counter', { color: SC[1], a: eOut(P(lt, 16.4, 17.1)) });
}

// 06 边界突发
const KN_B = [[3.6, 0], [7.0, 5.4], [7.3, 5.5], [8.6, 5.9], [9.3, 6.0], [9.9, 6.1], [11.5, 6.5], [12.1, 6.6]];
function sceneBoundary(lt) {
  header(lt, '06', 'Boundary burst', RED, 'The flaw at the reset moment');
  const u = mapU(KN_B, lt), ba = eOut(P(lt, 3.0, 3.8));
  axis(ba); legend(ba);
  const res = SIMS.B10;
  winBox(0, ba, 'Window 1', cntIn(BT10, res, u, 0, 6), { pips: true });
  winBox(1, ba, 'Window 2', cntIn(BT10, res, u, 6, 12), { pips: true });
  text('Quota 5 · window 6 s (illustrative)', 830, 232, { size: 26, color: MUTE, a: ba });
  if (u > 5.99) text('Reset', tx(6) + 28, 440, { size: 30, weight: 800, color: SC[0], a: P(u, 6, 6.1) * (1 - P(lt, 12.0, 12.8)) });
  blocks(u, BT10, res, IDX.B10, 0.12);
  cursor(u, ba * (1 - P(lt, 12.2, 12.8)));
  const k = eOut(P(lt, 14.4, 15.2));
  if (k > 0) {
    const x1 = tx(5.45), x2 = tx(6.55);
    ctx.save(); ctx.globalAlpha *= k; ctx.strokeStyle = RED; ctx.lineWidth = 4; glow(RED, 12); ctx.beginPath(); ctx.moveTo(x1, 795); ctx.lineTo(x1, 810); ctx.lineTo(x2, 810); ctx.lineTo(x2, 795); ctx.stroke(); ctx.restore();
    text('10 passed in about 1 second', (x1 + x2) / 2, 865, { size: 30, weight: 800, color: RED, align: 'center', a: k });
  }
  bullet(0, 'End of window 1: 5 requests', eOut(P(lt, 7.6, 8.2)));
  bullet(1, 'Start of window 2: 5 more', eOut(P(lt, 10.0, 10.6)));
  bullet(2, 'Each window is within quota', eOut(P(lt, 12.2, 12.8)), { color: PASS });
  bullet(3, 'Not any stretch of time', eOut(P(lt, 20.2, 20.8)), { color: TOK });
  statCard(110, 680, 640, 'Passed in about 1 s', '10 requests', { color: RED, a: eOut(P(lt, 18.0, 18.7)), note: 'quota 5' });
}

// 07 滑动窗口日志
const KN_L = [[1.0, 0], [3.6, 5.3], [4.8, 5.5], [6.4, 5.9], [7.0, 6.0], [13.8, 6.05], [14.4, 6.1], [15.6, 6.5], [16.6, 7.0], [17.2, 7.6], [17.6, 7.7], [19.0, 9.0], [21.0, 11.7], [21.7, 12]];
function boundaryRef(a) { ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.setLineDash([4, 8]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(tx(6), 290); ctx.lineTo(tx(6), AXY); ctx.stroke(); ctx.restore(); text('Fixed-window boundary', tx(6) + 10, 312, { size: 20, color: DIM, a }); }
function sceneLog(lt) {
  header(lt, '07', 'Sliding log', PINK, 'Keep every request timestamp');
  const u = mapU(KN_L, lt), ba = eOut(P(lt, 0.8, 1.6));
  axis(ba); legend(ba); boundaryRef(ba);
  const res = SIMS.Bl;
  const bx1 = tx(Math.max(0, u - WIN)), bx2 = tx(u);
  if (u > 0.2) { ctx.save(); ctx.globalAlpha *= ba; rr(bx1, 290, Math.max(4, bx2 - bx1), 462, 14); ctx.fillStyle = TOK + '14'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = TOK + 'cc'; glow(TOK, 10); ctx.stroke(); ctx.restore(); if (bx2 - bx1 > 330) text('Sliding window: last 6 s', bx1 + 16, 338, { size: 24, weight: 700, color: TOK, a: ba }); }
  blocks(u, BT, res, IDX.B, 0.12, { expire: true });
  cursor(u, ba);
  // 步骤 + 计数
  let cx = 830; [['1. Drop old entries', 7.6], ['2. Count the rest', 11.0], ['3. Pass if under quota', 13.4]].forEach(([s, t0], i) => { cx += badge(cx, 168, s, [PINK, TOK, PASS][i], eOut(P(lt, t0, t0 + 0.6))) + 14; });
  const n = BT.filter((t, i) => res[i].ok && t <= u && t > u - WIN + 1e-9).length;
  text('Entries in window', 830, 280, { size: 24, color: MUTE, a: ba });
  for (let i = 0; i < QUOTA; i++) { const px = 1100 + i * 34; ctx.save(); ctx.globalAlpha *= ba; ctx.beginPath(); ctx.arc(px, 272, 12, 0, 7); if (i < n) { glow(PASS, 10); ctx.fillStyle = PASS; ctx.fill(); } else { ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2; ctx.stroke(); } ctx.restore(); }
  text(`${n} / ${QUOTA}`, 1290, 282, { size: 28, weight: 800, font: MONO, color: n >= QUOTA ? TOK : INK, a: ba });
  bullet(0, 'Log a timestamp per request', eOut(P(lt, 3.6, 4.2)));
  bullet(1, 'Drop old entries, then count', eOut(P(lt, 7.8, 8.4)));
  bullet(2, 'Boundary burst is blocked', eOut(P(lt, 16.4, 17.0)), { color: PASS });
  bullet(3, 'Cost: memory per request', eOut(P(lt, 19.0, 19.6)), { color: RED });
  const sa = eOut(P(lt, 16.6, 17.3));
  statCard(110, 740, 640, 'Vs. fixed window', 'Exact rolling', { color: PINK, a: sa, h: 104 });
}

// 08 滑动窗口计数
const KN_C = [[1.0, 0], [3.6, 5.4], [4.6, 5.5], [6.0, 5.9], [6.6, 6.0], [8.6, 6.05], [9.0, 6.1], [10.4, 6.5], [12.4, 7.0], [13.6, 7.6], [13.9, 7.7], [15.4, 9.0], [17.6, 11.7], [18.4, 12]];
function sceneCounter(lt) {
  header(lt, '08', 'Sliding counter', VIO, 'Two counts + weighting');
  const u = mapU(KN_C, lt), ba = eOut(P(lt, 0.8, 1.6));
  axis(ba); legend(ba);
  const res = SIMS.Bc, w1 = u >= 6;
  winBox(0, ba, w1 ? 'Previous window' : 'Window 1', cntIn(BT, res, u, 0, 6), { accent: w1 ? VIO : SC[1] });
  winBox(1, ba, w1 ? 'Current window' : 'Window 2', cntIn(BT, res, u, 6, 12), { accent: SC[0] });
  text('Quota 5 · window 6 s (illustrative)', 830, 232, { size: 26, color: MUTE, a: ba });
  blocks(u, BT, res, IDX.B, 0.12);
  // 滑动窗口 + 覆盖比例
  const bx1 = tx(Math.max(0, u - WIN)), bx2 = tx(u);
  if (u >= 6 && lt > 8.0) {
    const ka = eOut(P(lt, 8.0, 8.8));
    ctx.save(); ctx.globalAlpha *= ka; rr(bx1, 284, bx2 - bx1, 474, 14); ctx.fillStyle = TOK + '10'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = TOK + 'cc'; ctx.stroke(); ctx.restore();
    const ov = clamp(1 - (u - 6) / 6), ox1 = bx1, ox2 = tx(6);
    if (ox2 - ox1 > 12) { ctx.save(); ctx.globalAlpha *= ka; ctx.fillStyle = VIO + '22'; ctx.fillRect(ox1, 390, ox2 - ox1, 330); ctx.restore(); if (ox2 - ox1 > 150) text(`${Math.round(ov * 100)}% overlap`, (ox1 + ox2) / 2, 430, { size: 26, weight: 800, color: VIO, align: 'center', a: ka }); }
  }
  cursor(u, ba);
  // 估算面板
  const pa = eOut(P(lt, 8.0, 8.7));
  glass(110, 600, 640, 270, { a: pa, accent: VIO });
  text('Estimated requests in window', 140, 642, { size: 22, color: MUTE, a: pa });
  let last = -1; BT.forEach((t, i) => { if (t <= u) last = i; });
  if (last >= 0 && u >= 6.1) {
    const r = SIMS.Bc[last], ok = r.ok;
    text(`Previous ${r.prev} × overlap ${Math.round(r.ov * 100)}%`, 140, 694, { size: 28, weight: 600, a: pa });
    text(`+ current ${r.cur} + this request 1`, 140, 740, { size: 28, weight: 600, a: pa });
    text(`= ${r.tot.toFixed(1)} ${ok ? '≤' : '>'} ${QUOTA}`, 140, 804, { size: 44, weight: 800, font: MONO, a: pa });
    text(ok ? 'Pass' : 'Reject', 720, 804, { size: 38, weight: 800, color: ok ? PASS : RED, align: 'right', a: pa });
  } else text('Waiting for requests...', 140, 730, { size: 28, color: DIM, a: pa });
  bullet(0, 'Keep only two counts', eOut(P(lt, 4.0, 4.6)));
  bullet(1, 'Scale previous by overlap', eOut(P(lt, 9.8, 10.4)));
  bullet(2, 'Approximate, not exact', eOut(P(lt, 21.4, 22.0)), { color: TOK });
  const ga = eOut(P(lt, 20.0, 20.8));
  if (ga > 0) {
    for (let i = 0; i < 5; i++) { const gx = tx(0.6 + i * 1.2); ctx.save(); ctx.globalAlpha *= ga; ctx.setLineDash([5, 5]); ctx.lineWidth = 2.5; ctx.strokeStyle = VIO; rr(gx - 15, AXY - 42, 30, 34, 7); ctx.stroke(); ctx.restore(); }
    text('Assumed: evenly spread', tx(0.6) - 10, 600, { size: 24, weight: 700, color: VIO, a: ga });
    text('Reality: bunched at the end', tx(5.35), 552, { size: 24, weight: 700, color: TOK, align: 'right', a: eOut(P(lt, 22.4, 23.2)) });
  }
}

// ───────── 09 对比 ─────────
function sceneCompare(lt) {
  header(lt, '09', 'Choosing one', SC[3], 'No best, only trade-offs');
  const rows = [['Token bucket', TOK, 'Allows short bursts', 'Size vs. downstream', 3.4], ['Leaky bucket', QUE, 'Smooth output', 'Queue delay and cap', 6.4], ['Fixed window', SC[1], 'Simple and cheap', 'Bursts at window edges', 9.2], ['Sliding window log', PINK, 'Exact rolling limit', 'Memory for timestamps', 12.2], ['Sliding window counter', VIO, 'Smooth, low memory', 'Approximation error', 15.9]];
  const ha = eOut(P(lt, 1.0, 1.8));
  text('Best for', 1180, 212, { size: 22, color: DIM, a: ha }); text('Main cost', 1500, 212, { size: 22, color: DIM, a: ha });
  rows.forEach(([n, c, fit, cost, t0], k) => {
    const a = eOut(P(lt, t0, t0 + 0.7)), y = 232 + k * 122;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate((1 - a) * 40, 0);
    glass(830, y, 1000, 104, { accent: c, r: 22 });
    ctx.fillStyle = c; glow(c, 14); rr(830, y + 18, 6, 68, 3); ctx.fill(); ctx.shadowBlur = 0;
    ctx.save(); ctx.font = `800 30px ${SANS}`; const nw = ctx.measureText(n).width; ctx.restore();
    text(n, 866, y + 62, { size: Math.floor(30 * Math.min(1, 290 / nw)), weight: 800, color: c });
    text(fit, 1180, y + 62, { size: 26, weight: 600 });
    text(cost, 1500, y + 62, { size: 24, color: MUTE });
    ctx.restore();
  });
  bullet(0, 'The choice follows the need', eOut(P(lt, 1.6, 2.2)));
  statCard(110, 560, 640, 'Default answer, at the gateway', 'Token bucket', { color: TOK, a: eOut(P(lt, 18.6, 19.4)), h: 120 });
}

// ───────── 10 竞态 ─────────
function sceneRace(lt) {
  header(lt, '10', 'Gateway race', PINK, 'Only one slot left');
  const A = { x: 830, y: 270, w: 250, h: 120 }, B = { x: 830, y: 610, w: 250, h: 120 }, R = { x: 1400, y: 380, w: 400, h: 260 };
  const ba = eOut(P(lt, 0.6, 1.3));
  box(A.x, A.y, A.w, A.h, 'Gateway A', { color: GATE, a: ba }); box(B.x, B.y, B.w, B.h, 'Gateway B', { color: GATE, a: ba });
  const v = lt < 8.8 ? 1 : lt < 12.0 ? 0 : lt < 14.2 ? 1 : 0;
  const lua = eOut(P(lt, 12.0, 12.8));
  if (lua > 0) { ctx.save(); ctx.globalAlpha *= lua; ctx.setLineDash([12, 9]); ctx.lineWidth = 3; ctx.strokeStyle = GATE; glow(GATE, 14); rr(R.x - 20, R.y - 20, R.w + 40, R.h + 40, 34); ctx.stroke(); ctx.restore(); text('Lua: read + check + deduct, atomic', R.x + R.w / 2, R.y + R.h + 62, { size: 24, weight: 700, color: GATE, align: 'center', a: lua }); }
  glass(R.x, R.y, R.w, R.h, { accent: SC[3], a: ba });
  text('Redis', R.x + 28, R.y + 50, { size: 28, weight: 800, a: ba });
  text('Slots left', R.x + R.w / 2, R.y + 100, { size: 24, color: MUTE, align: 'center', a: ba });
  const fl = lt > 12.0 && lt < 12.5 ? 1 - P(lt, 12.0, 12.5) : 0;
  text(String(v), R.x + R.w / 2, R.y + 205, { size: 120, weight: 900, font: MONO, align: 'center', color: v ? PASS : RED, a: ba });
  if (fl > 0) dot(R.x + R.w / 2, R.y + 150, 120 * (1 - fl), PASS, { g: 40, a: fl * 0.25 });
  const dA = [R.x, R.y + 90], dB = [R.x, R.y + R.h - 70], sA = [A.x + A.w, A.y + 60], sB = [B.x + B.w, B.y + 60];
  const pk = (s, d, p, c) => packet(s[0], s[1], d[0], d[1], p, c, { r: 10, trail: 0.1 });
  const back = (d, s, p, c) => packet(d[0], d[1], s[0], s[1], p, c, { r: 10, trail: 0.1 });
  if (lt < 12) { // 先读后写
    const fa = 1 - P(lt, 11.5, 12);
    ctx.save(); ctx.globalAlpha *= fa;
    pk(sA, dA, P(lt, 4.6, 5.6), SC[1]); pk(sB, dB, P(lt, 4.6, 5.6), SC[1]);
    back(dA, sA, P(lt, 5.8, 6.6), TOK); back(dB, sB, P(lt, 5.8, 6.6), TOK);
    pk(sA, dA, P(lt, 8.0, 8.8), PINK); pk(sB, dB, P(lt, 8.0, 8.8), PINK);
    text('1. GET slots', A.x, A.y - 14, { size: 22, color: MUTE, a: eOut(P(lt, 4.4, 4.9)) });
    text('1. GET slots', B.x, B.y - 14, { size: 22, color: MUTE, a: eOut(P(lt, 4.4, 4.9)) });
    const ra = eOut(P(lt, 6.4, 7.0)); badge(A.x, A.y + A.h + 14, 'Reads 1 → pass', PASS, ra); badge(B.x, B.y + B.h + 14, 'Reads 1 → pass', PASS, ra);
    text('2. SET 0', A.x + 270, A.y + A.h + 46, { size: 22, color: MUTE, a: eOut(P(lt, 7.8, 8.4)) });
    ctx.restore();
    text('Two passed, but only one slot: oversold', 1115, 850, { size: 30, weight: 800, color: RED, align: 'center', a: eOut(P(lt, 9.4, 10.1)) * fa });
  } else { // Lua 原子
    pk(sA, dA, P(lt, 12.8, 13.7), SC[1]);
    if (lt < 15.0) { const wp = P(lt, 12.8, 13.5); packet(sB[0], sB[1], R.x - 50, dB[1], wp, SC[1], { r: 10, trail: 0.1 }); if (wp >= 1) reqDot(R.x - 50, dB[1], SC[1], 0.5 + 0.3 * Math.sin(lt * 6)); text('Waits for A', R.x - 56, dB[1] + 48, { size: 22, color: TOK, align: 'right', a: eOut(P(lt, 13.6, 14.2)) }); }
    else pk([R.x - 50, dB[1]], dB, P(lt, 15.0, 15.7), SC[1]);
    if (lt > 13.7 && lt < 14.8) text('A running', R.x + R.w / 2, R.y + 250, { size: 22, color: GATE, align: 'center', weight: 700 });
    back(dA, sA, P(lt, 14.8, 15.6), PASS);
    back(dB, sB, P(lt, 16.2, 17.0), RED);
    badge(A.x, A.y + A.h + 14, 'Pass', PASS, eOut(P(lt, 15.6, 16.2)));
    badge(B.x, B.y + B.h + 14, 'Reads 0 → reject', RED, eOut(P(lt, 17.0, 17.6)));
    text('Atomic within one Redis instance; multi-region needs more design', 830, 880, { size: 22, color: DIM, a: eOut(P(lt, 21.0, 21.8)) });
  }
  bullet(0, 'Read, then write: both see 1', eOut(P(lt, 6.2, 6.8)));
  bullet(1, 'Both pass: slot spent twice', eOut(P(lt, 9.4, 10.0)), { color: RED });
  bullet(2, 'Lua script: one atomic step', eOut(P(lt, 12.2, 12.8)));
  bullet(3, 'B can only see 0: rejected', eOut(P(lt, 17.0, 17.6)), { color: PASS });
  const qa = eOut(P(lt, 20.2, 21.0));
  glass(110, 700, 640, 100, { a: qa, accent: PINK });
  text('One slot · one referee', 140, 762, { size: 30, weight: 700, a: qa });
}

// ───────── 11 总结 ─────────
function sceneEnd(lt) {
  gateBar(1500, 235, 120, { a: 0.7 * eOut(P(lt, 0.2, 0.8)), label: null });
  for (let i = 0; i < 18; i++) laneReq(lt, 0.8 + i * 0.5, 1250, 1500, 1800, 235 + (rnd(i + 9) - 0.5) * 50, i % 3 === 0, { travel: 0.9, after: 0.9, fall: 90, r: 10 });
  text('Rate Limiter', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Chapter 4 recap', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['Bucket', 'Token: bursts · Leaky: steady', TOK, 1.6, 4.4], ['Window', 'Fixed: edge burst · Sliding: exact', SC[1], 2.3, 6.9], ['Atomic', 'Shared count, decided in one go', PINK, 3.0, 9.2]].forEach(([w, s, c, t0, ts], k) => {
    const p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 70, weight: 800 });
    text(s, x + 36, 620, { size: 24, color: MUTE, a: eOut(P(lt, ts, ts + 0.6)) });
    ctx.restore();
  });
  text('When over the limit', 110, 750, { size: 24, color: MUTE, a: eOut(P(lt, 11.4, 12.2)) });
  let bx = 110;
  ['Return 429', 'Retry-After', 'Client backs off + jitter'].forEach((s, k) => { bx += badge(bx, 780, s, '#8b8dfc', eOut(P(lt, 11.6 + k * 0.4, 12.4 + k * 0.4))) + 16; });
}

export const scenes = { title: sceneTitle, why: sceneWhy, where: sceneWhere, token: sceneToken, leaky: sceneLeaky, fixed: sceneFixed, boundary: sceneBoundary, log: sceneLog, counter: sceneCounter, compare: sceneCompare, race: sceneRace, end: sceneEnd };
