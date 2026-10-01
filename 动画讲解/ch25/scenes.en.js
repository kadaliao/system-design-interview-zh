// Chapter 25 Real-time Gaming Leaderboard (English): scene definitions
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rr, glass, text, glow, dot, badge, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 25, title: 'Real-time Gaming Leaderboard', en: 'Real-time Gaming Leaderboard' };

// ───────── helpers ─────────
function fit(s, x, y, maxW, o = {}) {
  let size = o.size || 32; const min = o.min || 20;
  ctx.save();
  while (size > min) { ctx.font = `${o.weight || 500} ${size}px ${o.font || SANS}`; if (ctx.measureText(s).width <= maxW) break; size--; }
  ctx.restore();
  text(s, x, y, { ...o, size });
}
// Left-column heading with auto-shrinking title (English runs wider)
function header(lt, num, title, accent, sub) {
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  fit(title, 108, 262, 640, { size: 70, weight: 800, min: 44 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) fit(sub, 110, 336, 640, { size: 26, color: MUTE, min: 22 });
  ctx.restore();
}
const withA = (a, f) => { if (a <= 0.001) return; ctx.save(); ctx.globalAlpha *= a; f(); ctx.restore(); };
const tw = (s, size, weight = 700, font = MONO) => { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; const w = ctx.measureText(s).width; ctx.restore(); return w; };

/** 榜单行：lab 位置/名次，name 玩家，score 分数 */
function lbRow(x, y, w, h, { lab = '', name = '', score = '', color = SC[0], a = 1, hl = false, dim = 1, size = 26, labW = 78 } = {}) {
  withA(a * dim, () => {
    if (hl) glow(color, 22);
    rr(x, y, w, h, 14); ctx.fillStyle = hl ? color + '2a' : 'rgba(255,255,255,0.055)'; ctx.fill();
    ctx.lineWidth = hl ? 3 : 1.5; ctx.strokeStyle = hl ? color : 'rgba(255,255,255,0.12)'; ctx.stroke(); ctx.shadowBlur = 0;
    text(String(lab), x + 20, y + h / 2 + 9, { size, weight: 700, font: MONO, color: hl ? color : MUTE });
    text(name, x + labW + 20, y + h / 2 + 9, { size, weight: hl ? 800 : 600, font: MONO, color: hl ? INK : INK });
    text(String(score), x + w - 22, y + h / 2 + 9, { size, weight: 800, font: MONO, align: 'right', color: hl ? color : INK });
  });
}
/** 命令条 */
function cmd(x, y, s, a = 1, { color = SC[0], size = 26, h = 54 } = {}) {
  const w = tw(s, size) + 44;
  withA(a, () => {
    glass(x, y, w, h, { r: 16, accent: color });
    text(s, x + 22, y + h / 2 + size * 0.34, { size, weight: 700, font: MONO, color });
  });
  return w;
}
const pulse = (x, y, p, color, r0 = 20, r1 = 80) => {
  if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, eOut(p)), 0, 7); ctx.stroke(); ctx.restore();
};

// ───────── Scene 1: full-table sort in a relational DB ─────────
const SQLR = [['u_7301', 320], ['mary1934', 870], ['u_1188', 510], ['u_9042', 990], ['u_2250', 150], ['u_6617', 730], ['u_3405', 620], ['u_8821', 260], ['u_5109', 940]];
const SQLS = [...SQLR].sort((a, b) => b[1] - a[1]);
function sceneSql(lt) {
  header(lt, '01', 'Relational DB', SC[1], 'Ranking with ORDER BY');
  bullet(0, 'Top ten: sort by score', eOut(P(lt, 6.2, 6.9)));
  bullet(1, 'No index: scan every row', eOut(P(lt, 8.8, 9.5)));
  bullet(2, 'Middle rank: count again', eOut(P(lt, 15.8, 16.5)), { color: RED });
  statCard(110, 680, 640, 'Players on the board (MAU)', '25M rows', { color: SC[1], a: eOut(P(lt, 3.2, 3.9)) });
  const x = 840, w = 700, y0 = 250, pitch = 62, h = 52;
  const ta = eOut(P(lt, 0.5, 1.4));
  const T2 = 13.3;
  text('user_id', x + 98, 224, { size: 22, color: MUTE, font: MONO, a: ta });
  text('score', x + w - 22, 224, { size: 22, color: MUTE, font: MONO, align: 'right', a: ta });
  text('table leaderboard', x, 188, { size: 24, weight: 700, color: SC[1], font: MONO, a: ta });
  const s1 = P(lt, 6.4, 8.8), sortP = eIO(P(lt, 9.2, 11.2)), s2 = P(lt, T2 + 0.3, 17.6);
  const sortedIdx = (n) => SQLS.findIndex((r) => r[0] === n);
  let cntScan = 0;
  SQLR.forEach(([name, score], i) => {
    const a = eOut(P(lt, 0.7 + i * 0.1, 1.4 + i * 0.1));
    const yy = lerp(y0 + i * pitch, y0 + sortedIdx(name) * pitch, sortP);
    const isM = name === 'mary1934';
    const cur1 = lt > 6.4 && lt < 9.0 ? Math.floor(s1 * 8.99) : -1;
    const scanned1 = lt > 6.4 && lt < 9.0 && i <= cur1;
    const cur2 = lt > T2 ? Math.floor(s2 * 8.99) : -1;
    const si = sortedIdx(name); const hit2 = lt > T2 && si <= cur2 && score > 870;
    const rowLab = sortP >= 1 ? sortedIdx(name) + 1 : '';
    lbRow(x, yy, w, h, { lab: rowLab, name, score, a, color: isM ? SC[3] : hit2 ? RED : SC[1], hl: isM || scanned1 && i === cur1 || (lt > T2 && si === cur2 && s2 < 1), dim: lt > T2 && !isM && !hit2 ? 0.55 : 1, labW: 60 });
    if (hit2) cntScan++;
  });
  if (lt > 6.4 && lt < 9.0) { const i = Math.min(8, Math.floor(s1 * 8.99)); arrow(790, y0 + i * pitch + h / 2, 830, y0 + i * pitch + h / 2, { color: SC[0], w: 5 }); }
  if (lt > T2 && lt < 18.2) { const i = Math.min(8, Math.floor(s2 * 8.99)); const yy = y0 + i * pitch; arrow(790, yy + h / 2, 830, yy + h / 2, { color: SC[0], w: 5 }); }
  withA(eOut(P(lt, 9.0, 9.6)) * (1 - eOut(P(lt, 12.2, 12.8))), () => text('ORDER BY score DESC', x, 850, { size: 28, weight: 700, font: MONO, color: SC[3] }));
  const phase2 = lt > T2 - 0.4;
  const ca = eOut(P(lt, 6.2, 6.9));
  glass(1580, 250, 260, 170, { a: ca, accent: phase2 ? RED : SC[0] });
  text(phase2 ? 'Players above her' : 'Rows scanned', 1604, 296, { size: 22, color: MUTE, a: ca });
  const n1 = lt < 9.0 ? Math.min(9, Math.floor(s1 * 8.99) + 1) : 9;
  const val = phase2 ? cntScan : lt > 6.4 ? n1 : 0;
  text(String(val), 1604, 372, { size: 64, weight: 800, font: MONO, color: phase2 ? RED : SC[0], a: ca });
  const fa = eOut(P(lt, 18.0, 18.8));
  text(`Rank = ${cntScan} + 1 = ${cntScan + 1}`, 1570, 470, { size: 28, weight: 800, font: MONO, color: SC[3], a: fa });
  text('Illustrative: 9 rows stand in for the whole table', x, 880, { size: 22, color: DIM, a: ta });
}

