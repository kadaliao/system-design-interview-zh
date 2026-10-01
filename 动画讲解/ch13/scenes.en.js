// Chapter 13 Search Autocomplete: English scenes（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rr, glass, text, glow, dot, badge, header as header0, arrow, box, packet, statCard, bullet } from '../lib/core.js';

// 英文标题更宽：自适应字号，保证不超过左栏 640px
function header(lt, num, title, accent, sub) {
  ctx.save(); ctx.font = `800 70px ${SANS}`; const w = ctx.measureText(title).width; ctx.restore();
  const size = Math.min(70, Math.floor(70 * 640 / Math.max(w, 1)));
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: 26, color: MUTE });
  ctx.restore();
}

export const meta = { no: 13, title: 'Search Autocomplete', en: 'Search Autocomplete' };

const AMBER = SC[3], CYAN = SC[0], INDIGO = SC[1], PINK = SC[2], LIME = SC[4];
const tw = (s, size, weight = 600, font = MONO) => { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; const w = ctx.measureText(s).width; ctx.restore(); return w; };

// ───────── Trie 数据（示意：次数为示意值，k=3） ─────────
const WORDS = [['tree', 10], ['true', 35], ['try', 29], ['toy', 14], ['win', 50], ['wish', 25]];
const CNT = Object.fromEntries(WORDS);
const IDS = [''];
WORDS.forEach(([w]) => { for (let i = 1; i <= w.length; i++) { const id = w.slice(0, i); if (!IDS.includes(id)) IDS.push(id); } });
const kids = (id) => IDS.filter((x) => x.length === id.length + 1 && x.startsWith(id));
const LEAFY = { tree: 215, true: 300, try: 385, toy: 470, win: 565, wish: 650 };
const NY = {};
(function fill(id) { const k = kids(id); if (!k.length) { NY[id] = LEAFY[id]; return NY[id]; } const ys = k.map(fill); NY[id] = ys.reduce((a, b) => a + b, 0) / ys.length; return NY[id]; })('');
const TD = { x0: 870, dx: 170 };
const nodeXY = (id) => [TD.x0 + id.length * TD.dx, NY[id]];
const cacheOf = (id) => WORDS.filter(([w]) => w.startsWith(id)).sort((a, b) => b[1] - a[1]).slice(0, 3);
const subtree = (id) => WORDS.filter(([w]) => w.startsWith(id));

function drawTrie(o = {}) {
  const na = o.na || (() => 1), ep = o.ep || (() => 1), st = o.st || (() => 0), col = o.col || (() => CYAN),
    pill = o.pill || (() => 0), cnt = o.cnt || (() => 0), lp = o.lp || null;
  for (const id of IDS) {
    if (!id) continue;
    const a = clamp(na(id)); if (a <= 0.02) continue;
    const [x1, y1] = nodeXY(id.slice(0, -1)), [x2, y2] = nodeXY(id), p = clamp(ep(id)), s = clamp(st(id));
    ctx.save(); ctx.globalAlpha *= a; ctx.lineCap = 'round';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.17)';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, p), lerp(y1, y2, p)); ctx.stroke();
    const q = lp ? clamp(lp(id)) : s > 0.05 ? 1 : 0;
    if (q > 0.01) { ctx.lineWidth = 5; ctx.strokeStyle = col(id); ctx.globalAlpha *= lp ? 1 : s; glow(col(id), 14); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(lerp(x1, x2, q), lerp(y1, y2, q)); ctx.stroke(); }
    ctx.restore();
  }
  for (const id of IDS) {
    const a = clamp(na(id)); if (a <= 0.02) continue;
    const [x, y] = nodeXY(id), s = clamp(st(id)), c = col(id), isW = id in CNT;
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); const sc = lerp(0.6, 1, a) * (1 + s * 0.08); ctx.scale(sc, sc);
    if (s > 0.02) glow(c, 26 * s);
    ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill();
    ctx.shadowBlur = 0; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(52,213,200,0.5)'; ctx.stroke();
    if (s > 0.02) { ctx.fillStyle = c + '38'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill(); ctx.globalAlpha *= s; ctx.strokeStyle = c; glow(c, 18); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(sc, sc);
    if (isW) { ctx.lineWidth = 2; ctx.strokeStyle = INDIGO; ctx.beginPath(); ctx.arc(0, 0, 33, 0, 7); ctx.stroke(); }
    ctx.restore();
    text(id ? id[id.length - 1] : 'root', x, y + 9, { size: id ? 28 : 20, weight: 800, align: 'center', font: MONO, a });
    if (isW) {
      text(id, x + 46, y + 9, { size: 26, weight: 700, font: MONO, a });
      const ca = clamp(cnt(id));
      if (ca > 0.02) text(String(CNT[id]), x + 46 + tw(id, 26, 700) + 14, y + 9, { size: 26, weight: 800, font: MONO, color: INDIGO, a: ca });
    }
    const pa = clamp(pill(id));
    if (pa > 0.02) { ctx.save(); ctx.globalAlpha *= pa; ctx.fillStyle = AMBER; glow(AMBER, 12); rr(x - 20, y + 36, 40, 10, 5); ctx.fill(); ctx.restore(); }
  }
}

