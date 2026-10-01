// 第 28 章 证券交易所：场景定义
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 28, title: '证券交易所', en: 'Stock Exchange' };

const BUY = SC[0], SELL = SC[2], NEW = SC[4], FILL = SC[3], INFRA = SC[1];
// 旁白锚点：短语在旁白里的位置 → 场景局部时间（与字幕同一比例）
const at = (sc, s) => { const i = sc.text.indexOf(s); return sc.lead + (i < 0 ? 0 : i) / sc.text.length * sc.voiceDur; };

// ───────── 订单簿（数字取自书中「订单簿成交示例」图） ─────────
const ASKP = ['100.13', '100.12', '100.11', '100.10'];   // 自上而下，最佳卖价在最下
const BIDP = ['100.08', '100.07', '100.06', '100.05'];   // 最佳买价在最上
const ASKS = { '100.10': [200, 400, 1100, 100], '100.11': [900, 700, 400], '100.12': [600, 900], '100.13': [100, 200] };
const BIDS = { '100.08': [500, 600, 900], '100.07': [100, 700], '100.06': [1100, 400, 300, 200], '100.05': [500, 100] };
const CX0 = 1090, CPITCH = 112, CW = 104, CH = 58;
const askY = (r) => 196 + r * 68, bidY = (r) => 524 + r * 68;
const rowY = (side, r) => (side === 'a' ? askY(r) : bidY(r));
function baseCells() {
  const c = [];
  ASKP.forEach((p, r) => ASKS[p].forEach((q, i) => c.push({ side: 'a', r, i, slot: i, q, p, a: 1, s: 1, hl: null })));
  BIDP.forEach((p, r) => BIDS[p].forEach((q, i) => c.push({ side: 'b', r, i, slot: i, q, p, a: 1, s: 1, hl: null })));
  return c;
}
function cellBox(x, y, w, h, label, color, { a = 1, s = 1, hl = null, size = 26, fa = '30' } = {}) {
  if (a <= 0.01 || s <= 0.01) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s);
  if (hl) glow(hl, 24);
  rr(-w / 2, -h / 2, w, h, 12); ctx.fillStyle = color + fa; ctx.fill();
  ctx.lineWidth = hl ? 3.5 : 2; ctx.strokeStyle = hl || color; ctx.stroke(); ctx.shadowBlur = 0;
  if (label != null) text(String(label), 0, size * 0.36, { size, weight: 700, align: 'center', font: MONO });
  ctx.restore();
}
function drawBook(cells, { aA = 1, bA = 1, askBest = 3, bidBest = 0, spread = '0.02', spreadA = 0, showBest = 0, hlRows = null } = {}) {
  text('价格', 830, 184, { size: 22, color: MUTE, a: Math.min(aA, 1) });
  text('数量（同价按到达先后，左 → 右）', CX0, 184, { size: 22, color: MUTE });
  ASKP.forEach((p, r) => {
    text(p, 830, askY(r) + 40, { size: 32, weight: 700, font: MONO, color: SELL, a: aA });
    ctx.save(); ctx.globalAlpha *= aA * 0.5; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(820, askY(r) + 63); ctx.lineTo(1840, askY(r) + 63); ctx.stroke(); ctx.restore();
  });
  BIDP.forEach((p, r) => {
    text(p, 830, bidY(r) + 40, { size: 32, weight: 700, font: MONO, color: BUY, a: bA });
    ctx.save(); ctx.globalAlpha *= bA * 0.5; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(820, bidY(r) + 63); ctx.lineTo(1840, bidY(r) + 63); ctx.stroke(); ctx.restore();
  });
  if (hlRows) hlRows.forEach(([side, r, col, a]) => { ctx.save(); ctx.globalAlpha *= a; glow(col, 18); ctx.strokeStyle = col; ctx.lineWidth = 2; rr(818, rowY(side, r) - 4, 917, CH + 8, 14); ctx.stroke(); ctx.restore(); });
  cells.forEach((c) => {
    const col = c.side === 'a' ? SELL : BUY, am = c.side === 'a' ? aA : bA;
    cellBox(CX0 + c.slot * CPITCH, rowY(c.side, c.r), CW, CH, c.q, c.color || col, { a: c.a * am, s: c.s, hl: c.hl });
  });
  if (showBest > 0) {
    text('最佳卖价', 1580, askY(askBest) + 40, { size: 22, weight: 700, color: SELL, a: showBest * aA });
    text('最佳买价', 1580, bidY(bidBest) + 40, { size: 22, weight: 700, color: BUY, a: showBest * bA });
  }
  if (spreadA > 0) {
    const y = 466; ctx.save(); ctx.globalAlpha *= spreadA; ctx.setLineDash([6, 8]); ctx.strokeStyle = FILL + '99'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(830, y + 25); ctx.lineTo(1840, y + 25); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    ctx.save(); ctx.globalAlpha *= spreadA; rr(1160, y + 2, 260, 46, 23); ctx.fillStyle = '#0b0f1c'; ctx.fill(); ctx.restore();
    text(`价差 ${spread}`, 1290, y + 36, { size: 28, weight: 800, font: MONO, color: FILL, align: 'center', a: spreadA });
  }
}
const sideTag = (a, b) => {
  text('卖盘', 1745, 330, { size: 34, weight: 800, color: SELL, a });
  text('买盘', 1745, 690, { size: 34, weight: 800, color: BUY, a: b });
};