// ───────── Scene 2: hash table + skip list ─────────
const colX = (i) => 850 + i * 60;
const lvY = [700, 600, 500, 400];
const hOf = (i) => (i === 0 ? 4 : Math.min(4, 1 + (Math.log2(i & -i))));
const SKPATH = [[0, 3], [8, 3], [8, 2], [12, 2], [12, 1], [12, 0], [13, 0]];
function sceneSkip(lt) {
  header(lt, '02', 'Redis sorted set', SC[0], 'Hash table + skip list');
  bullet(0, 'Hash table: member → score', eOut(P(lt, 6.8, 7.5)));
  bullet(1, 'Skip list: ordered by score', eOut(P(lt, 9.4, 10.1)));
  bullet(2, 'Sparse index: big jumps first', eOut(P(lt, 17.0, 17.7)));
  const la = [1, eOut(P(lt, 12.6, 13.6)), eOut(P(lt, 13.4, 14.4)), eOut(P(lt, 14.2, 15.2))];
  const base = eOut(P(lt, 0.8, 2.0));
  for (let k = 0; k < 4; k++) {
    const nodes = []; for (let i = 0; i <= 16; i++) if (hOf(i) > k) nodes.push(i);
    withA(la[k] * base, () => {
      ctx.strokeStyle = k === 0 ? 'rgba(255,255,255,0.22)' : SC[0] + '88'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(colX(nodes[0]), lvY[k]); ctx.lineTo(colX(nodes[nodes.length - 1]), lvY[k]); ctx.stroke();
      text(`L${k}`, 800, lvY[k] + 8, { size: 20, color: MUTE, font: MONO });
    });
  }
  for (let i = 1; i <= 16; i++) {
    const top = hOf(i) - 1; if (top < 1) continue;
    const a = la[Math.min(top, 3)] * base;
    withA(a, () => { ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(colX(i), lvY[top]); ctx.lineTo(colX(i), lvY[0]); ctx.stroke(); ctx.setLineDash([]); });
  }
  for (let i = 0; i <= 16; i++) {
    for (let k = 0; k < hOf(i); k++) {
      const a = la[k] * base * (k === 0 ? eOut(P(lt, 1.0 + i * 0.04, 1.6 + i * 0.04)) : 1);
      withA(a, () => {
        rr(colX(i) - 22, lvY[k] - 22, 44, 44, 10); ctx.fillStyle = '#0b0f1c'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = k === 0 ? 'rgba(255,255,255,0.4)' : SC[0]; ctx.stroke();
        if (k === 0) text(i === 0 ? 'H' : String(i), colX(i), lvY[0] + 8, { size: 22, weight: 700, font: MONO, align: 'center', color: i === 13 && lt > 16.4 ? SC[3] : INK });
        else if (k >= 1) { ctx.fillStyle = SC[0]; ctx.globalAlpha *= 0.55; rr(colX(i) - 8, lvY[k] - 8, 16, 16, 4); ctx.fill(); }
      });
    }
  }
  const ha = eOut(P(lt, 6.6, 7.4));
  withA(ha, () => {
    glass(840, 190, 520, 110, { accent: SC[2] });
    text('Hash table', 866, 232, { size: 22, color: MUTE });
    text('mary1934 → 99', 866, 276, { size: 32, weight: 800, font: MONO, color: SC[2] });
  });
  const ta = eOut(P(lt, 16.4, 17.2));
  withA(ta, () => { glow(SC[3], 18); ctx.strokeStyle = SC[3]; ctx.lineWidth = 4; rr(colX(13) - 28, lvY[0] - 28, 56, 56, 12); ctx.stroke(); ctx.shadowBlur = 0; text('Target 13', colX(13), lvY[0] + 66, { size: 24, weight: 700, color: SC[3], font: MONO, align: 'center' }); });
  // plain list: one step at a time
  const s = P(lt, 19.9, 25.0) * 13;
  if (lt > 19.8 && lt < 25.8) {
    const f = Math.floor(s), fr = s - f, a = clamp(1 - P(lt, 25.2, 25.8));
    withA(a, () => {
      ctx.strokeStyle = SC[3]; ctx.lineWidth = 6; glow(SC[3], 12); ctx.beginPath(); ctx.moveTo(colX(0), lvY[0]); ctx.lineTo(lerp(colX(f), colX(Math.min(13, f + 1)), fr), lvY[0]); ctx.stroke(); ctx.shadowBlur = 0;
      dot(lerp(colX(f), colX(Math.min(13, f + 1)), fr), lvY[0], 12, SC[3], { g: 22 });
    });
  }
  // skip list: big jumps then small steps
  const segLen = []; let tot = 0;
  for (let i = 0; i < SKPATH.length - 1; i++) { const [a, b] = [SKPATH[i], SKPATH[i + 1]]; const l = Math.hypot(colX(b[0]) - colX(a[0]), lvY[b[1]] - lvY[a[1]]); segLen.push(l); tot += l; }
  const u = eIO(P(lt, 17.6, 22.0));
  let hops = 0;
  if (lt > 17.5) {
    let rem = u * tot, px = colX(0), py = lvY[3];
    const pts = [[colX(0), lvY[3]]];
    for (let i = 0; i < segLen.length; i++) {
      const [a, b] = [SKPATH[i], SKPATH[i + 1]]; const frac = clamp(rem / segLen[i]);
      const ex = lerp(colX(a[0]), colX(b[0]), frac), ey = lerp(lvY[a[1]], lvY[b[1]], frac);
      pts.push([ex, ey]); px = ex; py = ey;
      if (frac >= 0.999 && b[0] !== a[0]) hops++;
      rem -= segLen[i]; if (rem <= 0) break;
    }
    ctx.save(); ctx.strokeStyle = SC[4]; ctx.lineWidth = 6; ctx.lineJoin = 'round'; glow(SC[4], 12); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
    dot(px, py, 12, SC[4], { g: 24 });
  }
  const aA = 1 - eOut(P(lt, 25.0, 25.6));
  statCard(110, 580, 640, 'Plain list (illustrative)', `${Math.min(13, Math.floor(s))} steps`, { color: SC[3], a: eOut(P(lt, 19.7, 20.3)) * aA });
  statCard(110, 710, 640, 'Skip list (illustrative)', `${hops} hops`, { color: SC[4], a: eOut(P(lt, 17.5, 18.1)) * aA });
  const bA = eOut(P(lt, 25.5, 26.2));
  statCard(110, 580, 640, 'Plain list · 64 nodes', '62 steps', { color: RED, a: bA });
  statCard(110, 710, 640, 'Skip list · 64 nodes', '~11 steps', { color: SC[4], a: bA });
  text('Illustrative: 16 nodes drawn; the book uses 64', 840, 880, { size: 22, color: DIM, a: base });
}

