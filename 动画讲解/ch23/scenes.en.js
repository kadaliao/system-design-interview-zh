// Chapter 23 Distributed Email Service: English scenes (shell and helpers from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge,
         arrow, box, dbIcon, packet, statCard, bullet as bullet0 } from '../lib/core.js';

export const meta = { no: 23, title: 'Distributed Email Service', en: 'Distributed Email Service' };

// Role colors (consistent across the video)
const C_CLIENT = '#9aa6d6', C_SVC = SC[1], C_QUEUE = SC[2], C_DB = SC[0], C_OBJ = SC[3], C_SEARCH = SC[4];

const ap = (lt, t0, d = 0.6) => eOut(P(lt, t0, t0 + d));
const wid = (s, size, weight = 500, font = SANS) => { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; const w = ctx.measureText(s).width; ctx.restore(); return w; };
function fitSize(s, size, maxW, weight = 500, min = 18, font = SANS) { while (size > min && wid(s, size, weight, font) > maxW) size--; return size; }
// Left-column heading: English titles are wider, so shrink to fit 640px
function header(lt, num, title, accent, sub) {
  const size = fitSize(title, 70, 640, 800, 44);
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: fitSize(sub, 26, 640, 500, 20), color: MUTE });
  ctx.restore();
}
const bullet = (i, s, a, o = {}) => bullet0(i, s, a, { ...o, size: fitSize(s, o.size || 30, 590, 600, 22) });
function bx(lt, t0, x, y, w, h, label, o = {}) {
  const p = eBack(P(lt, t0, t0 + 0.6));
  const size = fitSize(label, o.size || 32, w - 24, 700, 20);
  box(x, y, w, h, label, { ...o, size, a: clamp(p * 2) * (o.a ?? 1), s: 0.85 + 0.15 * clamp(p, 0, 1.1) });
}
function envelope(cx, cy, color = '#fff', { s = 1, a = 1 } = {}) {
  const w = 58 * s, h = 40 * s;
  ctx.save(); ctx.globalAlpha *= a; glow(color, 18);
  rr(cx - w / 2, cy - h / 2, w, h, 8 * s); ctx.fillStyle = '#0a0d18'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke(); ctx.shadowBlur = 0;
  ctx.beginPath(); ctx.moveTo(cx - w / 2 + 4, cy - h / 2 + 5); ctx.lineTo(cx, cy + 3 * s); ctx.lineTo(cx + w / 2 - 4, cy - h / 2 + 5); ctx.stroke();
  ctx.restore();
}
function ringPulse(x, y, color, lt, t0, r0 = 40, grow = 70) {
  const p = P(lt, t0, t0 + 0.7); if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha *= 1 - p; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, r0 + eOut(p) * grow, 0, 7); ctx.stroke(); ctx.restore();
}
function hop(lt, t0, t1, x1, y1, x2, y2, color = '#fff', { s = 1 } = {}) {
  const p = P(lt, t0, t1);
  if (p > 0 && p < 1) { const q = eIO(p); envelope(lerp(x1, x2, q), lerp(y1, y2, q), color, { s }); }
  ringPulse(x2, y2, color, lt, t1, 36, 54);
}
function card(x, y, w, h, color, title, lines, a, { tsize = 36, font = SANS } = {}) {
  if (a <= 0) return;
  glass(x, y, w, h, { a, accent: color });
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; glow(color, 14); rr(x + 24, y, 70, 5, 3); ctx.fill(); ctx.restore();
  text(title, x + 26, y + 56, { size: fitSize(title, tsize, w - 52, 800, 22, font), weight: 800, color, font, a });
  lines.forEach((l, i) => text(l, x + 26, y + 100 + i * 36, { size: fitSize(l, 26, w - 44, 500, 20), color: i === 0 ? INK : MUTE, a }));
}
const lab = (s, x, y, a = 1, o = {}) => text(s, x, y, { size: 22, color: MUTE, a, ...o });

// ───────── Title: the route of one email ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  text('SYSTEM DESIGN INTERVIEW · ANIMATED WALKTHROUGH', 110, 280, { size: 30, weight: 600, color: SC[0], ls: 4, a });
  const g = ctx.createLinearGradient(110, 0, 1100, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  const ts = fitSize('Distributed Email Service', 150, 1680, 900, 80);
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 ${ts}px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('Distributed Email Service', 104, 450); ctx.restore();
  text('Follow one email, end to end', 112, 520, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 1.0, 1.8)) });
  text('Chapter 23', 112, 600, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
  const nodes = [['Compose', C_CLIENT], ['Outgoing queue', C_QUEUE], ['SMTP', C_SVC], ['Filter', SC[3]], ['Store', C_DB], ['Inbox', SC[4]]];
  const x0 = 200, x1 = 1720, y = 800, gap = (x1 - x0) / 5;
  nodes.forEach(([n, c], i) => {
    const x = x0 + i * gap, p = eBack(P(lt, 2.4 + i * 0.3, 3.1 + i * 0.3));
    if (i) arrow(x - gap + 44, y, x - 44, y, { color: DIM, a: clamp(p * 2) * 0.8, p: clamp(p), head: 12, w: 3 });
    ctx.save(); ctx.globalAlpha *= clamp(p * 2); ctx.translate(x, y); ctx.scale(clamp(p, 0, 1.1), clamp(p, 0, 1.1));
    glow(c, 22); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = c; ctx.stroke(); ctx.restore();
    text(n, x, y + 84, { size: 26, weight: 600, align: 'center', color: MUTE, a: clamp(p * 2) });
  });
  const tp = P(lt, 4.7, 8.2);
  if (tp > 0 && tp < 1) { const q = eIO(tp); envelope(lerp(x0, x1, q), y, '#fff'); }
  if (tp >= 1) envelope(x1, y, SC[4]);
}

