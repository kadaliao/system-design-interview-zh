// Chapter 27 Digital Wallet (English): scene definitions (shell and helpers come from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC,
  rr, glass, text, glow, dot, badge, arrow, box, dbIcon, packet, statCard, bullet, hbar } from '../lib/core.js';

export const meta = { no: 27, title: 'Digital Wallet', en: 'Digital Wallet' };

// Roles: coordinator = indigo, shard 1 (A) = cyan, shard 2 (C) = pink, events = amber, success = lime, failure = RED
const COL_COORD = SC[1], COL_A = SC[0], COL_C = SC[2], COL_EV = SC[3], OK = SC[4];
const F = (lt, a, b) => eOut(P(lt, a, b));
const tween = (v0, v1, lt, t0, t1) => Math.round(lerp(v0, v1, eIO(P(lt, t0, t1))));
const fmt = (n) => n.toLocaleString('en-US');

// Text that shrinks to fit maxW (English runs wider than the layout was drawn for)
function fit(s, x, y, maxW, o = {}) {
  let size = o.size || 32; const min = o.min || 20;
  ctx.save();
  while (size > min) { ctx.font = `${o.weight || 500} ${size}px ${o.font || SANS}`; if (ctx.measureText(s).width <= maxW) break; size--; }
  ctx.restore();
  text(s, x, y, { ...o, size });
}
// Left-column heading with a fitted title
function header(lt, num, title, accent, sub) {
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  fit(title, 108, 262, 640, { size: 70, weight: 800, min: 46 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) fit(sub, 110, 336, 640, { size: 26, color: MUTE, min: 22 });
  ctx.restore();
}

// ───────── shard card / labelled packet ─────────
function shardCard(x, y, w, h, title, sub, color, { a = 1, bal = null, balColor = INK, op = null, opColor = INK, status = null, statusColor = MUTE, hot = false } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  glass(x, y, w, h, { accent: hot ? RED : color });
  ctx.fillStyle = hot ? RED : color; glow(hot ? RED : color, 16); rr(x + 28, y, w - 56, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
  text(title, x + 30, y + 52, { size: 30, weight: 800, color: hot ? RED : color });
  text(sub, x + w - 28, y + 52, { size: 22, color: MUTE, align: 'right', font: MONO });
  if (bal != null) text(`$${bal}`, x + w / 2, y + 140, { size: 72, weight: 800, font: MONO, color: balColor, align: 'center' });
  if (op) text(op, x + w / 2, y + h - 66, { size: 26, weight: 700, font: MONO, color: opColor, align: 'center' });
  if (status) text(status, x + w / 2, y + h - 24, { size: 24, weight: 600, color: statusColor, align: 'center' });
  ctx.restore();
}
function lpacket(x1, y1, x2, y2, p, label, color, { dy = -26 } = {}) {
  if (p <= 0 || p >= 1) return;
  packet(x1, y1, x2, y2, p, color, { r: 10, trail: 0.2 });
  text(label, lerp(x1, x2, p), lerp(y1, y2, p) + dy, { size: 24, weight: 700, color, font: MONO, align: 'center' });
}
const CO = { x: 1000, y: 170, w: 460, h: 100 };
const SA = { x: 850, y: 400, w: 380, h: 260 };
const SCc = { x: 1420, y: 400, w: 380, h: 260 };
const aTop = [1040, 400], cTop = [1610, 400], coL = [1100, 270], coR = [1360, 270];
const down = (side) => (side === 'A' ? [coL[0], coL[1], aTop[0], aTop[1]] : [coR[0], coR[1], cTop[0], cTop[1]]);
const up = (side) => { const d = down(side); return [d[2] + 56, d[3], d[0] + 56, d[1]]; };
function link(side, a = 1) {
  const d = down(side), u = up(side);
  arrow(d[0], d[1], d[2], d[3], { color: 'rgba(255,255,255,0.18)', w: 2.5, head: 10, a });
  arrow(u[0], u[1], u[2], u[3], { color: 'rgba(255,255,255,0.12)', w: 2.5, head: 10, a });
}
function coordinator(a = 1, label = 'Wallet service (coordinator)', hot = false) {
  box(CO.x, CO.y, CO.w, CO.h, label, { color: COL_COORD, a, hot, size: 26 });
}
function cross(x, y, color = RED, s = 22, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round'; glow(color, 14);
  ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); ctx.restore();
}
function tick(x, y, color = OK, s = 18, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; glow(color, 14);
  ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.3, y + s * 0.8); ctx.lineTo(x + s, y - s * 0.8); ctx.stroke(); ctx.restore();
}
function ring(x, y, p, color, r0 = 30, r1 = 100) {
  if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, p), 0, 7); ctx.stroke(); ctx.restore();
}

// ───────── Title ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  text('SYSTEM DESIGN INTERVIEW · ANIMATED GUIDE', 110, 360, { size: 26, weight: 600, color: SC[0], ls: 4, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 112px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('Digital Wallet', 104, 520); ctx.restore();
  text('Chapter 27', 112, 640, { size: 34, weight: 700, a: F(lt, 1.2, 2) });
  dbIcon(1000, 330, 190, 220, 'Shard 1', { color: COL_A, a: F(lt, 0.6, 1.4), fill: 0.7 });
  dbIcon(1560, 330, 190, 220, 'Shard 2', { color: COL_C, a: F(lt, 0.8, 1.6), fill: 0.4 });
  for (let i = 0; i < 4; i++) {
    const p = ((lt * 0.35 + i / 4) % 1);
    const x = lerp(1210, 1540, p), y = 440 - Math.sin(p * Math.PI) * 70;
    dot(x, y, 14, COL_EV, { g: 22, a: F(lt, 1.8, 2.6) * Math.sin(p * Math.PI) });
  }
  for (let i = 0; i < 6; i++) {
    const x = 1000 + i * 125, ea = F(lt, 4.4 + i * 0.25, 5 + i * 0.25);
    glass(x, 690, 105, 60, { r: 14, a: ea, accent: COL_EV });
    text(`E${i + 1}`, x + 52, 729, { size: 26, weight: 800, font: MONO, color: COL_EV, align: 'center', a: ea });
  }
}