function searchBox(x, y, w, h, str, lt, { a = 1, accent = INDIGO, cursor = true } = {}) {
  glass(x, y, w, h, { a, accent, r: h / 2 });
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = MUTE; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  const cx = x + h / 2 + 2, cy = y + h / 2 - 3;
  ctx.beginPath(); ctx.arc(cx, cy, h * 0.17, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + h * 0.12, cy + h * 0.12); ctx.lineTo(cx + h * 0.25, cy + h * 0.25); ctx.stroke(); ctx.restore();
  text(str, x + h + 6, y + h / 2 + 12, { size: 36, font: MONO, weight: 700, a });
  if (cursor && Math.floor(lt * 2.2) % 2 === 0) { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = CYAN; ctx.fillRect(x + h + 10 + tw(str, 36, 700), y + h / 2 - 20, 3, 40); ctx.restore(); }
}
function sugRow(x, y, w, word, count, a = 1, { accent = null, h = 52, strike = false } = {}) {
  if (a <= 0.02) return;
  glass(x, y, w, h, { a, r: 14, accent, fill: 0.05 });
  text(word, x + 22, y + h / 2 + 10, { size: 28, font: MONO, weight: 700, a });
  text(String(count), x + w - 22, y + h / 2 + 10, { size: 28, font: MONO, weight: 800, color: INDIGO, align: 'right', a });
  if (strike) { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = RED; ctx.fillRect(x + 18, y + h / 2 + 2, tw(word, 28, 700) + 8, 3); ctx.restore(); }
}
// 舞台下方的结果面板（y 745–915）
function panel(title, note, a = 1, accent = LIME) {
  glass(820, 745, 1020, 170, { a, accent, r: 22 });
  text(title, 846, 786, { size: 24, weight: 600, color: MUTE, a });
  if (note) text(note, 1814, 786, { size: 20, color: DIM, align: 'right', a });
}
function cards(items, a, { y = 808, dy = 0, hi = true } = {}) {
  items.forEach(([w, c], i) => sugRow(840 + i * 330, y + dy, 310, w, c, a, { accent: hi ? LIME : null, h: 76 }));
}

