// Chapter 8 URL Shortener (English): scene definitions (shell and helpers from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

// Role colors (fixed across the video): Web=indigo, DB=cyan, cache=amber, ID generator=pink, new/success=lime, client=grey-blue
const C_WEB = SC[1], C_DB = SC[0], C_CACHE = SC[3], C_ID = SC[2], C_OK = SC[4], C_CLI = '#9aa6d6';
const LONG_URL = 'https://en.wikipedia.org/wiki/Systems_design';
const MD5HEX = '5a62509a84df9ee03fe1230b9df8b84e';
const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ───────── helpers ─────────
function tile(x, y, ch, color, { w = 56, h = 68, size = 40, a = 1, s = 1, hl = false } = {}) {
  if (a <= 0 || s <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s);
  glow(color, hl ? 22 : 8); rr(-w / 2, -h / 2, w, h, 12); ctx.fillStyle = color + '28'; ctx.fill();
  ctx.lineWidth = hl ? 3 : 1.8; ctx.strokeStyle = color; ctx.stroke(); ctx.shadowBlur = 0;
  text(ch, 0, size * 0.35, { size, weight: 800, align: 'center', font: MONO });
  ctx.restore();
}
function link(x1, y1, x2, y2, color, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color + '55'; ctx.lineWidth = 3; ctx.setLineDash([8, 8]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function msg(lt, t0, t1, x1, y1, x2, y2, color, label, { dy = -22 } = {}) {
  const p = eIO(P(lt, t0, t1)); if (p <= 0 || p >= 1) return;
  packet(x1, y1, x2, y2, p, color, { r: 10 });
  if (label) text(label, lerp(x1, x2, p), lerp(y1, y2, p) + dy, { size: 22, weight: 700, color, font: MONO, align: 'center', a: Math.sin(p * Math.PI) });
}
function polyDot(pts, p, color) {
  const L = []; let tot = 0;
  for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(l); tot += l; }
  const at = (u) => { let d = clamp(u) * tot; for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) { const k = L[i] ? d / L[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], k), lerp(pts[i][1], pts[i + 1][1], k)]; } d -= L[i]; } return pts[pts.length - 1]; };
  if (p <= 0 || p >= 1) return;
  for (let k = 5; k >= 0; k--) { const [x, y] = at(p - k * 0.025); dot(x, y, 10 * (1 - k * 0.12), color, { g: k ? 0 : 20, a: (1 - k / 6) * 0.9 }); }
}
function polyLine(pts, color, a = 1, dash = [8, 8]) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color + '55'; ctx.lineWidth = 3; ctx.setLineDash(dash);
  ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
}
function steps(lt, list, cues, y0 = 430) {
  let cur = -1; cues.forEach((t, i) => { if (lt >= t) cur = i; });
  list.forEach((s, i) => {
    const a = eOut(P(lt, cues[i], cues[i] + 0.6)); if (a <= 0) return;
    bullet(i, s, a, { y0, size: 28, color: i === cur ? INK : MUTE });
  });
}
const tw = (s, size, font = MONO, weight = 500) => { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; const w = ctx.measureText(s).width; ctx.restore(); return w; };