// ───────── 1 Email protocols ─────────
function sceneProto(lt) {
  header(lt, '01', 'Email protocols', SC[1], 'Four stops for one email');
  const y = 430, h = 120, w = 160, xs = [800, 1093, 1386, 1679];
  bx(lt, 0.7, xs[0], y, w, h, 'Alice', { color: C_CLIENT, sub: 'sender', size: 33 });
  bx(lt, 4.0, xs[1], y, w, h, 'Outlook', { color: C_SVC, sub: 'sending', size: 33 });
  bx(lt, 8.2, xs[2], y, w, h, 'Gmail', { color: C_SVC, sub: 'receiving', size: 33 });
  bx(lt, 13.5, xs[3], y, w, h, 'Bob', { color: C_CLIENT, sub: 'recipient', size: 33 });
  const my = y + h / 2;
  const seg = (i, t0, label, col) => {
    const x1 = xs[i] + w + 6, x2 = xs[i + 1] - 6, p = ap(lt, t0, 0.6);
    arrow(x1, my, x2, my, { color: col, p, a: p, g: 6 });
    text(label, (x1 + x2) / 2, my - 22, { size: 22, weight: 700, color: col, align: 'center', font: MONO, a: p });
  };
  seg(0, 4.0, 'Send', C_CLIENT); seg(1, 10.4, 'SMTP', SC[0]); seg(2, 13.5, 'IMAP/POP', SC[3]);
  // MX lookup
  const dp = ap(lt, 5.2);
  bx(lt, 5.2, 1240, 200, 200, 110, 'DNS', { color: SC[4], sub: 'MX record', size: 32 });
  arrow(1190, y - 4, 1285, 318, { color: SC[4], p: ap(lt, 5.6, 0.8), a: dp, dash: [8, 7] });
  lab('MX lookup', 1050, 372, ap(lt, 6.0), { color: SC[4], size: 24 });
  const ra = ap(lt, 8.2);
  lab('MX of gmail.com', 1460, 250, ra, { size: 24 });
  text("→ Gmail's mail server", 1460, 288, { size: 24, weight: 700, color: SC[4], a: ra });
  arrow(1380, 318, 1466, y - 4, { color: SC[4], p: ap(lt, 8.2, 0.8), a: ra, dash: [8, 7] });
  const rest = (i, col, s0 = 0.8) => envelope(xs[i] + w / 2, y - 44, col, { s: s0 });
  const wr = P(lt, 0.7, 4.0);
  if (wr < 1) rest(0, '#fff', 0.8 * eOut(P(lt, 0.9, 1.5)));
  hop(lt, 4.0, 5.2, xs[0] + w, my, xs[1], my, '#fff');
  if (lt >= 5.2 && lt < 10.4) rest(1, '#fff');
  hop(lt, 10.4, 12.0, xs[1] + w, my, xs[2], my, SC[0]);
  if (lt >= 12.0 && lt < 13.5) rest(2, SC[0]);
  hop(lt, 13.5, 15.0, xs[2] + w, my, xs[3], my, SC[3]);
  if (lt >= 15.0) rest(3, SC[3]);
  card(800, 640, 330, 190, SC[0], 'SMTP', ['Server to server', 'sender → receiver'], ap(lt, 18.2), { font: MONO });
  card(1155, 640, 330, 190, SC[3], 'IMAP / POP', ['Users fetch mail', 'IMAP: stays on server'], ap(lt, 20.2), { font: MONO, tsize: 34 });
  card(1510, 640, 330, 190, C_SVC, 'HTTP', ['Web client calls', 'the mail service API'], ap(lt, 22.2), { font: MONO });
  text('POP can download locally; IMAP suits multi-device sync', 800, 872, { size: 22, color: DIM, a: ap(lt, 20.8) });
  bullet(0, 'Compose and send', ap(lt, 0.7)); bullet(1, 'Look up the domain’s MX', ap(lt, 4.0)); bullet(2, 'SMTP hands it to Gmail', ap(lt, 10.4)); bullet(3, 'IMAP / POP to fetch', ap(lt, 13.5));
}

// ───────── 2 Send pipeline ─────────
function sceneSend(lt) {
  header(lt, '02', 'Send pipeline', C_QUEUE, 'Queue first, deliver later');
  const w = 220, h = 110;
  const X = [800, 1100, 1400], Y1 = 220, Y2 = 470;
  bx(lt, 0.7, X[0], Y1, w, h, 'Client', { color: C_CLIENT, sub: 'Webmail' });
  bx(lt, 2.5, X[1], Y1, w, h, 'Load balancer', { color: C_SVC, sub: 'rate limit' });
  bx(lt, 6.8, X[2], Y1, w, h, 'Web server', { color: C_SVC, sub: 'validation' });
  arrow(X[0] + w + 6, Y1 + 55, X[1] - 6, Y1 + 55, { color: DIM, p: ap(lt, 2.5), a: ap(lt, 2.5) });
  arrow(X[1] + w + 6, Y1 + 55, X[2] - 6, Y1 + 55, { color: DIM, p: ap(lt, 6.8), a: ap(lt, 6.8) });
  badge(800, 372, 'Size and basic checks passed', SC[4], ap(lt, 10.6));
  bx(lt, 13.4, X[2], Y2, w, h, 'Outgoing queue', { color: C_QUEUE, sub: 'outbound' });
  arrow(X[2] + w / 2, Y1 + h + 6, X[2] + w / 2, Y2 - 6, { color: C_QUEUE, p: ap(lt, 13.4), a: ap(lt, 13.4) });
  bx(lt, 16.0, 1660, Y2, 180, h, 'Object store', { color: C_OBJ, sub: 'attachments' });
  arrow(X[2] + w + 6, Y2 + 55, 1654, Y2 + 55, { color: C_OBJ, dash: [7, 7], p: ap(lt, 16.0), a: ap(lt, 16.0) });
  badge(1596, 600, 'References only', C_OBJ, ap(lt, 16.6));
  bx(lt, 19.8, 1660, Y1, 180, h, 'Error queue', { color: RED, sub: 'failed checks', hot: true });
  arrow(X[2] + w + 6, Y1 + 55, 1654, Y1 + 55, { color: RED, p: ap(lt, 19.8), a: ap(lt, 19.8), dash: [7, 7] });
  bx(lt, 22.0, X[1], Y2, w, h, 'SMTP out', { color: C_SVC, sub: 'worker' });
  arrow(X[2] - 6, Y2 + 55, X[1] + w + 6, Y2 + 55, { color: DIM, p: ap(lt, 22.0), a: ap(lt, 22.0) });
  bx(lt, 26.1, X[0], Y2, w, h, 'Recipient', { color: C_CLIENT, sub: 'external' });
  arrow(X[1] - 6, Y2 + 55, X[0] + w + 6, Y2 + 55, { color: SC[0], p: ap(lt, 26.1), a: ap(lt, 26.1) });
  const sa = ap(lt, 27.6);
  dbIcon(1155, 700, 110, 100, 'Sent', { color: C_DB, a: sa });
  arrow(X[1] + w / 2, Y2 + h + 6, X[1] + w / 2, 694, { color: C_DB, p: sa, a: sa });
  // spam / virus scan
  if (lt > 22.8) {
    text('Spam / virus check', X[1] + w / 2, 640, { size: 22, color: SC[3], align: 'center', weight: 700, a: Math.min(ap(lt, 22.8), 1 - P(lt, 25.2, 25.8)) });
    ringPulse(X[1] + w / 2, Y2 + 55, SC[3], lt, 23.0, 70, 40); ringPulse(X[1] + w / 2, Y2 + 55, SC[3], lt, 23.7, 70, 40);
  }
  const m = '#fff';
  hop(lt, 2.5, 3.7, X[0] + w, Y1 + 55, X[1], Y1 + 55, m);
  hop(lt, 6.8, 8.0, X[1] + w, Y1 + 55, X[2], Y1 + 55, m);
  hop(lt, 13.4, 14.8, X[2] + w / 2, Y1 + h, X[2] + w / 2, Y2, m);
  hop(lt, 20.2, 21.2, X[2] + w, Y1 + 55, 1660, Y1 + 55, RED);
  hop(lt, 22.0, 23.2, X[2], Y2 + 55, X[1] + w, Y2 + 55, m);
  hop(lt, 26.1, 27.0, X[1], Y2 + 55, X[0] + w, Y2 + 55, SC[0]);
  hop(lt, 27.6, 28.5, X[1] + w / 2, Y2 + h, X[1] + w / 2, 700, C_DB);
  if (lt >= 14.8 && lt < 22.0) envelope(X[2] + w / 2, Y2 + h + 40, m, { s: 0.8 });
  if (lt >= 23.2 && lt < 26.1) envelope(X[1] + w / 2, Y2 - 34, m, { s: 0.8 });
  [['Rate limiting at the edge', 5.3], ['Basic validation', 8.8], ['Into the outgoing queue', 13.4], ['Attachments by reference', 16.0], ['Worker: scan, then deliver', 22.0], ['Save to the sent folder', 27.6]]
    .forEach(([s, t], i) => bullet(i, s, ap(lt, t)));
}

