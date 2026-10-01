// 第 13 章 搜索自动补全：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rr, glass, text, glow, dot, badge, header, arrow, box, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 13, title: '搜索自动补全', en: 'Search Autocomplete' };

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
    text(id ? id[id.length - 1] : '根', x, y + 9, { size: id ? 28 : 24, weight: 800, align: 'center', font: MONO, a });
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
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: CYAN, ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = eOut(P(lt, 0.4, 1.4)); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 118px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('搜索自动补全', 104, 500); ctx.restore();
  text('Search Autocomplete', 112, 570, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 13 章', 112, 660, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 1：现算的代价 ─────────
const TBL0 = [['tree', 10], ['wish', 25], ['toy', 14], ['true', 35], ['win', 50], ['try', 29]];
const TBL1 = [['true', 35], ['try', 29], ['tree', 10], ['wish', 25], ['toy', 14], ['win', 50]];
function sceneNaive(lt, d) {
  header(lt, '01', '现算的代价', RED, '频率表 + 逐次排序');
  const ta = eOut(P(lt, 0.5, 1.3));
  glass(820, 180, 540, 560, { a: ta, accent: INDIGO });
  text('频率表（示意）', 850, 222, { size: 24, weight: 600, color: MUTE, a: ta });
  text('次数', 1330, 222, { size: 22, color: DIM, align: 'right', a: ta });
  const mv = eIO(P(lt, 11.6, 13.0)), pre = 'tr';
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
  text('… 实际远不止几行', 850, 705, { size: 22, color: DIM, a: ta });
  // 搜索框与结果
  const s = lt < 2.2 ? '' : lt < 2.9 ? 't' : 'tr';
  searchBox(1400, 200, 440, 76, s, lt, { a: eOut(P(lt, 0.8, 1.5)) });
  const ra = eOut(P(lt, 13.6, 14.4));
  ['true', 'try', 'tree'].forEach((w, i) => sugRow(1400, 296 + i * 62, 440, w, CNT[w], ra * eOut(P(lt, 13.6 + i * 0.25, 14.2 + i * 0.25)), { accent: LIME }));
  // 耗时示意
  const ma = eOut(P(lt, 6.6, 7.4));
  glass(1400, 540, 440, 200, { a: ma, r: 22 });
  text('耗时（示意）', 1426, 580, { size: 22, color: MUTE, a: ma });
  text('预算', 1426, 636, { size: 22, color: LIME, weight: 700, a: ma });
  ctx.save(); ctx.globalAlpha *= ma; ctx.fillStyle = LIME; glow(LIME, 12); rr(1500, 618, 110, 22, 11); ctx.fill(); ctx.restore();
  text('100ms', 1626, 637, { size: 22, font: MONO, color: LIME, a: ma });
  text('现算', 1426, 696, { size: 22, color: RED, weight: 700, a: ma });
  const bl = lerp(30, 320, eOut(P(lt, 7.0, 13.4)));
  ctx.save(); ctx.globalAlpha *= ma; ctx.fillStyle = RED; glow(RED, 12); rr(1500, 678, bl, 22, 11); ctx.fill(); ctx.restore();
  bullet(0, '扫描整张频率表', eOut(P(lt, 7.0, 7.6)));
  bullet(1, '给匹配项排序', eOut(P(lt, 11.4, 12)));
  bullet(2, '每个按键都重来', eOut(P(lt, 14.6, 15.2)));
  statCard(110, 640, 640, '峰值 QPS', '48,000', { color: INDIGO, a: eOut(P(lt, 15.4, 16)) });
  statCard(110, 770, 640, '响应要求', '< 100 ms', { color: LIME, a: eOut(P(lt, 16.6, 17.2)) });
}

// ───────── 场景 2：Trie ─────────
const INS = [1.0, 2.4, 3.8, 4.7, 5.8, 6.8];
const CRE = {}; IDS.forEach((id) => { let t = id ? 99 : 0.6; WORDS.forEach(([w], i) => { if (id && w.startsWith(id)) t = Math.min(t, INS[i] + (id.length - 1) * 0.3); }); CRE[id] = t; });
const REUSE = []; WORDS.forEach(([w], i) => { for (let k = 1; k <= w.length; k++) { const id = w.slice(0, k), t = INS[i] + (k - 1) * 0.3; if (Math.abs(CRE[id] - t) > 0.01) REUSE.push([id, t]); } });
function sceneTrie(lt, d) {
  header(lt, '02', 'Trie 前缀树', CYAN, '按前缀逐层存放');
  const pulse = (id) => { let v = 0; if (CRE[id] <= lt) v = Math.max(v, 1 - P(lt, CRE[id] + 0.1, CRE[id] + 0.7)); REUSE.forEach(([i2, t]) => { if (i2 === id && lt >= t) v = Math.max(v, 1 - P(lt, t, t + 0.6)); }); return v; };
  const share = eOut(P(lt, 9.4, 10.2)) * (1 - eOut(P(lt, 14.0, 14.6)));
  drawTrie({
    na: (id) => eBack(P(lt, CRE[id], CRE[id] + 0.4)), ep: (id) => eOut(P(lt, CRE[id] - 0.1, CRE[id] + 0.3)),
    st: (id) => Math.max(pulse(id), (id === 't' || id === 'tr') ? share : 0), col: (id) => ((id === 't' || id === 'tr') && share > 0.05 ? PINK : LIME),
    cnt: (id) => eOut(P(lt, 14.6 + WORDS.findIndex((w) => w[0] === id) * 0.4, 15.2 + WORDS.findIndex((w) => w[0] === id) * 0.4)),
  });
  ['t', 'tr'].forEach((id) => { const [x, y] = nodeXY(id); text('共用', x, y - 44, { size: 22, weight: 700, color: PINK, align: 'center', a: share }); });
  bullet(0, '每个字符占一层', eOut(P(lt, 4.6, 5.2)));
  bullet(1, '共同前缀只存一份', eOut(P(lt, 7.4, 8.0)));
  bullet(2, '结束节点记着次数', eOut(P(lt, 14.8, 15.4)));
  statCard(110, 640, 640, 'true / try / tree 共用', 't → r', { color: PINK, a: eOut(P(lt, 9.8, 10.4)) });
  text('次数为示意', 830, 905, { size: 20, color: DIM, a: eOut(P(lt, 14.8, 15.4)) });
}

// ───────── 场景 3：朴素 top-k（遍历子树） ─────────
const VIS = ['tr', 'tre', 'tree', 'tru', 'true', 'try', 'to', 'toy'];
const tv = (i) => 9.6 + i * 0.55;
function sceneWalk(lt, d) {
  header(lt, '03', '朴素查询：现算', PINK, '每次都要遍历子树');
  const s = lt < 2.0 ? '' : 't';
  searchBox(110, 372, 640, 74, s, lt, { a: eOut(P(lt, 0.8, 1.4)) });
  const pathA = eOut(P(lt, 5.2, 6.0));
  const vi = (id) => VIS.indexOf(id);
  drawTrie({
    st: (id) => { if (id === '') return pathA; if (id === 't') return pathA; const i = vi(id); if (i < 0) return 0; return lt >= tv(i) ? lerp(0.55, 1, 1 - P(lt, tv(i), tv(i) + 0.6)) : 0; },
    col: (id) => (vi(id) >= 0 && lt < tv(vi(id)) + 0.5 ? AMBER : PINK),
    lp: (id) => { if (id === 't') return pathA; const i = vi(id); return i >= 0 && lt >= tv(i) ? eOut(P(lt, tv(i) - 0.15, tv(i) + 0.3)) : 0; },
    cnt: () => 1,
  });
  // 收集面板
  const collected = ['tree', 'true', 'try', 'toy'], lv = ['tree', 'true', 'try', 'toy'].map((w) => vi(w));
  const sorted = ['true', 'try', 'toy', 'tree'], mv = eIO(P(lt, 15.4, 16.6));
  const pa = eOut(P(lt, 8.6, 9.4));
  panel(lt < 15.4 ? '收集到的完整词（按遍历顺序）' : '按次数排序，取前三', '示意 · k=3', pa, PINK);
  collected.forEach((w, i) => {
    const born = eBack(P(lt, tv(lv[i]) + 0.2, tv(lv[i]) + 0.7)); if (born < 0.03) return;
    const j = sorted.indexOf(w), x = lerp(840 + i * 255, 840 + j * 255, mv), drop = w === 'tree' ? eOut(P(lt, 16.6, 17.4)) : 0;
    sugRow(x, 808 + 0 * born, 235, w, CNT[w], clamp(born) * (1 - drop * 0.6), { accent: w === 'tree' && drop > 0 ? RED : mv > 0.99 ? LIME : PINK, h: 76, strike: drop > 0.5 });
  });
  const n = VIS.filter((_, i) => lt >= tv(i)).length;
  bullet(0, '① 走到前缀节点', eOut(P(lt, 5.4, 6.0)), { y0: 520, step: 60 });
  bullet(1, '② 遍历整棵子树', eOut(P(lt, 9.2, 9.8)), { y0: 520, step: 60 });
  bullet(2, '③ 排序，取前三', eOut(P(lt, 15.2, 15.8)), { y0: 520, step: 60 });
  statCard(110, 700, 640, '遍历的子树节点', `${n}`, { color: RED, a: eOut(P(lt, 9.2, 9.8)), note: n ? '个' : '' });
}

// ───────── 场景 4：节点缓存 top-k ─────────
const POST = []; (function po(id) { kids(id).forEach(po); POST.push(id); })('');
function sceneCache(lt, d) {
  header(lt, '04', '节点缓存 top-k', AMBER, '先做工作，再贴答案');
  const pt = (id) => 6.6 + POST.indexOf(id) * 0.3;
  const focus = eOut(P(lt, 12.4, 13.0));
  drawTrie({
    pill: (id) => { const a = eBack(P(lt, pt(id), pt(id) + 0.35)); return clamp(a) * (id === 't' ? 1 : lerp(1, 0.55, focus)); },
    st: (id) => (id === 't' ? focus : 0), col: () => AMBER, cnt: () => 1,
  });
  text('琥珀条 = 该节点已缓存 top-3', 860, 172, { size: 22, color: MUTE, a: eOut(P(lt, 6.4, 7.0)) });
  const ba = eOut(P(lt, 1.0, 1.8));
  if (lt < 6.4) badge(830, 790, '后台提前计算', AMBER, ba * (1 - eOut(P(lt, 6.0, 6.6))));
  panel(focus > 0.02 ? 't 节点上缓存的 top-3' : '', '示意 · k=3', focus, AMBER);
  cards(cacheOf('t'), focus, { hi: false });
  bullet(0, '后台预先算好', eOut(P(lt, 6.6, 7.2)));
  bullet(1, '答案直接存在节点里', eOut(P(lt, 9.6, 10.2)));
  bullet(2, '在线只走到节点', eOut(P(lt, 13.4, 14.0)));
  statCard(110, 640, 640, '代价', '多占存储', { color: AMBER, a: eOut(P(lt, 17.0, 17.6)) });
  statCard(110, 770, 640, '收益', '查询变快', { color: LIME, a: eOut(P(lt, 18.0, 18.6)) });
}

// ───────── 场景 5：逐字输入 ─────────
const TT = [3.6, 8.6, 13.0, 14.7], TID = ['t', 'tr', 'tru', 'true'];
function sceneType(lt, d) {
  header(lt, '05', '逐字输入', LIME, '走一层，取一次缓存');
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
  panel(idx >= 0 ? `「${TID[idx]}」节点的缓存` : '输入前缀后，这里显示该节点缓存的 top-3', '示意 · k=3', pa, LIME);
  if (idx >= 0) {
    const p = eOut(P(lt, TT[idx] + 0.5, TT[idx] + 0.95));
    if (idx > 0 && p < 1) cards(cacheOf(TID[idx - 1]), (1 - p) * 0.8, { dy: p * -10 });
    cards(cacheOf(TID[idx]), p, { dy: (1 - p) * 14 });
  }
  statCard(110, 520, 640, '已走层数', `${n}`, { color: CYAN, a: eOut(P(lt, 1.6, 2.2)), note: n ? '层' : '' });
  statCard(110, 650, 640, '遍历子树节点', '0', { color: LIME, a: eOut(P(lt, 15.6, 16.2)) });
  statCard(110, 780, 640, '排序次数', '0', { color: LIME, a: eOut(P(lt, 16.6, 17.2)) });
}

// ───────── 场景 6：离线流水线 ─────────
function pipe(lt, x1, y1, x2, y2, t0, color) {
  arrow(x1, y1, x2, y2, { color: color + '88', p: eOut(P(lt, t0, t0 + 0.6)), w: 3 });
  if (lt > t0 + 0.6) packet(x1, y1, x2, y2, ((lt - t0 - 0.6) * 0.45) % 1, color, { r: 8 });
}
function sceneBuild(lt, d) {
  header(lt, '06', '离线流水线', INDIGO, '日志 → 频率表 → 新 Trie');
  const g = (t) => eBack(P(lt, t, t + 0.5));
  // 离线区域背景
  const ra = eOut(P(lt, 0.6, 1.4));
  ctx.save(); ctx.globalAlpha *= ra; ctx.setLineDash([10, 10]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; rr(810, 170, 1040, 460, 28); ctx.stroke(); ctx.restore();
  text('离线 · 后台', 836, 208, { size: 22, color: DIM, weight: 600, a: ra, ls: 3 });
  box(830, 240, 270, 120, '用户查询', { color: INDIGO, sub: 'search', a: clamp(g(4.6) * 2), s: lerp(0.8, 1, clamp(g(4.6))), size: 32 });
  box(1150, 240, 270, 120, '分析日志', { color: INDIGO, sub: 'Analytics Logs', a: clamp(g(5.6) * 2), s: lerp(0.8, 1, clamp(g(5.6))), size: 32 });
  box(1470, 240, 270, 120, '聚合器', { color: INDIGO, sub: 'Aggregators', a: clamp(g(9.0) * 2), s: lerp(0.8, 1, clamp(g(9.0))), size: 32 });
  box(1470, 460, 270, 120, '频率表', { color: INDIGO, sub: 'Frequency', a: clamp(g(11.0) * 2), s: lerp(0.8, 1, clamp(g(11.0))), size: 32 });
  box(1150, 460, 270, 120, '重建 Trie', { color: INDIGO, sub: 'Workers', a: clamp(g(13.2) * 2), s: lerp(0.8, 1, clamp(g(13.2))), size: 32 });
  box(830, 460, 270, 120, 'Trie 存储', { color: CYAN, sub: 'Cache / DB', a: clamp(g(15.6) * 2), s: lerp(0.8, 1, clamp(g(15.6))), size: 32 });
  pipe(lt, 1100, 300, 1150, 300, 5.4, INDIGO);
  text('追加写', 1125, 280, { size: 20, color: MUTE, align: 'center', a: eOut(P(lt, 6.4, 7)) });
  pipe(lt, 1420, 300, 1470, 300, 9.8, INDIGO);
  pipe(lt, 1605, 360, 1605, 460, 11.8, INDIGO);
  pipe(lt, 1470, 520, 1420, 520, 14.0, INDIGO);
  pipe(lt, 1150, 520, 1100, 520, 16.2, CYAN);
  // 在线服务读取
  const oa = eOut(P(lt, 17.4, 18.2));
  ctx.save(); ctx.globalAlpha *= oa; ctx.setLineDash([10, 10]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.16)'; rr(810, 670, 1040, 200, 28); ctx.stroke(); ctx.restore();
  text('在线', 836, 708, { size: 22, color: DIM, weight: 600, a: oa, ls: 3 });
  box(830, 730, 270, 110, '查询服务', { color: PINK, sub: 'Query Service', a: oa, size: 32 });
  arrow(965, 725, 965, 590, { color: LIME + 'aa', a: oa, p: eOut(P(lt, 18.0, 18.8)), w: 3 });
  text('只读，取缓存', 1000, 660, { size: 22, color: LIME, a: eOut(P(lt, 18.4, 19)) });
  const wk = eBack(P(lt, 19.0, 19.6)); if (wk > 0.02) badge(1150, 760, '原书：每周构建一次', AMBER, clamp(wk));
  bullet(0, '日志只追加，不建索引', eOut(P(lt, 5.8, 6.4)));
  bullet(1, '聚合成频率表', eOut(P(lt, 11.2, 11.8)));
  bullet(2, '后台重建 Trie', eOut(P(lt, 13.6, 14.2)));
  statCard(110, 640, 640, '热门建议变化', '不会每秒大变', { color: AMBER, a: eOut(P(lt, 19.4, 20)), h: 112 });
}

// ───────── 场景 7：版本切换与过滤 ─────────
function sceneSwap(lt, d) {
  header(lt, '07', '版本切换与过滤', CYAN, '读者永远看到完整的一版');
  const sw = eIO(P(lt, 11.2, 12.1)), sa = eOut(P(lt, 0.6, 1.4));
  box(1090, 190, 260, 100, '查询服务', { color: PINK, a: sa, size: 32 });
  const v2a = lerp(0.35, 1, eOut(P(lt, 4.6, 9.6)));
  box(830, 380, 330, 170, 'Trie v1', { color: CYAN, sub: sw > 0.5 ? '保留以便回滚' : '线上服务中', a: sa * lerp(1, 0.55, sw), size: 36 });
  box(1330, 380, 330, 170, 'Trie v2', { color: CYAN, sub: sw > 0.5 ? '线上服务中' : '后台构建中', a: eOut(P(lt, 4.4, 5.0)) * v2a, size: 36 });
  const ex = lerp(995, 1495, sw);
  arrow(1220, 292, ex, 372, { color: LIME, p: eOut(P(lt, 1.4, 2.2)), w: 5, g: 10 });
  // 步骤条
  ['构建', '校验', '预热', '切换'].forEach((s, i) => {
    const t = [5.4, 7.2, 8.8, 11.0][i], on = lt >= t, x = 830 + i * 256, a = eOut(P(lt, 4.8 + i * 0.1, 5.4 + i * 0.1));
    glass(x, 600, 230, 58, { a, r: 29, accent: on ? LIME : null, fill: on ? 0.12 : 0.04 });
    dot(x + 34, 629, 8, on ? LIME : DIM, { g: on ? 14 : 0, a });
    text(s, x + 58, 640, { size: 28, weight: 700, color: on ? INK : DIM, a });
  });
  // 过滤层
  const fa = eOut(P(lt, 15.0, 15.8));
  box(830, 720, 260, 110, '查询服务', { color: PINK, sub: 'top-k', a: fa, size: 32 });
  box(1190, 720, 260, 110, '过滤层', { color: INDIGO, sub: 'filter', a: fa, size: 32 });
  box(1560, 720, 260, 110, '用户看到', { color: LIME, sub: 'suggestions', a: fa, size: 32 });
  arrow(1090, 775, 1190, 775, { color: MUTE, a: fa, w: 3 }); arrow(1450, 775, 1560, 775, { color: MUTE, a: fa, w: 3 });
  [['true', 0], ['try', 0], ['toy', 0], ['有害词', 1]].forEach(([w, bad], j) => {
    const t0 = 16.4 + j * 0.55, p = eIO(P(lt, t0, t0 + 1.6)); if (p <= 0) return;
    const x = lerp(1010, bad ? 1120 : 1600 + j * 88, p), al = bad ? 1 - eOut(P(lt, t0 + 1.6, t0 + 2.2)) : 1;
    const cw = tw(w, 22, 700, bad ? SANS : MONO) + 28, c = bad ? RED : LIME, y = 672;
    ctx.save(); ctx.globalAlpha *= al; glow(c, 12); rr(x - cw / 2, y, cw, 34, 10); ctx.fillStyle = c + '30'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = c; ctx.stroke(); ctx.shadowBlur = 0;
    text(w, x, y + 25, { size: 22, weight: 700, font: bad ? SANS : MONO, align: 'center', color: INK }); ctx.restore();
  });
  const xa = eOut(P(lt, 18.2, 18.8)); if (xa > 0) text('✕ 被拦下', 1320, 872, { size: 24, weight: 700, color: RED, align: 'center', a: xa });
  text('后台异步物理删除', 1560, 872, { size: 22, color: MUTE, a: eOut(P(lt, 19.4, 20)) });
  bullet(0, '旁边构建，校验、预热', eOut(P(lt, 5.4, 6.0)));
  bullet(1, '整体切换，保留旧版本', eOut(P(lt, 11.4, 12.0)));
  bullet(2, '查询链路加过滤层', eOut(P(lt, 16.0, 16.6)));
  statCard(110, 640, 640, '不要这样做', '边覆盖边服务', { color: RED, a: eOut(P(lt, 12.6, 13.2)), note: '' });
}

// ───────── 场景 8：前端协同 ─────────
const XT = (t) => 1010 + (t - 2.5) * 54;
const REQ = [['GET t', 3.4, 5.2, 580, 'ok'], ['GET tr', 9.6, 14.2, 580, 'stale'], ['GET tru', 10.4, 12.2, 700, 'ok']];
function sceneClient(lt, d) {
  header(lt, '08', '前端协同', PINK, '缓存、异步与丢弃过时结果');
  const s = lt < 3.3 ? '' : lt < 3.6 ? 't' : lt < 6.2 ? 't' : lt < 6.5 ? '' : lt < 8.8 ? 't' : lt < 9.0 ? '' : lt < 9.6 ? 't' : lt < 10.4 ? 'tr' : 'tru';
  const ba = eOut(P(lt, 0.5, 1.2));
  glass(830, 190, 470, 250, { a: ba, accent: INDIGO });
  searchBox(850, 208, 430, 60, s, lt, { a: ba, cursor: lt < 17 });
  const T_L = [['true', 35], ['try', 29], ['toy', 14]], TRU = [['true', 35]];
  let list = null, loading = false;
  if (lt >= 3.4 && lt < 5.2) loading = true; else if (lt >= 5.2 && lt < 6.2) list = T_L; else if (lt >= 6.5 && lt < 8.8) list = T_L;
  else if (lt >= 9.0 && lt < 12.2) list = T_L; else if (lt >= 12.2) list = TRU;
  if (loading) for (let i = 0; i < 3; i++) { ctx.save(); ctx.globalAlpha *= 0.25 + 0.1 * Math.sin(lt * 6 + i); rr(850, 284 + i * 46, 430, 38, 10); ctx.fillStyle = '#fff'; ctx.fill(); ctx.restore(); }
  if (list) list.forEach(([w, c], i) => { text(w, 872, 312 + i * 46, { size: 26, font: MONO, weight: 700 }); text(String(c), 1262, 312 + i * 46, { size: 24, font: MONO, weight: 800, color: INDIGO, align: 'right' }); });
  // 浏览器缓存
  const ca = eOut(P(lt, 2.4, 3.2));
  glass(1330, 190, 510, 250, { a: ca, accent: AMBER });
  text('浏览器缓存', 1360, 232, { size: 24, weight: 700, color: AMBER, a: ca });
  const ents = [['t', 5.3], ['tru', 12.4], ['tr', 14.4]];
  ents.forEach(([k, t0], i) => {
    const p = eBack(P(lt, t0, t0 + 0.4)); if (p < 0.03) return; const y = 256 + i * 56;
    const exp = k === 't' ? eOut(P(lt, 19.6, 20.0)) : 0;
    ctx.save(); ctx.globalAlpha *= clamp(p) * (1 - exp * 0.6); rr(1356, y, 458, 44, 12); ctx.fillStyle = AMBER + '1c'; ctx.fill(); ctx.strokeStyle = AMBER + '88'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    text(`"${k}"`, 1376, y + 30, { size: 24, font: MONO, weight: 700, a: clamp(p) * (1 - exp * 0.6) });
    text(exp > 0.5 ? '已过期' : '→ 建议列表', 1500, y + 30, { size: 22, color: exp > 0.5 ? RED : MUTE, a: clamp(p) });
    if (k === 't' && lt >= 17.4) { const q = 1 - P(lt, 17.6, 19.6); ctx.save(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.arc(1788, y + 22, 13, 0, 7); ctx.stroke(); ctx.strokeStyle = q > 0 ? AMBER : RED; ctx.beginPath(); ctx.arc(1788, y + 22, 13, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * q); ctx.stroke(); ctx.restore(); }
  });
  text('TTL 倒计时', 1814, 232, { size: 20, color: DIM, align: 'right', a: eOut(P(lt, 17.2, 17.8)) });
  if (lt >= 6.5 && lt < 9) text('命中缓存 · 不发请求', 1010 + 0, 0, { a: 0 });
  // 时间线
  const tl = eOut(P(lt, 2.4, 3.2));
  glass(830, 470, 1010, 440, { a: tl });
  text('请求时间线', 860, 512, { size: 22, color: MUTE, a: tl });
  ctx.save(); ctx.globalAlpha *= tl; ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(860, 850); ctx.lineTo(1810, 850); ctx.stroke(); ctx.restore();
  text('时间 →', 1810, 884, { size: 20, color: DIM, align: 'right', a: tl });
  if (lt >= 2.5) { const nx = XT(Math.min(lt, 17)); ctx.save(); ctx.globalAlpha *= 0.5 * tl; ctx.setLineDash([4, 8]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(nx, 540); ctx.lineTo(nx, 850); ctx.stroke(); ctx.restore(); dot(nx, 850, 6, '#fff', { g: 12, a: tl }); }
  REQ.forEach(([name, ts, te, y, kind]) => {
    if (lt < ts) return;
    const x0 = XT(ts), x1 = XT(te), cx = lerp(x0, x1, clamp((lt - ts) / (te - ts))), done = lt >= te;
    const fade = lt >= 17 ? 1 : 1;
    text(name, x0, y - 22, { size: 22, font: MONO, weight: 700, a: eOut(P(lt, ts, ts + 0.3)) * fade });
    ctx.save(); const c = kind === 'stale' && done ? RED : INDIGO; ctx.fillStyle = c + '66'; glow(c, 10); rr(x0, y - 11, Math.max(cx - x0, 8), 22, 11); ctx.fill(); ctx.restore();
    dot(cx, y, done ? 9 : 11, kind === 'stale' && done ? RED : done ? LIME : '#fff', { g: 16 });
    if (done) {
      if (kind === 'stale') { const a = eOut(P(lt, te, te + 0.4)); text('过时 · 丢弃', cx, y + 50, { size: 24, weight: 800, color: RED, align: 'center', a }); }
      else { const a = eOut(P(lt, te, te + 0.4)); text(name === 'GET tru' ? '最新 · 采用' : '返回 · 写入缓存', cx, y + 50, { size: 22, weight: 700, color: LIME, align: 'center', a }); }
    }
  });
  const ha = eOut(P(lt, 6.6, 7.2)) * (1 - eOut(P(lt, 8.4, 8.8)));
  if (ha > 0.02) { const x = XT(6.6); dot(x, 580, 9, LIME, { g: 14, a: ha }); text('命中缓存 · 不发请求', x + 18, 570, { size: 22, weight: 700, color: LIME, a: ha }); }
  bullet(0, '浏览器缓存常见前缀', eOut(P(lt, 2.9, 3.5)));
  bullet(1, '异步请求，不阻塞输入', eOut(P(lt, 5.6, 6.2)));
  bullet(2, '按前缀丢弃过时响应', eOut(P(lt, 13.6, 14.2)));
  bullet(3, '缓存要设置合理 TTL', eOut(P(lt, 17.2, 17.8)));
}

// ───────── 场景 9：分片与热点 ─────────
const LET = 'abcdefghijklmnopqrstuvwxyz';
const WT = [.6, .55, .7, .45, .35, .4, .35, .4, .3, .15, .15, .3, .5, .2, .25, .5, .05, .35, .95, .6, .1, .15, .45, .03, .1, .08];
const SUMA = WT.slice(0, 13).reduce((a, b) => a + b, 0), SUMB = WT.slice(13).reduce((a, b) => a + b, 0);
const PCT_A = Math.round((SUMA / (SUMA + SUMB)) * 100);
function sceneShard(lt, d) {
  header(lt, '09', '分片与热点', AMBER, '均分字母 ≠ 均分流量');
  const ma = eOut(P(lt, 3.6, 4.4));
  box(1180, 190, 300, 100, '分片映射管理器', { color: PINK, sub: 'shard map', a: ma, size: 32 });
  const sa = eBack(P(lt, 4.0, 4.6)), sb = eBack(P(lt, 4.3, 4.9));
  const aL = lt >= 14 ? `流量 ${PCT_A}%（示意）` : 'a – m', bL = lt >= 14 ? `流量 ${100 - PCT_A}%（示意）` : 'n – z';
  box(830, 340, 496, 100, 'a – m', { color: CYAN, sub: lt >= 14 ? aL : '分片 1', a: clamp(sa * 2), s: lerp(0.9, 1, clamp(sa)), size: 36 });
  box(1334, 340, 496, 100, 'n – z', { color: INDIGO, sub: lt >= 14 ? bL : '分片 2', a: clamp(sb * 2), s: lerp(0.9, 1, clamp(sb)), size: 36 });
  arrow(1250, 292, 1080, 336, { color: MUTE, a: ma, p: eOut(P(lt, 4.8, 5.4)), w: 3 });
  arrow(1410, 292, 1580, 336, { color: MUTE, a: ma, p: eOut(P(lt, 4.8, 5.4)), w: 3 });
  // 查询包：tr → n–z，ca → a–m
  [['tr', 6.0, 1580], ['ca', 7.6, 1080]].forEach(([q, t0, tx]) => {
    const p1 = P(lt, t0, t0 + 0.8), p2 = P(lt, t0 + 0.8, t0 + 1.6); if (p1 <= 0 || p2 >= 1) return;
    let x, y; if (p2 <= 0) { x = lerp(830, 1180, eOut(p1)); y = 240; } else { x = lerp(1180, tx, eIO(p2)); y = lerp(240, 336, eIO(p2)); if (p2 < 0.3) x = lerp(1180, 1330, p2 / 0.3) * 0 + lerp(1330, tx, eIO(p2)); }
    dot(x, y, 12, '#fff', { g: 24 }); text(q, x, y - 22, { size: 24, font: MONO, weight: 800, align: 'center' });
  });
  text('查询前缀', 830, 232, { size: 22, color: MUTE, a: eOut(P(lt, 5.8, 6.4)) * (1 - eOut(P(lt, 8.6, 9.2))) });
  // 字母流量条（示意）
  const wa = eOut(P(lt, 9.8, 10.6));
  ctx.save(); ctx.globalAlpha *= wa; ctx.setLineDash([5, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(1330, 460); ctx.lineTo(1330, 880); ctx.stroke(); ctx.restore();
  text('各字母开头的查询流量（示意）', 830, 484, { size: 22, color: MUTE, a: wa });
  const hot = eOut(P(lt, 14.8, 15.6));
  LET.split('').forEach((ch, i) => {
    const t0 = 10.2 + i * 0.1, g = eOut(P(lt, t0, t0 + 0.7)), h = WT[i] * 340 * g, x = 830 + i * 38.5, isHot = ch === 's'; if (g < 0.02) { text(ch, x + 17.5, 880, { size: 20, font: MONO, color: MUTE, align: 'center', a: wa }); return; }
    const c = i < 13 ? CYAN : INDIGO;
    ctx.save(); const col = isHot && hot > 0.05 ? RED : c; ctx.fillStyle = col; glow(col, isHot && hot > 0.05 ? 16 : 6); ctx.globalAlpha *= 0.9; rr(x + 4, 850 - h, 27, Math.max(h, 2), 6); ctx.fill(); ctx.restore();
    text(ch, x + 17.5, 880, { size: 20, font: MONO, color: MUTE, align: 'center', a: wa });
  });
  if (hot > 0.02) text('短前缀 · 热点', 830 + 18 * 38.5 + 17, 850 - 0.95 * 340 - 16, { size: 24, weight: 800, color: RED, align: 'center', a: hot });
  bullet(0, '按前缀范围分片', eOut(P(lt, 3.4, 4)));
  bullet(1, '映射管理器负责路由', eOut(P(lt, 6.6, 7.2)));
  bullet(2, '字母均分 ≠ 流量均分', eOut(P(lt, 11.4, 12)));
  bullet(3, '预先缓存短前缀 top-k', eOut(P(lt, 17.0, 17.6)));
  bullet(4, '或并发查各分片再合并', eOut(P(lt, 18.8, 19.4)));
}

// ───────── 场景 10：总结 ─────────
function sceneEnd(lt, d) {
  ctx.save(); ctx.globalAlpha *= 0.55; ctx.translate(1450, 120); ctx.scale(0.42, 0.42); ctx.translate(-860, -170);
  drawTrie({ st: (id) => (['', 't', 'tr', 'tru', 'true'].includes(id) ? 1 : 0), col: () => LIME, pill: () => 0.6, cnt: () => 0 });
  ctx.restore();
  text('搜索自动补全', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Search Autocomplete', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['前缀树', '共享前缀，逐层存放', CYAN], ['节点缓存', '每个前缀预存 top-k', AMBER], ['离线构建', '日志、频率表、新版本', INDIGO]].forEach(([w, s, c], k) => {
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
  const aa = eOut(P(lt, 6.0, 6.8));
  text('线上只查表，重活留给后台', 110, 750, { size: 36, weight: 700, a: aa });
  let bx = 110;
  ['查询实时', '排名周期更新'].forEach((s, k) => { bx += badge(bx, 790, s, INDIGO, eOut(P(lt, 6.4 + k * 0.3, 7.2 + k * 0.3))) + 16; });
}

export const scenes = { title: sceneTitle, naive: sceneNaive, trie: sceneTrie, walk: sceneWalk, cache: sceneCache, type: sceneType, build: sceneBuild, swap: sceneSwap, client: sceneClient, shard: sceneShard, end: sceneEnd };