// ───────── Scene 3: the four commands ─────────
const CMDS = [
  ['ZADD', 'Insert a member, or set its score', 'O(log N) / item', SC[0], 3.0],
  ['ZINCRBY', 'Add to a score; starts at 0 if absent', 'O(log N)', SC[3], 6.1],
  ['ZREVRANGE', 'Read a rank range (high to low)', 'O(log N + M)', SC[2], 8.0],
  ['ZREVRANK', 'Position of one member (from 0)', 'O(log N)', SC[1], 11.6],
];
function sceneCmds(lt) {
  header(lt, '03', 'Four commands', SC[2], 'Enough for a whole board');
  bullet(0, 'Update, lookup: logarithmic', eOut(P(lt, 14.7, 15.4)));
  bullet(1, 'Range read: log + items read', eOut(P(lt, 17.5, 18.2)));
  text('N = members · M = items returned', 110, 580, { size: 24, color: MUTE, font: MONO, a: eOut(P(lt, 17.5, 18.2)) });
  CMDS.forEach(([c, d, cx, col, t0], i) => {
    const y = 190 + i * 180, a = eOut(P(lt, t0, t0 + 0.7));
    withA(a, () => {
      ctx.translate(40 * (1 - a), 0);
      glass(830, y, 1010, 150, { accent: col });
      ctx.fillStyle = col; glow(col, 16); rr(858, y + 28, 6, 94, 3); ctx.fill(); ctx.shadowBlur = 0;
      text(c, 890, y + 74, { size: 44, weight: 800, font: MONO, color: col });
      text(d, 890, y + 120, { size: 26, color: MUTE });
    });
    const pt = i === 2 ? 17.5 : 14.7 + i * 0.25;
    const pa = eOut(P(lt, pt, pt + 0.6));
    withA(pa, () => { glass(1470, y + 44, 330, 62, { r: 18, accent: i === 2 ? SC[3] : SC[4], fill: 0.1 }); text(cx, 1635, y + 87, { size: cx.length > 14 ? 26 : 30, weight: 800, font: MONO, align: 'center', color: i === 2 ? SC[3] : SC[4] }); });
  });
}