// ───────── 3 Backlog and retries ─────────
function qLevel(lt) {
  if (lt < 3.3) return 18 * eOut(P(lt, 1.0, 3.3));
  if (lt < 11.4) return 18;
  if (lt < 14.0) return lerp(18, 4, eIO(P(lt, 11.4, 14.0)));
  if (lt < 16.3) return 4;
  return lerp(4, 22, eIO(P(lt, 16.3, 19.0)));
}
function sceneRetry(lt) {
  header(lt, '03', 'Backlog and retries', C_QUEUE, 'First ask: why the pile-up?');
  const qa = ap(lt, 1.0), cells = 24, lv = qLevel(lt);
  lab('Outgoing queue length (illustrative)', 800, 214, qa);
  for (let i = 0; i < cells; i++) {
    const x = 810 + i * 42, on = i < Math.floor(lv), part = i === Math.floor(lv) ? lv - Math.floor(lv) : 0;
    const col = lt > 16.3 ? RED : C_QUEUE;
    ctx.save(); ctx.globalAlpha *= qa; rr(x, 232, 34, 56, 6); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    if (on || part > 0) { ctx.globalAlpha *= on ? 1 : part; glow(col, 10); rr(x, 232, 34, 56, 6); ctx.fillStyle = col; ctx.fill(); }
    ctx.restore();
  }
  // Panel A: exponential backoff
  const A = ap(lt, 6.0) * (1 - P(lt, 10.0, 10.4)), py = 340;
  if (A > 0) {
    glass(800, py, 1040, 290, { a: A, accent: SC[3] });
    text('Recipient down: double the wait (illustrative)', 830, py + 52, { size: 28, weight: 700, color: SC[3], a: A });
    const ly = py + 170, cum = [0, 1, 3, 7, 15], tt = [6.6, 7.4, 8.2, 9.0, 9.8];
    ctx.save(); ctx.globalAlpha *= A; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(850, ly); ctx.lineTo(1810, ly); ctx.stroke(); ctx.restore();
    cum.forEach((c, i) => {
      const x = 880 + c * 60, p = eBack(P(lt, tt[i], tt[i] + 0.5)); if (p <= 0.02) return;
      const ok = i === 4, col = ok ? SC[4] : RED;
      ctx.save(); ctx.globalAlpha *= A * clamp(p * 2); ctx.translate(x, ly); ctx.scale(clamp(p, 0, 1.1), clamp(p, 0, 1.1));
      glow(col, 14); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.stroke(); ctx.shadowBlur = 0;
      text(ok ? '✓' : '×', 0, 10, { size: 30, weight: 800, color: col, align: 'center' }); ctx.restore();
      text(ok ? 'OK' : `${i + 1}`, x, ly + 60, { size: 22, color: ok ? SC[4] : MUTE, align: 'center', a: A * clamp(p * 2) });
      if (i > 0) { const g = cum[i] - cum[i - 1]; text(`+${g}`, x - g * 30, ly - 42, { size: 24, weight: 700, color: SC[3], align: 'center', font: MONO, a: A * clamp(p * 2) }); }
    });
  }
  // Panel B: scale out vs rate limited
  const HOT = 13.6;
  const B = ap(lt, 10.5), py2 = 340;
  if (B > 0) {
    const hot = lt > HOT;
    glass(800, py2, 1040, 290, { a: B, accent: hot ? RED : C_SVC });
    const nw = lt < 12.3 ? 2 : lt < 13.4 ? Math.round(lerp(2, 4, P(lt, 12.3, 13.4))) : lt < 16.3 ? 4 : Math.round(lerp(4, 8, eIO(P(lt, 16.3, 18.3))));
    text(!hot ? 'Too few consumers: scale out workers' : 'Recipient rate limiting: more workers, worse', 830, py2 + 52, { size: 28, weight: 700, color: hot ? RED : C_SVC, a: B });
    for (let i = 0; i < 8; i++) {
      const x = 840 + i * 62, on = i < nw;
      const bt = !hot && lt < 16.3 ? 12.3 + i * 0.4 : 16.3 + (i - 4) * 0.5;
      const born = on ? eBack(P(lt, bt, bt + 0.4)) : 0;
      ctx.save(); ctx.globalAlpha *= B; rr(x, py2 + 130, 52, 52, 10); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      if (on && (i < 2 || born > 0.02 || (hot && i < 4))) { glow(hot ? RED : C_SVC, 12); rr(x, py2 + 130, 52, 52, 10); ctx.fillStyle = (hot ? RED : C_SVC) + '55'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = hot ? RED : C_SVC; ctx.stroke(); }
      ctx.restore();
    }
    text(`worker × ${nw}`, 840, py2 + 250, { size: 40, weight: 800, font: MONO, color: hot ? RED : C_SVC, a: B });
    box(1530, py2 + 100, 270, 110, 'Recipient', { color: C_CLIENT, sub: hot ? 'rate limiting' : 'healthy', hot, a: B, size: 32 });
    arrow(1360, py2 + 156, 1520, py2 + 156, { color: hot ? RED : DIM, a: B, dash: hot ? [8, 8] : null });
    const n = !hot ? 3 : 5;
    for (let k = 0; k < n; k++) {
      const u = ((lt * (hot ? 0.9 : 0.7) + k / n) % 1);
      if (lt < 11.0) continue;
      if (!hot) packet(1360, py2 + 156, 1520, py2 + 156, u, C_QUEUE, { r: 8, trail: 0.2, a: B });
      else if (lt > HOT + 0.4) { const bounce = u < 0.5 ? u * 2 : 2 - u * 2; dot(lerp(1360, 1520, bounce), py2 + 156, 8, RED, { g: 14, a: B * (lt > 16.3 ? 1 : 0.7) }); }
    }
  }
  card(800, 690, 505, 200, SC[3], 'Temporary · 4xx', ['Retry with backoff', 'No loss, no hammering'], ap(lt, 18.9));
  card(1335, 690, 505, 200, RED, 'Permanent · 5xx', ['Failure result, reason logged', 'No endless resends'], ap(lt, 21.4));
  bullet(0, 'Backlog ≠ always scale out', ap(lt, 3.3)); bullet(1, 'Down → exponential backoff', ap(lt, 6.0)); bullet(2, 'Too few workers → scale out', ap(lt, 10.5)); bullet(3, 'Rate limited → don’t add workers', ap(lt, 13.6)); bullet(4, 'Permanent reject → failure result', ap(lt, 21.4));
}

