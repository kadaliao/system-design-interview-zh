// 第 22 章 酒店预订系统：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 22, title: '酒店预订系统', en: 'Hotel Reservation System' };

const DBC = SC[0], UA = SC[2], UB = SC[3], LOCK = SC[1], OK = SC[4];
const pop = (lt, t0, d = 0.6) => eOut(P(lt, t0, t0 + d));
// 旁白里某句话的起点（按字符比例估算）
const cue = (sc, s, off = 0) => { const i = sc.text.indexOf(s); return sc.lead + (sc.voiceDur * (i < 0 ? 0 : i)) / sc.text.length + off; };

// ───────── 组件 ─────────
/** 库存条：已订 res / 上限 cap，物理库存 total 画虚线 */
function stockBar(x, y, w, o) {
  const { label = '', res, cap = 110, total = 100, max = 120, a = 1, showCap = true, showTotal = true, h = 36, color = DBC, flash = null, ver = null, valColor = null } = o;
  if (a <= 0) return;
  const sc = w / max, by = y + 34;
  ctx.save(); ctx.globalAlpha *= a;
  if (label) text(label, x, y + 22, { size: 22, color: MUTE, font: MONO });
  rr(x, by, w, h, h / 2); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  const over = res > cap + 1e-6 || (!showCap && res > total + 1e-6);
  const c = flash || (over ? RED : color);
  ctx.fillStyle = c; glow(c, 14); rr(x, by, Math.max(h, res * sc), h, h / 2); ctx.fill(); ctx.shadowBlur = 0;
  if (showTotal) {
    const tx = x + total * sc;
    ctx.setLineDash([5, 5]); ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx, by - 6); ctx.lineTo(tx, by + h + 6); ctx.stroke(); ctx.setLineDash([]);
    text(`物理 ${total}`, tx, by + h + 30, { size: 20, color: MUTE, align: 'center', font: MONO });
  }
  if (showCap) {
    const cx = x + cap * sc;
    ctx.strokeStyle = UB; ctx.lineWidth = 3; glow(UB, 8); ctx.beginPath(); ctx.moveTo(cx, by - 12); ctx.lineTo(cx, by + h + 12); ctx.stroke(); ctx.shadowBlur = 0;
    text(`上限 ${cap}`, cx, by - 20, { size: 20, color: UB, align: 'center', font: MONO, weight: 700 });
  }
  text(`${Math.round(res)}`, x + w + 26, by + 29, { size: 38, weight: 800, font: MONO, color: valColor || (over ? RED : INK) });
  if (ver !== null) text(`version ${ver}`, x + w + 26, by + 66, { size: 22, weight: 700, font: MONO, color: LOCK });
  ctx.restore();
}
/** 事务卡：lines = [t0, str, color?, t1?] */
function txCard(x, y, w, h, title, color, lines, lt, a = 1, step = 50) {
  glass(x, y, w, h, { a, accent: color });
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; glow(color, 14); rr(x + 24, y, w - 48, 5, 3); ctx.fill(); ctx.restore();
  text(title, x + 24, y + 46, { size: 28, weight: 800, color, a });
  lines.forEach(([t0, str, col, t1], i) => {
    let p = pop(lt, t0, 0.35); if (t1 !== undefined) p *= 1 - P(lt, t1, t1 + 0.3);
    if (p <= 0) return;
    text(str, x + 24, y + 98 + i * step, { size: 24, font: MONO, color: col || INK, a: p, weight: 600 });
  });
}
function lockIcon(x, y, color, a = 1, open = false) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 5; glow(color, 12);
  ctx.beginPath(); ctx.arc(x + 20, y + (open ? 4 : 10), 14, Math.PI, 0); if (!open) { ctx.lineTo(x + 34, y + 24); ctx.moveTo(x + 6, y + 10); ctx.lineTo(x + 6, y + 24); } ctx.stroke();
  rr(x, y + 24, 40, 30, 7); ctx.fill(); ctx.restore();
}
function node(x, y, w, h, label, sub, color, { a = 1, hot = false, big = null, bigColor = INK } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  glass(x, y, w, h, { accent: hot ? RED : color });
  ctx.fillStyle = hot ? RED : color; glow(hot ? RED : color, 16); rr(x + 24, y, w - 48, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
  text(label, x + w / 2, y + 46, { size: 30, weight: 800, align: 'center' });
  if (sub) text(sub, x + w / 2, y + 78, { size: 20, color: MUTE, align: 'center', font: MONO });
  if (big !== null) text(big, x + w / 2, y + h - 36, { size: 56, weight: 800, align: 'center', font: MONO, color: bigColor });
  ctx.restore();
}
function mark(x, y, ok, a = 1, s = 1) {
  if (a <= 0) return; const c = ok ? OK : RED;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(s, s); ctx.strokeStyle = c; ctx.lineWidth = 6; ctx.lineCap = 'round'; glow(c, 14);
  ctx.beginPath();
  if (ok) { ctx.moveTo(-14, 0); ctx.lineTo(-4, 11); ctx.lineTo(16, -12); } else { ctx.moveTo(-12, -12); ctx.lineTo(12, 12); ctx.moveTo(12, -12); ctx.lineTo(-12, 12); }
  ctx.stroke(); ctx.restore();
}
function rise(x, y, str, t, color, lt) { // 数字飘起
  const p = P(lt, t, t + 0.9); if (p <= 0 || p >= 1) return;
  text(str, x, y - eOut(p) * 36, { size: 30, weight: 800, font: MONO, color, align: 'center', a: Math.sin(p * Math.PI) });
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const ox = 1160, oy = 280, cw = 100, ch = 80, gp = 14;
  const hot = new Set([8, 9, 10]);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
    const i = r * 6 + c, p = eOut(P(lt, 0.4 + i * 0.04, 1.4 + i * 0.04));
    const x = ox + c * (cw + gp), y = oy + r * (ch + gp);
    let f = 0.25 + rnd(i + 3) * 0.55;
    const book = hot.has(i) ? P(lt, 3.2 + (i - 8) * 0.5, 3.9 + (i - 8) * 0.5) : 0;
    f = Math.min(1, f + book * 0.18);
    glass(x, y, cw, ch, { a: p, r: 14, accent: hot.has(i) && book > 0 ? UA : null });
    ctx.save(); ctx.globalAlpha *= p; ctx.fillStyle = f > 0.9 ? RED : DBC; glow(DBC, 8); rr(x + 10, y + ch - 24, (cw - 20) * f * p, 12, 6); ctx.fill(); ctx.restore();
    text(String(i + 1), x + 14, y + 34, { size: 22, font: MONO, color: MUTE, a: p, weight: 700 });
    if (book > 0 && book < 1) { ctx.save(); ctx.strokeStyle = UA; ctx.lineWidth = 3; ctx.globalAlpha = 1 - book; rr(x - 4 - book * 8, y - 4 - book * 8, cw + 8 + book * 16, ch + 8 + book * 16, 16); ctx.stroke(); ctx.restore(); }
  }
  text('酒店 × 房型 × 日期 = 一行库存', ox, 215, { size: 26, color: MUTE, a: eOut(P(lt, 1.2, 2)) });
  const a = eOut(P(lt, 0.2, 1.2));
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 900, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4)); ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 130px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('酒店预订', 104, 510); ctx.fillText('系统', 104, 650); ctx.restore();
  text('Hotel Reservation System', 112, 720, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 22 章', 112, 800, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 1：库存模型 ─────────
const ROWS = [
  [211, 1001, '2021-06-01', 100, 80], [211, 1001, '2021-06-02', 100, 82], [211, 1001, '2021-06-03', 100, 86],
  [211, 1001, '…', '…', '…'], [211, 1002, '2021-06-01', 200, 16], [2210, 101, '2021-06-01', 30, 23], [2210, 101, '2021-06-02', 30, 25],
];
function sceneModel(lt, d, sc) {
  header(lt, '01', '库存模型', SC[0], '一天一行，不是一间一行');
  const x0 = 820, y0 = 215, cols = [0, 130, 290, 520, 730], rw = 70;
  const tA = cue(sc, '所以库存'), tB = cue(sc, '五千家酒店');
  glass(x0 - 10, y0 - 10, 1050, 60 + ROWS.length * rw + 20, { a: eOut(P(lt, 0.4, 1)), accent: DBC });
  const hd = ['hotel_id', 'room_type_id', 'date', 'total_inventory', 'total_reserved'];
  hd.forEach((s, i) => text(s, x0 + 20 + cols[i], y0 + 34, { size: 20, color: DBC, font: MONO, weight: 700, a: eOut(P(lt, 0.6, 1.2)) }));
  ROWS.forEach((r, k) => {
    const t0 = 1.6 + k * 0.4, p = pop(lt, t0, 0.5), y = y0 + 60 + k * rw;
    if (p <= 0) return;
    ctx.save(); ctx.translate(0, (1 - p) * 14);
    r.forEach((v, i) => text(String(v), x0 + 20 + cols[i], y + 40, { size: 28, font: MONO, weight: 700, a: p, color: i === 4 ? UA : INK }));
    ctx.restore();
  });
  const hp = pop(lt, tA + 3.6, 0.6);
  if (hp > 0) {
    ctx.save(); ctx.globalAlpha *= hp; ctx.strokeStyle = SC[3]; ctx.lineWidth = 3; glow(SC[3], 14); rr(x0 - 2, y0 + 60 - 4, 1034, rw - 4, 14); ctx.stroke(); ctx.restore();
    text('一行 = 酒店 × 房型 × 一个日期', x0, y0 + 60 + ROWS.length * rw + 52, { size: 28, weight: 700, color: SC[3], a: hp });
  }
  bullet(0, '订的是房型，房号后分配', pop(lt, tA - 0.5), { y0: 440 });
  bullet(1, '定时任务预生成未来日期', pop(lt, tA + 3.4), { y0: 440 });
  const s = pop(lt, tB, 0.7);
  text('5,000 × 20 × 2 × 365', 110, 600, { size: 30, font: MONO, weight: 700, color: MUTE, a: s });
  text('酒店 × 房型 × 年 × 天', 110, 640, { size: 22, color: DIM, a: s });
  statCard(110, 668, 640, '库存表规模', '7,300 万行', { color: SC[3], a: pop(lt, tB + 1.4, 0.7), note: '单库可容纳' });
}

// ───────── 场景 2：多晚事务 ─────────
function sceneMulti(lt, d, sc) {
  header(lt, '02', '多晚一起扣', SC[1], '同一事务：一起成功，或一起回滚');
  const bx = 990, w = 600, ys = [255, 395, 535];
  const dates = ['06-01', '06-02', '06-03'];
  const tInc = cue(sc, '都能订', -0.6), tP2 = cue(sc, '但如果中间一晚', -0.2), tR = cue(sc, '整笔预订必须一起回滚', 0.5);
  const tS = Math.max(tP2 + 1.8, tR - 2.4);
  const frame = pop(lt, 0.5, 0.7);
  ctx.save(); ctx.globalAlpha *= frame; ctx.setLineDash([10, 8]); ctx.strokeStyle = LOCK + 'aa'; ctx.lineWidth = 2.5; rr(830, 200, 1000, 520, 26); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  text('BEGIN  …  COMMIT / ROLLBACK', 860, 240, { size: 22, color: LOCK, font: MONO, weight: 700, a: frame });
  const base = [80, 82, 86];
  const ph2 = P(lt, tP2, tP2 + 0.9);
  const mid = lerp(82, 110, eIO(ph2));
  const vals = base.map((b, i) => {
    let v = i === 1 ? mid : b;
    if (lt < tP2) { if (lt >= tInc) v += 1; }
    else if (i === 0) { if (lt >= tS + 0.4 && lt < tR) v += 1; }
    return v;
  });
  const failMid = lt >= tS + 0.9;
  vals.forEach((v, i) => {
    const a = pop(lt, 0.9 + i * 0.25, 0.6);
    const flash = (i === 1 && failMid) ? RED : null;
    stockBar(bx, ys[i], w, { label: '', res: v, a, flash, valColor: flash ? RED : null });
    text(dates[i], 870, ys[i] + 68, { size: 28, font: MONO, weight: 700, color: INK, a });
    if (i === 0) text('订 1 间 · 3 晚', 870, ys[i] + 22, { size: 20, color: MUTE, font: MONO, a });
  });
  [0, 1, 2].forEach((i) => {
    const y = ys[i] + 52;
    if (lt >= tInc && lt < tP2) { rise(bx + (base[i] + 1) * w / 120, ys[i] + 40, '+1', tInc, OK, lt); mark(1780, y, true, pop(lt, tInc + 0.6, 0.4) * (1 - P(lt, tP2 - 0.3, tP2)), 0.8); }
    if (lt >= tS && i === 0) { rise(bx + 81 * w / 120, ys[i] + 40, '+1', tS, OK, lt); if (lt < tR) mark(1780, y, true, pop(lt, tS + 0.5, 0.4), 0.8); }
    if (lt >= tS && i === 1) { rise(bx + 110 * w / 120, ys[i] + 40, '+1', tS + 0.4, RED, lt); mark(1780, y, false, pop(lt, tS + 1.0, 0.4), 0.9); }
  });
  const tag = pop(lt, tP2 + 0.8, 0.5);
  if (tag > 0) text('示意：中间一晚已订满', bx, ys[1] + 126, { size: 20, color: UB, font: MONO, a: tag, weight: 700 });
  const s1 = pop(lt, tInc + 1.2, 0.5) * (lt < tP2 ? 1 : 0);
  if (s1 > 0) { glass(860, 760, 420, 70, { a: s1, accent: OK }); text('三晚都 +1 · COMMIT', 890, 806, { size: 28, weight: 800, color: OK, font: MONO, a: s1 }); }
  const s2 = pop(lt, tR, 0.5);
  if (s2 > 0 && lt >= tP2) { glass(860, 760, 520, 70, { a: s2, accent: RED }); text('第 1 晚撤销 · ROLLBACK', 890, 806, { size: 28, weight: 800, color: RED, font: MONO, a: s2 }); }
  bullet(0, '三晚 = 三行，一起改', pop(lt, 1.2), { y0: 440 });
  bullet(1, '任一晚库存不足 → 全撤销', pop(lt, tP2 + 0.5), { y0: 440 });
  bullet(2, '检查、扣库存、写订单同事务', pop(lt, cue(sc, '所以检查')), { y0: 440 });
  statCard(110, 680, 640, '这一笔需要改的行', '3 行', { color: SC[1], a: pop(lt, 2.0, 0.7) });
}

// ───────── 场景 3：并发超卖 ─────────
const CA = { x: 840, y: 505, w: 470, h: 360 }, CB = { x: 1330, y: 505, w: 470, h: 360 };
function sceneRace(lt, d, sc) {
  header(lt, '03', '并发超卖', UA, '先查后改，中间没有保护');
  const tR = cue(sc, '两个事务都读到'), tC = cue(sc, '都判断'), tU = cue(sc, '于是各自加一'), tE = cue(sc, '结果变成');
  const wa = lt >= tU + 1.0, wb = lt >= tU + 1.6;
  const res = 109 + (wa ? 1 : 0) + (wb ? 1 : 0);
  stockBar(860, 215, 640, { label: '某房型某一晚 · total_reserved', res, a: pop(lt, 0.4, 0.7) });
  const ca = pop(lt, 1.0, 0.6);
  txCard(CA.x, CA.y, CA.w, CA.h, '用户 A', UA, [[1.6, '要订最后一间（+1）', MUTE], [tR + 0.8, '① 读：已订 109'], [tC + 0.4, '② 查：109+1 ≤ 110', OK], [tU + 0.4, '③ 写：已订 = 110'], [tU + 1.6, 'COMMIT 成功', OK]], lt, ca);
  txCard(CB.x, CB.y, CB.w, CB.h, '用户 B', UB, [[1.8, '要订最后一间（+1）', MUTE], [tR + 0.9, '① 读：已订 109'], [tC + 0.5, '② 查：109+1 ≤ 110', OK], [tU + 0.5, '③ 写：已订 = 111', RED], [tU + 2.0, 'COMMIT 成功', OK]], lt, ca);
  const pa = P(lt, tR, tR + 0.8), pb = P(lt, tR + 0.1, tR + 0.9);
  packet(1180, 330, CA.x + 235, CA.y, eIO(pa), UA); packet(1180, 330, CB.x + 235, CB.y, eIO(pb), UB);
  const ua = P(lt, tU, tU + 0.9), ub = P(lt, tU + 0.5, tU + 1.4);
  packet(CA.x + 235, CA.y, 1150, 335, eIO(ua), UA); packet(CB.x + 235, CB.y, 1210, 335, eIO(ub), UB);
  const be = pop(lt, tE, 0.6);
  if (be > 0) { glass(1120, 405, 520, 62, { a: be, accent: RED }); text('超卖：111 大于上限 110', 1146, 447, { size: 30, weight: 800, color: RED, a: be }); }
  bullet(0, '两人读到同一个 109', pop(lt, tR + 0.5), { y0: 440 });
  bullet(1, '各自判断「还能订一间」', pop(lt, tC), { y0: 440 });
  bullet(2, '各自加一，互不知情', pop(lt, tU), { y0: 440 });
  statCard(110, 660, 640, '最终已订', '111', { color: RED, a: pop(lt, tE, 0.7), note: '上限 110' });
}

// ───────── 场景 4：悲观锁 ─────────
function scenePess(lt, d, sc) {
  header(lt, '04', '悲观锁', LOCK, '先锁住，再动手');
  const tL = cue(sc, '先到的事务'), tB = cue(sc, '另一个事务只能排队'), tRel = cue(sc, '等到库存变成'), tCost = cue(sc, '代价是');
  const tW = tB + 0.4, tCm = tRel - 0.9;
  const res = lt >= tW + 0.6 ? 110 : 109;
  const locked = lt >= tL + 0.4 && lt < tCm + 0.5;
  stockBar(860, 215, 640, { label: '某房型某一晚 · total_reserved', res, a: pop(lt, 0.4, 0.7) });
  const lk = pop(lt, tL + 0.4, 0.4) * (locked ? 1 : 1 - P(lt, tCm + 0.5, tCm + 0.9));
  lockIcon(1640, 205, LOCK, lk, false);
  if (lk > 0.1) text('行锁', 1660, 290, { size: 22, color: LOCK, font: MONO, weight: 700, a: lk, align: 'center' });
  const ca = pop(lt, 1.0, 0.6);
  txCard(CA.x, CA.y, CA.w, CA.h, '用户 A', UA, [
    [tL + 0.3, 'SELECT … FOR UPDATE'], [tL + 1.3, '拿到行锁 · 读到 109', LOCK], [tW + 0.5, '写：已订 = 110'], [tCm, 'COMMIT · 释放锁', OK]], lt, ca);
  txCard(CB.x, CB.y, CB.w, CB.h, '用户 B', UB, [
    [tL + 0.6, 'SELECT … FOR UPDATE'], [tB + 0.2, '等待行锁 …', UB, tRel], [tRel + 0.2, '拿到锁 · 读到 110', LOCK], [tRel + 1.4, '110+1 > 110', RED], [tRel + 2.4, 'ROLLBACK · 被拒绝', RED]], lt, ca);
  const pa = P(lt, tL + 0.4, tL + 1.2); packet(1100, 330, CA.x + 235, CA.y, eIO(pa), UA);
  const bl = pop(lt, tB, 0.5) * (1 - P(lt, tRel, tRel + 0.4));
  if (bl > 0) { ctx.save(); ctx.globalAlpha *= bl; ctx.strokeStyle = RED; ctx.lineWidth = 5; ctx.lineCap = 'round'; glow(RED, 12); ctx.beginPath(); ctx.moveTo(1500, 392); ctx.lineTo(1630, 392); ctx.stroke(); ctx.restore(); text('B 排队中', 1565, 440, { size: 24, color: UB, align: 'center', weight: 700, a: bl }); }
  bullet(0, 'A 持锁到提交，B 排队', pop(lt, tB), { y0: 440 });
  bullet(1, 'B 再读时已是 110', pop(lt, tRel), { y0: 440 });
  const cs = pop(lt, tCost, 0.6);
  text('代价', 110, 640, { size: 24, color: MUTE, weight: 700, a: cs });
  badge(110, 664, '锁多行可能死锁', RED, cs); badge(110, 730, '长事务让后来者久等', UB, pop(lt, tCost + 1.2, 0.6));
}

// ───────── 场景 5：乐观锁 ─────────
function sceneOpt(lt, d, sc) {
  header(lt, '05', '乐观锁', OK, '不先锁，提交时核对版本号');
  const tR = cue(sc, '大家先读'), tV = cue(sc, '每行带一个版本号'), tU = cue(sc, '提交时'), tA = cue(sc, '第一个人成功'), tB = cue(sc, '第二个人条件不成立'), tE = cue(sc, '冲突少时');
  const done = lt >= tA + 0.8;
  stockBar(860, 215, 640, { label: '某房型某一晚 · total_reserved', res: done ? 110 : 109, ver: done ? 8 : 7, a: pop(lt, 0.4, 0.7) });
  text('版本号为示意', 1360, 340, { size: 20, color: DIM, a: pop(lt, tV, 0.5) });
  const ca = pop(lt, 1.0, 0.6);
  const cy = CA.y - 20, ch = 400;
  txCard(CA.x, cy, CA.w, ch, '用户 A', UA, [
    [tR + 0.6, '读：已订 109 · v7'], [tU + 0.3, 'UPDATE 已订=110, v=8'], [tU + 0.9, 'WHERE version = 7'], [tA + 0.8, '影响行数 1 · 提交', OK]], lt, ca, 56);
  txCard(CB.x, cy, CB.w, ch, '用户 B', UB, [
    [tR + 0.7, '读：已订 109 · v7'], [tU + 0.4, 'UPDATE 已订=110, v=8'], [tU + 1.0, 'WHERE version = 7'], [tB + 0.6, '影响行数 0 ✗', RED], [tB + 1.8, 'ROLLBACK · 重读', RED]], lt, ca, 56);
  const pa = P(lt, tR, tR + 0.8), pb = P(lt, tR + 0.1, tR + 0.9);
  packet(1180, 330, CA.x + 235, cy, eIO(pa), UA); packet(1180, 330, CB.x + 235, cy, eIO(pb), UB);
  const ua = P(lt, tA - 0.2, tA + 0.7); packet(CA.x + 235, cy, 1180, 335, eIO(ua), UA);
  const ub = P(lt, tB - 0.2, tB + 0.6); packet(CB.x + 235, cy, 1280, 335, eIO(ub), UB);
  const x = pop(lt, tB + 0.9, 0.4); if (x > 0) mark(1280, 395, false, x, 0.9);
  if (done) mark(1100, 395, true, pop(lt, tA + 0.8, 0.4), 0.9);
  bullet(0, '读不加锁，互不阻塞', pop(lt, tR + 0.5), { y0: 440 });
  bullet(1, '条件：版本仍是读到的', pop(lt, tU), { y0: 440 });
  bullet(2, '影响 0 行 = 被抢先了', pop(lt, tB), { y0: 440 });
  const cs = pop(lt, tE, 0.6);
  badge(110, 680, '冲突少：很划算', OK, cs); badge(110, 746, '高争用：大量重试', RED, pop(lt, tE + 1.4, 0.6));
  statCard(110, 818, 640, '本题预订写入', '约 3 TPS', { color: OK, a: pop(lt, cue(sc, '本题预订'), 0.7), h: 100 });
}

// ───────── 场景 6：数据库约束 ─────────
function sceneConstr(lt, d, sc) {
  header(lt, '06', '数据库约束', SC[3], '把规则交给数据库');
  const tChk = cue(sc, '总库存减去'), tA = cue(sc, '必须大于等于零', 0.3), tB = cue(sc, '任何会越界'), tH = cue(sc, '简单，低争用'), tN = cue(sc, '注意，允许');
  const ph = P(lt, tN, tN + 0.8);
  const resA = lt >= tA + 0.9 ? 100 : 99;
  stockBar(860, 215, 640, { label: ph > 0.5 ? '某房型某一晚 · 物理 100 间' : '某房型某一晚 · total_reserved', res: resA, showCap: ph > 0.5, a: pop(lt, 0.4, 0.7), cap: 110 });
  const c1 = pop(lt, tChk, 0.6);
  glass(840, 395, 960, 100, { a: c1, accent: SC[3] });
  const s1 = 1 - ph, s2 = ph;
  text('CHECK ( total_inventory − total_reserved ≥ 0 )', 870, 456, { size: 28, font: MONO, weight: 700, color: SC[3], a: c1 * s1 });
  text('CHECK ( total_reserved ≤ sellable_limit )', 870, 448, { size: 28, font: MONO, weight: 700, color: SC[3], a: c1 * s2 });
  if (ph > 0) text('sellable_limit = 100 + 10 = 110（整数运算）', 870, 482, { size: 20, font: MONO, color: MUTE, a: s2 });
  const chipA = { x: 840, y: 560 }, chipB = { x: 1330, y: 560 };
  const a1 = pop(lt, tA - 0.5, 0.5) * s1, b1 = pop(lt, tB - 0.2, 0.5) * s1;
  glass(chipA.x, chipA.y, 400, 76, { a: a1, accent: UA }); text('用户 A  UPDATE +1', chipA.x + 24, chipA.y + 48, { size: 26, font: MONO, weight: 700, color: UA, a: a1 });
  glass(chipB.x, chipB.y, 400, 76, { a: b1, accent: UB }); text('用户 B  UPDATE +1', chipB.x + 24, chipB.y + 48, { size: 26, font: MONO, weight: 700, color: UB, a: b1 });
  const pk = (p, x1, y1, x2, y2, c) => { if (s1 > 0.5) packet(x1, y1, x2, y2, p, c); };
  pk(eIO(P(lt, tA, tA + 0.8)), 1040, 560, 1040, 330, UA);
  pk(eIO(P(lt, tB, tB + 0.8)), 1530, 560, 1200, 330, UB);
  const ra = pop(lt, tA + 0.9, 0.5) * s1, rb = pop(lt, tB + 0.9, 0.5) * s1;
  text('99 → 100 ≥ 0 · 通过', 850, 690, { size: 26, font: MONO, weight: 700, color: OK, a: ra });
  text('100 − 101 < 0 · 拒绝', 1340, 690, { size: 26, font: MONO, weight: 700, color: RED, a: rb });
  mark(1290, 650, true, ra, 0.7); mark(1790, 650, false, rb, 0.7);
  bullet(0, '简单，由数据库兜底', pop(lt, tH, 0.6), { y0: 440 });
  bullet(1, '低争用时效果好', pop(lt, tH + 1.0), { y0: 440 });
  bullet(2, '高争用仍会大量失败', pop(lt, tH + 2.0), { y0: 440 });
  [['100 间', '可售 110'], ['15 间', '可售 16'], ['9 间', '可售 9']].forEach(([n, v], k) => {
    const a = pop(lt, tN + 1.4 + k * 0.7, 0.5), x = 840 + k * 320;
    glass(x, 580, 290, 130, { a, accent: UB });
    text(n, x + 24, 630, { size: 26, color: MUTE, font: MONO, weight: 700, a });
    text(v, x + 24, 682, { size: 38, weight: 800, color: UB, font: MONO, a });
  });
  text('上限 = N + floor(N / 10)，整数运算', 840, 770, { size: 24, color: MUTE, a: pop(lt, tN + 3.4, 0.6) });
  const nn = pop(lt, tN, 0.7);
  if (nn > 0) { glass(110, 660, 640, 150, { a: nn, accent: UB }); text('允许超售 10%', 140, 710, { size: 26, color: MUTE, a: nn }); text('限制可售上限 110', 140, 764, { size: 38, weight: 800, color: UB, a: nn }); text('而不是物理房间数', 140, 800, { size: 22, color: MUTE, a: nn }); }
}

// ───────── 场景 7：幂等 ─────────
function sceneIdem(lt, d, sc) {
  header(lt, '07', '幂等预订', UA, '同一订单，只算一次');
  const tId = cue(sc, '填写订单时'), tSub = cue(sc, '每次提交都带着它'), tUq = cue(sc, '数据库对编号'), t2 = cue(sc, '第二次提交'), tRet = cue(sc, '返回已有订单'), tCmp = cue(sc, '幂等管同一件事');
  const tNo = cue(sc, '靠前端禁用');
  const e0 = pop(lt, 0.8, 0.5) * (1 - P(lt, tId - 0.5, tId));
  if (e0 > 0) {
    const dis = lt >= tNo + 0.3;
    glass(840, 330, 300, 90, { a: e0, accent: dis ? DIM : UA });
    text(dis ? '提交预订（已禁用）' : '提交预订', 990, 388, { size: 28, weight: 800, align: 'center', color: dis ? DIM : UA, a: e0 });
    [1.6, 2.6].forEach((t, k) => { const p = P(lt, t, t + 0.7); if (p > 0 && p < 1) { ctx.save(); ctx.globalAlpha = (1 - p) * e0; ctx.strokeStyle = UA; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(1090 + k * 14, 375, 10 + p * 40, 0, 7); ctx.stroke(); ctx.restore(); } });
    text('同一个用户点了两次', 840, 470, { size: 26, color: MUTE, a: e0 * pop(lt, 2.4, 0.5) });
    ['脚本被关闭', '请求自动重试', '直接调 API'].forEach((s2, k) => badge(1220, 320 + k * 70, s2, RED, e0 * pop(lt, tNo + 0.8 + k * 0.5, 0.5)));
    text('都能绕过前端', 1220, 550, { size: 24, color: RED, weight: 700, a: e0 * pop(lt, tNo + 2.4, 0.5) });
  }
  const idp = pop(lt, tId, 0.6);
  glass(840, 200, 560, 70, { a: idp, accent: UA });
  text('reservation_id = 13422445', 868, 247, { size: 28, weight: 800, font: MONO, color: UA, a: idp });
  text('填写订单时生成', 1420, 247, { size: 22, color: MUTE, a: idp });
  const LY = [305, 485], lanes = ['第 1 次提交', '第 2 次提交（重试）'];
  const tl = [tSub + 0.2, t2 - 0.4];
  lanes.forEach((nm, i) => {
    const y = LY[i], a = pop(lt, i === 0 ? tId + 0.6 : t2 - 1.2, 0.5);
    glass(820, y, 570, 160, { a, accent: i ? UB : UA });
    text(nm, 846, y + 40, { size: 26, weight: 700, color: i ? UB : UA, a });
    text('POST id=13422445', 846, y + 82, { size: 24, font: MONO, weight: 700, a });
    arrow(1150, y + 76, 1412, y + 76, { color: i ? UB : UA, p: eOut(P(lt, tl[i], tl[i] + 0.5)), a });
    packet(1150, y + 76, 1412, y + 76, eIO(P(lt, tl[i] + 0.2, tl[i] + 1.1)), i ? UB : UA, { r: 10 });
  });
  const tb = pop(lt, tId + 0.4, 0.6);
  glass(1420, 305, 410, 340, { a: tb, accent: DBC });
  text('reservation 表', 1448, 352, { size: 28, weight: 800, color: DBC, a: tb });
  text('UNIQUE (reservation_id)', 1448, 388, { size: 20, font: MONO, weight: 700, color: SC[3], a: pop(lt, tUq, 0.5) });
  const rowp = pop(lt, tl[0] + 1.1, 0.5);
  if (rowp > 0) {
    glass(1440, 420, 370, 70, { a: rowp, accent: OK, r: 14 });
    text('13422445 · 已确认', 1462, 465, { size: 24, font: MONO, weight: 700, a: rowp });
    text('同事务：库存 +1', 1448, 530, { size: 22, color: MUTE, a: rowp });
  }
  const hit = P(lt, tl[1] + 0.9, tl[1] + 1.6);
  if (hit > 0 && hit < 1) { ctx.save(); ctx.globalAlpha = Math.sin(hit * Math.PI); ctx.strokeStyle = RED; ctx.lineWidth = 4; glow(RED, 16); rr(1436, 416, 378, 78, 16); ctx.stroke(); ctx.restore(); }
  text('唯一约束冲突 ✗', 1448, 580, { size: 24, font: MONO, weight: 700, color: RED, a: pop(lt, tl[1] + 1.0, 0.5) });
  text('成功：创建订单，扣 1 间', 846, LY[0] + 130, { size: 24, color: OK, weight: 700, a: pop(lt, tl[0] + 1.2, 0.5) });
  text('返回已有订单，不再扣房', 846, LY[1] + 130, { size: 24, color: OK, weight: 700, a: pop(lt, tRet - 0.2, 0.5) });
  const cp = pop(lt, tCmp, 0.6), cp2 = pop(lt, tCmp + 1.2, 0.6);
  glass(840, 700, 470, 150, { a: cp, accent: UA }); text('幂等键', 868, 750, { size: 32, weight: 800, color: UA, a: cp }); text('同一件事做几次', 868, 800, { size: 26, color: INK, a: cp });
  glass(1340, 700, 470, 150, { a: cp2, accent: DBC });
  text('库存控制', 1368, 750, { size: 32, weight: 800, color: DBC, a: cp2 }); text('不同的人能买几份', 1368, 800, { size: 26, color: INK, a: cp2 });
  bullet(0, '前端禁用按钮不可靠', pop(lt, 0.8), { y0: 440 });
  bullet(1, '同一个 ID → 同一个结果', pop(lt, tSub), { y0: 440 });
  bullet(2, '唯一约束挡住第二张订单', pop(lt, tUq), { y0: 440 });
}

// ───────── 场景 8：分片 ─────────
function sceneShard(lt, d, sc) {
  header(lt, '08', '数据库分片', SC[0], '查询都带 hotel_id');
  const tH = cue(sc, '按酒店编号'), tQ = cue(sc, '每秒三万次'), tE = cue(sc, '单个');
  node(830, 360, 210, 150, '预订服务', 'QPS ×1000', SC[1], { a: pop(lt, 0.5, 0.6) });
  const rt = pop(lt, tH, 0.6);
  node(1090, 360, 270, 150, '路由', 'hash(hotel_id)%16', SC[3], { a: rt });
  arrow(1042, 435, 1088, 435, { color: MUTE, a: rt });
  const gx = 1420, gy = 215, cw = 100, ch = 130, gp = 14;
  for (let k = 0; k < 16; k++) {
    const c = k % 4, r = Math.floor(k / 4), x = gx + c * (cw + gp), y = gy + r * (ch + gp), a = pop(lt, 0.8 + k * 0.05, 0.5);
    glass(x, y, cw, ch, { a, r: 16, accent: lt > tH + 0.8 ? DBC : null });
    text(`分片 ${k}`, x + cw / 2, y + 42, { size: 20, color: MUTE, align: 'center', font: MONO, a, weight: 700 });
    const q = P(lt, tQ, tQ + 1.2);
    text(q > 0 ? Math.round(1875 * eOut(q)).toLocaleString('en-US') : '—', x + cw / 2, y + 98, { size: 26, color: DBC, align: 'center', font: MONO, weight: 800, a });
  }
  for (let k = 0; k < 44; k++) {
    const t0 = tH + 0.8 + k * 0.2, s = Math.floor(rnd(k * 3 + 1) * 16), c = s % 4, r = Math.floor(s / 4);
    packet(1360, 435, gx + c * (cw + gp) + cw / 2, gy + r * (ch + gp) + ch / 2, eIO(P(lt, t0, t0 + 0.7)), SC[3], { r: 6 });
  }
  bullet(0, '按 hash(hotel_id) 选分片', pop(lt, tH + 0.5), { y0: 440 });
  bullet(1, '同一家酒店永远在同一片', pop(lt, tH + 1.5), { y0: 440 });
  statCard(110, 600, 640, '30,000 QPS ÷ 16 片', '1,875 QPS / 片', { color: SC[0], a: pop(lt, tQ, 0.7) });
  text('热门酒店仍可能集中一片，需实测', 110, 760, { size: 22, color: DIM, a: pop(lt, tE + 1, 0.6) });
}

// ───────── 场景 9：缓存 ─────────
function sceneCache(lt, d, sc) {
  header(lt, '09', '缓存与一致', SC[1], '展示用缓存，成交看数据库');
  const tR = cue(sc, '也可以用 Redis'), tCdc = cue(sc, '数据库的变化'), tSee = cue(sc, '用户看到有房'), tSub = cue(sc, '提交时'), tRej = cue(sc, '这时由数据库'), tEnd = cue(sc, '缓存只负责');
  const cdcEnd = tEnd + 0.2;
  const dbv = lt >= tCdc + 0.6 ? 0 : 1, cv = lt >= cdcEnd ? 0 : 1;
  const rejected = lt >= tRej;
  node(1000, 215, 340, 200, 'Redis 缓存', 'hotelID_roomTypeID_{date}', LOCK, { a: pop(lt, tR, 0.6), big: `剩 ${cv}`, bigColor: cv ? INK : RED });
  node(1460, 560, 340, 190, '数据库', '权威库存', DBC, { a: pop(lt, tR + 0.5, 0.6), big: `剩 ${dbv}`, bigColor: dbv ? INK : RED, hot: rejected && lt < tRej + 2.5 });
  node(840, 560, 300, 190, '用户 A', '正在浏览', UA, { a: pop(lt, tR + 0.9, 0.6) });
  const rd = P(lt, tSee, tSee + 0.9);
  arrow(990, 540, 1090, 418, { color: LOCK, a: pop(lt, tR + 1.2, 0.5), dash: [8, 8] });
  packet(1090, 418, 990, 540, eIO(rd), LOCK, { r: 8 });
  text('读展示库存', 850, 470, { size: 22, color: LOCK, a: pop(lt, tR + 1.2, 0.5), weight: 700 });
  const see = pop(lt, tSee + 0.9, 0.5);
  if (see > 0) text('看到：有房', 840, 790, { size: 28, weight: 800, color: OK, a: see });
  const cd = pop(lt, tCdc, 0.5);
  arrow(1560, 560, 1300, 420, { color: UB, a: cd, dash: [8, 8] });
  text('CDC 异步 · 有延迟', 1430, 480, { size: 22, color: UB, weight: 700, a: cd });
  packet(1560, 560, 1300, 420, P(lt, tCdc + 0.6, cdcEnd), UB, { r: 9, trail: 0.2 });
  const bb = pop(lt, tCdc, 0.6);
  if (bb > 0) badge(1440, 790, '用户 B 订走最后一间', UB, bb);
  arrow(1145, 655, 1455, 655, { color: UA, a: pop(lt, tSub, 0.4) });
  packet(1145, 655, 1455, 655, eIO(P(lt, tSub, tSub + 0.8)), UA, { r: 10 });
  text('提交预订', 1300, 635, { size: 22, color: UA, align: 'center', weight: 700, a: pop(lt, tSub, 0.4) });
  const rj = pop(lt, tRej, 0.5);
  if (rj > 0) { text('已售罄 · 拒绝', 1300, 705, { size: 26, color: RED, align: 'center', weight: 800, a: rj }); mark(1300, 750, false, rj, 0.8); }
  const fin = pop(lt, tEnd + 0.8, 0.6);
  if (fin > 0) { glass(110, 660, 640, 120, { a: fin, accent: SC[1] }); text('展示库存 ≠ 成交依据', 140, 715, { size: 34, weight: 800, color: SC[1], a: fin }); text('最终以数据库检查为准', 140, 758, { size: 24, color: MUTE, a: fin }); }
  bullet(0, '缓存：快，但会落后', pop(lt, tR + 0.6), { y0: 440 });
  bullet(1, '数据库：最终裁判', pop(lt, tRej), { y0: 440 });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('酒店预订系统', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Hotel Reservation System', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['库存行', '酒店 × 房型 × 日期，一天一行', SC[0]], ['并发控制', '悲观锁 · 乐观锁 · 数据库约束', SC[1]], ['幂等键', '预订编号 + 唯一约束，防重复提交', SC[2]]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.5, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 70, weight: 800 });
    text(s, x + 36, 620, { size: 22, color: MUTE });
    ctx.restore();
  });
  text('缓存只负责展示，能不能订，数据库说了算', 110, 760, { size: 30, weight: 700, color: SC[3], a: eOut(P(lt, 6.0, 6.8)) });
  text('多晚库存与订单放同一事务；支付超时要查证，不要拿着库存锁等付款', 110, 820, { size: 22, color: MUTE, a: eOut(P(lt, 7.0, 7.8)) });
}

export const scenes = { title: sceneTitle, model: sceneModel, multi: sceneMulti, race: sceneRace, pess: scenePess, opt: sceneOpt, constr: sceneConstr, idem: sceneIdem, shard: sceneShard, cache: sceneCache, end: sceneEnd };