// ───────── 场景：片头 ─────────
function sceneTitle(lt, d) {
  const o0 = TD.x0, o1 = TD.dx; TD.x0 = 1010; TD.dx = 150;
  const seq = [['', 3.0], ['t', 3.6], ['tr', 4.2], ['tru', 4.8], ['true', 5.4]];
  const lit = (id) => (lt >= seq.find((s) => s[0] === id)[1] ? 1 : 0);
  const known = (id) => seq.some((s) => s[0] === id);
  ctx.save(); ctx.globalAlpha *= 0.92;
  drawTrie({
    na: (id) => eOut(P(lt, 0.4 + id.length * 0.35 + (id.length ? NY[id] / 2000 : 0), 1.0 + id.length * 0.35 + (id.length ? NY[id] / 2000 : 0))),
    st: (id) => (known(id) ? clamp(lit(id) * (1 - 0 * lt)) : 0), col: () => LIME,
    pill: (id) => eOut(P(lt, 2.2 + id.length * 0.2, 2.8 + id.length * 0.2)) * 0.8,
    cnt: (id) => eOut(P(lt, 2.0, 2.6)),
  });
  ctx.restore(); TD.x0 = o0; TD.dx = o1;
  const a = eOut(P(lt, 0.2, 1.2));
  text('SYSTEM DESIGN INTERVIEW · ANIMATED', 110, 330, { size: 30, weight: 600, color: CYAN, ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = eOut(P(lt, 0.4, 1.4)); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 112px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '1px'; ctx.fillText('Search', 104, 470); ctx.fillText('Autocomplete', 104, 590); ctx.restore();
  text('Chapter 13', 112, 680, { size: 36, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 1：现算的代价 ─────────
const TBL0 = [['tree', 10], ['wish', 25], ['toy', 14], ['true', 35], ['win', 50], ['try', 29]];
const TBL1 = [['true', 35], ['try', 29], ['tree', 10], ['wish', 25], ['toy', 14], ['win', 50]];
function sceneNaive(lt, d) {
  header(lt, '01', 'Compute on Demand', RED, 'Frequency table + sorting every time');
  const ta = eOut(P(lt, 0.5, 1.3));
  glass(820, 180, 540, 560, { a: ta, accent: INDIGO });
  text('Frequency table (illustrative)', 850, 222, { size: 24, weight: 600, color: MUTE, a: ta });
  text('Count', 1330, 222, { size: 22, color: DIM, align: 'right', a: ta });
  const mv = eIO(P(lt, 11.5, 12.9)), pre = 'tr';
  TBL0.forEach(([w, c], i) => {
    const j = TBL1.findIndex((r) => r[0] === w), y = lerp(250 + i * 66, 250 + j * 66, mv), m = w.startsWith(pre);
    const ts = 7.0 + i * 0.5, scan = lt >= ts && lt < ts + 0.5, done = lt >= ts + 0.5;
    const al = ta * eOut(P(lt, 0.7 + i * 0.1, 1.3 + i * 0.1)) * (!m && done ? lerp(1, 0.35, eOut(P(lt, 7.4 + i * 0.5, 8.0 + i * 0.5))) : 1);
    ctx.save(); ctx.globalAlpha *= al; rr(840, y, 500, 54, 14); ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fill();
    if (scan) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; glow('#fff', 16); ctx.stroke(); }
    else if (done && m) { ctx.strokeStyle = LIME; ctx.lineWidth = 3; glow(LIME, 12); ctx.stroke(); }
    ctx.restore();
    text(w, 866, y + 37, { size: 28, font: MONO, weight: 700, a: al });
    text(String(c), 1320, y + 37, { size: 28, font: MONO, weight: 800, color: INDIGO, align: 'right', a: al });
  });
  text('… far more rows in reality', 850, 705, { size: 22, color: DIM, a: ta });
  // 搜索框与结果
  const s = lt < 1.5 ? '' : lt < 2.4 ? 't' : 'tr';
  searchBox(1400, 200, 440, 76, s, lt, { a: eOut(P(lt, 0.8, 1.5)) });
  const ra = eOut(P(lt, 13.0, 13.8));
  ['true', 'try', 'tree'].forEach((w, i) => sugRow(1400, 296 + i * 62, 440, w, CNT[w], ra * eOut(P(lt, 13.0 + i * 0.25, 13.6 + i * 0.25)), { accent: LIME }));
  // 耗时示意
  const ma = eOut(P(lt, 3.4, 4.2));
  glass(1400, 540, 440, 200, { a: ma, r: 22 });
  text('Latency (illustrative)', 1426, 580, { size: 22, color: MUTE, a: ma });
  text('Budget', 1426, 636, { size: 22, color: LIME, weight: 700, a: ma });
  ctx.save(); ctx.globalAlpha *= ma; ctx.fillStyle = LIME; glow(LIME, 12); rr(1530, 618, 100, 22, 11); ctx.fill(); ctx.restore();
  text('100ms', 1646, 637, { size: 22, font: MONO, color: LIME, a: ma });
  text('Naive', 1426, 696, { size: 22, color: RED, weight: 700, a: ma });
  const bl = lerp(30, 290, eOut(P(lt, 7.0, 13.0)));
  ctx.save(); ctx.globalAlpha *= ma; ctx.fillStyle = RED; glow(RED, 12); rr(1530, 678, bl, 22, 11); ctx.fill(); ctx.restore();
  bullet(0, 'Scan the whole table', eOut(P(lt, 6.8, 7.4)));
  bullet(1, 'Sort the matches', eOut(P(lt, 11.3, 11.9)));
  bullet(2, 'Redo it every keystroke', eOut(P(lt, 13.4, 14.0)));
  statCard(110, 640, 640, 'Peak QPS', '48,000', { color: INDIGO, a: eOut(P(lt, 14.6, 15.2)) });
  statCard(110, 770, 640, 'Latency target', '< 100 ms', { color: LIME, a: eOut(P(lt, 16.8, 17.4)) });
}

// ───────── 场景 2：Trie ─────────
const INS = [1.6, 3.0, 4.4, 5.8, 7.2, 8.4];
const CRE = {}; IDS.forEach((id) => { let t = id ? 99 : 0.6; WORDS.forEach(([w], i) => { if (id && w.startsWith(id)) t = Math.min(t, INS[i] + (id.length - 1) * 0.3); }); CRE[id] = t; });
const REUSE = []; WORDS.forEach(([w], i) => { for (let k = 1; k <= w.length; k++) { const id = w.slice(0, k), t = INS[i] + (k - 1) * 0.3; if (Math.abs(CRE[id] - t) > 0.01) REUSE.push([id, t]); } });
function sceneTrie(lt, d) {
  header(lt, '02', 'Trie (Prefix Tree)', CYAN, 'One level per prefix character');
  const pulse = (id) => { let v = 0; if (CRE[id] <= lt) v = Math.max(v, 1 - P(lt, CRE[id] + 0.1, CRE[id] + 0.7)); REUSE.forEach(([i2, t]) => { if (i2 === id && lt >= t) v = Math.max(v, 1 - P(lt, t, t + 0.6)); }); return v; };
  const share = eOut(P(lt, 10.0, 10.8)) * (1 - eOut(P(lt, 13.6, 14.2)));
  drawTrie({
    na: (id) => eBack(P(lt, CRE[id], CRE[id] + 0.4)), ep: (id) => eOut(P(lt, CRE[id] - 0.1, CRE[id] + 0.3)),
    st: (id) => Math.max(pulse(id), (id === 't' || id === 'tr') ? share : 0), col: (id) => ((id === 't' || id === 'tr') && share > 0.05 ? PINK : LIME),
    cnt: (id) => eOut(P(lt, 14.4 + WORDS.findIndex((w) => w[0] === id) * 0.4, 15.0 + WORDS.findIndex((w) => w[0] === id) * 0.4)),
  });
  ['t', 'tr'].forEach((id) => { const [x, y] = nodeXY(id); text('shared', x, y - 44, { size: 22, weight: 700, color: PINK, align: 'center', a: share }); });
  bullet(0, 'One level per character', eOut(P(lt, 5.2, 5.8)));
  bullet(1, 'Shared prefix stored once', eOut(P(lt, 7.6, 8.2)));
  bullet(2, 'End node holds the count', eOut(P(lt, 14.0, 14.6)));
  statCard(110, 640, 640, 'true / try / tree share', 't → r', { color: PINK, a: eOut(P(lt, 10.2, 10.8)) });
  text('Counts are illustrative', 830, 905, { size: 20, color: DIM, a: eOut(P(lt, 14.8, 15.4)) });
}

// ───────── 场景 3：朴素 top-k（遍历子树） ─────────
const VIS = ['tr', 'tre', 'tree', 'tru', 'true', 'try', 'to', 'toy'];
const tv = (i) => 7.6 + i * 0.5;
function sceneWalk(lt, d) {
  header(lt, '03', 'Naive Top-k', PINK, 'Walk the whole subtree every time');
  const s = lt < 4.8 ? '' : 't';
  searchBox(110, 372, 640, 74, s, lt, { a: eOut(P(lt, 0.8, 1.4)) });
  const pathA = eOut(P(lt, 5.4, 6.2));
  const vi = (id) => VIS.indexOf(id);
  drawTrie({
    st: (id) => { if (id === '') return pathA; if (id === 't') return pathA; const i = vi(id); if (i < 0) return 0; return lt >= tv(i) ? lerp(0.55, 1, 1 - P(lt, tv(i), tv(i) + 0.6)) : 0; },
    col: (id) => (vi(id) >= 0 && lt < tv(vi(id)) + 0.5 ? AMBER : PINK),
    lp: (id) => { if (id === 't') return pathA; const i = vi(id); return i >= 0 && lt >= tv(i) ? eOut(P(lt, tv(i) - 0.15, tv(i) + 0.3)) : 0; },
    cnt: () => 1,
  });
  // 收集面板
  const collected = ['tree', 'true', 'try', 'toy'], lv = ['tree', 'true', 'try', 'toy'].map((w) => vi(w));
  const sorted = ['true', 'try', 'toy', 'tree'], mv = eIO(P(lt, 11.8, 12.9));
  const pa = eOut(P(lt, 7.0, 7.8));
  panel(lt < 11.8 ? 'Complete words collected (in visit order)' : 'Sorted by count, top 3', 'illustrative · k=3', pa, PINK);
  collected.forEach((w, i) => {
    const born = eBack(P(lt, tv(lv[i]) + 0.2, tv(lv[i]) + 0.7)); if (born < 0.03) return;
    const j = sorted.indexOf(w), x = lerp(840 + i * 255, 840 + j * 255, mv), drop = w === 'tree' ? eOut(P(lt, 13.0, 13.8)) : 0;
    sugRow(x, 808 + 0 * born, 235, w, CNT[w], clamp(born) * (1 - drop * 0.6), { accent: w === 'tree' && drop > 0 ? RED : mv > 0.99 ? LIME : PINK, h: 76, strike: drop > 0.5 });
  });
  const n = VIS.filter((_, i) => lt >= tv(i)).length;
  bullet(0, '1. Walk to the prefix node', eOut(P(lt, 5.6, 6.2)), { y0: 520, step: 56 });
  bullet(1, '2. Traverse the whole subtree', eOut(P(lt, 7.2, 7.8)), { y0: 520, step: 56 });
  bullet(2, '3. Sort, keep the top 3', eOut(P(lt, 11.6, 12.2)), { y0: 520, step: 56 });
  bullet(3, 'Shorter prefix = bigger subtree', eOut(P(lt, 14.4, 15.0)), { y0: 520, step: 56, color: RED });
  statCard(110, 740, 640, 'Subtree nodes visited', `${n}`, { color: RED, a: eOut(P(lt, 7.2, 7.8)), note: n ? 'nodes' : '' });
}

// ───────── 场景 4：节点缓存 top-k ─────────
const POST = []; (function po(id) { kids(id).forEach(po); POST.push(id); })('');
function sceneCache(lt, d) {
  header(lt, '04', 'Node-Level Cache', AMBER, 'Do the work first, attach the answer');
  const pt = (id) => 6.6 + POST.indexOf(id) * 0.4;
  const focus = eOut(P(lt, 13.4, 14.0));
  drawTrie({
    pill: (id) => { const a = eBack(P(lt, pt(id), pt(id) + 0.35)); return clamp(a) * (id === 't' ? 1 : lerp(1, 0.55, focus)); },
    st: (id) => (id === 't' ? focus : 0), col: () => AMBER, cnt: () => 1,
  });
  text('Amber bar = top-3 cached at this node', 860, 172, { size: 22, color: MUTE, a: eOut(P(lt, 6.4, 7.0)) });
  const ba = eOut(P(lt, 1.0, 1.8));
  if (lt < 6.4) badge(830, 790, 'Precomputed offline', AMBER, ba * (1 - eOut(P(lt, 6.0, 6.6))));
  panel(focus > 0.02 ? 'Top-3 cached at node t' : '', 'illustrative · k=3', focus, AMBER);
  cards(cacheOf('t'), focus, { hi: false });
  bullet(0, 'Precomputed in the background', eOut(P(lt, 6.8, 7.4)));
  bullet(1, 'Answer stored in the node', eOut(P(lt, 9.6, 10.2)));
  bullet(2, 'Online: just walk to the node', eOut(P(lt, 14.4, 15.0)));
  statCard(110, 640, 640, 'Cost', 'Extra storage', { color: AMBER, a: eOut(P(lt, 16.8, 17.4)) });
  statCard(110, 770, 640, 'Payoff', 'Faster queries', { color: LIME, a: eOut(P(lt, 18.7, 19.3)) });
}

// ───────── 场景 5：逐字输入 ─────────
const TT = [2.7, 7.6, 11.9, 13.1], TID = ['t', 'tr', 'tru', 'true'];
function sceneType(lt, d) {
  header(lt, '05', 'Typing, Letter by Letter', LIME, 'One level, one cache read');
  const n = TT.filter((t) => lt >= t).length, s = 'true'.slice(0, n);
  searchBox(110, 372, 640, 74, s, lt, { a: eOut(P(lt, 0.6, 1.2)) });
  const vis = (id) => TID.indexOf(id);
  drawTrie({
    st: (id) => (id === '' ? (lt >= TT[0] ? 1 : 0) : vis(id) >= 0 && lt >= TT[vis(id)] + 0.35 ? 1 : 0),
    col: () => LIME,
    lp: (id) => (vis(id) >= 0 ? eOut(P(lt, TT[vis(id)], TT[vis(id)] + 0.5)) : 0),
    pill: (id) => 0.5, cnt: () => 1,
  });
  // 当前节点高亮环
  TID.forEach((id, i) => { const on = lt >= TT[i] + 0.35 && (i === 3 || lt < TT[i + 1]); if (!on) return; const [x, y] = nodeXY(id); const k = (lt * 1.1) % 1; ctx.save(); ctx.strokeStyle = LIME; ctx.globalAlpha = 1 - k; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 38 + k * 16, 0, 7); ctx.stroke(); ctx.restore(); });
  // 结果面板：当前节点的缓存
  const idx = TT.reduce((r, t, i) => (lt >= t + 0.5 ? i : r), -1);
  const pa = eOut(P(lt, 1.0, 1.8));
  panel(idx >= 0 ? `Cache at node "${TID[idx]}"` : 'Type a prefix: its node\'s cached top-3 shows here', 'illustrative · k=3', pa, LIME);
  if (idx >= 0) {
    const p = eOut(P(lt, TT[idx] + 0.5, TT[idx] + 0.95));
    if (idx > 0 && p < 1) cards(cacheOf(TID[idx - 1]), (1 - p) * 0.8, { dy: p * -10 });
    cards(cacheOf(TID[idx]), p, { dy: (1 - p) * 14 });
  }
  statCard(110, 520, 640, 'Levels walked', `${n}`, { color: CYAN, a: eOut(P(lt, 1.6, 2.2)), note: n ? 'levels' : '' });
  statCard(110, 650, 640, 'Subtree nodes traversed', '0', { color: LIME, a: eOut(P(lt, 16.0, 16.6)) });
  statCard(110, 780, 640, 'Sorts performed', '0', { color: LIME, a: eOut(P(lt, 17.8, 18.4)) });
}

// ───────── 场景 6：离线流水线 ─────────
function pipe(lt, x1, y1, x2, y2, t0, color) {
  arrow(x1, y1, x2, y2, { color: color + '88', p: eOut(P(lt, t0, t0 + 0.6)), w: 3 });
  if (lt > t0 + 0.6) packet(x1, y1, x2, y2, ((lt - t0 - 0.6) * 0.45) % 1, color, { r: 8 });
}
function sceneBuild(lt, d) {
  header(lt, '06', 'Offline Pipeline', INDIGO, 'Logs → frequencies → new trie');
  const g = (t) => eBack(P(lt, t, t + 0.5));
  // 离线区域背景
  const ra = eOut(P(lt, 0.6, 1.4));
  ctx.save(); ctx.globalAlpha *= ra; ctx.setLineDash([10, 10]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; rr(810, 170, 1040, 460, 28); ctx.stroke(); ctx.restore();
  text('OFFLINE · BACKGROUND', 836, 208, { size: 22, color: DIM, weight: 600, a: ra, ls: 3 });
  box(830, 240, 270, 120, 'User Queries', { color: INDIGO, sub: 'search', a: clamp(g(4.3) * 2), s: lerp(0.8, 1, clamp(g(4.3))), size: 32 });
  box(1150, 240, 270, 120, 'Logs', { color: INDIGO, sub: 'Analytics Logs', a: clamp(g(5.0) * 2), s: lerp(0.8, 1, clamp(g(5.0))), size: 32 });
  box(1470, 240, 270, 120, 'Aggregators', { color: INDIGO, sub: 'batch job', a: clamp(g(7.0) * 2), s: lerp(0.8, 1, clamp(g(7.0))), size: 32 });
  box(1470, 460, 270, 120, 'Frequency', { color: INDIGO, sub: 'Table', a: clamp(g(9.0) * 2), s: lerp(0.8, 1, clamp(g(9.0))), size: 32 });
  box(1150, 460, 270, 120, 'Rebuild Trie', { color: INDIGO, sub: 'Workers', a: clamp(g(10.8) * 2), s: lerp(0.8, 1, clamp(g(10.8))), size: 32 });
  box(830, 460, 270, 120, 'Trie Store', { color: CYAN, sub: 'Cache / DB', a: clamp(g(12.6) * 2), s: lerp(0.8, 1, clamp(g(12.6))), size: 32 });
  pipe(lt, 1100, 300, 1150, 300, 5.4, INDIGO);
  text('append', 1125, 392, { size: 20, color: MUTE, align: 'center', a: eOut(P(lt, 6.0, 6.6)) });
  pipe(lt, 1420, 300, 1470, 300, 7.5, INDIGO);
  pipe(lt, 1605, 360, 1605, 460, 9.4, INDIGO);
  pipe(lt, 1470, 520, 1420, 520, 11.2, INDIGO);
  pipe(lt, 1150, 520, 1100, 520, 13.0, CYAN);
  // 在线服务读取
  const oa = eOut(P(lt, 13.8, 14.6));
  ctx.save(); ctx.globalAlpha *= oa; ctx.setLineDash([10, 10]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; rr(810, 670, 1040, 200, 28); ctx.stroke(); ctx.restore();
  text('ONLINE', 836, 708, { size: 22, color: DIM, weight: 600, a: oa, ls: 3 });
  box(830, 730, 270, 110, 'Query Service', { color: PINK, sub: 'online', a: oa, size: 30 });
  arrow(965, 725, 965, 590, { color: LIME + 'aa', a: oa, p: eOut(P(lt, 14.4, 15.2)), w: 3 });
  text('Read-only: fetch cached top-k', 1000, 660, { size: 22, color: LIME, a: eOut(P(lt, 14.8, 15.4)) });
  const wk = eBack(P(lt, 15.4, 16.0)); if (wk > 0.02) badge(1150, 760, 'Book: rebuilt weekly', AMBER, clamp(wk));
  bullet(0, 'Logs: append-only, no index', eOut(P(lt, 5.2, 5.8)));
  bullet(1, 'Aggregated into frequencies', eOut(P(lt, 7.6, 8.2)));
  bullet(2, 'Trie rebuilt in the background', eOut(P(lt, 11.0, 11.6)));
  statCard(110, 640, 640, 'Popular suggestions', 'Slow-moving', { color: AMBER, a: eOut(P(lt, 17.0, 17.6)), h: 112 });
}

// ───────── 场景 7：版本切换与过滤 ─────────
function sceneSwap(lt, d) {
  header(lt, '07', 'Switch & Filter', CYAN, 'Readers always see one full version');
  const sw = eIO(P(lt, 8.0, 8.9)), sa = eOut(P(lt, 0.6, 1.4));
  box(1090, 190, 260, 100, 'Query Service', { color: PINK, a: sa, size: 30 });
  const v2a = lerp(0.35, 1, eOut(P(lt, 4.6, 7.8)));
  box(830, 380, 330, 170, 'Trie v1', { color: CYAN, sub: sw > 0.5 ? 'kept for rollback' : 'serving traffic', a: sa * lerp(1, 0.55, sw), size: 36 });
  box(1330, 380, 330, 170, 'Trie v2', { color: CYAN, sub: sw > 0.5 ? 'serving traffic' : 'building aside', a: eOut(P(lt, 4.2, 4.8)) * v2a, size: 36 });
  const ex = lerp(995, 1495, sw);
  arrow(1220, 292, ex, 372, { color: LIME, p: eOut(P(lt, 1.4, 2.2)), w: 5, g: 10 });
  // 步骤条
  ['Build', 'Validate', 'Warm up', 'Switch'].forEach((s, i) => {
    const t = [4.8, 5.9, 6.8, 8.0][i], on = lt >= t, x = 830 + i * 256, a = eOut(P(lt, 4.4 + i * 0.1, 5.0 + i * 0.1));
    glass(x, 600, 230, 58, { a, r: 29, accent: on ? LIME : null, fill: on ? 0.12 : 0.04 });
    dot(x + 34, 629, 8, on ? LIME : DIM, { g: on ? 14 : 0, a });
    text(s, x + 58, 640, { size: 28, weight: 700, color: on ? INK : DIM, a });
  });
  // 过滤层
  const fa = eOut(P(lt, 13.4, 14.2));
  box(830, 720, 260, 110, 'Query Service', { color: PINK, sub: 'top-k', a: fa, size: 30 });
  box(1190, 720, 260, 110, 'Filter', { color: INDIGO, sub: 'filter layer', a: fa, size: 32 });
  box(1560, 720, 260, 110, 'User Sees', { color: LIME, sub: 'suggestions', a: fa, size: 32 });
  arrow(1090, 775, 1190, 775, { color: MUTE, a: fa, w: 3 }); arrow(1450, 775, 1560, 775, { color: MUTE, a: fa, w: 3 });
  [['true', 0], ['try', 0], ['toy', 0], ['harmful', 1]].forEach(([w, bad], j) => {
    const t0 = 15.2 + j * 0.55, p = eIO(P(lt, t0, t0 + 1.6)); if (p <= 0) return;
    const x = lerp(1010, bad ? 1120 : 1600 + j * 88, p), al = bad ? 1 - eOut(P(lt, t0 + 1.6, t0 + 2.2)) : 1;
    const cw = tw(w, 22, 700, bad ? SANS : MONO) + 28, c = bad ? RED : LIME, y = 672;
    ctx.save(); ctx.globalAlpha *= al; glow(c, 12); rr(x - cw / 2, y, cw, 34, 10); ctx.fillStyle = c + '30'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke(); ctx.shadowBlur = 0;
    text(w, x, y + 25, { size: 22, weight: 700, font: bad ? SANS : MONO, align: 'center', color: INK }); ctx.restore();
  });
  const xa = eOut(P(lt, 17.6, 18.2)); if (xa > 0) text('✕ Blocked', 1320, 872, { size: 24, weight: 700, color: RED, align: 'center', a: xa });
  text('Physical delete in background', 1500, 872, { size: 22, color: MUTE, a: eOut(P(lt, 19.4, 20)) });
  bullet(0, 'Build aside, validate, warm up', eOut(P(lt, 4.8, 5.4)));
  bullet(1, 'Switch as a whole, keep the old', eOut(P(lt, 8.2, 8.8)));
  bullet(2, 'Filter in the query path', eOut(P(lt, 15.0, 15.6)));
  statCard(110, 640, 640, 'Never do this', 'Overwrite in place', { color: RED, a: eOut(P(lt, 2.6, 3.2)), note: '' });
}

// ───────── 场景 8：前端协同 ─────────
const XT = (t) => 1010 + (t - 2.5) * 54;
const REQ = [['GET t', 3.4, 5.2, 580, 'ok'], ['GET tr', 10.4, 15.0, 580, 'stale'], ['GET tru', 11.2, 13.0, 700, 'ok']];
function sceneClient(lt, d) {
  header(lt, '08', 'Client Side', PINK, 'Cache, async, drop stale results');
  const s = lt < 3.3 ? '' : lt < 3.6 ? 't' : lt < 6.2 ? 't' : lt < 6.5 ? '' : lt < 8.8 ? 't' : lt < 9.0 ? '' : lt < 10.4 ? 't' : lt < 11.2 ? 'tr' : 'tru';
  const ba = eOut(P(lt, 0.5, 1.2));
  glass(830, 190, 470, 250, { a: ba, accent: INDIGO });
  searchBox(850, 208, 430, 60, s, lt, { a: ba, cursor: lt < 17 });
  const T_L = [['true', 35], ['try', 29], ['toy', 14]], TRU = [['true', 35]];
  let list = null, loading = false;
  if (lt >= 3.4 && lt < 5.2) loading = true; else if (lt >= 5.2 && lt < 6.2) list = T_L; else if (lt >= 6.5 && lt < 8.8) list = T_L;
  else if (lt >= 9.0 && lt < 13.0) list = T_L; else if (lt >= 13.0) list = TRU;
  if (loading) for (let i = 0; i < 3; i++) { ctx.save(); ctx.globalAlpha *= 0.25 + 0.1 * Math.sin(lt * 6 + i); rr(850, 284 + i * 46, 430, 38, 10); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore(); }
  if (list) list.forEach(([w, c], i) => { text(w, 872, 312 + i * 46, { size: 26, font: MONO, weight: 700 }); text(String(c), 1262, 312 + i * 46, { size: 24, font: MONO, weight: 800, color: INDIGO, align: 'right' }); });
  // 浏览器缓存
  const ca = eOut(P(lt, 2.4, 3.2));
  glass(1330, 190, 510, 250, { a: ca, accent: AMBER });
  text('Browser cache', 1360, 232, { size: 24, weight: 700, color: AMBER, a: ca });
  const ents = [['t', 5.3], ['tru', 13.1], ['tr', 15.1]];
  ents.forEach(([k, t0], i) => {
    const p = eBack(P(lt, t0, t0 + 0.4)); if (p < 0.03) return; const y = 256 + i * 56;
    const exp = k === 't' ? eOut(P(lt, 20.0, 20.4)) : 0;
    ctx.save(); ctx.globalAlpha *= clamp(p) * (1 - exp * 0.6); rr(1356, y, 458, 44, 12); ctx.fillStyle = AMBER + '1c'; ctx.fill(); ctx.strokeStyle = AMBER + '88'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    text(`"${k}"`, 1376, y + 30, { size: 24, font: MONO, weight: 700, a: clamp(p) * (1 - exp * 0.6) });
    text(exp > 0.5 ? 'Expired' : '→ suggestion list', 1500, y + 30, { size: 22, color: exp > 0.5 ? RED : MUTE, a: clamp(p) });
    if (k === 't' && lt >= 18.0) { const q = 1 - P(lt, 18.0, 20.0); ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(1788, y + 22, 13, 0, 7); ctx.stroke(); ctx.strokeStyle = q > 0 ? AMBER : RED; ctx.beginPath(); ctx.arc(1788, y + 22, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q); ctx.stroke(); ctx.restore(); }
  });
  text('TTL countdown', 1814, 232, { size: 20, color: DIM, align: 'right', a: eOut(P(lt, 17.8, 18.4)) });
  // 时间线
  const tl = eOut(P(lt, 2.4, 3.2));
  glass(830, 470, 1010, 440, { a: tl });
  text('Request timeline', 860, 512, { size: 22, color: MUTE, a: tl });
  ctx.save(); ctx.globalAlpha *= tl; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(860, 850); ctx.lineTo(1810, 850); ctx.stroke(); ctx.restore();
  text('time →', 1810, 884, { size: 20, color: DIM, align: 'right', a: tl });
  if (lt >= 2.5) { const nx = XT(Math.min(lt, 17)); ctx.save(); ctx.globalAlpha *= 0.5 * tl; ctx.setLineDash([4, 8]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(nx, 540); ctx.lineTo(nx, 850); ctx.stroke(); ctx.restore(); dot(nx, 850, 6, '#fff', { g: 12, a: tl }); }
  REQ.forEach(([name, ts, te, y, kind]) => {
    if (lt < ts) return;
    const x0 = XT(ts), x1 = XT(te), cx = lerp(x0, x1, clamp((lt - ts) / (te - ts))), done = lt >= te;
    const fade = lt >= 17 ? 1 : 1;
    text(name, x0, y - 22, { size: 22, font: MONO, weight: 700, a: eOut(P(lt, ts, ts + 0.3)) * fade });
    ctx.save(); const c = kind === 'stale' && done ? RED : INDIGO; ctx.fillStyle = c + '66'; glow(c, 10); rr(x0, y - 11, Math.max(cx - x0, 8), 22, 11); ctx.fill(); ctx.restore();
    dot(cx, y, done ? 9 : 11, kind === 'stale' && done ? RED : done ? LIME : '#fff', { g: 16 });
    if (done) {
      if (kind === 'stale') { const a = eOut(P(lt, te, te + 0.4)); text('Stale · dropped', cx, y + 50, { size: 24, weight: 800, color: RED, align: 'center', a }); }
      else { const a = eOut(P(lt, te, te + 0.4)); text(name === 'GET tru' ? 'Latest · used' : 'Returned · cached', cx, y + 50, { size: 22, weight: 700, color: LIME, align: 'center', a }); }
    }
  });
  const ha = eOut(P(lt, 6.6, 7.2)) * (1 - eOut(P(lt, 8.4, 8.8)));
  if (ha > 0.02) { const x = XT(6.6); dot(x, 580, 9, LIME, { g: 14, a: ha }); text('Cache hit · no request', x + 18, 570, { size: 22, weight: 700, color: LIME, a: ha }); }
  bullet(0, 'Browser caches common prefixes', eOut(P(lt, 2.9, 3.5)));
  bullet(1, 'Async requests, typing not blocked', eOut(P(lt, 5.8, 6.4)));
  bullet(2, 'Drop stale responses by prefix', eOut(P(lt, 14.9, 15.5)));
  bullet(3, 'Cache needs a sensible TTL', eOut(P(lt, 18.2, 18.8)));
}

// ───────── 场景 9：分片与热点 ─────────
const LET = 'abcdefghijklmnopqrstuvwxyz';
const WT = [.6, .55, .7, .45, .35, .4, .35, .4, .3, .15, .15, .3, .5, .2, .25, .5, .05, .35, .95, .6, .1, .15, .45, .03, .1, .08];
const SUMA = WT.slice(0, 13).reduce((a, b) => a + b, 0), SUMB = WT.slice(13).reduce((a, b) => a + b, 0);
const PCT_A = Math.round((SUMA / (SUMA + SUMB)) * 100);
function sceneShard(lt, d) {
  header(lt, '09', 'Sharding & Hot Spots', AMBER, 'Even letters ≠ even traffic');
  const ma = eOut(P(lt, 5.4, 6.2));
  box(1180, 190, 300, 100, 'Shard Map Manager', { color: PINK, sub: 'router', a: ma, size: 26 });
  const sa = eBack(P(lt, 3.0, 3.6)), sb = eBack(P(lt, 3.3, 3.9));
  const aL = lt >= 13.4 ? `${PCT_A}% of traffic (illustrative)` : 'a – m', bL = lt >= 13.4 ? `${100 - PCT_A}% of traffic (illustrative)` : 'n – z';
  box(830, 340, 496, 100, 'a – m', { color: CYAN, sub: lt >= 13.4 ? aL : 'Shard 1', a: clamp(sa * 2), s: lerp(0.9, 1, clamp(sa)), size: 36 });
  box(1334, 340, 496, 100, 'n – z', { color: INDIGO, sub: lt >= 13.4 ? bL : 'Shard 2', a: clamp(sb * 2), s: lerp(0.9, 1, clamp(sb)), size: 36 });
  arrow(1250, 292, 1080, 336, { color: MUTE, a: ma, p: eOut(P(lt, 6.0, 6.6)), w: 3 });
  arrow(1410, 292, 1580, 336, { color: MUTE, a: ma, p: eOut(P(lt, 6.0, 6.6)), w: 3 });
  // 查询包：tr → n–z，ca → a–m
  [['tr', 6.6, 1580], ['ca', 7.9, 1080]].forEach(([q, t0, tx]) => {
    const p1 = P(lt, t0, t0 + 0.8), p2 = P(lt, t0 + 0.8, t0 + 1.6); if (p1 <= 0 || p2 >= 1) return;
    let x, y; if (p2 <= 0) { x = lerp(830, 1180, eOut(p1)); y = 240; } else { x = lerp(1180, tx, eIO(p2)); y = lerp(240, 336, eIO(p2)); if (p2 < 0.3) x = lerp(1180, 1330, p2 / 0.3) * 0 + lerp(1330, tx, eIO(p2)); }
    dot(x, y, 12, '#fff', { g: 24 }); text(q, x, y - 22, { size: 24, font: MONO, weight: 800, align: 'center' });
  });
  text('Query prefix', 830, 178, { size: 22, color: MUTE, a: eOut(P(lt, 6.2, 6.8)) * (1 - eOut(P(lt, 9.0, 9.5))) });
  // 字母流量条（示意）
  const wa = eOut(P(lt, 9.4, 10.2));
  ctx.save(); ctx.globalAlpha *= wa; ctx.setLineDash([5, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1330, 460); ctx.lineTo(1330, 880); ctx.stroke(); ctx.restore();
  text('Traffic by first letter (illustrative)', 830, 484, { size: 22, color: MUTE, a: wa });
  const hot = eOut(P(lt, 13.6, 14.4));
  LET.split('').forEach((ch, i) => {
    const t0 = 9.8 + i * 0.1, g = eOut(P(lt, t0, t0 + 0.7)), h = WT[i] * 340 * g, x = 830 + i * 38.5, isHot = ch === 's'; if (g < 0.02) { text(ch, x + 17.5, 880, { size: 20, font: MONO, color: MUTE, align: 'center', a: wa }); return; }
    const c = i < 13 ? CYAN : INDIGO;
    ctx.save(); const col = isHot && hot > 0.05 ? RED : c; ctx.fillStyle = col; glow(col, isHot && hot > 0.05 ? 16 : 6); ctx.globalAlpha *= 0.9; rr(x + 4, 850 - h, 27, Math.max(h, 2), 6); ctx.fill(); ctx.restore();
    text(ch, x + 17.5, 880, { size: 20, font: MONO, color: MUTE, align: 'center', a: wa });
  });
  if (hot > 0.02) text('Short prefix · hot spot', 830 + 18 * 38.5 + 17, 850 - 0.95 * 340 - 16, { size: 24, weight: 800, color: RED, align: 'center', a: hot });
  bullet(0, 'Shard by prefix range', eOut(P(lt, 3.0, 3.6)));
  bullet(1, 'Shard map routes queries', eOut(P(lt, 6.2, 6.8)));
  bullet(2, 'Even letters ≠ even traffic', eOut(P(lt, 10.6, 11.2)));
  bullet(3, 'Precache short-prefix top-k', eOut(P(lt, 15.4, 16.0)));
  bullet(4, 'Or query all shards and merge', eOut(P(lt, 17.2, 17.8)));
}

// ───────── 场景 10：总结 ─────────
function sceneEnd(lt, d) {
  ctx.save(); ctx.globalAlpha *= 0.55; ctx.translate(1450, 120); ctx.scale(0.42, 0.42); ctx.translate(-860, -170);
  drawTrie({ st: (id) => (['', 't', 'tr', 'tru', 'true'].includes(id) ? 1 : 0), col: () => LIME, pill: () => 0.6, cnt: () => 0 });
  ctx.restore();
  text('Search Autocomplete', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('System Design Interview · Chapter 13', 112, 304, { size: 30, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['Trie', 'Shared prefixes, level by level', CYAN], ['Node Cache', 'Top-k stored at every prefix', AMBER], ['Offline Build', 'Logs, frequencies, new version', INDIGO]].forEach(([w, s, c], k) => {
    const t0 = 1.8 + k * 1.1, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    { ctx.save(); ctx.font = `800 70px ${SANS}`; const ww = ctx.measureText(w).width; ctx.restore(); text(w, x + 36, 566, { size: Math.min(70, Math.floor(70 * 448 / ww)), weight: 800 }); }
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  const aa = eOut(P(lt, 5.8, 6.6));
  text('Online, we just look things up. The heavy work stays offline.', 110, 750, { size: 36, weight: 700, a: aa });
  let bx = 110;
  ['Real-time queries', 'Rankings refresh periodically'].forEach((s, k) => { bx += badge(bx, 790, s, INDIGO, eOut(P(lt, 6.4 + k * 0.4, 7.2 + k * 0.4))) + 16; });
}

export const scenes = { title: sceneTitle, naive: sceneNaive, trie: sceneTrie, walk: sceneWalk, cache: sceneCache, type: sceneType, build: sceneBuild, swap: sceneSwap, client: sceneClient, shard: sceneShard, end: sceneEnd };
