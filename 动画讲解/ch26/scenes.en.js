// Chapter 26 Payment System: English scenes（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rr, glass, text, glow, dot, badge, header as header0,
         arrow, box as box0, dbIcon, packet, statCard, bullet as bullet0 } from '../lib/core.js';

// 英文更宽：标题、方框标签、要点按可用宽度自动缩小字号
function fitSize(str, weight, size, maxW) {
  ctx.save(); ctx.font = `${weight} ${size}px ${SANS}`; const w = ctx.measureText(str).width; ctx.restore();
  return w > maxW ? Math.floor(size * maxW / w) : size;
}
function header(lt, num, title, accent, sub) {
  const size = fitSize(title, 800, 70, 630);
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: fitSize(sub, 500, 26, 640), color: MUTE });
  ctx.restore();
}
function box(x, y, w, h, label, o = {}) {
  const size = o.size || 28;
  box0(x, y, w, h, label, { ...o, size: o.sub ? size : fitSize(label, 700, size, w - 30) });
}
function bullet(i, str, a, o = {}) { bullet0(i, str, a, { ...o, size: fitSize(str, 600, o.size || 30, 590) }); }

// 角色配色（全片统一）
const C_SVC = SC[1], C_EXE = SC[0], C_PSP = SC[3], C_WAL = SC[2], C_LED = SC[4];

const A = (lt, a, b) => eOut(P(lt, a, b));
const pop = (lt, t0, dur = 0.7) => { const p = P(lt, t0, t0 + dur); return { a: clamp(p * 2.5), s: lerp(0.88, 1, clamp(eBack(p))) }; };

function node(x, y, w, h, label, color, lt, t0, opt = {}) {
  const { a, s } = pop(lt, t0);
  if (a <= 0.02) return;
  box(x, y, w, h, label, { color, a, s, size: 30, ...opt });
}
function chip(x, y, label, color, { a = 1, size = 22, ring = null } = {}) {
  ctx.save(); ctx.font = `700 ${size}px ${MONO}`; const w = ctx.measureText(label).width + 28; ctx.restore();
  ctx.save(); ctx.globalAlpha *= a; glow(ring || color, ring ? 18 : 6); rr(x, y, w, 36, 11); ctx.fillStyle = color + '2a'; ctx.fill();
  ctx.lineWidth = ring ? 3 : 1.8; ctx.strokeStyle = ring || color; ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();
  text(label, x + 14, y + 26, { size, weight: 700, font: MONO, a });
  return w;
}
function stepNo(x, y, n, color, a = 1) {
  if (a <= 0) return;
  dot(x, y, 16, color, { g: 8, a: a * 0.35 });
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 16, 0, 7); ctx.stroke(); ctx.restore();
  text(String(n), x, y + 8, { size: 22, weight: 800, align: 'center', font: MONO, a });
}
function check(x, y, color, a = 1, s = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 6 * s; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; glow(color, 12);
  ctx.beginPath(); ctx.moveTo(x - 12 * s, y); ctx.lineTo(x - 3 * s, y + 10 * s); ctx.lineTo(x + 14 * s, y - 10 * s); ctx.stroke(); ctx.restore();
}
function cross(x, y, color, a = 1, s = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 6 * s; ctx.lineCap = 'round'; glow(color, 12);
  ctx.beginPath(); ctx.moveTo(x - 11 * s, y - 11 * s); ctx.lineTo(x + 11 * s, y + 11 * s); ctx.moveTo(x + 11 * s, y - 11 * s); ctx.lineTo(x - 11 * s, y + 11 * s); ctx.stroke(); ctx.restore();
}
function coin(x, y, a = 1, r = 15) {
  dot(x, y, r, C_PSP, { g: 16, a });
  text('$', x, y + 7, { size: 20, weight: 900, align: 'center', color: '#2a1d00', a });
}
function line(x1, y1, x2, y2, color, { a = 1, w = 3, dash = null, p = 1 } = {}) {
  if (p <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, p), lerp(y1, y2, p)); ctx.stroke(); ctx.restore();
}
const tag = (x, y, s, color, a) => badge(x, y, s, color, a);