// ───────── 4 Receive pipeline ─────────
function sceneReceive(lt) {
  header(lt, '04', 'Receive pipeline', C_SVC, 'Filter first, then store');
  const w = 200, h = 110, Y1 = 200, Y2 = 440, Y3 = 690;
  bx(lt, 0.7, 800, Y1, w, h, 'Sender', { color: C_CLIENT, sub: 'external' });
  bx(lt, 3.1, 1075, Y1, w, h, 'SMTP LB', { color: C_SVC, sub: 'load balancer' });
  bx(lt, 5.7, 1335, Y1, 230, h, 'SMTP server', { color: C_SVC, sub: 'accept policy' });
  arrow(1006, Y1 + 55, 1069, Y1 + 55, { color: DIM, p: ap(lt, 3.1), a: ap(lt, 3.1) });
  arrow(1281, Y1 + 55, 1329, Y1 + 55, { color: DIM, p: ap(lt, 5.7), a: ap(lt, 5.7) });
  bx(lt, 9.0, 1650, Y1, 190, h, 'Reject', { color: RED, sub: 'invalid mail', hot: true });
  arrow(1571, Y1 + 55, 1644, Y1 + 55, { color: RED, p: ap(lt, 9.0), a: ap(lt, 9.0), dash: [7, 7] });
  bx(lt, 10.7, 1650, Y2, 190, h, 'Object store', { color: C_OBJ, sub: 'big files' });
  arrow(1520, Y1 + h + 6, 1700, Y2 - 6, { color: C_OBJ, p: ap(lt, 10.7), a: ap(lt, 10.7), dash: [7, 7] });
  bx(lt, 13.7, 1350, Y2, w, h, 'Mail worker', { color: C_SVC, sub: 'prelim checks' });
  arrow(1450, Y1 + h + 6, 1450, Y2 - 6, { color: DIM, p: ap(lt, 13.7), a: ap(lt, 13.7) });
  const outs = [[800, 'Storage', C_DB, 17.2], [1010, 'Cache', SC[0], 18.4], [1220, 'Real-time', C_SVC, 19.7]];
  outs.forEach(([x, n, c, t], i) => {
    if (i === 0) { const a = ap(lt, t); dbIcon(x + 40, Y3 - 6, 110, 100, 'Storage', { color: C_DB, a }); }
    else bx(lt, t, x, Y3, i === 2 ? 220 : 160, 100, n, { color: i === 1 ? SC[0] : c, size: i === 2 ? 30 : 32, sub: i === 2 ? 'servers' : null });
  });
  const tx = [895, 1090, 1330];
  tx.forEach((x, i) => arrow(1450, Y2 + h + 6, x, i === 0 ? Y3 - 12 : Y3 - 6, { color: DIM, p: ap(lt, outs[i][3]), a: ap(lt, outs[i][3]), w: 3 }));
  bx(lt, 22.3, 1560, Y3, 280, 100, 'Bob', { color: C_CLIENT, sub: lt < 24.3 ? 'online' : lt < 25.9 ? 'offline' : 'back online', size: 32 });
  arrow(1446, Y3 + 50, 1554, Y3 + 50, { color: SC[3], p: ap(lt, 22.3), a: ap(lt, 22.3) });
  lab('WebSocket push', 1450, Y3 + 150, ap(lt, 22.5), { align: 'center', color: SC[3], size: 22 });
  if (lt > 25.9) {
    const a = ap(lt, 25.9);
    arrow(1700, Y3 + 108, 1700, 858, { color: SC[0], a, p: ap(lt, 25.9, 0.4), w: 3, head: 1 });
    arrow(1700, 858, 990, 858, { color: SC[0], a, p: ap(lt, 26.2, 0.8), w: 3, head: 1 });
    arrow(990, 858, 990, 745, { color: SC[0], a, p: ap(lt, 26.8, 0.3), w: 3, head: 1 });
    arrow(990, 745, 958, 745, { color: SC[0], a, p: ap(lt, 27.0, 0.3), w: 3 });
    lab('HTTP read', 1180, 840, a, { align: 'center', color: SC[0] });
  }
  const m = '#fff';
  hop(lt, 3.1, 4.3, 1000, Y1 + 55, 1075, Y1 + 55, m);
  hop(lt, 5.7, 6.9, 1275, Y1 + 55, 1335, Y1 + 55, m);
  ringPulse(1450, Y1 + 55, SC[3], lt, 7.6, 70, 40);
  hop(lt, 9.2, 10.2, 1565, Y1 + 55, 1650, Y1 + 55, RED);
  hop(lt, 10.8, 11.8, 1520, Y1 + h, 1700, Y2, C_OBJ, { s: 0.7 });
  hop(lt, 13.8, 15.2, 1450, Y1 + h, 1450, Y2, m);
  if (lt >= 15.2 && lt < 17.2) envelope(1290, Y2 + 55, m, { s: 0.85 });
  hop(lt, 17.2, 18.4, 1450, Y2 + h, 895, Y3 - 12, C_DB);
  hop(lt, 18.4, 19.2, 1450, Y2 + h, 1090, Y3 - 6, SC[0]);
  hop(lt, 19.7, 20.9, 1450, Y2 + h, 1330, Y3 - 6, C_SVC);
  hop(lt, 22.3, 23.5, 1440, Y3 + 50, 1560, Y3 + 50, SC[3]);
  if (lt > 7.6 && lt < 8.8) text('Accept policy', 1450, Y1 - 10, { size: 22, color: SC[3], align: 'center', weight: 700, a: ap(lt, 7.6) });
  bullet(0, 'LB → SMTP server', ap(lt, 3.1)); bullet(1, 'Invalid mail rejected', ap(lt, 9.0)); bullet(2, 'Big attachments to object store', ap(lt, 10.7));
  bullet(3, 'Check → store, cache, notify', ap(lt, 13.7)); bullet(4, 'Online: push · Offline: HTTP', ap(lt, 22.3));
}

