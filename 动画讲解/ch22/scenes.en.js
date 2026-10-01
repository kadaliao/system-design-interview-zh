// Chapter 22 Hotel Reservation System (English): scene definitions
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, arrow, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 22, title: 'Hotel Reservation System', en: 'Hotel Reservation System' };

const DBC = SC[0], UA = SC[2], UB = SC[3], LOCK = SC[1], OK = SC[4];
const pop = (lt, t0, d = 0.6) => eOut(P(lt, t0, t0 + d));
// Narration cue times: sentence-level timings from edge-tts subtitles (build/en/cues.json), interpolated by character position within the sentence
const CUES = {"title": [[0.1, 3.71, "Chapter 22, the hotel reservation system."], [3.66, 6.29, "Let's see how it works in about four minutes."]], "model": [[0.1, 3.58, "Guests book a room type, not a specific room."], [3.53, 11.46, "So inventory is stored by hotel, room type, and date: one row per day, with a total and a reserved count."], [11.46, 18.72, "Five thousand hotels, twenty room types each, two years ahead: seventy-three million rows."], [18.72, 20.82, "One database can hold that."]], "multi": [[0.1, 3.5, "A three-night stay changes three rows at once."], [3.45, 12.94, "In the book's example, the reserved counts are eighty, eighty-two, and eighty-six, against a limit of one hundred and ten, so it fits."], [12.94, 17.68, "But if the middle night were already full, the whole booking must roll back."], [17.68, 21.99, "So check, deduct, and write the order in one transaction."]], "race": [[0.1, 1.91, "Now, peak season."], [1.86, 4.84, "Two users grab the last room of one room type."], [4.84, 9.89, "The limit is one hundred and ten, and one hundred and nine are reserved."], [9.89, 13.01, "Both transactions read one hundred and nine."], [13.01, 16.09, "Both decide there's room, and both add one."], [16.09, 19.88, "The result is one hundred and eleven, over the limit."], [19.88, 23.08, "Nothing protected the gap between check and update."]], "pess": [[0.1, 3.02, "Option one: pessimistic locking."], [2.97, 8.3, "The first transaction runs SELECT FOR UPDATE and holds the row until it commits."], [8.3, 10.14, "The other one has to wait."], [10.14, 17.37, "When it finally reads, the count is one hundred and ten, so adding one breaks the limit, and it's rejected."], [17.37, 23.57, "The cost: locking many rows can deadlock, and long transactions make everyone else wait."]], "opt": [[0.1, 3.04, "Option two: optimistic locking."], [2.99, 7.68, "Everyone reads without a lock, and each row carries a version number."], [7.68, 12.91, "On commit, the update says: only if the version is still the one I read."], [12.91, 16.78, "The first user succeeds, and the version goes up by one."], [16.78, 21.44, "The second affects zero rows, rolls back, and reads again."], [21.44, 23.73, "It's cheap when conflicts are rare."], [23.73, 28.92, "This system sees only about three bookings per second, so the book picks this one."]], "constr": [[0.1, 3.23, "Option three: a database constraint."], [3.17, 10.08, "Let the database enforce the rule: total inventory minus reserved must stay at or above zero."], [10.08, 13.16, "Any update that crosses the line is rejected."], [13.16, 19.98, "It's simple, and works well under low contention, but under high contention many updates still fail."], [19.98, 26.42, "And if you allow ten percent overbooking, constrain the sellable limit, not the physical room count."]], "idem": [[0.1, 3.82, "Now a different problem: the same user clicks twice."], [3.77, 7.9, "Disabling the button isn't reliable, so we need idempotency."], [7.9, 15.65, "When the order form is filled in, generate a globally unique reservation ID, and send it with every submit."], [15.65, 23.64, "A unique constraint on that ID blocks the second submit, and the existing order is returned, with no second deduction."], [23.64, 27.35, "Idempotency controls how many times one action runs."], [27.35, 31.14, "Inventory control limits how many different people can buy."]], "shard": [[0.1, 5.49, "Now scale traffic up a thousand times, and the database becomes the bottleneck."], [5.44, 10.74, "Luckily, every query carries the hotel ID, so we can shard by a hash of it."], [10.74, 21.6, "In the book's example, thirty thousand requests per second over sixteen shards is about eighteen hundred and seventy-five per shard, which a MySQL cluster can handle."]], "cache": [[0.1, 6.22, "You can also cache the remaining inventory in Redis, keyed by hotel, room type, and date."], [6.17, 12.08, "Database changes reach the cache asynchronously through CDC, so the cache can lag."], [12.08, 17.93, "A user sees a room available, but at submit it's sold out, and the database rejects it."], [17.93, 20.17, "The cache only displays."], [20.17, 22.13, "The database decides."]], "end": [[0.1, 6.4, "Remember three words: inventory row, concurrency control, and idempotency key."], [6.35, 13.03, "One row per day, three ways to protect the limit, and a reservation ID to stop duplicates."]]};
const cue = (sc, s, off = 0) => {
  const L = CUES[sc.id] || [], i = sc.text.indexOf(s); if (i < 0) throw new Error(`cue not found: ${s}`);
  let pos = 0;
  for (const [a, e, t] of L) { if (i < pos + t.length + 1) return sc.lead + a + (e - a) * clamp((i - pos) / t.length, 0, 1) * 0.9 + off; pos += t.length + 1; }
  return sc.lead + sc.voiceDur + off;
};
/** English titles are wider: shrink to fit the 640px left column */
function header(lt, num, title, accent, sub) {
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  let size = 70; ctx.font = `800 ${size}px ${SANS}`; const w0 = ctx.measureText(title).width; if (w0 > 630) size = Math.floor(70 * 630 / w0);
  text(title, 108, 262, { size, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: 26, color: MUTE });
  ctx.restore();
}

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
    text(`physical ${total}`, tx, by + h + 30, { size: 20, color: MUTE, align: 'center', font: MONO });
  }
  if (showCap) {
    const cx = x + cap * sc;
    ctx.strokeStyle = UB; ctx.lineWidth = 3; glow(UB, 8); ctx.beginPath(); ctx.moveTo(cx, by - 12); ctx.lineTo(cx, by + h + 12); ctx.stroke(); ctx.shadowBlur = 0;
    text(`limit ${cap}`, cx, by - 20, { size: 20, color: UB, align: 'center', font: MONO, weight: 700 });
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
  text('hotel × room type × date = one inventory row', ox, 215, { size: 26, color: MUTE, a: eOut(P(lt, 1.2, 2)) });
  const a = eOut(P(lt, 0.2, 1.2));
  text('System Design Interview · Animated', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 900, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4)); ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 120px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('Hotel', 104, 490); ctx.fillText('Reservation', 104, 620); ctx.fillText('System', 104, 750); ctx.restore();
  text('Chapter 22', 112, 830, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 1：库存模型 ─────────
const ROWS = [
  [211, 1001, '2021-06-01', 100, 80], [211, 1001, '2021-06-02', 100, 82], [211, 1001, '2021-06-03', 100, 86],
  [211, 1001, '…', '…', '…'], [211, 1002, '2021-06-01', 200, 16], [2210, 101, '2021-06-01', 30, 23], [2210, 101, '2021-06-02', 30, 25],
];
function sceneModel(lt, d, sc) {
  header(lt, '01', 'Inventory Model', SC[0], 'One row per day, not per room');
  const x0 = 820, y0 = 215, cols = [0, 130, 290, 520, 730], rw = 70;
  const tA = cue(sc, 'So inventory'), tB = cue(sc, 'Five thousand hotels');
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
    text('one row = hotel × room type × one date', x0, y0 + 60 + ROWS.length * rw + 52, { size: 28, weight: 700, color: SC[3], a: hp });
  }
  bullet(0, 'Book a room type; room number later', pop(lt, tA - 0.5), { y0: 440 });
  bullet(1, 'A job pre-generates future dates', pop(lt, tA + 3.4), { y0: 440 });
  const s = pop(lt, tB, 0.7);
  text('5,000 × 20 × 2 × 365', 110, 600, { size: 30, font: MONO, weight: 700, color: MUTE, a: s });
  text('hotels × types × years × days', 110, 640, { size: 22, color: DIM, a: s });
  statCard(110, 668, 640, 'Inventory table size', '73M rows', { color: SC[3], a: pop(lt, tB + 1.4, 0.7), note: 'fits in one database' });
}