// ───────── Scene 4: score changes, the entry moves (core) ─────────
const ORDERS = [
  ['alice', 'bob', 'carol', 'dave', 'eric', 'mary1934', 'frank'],
  ['alice', 'bob', 'carol', 'dave', 'mary1934', 'eric', 'frank'],
  ['alice', 'bob', 'carol', 'mary1934', 'dave', 'eric', 'frank'],
  ['alice', 'bob', 'mary1934', 'carol', 'dave', 'eric', 'frank'],
];
const BASE = { alice: 105, bob: 103, carol: 102, dave: 101, eric: 100, mary1934: 99, frank: 97 };
const WINS = [3.9, 7.9, 11.7];
function sceneMove(lt) {
  header(lt, '04', 'Ranks follow scores', SC[3], 'ZINCRBY: add one point');
  bullet(0, 'ZINCRBY: add; starts at 0', eOut(P(lt, 1.2, 1.9)));
  bullet(1, 'Entry finds its new place', eOut(P(lt, 6.3, 7.0)));
  bullet(2, 'Others shift down on their own', eOut(P(lt, 13.5, 14.2)));
  bullet(3, 'No re-sorting of the board', eOut(P(lt, 16.4, 17.1)), { color: SC[4] });
  const y0 = 260, pitch = 74, h = 62, x = 900, w = 900;
  const posOf = (name) => {
    let pos = ORDERS[0].indexOf(name);
    for (let s = 0; s < 3; s++) if (lt >= WINS[s] + 0.9) pos = lerp(ORDERS[s].indexOf(name), ORDERS[s + 1].indexOf(name), eIO(P(lt, WINS[s] + 0.9, WINS[s] + 1.9)));
    return pos;
  };
  const wins = WINS.filter((t) => lt >= t + 0.5).length;
  const ca = eOut(P(lt, 0.8, 1.5));
  text('leaderboard_feb_2021', 840, 182, { size: 24, weight: 700, color: SC[0], font: MONO, a: ca });
  const cs = eOut(P(lt, 1.0, 1.7));
  withA(cs, () => { const cw = cmd(840, 196, "ZINCRBY leaderboard_feb_2021 1 'mary1934'", 1, { color: SC[3], size: 26, h: 52 }); WINS.forEach((t) => pulse(840 + cw / 2, 222, P(lt, t, t + 0.8), SC[3], 40, 130)); });
  for (let i = 0; i < 7; i++) text(String(i + 1), 862, y0 + 8 + i * pitch + h / 2 + 9, { size: 26, weight: 700, font: MONO, color: DIM, a: ca, align: 'center' });
  const names = Object.keys(BASE).filter((n) => n !== 'mary1934'); names.push('mary1934');
  names.forEach((n, k) => {
    const isM = n === 'mary1934';
    const yy = y0 + 8 + posOf(n) * pitch;
    const sc = BASE[n] + (isM ? wins : 0);
    const a = eOut(P(lt, 0.8 + k * 0.1, 1.5 + k * 0.1));
    lbRow(x, yy, w, h, { lab: '', name: n, score: sc, color: SC[3], a, hl: isM, dim: 1, labW: 0 });
  });
  WINS.forEach((t) => {
    const p = P(lt, t + 0.2, t + 1.1); if (p <= 0 || p >= 1) return;
    const yy = y0 + 8 + posOf('mary1934') * pitch;
    text('+1', x + w - 130, yy + h / 2 + 9 - 36 * eOut(p), { size: 30, weight: 800, font: MONO, color: SC[4], a: Math.sin(p * Math.PI) });
  });
  const posM = posOf('mary1934');
  statCard(110, 700, 640, 'mary1934 now ranked', `#${Math.round(posM) + 1}`, { color: SC[3], a: eOut(P(lt, 1.8, 2.5)) });
  text('Illustrative data · ties ordered by member name', 840, 850, { size: 22, color: DIM, a: ca });
}

// ───────── Scene 5: top ten ─────────
const TOP = [['alice', 12543], ['bob', 11500], ['carol', 10870], ['dave', 10420], ['erin', 9980], ['frank', 9650], ['grace', 9310], ['heidi', 8905], ['ivan', 8640], ['judy', 8420], ['kate', 8105], ['leo', 7890]];
function sceneTop10(lt) {
  header(lt, '05', 'Top ten', SC[2], 'ZREVRANGE 0 9');
  bullet(0, 'Positions 0 to 9 = top ten', eOut(P(lt, 2.8, 3.5)));
  bullet(1, 'Already ordered: just read', eOut(P(lt, 6.0, 6.7)));
  statCard(110, 590, 640, 'Complexity', 'O(log N + 10)', { color: SC[4], a: eOut(P(lt, 8.0, 8.7)) });
  cmd(840, 160, 'ZREVRANGE leaderboard_feb_2021 0 9 WITHSCORES', eOut(P(lt, 0.8, 1.5)), { color: SC[2], size: 24, h: 50 });
  const x = 840, w = 880, y0 = 240, pitch = 54, h = 44;
  TOP.forEach(([n, s], i) => {
    const a = eOut(P(lt, 1.2 + i * 0.08, 1.9 + i * 0.08));
    const hl = lt > 2.8 + i * 0.3;
    const inTop = i < 10;
    lbRow(x, y0 + i * pitch, w, h, { lab: i, name: n, score: s, color: SC[2], a, hl: inTop && hl, dim: inTop ? 1 : 0.35, size: 24, labW: 40 });
  });
  const ba = eOut(P(lt, 5.8, 6.6));
  withA(ba, () => {
    ctx.strokeStyle = SC[2]; ctx.lineWidth = 4; glow(SC[2], 14); ctx.beginPath(); ctx.moveTo(1738, y0); ctx.lineTo(1752, y0); ctx.lineTo(1752, y0 + 9 * pitch + h); ctx.lineTo(1738, y0 + 9 * pitch + h); ctx.stroke(); ctx.shadowBlur = 0;
    text('Top 10', 1768, y0 + 4.5 * pitch + 28, { size: 28, weight: 800, color: SC[2] });
  });
}