// ───────── 场景 1：订单簿与价格-时间优先 ─────────
function sceneBook(lt, d, sc) {
  header(lt, '01', '订单簿', BUY, '价格优先，同价时间优先');
  const tB = at(sc, '买盘按'), tA = at(sc, '卖盘按'), tBest = at(sc, '最高的买价'), tSp = at(sc, '中间的差距'), tQ = at(sc, '同一个价格'), tPT = at(sc, '这就是');
  const cells = baseCells();
  const bandA = Math.max(0.0, eOut(P(lt, 0.5, 1.3))), askA = bandA;
  cells.forEach((c) => { const t = c.side === 'a' ? tA : tB; c.a = eOut(P(lt, t - 0.2 + c.r * 0.35 + c.i * 0.08, t + 0.5 + c.r * 0.35 + c.i * 0.08)); });
  // 100.06 队列编号
  const qa = eOut(P(lt, tQ, tQ + 0.8));
  cells.forEach((c) => { if (c.side === 'b' && c.r === 2 && qa > 0) c.hl = qa > 0.5 ? FILL : null; });
  drawBook(cells, { aA: askA, bA: bandA, showBest: eOut(P(lt, tBest, tBest + 0.7)), spreadA: eOut(P(lt, tSp, tSp + 0.8)),
    hlRows: [['b', 0, BUY, eOut(P(lt, tBest, tBest + 0.6)) * 0.8], ['a', 3, SELL, eOut(P(lt, tBest + 0.6, tBest + 1.2)) * 0.8]] });
  sideTag(askA, bandA);
  // 排序箭头
  const arA = eOut(P(lt, tA - 0.3, tA + 0.6)), arB = eOut(P(lt, tB - 0.3, tB + 0.6));
  arrow(1826, 540, 1826, 780, { color: BUY, p: eOut(P(lt, tB, tB + 1.0)), a: arB, w: 3 });
  text('高', 1826, 524, { size: 22, color: BUY, align: 'center', a: arB }); text('低', 1826, 806, { size: 22, color: BUY, align: 'center', a: arB });
  arrow(1826, 440, 1826, 210, { color: SELL, p: eOut(P(lt, tA, tA + 1.0)), a: arA, w: 3 });
  text('高', 1826, 196, { size: 22, color: SELL, align: 'center', a: arA }); text('低', 1826, 470, { size: 22, color: SELL, align: 'center', a: arA });
  // 队列序号
  BIDS['100.06'].forEach((q, i) => {
    const a = eOut(P(lt, tQ + 0.2 + i * 0.3, tQ + 0.7 + i * 0.3)); if (a <= 0) return;
    const x = CX0 + i * CPITCH, y = bidY(2);
    dot(x + 8, y + 6, 13, FILL, { g: 10, a }); text(String(i + 1), x + 8, y + 13, { size: 20, weight: 800, align: 'center', color: '#06080f', a, font: MONO });
  });
  text('先到先成交', 1580, bidY(2) + 40, { size: 24, weight: 700, color: FILL, a: qa });
  bullet(0, '买盘：价高者优先', eOut(P(lt, tB, tB + 0.6)));
  bullet(1, '卖盘：价低者优先', eOut(P(lt, tA, tA + 0.6)));
  bullet(2, '同价：先到者优先', eOut(P(lt, tQ, tQ + 0.6)));
  statCard(110, 640, 640, '价差 = 最佳卖价 − 最佳买价', '0.02', { color: FILL, a: eOut(P(lt, tSp, tSp + 0.7)), note: '100.10 − 100.08' });
  text('美元价格，数据取自书中示例图', 110, 800, { size: 22, color: DIM, a: eOut(P(lt, tSp, tSp + 0.7)) });
}

// ───────── 场景 2：新单入簿 / 撤单（链表 + 订单号索引） ─────────
function sceneRest(lt, d, sc) {
  header(lt, '02', '新单入簿与撤单', NEW, '够不到对手价，就排队');
  const tIn = at(sc, '一张新的'), tCmp = at(sc, '如果价格'), tFly = at(sc, '比如价格'), tList = at(sc, '每个价位'), tMap = at(sc, '再加一张'), tO1 = at(sc, '入队'), tCancel = tMap + 1.3;
  const cells = baseCells();
  // 撤单：100.06 的 400 (i=1)
  const cp = eIO(P(lt, tCancel + 0.9, tCancel + 1.7)), cs = eIO(P(lt, tCancel + 1.7, tCancel + 2.3));
  cells.forEach((c) => {
    if (c.side === 'b' && c.r === 2) {
      if (c.i === 1) { c.s = 1 - cp; c.a = 1 - cp; c.hl = cp < 1 && lt > tCancel + 0.5 ? FILL : null; }
      if (c.i > 1) c.slot = c.i - cs;
    }
  });
  // 新单 chip → 入簿
  const pIn = eBack(P(lt, tIn, tIn + 0.6)), pf = eIO(P(lt, tFly, tFly + 1.1));
  const sx = 1590, sy = 482, tx = CX0 + 2 * CPITCH, ty = bidY(1);
  const cx = lerp(sx, tx, pf), cy = lerp(sy, ty, pf), cw = lerp(230, CW, pf);
  drawBook(cells, { aA: 0.4, bA: 1, spreadA: 0 });
  if (pIn > 0.02) {
    const landed = pf >= 1;
    cellBox(cx - (landed ? 0 : (cw - CW) / 2 * 0) , cy, cw, CH, pf > 0.7 ? 200 : '买 100.07 × 200', NEW, { a: clamp(pIn * 2), s: clamp(pIn), hl: lt < tList - 0.2 ? NEW : null, size: pf > 0.7 ? 26 : 22, fa: '44' });
  }
  const ca = eOut(P(lt, tCmp, tCmp + 0.7)) * (1 - eOut(P(lt, tFly + 0.6, tFly + 1.2)));
  text('100.07 < 最佳卖价 100.10', 830, 860, { size: 28, weight: 700, font: MONO, color: INK, a: ca });
  text('→ 够不到，不成交', 830, 896, { size: 28, weight: 700, color: NEW, a: ca });
  // 链表标注
  const la = eOut(P(lt, tList, tList + 0.8));
  // 手工小标签（避免 badge 过宽）：队首 / 队尾
  [1, 2].forEach((r) => {
    const cnt = r === 1 ? 3 : (cp >= 1 ? 4 - cs : 4), y = bidY(r);
    text('head', 966, y + 18, { size: 20, weight: 700, color: INFRA, font: MONO, a: la });
    text('tail', CX0 + (cnt - 1) * CPITCH + CW / 2, y + CH + 4 + 14, { size: 20, weight: 700, color: INFRA, font: MONO, align: 'center', a: la * 0 });
    text('◀ tail', CX0 + cnt * CPITCH + 4, y + 38, { size: 22, weight: 700, color: INFRA, font: MONO, a: la });
  });
  // 链表箭头（相邻节点）
  if (la > 0) [[1, 3], [2, 4]].forEach(([r, n]) => {
    const cnt = r === 2 && cs >= 1 ? 3 : n; if (r === 1 && pf < 1) { /* 新节点未到时少画一条 */ }
    for (let i = 0; i < cnt - 1; i++) {
      if (r === 1 && i === 1 && pf < 0.95) continue;
      if (r === 2 && cp > 0 && cs < 1) continue;
      const x = CX0 + i * CPITCH + CW, y = bidY(r) + CH / 2;
      ctx.save(); ctx.globalAlpha *= la; ctx.strokeStyle = INFRA; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 6, y); ctx.lineTo(x + 14, y); ctx.stroke(); ctx.restore();
    }
  });
  // orderMap
  const ma = eOut(P(lt, tMap, tMap + 0.8));
  glass(1640, 604, 200, 104, { a: ma, accent: INFRA, r: 18 });
  text('orderMap', 1740, 640, { size: 26, weight: 800, font: MONO, color: INFRA, align: 'center', a: ma });
  text('订单号 → 订单', 1740, 680, { size: 22, color: MUTE, align: 'center', a: ma });
  const ap = eOut(P(lt, tCancel, tCancel + 0.9));
  if (ap > 0) {
    const tx2 = CX0 + CPITCH + CW / 2, y = 655;
    const seg1 = clamp(ap * 2), seg2 = clamp(ap * 2 - 1);
    ctx.save(); ctx.strokeStyle = FILL; ctx.fillStyle = FILL; ctx.lineWidth = 3; glow(FILL, 12); ctx.setLineDash([8, 6]);
    ctx.beginPath(); ctx.moveTo(1640, y); ctx.lineTo(lerp(1640, tx2, seg1), y); ctx.stroke(); ctx.setLineDash([]);
    if (seg2 > 0) { ctx.beginPath(); ctx.moveTo(tx2, y); ctx.lineTo(tx2, lerp(y, bidY(2) - 2, seg2)); ctx.stroke(); }
    ctx.restore();
    if (seg2 > 0.95) { ctx.save(); ctx.fillStyle = FILL; ctx.translate(tx2, bidY(2) - 1); ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(-9, -12); ctx.lineTo(9, -12); ctx.closePath(); ctx.fill(); ctx.restore(); }
    const ta = eOut(P(lt, tCancel + 0.9, tCancel + 1.6));
    text('撤单：订单号直接定位，摘下节点', 830, 880, { size: 28, weight: 700, color: FILL, a: ta });
  }
  bullet(0, '够不到对手价：入簿排队', eOut(P(lt, tCmp, tCmp + 0.6)));
  bullet(1, '每个价位：双向链表队列', eOut(P(lt, tList, tList + 0.6)));
  bullet(2, '订单号索引：直达订单', eOut(P(lt, tMap, tMap + 0.6)));
  statCard(110, 640, 640, '入队 · 取队首 · 撤单', 'O(1)', { color: NEW, a: eOut(P(lt, tO1, tO1 + 0.7)), note: '找到价位与节点后' });
}