// ───────── 场景 2：多晚事务 ─────────
function sceneMulti(lt, d, sc) {
  header(lt, '02', 'Multi-Night Booking', SC[1], 'One transaction: all or nothing');
  const bx = 990, w = 600, ys = [255, 395, 535];
  const dates = ['06-01', '06-02', '06-03'];
  const tInc = cue(sc, 'so it fits', -0.6), tP2 = cue(sc, 'But if the middle', -0.2), tR = cue(sc, 'the whole booking must roll back', 0.5);
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
    if (i === 0) text('1 room · 3 nights', 870, ys[i] + 22, { size: 20, color: MUTE, font: MONO, a });
  });
  [0, 1, 2].forEach((i) => {
    const y = ys[i] + 52;
    if (lt >= tInc && lt < tP2) { rise(bx + (base[i] + 1) * w / 120, ys[i] + 40, '+1', tInc, OK, lt); mark(1780, y, true, pop(lt, tInc + 0.6, 0.4) * (1 - P(lt, tP2 - 0.3, tP2)), 0.8); }
    if (lt >= tS && i === 0) { rise(bx + 81 * w / 120, ys[i] + 40, '+1', tS, OK, lt); if (lt < tR) mark(1780, y, true, pop(lt, tS + 0.5, 0.4), 0.8); }
    if (lt >= tS && i === 1) { rise(bx + 110 * w / 120, ys[i] + 40, '+1', tS + 0.4, RED, lt); mark(1780, y, false, pop(lt, tS + 1.0, 0.4), 0.9); }
  });
  const tag = pop(lt, tP2 + 0.8, 0.5);
  if (tag > 0) text('Illustrative: middle night is full', bx, ys[1] + 126, { size: 20, color: UB, font: MONO, a: tag, weight: 700 });
  const s1 = pop(lt, tInc + 1.2, 0.5) * (lt < tP2 ? 1 : 0);
  if (s1 > 0) { glass(860, 760, 420, 70, { a: s1, accent: OK }); text('All 3 nights +1 · COMMIT', 890, 806, { size: 28, weight: 800, color: OK, font: MONO, a: s1 }); }
  const s2 = pop(lt, tR, 0.5);
  if (s2 > 0 && lt >= tP2) { glass(860, 760, 520, 70, { a: s2, accent: RED }); text('Night 1 undone · ROLLBACK', 890, 806, { size: 28, weight: 800, color: RED, font: MONO, a: s2 }); }
  bullet(0, '3 nights = 3 rows, changed together', pop(lt, 1.2), { y0: 440 });
  bullet(1, 'Any night full: undo all', pop(lt, tP2 + 0.5), { y0: 440 });
  bullet(2, 'Check, deduct, write: one transaction', pop(lt, cue(sc, 'So check')), { y0: 440 });
  statCard(110, 680, 640, 'Rows this booking changes', '3 rows', { color: SC[1], a: pop(lt, 2.0, 0.7) });
}