// ───────── 场景 1：收款主流程 ─────────
const FL = {
  user: [820, 430, 120, 100], svc: [990, 420, 230, 120], exe: [1290, 420, 190, 120], psp: [1590, 420, 210, 120],
  wal: [900, 650, 190, 110], led: [1190, 650, 190, 110],
};
function sceneFlow(lt, d) {
  header(lt, '01', 'The Pay-in Flow', C_SVC, 'How one payment moves');
  const f = FL;
  node(...f.user, 'User', INK, lt, 0.4, {});
  node(...f.svc, 'Payment Service', C_SVC, lt, 0.6);
  node(...f.exe, 'Executor', C_EXE, lt, 0.8, { size: 28 });
  node(...f.psp, 'PSP', C_PSP, lt, 1.0);
  node(...f.wal, 'Wallet', C_WAL, lt, 1.2);
  node(...f.led, 'Ledger', C_LED, lt, 1.4);
  const dba = A(lt, 1.2, 2.0);
  const fillS = P(lt, 5.0, 6.2), fillE = P(lt, 9.6, 10.8);
  dbIcon(1060, 270, 90, 80, null, { color: C_SVC, a: dba, fill: eOut(fillS) });
  dbIcon(1340, 270, 90, 80, null, { color: C_EXE, a: dba, fill: eOut(fillE) });
  text('Event DB', 1166, 318, { size: 22, color: MUTE, a: dba });
  text('Order DB', 1446, 318, { size: 22, color: MUTE, a: dba });
  text('Balances', 995, 794, { size: 22, color: MUTE, a: A(lt, 1.6, 2.2) });
  text('Entries', 1285, 794, { size: 22, color: MUTE, a: A(lt, 1.6, 2.2) });
  text('External provider', 1695, 592, { size: 22, color: MUTE, align: 'center', a: A(lt, 1.6, 2.2) });

  const step = (t0, dur, x1, y1, x2, y2, color, n, nx, ny, opt = {}) => {
    const p = P(lt, t0, t0 + dur); if (p <= 0) return;
    arrow(x1, y1, x2, y2, { color, p: eOut(Math.min(1, p * 1.5)), a: p >= 1 ? 0.5 : 1, g: p >= 1 ? 0 : 10, dash: opt.dash });
    packet(x1, y1, x2, y2, p, color, { r: 10 });
    stepNo(nx, ny, n, color, clamp(p * 4));
  };
  step(2.6, 1.0, 940, 480, 990, 480, INK, 1, 965, 440);
  step(5.0, 0.9, 1105, 420, 1105, 358, C_SVC, 2, 1075, 392);
  step(7.0, 1.0, 1220, 480, 1290, 480, C_SVC, 3, 1255, 440);
  step(9.5, 0.9, 1385, 420, 1385, 358, C_EXE, 4, 1355, 392);
  step(12.5, 1.4, 1480, 460, 1590, 460, C_EXE, 5, 1535, 420);
  // PSP 扣卡 + 返回
  const pp = P(lt, 16.6, 17.6);
  if (pp > 0 && pp < 1) { ctx.save(); ctx.strokeStyle = C_PSP; ctx.globalAlpha = 1 - pp; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(1695, 480, 40 + pp * 70, 0, 7); ctx.stroke(); ctx.restore(); }
  const rp = P(lt, 17.8, 18.8);
  if (rp > 0) { arrow(1590, 510, 1480, 510, { color: SC[4], p: eOut(Math.min(1, rp * 1.5)), a: rp >= 1 ? 0.5 : 1, dash: [8, 8] }); packet(1590, 510, 1480, 510, rp, SC[4], { r: 8 }); }
  if (lt > 18.9) text('Charged', 1535, 556, { size: 22, color: SC[4], align: 'center', weight: 700, a: A(lt, 18.9, 19.5) });
  // 钱包 / 账本
  const wp = P(lt, 20.2, 21.3), lp = P(lt, 22.2, 23.3);
  if (wp > 0) { arrow(1060, 540, 995, 650, { color: C_WAL, p: eOut(Math.min(1, wp * 1.5)), a: wp >= 1 ? 0.5 : 1, g: wp >= 1 ? 0 : 10 }); packet(1060, 540, 995, 650, wp, C_WAL, { r: 10 }); stepNo(1000, 590, 6, C_WAL, clamp(wp * 4)); }
  if (lp > 0) { arrow(1150, 540, 1285, 650, { color: C_LED, p: eOut(Math.min(1, lp * 1.5)), a: lp >= 1 ? 0.5 : 1, g: lp >= 1 ? 0 : 10 }); packet(1150, 540, 1285, 650, lp, C_LED, { r: 10 }); stepNo(1240, 590, 7, C_LED, clamp(lp * 4)); }
  if (wp >= 1) check(1122, 705, C_WAL, A(lt, 21.3, 21.8));
  if (lp >= 1) check(1412, 705, C_LED, A(lt, 23.3, 23.8));

  bullet(0, 'Service: stores the event', A(lt, 4.8, 5.4));
  bullet(1, 'Executor: charges via the PSP', A(lt, 12.4, 13.0));
  bullet(2, 'Wallet: balance. Ledger: entries', A(lt, 20.2, 20.8));
  statCard(110, 660, 640, 'One million a day', '≈ 10 TPS', { color: SC[0], a: A(lt, 0.8, 1.6), note: 'book estimate' });
  text('The hard part is not throughput.', 110, 820, { size: 24, color: MUTE, a: A(lt, 5.0, 5.8) });
  text('Money must move correctly, exactly once.', 110, 856, { size: 24, color: MUTE, a: A(lt, 5.0, 5.8) });
}