// ───────── 场景 3：大单扫过多档，逐笔成交 ─────────
function sceneSweep(lt, d, sc) {
  header(lt, '03', '逐笔撮合', FILL, '一张大单，吃掉对手盘');
  const t0 = at(sc, '现在来'), tF = at(sc, '依次成交'), tClear = at(sc, '这一档清空'), tNext = at(sc, '再去下一档'), tRep = at(sc, '每次成交'), tNew = at(sc, '新的最佳');
  const cells = baseCells();
  // 成交序列：[side-level r, i, 数量, 时间]
  const fills = [[3, 0, 200, at(sc, '两百、') - 0.1], [3, 1, 400, at(sc, '四百、') - 0.1], [3, 2, 1100, at(sc, '一千一百、') - 0.1], [3, 3, 100, at(sc, '一百，依次') - 0.1], [2, 0, 900, at(sc, '队首是') + 0.2]];
  const rem0 = 2700;
  let remaining = rem0, nDone = 0;
  const FD = 0.6;
  fills.forEach(([r, i, q, t], k) => {
    const fl = P(lt, t, t + FD), pop = eIO(P(lt, t + FD, t + FD + 0.5));
    if (lt >= t) { remaining -= q * clamp((lt - t) / 0.3); }
    if (lt >= t + 0.3) nDone = k + 1;
    cells.forEach((c) => {
      if (c.side !== 'a' || c.r !== r) return;
      if (c.i === i) { c.hl = fl > 0 && pop < 1 ? FILL : null; c.color = fl > 0 && pop < 1 ? FILL : null; c.a = 1 - pop; c.s = 1 + 0.15 * pop; }
      else if (c.i > i) c.slot -= eIO(P(lt, t + FD + 0.3, t + FD + 0.9));
    });
  });
  cells.forEach((c) => { if (!c.color) delete c.color; });
  remaining = Math.max(0, Math.round(remaining));
  const nDone2 = fills.filter(([, , , t]) => lt >= t + 0.3).length;
  const cleared = lt > fills[3][3] + 0.6 + 0.5;
  const bestNow = cleared ? 2 : 3;
  const sp = cleared ? '0.03' : '0.02';
  const spPulse = 1 + 0.08 * Math.sin(P(lt, tNew + 0.3, tNew + 1.0) * Math.PI);
  drawBook(cells, { aA: 1, bA: 0.55, askBest: bestNow, spreadA: 1, spread: sp, showBest: 1 });
  sideTag(1, 0.55);
  // 买入大单 chip
  const ci = eBack(P(lt, t0, t0 + 0.6));
  if (ci > 0.02) {
    ctx.save(); ctx.globalAlpha *= clamp(ci * 2); ctx.translate(1765, 240); ctx.scale(clamp(ci), clamp(ci));
    glow(NEW, 22); rr(-80, -52, 160, 104, 16); ctx.fillStyle = NEW + '33'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = NEW; ctx.stroke(); ctx.shadowBlur = 0;
    text('买入', 0, -14, { size: 22, color: MUTE, align: 'center' });
    text(String(remaining), 0, 30, { size: 44, weight: 800, font: MONO, color: remaining === 0 ? NEW : INK, align: 'center' });
    ctx.restore();
  }
  // 等式
  const parts = fills.map((f) => f[2]);
  let eq = '2700';
  for (let k = 0; k < nDone2; k++) eq += ` − ${parts[k]}`;
  if (nDone2 === 5) eq += ' = 0';
  text(eq, 830, 880, { size: 30, weight: 700, font: MONO, color: FILL, a: eOut(P(lt, fills[0][3], fills[0][3] + 0.5)) });
  const ra = eOut(P(lt, tRep, tRep + 0.8));
  text('每笔成交：买方一条 + 卖方一条回报', 830, 836, { size: 26, weight: 700, color: INK, a: ra });
  bullet(0, '先吃最优价位', eOut(P(lt, tF - 0.3, tF + 0.4)));
  bullet(1, '同价按队列先后', eOut(P(lt, tF + 1.2, tF + 1.9)));
  bullet(2, '清空一档，再去下一档', eOut(P(lt, tClear, tClear + 0.6)));
  statCard(110, 610, 640, '剩余数量', String(remaining), { color: NEW, a: eOut(P(lt, t0, t0 + 0.6)), h: 100 });
  statCard(110, 730, 640, '价差', sp, { color: FILL, a: eOut(P(lt, fills[3][3] + 1.2, fills[3][3] + 1.8)), h: 100, note: sp === '0.03' ? '变大了' : '' });
  void spPulse; void nDone;
}