// ───────── 1 Scale: 1M TPS -> number of nodes ─────────
function sceneScale(lt) {
  header(lt, '01', 'Why Shard', SC[1], 'One million transfers per second');
  statCard(110, 390, 640, 'Target throughput', '1,000,000 TPS', { color: SC[1], a: F(lt, 1.0, 1.7), h: 104 });
  statCard(110, 508, 640, 'Per node (book assumption)', '≈ 1,000 TPS', { color: SC[0], a: F(lt, 4.2, 4.9), h: 104 });
  const nodes = tween(0, 1000, lt, 9.1, 10.9);
  statCard(110, 626, 640, 'Nodes needed', `${fmt(nodes)} nodes`, { color: SC[3], a: F(lt, 8.9, 9.6), h: 104 });
  statCard(110, 744, 640, 'Account ops (two legs)', `${fmt(tween(0, 2000000, lt, 15.8, 18.0))} /sec`, { color: SC[2], a: F(lt, 15.4, 16.1), h: 104 });
  // node grid (illustrative: only 40 drawn)
  const ga = 1 - F(lt, 19.4, 20.2);
  if (ga > 0) {
    for (let i = 0; i < 40; i++) {
      const c = i % 10, r = Math.floor(i / 10), t0 = 5.2 + i * 0.1;
      const p = eBack(P(lt, t0, t0 + 0.5));
      if (p > 0.02) dbIcon(830 + c * 100, 190 + r * 105, 56, 66, '', { color: SC[0], a: clamp(p * 2) * ga });
    }
    text('Each cylinder = one database node (illustrative: 40 of 1,000)', 830, 628, { size: 24, color: MUTE, a: F(lt, 9.4, 10.2) * ga });
  }
  // the two legs of one transfer
  const la = F(lt, 11.0, 11.8);
  text('1 transfer', 830, 690, { size: 28, weight: 700, a: la });
  const w1 = badge(1020, 654, 'Debit  A −$1', COL_A, F(lt, 11.4, 12.2));
  badge(1020 + w1 + 24, 654, 'Credit  C +$1', COL_C, F(lt, 13.7, 14.5));
  text('= 2 account operations ⇒ about 2 million per second', 830, 770, { size: 30, weight: 700, color: SC[2], a: F(lt, 17.4, 18.2) });
  // table: per-node TPS -> node count
  const ta = F(lt, 19.6, 20.4);
  if (ta > 0) {
    text('More TPS per node, fewer nodes', 830, 210, { size: 26, color: MUTE, a: ta });
    [['100', '20,000'], ['1,000', '2,000'], ['10,000', '200']].forEach(([t, n], k) => {
      const y = 240 + k * 100, ra = F(lt, 19.8 + k * 0.4, 20.6 + k * 0.4), hl = k === 1;
      glass(830, y, 760, 80, { a: ra, accent: hl ? SC[3] : null, r: 18 });
      text(`${t} TPS`, 870, y + 52, { size: 32, weight: 700, font: MONO, a: ra });
      text('→', 1130, y + 52, { size: 30, color: MUTE, a: ra });
      text(`${n} nodes`, 1190, y + 52, { size: 34, weight: 800, font: MONO, color: hl ? SC[3] : INK, a: ra });
    });
    text('So: accounts must spread across many shards', 830, 590, { size: 30, weight: 700, color: COL_C, a: F(lt, 21.4, 22.2) });
  }
}

// ───────── 2 Atomicity: two legs across shards ─────────
function sceneAtomic(lt) {
  header(lt, '02', 'Cross-Shard Atomicity', RED, 'Debit then credit = two writes');
  coordinator(F(lt, 0.6, 1.2));
  const sa = F(lt, 2.4, 3.2);
  link('A', sa); link('C', sa);
  const dT = 7.2;                 // debit lands
  const crashed = lt > 12.8;
  const aBal = tween(10, 9, lt, dT, dT + 0.6);
  shardCard(SA.x, SA.y, SA.w, SA.h, 'A', 'Shard 1', COL_A, { a: sa, bal: aBal, balColor: lt > dT ? SC[3] : INK, op: lt > dT ? '−$1  deducted' : null, opColor: SC[3], status: lt > dT + 0.2 ? 'Committed locally' : 'Account A', statusColor: MUTE });
  shardCard(SCc.x, SCc.y, SCc.w, SCc.h, 'C', 'Shard 2', COL_C, { a: sa, bal: 5, op: crashed ? '+$1  never arrived' : null, opColor: RED, status: crashed ? 'Balance unchanged' : 'Account C', statusColor: crashed ? RED : MUTE, hot: crashed && lt > 13.4 });
  text('Illustrative balances', 1000, 700, { size: 20, color: DIM, a: sa });
  // packets
  const d = down('A'), d2 = down('C');
  lpacket(d[0], d[1], d[2], d[3], P(lt, 6.2, dT), '−1', SC[3]);
  const fx = lerp(d2[0], d2[2], 0.55), fy = lerp(d2[1], d2[3], 0.55);
  lpacket(d2[0], d2[1], fx, fy, P(lt, 9.0, 11.8), '+1', SC[3]);
  if (lt > 11.8) {
    cross(fx, fy, RED, 24, F(lt, 11.9, 12.4));
    ring(fx, fy, P(lt, 11.9, 12.9), RED, 20, 90);
    text('Failure / timeout', fx + 40, fy + 10, { size: 26, weight: 700, color: RED, a: F(lt, 12.4, 13.0) });
  }
  bullet(0, 'A on shard 1, C on shard 2', F(lt, 2.8, 3.5));
  bullet(1, 'Debit A, then credit C: 2 writes', F(lt, 8.4, 9.0));
  bullet(2, 'Failure midway: money vanishes', F(lt, 14.4, 15.0), { color: RED });
  const lost = lt > 14.4;
  statCard(110, 640, 640, 'Total of both accounts (illustrative)', `$${lt > dT ? Math.round(lerp(15, 14, P(lt, dT, dT + 0.6))) : 15}`, { color: lost ? RED : SC[1], a: F(lt, 4.4, 5.1), note: lost ? 'Lost $1' : '' });
  const ba = F(lt, 16.8, 17.6);
  if (ba > 0) {
    glass(840, 760, 960, 100, { a: ba, accent: OK });
    text('Both legs succeed, or neither happens', 1320, 825, { size: 40, weight: 800, color: OK, align: 'center', a: ba });
  }
}