// ───────── 5 Attachments vs metadata ─────────
function sceneStore(lt) {
  header(lt, '05', 'Bodies vs attachments', C_OBJ, 'Do the math first');
  const chips = (y, items, times, col, ft) => {
    let x = 810;
    items.forEach(([s], k) => {
      const p = ap(lt, times[k], 0.5); const tw = wid(s, 26, 700, MONO) + 36;
      glass(x, y, tw, 52, { a: p, r: 14, accent: col }); text(s, x + 18, y + 35, { size: 26, weight: 700, font: MONO, a: p });
      x += tw + 14; if (k < items.length - 1) text('×', x - 8, y + 36, { size: 28, color: MUTE, a: p }); x += 22;
    });
    const fp = ap(lt, ft); text('=', x - 14, y + 38, { size: 32, color: MUTE, a: fp });
  };
  const barW = (pb) => (pb / 1460) * 620;
  const bar = (y, pb, t0, t1, col, label) => {
    const p = eOut(P(lt, t0, t1)), A = ap(lt, t0);
    ctx.save(); ctx.globalAlpha *= A; rr(810, y, 620, 44, 12); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.restore();
    if (p > 0.01) { ctx.save(); glow(col, 14); rr(810, y, Math.max(barW(pb) * p, 12), 44, 12); ctx.fillStyle = col; ctx.fill(); ctx.restore(); }
    text(`${Math.round(pb * p).toLocaleString('en-US')} PB / yr`, 810 + Math.max(barW(pb) * p, 12) + 20, y + 34, { size: 32, weight: 800, font: MONO, color: col, a: A });
    text(label, 810, y - 12, { size: 22, color: MUTE, a: A });
  };
  chips(230, [['1B users'], ['40 emails/day'], ['50 KB']], [4.8, 6.2, 8.3], C_DB, 10.2);
  bar(330, 730, 10.2, 11.8, C_DB, 'Mail data (incl. bodies)');
  chips(470, [['20% with attachments'], ['500 KB']], [13.4, 15.6], C_OBJ, 18.0);
  bar(570, 1460, 18.0, 20.0, C_OBJ, 'Attachments (only 20% of mail)');
  text('Decimal KB / PB; replicas, indexes and encoding overhead not counted', 810, 660, { size: 20, color: DIM, a: ap(lt, 20.0) });
  const sp = ap(lt, 21.6);
  dbIcon(870, 720, 120, 110, 'Database', { color: C_DB, a: sp });
  bx(lt, 22.6, 1290, 726, 240, 100, 'Object store', { color: C_OBJ, sub: 'attachment bytes', size: 32 });
  arrow(1030, 776, 1280, 776, { color: C_OBJ, dash: [8, 8], p: ap(lt, 24.0, 0.6), a: ap(lt, 24.0) });
  text('reference', 1155, 756, { size: 24, weight: 700, color: C_OBJ, align: 'center', a: ap(lt, 24.0) });
  statCard(110, 430, 640, 'Mail data', '730 PB/yr', { color: C_DB, a: ap(lt, 10.2) });
  statCard(110, 570, 640, 'Attachments', '1,460 PB/yr', { color: C_OBJ, a: ap(lt, 18.0) });
  statCard(110, 710, 640, 'Attachments, share of all bytes', '2 / 3', { color: INK, a: ap(lt, 21.6), note: 'about 2,190 PB total' });
}