// ───────── 场景 4：限价单 vs 市价单 ─────────
const LV = [['100.13', 300], ['100.12', 1500], ['100.11', 2000], ['100.10', 1800]]; // 自上而下
function ladder(x0, lt, consume, { title, sub, cap = false, id }) {
  const pw = 480, py = 180, ph = 640;
  glass(x0, py, pw, ph, { accent: id ? SC[id] : null, r: 24 });
  text(title, x0 + 28, py + 52, { size: 32, weight: 800, color: id ? SC[id] : INK });
  text(sub, x0 + 28, py + 92, { size: 22, color: MUTE });
  const rowH = 82, ry0 = py + 130;
  LV.forEach(([p, tot], i) => {
    const y = ry0 + i * rowH + (i === 3 ? 34 : 0), used = consume[p] || 0, scl = 280 / 2000;
    text(p, x0 + 28, y + 40, { size: 28, weight: 700, font: MONO, color: SELL });
    rr(x0 + 150, y + 8, tot * scl, 40, 8); ctx.fillStyle = 'rgba(255,255,255,.05)'; ctx.fill();
    const rest = (tot - used) * scl;
    ctx.save(); glow(SELL, 8); rr(x0 + 150, y + 8, Math.max(rest, 0.1), 40, 8); ctx.fillStyle = SELL + '55'; ctx.fill(); ctx.restore();
    if (used > 0) { rr(x0 + 150 + rest, y + 8, used * scl, 40, 8); ctx.fillStyle = FILL + 'cc'; ctx.fill(); }
    text(String(tot), x0 + 150 + tot * scl + 12, y + 38, { size: 22, color: MUTE, font: MONO });
  });
  if (cap) {
    const y = ry0 + 3 * rowH + 34 - 17;
    ctx.save(); ctx.setLineDash([8, 6]); ctx.strokeStyle = FILL; ctx.lineWidth = 3; glow(FILL, 10); ctx.beginPath(); ctx.moveTo(x0 + 16, y); ctx.lineTo(x0 + pw - 16, y); ctx.stroke(); ctx.restore();
    text('价格上限 100.10', x0 + pw - 28, y - 6, { size: 22, weight: 700, color: FILL, align: 'right' });
  }
}
function sceneMarket(lt, d, sc) {
  header(lt, '04', '限价单与市价单', SC[1], '区别在于有没有价格上限');
  const tL = at(sc, '限价买单只吃'), tM = at(sc, '市价单不设'), tDemo = at(sc, '下面用'), tNote = at(sc, '本章的设计');
  const pa = eOut(P(lt, 0.5, 1.2));
  const cL = eOut(P(lt, tL + 0.4, tL + 1.6)), cL2 = eIO(P(lt, tL + 1.8, tL + 2.6));
  const rest = eBack(P(lt, tL + 3.0, tL + 3.7));
  const m1 = eIO(P(lt, tM + 0.8, tM + 2.0)), m2 = eIO(P(lt, tM + 2.2, tM + 3.6));
  ctx.save(); ctx.globalAlpha *= pa;
  ladder(820, lt, { '100.10': 1800 * cL }, { title: '限价买 3000', sub: '限价 100.10', cap: true, id: 0 });
  ladder(1340, lt, { '100.10': 1800 * m1, '100.11': 1200 * m2 }, { title: '市价买 3000', sub: '无价格上限', id: 3 });
  ctx.restore();
  void cL2;
  // 结果
  const ra = eOut(P(lt, tL + 1.8, tL + 2.5));
  text('成交 1800，剩余 1200', 848, 724, { size: 26, weight: 700, font: MONO, color: FILL, a: ra });
  if (rest > 0.02) {
    ctx.save(); ctx.globalAlpha *= clamp(rest * 1.5); ctx.translate(848, 748); ctx.scale(1, 1);
    glow(NEW, 14); rr(0, 0, 424, 54, 14); ctx.fillStyle = NEW + '30'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = NEW; ctx.stroke(); ctx.shadowBlur = 0;
    text('挂入买盘，成为最佳买价 100.10', 212, 36, { size: 24, weight: 700, align: 'center', color: INK });
    ctx.restore();
  }
  const mr = eOut(P(lt, tM + 0.9, tM + 1.6));
  text('100.10 成交 1800', 1368, 724, { size: 26, weight: 700, font: MONO, color: FILL, a: mr });
  text('100.11 成交 1200', 1368, 760, { size: 26, weight: 700, font: MONO, color: FILL, a: eOut(P(lt, tM + 2.2, tM + 2.9)) });
  bullet(0, '限价：价格有上限', eOut(P(lt, tL, tL + 0.6)));
  bullet(1, '吃不完的部分入簿', eOut(P(lt, tL + 1.8, tL + 2.4)));
  bullet(2, '市价：不设上限，扫多档', eOut(P(lt, tM, tM + 0.6)));
  badge(110, 640, '示意：3000 股，卖盘数量取自书中示例', INFRA, eOut(P(lt, tDemo, tDemo + 0.6)));
  text('本章设计只做限价单，市价单作对照', 110, 760, { size: 26, weight: 700, color: FILL, a: eOut(P(lt, tNote, tNote + 0.7)) });
}