// ───────── 3 Two-phase commit ─────────
function sceneTwoPC(lt) {
  header(lt, '03', 'Two-Phase Commit', SC[1], 'Ask first, then commit together');
  const crash = lt > 21.2;
  coordinator(F(lt, 0.6, 1.2), crash ? 'Coordinator crashed' : 'Wallet service (coordinator)', crash);
  const sa = F(lt, 1.0, 1.8);
  link('A', sa); link('C', sa);
  const prep = lt > 5.6, commit = lt > 10.4;
  const st = commit ? 'Committed' : prep ? 'Prepared · locked' : 'Waiting';
  const col = commit ? OK : prep ? SC[3] : MUTE;
  shardCard(SA.x, SA.y, SA.w, SA.h, 'A', 'Shard 1', COL_A, { a: sa, bal: commit ? 9 : 10, op: prep ? (commit ? 'COMMIT' : 'PREPARE') : null, opColor: col, status: st, statusColor: col });
  shardCard(SCc.x, SCc.y, SCc.w, SCc.h, 'C', 'Shard 2', COL_C, { a: sa, bal: commit ? 6 : 5, op: prep ? (commit ? 'COMMIT' : 'PREPARE') : null, opColor: col, status: st, statusColor: col });
  const p1 = F(lt, 3.4, 4.0), p2 = F(lt, 8.8, 9.4);
  text('Phase 1', 850, 720, { size: 24, color: lt < 9.0 ? SC[3] : DIM, weight: 700, font: MONO, a: p1 });
  text('Prepare', 965, 720, { size: 26, weight: 700, color: lt < 9.0 ? INK : DIM, a: p1 });
  text('Phase 2', 1130, 720, { size: 24, color: lt > 9.0 ? OK : DIM, weight: 700, font: MONO, a: p2 });
  text('Commit', 1245, 720, { size: 26, weight: 700, color: INK, a: p2 });
  ['A', 'C'].forEach((s) => {
    const d = down(s), u = up(s);
    lpacket(d[0], d[1], d[2], d[3], P(lt, 4.4, 5.6), 'prepare', SC[3]);
    lpacket(u[0], u[1], u[2], u[3], P(lt, 6.8, 8.0), 'yes', OK, { dy: 40 });
    lpacket(d[0], d[1], d[2], d[3], P(lt, 9.2, 10.4), 'commit', OK);
  });
  // lock timeline
  const ta = F(lt, 13.4, 14.1);
  if (ta > 0) {
    text('Lock timeline', 850, 800, { size: 22, color: MUTE, a: ta });
    ctx.save(); ctx.globalAlpha *= ta; rr(850, 816, 950, 28, 14); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    const w = 950 * P(lt, 13.6, 17.8) * 0.62;
    ctx.fillStyle = SC[3]; glow(SC[3], 12); rr(850, 816, Math.max(w, 28), 28, 14); ctx.fill(); ctx.restore();
    text('Locks held from prepare until commit', 850, 884, { size: 24, weight: 600, color: SC[3], a: F(lt, 15.0, 15.8) });
  }
  if (crash) {
    cross(CO.x + CO.w + 40, CO.y + 50, RED, 20, F(lt, 21.2, 21.7));
    ring(CO.x + CO.w + 40, CO.y + 50, P(lt, 21.2, 22.2), RED);
    text('Participants must keep holding locks, waiting', 850, 762, { size: 24, color: RED, weight: 700, a: F(lt, 22.0, 22.8) });
  }
  bullet(0, 'Prepare: everyone says yes first', F(lt, 4.6, 5.2));
  bullet(1, 'Commit: everyone commits together', F(lt, 9.2, 9.8));
  statCard(110, 640, 640, 'Drawback 1', 'Lock contention', { color: SC[3], a: F(lt, 18.3, 19.0), h: 100 });
  statCard(110, 760, 640, 'Drawback 2', 'Coordinator SPOF', { color: RED, a: F(lt, 21.2, 21.9), h: 100 });
}