// ───────── Scene 6: nearby players ─────────
const NEAR = [['nova', 1040], ['orion', 1030], ['pax', 1022], ['quinn', 1015], ['rhea', 1007], ['mary1934', 1000], ['sage', 993], ['tara', 985], ['ula', 978], ['vera', 970], ['wren', 962]];
function sceneNear(lt) {
  header(lt, '06', 'Nearby players', SC[1], 'Position, then four each side');
  bullet(0, 'First: ZREVRANK for position', eOut(P(lt, 1.4, 2.1)));
  bullet(1, 'Then four before, four after', eOut(P(lt, 10.4, 11.1)));
  bullet(2, 'Ends inclusive; clamp at 0', eOut(P(lt, 16.8, 17.5)));
  statCard(110, 640, 640, 'Displayed rank = position + 1', '361 + 1 = 362', { color: SC[3], a: eOut(P(lt, 9.0, 9.7)) });
  text('ZREVRANK gives a 0-based position, not a tied rank', 110, 810, { size: 22, color: MUTE, a: eOut(P(lt, 18.6, 19.4)) });
  cmd(840, 156, 'ZREVRANK leaderboard_feb_2021 mary1934', eOut(P(lt, 1.0, 1.7)), { color: SC[1], size: 24, h: 50 });
  const ans = eBack(P(lt, 6.8, 7.5));
  if (ans > 0.02) { withA(clamp(ans), () => { text('→ 361', 1560, 192, { size: 40, weight: 800, font: MONO, color: SC[3] }); }); }
  cmd(840, 222, 'ZREVRANGE leaderboard_feb_2021 357 365', eOut(P(lt, 10.4, 11.1)), { color: SC[2], size: 24, h: 50 });
  const x = 840, w = 880, y0 = 296, pitch = 50, h = 42;
  const rad = Math.floor(P(lt, 11.6, 14.6) * 4.99);
  NEAR.forEach(([n, s], i) => {
    const pos = 356 + i, a = eOut(P(lt, 1.6 + i * 0.07, 2.3 + i * 0.07));
    const isM = n === 'mary1934';
    const d = Math.abs(i - 5);
    const inWin = d <= 4;
    const found = lt > 7.4;
    const hl = isM && found || (lt > 11.6 && inWin && d <= rad);
    const dimV = lt > 11.6 ? (inWin && d <= rad ? 1 : 0.4) : (found && !isM ? 0.6 : 1);
    lbRow(x, y0 + i * pitch, w, h, { lab: pos, name: n, score: s, color: isM ? SC[3] : SC[2], a, hl, dim: dimV, size: 24, labW: 60 });
  });
  const ma = eOut(P(lt, 7.5, 8.2));
  if (ma > 0) arrow(1770, y0 + 5 * pitch + h / 2, 1735, y0 + 5 * pitch + h / 2, { color: SC[3], w: 5, a: ma });
  const la = eOut(P(lt, 13.4, 14.2));
  withA(la, () => {
    text('357', 1732, y0 + 1 * pitch + 30, { size: 24, weight: 800, font: MONO, color: SC[2] });
    text('365', 1732, y0 + 9 * pitch + 30, { size: 24, weight: 800, font: MONO, color: SC[2] });
    text('361−4', 1786, y0 + 1 * pitch + 30, { size: 20, color: MUTE, font: MONO });
    text('361+4', 1786, y0 + 9 * pitch + 30, { size: 20, color: MUTE, font: MONO });
  });
}

// ───────── Scene 7: monthly key ─────────
function sceneKey(lt) {
  header(lt, '07', 'Monthly seasons', SC[0], 'One month, one board, one key');
  bullet(0, 'One sorted set per month', eOut(P(lt, 3.0, 3.7)));
  bullet(1, 'Updates and reads use it', eOut(P(lt, 9.3, 10.0)));
  bullet(2, 'Month end: archive the old', eOut(P(lt, 13.2, 13.9)));
  bullet(3, 'New month: start empty', eOut(P(lt, 17.4, 18.1)));
  bullet(4, 'APIs must carry the season', eOut(P(lt, 19.0, 19.7)), { color: SC[3] });
  const sa = eOut(P(lt, 0.6, 1.3));
  box(840, 170, 1000, 70, 'Leaderboard service', { color: SC[1], a: sa, size: 26 });
  const fa = eOut(P(lt, 3.0, 3.8)), arch = eIO(P(lt, 14.4, 15.4));
  const fcol = SC[0];
  withA(fa * lerp(1, 0.45, arch), () => {
    glass(840, 330, 440, 300, { accent: fcol });
    text('February', 870, 384, { size: 34, weight: 800 });
    text('leaderboard_feb_2021', 870, 424, { size: 22, weight: 700, font: MONO, color: fcol });
    const bars = [330, 270, 235, 190, 150];
    bars.forEach((b, i) => {
      let add = 0; for (let k = 0; k < 4; k++) if (lt > 9.3 + k * 1.2 + 0.7 && i === [3, 2, 1, 4][k] % 5) add += 14;
      rr(870, 448 + i * 34, 28, 22, 6); ctx.fillStyle = SC[2] + '99'; ctx.fill();
      rr(906, 450 + i * 34, b + add, 18, 8); ctx.fillStyle = fcol; ctx.fill();
    });
  });
  withA(arch, () => text('Archived', 1262, 618, { size: 22, weight: 700, color: MUTE, align: 'right' }));
  for (let k = 0; k < 4; k++) {
    const t0 = 9.3 + k * 1.2;
    const p = P(lt, t0, t0 + 0.7); if (p <= 0 || p >= 1) continue;
    packet(1060, 240, 1060, 330, eIO(p), SC[3], { r: 9 });
    if (k === 0) text('ZINCRBY', 1090, 296, { size: 20, font: MONO, color: SC[3], weight: 700, a: 1 - p });
  }
  arrow(1060, 240, 1060, 328, { color: SC[0] + '88', w: 3, a: fa * (1 - arch) });
  const da = eOut(P(lt, 13.2, 14.0));
  dbIcon(950, 700, 220, 170, 'History store', { color: SC[1], a: da, fill: arch * 0.8 });
  const ap = eIO(P(lt, 14.4, 15.4));
  if (ap > 0) arrow(1060, 632, 1060, 700, { color: SC[1], w: 5, p: ap });
  if (lt > 14.8 && lt < 16.0) packet(1060, 632, 1060, 700, P(lt, 14.8, 16.0), SC[1], { r: 10 });
  const ma = eBack(P(lt, 17.4, 18.2));
  if (ma > 0.02) {
    withA(clamp(ma), () => {
      ctx.translate(1620, 480); ctx.scale(lerp(0.9, 1, clamp(ma)), lerp(0.9, 1, clamp(ma))); ctx.translate(-1620, -480);
      glass(1400, 330, 440, 300, { accent: SC[4] });
      text('March', 1430, 384, { size: 34, weight: 800 });
      text('leaderboard_mar_2021', 1430, 424, { size: 22, weight: 700, font: MONO, color: SC[4] });
      text('Empty · new season', 1620, 540, { size: 32, weight: 700, color: SC[4], align: 'center' });
    });
    arrow(1620, 240, 1620, 328, { color: SC[4], w: 4, p: eOut(P(lt, 18.2, 18.9)) });
  }
}