// ───────── 场景 3：并发超卖 ─────────
const CA = { x: 840, y: 505, w: 470, h: 360 }, CB = { x: 1330, y: 505, w: 470, h: 360 };
function sceneRace(lt, d, sc) {
  header(lt, '03', 'Overbooking Race', UA, 'Check, then update: no protection');
  const tR = cue(sc, 'Both transactions read'), tC = cue(sc, 'Both decide'), tU = cue(sc, 'and both add one'), tE = cue(sc, 'The result is');
  const wa = lt >= tU + 1.0, wb = lt >= tU + 1.6;
  const res = 109 + (wa ? 1 : 0) + (wb ? 1 : 0);
  stockBar(860, 215, 640, { label: 'One night · total_reserved', res, a: pop(lt, 0.4, 0.7) });
  const ca = pop(lt, 1.0, 0.6);
  txCard(CA.x, CA.y, CA.w, CA.h, 'User A', UA, [[1.6, 'Wants the last room (+1)', MUTE], [tR + 0.8, '1. Read: reserved 109'], [tC + 0.4, '2. Check: 109+1 ≤ 110', OK], [tU + 0.4, '3. Write: reserved = 110'], [tU + 1.6, 'COMMIT ok', OK]], lt, ca);
  txCard(CB.x, CB.y, CB.w, CB.h, 'User B', UB, [[1.8, 'Wants the last room (+1)', MUTE], [tR + 0.9, '1. Read: reserved 109'], [tC + 0.5, '2. Check: 109+1 ≤ 110', OK], [tU + 0.5, '3. Write: reserved = 111', RED], [tU + 2.0, 'COMMIT ok', OK]], lt, ca);
  const pa = P(lt, tR, tR + 0.8), pb = P(lt, tR + 0.1, tR + 0.9);
  packet(1180, 330, CA.x + 235, CA.y, eIO(pa), UA); packet(1180, 330, CB.x + 235, CB.y, eIO(pb), UB);
  const ua = P(lt, tU, tU + 0.9), ub = P(lt, tU + 0.5, tU + 1.4);
  packet(CA.x + 235, CA.y, 1150, 335, eIO(ua), UA); packet(CB.x + 235, CB.y, 1210, 335, eIO(ub), UB);
  const be = pop(lt, tE, 0.6);
  if (be > 0) { glass(1120, 405, 520, 62, { a: be, accent: RED }); text('Overbooked: 111 > limit 110', 1146, 447, { size: 30, weight: 800, color: RED, a: be }); }
  bullet(0, 'Both read the same 109', pop(lt, tR + 0.5), { y0: 440 });
  bullet(1, 'Each decides: room left', pop(lt, tC), { y0: 440 });
  bullet(2, 'Each adds one, unaware', pop(lt, tU), { y0: 440 });
  statCard(110, 660, 640, 'Final reserved', '111', { color: RED, a: pop(lt, tE, 0.7), note: 'limit 110' });
}