// ───────── 4 TC/C: Try - Confirm - Cancel ─────────
function sceneTCC(lt) {
  header(lt, '04', 'TC/C Compensation', SC[2], 'Try · Confirm · Cancel');
  coordinator(F(lt, 0.6, 1.2));
  const sa = F(lt, 1.0, 1.8);
  link('A', sa); link('C', sa);
  const R2 = 18.6;                 // round 2 (all succeed) starts here
  const r2 = lt >= R2, u = lt - R2;
  let aBal = 10, cBal = 5, opA = null, opC = null, opColA = INK, opColC = INK, stA = '', stC = '', phase = 0, hotC = false;
  if (!r2) {
    if (lt > 5.2) { opA = 'Try: −$1'; opC = 'Try: NOP'; opColA = SC[3]; opColC = MUTE; phase = 1; aBal = tween(10, 9, lt, 7.0, 7.6); }
    if (lt > 7.8) stA = 'Local txn committed ✓';
    if (lt > 13.3) { stC = 'Response failed ✗'; hotC = true; opColC = RED; }
    if (lt > 15.2) { phase = 3; opA = 'Cancel: +$1'; opC = 'Cancel: NOP'; opColA = SC[2]; opColC = MUTE; stA = ''; }
    if (lt > 16.6) aBal = tween(9, 10, lt, 16.6, 17.3);
    if (lt > 17.4) stA = 'Rolled back ✓';
  } else {
    phase = 1;
    opA = 'Try: −$1'; opC = 'Try: NOP'; opColA = SC[3]; opColC = MUTE;
    aBal = tween(10, 9, lt, 18.9, 19.4);
    if (u > 1.0) { stA = 'Local txn committed ✓'; stC = 'Response OK ✓'; }
    if (u > 1.9) { phase = 2; opA = 'Confirm: NOP'; opC = 'Confirm: +$1'; opColA = MUTE; opColC = OK; stA = ''; stC = ''; }
    if (u > 2.9) cBal = tween(5, 6, lt, R2 + 2.9, R2 + 3.5);
    if (u > 3.4) { stC = 'Credited ✓'; stA = 'Debited ✓'; }
  }
  shardCard(SA.x, SA.y, SA.w, SA.h, 'A', 'Shard 1', COL_A, { a: sa, bal: aBal, balColor: aBal === 9 ? SC[3] : INK, op: opA, opColor: opColA, status: stA, statusColor: stA.includes('✓') ? OK : MUTE });
  shardCard(SCc.x, SCc.y, SCc.w, SCc.h, 'C', 'Shard 2', COL_C, { a: sa, bal: cBal, balColor: cBal === 6 ? OK : INK, op: opC, opColor: opColC, status: stC, statusColor: stC.includes('failed') ? RED : OK, hot: hotC });
  const dA = down('A'), dC = down('C'), uA = up('A'), uC = up('C');
  if (!r2) {
    lpacket(dA[0], dA[1], dA[2], dA[3], P(lt, 5.2, 6.4), 'Try −1', SC[3]);
    lpacket(dC[0], dC[1], dC[2], dC[3], P(lt, 5.2, 6.4), 'Try NOP', MUTE);
    lpacket(uA[0], uA[1], uA[2], uA[3], P(lt, 8.0, 9.2), 'OK', OK);
    const x = lerp(uC[0], uC[2], 0.5), y = lerp(uC[1], uC[3], 0.5);
    cross(x, y, RED, 22, F(lt, 13.3, 13.8)); ring(x, y, P(lt, 13.3, 14.3), RED, 18, 80);
    lpacket(dA[0], dA[1], dA[2], dA[3], P(lt, 15.2, 16.4), 'Cancel', SC[2]);
    lpacket(dC[0], dC[1], dC[2], dC[3], P(lt, 15.2, 16.4), 'Cancel', SC[2]);
  } else {
    lpacket(dA[0], dA[1], dA[2], dA[3], P(u, 0.1, 1.0), 'Try −1', SC[3]);
    lpacket(dC[0], dC[1], dC[2], dC[3], P(u, 0.1, 1.0), 'Try NOP', MUTE);
    lpacket(uA[0], uA[1], uA[2], uA[3], P(u, 1.0, 1.8), 'OK', OK);
    lpacket(uC[0], uC[1], uC[2], uC[3], P(u, 1.0, 1.8), 'OK', OK);
    lpacket(dA[0], dA[1], dA[2], dA[3], P(u, 1.9, 2.9), 'Confirm', OK);
    lpacket(dC[0], dC[1], dC[2], dC[3], P(u, 1.9, 2.9), 'Confirm', OK);
  }
  const lab = !r2 ? 'Case 1: C fails to respond → Cancel' : 'Case 2: everything succeeds → Confirm';
  text(lab, 850, 722, { size: 28, weight: 700, color: !r2 ? RED : OK, a: lt > 5.0 ? 1 : 0 });
  text('Illustrative balances', 850, 770, { size: 20, color: DIM, a: sa });
  [['Try', 'Reserve: A debits locally', SC[3], 1], ['Confirm', 'Confirm: C credits locally', OK, 2], ['Cancel', 'Cancel: A adds it back', SC[2], 3]].forEach(([n, s, c, k], i) => {
    const y = 400 + i * 100, on = phase === k, a = F(lt, 3.0 + i * 0.5, 3.8 + i * 0.5);
    glass(110, y, 640, 82, { a, accent: on ? c : null, fill: on ? 0.14 : 0.04, r: 20 });
    text(n, 140, y + 54, { size: 32, weight: 800, color: on ? c : MUTE, font: MONO, a });
    text(s, 350, y + 53, { size: 26, weight: 600, color: on ? INK : DIM, a });
  });
  const oa = F(lt, 24.0, 24.8);
  glass(110, 720, 640, 100, { a: oa, accent: SC[3] });
  text('Debit first, credit second', 140, 782, { size: 38, weight: 800, color: SC[3], a: oa });
}

// ───────── 5 Saga: linear steps + reverse compensation ─────────
function sceneSaga(lt) {
  header(lt, '05', 'Saga', SC[3], 'Step by step, compensate backwards');
  box(1040, 170, 420, 96, 'Orchestrator', { color: COL_COORD, a: F(lt, 19.2, 20.0), size: 30, sub: 'coordinator' });
  const S1 = { x: 850, y: 340 }, S2 = { x: 1370, y: 340 }, W_ = 430, H_ = 170;
  const ba = F(lt, 2.8, 3.6);
  const s1ok = lt > 6.2;
  const bal = lt > 17.0 ? tween(9, 10, lt, 17.1, 17.9) : tween(10, 9, lt, 5.3, 6.0);
  glass(S1.x, S1.y, W_, H_, { a: ba, accent: s1ok ? COL_A : null });
  text('① Debit A −$1', S1.x + 28, S1.y + 52, { size: 32, weight: 800, color: COL_A, a: ba });
  text('Shard 1 · local txn', S1.x + 28, S1.y + 92, { size: 22, color: MUTE, font: MONO, a: ba });
  text(`A = $${bal}`, S1.x + 28, S1.y + 144, { size: 44, weight: 800, font: MONO, a: ba, color: bal === 9 ? SC[3] : INK });
  if (s1ok) tick(S1.x + W_ - 50, S1.y + 120, OK, 20, F(lt, 6.2, 6.7));
  const fail = lt > 11.6;
  glass(S2.x, S2.y, W_, H_, { a: ba, accent: fail ? RED : null });
  text('② Credit C +$1', S2.x + 28, S2.y + 52, { size: 32, weight: 800, color: COL_C, a: ba });
  text('Shard 2 · local txn', S2.x + 28, S2.y + 92, { size: 22, color: MUTE, font: MONO, a: ba });
  text(fail ? 'Failed ✗' : lt > 7.4 ? 'Running…' : 'Pending', S2.x + 28, S2.y + 144, { size: 40, weight: 800, color: fail ? RED : lt > 7.4 ? SC[3] : DIM, a: ba });
  if (fail) { cross(S2.x + W_ - 50, S2.y + 120, RED, 20, F(lt, 11.6, 12.1)); ring(S2.x + W_ - 50, S2.y + 120, P(lt, 11.6, 12.6), RED); }
  arrow(S1.x + W_ + 8, S1.y + 85, S2.x - 8, S2.y + 85, { color: OK, p: eOut(P(lt, 6.6, 7.4)), a: ba, g: 8 });
  if (lt > 7.0 && lt < 11.6) lpacket(S1.x + W_ + 8, S1.y + 85, S2.x - 8, S2.y + 85, P(lt, 7.4, 9.0), '', SC[3]);
  // compensation row
  const ca = F(lt, 12.9, 13.6);
  if (ca > 0) {
    ctx.save(); ctx.globalAlpha *= ca; ctx.setLineDash([10, 8]); ctx.lineWidth = 2.5; ctx.strokeStyle = SC[2]; glow(SC[2], 10);
    rr(S1.x, 600, W_, 150, 22); ctx.stroke(); ctx.restore();
    text('Undo ①: A +$1', S1.x + 28, 660, { size: 30, weight: 800, color: SC[2], a: ca });
    text('Reverses step 1', S1.x + 28, 704, { size: 24, color: MUTE, a: ca });
    arrow(S2.x + 80, S2.y + H_ + 6, S1.x + W_ - 40, 596, { color: SC[2], p: eOut(P(lt, 13.4, 16.4)), a: ca, g: 8, dash: [10, 8] });
    if (lt > 18.0) tick(S1.x + W_ - 50, 672, OK, 20, F(lt, 18.0, 18.5));
  }
  text('Compensation is a new business action: it can fail too, so retry and alert', 850, 800, { size: 24, color: MUTE, a: F(lt, 18.8, 19.6) });
  bullet(0, 'Operations lined up in order', F(lt, 3.0, 3.6));
  bullet(1, 'Each step: its own local txn', F(lt, 8.8, 9.4));
  bullet(2, 'Failure: compensate backwards', F(lt, 12.4, 13.0), { color: SC[2] });
  badge(110, 640, 'Orchestration: one coordinator leads', COL_COORD, F(lt, 19.4, 20.2));
  text('Choreography: services react to events, logic scattered', 110, 740, { size: 24, color: DIM, a: F(lt, 21.8, 22.6) });
}