// ───────── Scene 8: scaling up ─────────
function sceneScale(lt) {
  header(lt, '08', 'Growth: 100×', RED, 'One Redis is no longer enough');
  bullet(0, '650 MB × 100 = 65 GB', eOut(P(lt, 16.2, 16.9)));
  bullet(1, '2,500 × 100 = 250K QPS', eOut(P(lt, 18.2, 18.9)));
  bullet(2, 'Must shard', eOut(P(lt, 20.9, 21.6)), { color: RED });
  const pa = eOut(P(lt, 1.0, 1.8)), pb = eOut(P(lt, 13.0, 13.8));
  const cnt = (v, a, b) => lerp(0, v, eOut(P(lt, a, b)));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  withA(pa, () => {
    glass(830, 230, 420, 520, { accent: SC[0] });
    text('Daily active users', 860, 284, { size: 24, color: MUTE });
    text(`${fmt(cnt(5, 2.0, 3.2))}M`, 860, 358, { size: 64, weight: 800, font: MONO });
    text("Storage (book's estimate)", 860, 428, { size: 22, color: MUTE });
    text(`≈ ${fmt(cnt(650, 4.8, 6.4))} MB`, 860, 482, { size: 44, weight: 800, font: MONO, color: SC[0] });
    text('Peak updates per second', 860, 548, { size: 22, color: MUTE });
    text(`${fmt(cnt(2500, 7.6, 9.4))} QPS`, 860, 602, { size: 44, weight: 800, font: MONO, color: SC[0] });
    box(900, 650, 280, 76, 'Single Redis', { color: SC[0], size: 26 });
  });
  const aa = eOut(P(lt, 12.2, 13.0));
  arrow(1262, 490, 1408, 490, { color: RED, w: 6, p: aa });
  withA(aa, () => text('×100', 1335, 450, { size: 40, weight: 800, font: MONO, color: RED, align: 'center' }));
  withA(pb, () => {
    glass(1420, 230, 420, 520, { accent: RED });
    text('Daily active users', 1450, 284, { size: 24, color: MUTE });
    text(`${fmt(cnt(500, 13.4, 14.8))}M`, 1450, 358, { size: 64, weight: 800, font: MONO });
    text('Storage', 1450, 428, { size: 22, color: MUTE });
    text(`≈ ${fmt(cnt(65, 15.8, 17.2))} GB`, 1450, 482, { size: 44, weight: 800, font: MONO, color: RED });
    text('Peak updates per second', 1450, 548, { size: 22, color: MUTE });
    text(`${fmt(cnt(250000, 17.8, 19.6))} QPS`, 1450, 602, { size: 44, weight: 800, font: MONO, color: RED });
  });
  for (let i = 0; i < 4; i++) {
    const a = eOut(P(lt, 20.9 + i * 0.15, 21.6 + i * 0.15));
    if (a > 0.02) box(1446 + i * 98, 650, 86, 76, `S${i + 1}`, { color: SC[i], size: 22, a, s: 1 });
  }
  const ra = eOut(P(lt, 22.0, 22.8));
  text('The book says “10×”, but 5M → 500M is really 100×', 830, 830, { size: 26, weight: 700, color: RED, a: ra });
  text("Book's simplified estimates; real Redis memory overhead not included", 830, 880, { size: 22, color: DIM, a: ra });
}