// ───────── 场景 2：订单状态机 ─────────
function sceneState(lt, d) {
  header(lt, '02', 'Order States', C_EXE, 'Executing is not charged');
  const NS = [830, 300, 210, 90], EX = [1110, 300, 210, 90], SU = [1480, 220, 220, 90], FA = [1480, 380, 220, 90];
  node(...NS, 'NOT_STARTED', DIM === 0 ? 0 : '#8b8dfc', lt, 3.5, { size: 24 });
  node(...EX, 'EXECUTING', C_PSP, lt, 4.4, { size: 24 });
  node(...SU, 'SUCCESS', SC[4], lt, 5.3, { size: 24 });
  node(...FA, 'FAILED', RED, lt, 6.0, { size: 24 });
  arrow(1040, 345, 1110, 345, { color: MUTE, p: A(lt, 4.6, 5.2), a: 0.7 });
  arrow(1320, 330, 1480, 275, { color: MUTE, p: A(lt, 5.5, 6.1), a: 0.7 });
  arrow(1320, 360, 1480, 425, { color: MUTE, p: A(lt, 6.2, 6.8), a: 0.7 });
  // 当前状态高亮
  {
    const cur = lt < 7.0 ? NS : lt < 16.4 ? EX : SU, ra = lt < 3.9 ? 0 : A(lt, 3.9, 4.4);
    if (ra > 0 && lt > 6.8) { const [x, y, w, h] = cur; ctx.save(); ctx.globalAlpha *= A(lt, 6.8, 7.4); glow('#fff', 16); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; rr(x - 8, y - 8, w + 16, h + 16, 24); ctx.stroke(); ctx.restore(); }
  }
  // 订单卡
  const ca = A(lt, 6.8, 7.6);
  glass(830, 540, 1010, 320, { a: ca, accent: C_EXE });
  text('One row in payment_orders', 866, 582, { size: 22, color: MUTE, a: ca });
  const rows = [['payment_order_id', 'order-1001'], ['payment_order_status', null], ['wallet_updated', null], ['ledger_updated', null]];
  const stT = lt < 7.5 ? ['NOT_STARTED', '#8b8dfc'] : lt < 16.4 ? ['EXECUTING', C_PSP] : ['SUCCESS', SC[4]];
  const wOn = lt >= 13.8, lOn = lt >= 14.7;
  rows.forEach(([k, v], i) => {
    const y = 640 + i * 52;
    text(k, 866, y + 8, { size: 26, color: MUTE, font: MONO, a: ca });
    if (i === 0) text(v, 1300, y + 8, { size: 26, weight: 700, font: MONO, a: ca });
    if (i === 1) chip(1300, y - 20, stT[0], stT[1], { a: ca, size: 24 });
    if (i === 2) chip(1300, y - 20, wOn ? 'true' : 'false', wOn ? C_WAL : DIM, { a: ca, size: 24 });
    if (i === 3) chip(1300, y - 20, lOn ? 'true' : 'false', lOn ? C_LED : DIM, { a: ca, size: 24 });
  });
  // 注意标记
  const wa = A(lt, 9.6, 10.4);
  if (wa > 0) { glow(RED, 0); badge(1000, 410, '≠ PSP has charged the card', RED, wa); }
  const hl = A(lt, 13.0, 13.6) * (1 - A(lt, 16.4, 17.2) * 0.7);
  if (hl > 0.02) for (const i of [2, 3]) { ctx.save(); ctx.globalAlpha *= hl; ctx.strokeStyle = i === 2 ? C_WAL : C_LED; ctx.lineWidth = 2.5; glow(i === 2 ? C_WAL : C_LED, 12); rr(856, 640 + i * 52 - 34, 960, 50, 12); ctx.stroke(); ctx.restore(); }
  bullet(0, 'Four order states', A(lt, 3.4, 4.0));
  bullet(1, 'Executing ≠ charged', A(lt, 9.6, 10.2), { color: RED });
  bullet(2, 'Wallet and ledger have flags', A(lt, 13.0, 13.6));
  bullet(3, 'Each step tracked on its own', A(lt, 15.9, 16.5));
}

// ───────── 场景 3：复式记账 ─────────
function sceneLedger(lt, d) {
  header(lt, '03', 'Double-Entry', C_LED, 'Each movement hits two accounts');
  const ba = A(lt, 0.5, 1.3);
  glass(830, 200, 300, 100, { a: ba, accent: SC[2] }); text('Buyer', 980, 262, { size: 36, weight: 800, align: 'center', a: ba });
  glass(1520, 200, 300, 100, { a: ba, accent: SC[4] }); text('Seller', 1670, 262, { size: 36, weight: 800, align: 'center', a: ba });
  // 硬币从买家流向卖家
  const cp = eIO(P(lt, 7.3, 9.8));
  arrow(1140, 250, 1510, 250, { color: MUTE, p: A(lt, 7.2, 7.9), a: 0.6, dash: [8, 8] });
  if (cp > 0 && cp < 1) coin(lerp(1140, 1510, cp), 250 - Math.sin(cp * Math.PI) * 24);
  if (cp >= 1) coin(1670, 340, 0);
  text('$1', 1325, 232, { size: 30, weight: 800, font: MONO, color: C_PSP, align: 'center', a: A(lt, 7.3, 7.9) });
  // 表格
  const ta = A(lt, 3.7, 4.5);
  const X = 830, Y = 380, cw = [440, 280, 290];
  glass(X, Y, 1010, 270, { a: ta, accent: C_LED });
  text('Account', X + 30, Y + 44, { size: 24, color: MUTE, a: ta });
  text('Debit', X + cw[0] + 20, Y + 44, { size: 24, color: MUTE, a: ta });
  text('Credit', X + cw[0] + cw[1] + 20, Y + 44, { size: 24, color: MUTE, a: ta });
  line(X + 24, Y + 62, X + 986, Y + 62, 'rgba(255,255,255,0.12)', { a: ta, w: 2 });
  const r1 = A(lt, 7.4, 8.1), r2 = A(lt, 9.2, 9.9), r3 = A(lt, 11.4, 12.2);
  text('Buyer', X + 30, Y + 118, { size: 30, weight: 700, a: r1 });
  text('$1', X + cw[0] + 20, Y + 118, { size: 34, weight: 800, font: MONO, color: SC[2], a: r1 });
  text('Seller', X + 30, Y + 178, { size: 30, weight: 700, a: r2 });
  text('$1', X + cw[0] + cw[1] + 20, Y + 178, { size: 34, weight: 800, font: MONO, color: SC[4], a: r2 });
  line(X + 24, Y + 200, X + 986, Y + 200, 'rgba(255,255,255,0.12)', { a: r3, w: 2 });
  text('Total', X + 30, Y + 244, { size: 28, weight: 700, color: MUTE, a: r3 });
  text('$1', X + cw[0] + 20, Y + 244, { size: 34, weight: 800, font: MONO, a: r3 });
  text('$1', X + cw[0] + cw[1] + 20, Y + 244, { size: 34, weight: 800, font: MONO, a: r3 });
  const eq = A(lt, 12.6, 13.4);
  if (eq > 0) { text('=', X + cw[0] + cw[1] - 20, Y + 244, { size: 40, weight: 800, color: SC[4], align: 'center', a: eq }); }
  // 天平式对比条
  const ba2 = A(lt, 11.6, 12.4);
  if (ba2 > 0) {
    const wlen = 360 * eOut(P(lt, 11.8, 13.0));
    text('Total debits', 830, 720, { size: 24, color: MUTE, a: ba2 }); text('Total credits', 830, 782, { size: 24, color: MUTE, a: ba2 });
    ctx.save(); ctx.globalAlpha *= ba2; ctx.fillStyle = SC[2]; glow(SC[2], 12); rr(1030, 700, wlen, 26, 13); ctx.fill(); ctx.fillStyle = SC[4]; glow(SC[4], 12); rr(1030, 762, wlen, 26, 13); ctx.fill(); ctx.restore();
    text('Debit = Credit', 1440, 760, { size: 40, weight: 800, color: SC[4], a: eq });
  }
  // 追踪链
  const tr = A(lt, 15.8, 16.6);
  if (tr > 0) {
    text('Every entry traces back to its source', 1060, 700, { size: 24, color: MUTE, a: tr * 0 });
    ['Buyer', 'Voucher', 'Seller'].forEach((s, k) => { const x = 1400 + k * 140; const a = A(lt, 13.0 + k * 0.4, 13.6 + k * 0.4); badge(x, 730 + 0, s, [SC[2], C_LED, SC[4]][k], a * 0); });
  }
  bullet(0, 'One movement, two entries', A(lt, 3.7, 4.3));
  bullet(1, 'Total debits = total credits', A(lt, 11.5, 12.1));
  bullet(2, 'Money traced end to end', A(lt, 15.8, 16.4));
  statCard(110, 660, 640, 'Sum of signed entries', '0', { color: SC[4], a: A(lt, 12.8, 13.6) });
  text('Balanced is necessary, not sufficient:', 110, 820, { size: 22, color: DIM, a: A(lt, 18.4, 19.2) });
  text('a wrong amount or account can still balance.', 110, 852, { size: 22, color: DIM, a: A(lt, 18.4, 19.2) });
}