// ───────── 6 Comparison ─────────
function sceneCompare(lt) {
  header(lt, '06', 'Comparing the Three', COL_COORD, 'Where the trade-offs are');
  const X0 = 810, LW = 160, CW = 290, Y0 = 190, RH = 118;
  const cols = [['Two-phase commit', '2PC', COL_COORD], ['TC/C', 'Try·Confirm·Cancel', SC[2]], ['Saga', 'orchestrated', SC[3]]];
  cols.forEach(([n, s, c], k) => {
    const a = F(lt, 0.9 + k * 0.3, 1.6 + k * 0.3), x = X0 + LW + k * CW;
    glass(x + 6, Y0, CW - 12, 100, { a, accent: c, r: 20 });
    fit(n, x + CW / 2, Y0 + 46, CW - 36, { size: 32, weight: 800, align: 'center', color: c, a, min: 22 });
    text(s, x + CW / 2, Y0 + 82, { size: 20, align: 'center', color: MUTE, font: MONO, a });
  });
  const rows = [
    ['Shape', [['One logical', 'transaction'], ['Local transactions', 'per phase'], ['A chain of local', 'transactions']], 2.2],
    ['Failure', [['Abort all', 'transactions'], ['Cancel', 'compensation'], ['Reverse', 'compensation']], 10.4],
    ['Order', [['Coordinator', 'drives it'], ['Any order,', 'can run parallel'], ['Linear,', 'no parallelism']], 14.7],
    ['In between', [['Locks held', 'after prepare'], ['Partial state', 'visible'], ['Partial state', 'visible']], 22.7],
  ];
  rows.forEach(([lab, cells, t0], r) => {
    const y = Y0 + 124 + r * RH, ra = F(lt, t0, t0 + 0.8);
    text(lab, X0 + 6, y + 62, { size: 26, weight: 700, color: MUTE, a: ra });
    cells.forEach((c, k) => {
      const x = X0 + LW + k * CW, hl = r === 2 && k === 1 && lt > 17.6;
      glass(x + 6, y, CW - 12, RH - 14, { a: ra * (r === 2 && lt > 17.6 && k === 2 ? 0.8 : 1), accent: hl ? OK : null, r: 18, fill: hl ? 0.14 : 0.055 });
      text(c[0], x + CW / 2, y + 44, { size: 24, weight: hl ? 800 : 600, align: 'center', color: hl ? OK : INK, a: ra });
      text(c[1], x + CW / 2, y + 76, { size: 24, weight: hl ? 800 : 600, align: 'center', color: hl ? OK : INK, a: ra });
    });
  });
  bullet(0, '2PC: locks buy logical atomicity', F(lt, 2.4, 3.0));
  bullet(1, 'TC/C, Saga: rely on compensation', F(lt, 10.4, 11.0));
  bullet(2, 'TC/C can parallelize: lower latency', F(lt, 17.6, 18.2), { color: OK, size: 28 });
  statCard(110, 660, 640, 'Either way, you still need', 'Replayable history', { color: COL_EV, a: F(lt, 25.2, 26.0), h: 104 });
}

