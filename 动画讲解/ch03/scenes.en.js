// Chapter 3 System Design Framework (English): scene definitions (shell and helpers come from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC,
         rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 3, title: 'System Design Framework', en: 'System Design Framework' };

// Text that shrinks to fit maxW (English runs wider than the layout was drawn for)
function fit(s, x, y, maxW, o = {}) {
  let size = o.size || 32; const min = o.min || 20;
  ctx.save();
  while (size > min) { ctx.font = `${o.weight || 500} ${size}px ${o.font || SANS}`; if (ctx.measureText(s).width <= maxW) break; size--; }
  ctx.restore();
  text(s, x, y, { ...o, size });
}
const wid = (s, size, weight = 500, font = SANS) => { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; const w = ctx.measureText(s).width; ctx.restore(); return w; };

// ───────── The 45-minute timeline used throughout ─────────
// Illustrative split 8 + 12 + 20 + 5 = 45 (the book gives ranges: 3–10 / 10–15 / 10–25 / 3–5 minutes)
const SEG = [[0, 8, 'Clarify', SC[0]], [8, 20, 'Design', SC[1]], [20, 40, 'Deep dive', SC[2]], [40, 45, 'Wrap-up', SC[3]]];
const FLAGS = [[10, 'Needs + API'], [20, 'Diagram + scale'], [40, 'Stop adding']];
function timeline(lt, o = {}) {
  const { x0 = 830, w = 980, y = 190, h = 44, active = -1, grow = [1, 1, 1, 1], labels = 'name', labelA = [1, 1, 1, 1],
          play = null, flags = [0, 0, 0], a = 1, size = 22 } = o;
  const mx = (m) => x0 + (m / 45) * w;
  ctx.save(); ctx.globalAlpha *= a;
  SEG.forEach(([s, e, name, c], i) => {
    const g = grow[i]; if (g <= 0) return;
    const sx = mx(s), ww = (mx(e) - sx - 4) * g, on = active === i, dim = active >= 0 && !on;
    ctx.save(); ctx.globalAlpha *= dim ? 0.38 : 1;
    if (on) glow(c, 22);
    rr(sx, y, ww, h, h / 2.6); ctx.fillStyle = c + (on ? '55' : '26'); ctx.fill();
    ctx.lineWidth = on ? 2.5 : 1.8; ctx.strokeStyle = c; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();
    if (g > 0.95 && labelA[i] > 0) {
      const full = mx(e) - sx - 4;
      let lab = labels === 'min' ? `${e - s}′` : `${name} ${e - s}′`;
      if (wid(lab, size, 700) > full - 14) lab = `${e - s}′`;
      text(lab, sx + full / 2, y + h / 2 + size * 0.36, { size, weight: 700, align: 'center', color: dim ? MUTE : INK, a: labelA[i] });
    }
  });
  FLAGS.forEach(([m, lab], i) => {
    const f = flags[i]; if (f <= 0) return;
    const x = mx(m);
    ctx.save(); ctx.globalAlpha *= f; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + h + 26); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    dot(x, y + h + 28, 5, i === 2 ? RED : '#ffffff', { g: 10, a: f });
    text(`${m}′ ${lab}`, x, y + h + 62, { size: 20, color: i === 2 ? RED : MUTE, align: 'center', weight: 600, a: f });
  });
  if (play !== null) {
    const x = mx(clamp(play, 0, 45));
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; glow('#ffffff', 14);
    ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 1); ctx.moveTo(x, y + h - 1); ctx.lineTo(x, y + h + 10); ctx.stroke(); ctx.restore();
    dot(x, y - 14, 7, '#fff', { g: 18 });
    text(`Minute ${Math.floor(play)}`, x, y - 32, { size: 20, font: MONO, weight: 700, align: 'center' });
  }
  ctx.restore();
}
// Left-column heading with a fitted title (same look as lib header)
function H1(lt, num, title, accent, sub, tag) {
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(tag || `STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  fit(title, 108, 262, 640, { size: 70, weight: 800, min: 48 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) fit(sub, 110, 336, 640, { size: 26, color: MUTE, min: 22 });
  ctx.restore();
}
const typed = (s, p) => s.slice(0, Math.floor(s.length * clamp(p)));
function cross(x, y, w, h, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = RED; ctx.lineWidth = 6; ctx.lineCap = 'round'; glow(RED, 12);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke(); ctx.restore();
}

// ───────── Title ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  text('45′', 1810, 640, { size: 300, weight: 900, color: 'rgba(139,141,252,0.14)', align: 'right', font: MONO, a });
  text('SYSTEM DESIGN INTERVIEW · ANIMATED GUIDE', 110, 360, { size: 28, weight: 600, color: SC[0], ls: 4, a });
  const g = ctx.createLinearGradient(110, 0, 1000, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 100px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('System Design Framework', 104, 520); ctx.restore();
  text('Four steps for forty-five minutes', 112, 590, { size: 38, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('Chapter 3', 112, 680, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
  const gr = SEG.map((_, i) => eOut(P(lt, 1.6 + i * 0.5, 2.4 + i * 0.5)));
  timeline(lt, { x0: 110, w: 1700, y: 790, h: 56, grow: gr, size: 26, play: lt > 4.4 ? 45 * eIO(P(lt, 4.4, 8.2)) : null, a: 1 });
}

// ───────── Overview: four steps + time budget ─────────
function sceneOverview(lt) {
  H1(lt, '', 'Four steps', SC[1], 'A forty-five minute budget', 'OVERVIEW');
  const T = [10.6, 11.9, 13.3, 14.6], M = [16.0, 17.1, 18.1, 18.9];
  timeline(lt, { y: 330, h: 84, labels: 'min', size: 34, grow: T.map((t) => eOut(P(lt, t, t + 0.7))), labelA: M.map((t) => eOut(P(lt, t, t + 0.5))), a: eOut(P(lt, 8.6, 9.4)) });
  const C = [['01', 'Understand', 'Clarify needs, lock scope', 'Book: 3–10 min'], ['02', 'High-level', 'Draw blueprint, get buy-in', 'Book: 10–15 min'],
             ['03', 'Deep dive', 'Dig into the key bottleneck', 'Book: 10–25 min'], ['04', 'Wrap-up', 'Review trade-offs, evolve', 'Book: 3–5 min']];
  C.forEach(([n, t, s, r], i) => {
    const x = 830 + (i % 2) * 520, y = 520 + Math.floor(i / 2) * 180, a = eOut(P(lt, T[i], T[i] + 0.7)), c = SEG[i][3];
    glass(x, y, 490, 156, { accent: c, a });
    text(n, x + 28, y + 44, { size: 22, color: c, font: MONO, weight: 700, ls: 3, a });
    text(t, x + 28, y + 96, { size: 38, weight: 800, a });
    fit(s, x + 28, y + 136, 440, { size: 24, color: MUTE, a });
    text(r, x + 462, y + 44, { size: 20, color: DIM, font: MONO, align: 'right', a });
  });
  text('Typical split (illustrative): 8 + 12 + 20 + 5 = 45', 830, 478, { size: 24, color: MUTE, a: eOut(P(lt, 15.6, 16.4)) });
  bullet(0, 'Not “whatever comes to mind”', eOut(P(lt, 5.0, 5.7)));
  bullet(1, 'Four steps, each with a budget', eOut(P(lt, 8.0, 8.7)));
  statCard(110, 600, 640, 'Total time', '45 min', { color: SC[1], a: eOut(P(lt, 2.0, 2.7)), note: '8 + 12 + 20 + 5' });
}

// ───────── Step 1: ask first ─────────
const ASK = [
  { q: 'Sorted how?', out: 'Time + ID cursor', sub: 'Newest first: no recommender', c: SC[0], tq: 6.3, to: 9.8 },
  { q: 'How many friends?', out: 'Fan-out per post', sub: 'Celebrities flood the queue', c: SC[2], tq: 11.6, to: 14.4 },
  { q: 'Images or video?', out: 'Object storage + CDN', sub: 'Posts keep only media links', c: SC[3], tq: 16.6, to: 18.4 },
];
function sceneAsk(lt) {
  H1(lt, '01', 'Ask first', SC[0], 'Understand the problem, set scope');
  timeline(lt, { active: 0, play: lerp(0, 5, P(lt, 0.5, 20)) });
  ASK.forEach((r, k) => {
    const y = 340 + k * 170, qa = eOut(P(lt, r.tq, r.tq + 0.6)), oa = eOut(P(lt, r.to, r.to + 0.6));
    glass(830, y, 400, 130, { accent: r.c, a: qa });
    text(`Q${k + 1}`, 858, y + 40, { size: 20, color: r.c, font: MONO, weight: 700, a: qa });
    fit(r.q, 858, y + 92, 350, { size: 34, weight: 700, a: qa });
    arrow(1244, y + 65, 1326, y + 65, { color: r.c, p: eOut(P(lt, r.to - 0.3, r.to + 0.3)), g: 8 });
    glass(1340, y, 500, 130, { accent: r.c, a: oa, fill: 0.09 });
    fit(r.out, 1368, y + 60, 450, { size: 32, weight: 800, color: r.c, a: oa });
    fit(r.sub, 1368, y + 98, 450, { size: 24, color: MUTE, a: oa });
    bullet(k, ['Sort order', 'Follow scale', 'Content type'][k], qa);
  });
  badge(110, 640, 'Good question = changes design', SC[0], eOut(P(lt, 3.6, 4.3)));
  text('Skip questions that change nothing', 110, 744, { size: 26, color: MUTE, a: eOut(P(lt, 19.0, 19.8)) });
}

// ───────── Step 1 (cont.): write down assumptions ─────────
function sceneAssume(lt) {
  H1(lt, '01', 'Write it down', SC[0], 'No numbers? Propose a start');
  timeline(lt, { active: 0, play: lerp(5, 10, P(lt, 0.5, 18.5)), flags: [eOut(P(lt, 17.0, 17.8)), 0, 0] });
  const ba = eOut(P(lt, 1.0, 1.7));
  glass(830, 340, 480, 360, { accent: SC[0], a: ba });
  text('Whiteboard · assumptions', 860, 384, { size: 22, color: MUTE, a: ba });
  text('illustrative', 1280, 384, { size: 20, color: DIM, align: 'right', a: ba });
  const L = [['Users', '≈ 10 million', 10.6], ['Traffic', 'Read-heavy', 12.2], ['Sort', 'Newest first', 13.7], ['Excluded', 'Recommender', 14.8]];
  L.forEach(([k, v, t0], i) => {
    const y = 450 + i * 62;
    text(k, 860, y, { size: 26, color: MUTE, a: ba });
    if (i === 0 && lt < t0) text('?', 1030, y, { size: 30, color: DIM, font: MONO, a: eOut(P(lt, 3.0, 3.6)) });
    const s = typed(v, P(lt, t0, t0 + 1.0));
    text(s, 1030, y, { size: 30, weight: 700, color: SC[0], font: i === 0 ? MONO : SANS });
  });
  badge(830, 730, 'Propose a starting value', SC[4], eOut(P(lt, 3.6, 4.3)));
  badge(1220, 730, 'Invite correction', SC[3], eOut(P(lt, 6.6, 7.3)));
  // dialogue
  const b1 = eOut(P(lt, 9.4, 10.1));
  glass(1340, 340, 500, 190, { accent: SC[0], a: b1 });
  text('You', 1368, 380, { size: 20, color: SC[0], font: MONO, weight: 700, a: b1 });
  const q = [['Designing for 10 million users,', 9.8, 11.6], ['mostly reads, sorted by time.', 12.0, 14.0], ['Is that scope okay?', 14.8, 15.8]];
  q.forEach(([s, a0, a1], i) => text(typed(s, P(lt, a0, a1)), 1368, 424 + i * 38, { size: 26, a: b1 }));
  const b2 = eOut(P(lt, 15.9, 16.6));
  glass(1340, 560, 500, 120, { accent: SC[3], a: b2 });
  text('Interviewer (illustrative)', 1368, 600, { size: 20, color: SC[3], font: MONO, weight: 700, a: b2 });
  text('Sure, and add images', 1368, 648, { size: 28, a: b2 });
  const ca = eOut(P(lt, 16.8, 17.6));
  glass(830, 790, 1010, 100, { accent: '#ffffff', a: ca });
  text('By minute 10', 860, 850, { size: 28, color: MUTE, a: ca });
  const c1 = eOut(P(lt, 17.4, 18.0)), c2 = eOut(P(lt, 18.6, 19.2));
  text('Requirements ✓', 1090, 850, { size: 34, weight: 800, color: SC[4], a: c1 });
  text('Core API ✓', 1450, 850, { size: 34, weight: 800, color: SC[4], a: c2 });
  bullet(0, 'Assumptions go on the whiteboard', eOut(P(lt, 1.2, 1.9)));
  bullet(1, 'Every change can be checked later', eOut(P(lt, 8.9, 9.6)));
}

// ───────── Step 2: high-level blueprint ─────────
function sceneBlueprint(lt) {
  H1(lt, '02', 'Blueprint', SC[1], 'Treat the interviewer as a teammate');
  timeline(lt, { active: 1, play: lerp(8, 20, P(lt, 0.8, 24.8)), flags: [0.6, eOut(P(lt, 24.0, 24.8)), 0] });
  const pop = (t) => eBack(P(lt, t, t + 0.6));
  box(830, 450, 180, 110, 'Client', { color: SC[0], s: pop(6.4), a: clamp(pop(6.4) * 2) });
  box(1100, 450, 180, 110, 'API', { color: SC[1], s: pop(7.8), a: clamp(pop(7.8) * 2) });
  box(1440, 340, 250, 110, 'Feed cache', { color: SC[2], s: pop(9.8), a: clamp(pop(9.8) * 2) });
  dbIcon(1500, 600, 130, 150, 'Posts DB', { color: SC[3], a: clamp(pop(8.9) * 2) });
  arrow(1020, 505, 1090, 505, { color: MUTE, p: eOut(P(lt, 8.2, 8.8)) });
  arrow(1290, 480, 1430, 420, { color: MUTE, p: eOut(P(lt, 10.0, 10.6)) });
  arrow(1290, 540, 1490, 660, { color: MUTE, p: eOut(P(lt, 10.0, 10.6)) });
  arrow(1565, 590, 1565, 462, { color: SC[2], p: eOut(P(lt, 19.6, 20.4)), dash: [8, 8] });
  text('Fill friends’ feeds', 1590, 535, { size: 22, color: SC[2], weight: 600, a: eOut(P(lt, 19.8, 20.6)) });
  // back-of-the-envelope
  const ea = eOut(P(lt, 10.8, 11.6));
  text('Back-of-envelope', 830, 846, { size: 24, color: MUTE, weight: 600, a: ea });
  [['Requests', 1060], ['Peak', 1226], ['Storage', 1340], ['Bandwidth', 1495]].forEach(([s, x], i) => badge(x, 816, s, SC[3], eOut(P(lt, 11.8 + i * 0.8, 12.5 + i * 0.8))));
  // publish flow (green)
  const pc = SC[4], rc = '#eef1fa';
  [[1020, 505, 1090, 505, 17.2, 18.0], [1280, 540, 1490, 660, 18.0, 19.5], [1565, 590, 1565, 462, 19.6, 20.6]].forEach(([a1, b1, a2, b2, t0, t1]) => {
    packet(a1, b1, a2, b2, P(lt, t0, t1), pc, { r: 11 });
  });
  [[1020, 505, 1090, 505, 21.0, 21.8], [1290, 480, 1430, 420, 21.9, 23.0], [1430, 420, 1290, 480, 23.3, 24.3], [1090, 505, 1020, 505, 24.3, 25.1]].forEach(([a1, b1, a2, b2, t0, t1]) => {
    packet(a1, b1, a2, b2, P(lt, t0, t1), rc, { r: 11 });
  });
  bullet(0, 'Boxes + arrows, check as you go', eOut(P(lt, 2.0, 2.7)), { size: 28 });
  bullet(1, 'Estimate: can it cope?', eOut(P(lt, 10.8, 11.5)), { size: 28 });
  bullet(2, 'Walk the two core flows', eOut(P(lt, 15.2, 15.9)), { size: 28 });
  bullet(3, 'Publish: write DB, fill feeds', eOut(P(lt, 17.0, 17.7)), { color: SC[4], size: 26 });
  bullet(4, 'Retrieve: gather, newest first', eOut(P(lt, 20.8, 21.5)), { color: INK, size: 26 });
}

// ───────── Step 3: dig into the bottleneck ─────────
function sceneBottleneck(lt) {
  H1(lt, '03', 'Deep dive', SC[2], 'Only the most critical bottleneck');
  timeline(lt, { active: 2, play: lerp(20, 30, P(lt, 0.8, 25.5)) });
  const pop = (t) => eBack(P(lt, t, t + 0.6));
  box(830, 440, 200, 110, 'Celebrity post', { color: SC[2], size: 24, s: pop(4.8), a: clamp(pop(4.8) * 2) });
  // backlog: fast-forward one minute 14.0-18.6; extra workers start draining at 21.8
  const grow = P(lt, 14.0, 18.6), drain = P(lt, 22.6, 25.8);
  const backlog = Math.round(600000 * grow * (1 - 0.7 * eIO(drain)));
  const fill = clamp(0.92 * grow * (1 - 0.7 * eIO(drain)));
  const hotQ = grow > 0.45 && drain < 0.5;
  dbIcon(1170, 370, 200, 250, 'Fan-out queue', { color: hotQ ? RED : SC[3], a: eOut(P(lt, 6.2, 7.0)), fill });
  box(1500, 440, 260, 110, 'Worker', { color: SC[1], sub: '20k / sec', s: pop(8.4), a: clamp(pop(8.4) * 2), hot: hotQ });
  arrow(1040, 495, 1160, 495, { color: SC[2], p: eOut(P(lt, 5.4, 6.0)) });
  arrow(1380, 495, 1490, 495, { color: SC[1], p: eOut(P(lt, 8.4, 9.0)) });
  if (lt > 12.8) for (let k = 0; k < 9; k++) packet(1040, 495, 1160, 495, (lt * 1.1 + k / 9) % 1, SC[2], { r: 8, trail: 0.2 });
  if (lt > 9.0) for (let k = 0; k < (lt > 22.4 ? 9 : 6); k++) packet(1380, 495, 1490, 495, (lt * 1.1 + k / 6) % 1, SC[1], { r: 8, trail: 0.2 });
  if (grow > 0) {
    text(`Backlog ${backlog.toLocaleString('en-US')}`, 1270, 722, { size: 34, weight: 800, font: MONO, color: drain > 0.5 ? SC[3] : RED, align: 'center' });
    text('illustrative: fast-forward 1 min', 1270, 760, { size: 20, color: DIM, align: 'center', a: 1 - drain });
  }
  // adding API servers does nothing
  const na = eOut(P(lt, 18.5, 19.2));
  box(830, 650, 200, 100, 'API × N', { color: SC[1], a: na * 0.7 });
  cross(850, 662, 160, 76, eOut(P(lt, 19.3, 20.0)));
  text('Stateless: no help', 930, 790, { size: 24, color: RED, align: 'center', weight: 600, a: eOut(P(lt, 19.5, 20.2)) });
  // raise capacity
  const wb = pop(21.8);
  box(1500, 620, 260, 110, 'Worker × 2', { color: SC[4], s: wb, a: clamp(wb * 2) });
  arrow(1380, 560, 1500, 650, { color: SC[4], p: eOut(P(lt, 21.9, 22.5)) });
  text('Or: merge on read', 1630, 780, { size: 24, color: MUTE, align: 'center', a: eOut(P(lt, 23.8, 24.5)) });
  statCard(110, 420, 640, 'Inbox updates · capacity', '20,000', { color: SC[4], a: eOut(P(lt, 10.0, 10.7)), note: 'per sec' });
  statCard(110, 550, 640, 'Inbox updates · arriving', '30,000', { color: SC[3], a: eOut(P(lt, 12.8, 13.5)), note: 'per sec' });
  statCard(110, 680, 640, 'Backlog after one minute', (600000 * grow > 0 ? Math.round(600000 * grow) : 0).toLocaleString('en-US'), { color: RED, a: eOut(P(lt, 15.0, 15.7)), note: 'items' });
  text('Illustrative numbers from the self-test', 110, 840, { size: 20, color: DIM, a: eOut(P(lt, 15.0, 15.7)) });
}

// ───────── Step 3 (cont.): four questions + trade-off ─────────
function sceneTradeoff(lt) {
  H1(lt, '03', 'Four questions', SC[2], 'Digging ends in a trade-off');
  timeline(lt, { active: 2, play: lerp(30, 38, P(lt, 0.8, 24)) });
  const Q = [['Key + access', ['key = user ID', 'latest N posts'], 3.9, 2], ['Limits + faults', ['queue backlog', 'oldest message age'], 6.7, 1], ['Loss · dup · lag', ['retry-safe writes', 'dedupe messages'], 10.0, 1], ['When to upgrade', ['at the measured limit', 'then shard / replicate'], 13.1, 2]];
  const out = 1 - eOut(P(lt, 14.8, 15.6));
  if (out > 0) {
    ctx.save(); ctx.globalAlpha *= out;
    const bx = [830, 1210, 1590], bn = ['Post API', 'Fan-out queue', 'Inbox'], bc = [SC[1], SC[3], SC[2]];
    bn.forEach((n, i) => box(bx[i], 340, 250, 90, n, { color: bc[i], size: 26, a: eOut(P(lt, 1.0 + i * 0.3, 1.8 + i * 0.3)) }));
    arrow(1090, 385, 1200, 385, { color: MUTE, p: eOut(P(lt, 1.6, 2.2)) });
    arrow(1470, 385, 1580, 385, { color: MUTE, p: eOut(P(lt, 1.9, 2.5)) });
    Q.forEach(([t, ls, t0, bi], k) => {
      const x = 830 + k * 257, a = eOut(P(lt, t0, t0 + 0.6)), on = lt >= t0 && (k === 3 || lt < Q[k + 1][2]);
      glass(x, 520, 240, 250, { accent: on ? SC[2] : null, a, fill: on ? 0.1 : 0.04 });
      text(`0${k + 1}`, x + 22, 560, { size: 20, color: SC[2], font: MONO, weight: 700, a });
      fit(t, x + 22, 608, 200, { size: 28, weight: 800, a, min: 22 });
      ls.forEach((s, i) => fit(s, x + 22, 662 + i * 40, 202, { size: 24, color: MUTE, a: a * eOut(P(lt, t0 + 0.6 + i * 0.3, t0 + 1.2 + i * 0.3)) }));
      if (on) { ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = SC[2]; ctx.lineWidth = 2; ctx.setLineDash([6, 7]); ctx.beginPath(); ctx.moveTo(x + 120, 520); ctx.lineTo(bx[bi] + 125, 432); ctx.stroke(); ctx.restore(); }
    });
    text('Illustrative example, not book data', 830, 826, { size: 20, color: DIM, a: eOut(P(lt, 3.9, 4.5)) });
    ctx.restore();
  }
  const la = eOut(P(lt, 16.6, 17.3));
  if (la > 0) {
    // lane A: regular users push on write
    text('Regular users · push on write', 830, 366, { size: 30, weight: 800, color: SC[0], a: la });
    box(830, 400, 170, 90, 'Post', { color: SC[0], a: la, size: 28 });
    for (let i = 0; i < 5; i++) {
      const x = 1200 + i * 125, ta = eOut(P(lt, 17.2 + i * 0.1, 17.8 + i * 0.1));
      box(x, 400, 105, 90, 'Inbox', { color: SC[2], a: la * ta, size: 20 });
      packet(1010, 445, x, 445, P(lt, 17.6 + i * 0.12, 18.6 + i * 0.12), SC[0], { r: 8 });
      dot(x + 52, 478, 6, SC[0], { g: 10, a: la * eOut(P(lt, 18.5 + i * 0.12, 18.9 + i * 0.12)) });
    }
    text('One post, written to every follower’s inbox', 830, 548, { size: 24, color: MUTE, a: eOut(P(lt, 18.6, 19.2)) });
    badge(1400, 566, 'Fast reads', SC[4], eOut(P(lt, 19.4, 20.0)));
    // lane B: celebrities merge on read
    text('Celebrities · merge on read', 830, 662, { size: 30, weight: 800, color: SC[2], a: eOut(P(lt, 20.6, 21.2)) });
    const lb = eOut(P(lt, 20.8, 21.4));
    box(830, 696, 170, 90, 'Celeb post', { color: SC[2], a: lb, size: 26 });
    box(1180, 696, 220, 90, 'Post store', { color: SC[3], a: lb, size: 28 });
    box(1560, 696, 200, 90, 'Reader', { color: SC[0], a: lb, size: 28 });
    arrow(1010, 741, 1170, 741, { color: SC[2], p: eOut(P(lt, 21.2, 21.8)) });
    arrow(1410, 741, 1550, 741, { color: SC[0], p: eOut(P(lt, 22.0, 22.6)) });
    packet(1010, 741, 1170, 741, P(lt, 21.3, 22.1), SC[2], { r: 8 });
    for (let k = 0; k < 3; k++) packet(1410, 741, 1550, 741, P(lt, 22.2 + k * 0.2, 23.1 + k * 0.2), SC[0], { r: 8 });
    text('Merged at read time, written once', 830, 838, { size: 24, color: MUTE, a: eOut(P(lt, 22.0, 22.6)) });
    badge(1400, 810, 'Extra read work', RED, eOut(P(lt, 23.0, 23.6)));
  }
  [['Key and access pattern', 3.9], ['Capacity limits, failure modes', 6.7], ['Lost, duplicated, delayed', 10.0], ['When to upgrade, how to migrate', 13.1]].forEach(([s, t], i) => bullet(i, s, eOut(P(lt, t, t + 0.6)), { size: 28 }));
}

// ───────── Step 4: wrap-up ─────────
function sceneWrap(lt) {
  H1(lt, '04', 'Wrap-up', SC[3], 'Last five minutes: nothing new');
  timeline(lt, { active: 3, play: 40 + 5 * P(lt, 1.0, 24.0), flags: [0, 0, eOut(P(lt, 21.0, 21.8))] });
  const M = [['Restate', 'Goals', 'Assumptions', 6.0], ['Paths', 'Write path', 'Read path', 9.8], ['Trade-offs', 'Key choices', 'and costs', 13.2], ['Failures', 'Bottlenecks', 'and fallbacks', 15.3], ['Upgrade', 'Triggers for', 'next stage', 18.5]];
  M.forEach(([t, l1, l2, t0], i) => {
    const x = 830 + i * 205, a = eOut(P(lt, t0, t0 + 0.6)), on = lt >= t0 && lt < (i < 4 ? M[i + 1][3] : 99);
    glass(x, 340, 186, 250, { accent: SC[3], a, fill: on ? 0.11 : 0.04 });
    text(`Minute ${i + 1}`, x + 16, 382, { size: 20, color: SC[3], font: MONO, weight: 700, a });
    fit(t, x + 16, 450, 156, { size: 40, weight: 800, a, min: 26 });
    fit(l1, x + 16, 506, 156, { size: 22, color: MUTE, a });
    fit(l2, x + 16, 540, 156, { size: 22, color: MUTE, a });
    if (on) { ctx.save(); ctx.fillStyle = SC[3]; glow(SC[3], 14); rr(x + 16, 566, 154, 5, 3); ctx.fill(); ctx.restore(); }
  });
  const sa = eOut(P(lt, 21.0, 21.8));
  glass(830, 660, 1010, 190, { accent: RED, a: sa });
  text('Minute 40', 866, 722, { size: 40, weight: 800, font: MONO, color: RED, a: sa });
  text('No new components. Review failures, trade-offs.', 866, 776, { size: 28, weight: 600, a: sa });
  const bw = badge(1530, 700, '+ New component', MUTE, sa * 0.8);
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 21.7, 22.5)); ctx.fillStyle = RED; glow(RED, 10); ctx.fillRect(1520, 724, (bw + 20) * eOut(P(lt, 21.7, 22.5)), 4); ctx.restore();
  bullet(0, 'Stop widening the scope', eOut(P(lt, 3.4, 4.1)));
  bullet(1, 'Show the design holds up', eOut(P(lt, 9.0, 9.7)));
  bullet(2, 'Clear trade-offs, bounded failures', eOut(P(lt, 15.0, 15.7)));
}

// ───────── Pitfalls on the timeline ─────────
function scenePitfalls(lt) {
  H1(lt, '', 'Pitfalls', RED, 'Each one sits on the timeline', 'PITFALLS');
  timeline(lt, { active: -1, flags: [1, 1, 1] });
  const mx = (m) => 830 + (m / 45) * 980;
  const PIT = [
    { m: 2, t0: 4.0, title: 'Start: buzzwords', lines: [['Kafka · Redis · 10 services', INK], ['Scope never locked', RED]], fix: '10′: needs + API' },
    { m: 28, t0: 9.2, title: 'Middle: details', lines: [['Columns, class names', INK], ['No hotspots or retries', RED]], fix: '20′: diagram + scale' },
    { m: 44, t0: 17.0, title: 'End: more parts', lines: [['No wrap-up', RED], ['No trade-offs or plan', RED]], fix: '40′: stop adding' },
  ];
  PIT.forEach((p, k) => {
    const a = eOut(P(lt, p.t0, p.t0 + 0.7)), x = 830 + k * 345, cx = x + 160, px = mx(p.m), py = 190 + 44;
    if (a > 0) {
      const pulse = (lt * 0.8) % 1;
      ctx.save(); ctx.strokeStyle = RED; ctx.globalAlpha *= a * (1 - pulse); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 14 + pulse * 22, 0, 7); ctx.stroke(); ctx.restore();
      dot(px, py, 9, RED, { g: 20, a });
      ctx.save(); ctx.globalAlpha *= a * 0.7; ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.moveTo(px, py + 8); ctx.lineTo(px, 372); ctx.lineTo(cx, 372); ctx.lineTo(cx, 450); ctx.stroke(); ctx.restore();
    }
    glass(x, 450, 320, 290, { accent: RED, a });
    fit(p.title, x + 24, 506, 272, { size: 30, weight: 800, a });
    p.lines.forEach(([s, c], i) => {
      const la = a * eOut(P(lt, p.t0 + 0.6 + i * 0.8, p.t0 + 1.2 + i * 0.8));
      fit(s, x + 24, 566 + i * 56, 272, { size: 22, color: c, weight: c === RED ? 700 : 500, a: la });
    });
    const fa = a * eOut(P(lt, p.t0 + 2.8, p.t0 + 3.5));
    ctx.save(); ctx.globalAlpha *= fa; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 24, 650, 272, 2); ctx.restore();
    text('FIX', x + 24, 686, { size: 20, color: SC[4], font: MONO, weight: 700, ls: 3, a: fa });
    fit(p.fix, x + 24, 722, 272, { size: 24, color: SC[4], weight: 700, a: fa });
  });
  [['Ask more, clarify first', 22.0], ['Don’t go silent', 23.3], ['Stay on what matters', 24.4], ['Avoid over-engineering', 25.4]].forEach(([s, t], i) => {
    bullet(i, s, eOut(P(lt, t, t + 0.6)), { color: SC[4], size: 28 });
  });
  text('DO THIS', 110, 388, { size: 22, color: SC[4], font: MONO, weight: 700, ls: 3, a: eOut(P(lt, 21.4, 21.9)) });
}

// ───────── 90 seconds, all four steps ─────────
function sceneChain(lt) {
  H1(lt, '', 'Ninety seconds', SC[3], 'Four steps, one Feed example', '90 SEC');
  const R = [
    [15, 'Needs', SC[0], 'Friends’ feed, newest first', 'Who needs what?', 5.2, 15.6],
    [25, 'Path', SC[1], 'Write → fan out → read', 'How does it flow?', 7.2, 17.1],
    [15, 'Bottleneck', SC[2], 'Celebrity fan-out backlog', 'What jams first?', 9.1, 18.6],
    [20, 'Trade-offs', SC[2], 'Push regular, merge celebrity', 'Why pay this cost?', 10.9, 20.4],
    [15, 'Evolution', SC[3], 'One DB, scale on evidence', 'What triggers upgrade?', 12.6, 22.3],
  ];
  // 90-second bar
  let off = 0; const x0 = 830, w = 980;
  R.forEach(([s, n, c, , , t0]) => {
    const g = eOut(P(lt, t0, t0 + 0.6)), sx = x0 + (off / 90) * w, ww = (s / 90) * w - 4;
    if (g > 0) {
      glass(sx, 190, ww * g, 44, { r: 16, accent: c });
      if (g > 0.95) { let lab = `${n} ${s}s`; if (wid(lab, 20, 700) > ww - 10) lab = `${s}s`; text(lab, sx + ww / 2, 219, { size: 20, weight: 700, align: 'center' }); }
    }
    off += s;
  });
  R.forEach(([s, n, c, phrase, q, t0, t1], i) => {
    const y = 300 + i * 104, a = eOut(P(lt, t0, t0 + 0.6)), qa = eOut(P(lt, t1, t1 + 0.6));
    const on = lt >= t1 && lt < t1 + 1.3;
    glass(830, y, 1010, 88, { accent: c, a, fill: on ? 0.11 : 0.055 });
    fit(n, 858, y + 55, 180, { size: 32, weight: 800, color: c, a });
    text(`${s}s`, 1050, y + 53, { size: 22, color: MUTE, font: MONO, a });
    fit(phrase, 1120, y + 54, 400, { size: 24, a });
    fit(q, 1810, y + 54, 270, { size: 24, color: c, weight: 700, align: 'right', a: qa });
  });
  statCard(110, 430, 640, 'Full answer', '90 sec', { color: SC[3], a: eOut(P(lt, 0.9, 1.6)), note: '15 + 25 + 15 + 20 + 15' });
  const la = eOut(P(lt, 14.7, 15.4));
  text('Needs → Path → Bottleneck →', 110, 620, { size: 28, weight: 600, color: INK, a: la });
  text('Trade-offs → Evolution', 110, 658, { size: 28, weight: 600, color: INK, a: la });
  text('Each choice answers the last constraint', 110, 714, { size: 24, color: MUTE, a: eOut(P(lt, 16.0, 16.7)) });
  text('Sample answer from the book’s self-test; Feed numbers illustrative', 830, 846, { size: 20, color: DIM, a: eOut(P(lt, 14.7, 15.4)) });
}

// ───────── Summary ─────────
function sceneEnd(lt) {
  text('System Design Framework', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Four steps · forty-five minutes', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['Clarify', 'Ask first, write assumptions', SC[0]], ['Buy-in', 'Blueprint and paths agreed', SC[1]], ['Trade-offs', 'Bottlenecks, costs, evolution', SC[3]]].forEach(([w, s, c], k) => {
    const t0 = 1.6 + k * 1.4, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 390, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 390, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 450, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    fit(w, x + 36, 536, 450, { size: 70, weight: 800 });
    fit(s, x + 36, 590, 450, { size: 26, color: MUTE });
    ctx.restore();
  });
  const ta = eOut(P(lt, 6.4, 7.2));
  timeline(lt, { x0: 110, w: 1700, y: 730, h: 52, size: 26, a: ta, flags: [eOut(P(lt, 8.0, 8.6)), eOut(P(lt, 8.4, 9.0)), eOut(P(lt, 8.8, 9.4))] });
  text('45 min = 8 + 12 + 20 + 5 (illustrative split)', 110, 900, { size: 20, color: DIM, a: eOut(P(lt, 9, 9.8)) });
}

export const scenes = { title: sceneTitle, overview: sceneOverview, ask: sceneAsk, assume: sceneAssume, blueprint: sceneBlueprint,
  bottleneck: sceneBottleneck, tradeoff: sceneTradeoff, wrap: sceneWrap, pitfalls: scenePitfalls, chain: sceneChain, end: sceneEnd };