// ───────── 场景 5：排序器与确定性 ─────────
function sceneSeq(lt, d, sc) {
  header(lt, '05', '排序器与可重放', INFRA, '先有顺序，再有结果');
  const tIn = at(sc, '所以订单先过'), tNum = at(sc, '每条入站'), tEng = at(sc, '撮合引擎严格'), tRep = at(sc, '同样的初始状态');
  const slots = [['#1', '买单', BUY], ['#2', '卖单', SELL], ['#3', '撤单', MUTE], ['#4', '买单', BUY], ['#5', '成交', FILL]];
  const SX = (i) => 1318 + i * 102, TY = 300;
  // 到达的订单（乱序到达，来自不同客户）
  const arr = [['买单', BUY, 290, 0.0], ['卖单', SELL, 350, 0.35], ['撤单', MUTE, 410, 0.7], ['买单', BUY, 470, 1.0]];
  const bx = 1020;
  const ba = eOut(P(lt, 0.5, 1.2));
  box(bx, 290, 210, 220, '排序器', { color: INFRA, sub: 'Sequencer', a: ba, s: 1 });
  text('入站订单（先后顺序不定）', 830, 232, { size: 22, color: MUTE, a: eOut(P(lt, 0.8, 1.4)) });
  arr.forEach(([n, c, y, dt], k) => {
    const t = tIn + 0.2 + dt * 1.3, p = eIO(P(lt, t, t + 1.0));
    const stage = eOut(P(lt, 0.8 + k * 0.2, 1.4 + k * 0.2));
    if (stage <= 0.02) return;
    const x = lerp(830, bx - 125, p), yy = lerp(y, 400, p);
    cellBox(x, yy - 24, 110, 48, n, c, { a: stage * (1 - P(lt, t + 0.8, t + 1.0)), size: 24 });
  });
  glass(1300, 270, 540, 140, { a: eOut(P(lt, tNum - 0.4, tNum + 0.4)), accent: INFRA });
  text('事件日志（只追加）', 1318, 262, { size: 22, color: MUTE, a: eOut(P(lt, tNum - 0.4, tNum + 0.4)) });
  slots.forEach(([id, ty, c], i) => {
    const t = tNum + 0.3 + i * 0.75, a = eBack(P(lt, t, t + 0.5));
    if (a <= 0.02) return;
    ctx.save(); ctx.globalAlpha *= clamp(a * 2); ctx.translate(SX(i) + 46, TY + 60); ctx.scale(clamp(a), clamp(a));
    rr(-46, -44, 92, 88, 12); ctx.fillStyle = c + '30'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke();
    text(id, 0, -4, { size: 28, weight: 800, font: MONO, align: 'center' });
    text(ty, 0, 28, { size: 22, color: c === MUTE ? INK : c, align: 'center', weight: 700 });
    ctx.restore();
  });
  text('出站成交也编号', 1830, 262, { size: 22, color: FILL, align: 'right', a: eOut(P(lt, tNum + 3.2, tNum + 3.9)) });
  arrow(1250, 380, 1300, 380, { color: INFRA, p: eOut(P(lt, tNum, tNum + 0.5)), a: ba });
  // 撮合引擎 A
  const eA = eOut(P(lt, tEng - 0.3, tEng + 0.5));
  const pA = clamp((lt - (tEng + 0.2)) / 3.0) * 5;     // 游标走过 5 个槽
  const curA = Math.min(Math.floor(pA), 4), doneA = Math.min(Math.floor(pA + 0.2), 5);
  const bxA = 1318, bxB = 1578, ey = 570;
  glass(bxA, ey, 250, 120, { a: eA, accent: BUY }); text('撮合引擎', bxA + 125, ey + 52, { size: 30, weight: 800, align: 'center', a: eA });
  text('单线程 · 按号处理', bxA + 125, ey + 92, { size: 20, color: MUTE, align: 'center', a: eA });
  if (eA > 0 && pA > 0 && pA < 5.3) { const sx2 = SX(curA) + 46; ctx.save(); ctx.strokeStyle = BUY; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(sx2, 418); ctx.lineTo(bxA + 125, ey); ctx.stroke(); ctx.restore(); dot(sx2, 414, 9, BUY, { g: 14 }); }
  const stA = eOut(P(lt, tEng + 3.3, tEng + 4.0));
  glass(bxA, 710, 250, 96, { a: stA, accent: BUY });
  text(`已处理 #${doneA}`, bxA + 125, 748, { size: 26, weight: 700, font: MONO, align: 'center', a: stA });
  text('簿状态 7c2e', bxA + 125, 788, { size: 24, weight: 700, font: MONO, color: BUY, align: 'center', a: stA });
  // 重放 B
  const eB = eOut(P(lt, tRep - 0.2, tRep + 0.6));
  const pB = clamp((lt - (tRep + 0.6)) / 2.6) * 5, curB = Math.min(Math.floor(pB), 4), doneB = Math.min(Math.floor(pB + 0.2), 5);
  glass(bxB, ey, 250, 120, { a: eB, accent: SC[3] }); text('重放 / 备机', bxB + 125, ey + 52, { size: 30, weight: 800, align: 'center', a: eB });
  text('同一份日志', bxB + 125, ey + 92, { size: 20, color: MUTE, align: 'center', a: eB });
  if (eB > 0 && pB > 0 && pB < 5.3) { const sx2 = SX(curB) + 46; ctx.save(); ctx.strokeStyle = SC[3]; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(sx2, 418); ctx.lineTo(bxB + 125, ey); ctx.stroke(); ctx.restore(); dot(sx2, 414, 9, SC[3], { g: 14 }); }
  const stB = eOut(P(lt, tRep + 3.4, tRep + 4.0));
  glass(bxB, 710, 250, 96, { a: stB, accent: SC[3] });
  text(`已处理 #${doneB}`, bxB + 125, 748, { size: 26, weight: 700, font: MONO, align: 'center', a: stB });
  text('簿状态 7c2e', bxB + 125, 788, { size: 24, weight: 700, font: MONO, color: SC[3], align: 'center', a: stB });
  const ca = eOut(P(lt, tRep + 4.0, tRep + 4.8));
  text('同样的有序输入 → 同样的结果', 1318, 856, { size: 32, weight: 800, color: NEW, a: ca });
  text('示意：7c2e 为簿状态摘要', 1318, 892, { size: 22, color: DIM, a: ca });
  bullet(0, '入站订单、出站成交都编号', eOut(P(lt, tNum, tNum + 0.6)));
  bullet(1, '公平 · 可重放 · 恰好一次', eOut(P(lt, tNum + 1.5, tNum + 2.1)));
  bullet(2, '引擎严格按序号处理', eOut(P(lt, tEng, tEng + 0.6)));
  statCard(110, 640, 640, '相同初始状态 + 相同有序输入', '相同结果', { color: NEW, a: eOut(P(lt, tRep, tRep + 0.7)), h: 112 });
}