// ───────── 7 Event sourcing: command -> state machine -> event ─────────
const START = { A: 10, B: 8, C: 2 };
const CMDS = [
  { id: 'C1', t: 'A→C $1', from: 'A', to: 'C', amt: 1 },
  { id: 'C2', t: 'B→A $2', from: 'B', to: 'A', amt: 2 },
  { id: 'C3', t: 'C→B $9', from: 'C', to: 'B', amt: 9, bad: true },
  { id: 'C4', t: 'A→B $4', from: 'A', to: 'B', amt: 4 },
];
const EVS = [
  { from: 'A', to: 'C', amt: 1 }, { from: 'B', to: 'A', amt: 2 }, { from: 'A', to: 'B', amt: 4 }, { from: 'C', to: 'B', amt: 1 },
  { from: 'B', to: 'C', amt: 3 }, { from: 'A', to: 'C', amt: 2 }, { from: 'C', to: 'A', amt: 1 }, { from: 'B', to: 'A', amt: 1 },
];
function replay(n, start = START) {
  const s = { ...start };
  for (let i = 0; i < n; i++) { s[EVS[i].from] -= EVS[i].amt; s[EVS[i].to] += EVS[i].amt; }
  return s;
}
const ACC = [['A', COL_A], ['B', COL_COORD], ['C', COL_C]];
function balanceBars(x, y, s, a, { w = 360 } = {}) {
  ACC.forEach(([n, c], i) => hbar(x, y + i * 62, w, n, clamp(s[n] / 14), c, { a, valueText: `$${s[n]}`, labelW: 44 }));
}
function sceneES(lt) {
  header(lt, '07', 'Event Sourcing', COL_EV, 'Events are the source of truth');
  const T = [9.6, 11.4, 13.2, 15.0];
  const qa = F(lt, 4.6, 5.4);
  text('Command queue · first in, first out', 830, 190, { size: 22, color: MUTE, a: qa });
  CMDS.forEach((c, i) => {
    const x = 830 + i * 150, done = lt > T[i] + 0.6, a = F(lt, 5.0 + i * 0.35, 5.8 + i * 0.35) * (done ? 0.28 : 1);
    glass(x, 208, 136, 76, { r: 16, a, accent: c.bad && lt > T[i] ? RED : COL_C });
    text(c.id, x + 68, 238, { size: 20, color: MUTE, font: MONO, align: 'center', a });
    text(c.t, x + 68, 270, { size: 22, weight: 700, font: MONO, align: 'center', a });
  });
  const ma = F(lt, 9.0, 9.8);
  box(1500, 170, 300, 130, 'State machine', { color: COL_COORD, a: ma, sub: 'validates', size: 30 });
  arrow(1450, 245, 1494, 245, { color: MUTE, a: ma, head: 10, w: 3 });
  let evCount = 0;
  CMDS.forEach((c, i) => {
    const t0 = T[i];
    const p = P(lt, t0, t0 + 0.9);
    if (p > 0 && p < 1) packet(1200, 246, 1500, 246, p, c.bad ? RED : COL_C, { r: 10, trail: 0.2 });
    if (lt > t0 + 0.9 && lt < t0 + 1.7 && c.bad) { text('Insufficient funds', 1566, 338, { size: 24, weight: 700, color: RED, align: 'center', a: F(lt, t0 + 0.9, t0 + 1.2) }); cross(1456, 330, RED, 12, 1); }
    if (!c.bad && lt > t0 + 0.9) evCount++;
  });
  const ea = F(lt, 9.0, 9.8);
  text('Event log · append-only, never modified', 830, 392, { size: 22, color: MUTE, a: ea });
  ctx.save(); ctx.globalAlpha *= ea; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([6, 8]); ctx.lineWidth = 2; rr(826, 408, 970, 128, 22); ctx.stroke(); ctx.restore();
  let k = 0;
  CMDS.forEach((c, i) => {
    if (c.bad) return;
    const t0 = T[i] + 0.9, p = eBack(P(lt, t0, t0 + 0.6)), x = 850 + k * 220;
    if (p > 0.02) {
      ctx.save(); ctx.globalAlpha *= clamp(p * 2); ctx.translate(x + 100, 472); ctx.scale(lerp(0.7, 1, clamp(p)), lerp(0.7, 1, clamp(p))); ctx.translate(-x - 100, -472);
      glass(x, 428, 200, 88, { r: 16, accent: COL_EV });
      text(`E${k + 1}`, x + 18, 462, { size: 22, weight: 800, color: COL_EV, font: MONO });
      text(`${c.from}→${c.to} $${c.amt}`, x + 100, 500, { size: 28, weight: 700, font: MONO, align: 'center' });
      ctx.restore();
    }
    k++;
  });
  arrow(1650, 304, 1650, 392, { color: MUTE, a: ma * (lt > T[0] ? 1 : 0.3), head: 10, w: 3 });
  const sa = F(lt, 18.1, 18.9);
  const n = Math.min(3, evCount);
  const cur = { ...START };
  for (let i = 0; i < n; i++) { cur[EVS[i].from] -= EVS[i].amt; cur[EVS[i].to] += EVS[i].amt; }
  const pa = F(lt, 9.8, 10.6);
  glass(830, 590, 970, 250, { a: pa, accent: COL_EV, r: 24 });
  text('State = events applied (derived)', 862, 636, { size: 26, weight: 700, a: pa });
  text('Illustrative balances', 1770, 636, { size: 20, color: DIM, align: 'right', a: pa });
  balanceBars(862, 668, cur, pa, { w: 620 });
  if (sa > 0) {
    ctx.save(); ctx.globalAlpha *= sa; ctx.strokeStyle = OK; ctx.lineWidth = 3; glow(OK, 14); rr(826, 586, 978, 258, 26); ctx.stroke(); ctx.restore();
  }
  bullet(0, 'Command: a wish, may fail', F(lt, 5.0, 5.6));
  bullet(1, 'Event: a fact that happened', F(lt, 12.1, 12.7), { color: COL_EV });
  bullet(2, 'State: the result of events', F(lt, 18.1, 18.7), { color: OK });
  statCard(110, 700, 640, 'Rejected command', 'Produces no event', { color: RED, a: F(lt, 13.8, 14.6), h: 100 });
}