// ───────── 场景 4：超时 ─────────
function sceneTimeout(lt, d) {
  header(lt, '04', 'After a Timeout', RED, 'All you know: no reply');
  const ex = [830, 220, 200, 100], ps = [1580, 220, 220, 100];
  node(...ex, 'Executor', C_EXE, lt, 0.4, { size: 28 });
  node(...ps, 'PSP', C_PSP, lt, 0.6);
  const cxE = 930, cxP = 1690;
  line(cxE, 320, cxE, 640, 'rgba(255,255,255,0.16)', { dash: [6, 8], a: A(lt, 0.8, 1.4), w: 2 });
  line(cxP, 320, cxP, 640, 'rgba(255,255,255,0.16)', { dash: [6, 8], a: A(lt, 0.8, 1.4), w: 2 });
  // 请求
  const rq = P(lt, 3.4, 4.8);
  if (rq > 0) { arrow(cxE + 10, 400, cxP - 10, 400, { color: C_EXE, p: eOut(Math.min(1, rq * 1.3)), a: rq >= 1 ? 0.6 : 1, g: 8 }); packet(cxE, 400, cxP, 400, rq, C_EXE, { r: 11 }); }
  if (rq > 0.2) chip(1190, 350, 'order-1001', C_EXE, { a: clamp(rq * 3) });
  text('Request', 1010, 392, { size: 22, color: MUTE, a: A(lt, 3.7, 4.3) });
  // PSP 状态 ？
  const q = A(lt, 5.0, 5.8);
  const pulse = 0.65 + 0.35 * Math.sin(lt * 4);
  if (q > 0) text('?', cxP, 540, { size: 90, weight: 800, color: C_PSP, align: 'center', a: q * (lt < 15.2 ? pulse : 0.25) });
  // 等待条
  const w0 = 5.4, w1 = 7.6, wp = P(lt, w0, w1), wa = A(lt, 5.2, 5.8);
  if (wa > 0) {
    text('Executor waits for a response…', 830, 560, { size: 24, color: MUTE, a: wa });
    ctx.save(); ctx.globalAlpha *= wa; rr(830, 580, 560, 24, 12); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
    const done = wp >= 1; const col = done ? RED : C_EXE; ctx.fillStyle = col; glow(col, 12); rr(830, 580, Math.max(24, 560 * wp), 24, 12); ctx.fill(); ctx.restore();
    if (done) text('Timeout', 1410, 600, { size: 28, weight: 800, color: RED, a: A(lt, 7.6, 8.2) });
  }
  // 响应在两种可能下的虚线
  const ra = P(lt, 14.6, 16.4);
  if (ra > 0) {
    arrow(cxP - 10, 470, cxE + 10, 470, { color: C_PSP, p: Math.min(1, eOut(ra) * 0.55) / 1, a: 0.9, dash: [8, 8] });
    const crx = lerp(cxP, cxE, 0.55);
    cross(crx, 470, RED, A(lt, 15.8, 16.4), 1.4);
    text('Response lost', crx, 520, { size: 22, color: RED, align: 'center', weight: 700, a: A(lt, 16.1, 16.7) });
  }
  // 两种可能
  const cards = [[830, 'Never arrived', 'The PSP charged nothing', 10.2, MUTE], [1330, 'Already charged', 'Only the response was lost', 12.4, RED]];
  cards.forEach(([x, t, s, t0, c]) => {
    const a = A(lt, t0, t0 + 0.7);
    ctx.save(); ctx.translate(0, (1 - a) * 24);
    glass(x, 680, 470, 190, { a, accent: c === RED ? RED : C_PSP });
    text(c === RED ? 'MAYBE B' : 'MAYBE A', x + 30, 726, { size: 22, color: c === RED ? RED : MUTE, font: MONO, weight: 700, a });
    text(t, x + 30, 790, { size: fitSize(t, 800, 44, 410), weight: 800, a });
    text(s, x + 30, 840, { size: fitSize(s, 500, 26, 410), color: MUTE, a });
    ctx.restore();
  });
  bullet(0, 'Request sent, no response', A(lt, 5.2, 5.8));
  bullet(1, 'Timeout ≠ failure', A(lt, 7.8, 8.4), { color: RED });
  bullet(2, 'Cannot tell A from B', A(lt, 10.3, 10.9));
  statCard(110, 660, 640, 'A timeout means', 'Outcome unknown', { color: RED, a: A(lt, 8.4, 9.2) });
}