// ───────── 场景 6：低延迟 · 缩短路径 ─────────
function sceneFast(lt, d, sc) {
  header(lt, '06', '低延迟的目标', SC[3], '几十毫秒 → 几十微秒');
  const tGoal = at(sc, '目标是'), tTwo = at(sc, '办法有两条'), tDist = at(sc, '分布式设计'), tOne = at(sc, '于是把关键');
  const names = ['网关', '订单管理器', '排序器', '撮合引擎'];
  const X = [830, 1075, 1320, 1565], BW = 200, BH = 100;
  // 上：分布式
  const a1 = eOut(P(lt, 0.8, 1.6));
  text('分布式设计：跨服务网络 + 排序器写磁盘', 830, 200, { size: 26, weight: 700, color: MUTE, a: a1 });
  names.forEach((n, i) => box(X[i], 235, BW, BH, n, { color: i === 2 ? INFRA : SC[0], a: a1, size: 26 }));
  for (let i = 0; i < 3; i++) arrow(X[i] + BW + 4, 285, X[i + 1] - 4, 285, { color: MUTE, dash: [6, 6], a: a1, p: 1, w: 3 });
  const nt = eOut(P(lt, tDist, tDist + 0.7));
  [0, 1, 2].forEach((i) => text('网络', X[i] + BW + 35, 270, { size: 20, color: SC[3], align: 'center', a: nt }));
  text('磁盘 I/O', X[2] + BW / 2, 366, { size: 22, weight: 700, color: SC[3], align: 'center', a: nt });
  const ga = eOut(P(lt, 1.6, 2.4)) * (1 - eOut(P(lt, tOne - 0.4, tOne + 0.3)));
  text('目标：几十毫秒 → 几十微秒', 830, 640, { size: 56, weight: 800, color: SC[3], a: ga });
  text('延迟的尺度，差了一千倍', 830, 700, { size: 28, color: MUTE, a: ga * eOut(P(lt, tGoal + 2.5, tGoal + 3.2)) });
  // 慢包
  const tp = P(lt, tDist + 0.3, tDist + 5.8);
  if (tp > 0 && tp < 1) { const x = lerp(X[0] + 60, X[3] + 140, tp); dot(x, 285, 12, SC[3], { g: 22 }); }
  const t1 = lerp(0, 40, clamp(P(lt, tDist + 0.3, tDist + 5.8)));
  text('几十毫秒', 1840, 200, { size: 34, weight: 800, font: SANS, color: RED, align: 'right', a: eOut(P(lt, tDist + 4.8, tDist + 5.6)) });
  void t1;
  // 下：单机
  const a2 = eOut(P(lt, tOne, tOne + 0.8));
  ctx.save(); ctx.globalAlpha *= a2; ctx.setLineDash([10, 8]); ctx.strokeStyle = SC[4]; ctx.lineWidth = 2.5; rr(812, 530, 980, 220, 24); ctx.stroke(); ctx.restore();
  text('同一台服务器：共享内存，不走网络、不碰磁盘', 830, 508, { size: 26, weight: 700, color: SC[4], a: a2 });
  ['订单管理器', '排序器', '撮合引擎', '行情发布器'].forEach((n, i) => box(X[i], 590, BW, BH, n, { color: i === 2 ? BUY : SC[4], a: a2, size: 24 }));
  for (let i = 0; i < 3; i++) arrow(X[i] + BW + 4, 640, X[i + 1] - 4, 640, { color: SC[4], a: a2, w: 3 });
  const lp = P(lt, tOne + 0.8, tOne + 4.4);
  if (lp > 0 && lp < 1) { const q = (lp * 4) % 1; const x = lerp(X[0] + 60, X[3] + 140, q); dot(x, 640, 12, SC[4], { g: 22 }); }
  text('几十微秒', 1840, 800, { size: 38, weight: 800, color: SC[4], align: 'right', a: eOut(P(lt, tOne + 3.8, tOne + 4.6)) });
  text('书中量级：几十毫秒 vs 几十微秒', 830, 850, { size: 22, color: DIM, a: eOut(P(lt, tOne + 3.8, tOne + 4.6)) });
  bullet(0, '减少关键路径上的任务', eOut(P(lt, tTwo, tTwo + 0.6)));
  bullet(1, '缩短每个任务的耗时', eOut(P(lt, tTwo + 1.2, tTwo + 1.8)));
  bullet(2, '网络、磁盘、计算', eOut(P(lt, tTwo + 2.2, tTwo + 2.8)));
  statCard(110, 640, 640, '延迟量级', '毫秒 → 微秒', { color: SC[3], a: eOut(P(lt, tOne, tOne + 0.7)) });
  void tGoal;
}