// ───────── 8 Replay: any moment, compare versions, snapshots ─────────
function sceneReplay(lt) {
  header(lt, '08', 'Reproducibility', OK, 'Replay events to rebuild any moment');
  const X0 = 830, EW = 118;
  const ta = F(lt, 0.9, 1.6);
  const target = 5;
  const head = lt < 9.6 ? lerp(0, target, eIO(P(lt, 5.8, 9.0))) : target;
  const snapAt = 5;
  const snapOn = lt > 18.7;
  const fromSnap = lt > 20.2;
  EVS.forEach((e, i) => {
    const x = X0 + i * EW, a = ta * (lt > 2.4 + i * 0.1 ? 1 : F(lt, 1.0 + i * 0.1, 1.8 + i * 0.1));
    const done = head > i + 0.5;
    const skipped = fromSnap && i < snapAt;
    glass(x, 200, EW - 14, 92, { r: 16, a: a * (skipped ? 0.35 : 1), accent: done ? COL_EV : null, fill: done ? 0.14 : 0.05 });
    text(`E${i + 1}`, x + (EW - 14) / 2, 236, { size: 24, weight: 800, font: MONO, color: done ? COL_EV : MUTE, align: 'center', a: a * (skipped ? 0.4 : 1) });
    text(`${e.from}→${e.to}`, x + (EW - 14) / 2, 272, { size: 20, font: MONO, color: MUTE, align: 'center', a: a * (skipped ? 0.4 : 1) });
  });
  if (lt > 5.0) {
    const hx = X0 + Math.min(head, 8) * EW - 7;
    ctx.save(); ctx.globalAlpha *= F(lt, 5.0, 5.6); ctx.fillStyle = OK; glow(OK, 14); rr(hx - 3, 186, 6, 120, 3); ctx.fill(); ctx.restore();
    text('Replay to E5', X0 + 5 * EW - 7, 340, { size: 24, weight: 700, color: OK, align: 'center', a: F(lt, 9.0, 9.6) * (1 - F(lt, 15.8, 16.2)) });
  }
  if (snapOn) {
    const sx = X0 + snapAt * EW - 7;
    ctx.save(); ctx.globalAlpha *= F(lt, 18.7, 19.3); ctx.strokeStyle = SC[0]; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); glow(SC[0], 10);
    ctx.beginPath(); ctx.moveTo(sx, 190); ctx.lineTo(sx, 310); ctx.stroke(); ctx.restore();
    text('Snapshot @E5', sx, 340, { size: 24, weight: 700, color: SC[0], align: 'center', a: F(lt, 18.7, 19.3) });
  }
  const n = Math.floor(head + 0.0001);
  const s = replay(Math.min(8, n));
  const ba = F(lt, 3.4, 4.2);
  glass(830, 380, 480, 240, { a: ba, accent: OK, r: 24 });
  text('Rebuilt balances', 862, 424, { size: 24, color: MUTE, a: ba });
  balanceBars(862, 440, s, ba, { w: 280 });
  if (lt < 9.6) text(`Replayed ${n} events`, 1290, 424, { size: 22, color: OK, weight: 700, font: MONO, a: ba, align: 'right' });
  const va = F(lt, 9.8, 10.6);
  if (va > 0) {
    glass(1340, 380, 460, 240, { a: va, accent: COL_COORD, r: 24 });
    text('Same events · two versions', 1370, 424, { size: 24, color: MUTE, a: va });
    const rp = P(lt, 10.9, 13.6), nn = Math.floor(rp * 8);
    ['Old code v1', 'New code v2'].forEach((v, i) => {
      const y = 460 + i * 76;
      text(v, 1370, y + 30, { size: 26, weight: 700, color: i ? SC[3] : COL_COORD, a: va });
      const sv = replay(nn);
      text(`A${sv.A} B${sv.B} C${sv.C}`, 1590, y + 30, { size: 26, weight: 700, font: MONO, a: va });
    });
    if (lt > 14.4) { tick(1392, 600, OK, 14, F(lt, 14.4, 14.9)); }
    text('Same result', 1420, 606, { size: 26, weight: 800, color: OK, a: F(lt, 14.4, 14.9) });
  }
  text('Replay = start from initial balances, apply each event in turn', 830, 690, { size: 26, weight: 600, color: MUTE, a: F(lt, 6.0, 6.8) * (1 - F(lt, 15.4, 15.8)) });
  const need = fromSnap ? Math.round(lerp(8, 3, eIO(P(lt, 20.2, 21.0)))) : 8;
  const qa = F(lt, 16.0, 16.8);
  if (qa > 0) {
    glass(830, 660, 970, 150, { a: qa, accent: SC[0], r: 24 });
    text('Events to replay for recovery', 862, 706, { size: 24, color: MUTE, a: qa });
    text(`${need} / 8`, 862, 780, { size: 64, weight: 800, font: MONO, color: fromSnap && lt > 21.0 ? OK : INK, a: qa });
    text(fromSnap && lt > 21.0 ? 'Resume after the snapshot: E6–E8' : 'No snapshot: replay from E1', 1130, 776, { size: 28, weight: 600, color: fromSnap ? SC[0] : MUTE, a: qa });
  }
  bullet(0, 'Any moment: replay up to it', F(lt, 3.4, 4.0));
  bullet(1, 'Code change: compare versions', F(lt, 9.6, 10.2), { color: COL_COORD });
  bullet(2, 'Snapshot + later events', F(lt, 18.7, 19.3), { color: SC[0] });
  text('Illustrative data; a snapshot records the last applied event number', 110, 640, { size: 22, color: DIM, a: F(lt, 21.6, 22.2) });
}