// ───────── 场景 5：换新键重试 → 重复扣款 ─────────
function sceneDup(lt, d) {
  header(lt, '05', 'A Careless Retry', RED, 'A new ID is a new payment');
  node(830, 230, 200, 100, 'Executor', C_EXE, lt, 0.3, { size: 28 });
  node(1580, 230, 220, 100, 'PSP', C_PSP, lt, 0.5);
  // 买家卡
  const ba = A(lt, 0.8, 1.5);
  glass(830, 420, 440, 300, { a: ba, accent: SC[2] });
  text('Buyer\'s card', 860, 466, { size: 26, color: MUTE, a: ba });
  const twice = lt >= 9.8;
  const amt = twice ? '$6.30' : '$3.15';
  text(amt, 860, 570, { size: 80, weight: 900, font: MONO, color: twice ? RED : INK, a: ba });
  text('Amount charged (illustrative)', 860, 620, { size: 22, color: MUTE, a: ba });
  if (twice) { const b2 = A(lt, 9.8, 10.4); badge(860, 646, 'Charged twice', RED, b2); }
  // PSP 记录
  const pa = A(lt, 0.8, 1.5);
  glass(1380, 400, 440, 250, { a: pa, accent: C_PSP });
  text('PSP charge log', 1410, 446, { size: 24, color: MUTE, a: pa });
  chip(1410, 470, 'key-A', C_EXE, { a: pa, size: 24 }); text('$3.15', 1660, 497, { size: 28, weight: 700, font: MONO, a: pa });
  const r2 = A(lt, 5.9, 6.6);
  if (r2 > 0) {
    chip(1410, 530, 'key-B', C_PSP, { a: r2, size: 24, ring: lt > 8.0 && lt < 9.6 ? RED : null }); text('$3.15', 1660, 557, { size: 28, weight: 700, font: MONO, color: RED, a: r2 });
    text('A brand new payment', 1410, 618, { size: 22, color: RED, weight: 700, a: A(lt, 6.4, 7.2) });
  }
  // 重试请求
  const rp = P(lt, 1.8, 3.8);
  text('After a timeout…', 1060, 392, { size: 22, color: MUTE, a: A(lt, 0.8, 1.4) * (1 - A(lt, 1.6, 2.0)) });
  if (rp > 0) {
    arrow(1040, 285, 1570, 285, { color: C_PSP, p: eOut(Math.min(1, rp * 1.3)), a: rp >= 1 ? 0.6 : 1, g: 8 });
    packet(1040, 285, 1570, 285, rp, C_PSP, { r: 11 });
    chip(1180, 232, 'key-B', C_PSP, { a: clamp(rp * 3) });
    text('Retry', 1060, 270, { size: 22, color: MUTE, a: clamp(rp * 3) });
  }
  // 扣款动效
  const cp = eIO(P(lt, 8.0, 9.3));
  if (cp > 0 && cp < 1) coin(lerp(1410, 1000, cp), lerp(575, 540, cp), 1);
  bullet(0, 'New ID = new payment', A(lt, 5.9, 6.5), { color: RED });
  bullet(1, 'Charged a second time', A(lt, 8.1, 8.7), { color: RED });
  bullet(2, 'At least once, never twice', A(lt, 11.6, 12.2));
  statCard(110, 660, 640, 'Buyer charged', twice ? '2 times' : '1 time', { color: twice ? RED : SC[4], a: A(lt, 9.8, 10.6), note: 'should be 1' });
}