// ───────── 场景 7：mmap 事件总线 + 绑核单线程循环 ─────────
function sceneBus(lt, d, sc) {
  header(lt, '07', 'mmap 与单线程循环', BUY, '进程间不走网络，也不抢锁');
  const tM = at(sc, '进程之间'), tW = at(sc, '一个进程写'), tLoop = at(sc, '撮合循环'), tMem = at(sc, '订单簿整个');
  // 共享内存条
  const sa = eOut(P(lt, 0.5, 1.2));
  glass(830, 200, 1000, 110, { a: sa, accent: BUY });
  text('mmap 事件存储 · 共享内存（Linux 可用 /dev/shm）', 850, 190, { size: 22, color: MUTE, a: sa });
  const N = 10, SXm = (i) => 850 + i * 96;
  const wr = Math.min(N, Math.floor(P(lt, tW, tW + 3.0) * N + 0.99));
  for (let i = 0; i < N; i++) {
    const a = i < wr ? eBack(P(lt, tW + i * 0.3, tW + i * 0.3 + 0.4)) : 0;
    rr(SXm(i), 222, 84, 66, 10); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
    if (a > 0.02) cellBox(SXm(i), 222, 84, 66, `#${i + 1}`, BUY, { s: clamp(a), a: clamp(a * 2), size: 24 });
  }
  // 进程
  const procs = [['排序器', '唯一写者', INFRA, 0], ['撮合引擎', '读 + 处理', SC[2], 1], ['行情发布器', '读', SC[4], 2], ['订单管理器', '读', SC[3], 3]];
  const PX = (i) => 830 + i * 250;
  procs.forEach(([n, s, c, i]) => {
    const a = eOut(P(lt, 0.8 + i * 0.25, 1.5 + i * 0.25));
    box(PX(i), 380, 210, 96, n, { color: c, sub: s, a, size: 26 });
    if (a > 0.5 && lt > tW) {
      const x = PX(i) + 105;
      if (i === 0) arrow(x, 380, x, 316, { color: c, w: 3, a, p: 1 });
      else {
        const cur = 3 + Math.min(i * 1.6 + 0.6, 9) * Math.min(1, P(lt, tW + 0.8, tW + 3.4)) + (i === 1 ? 0.6 : 0);
        const cx = SXm(clamp(Math.floor(cur), 0, N - 1)) + 42;
        ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(x, 380); ctx.lineTo(cx, 322); ctx.stroke(); ctx.restore();
        dot(cx, 318, 7, c, { g: 10, a });
      }
    }
  });
  text('各自维护读游标', 1330, 506, { size: 22, color: DIM, a: eOut(P(lt, tW + 2.5, tW + 3.2)) });
  // 应用循环
  const la = eOut(P(lt, tLoop, tLoop + 0.8));
  const cx = 1050, cy = 745, R = 120;
  glass(830, 540, 560, 340, { a: la, accent: SC[2] });
  text('应用循环 · 固定在一个 CPU 核', 850, 578, { size: 24, weight: 700, color: SC[2], a: la });
  ctx.save(); ctx.globalAlpha *= la; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(cx, cy + 10, R - 20, 0, 7); ctx.stroke(); ctx.restore();
  const steps = ['读事件', '撮合', '写结果'];
  const phase = ((lt - tLoop) * 0.7) % 3;
  steps.forEach((s, k) => {
    const ang = -Math.PI / 2 + k * (Math.PI * 2 / 3), x = cx + Math.cos(ang) * (R - 20), y = cy + 10 + Math.sin(ang) * (R - 20);
    const on = la > 0.9 && Math.floor(phase) === k;
    dot(x, y, on ? 17 : 12, on ? SC[2] : DIM, { g: on ? 22 : 0, a: la });
    const lx = k === 0 ? x : k === 1 ? x + 30 : x - 30, ly = k === 0 ? y - 34 : y + 12;
    text(s, lx, ly + (k === 0 ? 0 : 8), { size: 24, weight: 700, color: on ? INK : MUTE, align: k === 1 ? 'left' : k === 2 ? 'right' : 'center', a: la });
  });
  if (la > 0.9) { const aa = -Math.PI / 2 + phase * (Math.PI * 2 / 3); dot(cx + Math.cos(aa) * (R - 20), cy + 10 + Math.sin(aa) * (R - 20), 6, '#fff', { g: 18 }); }
  const ba = eOut(P(lt, tLoop + 1.2, tLoop + 2.0));
  text('没有上下文切换', 1190, 690, { size: 24, weight: 700, color: INK, a: ba });
  text('没有锁竞争', 1190, 734, { size: 24, weight: 700, color: INK, a: eOut(P(lt, tLoop + 2.2, tLoop + 3.0)) });
  // 内存订单簿
  const tMem2 = tMem - 0.4;
  const ma = eOut(P(lt, tMem2, tMem2 + 0.6));
  glass(1430, 540, 400, 340, { a: ma, accent: SC[4] });
  text('订单簿 · 全在内存', 1450, 578, { size: 24, weight: 700, color: SC[4], a: ma });
  [220, 160, 110, 70].forEach((w, i) => { const p = eOut(P(lt, tMem2 + 0.3 + i * 0.12, tMem2 + 0.9 + i * 0.12)); rr(1450, 610 + i * 34, w * p, 26, 8); ctx.fillStyle = SELL + '88'; ctx.fill(); });
  [210, 150, 100].forEach((w, i) => { const p = eOut(P(lt, tMem2 + 0.8 + i * 0.12, tMem2 + 1.4 + i * 0.12)); rr(1450, 750 + i * 34, w * p, 26, 8); ctx.fillStyle = BUY + '88'; ctx.fill(); });
  text('不读磁盘、不走网络', 1450, 872, { size: 22, color: MUTE, a: ma });
  bullet(0, 'mmap：事件存储映射进地址空间', eOut(P(lt, tM, tM + 0.6)), { size: 28 });
  bullet(1, '一写多读，各有读游标', eOut(P(lt, tW, tW + 0.6)));
  bullet(2, '单线程循环，绑定 CPU 核', eOut(P(lt, tLoop, tLoop + 0.6)));
  bullet(3, '订单簿放内存', eOut(P(lt, tMem2, tMem2 + 0.6)));
}