// ───────── 场景 4：悲观锁 ─────────
function scenePess(lt, d, sc) {
  header(lt, '04', 'Pessimistic Locking', LOCK, 'Lock first, then act');
  const tL = cue(sc, 'The first transaction'), tB = cue(sc, 'The other one has to wait'), tRel = cue(sc, 'When it finally reads'), tCost = cue(sc, 'The cost');
  const tW = tB + 0.4, tCm = tRel - 0.9;
  const res = lt >= tW + 0.6 ? 110 : 109;
  const locked = lt >= tL + 0.4 && lt < tCm + 0.5;
  stockBar(860, 215, 640, { label: 'One night · total_reserved', res, a: pop(lt, 0.4, 0.7) });
  const lk = pop(lt, tL + 0.4, 0.4) * (locked ? 1 : 1 - P(lt, tCm + 0.5, tCm + 0.9));
  lockIcon(1640, 205, LOCK, lk, false);
  if (lk > 0.1) text('row lock', 1660, 290, { size: 22, color: LOCK, font: MONO, weight: 700, a: lk, align: 'center' });
  const ca = pop(lt, 1.0, 0.6);
  txCard(CA.x, CA.y, CA.w, CA.h, 'User A', UA, [
    [tL + 0.3, 'SELECT … FOR UPDATE'], [tL + 1.3, 'Got lock · read 109', LOCK], [tW + 0.5, 'Write: reserved = 110'], [tCm, 'COMMIT · release', OK]], lt, ca);
  txCard(CB.x, CB.y, CB.w, CB.h, 'User B', UB, [
    [tL + 0.6, 'SELECT … FOR UPDATE'], [tB + 0.2, 'Waiting for lock …', UB, tRel], [tRel + 0.2, 'Got lock · read 110', LOCK], [tRel + 1.4, '110+1 > 110', RED], [tRel + 2.4, 'ROLLBACK · rejected', RED]], lt, ca);
  const pa = P(lt, tL + 0.4, tL + 1.2); packet(1100, 330, CA.x + 235, CA.y, eIO(pa), UA);
  const bl = pop(lt, tB, 0.5) * (1 - P(lt, tRel, tRel + 0.4));
  if (bl > 0) { ctx.save(); ctx.globalAlpha *= bl; ctx.strokeStyle = RED; ctx.lineWidth = 5; ctx.lineCap = 'round'; glow(RED, 12); ctx.beginPath(); ctx.moveTo(1500, 392); ctx.lineTo(1630, 392); ctx.stroke(); ctx.restore(); text('B is waiting', 1565, 440, { size: 24, color: UB, align: 'center', weight: 700, a: bl }); }
  bullet(0, 'A holds lock; B waits', pop(lt, tB), { y0: 440 });
  bullet(1, 'B re-reads: already 110', pop(lt, tRel), { y0: 440 });
  const cs = pop(lt, tCost, 0.6);
  text('Costs', 110, 640, { size: 24, color: MUTE, weight: 700, a: cs });
  badge(110, 664, 'Many rows: deadlock risk', RED, cs); badge(110, 730, 'Long transactions block others', UB, pop(lt, tCost + 1.2, 0.6));
}