// ───────── 场景 6：幂等 ─────────
function sceneIdem(lt, d) {
  header(lt, '06', 'Idempotency', SC[4], 'Same key, applied once');
  node(830, 200, 190, 100, 'Executor', C_EXE, lt, 0.3);
  node(1620, 200, 200, 100, 'PSP', C_PSP, lt, 0.5);
  // 幂等键
  const ka = A(lt, 4.1, 4.9);
  if (ka > 0) { chip(830, 332, 'key = order-1001', SC[4], { a: ka, size: 24 }); }
  // PSP 已处理表
  const ta = A(lt, 1.0, 1.8);
  glass(1340, 350, 480, 150, { a: ta, accent: C_PSP });
  text('Keys the PSP has processed', 1366, 394, { size: 22, color: MUTE, a: ta });
  const hit = A(lt, 8.6, 9.3);
  chip(1366, 416, 'order-1001', SC[4], { a: ta, size: 24, ring: hit > 0.3 && lt < 13.0 ? '#fff' : null });
  text('$3.15', 1650, 443, { size: 26, weight: 700, font: MONO, a: ta });
  if (hit > 0) { check(1780, 435, SC[4], hit, 0.8); }
  // 重试请求
  const rq = P(lt, 4.8, 6.6);
  if (rq > 0) { arrow(1030, 240, 1610, 240, { color: SC[4], p: eOut(Math.min(1, rq * 1.3)), a: rq >= 1 ? 0.6 : 1, g: 8 }); packet(1030, 240, 1610, 240, rq, SC[4], { r: 11 }); chip(1170, 190, 'order-1001', SC[4], { a: clamp(rq * 3) }); text('Retry', 1050, 224, { size: 22, color: MUTE, a: clamp(rq * 3) }); }
  // 不再扣款 + 返回上次结果
    const rb = P(lt, 12.6, 14.2);
  if (rb > 0) { arrow(1610, 290, 1030, 290, { color: SC[4], p: eOut(Math.min(1, rb * 1.3)), a: rb >= 1 ? 0.5 : 1, dash: [8, 8] }); packet(1610, 290, 1030, 290, rb, SC[4], { r: 9 }); text('Earlier result', 1320, 326, { size: 24, color: SC[4], weight: 700, align: 'center', a: clamp(rb * 3) }); }
  // 本地数据库
  const da = A(lt, 15.2, 16.0);
  glass(830, 560, 990, 300, { a: da, accent: C_SVC });
  text('Our own database · key payment_order_id', 860, 604, { size: 24, color: MUTE, a: da });
  dbIcon(1650, 650, 110, 120, '', { color: C_SVC, a: da, fill: 0.55 });
  text('order-1001', 1705, 800, { size: 22, color: MUTE, font: MONO, align: 'center', a: da });
  const ip = P(lt, 17.0, 18.2);
  if (ip > 0 && lt < 19.0) { packet(900, 700, 1620, 700, ip, C_SVC, { r: 11 }); chip(900 + 330 * eOut(Math.min(1, ip * 1.2)), 650, 'INSERT order-1001', C_SVC, { a: clamp(ip * 3) * (1 - A(lt, 18.1, 18.6)) }); }
  if (lt > 18.1) {
    const xa = A(lt, 18.1, 18.8);
    cross(1560, 700, RED, xa, 1.5);
    text('Unique constraint: duplicate rejected', 1215, 770, { size: 26, weight: 700, color: RED, align: 'center', a: xa });
    text('→ return the existing record', 1215, 812, { size: 26, weight: 700, color: SC[4], align: 'center', a: A(lt, 19.2, 19.9) });
  }
  bullet(0, 'Retry reuses the order ID', A(lt, 4.1, 4.7));
  bullet(1, 'PSP: key seen, no new charge', A(lt, 11.5, 12.1));
  bullet(2, 'Local unique constraint', A(lt, 15.6, 16.2));
  statCard(110, 660, 640, 'PSP charges', '1 time', { color: SC[4], a: A(lt, 11.5, 12.3), note: 'still 1 after retry' });
}

// ───────── 场景 7：退避、重试队列、死信队列 ─────────
function sceneRetry(lt, d) {
  header(lt, '07', 'Retries & Dead Letters', C_PSP, 'A rhythm, and an end point');
  // 指数退避轴
  const x0 = 840, sx = 60, ay = 340;
  const pts = [0, 1, 3, 7, 15];
  const aa = A(lt, 0.8, 1.6);
  text('Exponential backoff (illustrative, seconds)', 840, 236, { size: 24, color: MUTE, a: aa });
  line(x0, ay, x0 + 15 * sx + 20, ay, 'rgba(255,255,255,0.2)', { a: aa, w: 3 });
  pts.forEach((t, k) => {
    const t0 = k === 0 ? 3.0 : 5.0 + (k - 1) * 0.8;
    const p = P(lt, t0, t0 + 0.6), x = x0 + t * sx;
    if (k > 0) {
      const gx0 = x0 + pts[k - 1] * sx;
      const gp = P(lt, t0 - 0.4, t0 + 0.2);
      if (gp > 0) { line(gx0 + 18, ay - 48, gx0 + 18 + (x - gx0 - 36) * eOut(gp), ay - 48, C_PSP, { w: 3 }); }
      text(`${pts[k] - pts[k - 1]}s`, (gx0 + x) / 2, ay - 62, { size: 24, weight: 700, font: MONO, color: C_PSP, align: 'center', a: A(lt, t0 - 0.2, t0 + 0.4) });
      if (k >= 2) badge((gx0 + x) / 2 - 31, ay + 26, '×2', RED === 0 ? 0 : SC[2], A(lt, t0 + 0.0, t0 + 0.6));
    }
    if (p > 0.02) {
      dot(x, ay, 16 * eBack(p) , k === 4 ? SC[4] : C_EXE, { g: 14 });
      text(String(k + 1), x, ay + 8, { size: 20, weight: 900, align: 'center', color: '#071014', font: MONO, a: clamp(p * 2) });
    }
  });
  text('Attempt n', 840, ay + 120, { size: 22, color: DIM, a: A(lt, 3.0, 3.6) });
  // 队列
  const EXE = [830, 580, 170, 100], RQ = [1130, 580, 230, 100], DQ = [1500, 580, 250, 100];
  node(...EXE, 'Executor', C_EXE, lt, 7.6);
  node(...RQ, 'Retry Queue', C_SVC, lt, 8.4);
  node(...DQ, 'Dead Letter Queue', RED, lt, 14.4, { hot: true });
  const p1 = P(lt, 8.9, 10.2);
  if (p1 > 0) { arrow(1010, 630, 1120, 630, { color: C_SVC, p: eOut(Math.min(1, p1 * 1.4)), a: p1 >= 1 ? 0.6 : 1 }); text('Retryable', 1065, 562, { size: 22, color: MUTE, align: 'center', a: clamp(p1 * 3) }); }
  if (p1 > 0) packet(1010, 630, 1120, 630, p1, RED, { r: 10 });
  // 回环
  const lp = P(lt, 10.6, 11.6);
  if (lp > 0) {
    const a = 0.6, col = C_SVC;
    line(1245, 690, 1245, 780, col, { a, p: Math.min(1, lp * 3) });
    if (lp > 0.33) line(1245, 780, 915, 780, col, { a, p: Math.min(1, (lp - 0.33) * 3) });
    if (lp > 0.66) arrow(915, 780, 915, 693, { color: col, a, p: Math.min(1, (lp - 0.66) * 3) });
    text('Re-delivered after backoff', 1080, 822, { size: 22, color: MUTE, align: 'center', a: clamp(lp * 2) });
    if (lp < 1) { const q = lp; const x = q < 0.33 ? 1245 : q < 0.66 ? lerp(1245, 915, (q - 0.33) * 3) : 915; const y = q < 0.33 ? lerp(690, 780, q * 3) : q < 0.66 ? 780 : lerp(780, 693, (q - 0.66) * 3); dot(x, y, 10, C_SVC, { g: 14 }); }
  }
  const p2 = P(lt, 14.8, 15.8);
  if (p2 > 0) { arrow(1370, 630, 1490, 630, { color: RED, p: eOut(Math.min(1, p2 * 1.4)), a: p2 >= 1 ? 0.6 : 1 }); text('Limit reached', 1430, 562, { size: 22, color: RED, align: 'center', a: clamp(p2 * 3) }); packet(1370, 630, 1490, 630, p2, RED, { r: 10 }); }
  const ha = A(lt, 17.4, 18.2);
  if (ha > 0) { arrow(1625, 690, 1625, 760, { color: MUTE, p: ha, a: 0.7 }); badge(1500, 770, 'Human review', RED, ha); }
  bullet(0, 'Backoff: wait doubles each time', A(lt, 5.2, 5.8));
  bullet(1, 'Retryable → retry queue', A(lt, 9.0, 9.6));
  bullet(2, 'Over the limit → dead letters', A(lt, 15.0, 15.6), { color: RED });
}