// ───────── Title ─────────
function sceneTitle(lt) {
  text('SYSTEM DESIGN INTERVIEW', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a: eOut(P(lt, 0.2, 1.2)) });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 100px ${SANS}`; ctx.letterSpacing = '2px';
  let fs = 100; const w0 = ctx.measureText('URL Shortener').width; if (w0 > 860) fs = Math.floor(100 * 860 / w0);
  ctx.font = `900 ${fs}px ${SANS}`; ctx.fillStyle = g; ctx.fillText('URL Shortener', 106, 520); ctx.restore();
  text('Animated walkthrough', 112, 590, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('Chapter 8', 112, 680, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
  const a1 = eOut(P(lt, 0.6, 1.4));
  glass(1010, 330, 800, 84, { a: a1, accent: C_CLI });
  text(LONG_URL, 1040, 384, { size: 28, font: MONO, color: MUTE, a: a1 });
  arrow(1410, 430, 1410, 490, { color: C_ID, p: eOut(P(lt, 1.8, 2.5)), g: 10 });
  text('Base62', 1440, 470, { size: 24, font: MONO, color: C_ID, a: eOut(P(lt, 2.0, 2.6)) });
  const code = 'zn9edcu';
  [...code].forEach((c, i) => { const p = eBack(P(lt, 2.6 + i * 0.22, 3.2 + i * 0.22)); tile(1090 + i * 88, 520, c, SC[i % 5], { w: 74, h: 92, size: 52, s: p, a: clamp(p * 2) }); });
}

// ───────── Scene 1: how many characters ─────────
function sceneScale(lt) {
  header(lt, '01', 'How long a code?', SC[1], 'Capacity sets the length');
  const cards = [['100 M', 'per day', SC[0], 1.4], ['365', 'days', SC[1], 3.2], ['10', 'years', SC[2], 4.8]];
  cards.forEach(([v, l, c, t0], i) => {
    const a = eOut(P(lt, t0, t0 + 0.7)), x = 800 + i * 260;
    glass(x, 190, 200, 110, { a, accent: c });
    text(v, x + 100, 250, { size: 46, weight: 800, font: MONO, align: 'center', color: c, a });
    text(l, x + 100, 286, { size: 22, color: MUTE, align: 'center', a });
    if (i < 2) text('×', x + 230, 258, { size: 40, color: MUTE, align: 'center', a });
  });
  const ra = eBack(P(lt, 6.9, 7.7));
  text('=', 1550, 258, { size: 40, color: MUTE, align: 'center', a: clamp(ra) });
  if (ra > 0.02) { ctx.save(); ctx.translate(1590 + 125, 245); ctx.scale(ra, ra); ctx.translate(-1715, -245); glass(1590, 190, 250, 110, { accent: C_OK }); text('365 bn', 1715, 250, { size: 46, weight: 800, font: MONO, align: 'center', color: C_OK }); text('records', 1715, 286, { size: 22, color: MUTE, align: 'center' }); ctx.restore(); }
  statCard(110, 430, 640, 'Ten-year total', '365 billion', { color: C_OK, a: eOut(P(lt, 7.6, 8.3)) });
  statCard(110, 570, 640, 'Character set', '62', { color: SC[1], a: eOut(P(lt, 16.3, 17.0)), note: '10 + 26 + 26' });
  // character set
  const lab = eOut(P(lt, 10.2, 10.8));
  text('Short-code characters', 800, 392, { size: 24, color: MUTE, a: lab });
  const rows = [[0, 10, SC[0], 10.9], [10, 36, SC[1], 12.3], [36, 62, SC[2], 14.2]];
  rows.forEach(([s0, s1, c, tb], r) => {
    for (let i = s0; i < s1; i++) {
      const j = i - s0, t0 = tb + (j / (s1 - s0)) * 1.2, p = eBack(P(lt, t0, t0 + 0.35));
      tile(800 + j * 40, 412 + r * 56, ALPHA[i], c, { w: 36, h: 44, size: 24, s: p, a: clamp(p * 2) });
    }
  });
  text('0–9 · a–z · A–Z', 1230, 446, { size: 22, color: MUTE, font: MONO, a: eOut(P(lt, 15.2, 15.8)) });
  // bars: 6 vs 7 characters
  const bx = 930, bw = 480, full = 35216;
  const bars = [['6 chars', 568, '56.8 billion  too few', RED, 18.6], ['7 chars', 35216, '3.5 trillion  fits', C_OK, 23.6]];
  const ba = eOut(P(lt, 17.6, 18.4));
  text('Possible codes', 800, 650, { size: 24, color: MUTE, a: ba });
  bars.forEach(([l, v, vt, c, t0], i) => {
    const y = 690 + i * 80, p = eOut(P(lt, t0, t0 + 1.2));
    text(l, 800, y + 28, { size: 26, weight: 800, font: MONO, color: c, a: ba });
    ctx.save(); ctx.globalAlpha *= ba; rr(bx, y + 4, bw, 34, 17); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.restore();
    if (p > 0) { ctx.save(); ctx.fillStyle = c; glow(c, 14); rr(bx, y + 4, Math.max(14, (v / full) * bw * p), 34, 17); ctx.fill(); ctx.restore(); }
    text(vt, bx + bw + 20, y + 32, { size: 26, weight: 700, font: MONO, color: c, a: p > 0.2 ? 1 : 0 });
  });
  const mx = bx + bw * (3650 / full), ma = eOut(P(lt, 17.8, 18.6));
  ctx.save(); ctx.globalAlpha *= ma; ctx.setLineDash([6, 6]); ctx.strokeStyle = C_OK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(mx, 680); ctx.lineTo(mx, 848); ctx.stroke(); ctx.restore();
  text('Need 365 billion', mx + 12, 676, { size: 22, color: C_OK, weight: 700, a: ma });
  text('Bars drawn to scale', 800, 880, { size: 20, color: DIM, a: ba });
}

// ───────── Scene 2: hash and truncate ─────────
function sceneHash(lt) {
  header(lt, '02', 'Hash and truncate', SC[1], 'MD5 → first 7 characters');
  const a1 = eOut(P(lt, 0.8, 1.5));
  text('longURL', 800, 196, { size: 22, color: MUTE, font: MONO, a: a1 });
  glass(800, 210, 820, 68, { a: a1, accent: C_CLI });
  text(LONG_URL, 826, 254, { size: 28, font: MONO, a: a1 });
  const a2 = eOut(P(lt, 2.2, 2.9));
  arrow(1000, 286, 1000, 340, { color: C_WEB, p: eOut(P(lt, 1.9, 2.5)), g: 8 });
  box(880, 350, 240, 90, 'MD5', { color: C_WEB, a: a2, size: 34 });
  text('Hashes in the book: CRC32 · MD5 · SHA-1', 1150, 404, { size: 22, color: MUTE, a: eOut(P(lt, 2.8, 3.5)) });
  const n = Math.floor(32 * eIO(P(lt, 3.6, 6.8))), hx = 810, hy = 540, cw = 22.8;
  const cut = eOut(P(lt, 8.0, 8.8));
  if (cut > 0) { ctx.save(); ctx.globalAlpha *= cut; glow(C_CACHE, 18); rr(hx - 8, hy - 42, 7 * cw + 16, 62, 12); ctx.fillStyle = C_CACHE + '2a'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = C_CACHE; ctx.stroke(); ctx.restore(); }
  for (let i = 0; i < n; i++) text(MD5HEX[i], hx + i * cw, hy, { size: 38, weight: 700, font: MONO, color: i < 7 && cut > 0.5 ? C_CACHE : MUTE });
  text('hexadecimal · 32 digits', hx, hy + 54, { size: 22, color: DIM, a: eOut(P(lt, 6.4, 7.0)) });
  text('first 7', hx + 3.5 * cw, hy - 62, { size: 24, color: C_CACHE, weight: 700, align: 'center', a: cut });
  const sc = eOut(P(lt, 9.4, 10.2));
  if (sc > 0) {
    arrow(hx + 80, hy + 70, hx + 80, hy + 120, { color: C_CACHE, p: sc, g: 8 });
    text('Short code', 1366, 740, { size: 24, color: MUTE, a: sc });
    [...MD5HEX.slice(0, 7)].forEach((c, i) => { const p = eBack(P(lt, 9.6 + i * 0.12, 10.2 + i * 0.12)); tile(880 + i * 68, 690, c, C_CACHE, { w: 60, h: 76, size: 44, s: p, a: clamp(p * 2) }); });
  }
  statCard(110, 430, 640, 'Values per hex digit', '16', { color: SC[0], a: eOut(P(lt, 10.8, 11.5)) });
  statCard(110, 570, 640, '7 hex digits', '268 million', { color: RED, a: eOut(P(lt, 14.2, 14.9)), note: '16⁷' });
  statCard(110, 710, 640, 'Needed in ten years', '365 billion', { color: C_OK, a: eOut(P(lt, 18.0, 18.7)) });
  text('Note: in practice, take more hash bits, convert to Base62, then keep 7 characters', 800, 880, { size: 22, color: MUTE, a: eOut(P(lt, 21.8, 22.6)) });
}

// ───────── Scene 3: collisions and retries ─────────
function sceneCollide(lt) {
  header(lt, '03', 'Collisions, retried', RED, 'What if the code is taken?');
  steps(lt, ['1  Hash it, look it up', '2  Already taken = collision', '3  Append a string, rehash', '4  Repeat until a free slot'], [1.5, 5.0, 7.6, 12.6]);
  const da = eOut(P(lt, 0.6, 1.3));
  glass(1360, 190, 480, 250, { a: da, accent: C_DB });
  text('Database (illustrative)', 1384, 226, { size: 22, color: C_DB, weight: 700, a: da });
  text('shortURL', 1384, 268, { size: 20, color: MUTE, font: MONO, a: da }); text('longURL', 1560, 268, { size: 20, color: MUTE, font: MONO, a: da });
  const flashA = P(lt, 5.0, 6.5) < 1 && lt > 5.0 ? 1 - P(lt, 5.0, 6.5) : 0;
  if (flashA > 0) { ctx.save(); ctx.globalAlpha *= flashA; rr(1372, 282, 456, 48, 10); ctx.fillStyle = RED + '44'; ctx.fill(); ctx.restore(); }
  text('5a62509', 1384, 316, { size: 26, font: MONO, weight: 700, color: C_CACHE, a: da }); text('example.com/a', 1560, 316, { size: 24, font: MONO, color: MUTE, a: da });
  const ins = eOut(P(lt, 14.4, 15.0));
  text('9f3c2e1', 1384, 372, { size: 26, font: MONO, weight: 700, color: C_OK, a: ins }); text('example.com/b', 1560, 372, { size: 24, font: MONO, color: MUTE, a: ins });
  const c1 = eOut(P(lt, 2.0, 2.8));
  glass(800, 190, 480, 130, { a: c1, accent: C_CLI });
  text('New long URL B (illustrative)', 826, 228, { size: 22, color: MUTE, a: c1 });
  text('hash(B) → 5a62509', 826, 280, { size: 30, font: MONO, weight: 700, a: c1 });
  link(1280, 255, 1360, 300, C_DB, c1);
  msg(lt, 3.4, 4.4, 1280, 255, 1370, 305, C_DB, '');
  const bad = eBack(P(lt, 5.0, 5.7));
  if (bad > 0.02) badge(1000, 331, 'Taken: collision', RED, clamp(bad));
  const c2 = eOut(P(lt, 8.0, 8.8));
  glass(800, 410, 480, 130, { a: c2, accent: C_CACHE });
  text('Append a preset string, rehash', 826, 448, { size: 22, color: C_CACHE, a: c2 });
  const h2 = '9f3c2e1', k2 = Math.floor(7 * P(lt, 10.0, 11.0)), lead = 'hash(B + preset) → ';
  text(lead, 826, 500, { size: 24, font: MONO, weight: 700, a: c2 });
  text(h2.slice(0, k2), 826 + tw(lead, 24, MONO, 700) + 6, 500, { size: 28, font: MONO, weight: 800, color: C_OK, a: c2 });
  link(1280, 475, 1360, 380, C_DB, c2);
  msg(lt, 12.0, 13.0, 1280, 475, 1370, 385, C_DB, '');
  const good = eBack(P(lt, 13.3, 14.0));
  if (good > 0.02) badge(1000, 555, 'Free, usable', C_OK, clamp(good));
  const ba = eOut(P(lt, 14.8, 15.6));
  glass(800, 640, 1040, 240, { a: ba, accent: SC[2] });
  text('Bloom filter: ask it before the database', 830, 686, { size: 26, weight: 700, color: SC[2], a: ba });
  for (let i = 0; i < 20; i++) {
    const lit = [2, 5, 6, 11, 14, 17].includes(i), x = 830 + i * 32;
    ctx.save(); ctx.globalAlpha *= ba; rr(x, 712, 26, 26, 6); ctx.fillStyle = lit ? SC[2] + '88' : 'rgba(255,255,255,0.07)'; ctx.fill(); ctx.restore();
  }
  const r1 = eOut(P(lt, 17.0, 17.8)), r2 = eOut(P(lt, 20.2, 21.0));
  glass(830, 770, 460, 80, { a: r1, accent: C_OK, r: 18 });
  text('"Definitely not present"', 856, 806, { size: 24, weight: 700, color: C_OK, a: r1 }); text('Use it, skip one lookup', 856, 836, { size: 22, color: MUTE, a: r1 });
  glass(1320, 770, 490, 80, { a: r2, accent: C_CACHE, r: 18 });
  text('"Possibly present"', 1346, 806, { size: 24, weight: 700, color: C_CACHE, a: r2 }); text('Still check the DB; not proof', 1346, 836, { size: 22, color: MUTE, a: r2 });
}

// ───────── Scene 4: Base62 step by step ─────────
function sceneBase62(lt) {
  header(lt, '04', 'Base62 conversion', SC[3], 'Approach 2: unique ID → base 62');
  const ID = 2009215674938n; const rows = []; { let n = ID; while (n > 0n) { rows.push({ n, q: n / 62n, r: Number(n % 62n) }); n /= 62n; } }
  const ia = eOut(P(lt, 2.4, 3.2));
  statCard(110, 430, 640, 'Unique ID (book example)', '2009215674938', { color: C_ID, a: ia });
  text('Digits: 0–9 → 0–9   a–z → 10–35   A–Z → 36–61', 110, 590, { size: 22, color: MUTE, a: eOut(P(lt, 11.0, 11.8)) });
  const fa = eOut(P(lt, 15.0, 15.8));
  glass(110, 640, 640, 130, { a: fa, accent: C_OK });
  text('Remainders, read in reverse', 140, 686, { size: 22, color: MUTE, a: fa });
  text('zn9edcu', 140, 745, { size: 56, weight: 800, font: MONO, color: C_OK, a: fa });
  const ha = eOut(P(lt, 5.4, 6.2));
  text('Divide by 62, again and again', 800, 200, { size: 24, color: MUTE, a: ha });
  ['Dividend', 'Quotient', 'Remainder', 'Char'].forEach((s, i) => text(s, [1010, 1330, 1540, 1700][i], 230, { size: 20, color: DIM, align: i ? 'center' : 'right', a: ha }));
  rows.forEach((o, i) => {
    const t0 = 6.4 + i * 0.6, a = eOut(P(lt, t0, t0 + 0.5)); if (a <= 0) return;
    const y = 290 + i * 56, ch = ALPHA[o.r], hot = lt > t0 && lt < t0 + 1.2;
    glass(800, y - 36, 1040, 50, { r: 14, a, accent: hot ? SC[3] : null, fill: hot ? 0.1 : 0.04 });
    text(String(o.n), 1010, y, { size: 28, font: MONO, weight: 700, align: 'right', a });
    text('÷ 62 =', 1090, y, { size: 24, font: MONO, color: MUTE, a });
    text(String(o.q), 1330, y, { size: 28, font: MONO, align: 'center', color: o.q === 0n ? DIM : INK, a });
    text(`rem ${o.r}`, 1540, y, { size: 26, font: MONO, align: 'center', color: SC[3], weight: 700, a });
    tile(1672, y - 36, ch, SC[3], { w: 56, h: 50, size: 30, a, s: 1, hl: hot });
  });
  const rev = [...rows].reverse();
  const ra = eOut(P(lt, 14.0, 14.6));
  text('Read bottom to top', 800, 706, { size: 24, color: C_OK, weight: 700, a: ra });
  rev.forEach((o, i) => {
    const t0 = 14.6 + i * 0.3, p = eBack(P(lt, t0, t0 + 0.5)), sx = 1672 + 28, sy = 290 + (rows.length - 1 - i) * 56 - 11;
    const x = 800 + i * 80, y = 730, e = eIO(P(lt, t0, t0 + 0.6));
    tile(lerp(sx - 28, x, e), lerp(sy - 25, y, e), ALPHA[o.r], C_OK, { w: 68, h: 84, size: 46, a: p > 0.02 ? 1 : 0, hl: true });
  });
}

// ───────── Scene 5: comparison ─────────
function sceneCompare(lt) {
  header(lt, '05', 'Which one to pick', SC[0], 'No absolute winner');
  const hx = 980, bx = 1420, cw = 420;
  const ha = eOut(P(lt, 0.5, 1.2));
  glass(hx, 190, cw, 90, { a: ha, accent: C_WEB }); text('Hash truncation', hx + cw / 2, 248, { size: 30, weight: 700, color: C_WEB, align: 'center', a: ha });
  glass(bx, 190, cw, 90, { a: ha, accent: C_ID }); text('Base62 encoding', bx + cw / 2, 248, { size: 30, weight: 700, color: C_ID, align: 'center', a: ha });
  const R = [
    ['Length', ['Can be fixed', 1, 1.6], ['Grows with ID; pad', 0, 2.0]],
    ['ID generator', ['Not needed', 1, 3.6], ['Required', -1, 12.6]],
    ['Collisions', ['Possible; must handle', -1, 6.0], ['None if IDs unique', 1, 9.0]],
    ['Guessability', ['Hard to predict', 1, 15.4], ['Guessable if sequential', -1, 16.2]],
  ];
  const col = (g) => (g > 0 ? C_OK : g < 0 ? RED : MUTE);
  R.forEach(([lab, L, Rr], i) => {
    const y = 310 + i * 124;
    const la = eOut(P(lt, Math.min(L[2], Rr[2]) - 0.4, Math.min(L[2], Rr[2]) + 0.2));
    text(lab, 960, y + 62, { size: 26, color: MUTE, weight: 600, align: 'right', a: la });
    [[L, hx], [Rr, bx]].forEach(([c, x]) => {
      const a = eOut(P(lt, c[2], c[2] + 0.6)); if (a <= 0) return;
      glass(x, y, cw, 100, { a, accent: c[1] ? col(c[1]) : null });
      dot(x + 30, y + 50, 7, col(c[1]), { g: 12, a });
      text(c[0], x + 54, y + 60, { size: 26, weight: 600, a });
    });
  });
  const sa = eOut(P(lt, 17.2, 18.0));
  glass(110, 430, 640, 230, { a: sa, accent: SC[0] });
  text('Interview answer (book note)', 140, 476, { size: 22, color: MUTE, a: sa });
  text('Unique ID + Base62', 140, 536, { size: 36, weight: 800, a: sa });
  text('DB unique index as backstop', 140, 590, { size: 30, weight: 600, color: C_OK, a: sa });
  text('Redirect path: cache, then DB', 140, 636, { size: 26, color: MUTE, a: sa });
}

// ───────── Scene 6: create flow ─────────
function sceneWrite(lt) {
  header(lt, '06', 'Creating a link', C_OK, 'POST /api/v1/data/shorten');
  steps(lt, ['1  Look up the long URL', '2  Found → return old code', '3  Else ask the ID generator', '4  Convert the ID to Base62', '5  Store <id, code, long URL>'], [2.8, 6.2, 10.0, 13.0, 15.6]);
  const na = (t) => eOut(P(lt, t, t + 0.6));
  box(800, 230, 210, 110, 'Client', { color: C_CLI, a: na(0.4) });
  box(1160, 230, 250, 110, 'Shortener', { color: C_WEB, a: na(0.6), sub: 'Web' });
  dbIcon(1580, 200, 150, 150, 'Database', { color: C_DB, a: na(0.8) });
  box(1160, 560, 250, 110, 'ID generator', { color: C_ID, a: na(9.6), size: 28 });
  arrow(1010, 285, 1160, 285, { color: DIM, p: na(0.8), w: 3 }); arrow(1410, 285, 1580, 285, { color: DIM, p: na(0.8), w: 3 });
  arrow(1285, 345, 1285, 560, { color: DIM, p: na(9.6), w: 3 });
  msg(lt, 1.0, 1.9, 1010, 270, 1160, 270, C_CLI, 'longUrl', { dy: -24 });
  msg(lt, 2.8, 3.8, 1410, 270, 1580, 270, C_WEB, 'exists?', { dy: -24 });
  const hit = eOut(P(lt, 5.0, 5.6));
  if (hit > 0 && lt < 10.0) text('If found', 1655, 440, { size: 24, weight: 700, color: C_OK, align: 'center', a: hit * (1 - P(lt, 8.8, 9.6)) });
  msg(lt, 6.2, 7.1, 1160, 305, 1010, 305, C_OK, 'old code', { dy: 36 });
  const miss = eOut(P(lt, 9.6, 10.2));
  if (miss > 0) text('Otherwise', 1655, 440, { size: 24, weight: 700, color: C_CACHE, align: 'center', a: miss * (lt < 15 ? 1 : 0.4) });
  msg(lt, 10.6, 11.4, 1260, 345, 1260, 560, C_WEB, 'get ID', { dy: 0 });
  msg(lt, 11.7, 12.6, 1320, 560, 1320, 345, C_ID, '', {});
  const idA = eOut(P(lt, 12.1, 12.7));
  if (idA > 0) text('2009215674938', 1285, 710, { size: 26, font: MONO, weight: 700, color: C_ID, align: 'center', a: idA });
  const pa = eOut(P(lt, 13.2, 13.9));
  if (pa > 0) {
    glass(800, 520, 310, 190, { a: pa, accent: SC[3] });
    text('Base62', 955, 560, { size: 24, weight: 700, color: SC[3], align: 'center', a: pa });
    text('2009215674938', 955, 604, { size: 26, font: MONO, align: 'center', color: MUTE, a: pa });
    arrow(955, 618, 955, 648, { color: SC[3], p: eOut(P(lt, 13.8, 14.4)), head: 10, w: 3 });
    const k = Math.floor(7 * P(lt, 14.4, 15.4));
    text('zn9edcu'.slice(0, k), 955, 692, { size: 40, font: MONO, weight: 800, color: C_OK, align: 'center', a: pa });
  }
  msg(lt, 15.8, 16.8, 1410, 300, 1580, 300, C_OK, 'store', { dy: 40 });
  const sv = eOut(P(lt, 16.8, 17.5));
  glass(1500, 470, 340, 90, { a: sv, accent: C_OK, r: 18 });
  text('<id, zn9edcu, long URL>', 1670, 524, { size: 22, font: MONO, weight: 700, color: C_OK, align: 'center', a: sv });
  msg(lt, 18.4, 19.4, 1160, 320, 1010, 320, C_OK, 'zn9edcu', { dy: 34 });
}

// ───────── Scene 7: redirect flow ─────────
function sceneRead(lt) {
  header(lt, '07', 'Redirect: cache first', C_CACHE, 'GET /api/v1/shortUrl');
  const na = (t) => eOut(P(lt, t, t + 0.6));
  box(800, 230, 210, 110, 'Browser', { color: C_CLI, a: na(0.4) });
  box(1130, 230, 250, 110, 'Shortener', { color: C_WEB, a: na(0.6), sub: 'Web' });
  box(1520, 230, 260, 110, 'Cache', { color: C_CACHE, a: na(0.8) });
  dbIcon(1570, 540, 160, 150, 'Database', { color: C_DB, a: na(1.0) });
  box(800, 560, 210, 110, 'Target site', { color: C_CLI, a: na(1.2), size: 26 });
  arrow(1010, 265, 1130, 265, { color: DIM, p: na(0.8), w: 3 }); arrow(1380, 265, 1520, 265, { color: DIM, p: na(0.8), w: 3 });
  arrow(1250, 345, 1590, 540, { color: DIM, p: na(1.0), w: 3 }); arrow(905, 345, 905, 560, { color: DIM, p: na(1.2), w: 3, dash: [8, 8] });
  statCard(110, 700, 640, 'Reads : writes', '10 : 1', { color: C_CACHE, a: eOut(P(lt, 16.3, 17.0)), note: 'optimize redirects' });
  steps(lt, ['1  Click → check the cache', '2  Miss → query the database', '3  Put the result in the cache', '4  Return the redirect'], [3.0, 6.7, 9.4, 11.4], 440);
  msg(lt, 3.0, 3.9, 1010, 265, 1130, 265, C_CLI, 'click', { dy: -24 });
  msg(lt, 4.3, 5.2, 1380, 265, 1520, 265, C_WEB, 'lookup', { dy: -24 });
  const miss = eBack(P(lt, 5.2, 5.8));
  if (miss > 0.02) badge(1540, 360, 'Miss', RED, clamp(miss) * (1 - P(lt, 9.8, 10.2)));
  msg(lt, 6.8, 7.7, 1260, 345, 1585, 540, C_WEB, 'query DB', { dy: 0 });
  msg(lt, 7.9, 8.8, 1610, 540, 1290, 345, C_DB, 'longURL', { dy: 0 });
  msg(lt, 9.4, 10.2, 1380, 305, 1520, 305, C_OK, 'fill', { dy: 36 });
  const fill = eOut(P(lt, 10.2, 10.8));
  if (fill > 0) badge(1540, 360, 'Cached', C_OK, fill * (1 - P(lt, 14.6, 15.1)));
  msg(lt, 11.5, 12.4, 1130, 305, 1010, 305, C_WEB, '302 + URL', { dy: 36 });
  msg(lt, 12.8, 13.8, 905, 345, 905, 560, C_CLI, 'visit', { dy: 0 });
  const t2 = 14.6;
  const a2 = eOut(P(lt, t2 - 0.4, t2));
  if (a2 > 0) text('Next click', 930, 450, { size: 24, color: MUTE, a: a2 });
  msg(lt, t2, t2 + 0.7, 1010, 265, 1130, 265, C_CLI, '', {});
  msg(lt, t2 + 0.8, t2 + 1.5, 1380, 265, 1520, 265, C_WEB, '', {});
  const hit = eBack(P(lt, t2 + 1.5, t2 + 2.1));
  if (hit > 0.02) badge(1540, 360, 'Hit: no DB query', C_OK, clamp(hit));
}

// ───────── Scene 8: 301 vs 302 ─────────
function lane(lt, y, code, title, color, t1, t2, cached) {
  glass(800, y, 1040, 340, { accent: color, a: eOut(P(lt, 0.4, 1.0)) });
  text(title, 830, y + 56, { size: 30, weight: 800, color, a: eOut(P(lt, 0.5, 1.1)) });
  const bx = 840, sx = 1250, lx = 1610, by = y + 130;
  box(bx, by, 210, 100, 'Browser', { color: C_CLI, size: 30, a: eOut(P(lt, 0.7, 1.3)) });
  box(sx, by, 210, 100, 'Shortener', { color: C_WEB, size: 30, a: eOut(P(lt, 0.8, 1.4)) });
  box(lx, by, 200, 100, 'Long URL', { color: C_CLI, size: 30, a: eOut(P(lt, 0.9, 1.5)) });
  arrow(bx + 210, by + 30, sx, by + 30, { color: DIM, w: 3, head: 10 }); arrow(sx, by + 70, bx + 210, by + 70, { color: DIM, w: 3, head: 10 });
  const bypass = [[bx + 105, by + 100], [bx + 105, y + 290], [lx + 100, y + 290], [lx + 100, by + 100]];
  polyLine(bypass, color, 0.9);
  let count = 0;
  [t1, t2].forEach((t, k) => {
    const via = k === 0 || !cached;
    if (via) {
      msg(lt, t, t + 0.8, bx + 210, by + 30, sx, by + 30, '#ffffff', 'click', { dy: -24 });
      msg(lt, t + 0.9, t + 1.7, sx, by + 70, bx + 210, by + 70, color, code, { dy: 38 });
      if (lt >= t + 0.8) count++;
      polyDot(bypass, P(lt, t + 1.9, t + 3.0), color);
    } else {
      polyDot(bypass, P(lt, t, t + 1.2), '#ffffff');
    }
  });
  if (cached && lt > t1 + 1.7) { const a = eOut(P(lt, t1 + 1.7, t1 + 2.3)); badge(840, y + 66, 'Cached → long URL', color, a); }
  text(`Requests: ${count}`, sx + 105, by - 14, { size: 24, font: MONO, weight: 800, color: count ? color : DIM, align: 'center' });
  return count;
}
function sceneRedirect(lt) {
  header(lt, '08', '301 or 302', SC[2], 'One status code, one metric');
  bullet(0, '301 permanent: may be cached', eOut(P(lt, 3.0, 3.6)), { size: 28, color: SC[3] });
  bullet(1, '302 temporary: every click counts', eOut(P(lt, 15.0, 15.6)), { size: 28, color: SC[0] });
  lane(lt, 190, '301', '301 · Permanent redirect', SC[3], 5.0, 8.6, true);
  lane(lt, 550, '302', '302 · Temporary redirect', SC[0], 15.4, 18.4, false);
  statCard(110, 580, 640, '301: server sees', '1 request', { color: SC[3], a: eOut(P(lt, 11.6, 12.3)), note: '2 clicks' });
  statCard(110, 710, 640, '302: server sees', '2 requests', { color: SC[0], a: eOut(P(lt, 20.2, 20.9)), note: '2 clicks' });
  text('Cache headers matter too; clicks ≠ requests', 110, 870, { size: 22, color: MUTE, a: eOut(P(lt, 21.8, 22.5)) });
}

// ───────── Summary ─────────
function sceneEnd(lt) {
  text('URL Shortener', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Chapter 8 recap', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [...'zn9edcu'].forEach((c, i) => { const p = eBack(P(lt, 0.6 + i * 0.12, 1.2 + i * 0.12)); tile(1300 + i * 72, 190, c, SC[i % 5], { w: 62, h: 80, size: 44, s: p, a: clamp(p * 2) }); });
  [['Unique', ['Guarantee uniqueness when creating', 'Base62 encodes; hashing can collide'], SC[4], 3.0], ['Cache first', ['Reads dominate: check the cache,', 'then the database'], SC[3], 9.6], ['301 / 302', ['Depends on whether you need', 'click stats, and on cache headers'], SC[2], 13.0]].forEach(([w, parts, c, t0], k) => {
    const p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 270, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 60, weight: 800 });
    parts.forEach((q, j) => text(q, x + 36, 620 + j * 38, { size: 24, color: MUTE }));
    ctx.restore();
  });
}

export const meta = { no: 8, title: 'URL Shortener', en: 'URL Shortener' };
export const scenes = { title: sceneTitle, scale: sceneScale, hash: sceneHash, collide: sceneCollide, base62: sceneBase62, compare: sceneCompare, write: sceneWrite, read: sceneRead, redirect: sceneRedirect, end: sceneEnd };