// ───────── 6 Shard by user ─────────
const USERS = ['alice', 'bob', 'carol', 'dave'];
const ORDER = [0, 2, 1, 3, 0, 1, 2, 3, 0, 3, 2, 1];
const cx0 = 800, cwd = 235, cgap = 33.5;
function sceneShard(lt) {
  header(lt, '06', 'Shard by user', C_DB, 'The partition key picks the shard');
  const cy = 330, ch = 210;
  const focus = lt > 7.2 && lt < 21.0;
  USERS.forEach((u, i) => {
    const x = cx0 + i * (cwd + cgap), a = ap(lt, 0.7 + i * 0.15) * (focus && i !== 0 ? 0.35 : 1);
    glass(x, cy, cwd, ch, { a, accent: SC[i] });
    text(`shard ${i + 1}`, x + 22, cy + 46, { size: 30, weight: 800, font: MONO, color: SC[i], a });
    text(`user: ${u}`, x + 22, cy + 84, { size: 22, color: MUTE, font: MONO, a: a * ap(lt, 2.4) });
  });
  const cnt = [0, 0, 0, 0];
  ORDER.forEach((u, k) => {
    const s = cnt[u]++, t0 = 2.8 + k * 0.3, p = eIO(P(lt, t0, t0 + 0.9));
    const ox = 810 + k * 76, oy = 215, tx = cx0 + u * (cwd + cgap) + 16 + s * 72, ty = cy + 130;
    const x = lerp(ox, tx, p), y = lerp(oy, ty, p) - Math.sin(p * Math.PI) * 30;
    const born = ap(lt, 2.2 + k * 0.05, 0.4), dim = focus && u !== 0 ? 0.35 : 1;
    ctx.save(); ctx.globalAlpha *= born * dim; glow(SC[u], 8); rr(x, y, 64, 34, 10); ctx.fillStyle = SC[u] + '30'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = SC[u]; ctx.stroke(); ctx.shadowBlur = 0;
    text(`${USERS[u][0]}${s + 1}`, x + 32, y + 25, { size: 20, weight: 700, font: MONO, align: 'center' }); ctx.restore();
  });
  lab('Each email routes by recipient user_id', 800, 190, ap(lt, 2.4), { size: 20 });
  if (focus) text('Fetch · mark read · search: one user, one shard', 800, 574, { size: 26, weight: 700, color: SC[0], a: ap(lt, 7.2) * (1 - P(lt, 20.0, 21.0)) });
  const ta = ap(lt, 12.3);
  glass(800, 610, 1040, 300, { a: ta, accent: C_DB });
  const cols = [830, 1010, 1470];
  const colA = lt > 14.8 ? C_DB : INK, colB = lt > 17.1 ? C_QUEUE : INK;
  text('user_id', cols[0], 662, { size: 26, weight: 800, font: MONO, color: colA, a: ta });
  text('email_id (timeuuid)', cols[1], 662, { size: 26, weight: 800, font: MONO, color: colB, a: ta });
  text('subject', cols[2], 662, { size: 26, weight: 800, font: MONO, a: ta });
  if (lt > 14.8) { const p = ap(lt, 14.8); ctx.fillStyle = C_DB; rr(cols[0], 674, 100 * p, 4, 2); ctx.fill(); text('Partition key → shard', cols[0], 892, { size: 22, color: C_DB, weight: 700, a: p }); }
  if (lt > 17.1) { const p = ap(lt, 17.1); ctx.fillStyle = C_QUEUE; rr(cols[1], 674, 330 * p, 4, 2); ctx.fill(); text('Clustering key → row order', cols[1] + 240, 892, { size: 22, color: C_QUEUE, weight: 700, a: p }); }
  const rows = [['09:12:03', 'Weekly report'], ['09:40:51', 'Invoice'], ['10:05:27', 'Meeting notes']];
  rows.forEach(([t, s], i) => {
    const a = ap(lt, 13.0 + i * 0.4, 0.5), y = 704 + i * 54;
    ctx.save(); ctx.globalAlpha *= a; rr(822, y, 1000, 46, 10); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill(); ctx.restore();
    text('alice', cols[0], y + 33, { size: 26, font: MONO, color: SC[0], a });
    text(`${t}`, cols[1], y + 33, { size: 26, font: MONO, a }); text(s, cols[2], y + 33, { size: 26, color: MUTE, a });
  });
  if (lt > 19.9) { const a = ap(lt, 19.9); arrow(1775, 712, 1775, 836, { color: C_QUEUE, p: ap(lt, 20.3, 1.2), a, w: 4 }); text('creation time', 1750, 780, { size: 20, color: C_QUEUE, a, align: 'right' }); }
  text('illustrative', 1800, 662, { size: 20, color: DIM, align: 'right', a: ta });
  bullet(0, 'Same user → same shard', ap(lt, 4.2)); bullet(1, 'Primary key = two parts', ap(lt, 12.3)); bullet(2, 'Partition key picks the shard', ap(lt, 14.8)); bullet(3, 'Clustering key sorts rows', ap(lt, 17.1)); bullet(4, 'timeuuid: creation order', ap(lt, 19.9));
}

// ───────── 7 Denormalization: read / unread ─────────
function sceneViews(lt) {
  header(lt, '07', 'Cost of denormalizing', SC[3], 'Easier reads, harder writes');
  const fa = ap(lt, 1.0) * (1 - P(lt, 6.4, 7.4));
  if (fa > 0) {
    glass(800, 200, 1040, 110, { a: fa, accent: RED });
    text('WHERE is_read = false', 840, 268, { size: 40, weight: 700, font: MONO, a: fa });
    const sp = ap(lt, 3.0, 0.6); ctx.save(); ctx.globalAlpha *= fa; ctx.fillStyle = RED; rr(836, 244, 500 * sp, 5, 2); ctx.fill(); ctx.restore();
    text('Non-key filter: unbounded scan', 1810, 266, { size: 26, weight: 700, color: RED, align: 'right', a: ap(lt, 3.4) * fa });
  }
  const row = (x, y, label, unread, a = 1) => {
    ctx.save(); ctx.globalAlpha *= a; rr(x, y, 470, 46, 10); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.restore();
    dot(x + 28, y + 24, 7, unread ? SC[0] : DIM, { g: unread ? 10 : 0, a });
    text(label, x + 52, y + 33, { size: 26, weight: 600, font: MONO, a });
    text(unread ? 'unread' : 'read', x + 452, y + 33, { size: 22, color: unread ? SC[0] : MUTE, align: 'right', a });
  };
  const ux = 800, rx = 1340, ty = 330;
  const mv = eIO(P(lt, 13.6, 15.3)), sh = eIO(P(lt, 15.3, 16.0));
  const n = lt < 16.8 ? 4 : 3;
  glass(ux, ty - 10, 500, 340, { a: ap(lt, 9.0), accent: SC[0] });
  glass(rx, ty - 10, 500, 340, { a: ap(lt, 7.6), accent: C_CLIENT });
  text('Unread table', ux + 20, ty + 34, { size: 30, weight: 800, color: SC[0], a: ap(lt, 9.0) });
  text(`unread ${n}`, ux + 480, ty + 34, { size: 28, weight: 800, font: MONO, align: 'right', a: ap(lt, 9.0) });
  text('Read table', rx + 20, ty + 34, { size: 30, weight: 800, color: C_CLIENT, a: ap(lt, 7.6) });
  const unread = ['M1', 'M2', 'M3', 'M4'];
  unread.forEach((m, i) => {
    const a = ap(lt, 9.2 + i * 0.25, 0.5);
    let y = ty + 56 + i * 58, x = ux + 15;
    if (i === 2) { const q = mv; x = lerp(ux + 15, rx + 15, q); y = lerp(y, ty + 56 + 2 * 58, q) - Math.sin(q * Math.PI) * 50; row(x, y, m, q < 0.5, a); return; }
    if (i === 3) y -= 58 * sh;
    row(x, y, m, true, a);
  });
  ['M5', 'M6'].forEach((m, i) => row(rx + 15, ty + 56 + i * 58, m, false, ap(lt, 7.8 + i * 0.25, 0.5)));
  if (lt > 13.6 && lt < 15.6) ringPulse(ux + 240, ty + 56 + 2 * 58 + 23, SC[3], lt, 13.6, 60, 40);
  const st = [['① Delete from unread', 13.6, SC[0]], ['② Write to read table', 15.3, C_CLIENT], ['③ Unread count −1', 17.0, SC[3]]];
  st.forEach(([s, t, c], i) => { const a = ap(lt, t); glass(800 + i * 358, 700, 330, 80, { a, accent: c, r: 20 }); text(s, 800 + i * 358 + 20, 750, { size: fitSize(s, 26, 292, 700, 20), weight: 700, a }); });
  const ia = ap(lt, 18.7);
  glass(800, 810, 1040, 90, { a: ia, accent: RED });
  text('Events repeat or reorder → idempotent writes', 830, 866, { size: 30, weight: 700, a: ia });
  text('Record applied version', 1810, 866, { size: 24, color: MUTE, align: 'right', a: ap(lt, 20.8) });
  bullet(0, 'Read: query the matching table', ap(lt, 7.4)); bullet(1, 'Write: maintain several views', ap(lt, 12.4)); bullet(2, 'Duplicates, reordering → idempotent', ap(lt, 18.7));
}