// ───────── 场景 8：对账 ─────────
const REC = [['order-1001', '3.15', 'SUCCESS', 'SUCCESS'], ['order-1002', '8.00', 'SUCCESS', 'SUCCESS'], ['order-1003', '5.20', 'SUCCESS', 'EXECUTING'], ['order-1004', '12.00', 'SUCCESS', 'SUCCESS'], ['order-1005', '2.50', 'FAILED', 'FAILED']];
function sceneRecon(lt, d) {
  header(lt, '08', 'Reconciliation', C_PSP, 'Compare nightly, close the gaps');
  const XL = 830, XR = 1310, TW = 450, Y0 = 220;
  const ha = A(lt, 4.2, 5.0);
  [[XL, 'PSP settlement file', C_PSP], [XR, 'Internal records', C_EXE]].forEach(([x, t, c]) => {
    glass(x, Y0, TW, 380, { a: ha, accent: c });
    text(t, x + 20, Y0 + 44, { size: 28, weight: 800, color: c, a: ha });
    line(x + 16, Y0 + 62, x + TW - 16, Y0 + 62, 'rgba(255,255,255,0.12)', { a: ha, w: 2 });
  });
  const scan = P(lt, 7.9, 11.0);
  REC.forEach((r, i) => {
    const y = Y0 + 100 + i * 60, ra = A(lt, 4.9 + i * 0.28, 5.5 + i * 0.28);
    const bad = i === 2;
    text(r[0], XL + 16, y, { size: 22, font: MONO, color: MUTE, a: ra });
    text(r[1], XL + 190, y, { size: 24, font: MONO, weight: 700, a: ra });
    text(r[2], XL + TW - 16, y, { size: 22, font: MONO, weight: 700, color: r[2] === 'FAILED' ? RED : SC[4], align: 'right', a: ra });
    text(r[0], XR + 16, y, { size: 22, font: MONO, color: MUTE, a: ra });
    text(r[1], XR + 190, y, { size: 24, font: MONO, weight: 700, a: ra });
    text(r[3], XR + TW - 16, y, { size: 22, font: MONO, weight: 700, color: r[3] === 'FAILED' ? RED : r[3] === 'EXECUTING' ? C_PSP : SC[4], align: 'right', a: ra });
    const done = scan * 5 > i + 0.5;
    if (done) {
      const ma = A(lt, 7.9 + i * 0.62, 8.4 + i * 0.62);
      if (bad) { cross(1800, y - 8, RED, ma, 0.9); } else check(1800, y - 8, SC[4], ma, 0.75);
    }
  });
  // 扫描高亮
  if (scan > 0 && scan < 1) {
    const sy = Y0 + 64 + scan * 5 * 60 - 0;
    ctx.save(); ctx.globalAlpha *= 0.9; glow(C_EXE, 14); ctx.strokeStyle = C_EXE; ctx.lineWidth = 3; rr(XL + 8, Y0 + 100 - 34 + Math.min(4, scan * 5) * 60, 906, 50, 12); ctx.stroke(); ctx.restore();
    void sy;
  }
  const da = A(lt, 11.8, 12.6);
  if (da > 0) {
    const hy = Y0 + 100 + 2 * 60 - 34;
    ctx.save(); ctx.globalAlpha *= da; glow(RED, 18); ctx.strokeStyle = RED; ctx.lineWidth = 3; rr(XL + 8, hy, 906, 50, 12); ctx.stroke(); ctx.restore();
    text('order-1003: PSP says SUCCESS, we still say EXECUTING (illustrative)', XL, 640, { size: 22, color: RED, weight: 600, a: da });
  }
  // 三类处理
  const cards = [[830, 'Known kind', 'Standard procedure', C_EXE, 13.9], [1170, 'Known, not automatic', 'Finance adjusts by hand', C_PSP, 17.0], [1510, 'Unclassified', 'Investigate, then adjust', RED, 18.6]];
  cards.forEach(([x, t, s, c, t0]) => {
    const a = A(lt, t0, t0 + 0.7);
    ctx.save(); ctx.translate(0, (1 - a) * 24);
    glass(x, 690, 320, 170, { a, accent: c });
    ctx.fillStyle = c; glow(c, 14); ctx.globalAlpha *= a; rr(x + 24, 690, 60, 5, 3); ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha /= Math.max(a, 0.001);
    text(t, x + 24, 752, { size: fitSize(t, 800, 32, 275), weight: 800, a });
    text(s, x + 24, 806, { size: fitSize(s, 500, 26, 275), color: MUTE, a });
    ctx.restore();
  });
  bullet(0, 'PSP sends a nightly file', A(lt, 5.0, 5.6));
  bullet(1, 'Compare payment by payment', A(lt, 7.9, 8.5));
  bullet(2, 'Three ways to handle gaps', A(lt, 13.9, 14.5));
  statCard(110, 640, 640, 'Mismatches in this example', '1 / 5', { color: RED, a: A(lt, 11.8, 12.6), note: 'illustrative' });
  text('Keep the original events;', 110, 800, { size: 22, color: DIM, a: A(lt, 15.0, 15.8) });
  text('fix with correcting entries.', 110, 832, { size: 22, color: DIM, a: A(lt, 15.0, 15.8) });
}