// ───────── 场景 5：乐观锁 ─────────
function sceneOpt(lt, d, sc) {
  header(lt, '05', 'Optimistic Locking', OK, 'No lock; check version on commit');
  const tR = cue(sc, 'Everyone reads'), tV = cue(sc, 'each row carries a version'), tU = cue(sc, 'On commit'), tA = cue(sc, 'The first user succeeds'), tB = cue(sc, 'The second affects'), tE = cue(sc, "It's cheap");
  const done = lt >= tA + 0.8;
  stockBar(860, 215, 640, { label: 'One night · total_reserved', res: done ? 110 : 109, ver: done ? 8 : 7, a: pop(lt, 0.4, 0.7) });
  text('version numbers illustrative', 1360, 340, { size: 20, color: DIM, a: pop(lt, tV, 0.5) });
  const ca = pop(lt, 1.0, 0.6);
  const cy = CA.y - 20, ch = 400;
  txCard(CA.x, cy, CA.w, ch, 'User A', UA, [
    [tR + 0.6, 'Read: reserved 109 · v7'], [tU + 0.3, 'UPDATE reserved=110, v=8'], [tU + 0.9, 'WHERE version = 7'], [tA + 0.8, '1 row affected · commit', OK]], lt, ca, 56);
  txCard(CB.x, cy, CB.w, ch, 'User B', UB, [
    [tR + 0.7, 'Read: reserved 109 · v7'], [tU + 0.4, 'UPDATE reserved=110, v=8'], [tU + 1.0, 'WHERE version = 7'], [tB + 0.6, '0 rows affected ✗', RED], [tB + 1.8, 'ROLLBACK · re-read', RED]], lt, ca, 56);
  const pa = P(lt, tR, tR + 0.8), pb = P(lt, tR + 0.1, tR + 0.9);
  packet(1180, 330, CA.x + 235, cy, eIO(pa), UA); packet(1180, 330, CB.x + 235, cy, eIO(pb), UB);
  const ua = P(lt, tA - 0.2, tA + 0.7); packet(CA.x + 235, cy, 1180, 335, eIO(ua), UA);
  const ub = P(lt, tB - 0.2, tB + 0.6); packet(CB.x + 235, cy, 1280, 335, eIO(ub), UB);
  const x = pop(lt, tB + 0.9, 0.4); if (x > 0) mark(1280, 395, false, x, 0.9);
  if (done) mark(1100, 395, true, pop(lt, tA + 0.8, 0.4), 0.9);
  bullet(0, 'Reads take no lock', pop(lt, tR + 0.5), { y0: 440 });
  bullet(1, 'Only if version unchanged', pop(lt, tU), { y0: 440 });
  bullet(2, '0 rows = someone was first', pop(lt, tB), { y0: 440 });
  const cs = pop(lt, tE, 0.6);
  badge(110, 680, 'Few conflicts: cheap', OK, cs); badge(110, 746, 'High contention: many retries', RED, pop(lt, tE + 1.4, 0.6));
  statCard(110, 818, 640, 'Booking writes here', '~3 TPS', { color: OK, a: pop(lt, cue(sc, 'This system sees'), 0.7), h: 100 });
}

// ───────── 场景 6：数据库约束 ─────────
function sceneConstr(lt, d, sc) {
  header(lt, '06', 'DB Constraints', SC[3], 'Let the database enforce it');
  const tChk = cue(sc, 'total inventory minus'), tA = cue(sc, 'at or above zero', 0.3), tB = cue(sc, 'Any update'), tH = cue(sc, "It's simple"), tN = cue(sc, 'And if you allow');
  const ph = P(lt, tN, tN + 0.8);
  const resA = lt >= tA + 0.9 ? 100 : 99;
  stockBar(860, 215, 640, { label: ph > 0.5 ? 'One night · 100 physical rooms' : 'One night · total_reserved', res: resA, showCap: ph > 0.5, a: pop(lt, 0.4, 0.7), cap: 110 });
  const c1 = pop(lt, tChk, 0.6);
  glass(840, 395, 960, 100, { a: c1, accent: SC[3] });
  const s1 = 1 - ph, s2 = ph;
  text('CHECK ( total_inventory − total_reserved ≥ 0 )', 870, 456, { size: 28, font: MONO, weight: 700, color: SC[3], a: c1 * s1 });
  text('CHECK ( total_reserved ≤ sellable_limit )', 870, 448, { size: 28, font: MONO, weight: 700, color: SC[3], a: c1 * s2 });
  if (ph > 0) text('sellable_limit = 100 + 10 = 110 (integer math)', 870, 482, { size: 20, font: MONO, color: MUTE, a: s2 });
  const chipA = { x: 840, y: 560 }, chipB = { x: 1330, y: 560 };
  const a1 = pop(lt, tA - 0.5, 0.5) * s1, b1 = pop(lt, tB - 0.2, 0.5) * s1;
  glass(chipA.x, chipA.y, 400, 76, { a: a1, accent: UA }); text('User A  UPDATE +1', chipA.x + 24, chipA.y + 48, { size: 26, font: MONO, weight: 700, color: UA, a: a1 });
  glass(chipB.x, chipB.y, 400, 76, { a: b1, accent: UB }); text('User B  UPDATE +1', chipB.x + 24, chipB.y + 48, { size: 26, font: MONO, weight: 700, color: UB, a: b1 });
  const pk = (p, x1, y1, x2, y2, c) => { if (s1 > 0.5) packet(x1, y1, x2, y2, p, c); };
  pk(eIO(P(lt, tA, tA + 0.8)), 1040, 560, 1040, 330, UA);
  pk(eIO(P(lt, tB, tB + 0.8)), 1530, 560, 1200, 330, UB);
  const ra = pop(lt, tA + 0.9, 0.5) * s1, rb = pop(lt, tB + 0.9, 0.5) * s1;
  text('99 → 100 ≥ 0 · pass', 850, 690, { size: 26, font: MONO, weight: 700, color: OK, a: ra });
  text('100 − 101 < 0 · reject', 1340, 690, { size: 26, font: MONO, weight: 700, color: RED, a: rb });
  mark(1290, 650, true, ra, 0.7); mark(1790, 650, false, rb, 0.7);
  bullet(0, 'Simple; the DB is the backstop', pop(lt, tH, 0.6), { y0: 440 });
  bullet(1, 'Works well at low contention', pop(lt, tH + 1.0), { y0: 440 });
  bullet(2, 'High contention: many failures', pop(lt, tH + 2.0), { y0: 440 });
  [['100 rooms', 'sellable 110'], ['15 rooms', 'sellable 16'], ['9 rooms', 'sellable 9']].forEach(([n, v], k) => {
    const a = pop(lt, tN + 1.4 + k * 0.7, 0.5), x = 840 + k * 320;
    glass(x, 580, 290, 130, { a, accent: UB });
    text(n, x + 24, 630, { size: 26, color: MUTE, font: MONO, weight: 700, a });
    text(v, x + 24, 682, { size: 32, weight: 800, color: UB, font: MONO, a });
  });
  text('limit = N + floor(N / 10), integer math', 840, 770, { size: 24, color: MUTE, a: pop(lt, tN + 3.4, 0.6) });
  const nn = pop(lt, tN, 0.7);
  if (nn > 0) { glass(110, 660, 640, 150, { a: nn, accent: UB }); text('Allow 10% overbooking', 140, 710, { size: 26, color: MUTE, a: nn }); text('Constrain sellable limit 110', 140, 764, { size: 38, weight: 800, color: UB, a: nn }); text('not the physical room count', 140, 800, { size: 22, color: MUTE, a: nn }); }
}