// ───────── 8 Search and the index watermark ─────────
function sceneSearch(lt) {
  header(lt, '08', 'Search and indexing', C_SEARCH, 'Async writes, near-real-time');
  const w = 200, h = 110, Y = 210, xs = [800, 1080, 1360, 1640];
  bx(lt, 0.7, xs[0], Y, w, h, 'Primary', { color: C_DB, sub: 'mail store' });
  bx(lt, 12.0, xs[1], Y, w, h, 'Kafka', { color: C_QUEUE, sub: 'change log' });
  bx(lt, 13.1, xs[2], Y, w, h, 'Indexer', { color: C_SVC, sub: 'consumer' });
  bx(lt, 1.0, xs[3], Y, w, h, 'ES index', { color: C_SEARCH, sub: 'Elasticsearch', size: 32 });
  [[1, 12.0], [2, 13.1], [3, 14.2]].forEach(([i, t]) => arrow(xs[i - 1] + w + 6, Y + 55, xs[i] - 6, Y + 55, { color: DIM, p: ap(lt, t), a: ap(lt, t) }));
  const sp = ap(lt, 2.9);
  [0, 1, 2].forEach((i) => { const x = 1650 + i * 66; glass(x, 350, 56, 56, { a: sp, r: 10, accent: i === 0 ? SC[0] : null }); if (i === 0 && lt > 4.5) dot(x + 28, 378, 9, SC[0], { g: 10, a: ap(lt, 4.5) }); else dot(x + 28, 378, 5, DIM, { g: 0, a: sp * 0.7 }); });
  text('Routed by user_id', 1840, 446, { size: 22, color: MUTE, align: 'right', a: sp });
  if (lt > 4.5) text('Same user → same shard', 1840, 480, { size: 22, color: SC[0], align: 'right', a: ap(lt, 4.5), weight: 700 });
  hop(lt, 12.0, 13.1, xs[0] + w, Y + 55, xs[1], Y + 55, '#fff', { s: 0.8 });
  hop(lt, 13.1, 14.2, xs[1] + w, Y + 55, xs[2], Y + 55, '#fff', { s: 0.8 });
  hop(lt, 14.2, 15.2, xs[2] + w, Y + 55, xs[3], Y + 55, C_SEARCH, { s: 0.8 });
  const sa = ap(lt, 14.8);
  glass(800, 360, 480, 64, { a: sa, r: 32 });
  text('Search: invoice', 836, 402, { size: 28, a: sa });
  arrow(1290, 392, 1636, 392, { color: C_SEARCH, p: ap(lt, 16.0, 0.7), a: ap(lt, 16.0), dash: [8, 7] });
  lab('sync query', 1460, 374, ap(lt, 16.0), { align: 'center' });
  const za = ap(lt, 16.8) * (1 - P(lt, 24.5, 25.1));
  text('0 results', 1250, 464, { size: 30, weight: 800, font: MONO, color: RED, align: 'right', a: za });
  text('Not searchable yet', 800, 464, { size: 24, color: RED, a: za });
  if (lt > 25.0) text('invoice: 1 hit', 1250, 464, { size: 30, weight: 800, font: MONO, color: SC[4], align: 'right', a: ap(lt, 25.0) });
  // watermark panel
  const pa = ap(lt, 17.2);
  glass(800, 520, 1040, 380, { a: pa, accent: C_QUEUE });
  text('Locating the watermark · Kafka partition', 830, 566, { size: 28, weight: 700, color: C_QUEUE, a: pa });
  text('numbers illustrative', 1810, 566, { size: 20, color: DIM, align: 'right', a: pa });
  const X0 = 880, X1 = 1760, ty = 700, ox = (o) => X0 + ((o - 4270) / 50) * (X1 - X0);
  ctx.save(); ctx.globalAlpha *= pa; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X0, ty); ctx.lineTo(X1, ty); ctx.stroke(); ctx.restore();
  const cons = lerp(4280, 4315, eIO(P(lt, 20.1, 21.9)));
  const lagA = P(lt, 19.8, 20.3);
  if (lagA > 0) { ctx.save(); ctx.globalAlpha *= lagA * 0.7; glow(SC[3], 10); ctx.fillStyle = SC[3]; rr(ox(cons), ty - 9, Math.max(ox(4315) - ox(cons), 0), 18, 8); ctx.fill(); ctx.restore(); }
  dot(ox(4312), ty, 10, '#fff', { g: 18, a: pa });
  text('this email 4312', ox(4312), ty + 52, { size: 22, color: INK, align: 'center', weight: 700, a: pa });
  dot(ox(4315), ty, 7, C_QUEUE, { g: 10, a: pa });
  text('log end 4315', ox(4315) + 30, ty + 80, { size: 22, color: C_QUEUE, align: 'right', weight: 700, a: pa });
  const cp = ap(lt, 19.8);
  ctx.save(); ctx.globalAlpha *= cp; ctx.fillStyle = C_SVC; glow(C_SVC, 12); ctx.beginPath(); ctx.moveTo(ox(cons), ty - 12); ctx.lineTo(ox(cons) - 14, ty - 40); ctx.lineTo(ox(cons) + 14, ty - 40); ctx.closePath(); ctx.fill(); ctx.restore();
  text(`consumer offset ${Math.round(cons)}`, Math.min(ox(cons), ox(4315) - 270), ty - 58, { size: 22, color: C_SVC, align: 'center', weight: 700, a: cp, font: MONO });
  [['① In primary store', 17.4, C_DB], ['② Offset caught up', 19.8, C_SVC], ['③ ES write done', 22.2, C_SEARCH], ['④ Wait for refresh', 24.4, SC[4]]].forEach(([s, t, c], i) => {
    const a = ap(lt, t), x = 816 + i * 256;
    glass(x, 790, 240, 70, { a, r: 18, accent: c }); text(s, x + 120, 834, { size: fitSize(s, 23, 216, 700, 18), weight: 700, align: 'center', a });
  });
  bullet(0, 'Write: store → Kafka → index', ap(lt, 12.0)); bullet(1, 'Read: synchronous search', ap(lt, 14.8)); bullet(2, 'Not found? Check the store', ap(lt, 17.4)); bullet(3, 'Then the queue offset', ap(lt, 19.8));
}