// ───────── 场景 9：总结 ─────────
function sceneEnd(lt, d) {
  text('Payment System', 110, 250, { size: 84, weight: 900, a: A(lt, 0.2, 0.9) });
  text('Chapter 26', 112, 304, { size: 32, color: MUTE, font: MONO, a: A(lt, 0.4, 1.1) });
  [['Idempotency key', 'One payment, one key', C_EXE], ['Reconciliation', 'Compare nightly, close gaps', C_PSP], ['Double-entry', 'Balanced, traceable end to end', C_LED]].forEach(([w, s, c], k) => {
    const t0 = 2.7 + k * 1.4, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 400, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 400, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 460, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 546, { size: fitSize(w, 800, 66, 450), weight: 800 });
    text(s, x + 36, 600, { size: fitSize(s, 500, 26, 450), color: MUTE });
    ctx.restore();
  });
  const aa = A(lt, 7.2, 8.0);
  glass(110, 690, 1700, 130, { a: aa, accent: '#8b8dfc' });
  text('REMEMBER', 146, 736, { size: 22, color: MUTE, a: aa });
  text('Record first, then call out. When unsure, check. Retry with the same key. Reconcile the rest.', 146, 790, { size: fitSize('Record first, then call out. When unsure, check. Retry with the same key. Reconcile the rest.', 700, 34, 1620), weight: 700, a: aa });
}

// ───────── 片头 ─────────
function sceneTitle(lt, d) {
  const a = A(lt, 0.2, 1.2);
  // 右侧：三节点 + 硬币循环
  const ns = [[1180, 'SVC', C_SVC, 'Service'], [1480, 'EXE', C_EXE, 'Executor'], [1780, 'PSP', C_PSP, 'PSP']];
  const nodes = [[1110, 380], [1420, 380], [1730, 380]];
  const cols = [C_SVC, C_EXE, C_PSP], labs = ['Service', 'Executor', 'PSP'];
  nodes.forEach(([x, y], k) => {
    const p = P(lt, 0.8 + k * 0.4, 1.5 + k * 0.4);
    ctx.save(); ctx.globalAlpha *= clamp(p * 2); ctx.translate(x, y); ctx.scale(lerp(0.85, 1, clamp(eBack(p))), lerp(0.85, 1, clamp(eBack(p))));
    glass(-90, -50, 180, 100, { accent: cols[k] }); text(labs[k], 0, 12, { size: 30, weight: 800, align: 'center' }); ctx.restore();
  });
  [[1215, 1320], [1525, 1630]].forEach(([a1, a2], k) => arrow(a1, 380, a2, 380, { color: MUTE, a: 0.6, p: A(lt, 1.8 + k * 0.4, 2.4 + k * 0.4) }));
  if (lt > 2.6) for (let i = 0; i < 3; i++) { const u = (((lt - 2.6) * 0.3 + i / 3) % 1) * 2, hop = Math.floor(u), q = u % 1; const x = lerp(hop ? 1525 : 1215, hop ? 1630 : 1320, q); coin(x, 380, A(lt, 2.6, 3.2), 13); }
  text('One idempotency key', 1420, 520, { size: 26, color: MUTE, align: 'center', a: A(lt, 3.0, 3.8) });
  text('SYSTEM DESIGN INTERVIEW', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); ctx.globalAlpha *= A(lt, 0.4, 1.4); ctx.translate(0, (1 - A(lt, 0.4, 1.4)) * 30);
  const ts = fitSize('Payment', 900, 160, 880); ctx.font = `900 ${ts}px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('Payment', 104, 500); ctx.fillText('System', 104, 500 + ts * 0.95); ctx.restore();
  text('Animated explainer', 112, 740, { size: 36, color: MUTE, a: A(lt, 0.8, 1.6) });
  text('Chapter 26', 112, 800, { size: 34, weight: 700, color: INK, font: MONO, a: A(lt, 1.2, 2) });
}

export const meta = { no: 26, title: 'Payment System', en: 'Payment System' };
export const scenes = { title: sceneTitle, flow: sceneFlow, state: sceneState, ledger: sceneLedger, timeout: sceneTimeout, dup: sceneDup, idem: sceneIdem, retry: sceneRetry, recon: sceneRecon, end: sceneEnd };