// ───────── 场景 8：高可用 · 热备 ─────────
function sceneHA(lt, d, sc) {
  header(lt, '08', '高可用：热备', SC[4], '备机同序重放，主机倒下就接手');
  const tT = at(sc, '目标是'), tHot = at(sc, '所以给撮合引擎'), tHb = at(sc, '心跳检测'), tRep = at(sc, '事件在服务器'), tFail = tHb + 0.4;
  const failT = tFail + 1.8, promoT = failT + 2.2;
  const dead = lt > failT, prom = eIO(P(lt, promoT, promoT + 1.0));
  const PXa = 850, PXb = 1500, PY = 420, PW = 330, PH = 150;
  // 事件日志条 + 复制
  const ia = eOut(P(lt, 0.6, 1.2));
  glass(850, 200, 980, 90, { a: ia, accent: INFRA });
  text('事件流（有序）', 870, 192, { size: 22, color: MUTE, a: ia });
  for (let i = 0; i < 9; i++) cellBox(870 + i * 106, 214, 90, 44, `#${i + 1}`, INFRA, { a: ia, size: 22 });
  // 事件包 → 主 / 备
  const ev = (lt * 0.9) % 1;
  if (ia > 0.9 && lt > tHot - 0.3) {
    const pa = eOut(P(lt, tHot - 0.3, tHot + 0.5));
    const a = dead ? 0 : 1;
    [[PXa + PW / 2, 1, SC[0]], [PXb + PW / 2, 1, SC[1]]].forEach(([x, , c], j) => {
      if (j === 0 && dead) return;
      packet(x, 300, x, 420, ev, c, { r: 8, a: pa, trail: 0.2 }); packet(x, 300, x, 420, (ev + 0.5) % 1, c, { r: 8, a: pa, trail: 0.2 });
    });
    void a;
  }
  text('可靠 UDP 复制', 1640, 345, { size: 22, color: MUTE, align: 'right', a: eOut(P(lt, tRep, tRep + 0.7)) });
  // 主
  const ma = eOut(P(lt, 1.0, 1.7));
  box(PXa, PY, PW, PH, dead ? '原主机' : '主：撮合引擎', { color: dead ? RED : BUY, hot: dead && lt < failT + 1.5, a: ma * (dead ? clamp(1 - P(lt, failT + 1, failT + 2) * 0.55) : 1), size: 30, sub: dead ? '宕机' : '发布成交' });
  // 备
  const bA = eOut(P(lt, tHot - 0.2, tHot + 0.6));
  box(PXb, PY, PW, PH, prom > 0.5 ? '新主：撮合引擎' : '备：撮合引擎', { color: prom > 0.5 ? BUY : SC[1], a: bA, size: 30, sub: prom > 0.5 ? '开始发布成交' : '同序处理，不发布' });
  // 心跳
  if (lt > tHb - 0.2 && !dead) {
    const hb = (lt * 0.8) % 1;
    arrow(PXa + PW + 6, 480, PXb - 6, 480, { color: SC[3], dash: [8, 8], w: 3, a: eOut(P(lt, tHb - 0.2, tHb + 0.4)) });
    packet(PXb - 6, 480, PXa + PW + 6, 480, hb, SC[3], { r: 8 });
    text('心跳', 1340, 464, { size: 22, color: SC[3], align: 'center' });
  }
  if (dead) {
    const x1 = PXa + PW + 6, x2 = PXb - 6;
    ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.setLineDash([8, 8]); ctx.globalAlpha *= 0.8; ctx.beginPath(); ctx.moveTo(x1, 480); ctx.lineTo(x2, 480); ctx.stroke(); ctx.restore();
    text('心跳中断', 1340, 464, { size: 22, weight: 700, color: RED, align: 'center' });
    ctx.save(); ctx.globalAlpha *= eOut(P(lt, failT, failT + 0.5)); ctx.strokeStyle = RED; ctx.lineWidth = 8; ctx.lineCap = 'round';
    const cx = PXa + PW - 40, cy = PY + 40; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 14, cy - 14); ctx.lineTo(cx + 14, cy + 14); ctx.moveTo(cx + 14, cy - 14); ctx.lineTo(cx - 14, cy + 14); ctx.stroke(); ctx.restore();
  }
  // 成交回报输出
  const oa = eOut(P(lt, 1.2, 2.0));
  glass(850, 700, 980, 80, { a: oa });
  text('对外：成交回报 / 行情', 1340, 692, { size: 22, color: MUTE, align: 'center', a: oa });
  const outA = !dead ? 1 : 0, outB = prom;
  arrow(PXa + PW / 2, 580, PXa + PW / 2, 696, { color: BUY, a: oa * outA, w: 4 });
  arrow(PXb + PW / 2, 580, PXb + PW / 2, 696, { color: SC[1], dash: [6, 8], a: oa * (1 - prom) * 0.6, w: 3 });
  arrow(PXb + PW / 2, 580, PXb + PW / 2, 696, { color: BUY, a: oa * outB, w: 4 });
  text('备机不发布', PXb + PW / 2 + 16, 650, { size: 22, color: MUTE, a: oa * (1 - prom) });
  if (!dead) { for (let k = 0; k < 3; k++) { const u = ((lt * 0.8 + k / 3) % 1); dot(PXa + PW / 2, lerp(590, 700, u), 6, BUY, { g: 10, a: oa * Math.sin(u * Math.PI) }); } }
  else if (prom > 0.9) { for (let k = 0; k < 3; k++) { const u = ((lt * 0.8 + k / 3) % 1); dot(PXb + PW / 2, lerp(590, 700, u), 6, BUY, { g: 10, a: Math.sin(u * Math.PI) }); } }
  const wa = eOut(P(lt, promoT + 1.2, promoT + 2.0));
  text('接任前须有任期 + 隔离旧主，避免两台同时发布', 850, 836, { size: 26, weight: 700, color: SC[3], a: wa });
  bullet(0, '热备：同样的事件流', eOut(P(lt, tHot, tHot + 0.6)));
  bullet(1, '备机处理但不对外发布', eOut(P(lt, tHot + 1.5, tHot + 2.1)));
  bullet(2, '心跳失联：备机接任主节点', eOut(P(lt, tHb, tHb + 0.6)));
  statCard(110, 640, 640, '可用性 99.99%', '≈ 8.64 秒/天', { color: SC[4], a: eOut(P(lt, tT, tT + 0.7)), note: '可停机预算' });
}

// ───────── 场景 9：总结 ─────────
function sceneEnd(lt) {
  text('证券交易所', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Stock Exchange', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['价格优先', '同价排队，先到先成交', BUY], ['先有顺序', '单线程 + 内存，结果确定又快', INFRA], ['热备重放', '同序事件，主机倒下就接手', SC[4]]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.5, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 70, weight: 800 });
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  text('先有顺序，再有结果', 110, 780, { size: 40, weight: 800, color: INK, a: eOut(P(lt, 6.0, 6.8)) });
  text('价格优先，同价排队；交易走短路；日志可重放，副本不双发', 110, 836, { size: 26, color: MUTE, a: eOut(P(lt, 6.6, 7.4)) });
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  // 右侧装饰订单簿：条形随时间轻微呼吸（确定性）
  ctx.save(); ctx.globalAlpha *= 0.9;
  for (let i = 0; i < 8; i++) {
    const p = eOut(P(lt, 0.6 + i * 0.12, 1.4 + i * 0.12)), sell = i < 4, k = sell ? 3 - i : i - 4;
    const w = (90 + rnd(i + 7) * 200 + Math.sin(lt * 1.6 + i) * 18) * p, y = sell ? 270 + i * 74 : 340 + i * 74;
    const c = sell ? SELL : BUY;
    glow(c, 14); rr(1700 - w, y, w, 52, 12); ctx.fillStyle = c + '66'; ctx.fill(); ctx.shadowBlur = 0;
    text((sell ? ['100.13', '100.12', '100.11', '100.10'][i] : ['100.08', '100.07', '100.06', '100.05'][i - 4]), 1180, y + 38, { size: 26, weight: 700, font: MONO, color: c, a: p, align: 'right' });
  }
  ctx.restore();
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 0.4, 1.4)); ctx.translate(0, (1 - eOut(P(lt, 0.4, 1.4))) * 30);
  ctx.font = `900 150px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('证券交易所', 104, 520); ctx.restore();
  text('Stock Exchange', 112, 590, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 28 章', 112, 680, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

export const scenes = { title: sceneTitle, book: sceneBook, rest: sceneRest, sweep: sceneSweep, market: sceneMarket, seq: sceneSeq, fast: sceneFast, bus: sceneBus, ha: sceneHA, end: sceneEnd };