// ───────── Scene 9: shard by score range ─────────
const RSH = [
  { x: 840, rng: '[900, 1000]', col: SC[0], sc: [986, 962, 951, 934, 917], tot: 120 },
  { x: 1190, rng: '[800, 900)', col: SC[1], sc: [890, 876, 861, 843, 822], tot: 200 },
  { x: 1540, rng: '[700, 800)', col: SC[2], sc: [788, 774, 761, 742, 725], tot: 340 },
];
function sceneRange(lt) {
  header(lt, '09', 'Score-range shards', SC[0], 'Fixed partitions');
  bullet(0, 'Top ten: ask the top shard', eOut(P(lt, 7.6, 8.3)));
  bullet(1, 'Rank = local + higher shards', eOut(P(lt, 10.6, 11.3)));
  bullet(2, 'Cost: migrate, reroute', eOut(P(lt, 17.4, 18.1)), { color: RED });
  const mig = eIO(P(lt, 17.8, 19.4));
  RSH.forEach((s, k) => {
    const a = eOut(P(lt, 0.8 + k * 0.25, 1.6 + k * 0.25));
    const topHl = lt > 7.6 && lt < 10.4 && k === 0;
    const cntHl = lt > 10.6 && lt < 17.0 && k < 2;
    withA(a, () => {
      glass(s.x, 230, 290, 520, { accent: s.col });
      text(`Shard ${k + 1}`, s.x + 24, 280, { size: 26, weight: 800, color: s.col });
      text(s.rng, s.x + 266, 280, { size: 20, weight: 700, font: MONO, align: 'right', color: MUTE });
    });
    s.sc.forEach((v, i) => {
      const isM = k === 2 && i === 2;
      const ca = eOut(P(lt, 1.4 + k * 0.25 + i * 0.1, 2.0 + k * 0.25 + i * 0.1));
      if (isM && mig > 0) return;
      lbRow(s.x + 24, 306 + i * 56, 242, 46, { lab: '', name: '', score: v, color: isM ? SC[3] : topHl || cntHl ? SC[4] : s.col, a: ca, hl: isM || topHl || cntHl, dim: lt > 7 && !topHl && !cntHl && !isM ? 0.55 : 1, size: 26, labW: 0 });
      if (isM) text('mary', s.x + 38, 306 + i * 56 + 32, { size: 20, color: SC[3], font: MONO, weight: 700, a: ca });
    });
    text('⋮', s.x + 145, 612, { size: 36, color: MUTE, align: 'center', a });
    text(`${s.tot} players`, s.x + 145, 696, { size: 22, color: MUTE, align: 'center', a });
    text('illustrative', s.x + 145, 724, { size: 20, color: DIM, align: 'center', a });
  });
  if (mig > 0) {
    const fx = RSH[2].x + 24, fy = 306 + 2 * 56, tx = RSH[1].x + 24, ty = 306 + 5 * 56 + 4;
    const x = lerp(fx, tx, mig), y = lerp(fy, ty, mig) - Math.sin(mig * Math.PI) * 50;
    lbRow(x, y, 242, 46, { lab: '', name: '', score: mig > 0.5 ? 802 : 761, color: SC[3], hl: true, size: 26, labW: 0 });
    text('mary', x + 14, y + 32, { size: 20, color: SC[3], font: MONO, weight: 700 });
    pulse(x + 121, y + 23, P(lt, 17.8, 18.6), RED, 20, 90);
  }
  const qa = eOut(P(lt, 7.6, 8.2)) * (1 - eOut(P(lt, 10.0, 10.6)));
  withA(qa, () => { text('GET top 10', 985, 200, { size: 26, weight: 800, color: SC[4], align: 'center' }); arrow(985, 206, 985, 228, { color: SC[4], w: 4 }); });
  const fa = eOut(P(lt, 11.4, 12.2)) * (1 - eOut(P(lt, 16.6, 17.2)));
  withA(fa, () => {
    text("mary's global position (illustrative)", 840, 800, { size: 22, color: MUTE });
    text('2 + 120 + 200 = 322', 840, 850, { size: 42, weight: 800, font: MONO, color: SC[3] });
    text('in-shard', 840, 884, { size: 20, color: MUTE }); text('players on higher shards', 960, 884, { size: 20, color: MUTE });
  });
  const ra = eOut(P(lt, 18.0, 18.8));
  text('mary climbs to 802: shard 3 → shard 2, routing must change', 840, 830, { size: 26, weight: 700, color: RED, a: ra });
}