// ───────── 9 Four levels of "success" ─────────
function sceneLevels(lt) {
  header(lt, '09', 'Four levels of success', SC[3], 'One checkmark, four meanings');
  const L = [[['System', 'accepted'], SC[0], '10:00', 4.1], [['Their SMTP', 'accepted'], SC[1], '10:01', 6.6], [['Reached', 'inbox'], SC[2], '10:02', 9.7], [['User', 'read it'], SC[3], '11:30', 11.9]];
  const lit = lt > 13.2;
  L.forEach(([ls, c, t, t0], i) => {
    const x = 800 + i * 262, a = ap(lt, t0) * (lit && i < 3 ? 0.4 : 1), p = eBack(P(lt, t0, t0 + 0.6));
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 24);
    glass(x, 250, 240, 230, { accent: c, r: 24, a: 1 });
    text(`0${i + 1}`, x + 24, 300, { size: 22, color: c, weight: 700, font: MONO, ls: 3 });
    text(ls[0], x + 24, 372, { size: fitSize(ls[0], 34, 192, 800, 24), weight: 800 }); text(ls[1], x + 24, 420, { size: fitSize(ls[1], 34, 192, 800, 24), weight: 800, color: c });
    ctx.restore();
    const dx = x + 120;
    if (i < 3) { const q = ap(lt, L[i + 1][3] - 0.2, 0.5); arrow(dx + 14, 560, dx + 262 - 14, 560, { color: DIM, p: q, a: q * (lit ? 0.4 : 1), w: 3, head: 10 }); }
    dot(dx, 560, 12, c, { g: 14, a: a });
    text(t, dx, 614, { size: 28, weight: 700, font: MONO, align: 'center', color: INK, a });
  });
  text('illustrative times', 800, 668, { size: 20, color: DIM, a: ap(lt, 4.1) });
  const na = ap(lt, 13.2);
  ctx.save(); ctx.globalAlpha *= na; ctx.strokeStyle = SC[3]; ctx.lineWidth = 3; glow(SC[3], 14); rr(800 + 3 * 262 - 8, 242, 256, 246, 28); ctx.stroke(); ctx.restore();
  const ba = ap(lt, 16.2);
  glass(800, 720, 1040, 130, { a: ba, accent: RED });
  text('SMTP accepted  ≠  user read', 836, 800, { size: 52, weight: 800, a: ba });
  statCard(110, 430, 640, 'One checkmark is really', '4 levels', { color: SC[3], a: ap(lt, 2.0) });
  bullet(3, 'First three ≠ read', ap(lt, 13.2), { y0: 520 }); bullet(4, 'Could even land in spam', ap(lt, 14.7), { y0: 520, color: MUTE });
}

// ───────── 10 Wrap-up ─────────
function sceneEnd(lt) {
  text('Distributed Email Service', 110, 250, { size: fitSize('Distributed Email Service', 84, 1700, 900, 50), weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Chapter 23 · Recap', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['SMTP', ['Servers relay via SMTP;', 'users read via IMAP / POP / HTTP'], SC[1], 2.7], ['Separate storage', ['Metadata in the database,', 'attachments in object storage'], SC[3], 4.3], ['Shard by user', ['Partition by user_id;', 'search routes by it too'], SC[0], 6.0]].forEach(([w, s, c, t0], k) => {
    const p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 580;
    glass(x, 400, 540, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 400, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 460, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 536, { size: fitSize(w, 62, 468, 800, 40), weight: 800 });
    s.forEach((l, i) => text(l, x + 36, 580 + i * 30, { size: fitSize(l, 24, 468, 500, 20), color: MUTE }));
    ctx.restore();
  });
  const fa = ap(lt, 7.6);
  text('Accept reliably first, then asynchronously', 110, 740, { size: 26, color: MUTE, a: fa });
  let bxp = 110;
  [['Deliver', 9.5], ['Index', 10.3], ['Notify', 11.0]].forEach(([s, t], k) => { bxp += badge(bxp, 770, s, [C_QUEUE, C_SEARCH, SC[3]][k], ap(lt, t)) + 16; });
}

export const scenes = { title: sceneTitle, proto: sceneProto, send: sceneSend, retry: sceneRetry, receive: sceneReceive, store: sceneStore, shard: sceneShard, views: sceneViews, search: sceneSearch, levels: sceneLevels, end: sceneEnd };