// ───────── 场景 7：幂等 ─────────
function sceneIdem(lt, d, sc) {
  header(lt, '07', 'Idempotent Booking', UA, 'One order counts only once');
  const tId = cue(sc, 'When the order form'), tSub = cue(sc, 'with every submit'), tUq = cue(sc, 'A unique constraint'), t2 = cue(sc, 'blocks the second submit'), tRet = cue(sc, 'the existing order is returned'), tCmp = cue(sc, 'Idempotency controls');
  const tNo = cue(sc, 'Disabling the button');
  const e0 = pop(lt, 0.8, 0.5) * (1 - P(lt, tId - 0.5, tId));
  if (e0 > 0) {
    const dis = lt >= tNo + 0.3;
    glass(840, 330, 300, 90, { a: e0, accent: dis ? DIM : UA });
    text(dis ? 'Submit (disabled)' : 'Submit booking', 990, 388, { size: 28, weight: 800, align: 'center', color: dis ? DIM : UA, a: e0 });
    [1.6, 2.6].forEach((t, k) => { const p = P(lt, t, t + 0.7); if (p > 0 && p < 1) { ctx.save(); ctx.globalAlpha = (1 - p) * e0; ctx.strokeStyle = UA; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(1090 + k * 14, 375, 10 + p * 40, 0, 7); ctx.stroke(); ctx.restore(); } });
    text('Same user clicked twice', 840, 470, { size: 26, color: MUTE, a: e0 * pop(lt, 2.4, 0.5) });
    ['Script disabled', 'Auto-retry', 'Direct API call'].forEach((s2, k) => badge(1220, 320 + k * 70, s2, RED, e0 * pop(lt, tNo + 0.8 + k * 0.5, 0.5)));
    text('All bypass the front end', 1220, 550, { size: 24, color: RED, weight: 700, a: e0 * pop(lt, tNo + 2.4, 0.5) });
  }
  const idp = pop(lt, tId, 0.6);
  glass(840, 200, 560, 70, { a: idp, accent: UA });
  text('reservation_id = 13422445', 868, 247, { size: 28, weight: 800, font: MONO, color: UA, a: idp });
  text('generated at checkout', 1420, 247, { size: 22, color: MUTE, a: idp });
  const LY = [305, 485], lanes = ['1st submit', '2nd submit (retry)'];
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
  text('reservation table', 1448, 352, { size: 28, weight: 800, color: DBC, a: tb });
  text('UNIQUE (reservation_id)', 1448, 388, { size: 20, font: MONO, weight: 700, color: SC[3], a: pop(lt, tUq, 0.5) });
  const rowp = pop(lt, tl[0] + 1.1, 0.5);
  if (rowp > 0) {
    glass(1440, 420, 370, 70, { a: rowp, accent: OK, r: 14 });
    text('13422445 · confirmed', 1462, 465, { size: 24, font: MONO, weight: 700, a: rowp });
    text('same txn: inventory +1', 1448, 530, { size: 22, color: MUTE, a: rowp });
  }
  const hit = P(lt, tl[1] + 0.9, tl[1] + 1.6);
  if (hit > 0 && hit < 1) { ctx.save(); ctx.globalAlpha = Math.sin(hit * Math.PI); ctx.strokeStyle = RED; ctx.lineWidth = 4; glow(RED, 16); rr(1436, 416, 378, 78, 16); ctx.stroke(); ctx.restore(); }
  text('Unique violation ✗', 1448, 580, { size: 24, font: MONO, weight: 700, color: RED, a: pop(lt, tl[1] + 1.0, 0.5) });
  text('OK: order created, 1 room', 846, LY[0] + 130, { size: 24, color: OK, weight: 700, a: pop(lt, tl[0] + 1.2, 0.5) });
  text('Existing order returned, no deduction', 846, LY[1] + 130, { size: 24, color: OK, weight: 700, a: pop(lt, tRet - 0.2, 0.5) });
  const cp = pop(lt, tCmp, 0.6), cp2 = pop(lt, tCmp + 1.2, 0.6);
  glass(840, 700, 470, 150, { a: cp, accent: UA }); text('Idempotency key', 868, 750, { size: 32, weight: 800, color: UA, a: cp }); text('how many times one action runs', 868, 800, { size: 26, color: INK, a: cp });
  glass(1340, 700, 470, 150, { a: cp2, accent: DBC });
  text('Inventory control', 1368, 750, { size: 32, weight: 800, color: DBC, a: cp2 }); text('how many people can buy', 1368, 800, { size: 26, color: INK, a: cp2 });
  bullet(0, 'Disabling the button: unreliable', pop(lt, 0.8), { y0: 440 });
  bullet(1, 'Same ID, same result', pop(lt, tSub), { y0: 440 });
  bullet(2, 'Unique constraint blocks #2', pop(lt, tUq), { y0: 440 });
}