// ───────── Scene 10: hash shards and top-K merge ─────────
const HS = [
  { x: 830, name: 'A', col: SC[0], v: [100, 90, 80, 60] },
  { x: 1026, name: 'B', col: SC[1], v: [95, 85, 75, 55] },
  { x: 1222, name: 'C', col: SC[2], v: [93, 92, 70, 50] },
];
const MERGED = [[100, 0], [95, 1], [93, 2], [92, 2], [90, 0], [85, 1], [80, 0], [75, 1], [70, 2]];
function sceneHash(lt) {
  header(lt, '10', 'Hash sharding', SC[2], 'Top K per shard, then merge');
  bullet(0, 'Each shard returns its top K', eOut(P(lt, 4.4, 5.1)));
  bullet(1, 'Merge, then take the top K', eOut(P(lt, 7.0, 7.7)));
  bullet(2, 'Cost: more shards, more fan-out', eOut(P(lt, 14.3, 15.0)), { color: RED });
  bullet(3, 'Personal rank: ask every shard', eOut(P(lt, 16.8, 17.5)), { color: RED });
  text('hash(user_id) → shard', 830, 200, { size: 24, weight: 700, color: MUTE, font: MONO, a: eOut(P(lt, 0.6, 1.3)) });
  const cutA = eOut(P(lt, 4.6, 5.4));
  const FLY = 5.8;
  const fly = (i) => eIO(P(lt, FLY + i * 0.25, FLY + 1.8 + i * 0.25));
  const idxMerged = (s, r) => MERGED.findIndex((m) => m[1] === s && m[0] === HS[s].v[r]);
  HS.forEach((s, k) => {
    const a = eOut(P(lt, 0.8 + k * 0.2, 1.6 + k * 0.2));
    withA(a, () => { glass(s.x, 250, 176, 440, { accent: s.col }); text(`Shard ${s.name}`, s.x + 88, 292, { size: 28, weight: 800, color: s.col, align: 'center' }); });
    s.v.forEach((v, r) => {
      const ca = eOut(P(lt, 1.6 + k * 0.2 + r * 0.12, 2.2 + k * 0.2 + r * 0.12));
      const home = [s.x + 16, 316 + r * 80];
      const mi = idxMerged(k, r);
      if (r < 3) {
        const f = fly(mi);
        const tgt = [1500, 276 + mi * 58];
        const fp = lt > FLY ? f : 0;
        const x = lerp(home[0], tgt[0], fp), y = lerp(home[1], tgt[1], fp);
        if (fp > 0) lbRow(home[0], home[1], 144, 60, { lab: '', name: '', score: v, color: s.col, a: ca, dim: 0.22, size: 26, labW: 0 });
        const top3 = MERGED.findIndex((m) => m[0] === v) < 3;
        const final = lt > 9.0 && top3;
        lbRow(x, y, fp > 0 ? lerp(144, 320, fp) : 144, fp > 0 ? lerp(60, 46, fp) : 60, { lab: '', name: '', score: v, color: final ? SC[4] : s.col, a: ca, hl: (lt > 4.6 && lt < FLY) || final, dim: lt > 9.0 && !top3 ? 0.4 : 1, size: 26, labW: 0 });
      } else {
        const red = lt > 10.0 && lt < 13.6;
        lbRow(home[0], home[1], 144, 60, { lab: '', name: '', score: v, color: red ? RED : s.col, a: ca, hl: false, dim: lt > 4.6 ? 0.4 : 1, size: 26, labW: 0 });
      }
    });
  });
  withA(cutA, () => { ctx.strokeStyle = SC[3]; ctx.setLineDash([8, 7]); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(822, 543); ctx.lineTo(1404, 543); ctx.stroke(); ctx.setLineDash([]); text('K = 3', 1404, 549, { size: 20, color: SC[3], weight: 700 }); });
  const na = eOut(P(lt, 10.0, 10.8)) * (1 - eOut(P(lt, 13.2, 13.8)));
  withA(na, () => { text("This shard's #4: 3 players already above", 830, 740, { size: 26, weight: 700, color: RED }); text("→ can't make the global top 3", 830, 780, { size: 26, weight: 700, color: RED }); });
  const ma = eOut(P(lt, 5.0, 5.8));
  withA(ma, () => { glass(1480, 232, 360, 600, { accent: SC[4] }); text('Merge · global order', 1504, 264, { size: 22, weight: 700, color: MUTE }); });
  const ga = eOut(P(lt, 9.0, 9.8));
  withA(ga, () => text('Global top 3', 1660, 822, { size: 26, weight: 800, color: SC[4], align: 'center' }));
  text('Illustrative: K = 3 (the book uses K = 10)', 830, 880, { size: 22, color: DIM, a: eOut(P(lt, 1.0, 1.8)) });
}

// ───────── Summary ─────────
function sceneEnd(lt) {
  const ra = eOut(P(lt, 0.6, 1.4));
  [['alice', 12543, 0], ['mary1934', 11980, 1], ['bob', 11500, 2]].forEach(([n, s, i]) => lbRow(1380, 160 + i * 66, 400, 54, { lab: i + 1, name: n, score: s, color: i === 1 ? SC[3] : SC[0], a: ra * 0.6, hl: i === 1, size: 22, labW: 40 }));
  fit('Real-time Gaming Leaderboard', 110, 270, 1220, { size: 72, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  [['Sorted set', 'Ranks move with scores', SC[0], 2.4], ['Monthly key', 'One board per season', SC[3], 5.8], ['Sharding', 'Top-10 merge vs. personal rank', SC[2], 9.5]].forEach(([w, s, c, t0], k) => {
    const p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    fit(w, x + 36, 566, 450, { size: 66, weight: 800, min: 44 });
    fit(s, x + 36, 620, 450, { size: 26, color: MUTE, min: 20 });
    ctx.restore();
  });
  text('Tie-breaking and cross-shard counting: agree the rules with product first', 110, 750, { size: 24, color: MUTE, a: eOut(P(lt, 12.5, 13.3)) });
}

// ───────── Title ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  const names = ['alice', 'bob', 'carol', 'dave', 'mary1934', 'frank'];
  const sc = [105, 103, 102, 101, 99, 97];
  const rise = eIO(P(lt, 3.0, 5.0));
  names.forEach((n, i) => {
    let pos = i; const isM = n === 'mary1934';
    if (isM) pos = lerp(4, 2, rise); else if (i === 2 || i === 3) pos = i + eIO(P(lt, 3.0, 5.0));
    const ra = eOut(P(lt, 0.6 + i * 0.15, 1.4 + i * 0.15));
    lbRow(1260, 230 + pos * 80, 540, 64, { lab: '', name: n, score: sc[i] + (isM && rise > 0.5 ? 3 : 0), color: SC[3], a: ra, hl: isM, labW: 0 });
  });
  text('SYSTEM DESIGN INTERVIEW · ANIMATED GUIDE', 110, 360, { size: 28, weight: 600, color: SC[0], ls: 4, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  const fs = (() => { let f = 104; ctx.font = `900 ${f}px ${SANS}`; while (ctx.measureText('Gaming Leaderboard').width > 1080 && f > 60) { f -= 2; ctx.font = `900 ${f}px ${SANS}`; } return f; })();
  ctx.font = `900 ${fs}px ${SANS}`; ctx.fillStyle = g;
  ctx.fillText('Real-time', 104, 500); ctx.fillText('Gaming Leaderboard', 104, 500 + fs * 1.1); ctx.restore();
  text('Chapter 25', 112, 500 + fs * 1.1 + 90, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

export const scenes = { title: sceneTitle, sql: sceneSql, skip: sceneSkip, cmds: sceneCmds, move: sceneMove, top10: sceneTop10, near: sceneNear, key: sceneKey, scale: sceneScale, range: sceneRange, hash: sceneHash, end: sceneEnd };