// ───────── 9 Performance and availability: Raft, CQRS, sharding ─────────
function raftNode(x, y, label, color, { a = 1, dead = false, leader = false, w = 200, h = 130 } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  glass(x, y, w, h, { accent: dead ? RED : color });
  text(label, x + w / 2, y + 52, { size: 28, weight: 800, align: 'center', color: dead ? RED : color });
  text(dead ? 'down' : leader ? 'leader' : 'follower', x + w / 2, y + 92, { size: 22, color: dead ? RED : MUTE, align: 'center', font: MONO });
  ctx.restore();
}
function sceneHA(lt) {
  header(lt, '09', 'Performance & HA', SC[0], 'Local store · Raft · CQRS · sharding');
  // phase 1: single node, local storage
  const a1 = F(lt, 1.0, 1.8) * (1 - F(lt, 7.8, 8.4));
  if (a1 > 0) {
    ctx.save(); ctx.globalAlpha *= a1;
    glass(870, 250, 900, 480, { accent: SC[0], r: 28 });
    text('A single node (stateful)', 904, 306, { size: 30, weight: 800, color: SC[0] });
    [['Commands / events', 'Append to local disk, no network', COL_EV, 2.4], ['Recent data', 'Memory cache (mmap)', SC[3], 4.0], ['State', 'Local RocksDB (LSM, write-optimized)', COL_A, 5.2]].forEach(([n, s, c, t0], i) => {
      const y = 340 + i * 118, ra = F(lt, t0, t0 + 0.7);
      glass(904, y, 832, 96, { a: ra, accent: c, r: 20 });
      text(n, 936, y + 42, { size: 30, weight: 800, color: c, a: ra });
      text(s, 936, y + 78, { size: 24, color: MUTE, a: ra });
    });
    ctx.restore();
  }
  // phase 2: Raft replicas
  const a2 = F(lt, 8.4, 9.2) * (1 - F(lt, 15.6, 16.2));
  if (a2 > 0) {
    ctx.save(); ctx.globalAlpha *= a2;
    const L = [1180, 340], F1 = [900, 620], F2 = [1460, 620];
    const dead2 = lt > 13.4;
    raftNode(L[0], L[1], 'Node 1', COL_A, { leader: true, w: 240, h: 130 });
    raftNode(F1[0], F1[1], 'Node 2', COL_A, { w: 240, h: 130 });
    raftNode(F2[0], F2[1], 'Node 3', COL_A, { w: 240, h: 130, dead: dead2 });
    [[L, F1], [L, F2]].forEach(([p, q], k) => {
      const x1 = p[0] + 120, y1 = p[1] + 130, x2 = q[0] + 120, y2 = q[1];
      arrow(x1, y1, x2, y2, { color: 'rgba(255,255,255,0.18)', w: 2.5, head: 10 });
      if (!(k === 1 && dead2)) { lpacket(x1, y1, x2, y2, P(lt, 10.4 + k * 0.3, 11.6 + k * 0.3), 'E', COL_EV, { dy: -18 }); }
      if (k === 1 && lt > 9.4 && lt < 13.4) lpacket(x1, y1, x2, y2, P(lt, 12.4, 13.4), 'E', COL_EV, { dy: -18 });
    });
    if (dead2) { cross(F2[0] + 120, F2[1] - 60, RED, 20, F(lt, 13.4, 13.8)); }
    text('Events replicated to many nodes, same order', 870, 250, { size: 28, weight: 700, color: COL_EV, a: F(lt, 9.8, 10.6) });
    const ma = F(lt, 14.2, 15.0);
    if (ma > 0) { glass(1450, 340, 350, 100, { r: 20, accent: OK, a: ma }); text('2 of 3 alive = majority ✓', 1625, 400, { size: 24, weight: 800, color: OK, align: 'center', a: ma }); }
    ctx.restore();
  }
  // phase 3: CQRS + reverse proxy + push
  const a3 = F(lt, 16.0, 16.8) * (1 - F(lt, 20.4, 21.0));
  if (a3 > 0) {
    ctx.save(); ctx.globalAlpha *= a3;
    const Y = 420, items = [[830, 'Client', null, MUTE], [1060, 'Proxy', 'reverse', COL_COORD], [1330, 'Raft group', null, COL_A], [1580, 'Read-only', 'state machine', SC[3]]];
    const ws = [170, 190, 190, 230];
    items.forEach(([x, n, sub, c], i) => { box(x, Y, ws[i], 110, n, { color: c, size: 26, sub }); });
    [[1000, 1060], [1250, 1330], [1520, 1580]].forEach(([a, b]) => arrow(a + 4, Y + 55, b - 4, Y + 55, { color: 'rgba(255,255,255,0.25)', w: 3, head: 11 }));
    lpacket(1000, Y + 55, 1060, Y + 55, P(lt, 16.8, 17.5), '', COL_C);
    lpacket(1250, Y + 55, 1330, Y + 55, P(lt, 17.5, 18.2), '', COL_C);
    lpacket(1520, Y + 55, 1580, Y + 55, P(lt, 18.2, 18.9), '', COL_EV);
    text('Commands →', 830, Y - 24, { size: 24, weight: 700, color: COL_C, a: F(lt, 16.8, 17.4) });
    const pa = F(lt, 18.8, 19.6);
    const py = Y + 200;
    arrow(1695, Y + 120, 1695, py, { color: OK, a: pa, w: 3, head: 10 });
    arrow(1695, py, 1160, py, { color: OK, a: pa, w: 3, head: 10, p: eOut(P(lt, 19.0, 19.9)) });
    arrow(1160, py, 1160, Y + 120, { color: OK, a: pa * (lt > 19.8 ? 1 : 0), w: 3, head: 10 });
    text('Read-only state machine pushes results: no client polling', 830, py + 56, { size: 26, weight: 700, color: OK, a: F(lt, 19.2, 20.0) });
    ctx.restore();
  }
  // phase 4: multiple Raft groups
  const a4 = F(lt, 21.2, 22.0);
  if (a4 > 0) {
    ctx.save(); ctx.globalAlpha *= a4;
    box(1070, 190, 440, 96, 'Saga / TC/C coordinator', { color: COL_COORD, size: 26 });
    const gx = [830, 1130, 1430];
    gx.forEach((x, i) => {
      const c = [COL_A, COL_C, SC[0]][i];
      glass(x, 480, 300, 250, { r: 24, accent: c, a: F(lt, 22.4 + i * 0.4, 23.2 + i * 0.4) });
      text(`Raft group ${i + 1}`, x + 150, 524, { size: 28, weight: 800, align: 'center', color: c, a: F(lt, 22.4 + i * 0.4, 23.2 + i * 0.4) });
      for (let k = 0; k < 3; k++) { const ra = F(lt, 22.8 + i * 0.4, 23.4 + i * 0.4); ctx.save(); ctx.globalAlpha *= ra; dot(x + 70 + k * 80, 620, 24, c, { g: 12 }); ctx.restore(); }
      text('3 replicas', x + 150, 695, { size: 22, color: MUTE, align: 'center', font: MONO, a: F(lt, 23.0, 23.6) });
      arrow(1290 + (i - 1) * 90, 290, x + 150, 476, { color: 'rgba(255,255,255,0.25)', w: 2.5, head: 10, a: F(lt, 23.6 + i * 0.3, 24.4 + i * 0.3) });
    });
    ctx.restore();
    lpacket(1260, 290, 980, 476, P(lt, 25.4, 26.6), 'A −1', SC[3]);
    lpacket(1380, 290, 1280, 476, P(lt, 26.8, 28.0), 'C +1', SC[3]);
  }
  bullet(0, 'Local disk + memory cache', F(lt, 1.6, 2.2));
  bullet(1, 'Raft: majority replication', F(lt, 9.0, 9.6), { color: COL_EV });
  bullet(2, 'CQRS: read side pushes', F(lt, 16.2, 16.8), { color: SC[3] });
  bullet(3, 'Many Raft groups + TC/C / Saga', F(lt, 21.6, 22.2), { color: COL_C, size: 28 });
}

// ───────── Summary ─────────
function sceneEnd(lt) {
  text('Digital Wallet', 110, 250, { size: 84, weight: 900, a: F(lt, 0.2, 0.9) });
  [['Transactions', 'Cross-shard: 2PC · TC/C · Saga', COL_C, 2.6], ['Events', 'Append-only, the source of truth', COL_EV, 3.8], ['Replay', 'Rebuild balances · audit · diff', OK, 5.1]].forEach(([w, s, c, t0], k) => {
    const p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    fit(w, x + 36, 566, 450, { size: 70, weight: 800, min: 40 });
    fit(s, x + 36, 620, 450, { size: 26, color: MUTE, min: 20 });
    ctx.restore();
  });
  text('The balance is the result; the events are the history', 110, 750, { size: 34, weight: 700, color: INK, a: F(lt, 6.8, 7.6) });
  text('One group: consensus. Many groups: transactions. Snapshots save time; audits check correctness.', 110, 810, { size: 26, color: MUTE, a: F(lt, 10.1, 10.9) });
}

export const scenes = { title: sceneTitle, scale: sceneScale, atomic: sceneAtomic, twopc: sceneTwoPC, tcc: sceneTCC, saga: sceneSaga, compare: sceneCompare, es: sceneES, replay: sceneReplay, ha: sceneHA, end: sceneEnd };