// ───────── 场景 8：分片 ─────────
function sceneShard(lt, d, sc) {
  header(lt, '08', 'Database Sharding', SC[0], 'Every query carries hotel_id');
  const tH = cue(sc, 'shard by a hash'), tQ = cue(sc, 'thirty thousand'), tE = cue(sc, 'which a MySQL');
  node(830, 360, 210, 150, 'Booking svc', 'QPS ×1000', SC[1], { a: pop(lt, 0.5, 0.6) });
  const rt = pop(lt, tH, 0.6);
  node(1090, 360, 270, 150, 'Router', 'hash(hotel_id)%16', SC[3], { a: rt });
  arrow(1042, 435, 1088, 435, { color: MUTE, a: rt });
  const gx = 1420, gy = 215, cw = 100, ch = 130, gp = 14;
  for (let k = 0; k < 16; k++) {
    const c = k % 4, r = Math.floor(k / 4), x = gx + c * (cw + gp), y = gy + r * (ch + gp), a = pop(lt, 0.8 + k * 0.05, 0.5);
    glass(x, y, cw, ch, { a, r: 16, accent: lt > tH + 0.8 ? DBC : null });
    text(`S${k}`, x + cw / 2, y + 42, { size: 20, color: MUTE, align: 'center', font: MONO, a, weight: 700 });
    const q = P(lt, tQ, tQ + 1.2);
    text(q > 0 ? Math.round(1875 * eOut(q)).toLocaleString('en-US') : '—', x + cw / 2, y + 98, { size: 26, color: DBC, align: 'center', font: MONO, weight: 800, a });
  }
  for (let k = 0; k < 44; k++) {
    const t0 = tH + 0.8 + k * 0.2, s = Math.floor(rnd(k * 3 + 1) * 16), c = s % 4, r = Math.floor(s / 4);
    packet(1360, 435, gx + c * (cw + gp) + cw / 2, gy + r * (ch + gp) + ch / 2, eIO(P(lt, t0, t0 + 0.7)), SC[3], { r: 6 });
  }
  bullet(0, 'Pick shard by hash(hotel_id)', pop(lt, tH + 0.5), { y0: 440 });
  bullet(1, 'A hotel always maps to one shard', pop(lt, tH + 1.5), { y0: 440 });
  statCard(110, 600, 640, '30,000 QPS ÷ 16 shards', '1,875 QPS / shard', { color: SC[0], a: pop(lt, tQ, 0.7) });
  text('Hot hotels may still pile on one shard', 110, 760, { size: 22, color: DIM, a: pop(lt, tE + 1, 0.6) });
}

// ───────── 场景 9：缓存 ─────────
function sceneCache(lt, d, sc) {
  header(lt, '09', 'Cache and Truth', SC[1], 'Cache to display, DB to decide');
  const tR = cue(sc, 'You can also cache'), tCdc = cue(sc, 'Database changes'), tSee = cue(sc, 'A user sees'), tSub = cue(sc, 'at submit'), tRej = cue(sc, 'and the database rejects'), tEnd = cue(sc, 'The cache only displays');
  const cdcEnd = tEnd + 0.2;
  const dbv = lt >= tCdc + 0.6 ? 0 : 1, cv = lt >= cdcEnd ? 0 : 1;
  const rejected = lt >= tRej;
  node(1000, 215, 340, 200, 'Redis cache', 'hotelID_roomTypeID_{date}', LOCK, { a: pop(lt, tR, 0.6), big: `left ${cv}`, bigColor: cv ? INK : RED });
  node(1460, 560, 340, 190, 'Database', 'source of truth', DBC, { a: pop(lt, tR + 0.5, 0.6), big: `left ${dbv}`, bigColor: dbv ? INK : RED, hot: rejected && lt < tRej + 2.5 });
  node(840, 560, 300, 190, 'User A', 'browsing', UA, { a: pop(lt, tR + 0.9, 0.6) });
  const rd = P(lt, tSee, tSee + 0.9);
  arrow(990, 540, 1090, 418, { color: LOCK, a: pop(lt, tR + 1.2, 0.5), dash: [8, 8] });
  packet(1090, 418, 990, 540, eIO(rd), LOCK, { r: 8 });
  text('read stock', 850, 470, { size: 22, color: LOCK, a: pop(lt, tR + 1.2, 0.5), weight: 700 });
  const see = pop(lt, tSee + 0.9, 0.5);
  if (see > 0) text('Sees: room available', 840, 790, { size: 28, weight: 800, color: OK, a: see });
  const cd = pop(lt, tCdc, 0.5);
  arrow(1560, 560, 1300, 420, { color: UB, a: cd, dash: [8, 8] });
  text('CDC async · lagging', 1430, 480, { size: 22, color: UB, weight: 700, a: cd });
  packet(1560, 560, 1300, 420, P(lt, tCdc + 0.6, cdcEnd), UB, { r: 9, trail: 0.2 });
  const bb = pop(lt, tCdc, 0.6);
  if (bb > 0) badge(1440, 790, 'User B books the last room', UB, bb);
  arrow(1145, 655, 1455, 655, { color: UA, a: pop(lt, tSub, 0.4) });
  packet(1145, 655, 1455, 655, eIO(P(lt, tSub, tSub + 0.8)), UA, { r: 10 });
  text('Submit', 1300, 635, { size: 22, color: UA, align: 'center', weight: 700, a: pop(lt, tSub, 0.4) });
  const rj = pop(lt, tRej, 0.5);
  if (rj > 0) { text('Sold out · rejected', 1300, 705, { size: 26, color: RED, align: 'center', weight: 800, a: rj }); mark(1300, 750, false, rj, 0.8); }
  const fin = pop(lt, tEnd + 0.8, 0.6);
  if (fin > 0) { glass(110, 660, 640, 120, { a: fin, accent: SC[1] }); text('Displayed ≠ decisive', 140, 715, { size: 34, weight: 800, color: SC[1], a: fin }); text('The DB check is final', 140, 758, { size: 24, color: MUTE, a: fin }); }
  bullet(0, 'Cache: fast, but lags', pop(lt, tR + 0.6), { y0: 440 });
  bullet(1, 'Database: final judge', pop(lt, tRej), { y0: 440 });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('Hotel Reservation System', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  [['Inventory row', 'hotel × room type × date, one row a day', SC[0]], ['Concurrency', 'pessimistic · optimistic · constraint', SC[1]], ['Idempotency key', 'reservation ID + unique constraint', SC[2]]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.5, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 50, weight: 800 });
    text(s, x + 36, 620, { size: 22, color: MUTE });
    ctx.restore();
  });
  text('The cache only displays; the database decides', 110, 760, { size: 30, weight: 700, color: SC[3], a: eOut(P(lt, 6.0, 6.8)) });
  text('Multi-night stock and order in one transaction; on payment timeout, verify, never hold stock locks', 110, 820, { size: 22, color: MUTE, a: eOut(P(lt, 7.0, 7.8)) });
}

export const scenes = { title: sceneTitle, model: sceneModel, multi: sceneMulti, race: sceneRace, pess: scenePess, opt: sceneOpt, constr: sceneConstr, idem: sceneIdem, shard: sceneShard, cache: sceneCache, end: sceneEnd };
