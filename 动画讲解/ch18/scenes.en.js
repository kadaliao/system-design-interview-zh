// 第 18 章 Google Maps：地图瓦片 / 路由瓦片分层 / 动态 ETA
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text as text0, glow, dot, badge, arrow, box, dbIcon, packet } from '../lib/core.js';
import { COLS, ROWS, TS, SP, DP, R, id as nid } from './sim.js';

export const meta = { no: 18, title: 'Designing Google Maps', en: 'Designing Google Maps' };

// text() with optional maxW: shrinks the font so English fits the layout
function text(s, x, y, o = {}) {
  if (o.maxW) {
    let size = o.size || 32; const min = o.min || 18;
    ctx.save();
    while (size > min) { ctx.font = `${o.weight || 500} ${size}px ${o.font || SANS}`; if (ctx.measureText(s).width <= o.maxW) break; size--; }
    ctx.restore();
    return text0(s, x, y, { ...o, size });
  }
  return text0(s, x, y, o);
}
function header(lt, num, title, accent, sub) {
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text0(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size: 70, weight: 800, maxW: 640, min: 44 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: 26, color: MUTE, maxW: 640, min: 20 });
  ctx.restore();
}
function bullet(i, str, a, { color = INK, y0 = 430, step = 64, size = 30 } = {}) {
  if (a <= 0) return; const y = y0 + i * step;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-20 * (1 - a), 0);
  dot(122, y - 10, 5, '#8b8dfc', { g: 10 }); text(str, 146, y, { size, weight: 600, color, maxW: 600, min: 22 }); ctx.restore();
}
function statCard(x, y, w, label, value, { color = '#8b8dfc', a = 1, h = 112, note = null } = {}) {
  if (a <= 0) return;
  glass(x, y, w, h, { a, accent: color });
  text(label, x + 30, y + 44, { size: 22, color: MUTE, a, maxW: w - 60, min: 18 });
  text(value, x + 30, y + 94, { size: 48, weight: 800, font: MONO, color, a });
  if (note) text(note, x + w - 30, y + 94, { size: 26, color: MUTE, align: 'right', a });
}

// 旁白文本与时长（用于按短语对齐画面节拍；与 script.json 保持一致）
const TX = {
  three: "A map product splits into three pipelines. Location updates: clients upload in batches, the data lands in Cassandra, and Kafka fans it out. The book estimates about two hundred thousand QPS, peaking at one million. The hard parts are the other two. Viewing the map relies on image tiles. Finding a route relies on routing tiles.",
  tiles: "First, map tiles. A petabyte-scale map can't be downloaded whole, so we cut the world into small pieces. At the lowest zoom level, a single tile, two hundred fifty-six by two hundred fifty-six, is the entire world. Each zoom level up, every tile splits into four, so the total grows fourfold.",
  viewport: "A screen needs only a handful of tiles. The client turns its position and zoom level into tile numbers, then fetches pre-rendered static images from a CDN. When you pan, it fetches only the new column that slides in. Everything else comes from the local cache. The numbering scheme must stay compatible with the server.",
  graph: "Now navigation. Intersections are nodes, roads are edges, and routes are found with a modified Dijkstra or A-star. Search is sensitive to graph size. It expands outward from the start, ring by ring, so the bigger the graph, the more intersections it visits. We can't scan the whole world's road network on every request.",
  rtile: "The fix is to cut the road network into routing tiles, each holding references to its neighbors. The search stitches tiles together on demand, loading only the few between start and destination. The rest is never touched, saving memory and bandwidth.",
  hier: "But a long trip needs too many small tiles, which is expensive. So we add hierarchy. The same road network is stored at several levels of detail, and we choose a level by distance. Far from the destination, we travel on a high level, like taking the highway. Near it, we expand into the fine-grained side streets.",
  nav: "Here is one navigation request. The geocoding service turns an address into coordinates. The route planner finds the tiles involved, and the shortest-path service runs an A-star variant over routing tiles in object storage. The ETA service combines traffic and machine learning to estimate time, and the ranker picks routes by user preference.",
  eta: "Traffic changes. The system records which tiles each navigating user will pass through. When an accident hits one tile, it looks up the users whose routes cross it, reroutes only those people, and pushes new routes over WebSocket. If we store only coarse tiles to save space, a match is just a candidate. We still check the exact path.",
};
const NARR = { three: 23.088, tiles: 21.936, viewport: 21.264, graph: 21.696, rtile: 17.04, hier: 20.616, nav: 22.824, eta: 23.376 };
// Measured pauses (ffmpeg silencedetect): a phrase estimate snaps to the nearest real phrase start
const SIL = {
  three: [0.69, 3.39, 4.81, 6.71, 8.57, 10.61, 13.87, 15.45, 17.59, 20.46],
  tiles: [0.84, 2.11, 3.63, 5.34, 8.24, 9.69, 11.11, 14.63, 16.48, 17.89, 19.79],
  viewport: [3.22, 7.04, 10.94, 12.06, 15.29, 18.01],
  graph: [1.74, 3.30, 8.45, 10.82, 13.15, 15.59, 17.89, 20.42],
  rtile: [3.63, 6.23, 9.21, 11.48, 12.95, 14.94],
  hier: [4.54, 6.36, 10.01, 12.38, 13.95, 17.15],
  nav: [2.66, 5.98, 6.64, 7.05, 9.25, 15.32, 19.93],
  eta: [1.96, 6.64, 8.66, 11.36, 11.98, 13.22, 15.98, 19.15, 21.44],
};
const T = (id, phrase, off = 0) => {
  const i = TX[id].toLowerCase().indexOf(phrase.toLowerCase()); if (i < 0) throw new Error('phrase ' + phrase);
  let t = NARR[id] * (i / TX[id].length);
  let best = null; for (const s of SIL[id]) if (Math.abs(s - t) < 0.8 && (best === null || Math.abs(s - t) < Math.abs(best - t))) best = s;
  if (best !== null && (i === 0 || /[.,:;] $/.test(TX[id].slice(Math.max(0, i - 2), i)) || /^\s/.test(TX[id].slice(i - 1, i)))) t = best;
  return 0.7 + t + off;
};

const alphaOK = (p) => clamp(p * 1.5);
function lineTo(pts) { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); }
function mapBlobs(x, y, s, a, detail) { // 抽象的“世界”底图：大陆块 + 随缩放增多的细节点
  ctx.save(); ctx.globalAlpha *= a; rr(x, y, s, s, 6); ctx.clip();
  ctx.fillStyle = '#0b1124'; ctx.fillRect(x, y, s, s);
  [[0.27, 0.34, 0.19, 0.13, -0.3], [0.58, 0.3, 0.15, 0.2, 0.25], [0.64, 0.68, 0.2, 0.11, 0.1], [0.24, 0.72, 0.11, 0.09, 0], [0.84, 0.46, 0.08, 0.14, 0.4]].forEach(([cx, cy, rx, ry, rot]) => {
    ctx.beginPath(); ctx.ellipse(x + cx * s, y + cy * s, rx * s, ry * s, rot, 0, 7); ctx.fillStyle = 'rgba(52,213,200,0.2)'; ctx.fill(); ctx.strokeStyle = 'rgba(52,213,200,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (let i = 0; i < detail; i++) { ctx.fillRect(x + rnd(i * 2 + 5) * s, y + rnd(i * 2 + 6) * s, 2.5, 2.5); }
  ctx.restore();
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  const gx = 1100, gy = 190, cs = 64, n = 10, m = 8;
  for (let r = 0; r < m; r++) for (let c = 0; c < n; c++) {
    const p = eOut(P(lt, 0.4 + (c + r) * 0.06, 1.0 + (c + r) * 0.06));
    ctx.save(); ctx.globalAlpha *= p * 0.7; rr(gx + c * cs + 3, gy + r * cs + 3, cs - 6, cs - 6, 8);
    ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  const route = [[0, 6], [2, 6], [2, 4], [5, 4], [5, 2], [8, 2], [8, 1], [9, 1]].map(([c, r]) => [gx + c * cs + cs / 2, gy + r * cs + cs / 2]);
  const pr = eIO(P(lt, 2.0, 5.0));
  let len = 0; const segs = []; for (let i = 1; i < route.length; i++) { const l = Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]); segs.push(l); len += l; }
  let rem = pr * len; const pts = [route[0]];
  for (let i = 1; i < route.length && rem > 0; i++) { const f = Math.min(1, rem / segs[i - 1]); pts.push([lerp(route[i - 1][0], route[i][0], f), lerp(route[i - 1][1], route[i][1], f)]); rem -= segs[i - 1]; }
  if (pts.length > 1) { ctx.save(); ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = SC[4]; glow(SC[4], 22); lineTo(pts); ctx.stroke(); ctx.restore(); const [hx, hy] = pts[pts.length - 1]; dot(hx, hy, 12, '#fff', { g: 26 }); }
  dot(route[0][0], route[0][1], 11, '#fff', { g: 20, a: eOut(P(lt, 1.6, 2.2)) });
  text('SYSTEM DESIGN INTERVIEW · ANIMATED GUIDE', 110, 400, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4)); ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 118px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('Google Maps', 104, 540); ctx.restore();
  text('How a map gets sliced', 112, 610, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('Chapter 18', 112, 700, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 1：三条链路 ─────────
function sceneThree(lt, d) {
  header(lt, '01', 'Three Pipelines', SC[1], 'Location · Tiles · Routing');
  const CW = 330, CY = 230, CH = 560, cx = (k) => 800 + k * 355;
  const tL = T('three', 'Location updates'), tT = T('three', 'Viewing the map'), tR = T('three', 'Finding a route'), tHard = T('three', 'The hard parts');
  const cols = [SC[3], SC[0], SC[2]], titles = ['Location', 'Map tiles', 'Navigation'];
  for (let k = 0; k < 3; k++) {
    const a = eOut(P(lt, 0.5 + k * 0.2, 1.3 + k * 0.2));
    const dimv = k === 0 ? 1 - 0.55 * eOut(P(lt, tHard, tHard + 0.8)) : 1;
    ctx.save(); ctx.globalAlpha *= a * dimv; glass(cx(k), CY, CW, CH, { accent: cols[k] });
    text(titles[k], cx(k) + CW / 2, CY + 62, { size: 40, weight: 800, align: 'center', color: cols[k] }); ctx.restore();
  }
  // 卡 1：批量上传 → Cassandra / Kafka
  { const x = cx(0), a = eOut(P(lt, tL - 0.2, tL + 0.6)) * (1 - 0.55 * eOut(P(lt, tHard, tHard + 0.8)));
    if (a > 0) { ctx.save(); ctx.globalAlpha *= a;
      text('Batch upload, write-heavy', x + CW / 2, CY + 104, { maxW: 300, size: 24, color: MUTE, align: 'center' });
      dbIcon(x + 38, CY + 140, 110, 90, 'Cassandra', { color: SC[3] });
      box(x + 190, CY + 150, 110, 78, 'Kafka', { color: SC[1], size: 26 });
      box(x + 38, CY + 370, 254, 80, 'Client', { color: SC[3], sub: 'batch, then send', size: 32 });
      arrow(x + 93, CY + 368, x + 93, CY + 300, { color: SC[3], w: 3 }); arrow(x + 245, CY + 368, x + 245, CY + 244, { color: SC[1], w: 3 });
      for (let i = 0; i < 4; i++) { const u = ((lt - tL) * 0.5 + i / 4) % 1; packet(x + 93, CY + 366, x + 93, CY + 304, u, SC[3], { r: 6, trail: 0.2 }); packet(x + 245, CY + 366, x + 245, CY + 248, u, SC[1], { r: 6, trail: 0.2 }); }
      text('~200K QPS', x + CW / 2, CY + 508, { size: 32, weight: 800, align: 'center', font: MONO, a: eOut(P(lt, T('three', 'The book estimates'), T('three', 'The book estimates') + 0.7)) });
      text('Peak 1M', x + CW / 2, CY + 546, { size: 26, color: MUTE, align: 'center', font: MONO, a: eOut(P(lt, T('three', 'peaking'), T('three', 'peaking') + 0.7)) });
      ctx.restore(); } }
  // 卡 2：图像瓦片
  { const x = cx(1), a = eOut(P(lt, tT - 0.2, tT + 0.6));
    if (a > 0) { ctx.save(); ctx.globalAlpha *= a;
      text('Image tiles · CDN', x + CW / 2, CY + 104, { maxW: 300, size: 24, color: MUTE, align: 'center' });
      const gx = x + 41, gy = CY + 150, cs = 62, ph = Math.floor(((lt - tT) * 0.8) % 3);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const on = c >= ph && c < ph + 2 && r >= 1 && r < 3;
        rr(gx + c * cs + 2, gy + r * cs + 2, cs - 4, cs - 4, 8); ctx.fillStyle = on ? SC[0] + '55' : 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.strokeStyle = on ? SC[0] : 'rgba(255,255,255,0.14)'; ctx.lineWidth = on ? 3 : 1.5; ctx.stroke();
      }
      text('Fetch only what is visible', x + CW / 2, CY + 450, { size: 28, weight: 600, align: 'center' });
      text('×4 per level', x + CW / 2, CY + 500, { size: 28, weight: 800, align: 'center', font: MONO, color: SC[0] });
      ctx.restore(); } }
  // 卡 3：路由瓦片
  { const x = cx(2), a = eOut(P(lt, tR - 0.2, tR + 0.6));
    if (a > 0) { ctx.save(); ctx.globalAlpha *= a;
      text('Routing tiles · A*', x + CW / 2, CY + 104, { maxW: 300, size: 24, color: MUTE, align: 'center' });
      const gx = x + 41, gy = CY + 150, cs = 62;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
      for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(gx, gy + i * cs); ctx.lineTo(gx + 4 * cs, gy + i * cs); ctx.moveTo(gx + i * cs, gy); ctx.lineTo(gx + i * cs, gy + 4 * cs); ctx.stroke(); } ctx.setLineDash([]);
      const nodes = [[0, 3], [1, 3], [1, 2], [2, 2], [2, 1], [3, 1], [3, 0], [4, 0]].map(([c, r]) => [gx + c * cs, gy + r * cs]);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; for (let r = 0; r <= 4; r++) for (let c = 0; c <= 4; c++) ctx.fillRect(gx + c * cs - 3, gy + r * cs - 3, 6, 6);
      const p = eIO(P(lt, tR + 0.6, tR + 2.6)); const k = p * (nodes.length - 1), i = Math.floor(k); const pts = nodes.slice(0, i + 1); if (i < nodes.length - 1) pts.push([lerp(nodes[i][0], nodes[i + 1][0], k - i), lerp(nodes[i][1], nodes[i + 1][1], k - i)]);
      ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = SC[4]; glow(SC[4], 14); lineTo(pts); ctx.stroke(); ctx.shadowBlur = 0;
      dot(nodes[0][0], nodes[0][1], 9, '#fff', { g: 14 }); dot(nodes[7][0], nodes[7][1], 9, SC[2], { g: 14 });
      text('Load on demand, layered', x + CW / 2, CY + 450, { size: 28, weight: 600, align: 'center' });
      text('Only along the route', x + CW / 2, CY + 500, { size: 28, weight: 800, align: 'center', color: SC[2] });
      ctx.restore(); } }
  bullet(0, 'Locations kept by time', eOut(P(lt, tL, tL + 0.6)));
  bullet(1, 'Images cut into tiles', eOut(P(lt, tT, tT + 0.6)));
  bullet(2, 'Roads cut into subgraphs', eOut(P(lt, tR, tR + 0.6)));
  text('This video covers the last two', 110, 680, { size: 28, color: SC[1], weight: 700, a: eOut(P(lt, tHard + 0.4, tHard + 1.2)) });
}

// ───────── 场景 2：缩放级别，瓦片 ×4 ─────────
function sceneTiles(lt, d) {
  header(lt, '02', 'Map Tiles', SC[0], 'Each zoom level: tiles ×4');
  const X0 = 860, Y0 = 210, S = 600;
  const tCut = T('tiles', 'so we cut'), tZ0 = T('tiles', 'At the lowest'), tZ1 = T('tiles', 'Each zoom level up'), tZ2 = T('tiles', 'so the total'), tZ3 = tZ2 + 1.9;
  const z = lt >= tZ3 ? 3 : lt >= tZ2 ? 2 : lt >= tZ1 ? 1 : 0;
  const tz = [tZ0, tZ1, tZ2, tZ3][z];
  const detail = [10, 40, 140, 420][z];
  mapBlobs(X0, Y0, S, eOut(P(lt, 0.4, 1.4)), lt < tZ0 ? 10 : detail);
  // 切块示意（z2 网格闪现再合并为一整张）
  const showGridZ = lt < tZ0 ? 2 : z;
  let ga = 1;
  if (lt < tZ0) ga = eOut(P(lt, tCut, tCut + 0.8)) * (1 - eOut(P(lt, tZ0 - 0.5, tZ0 + 0.3)));
  else ga = 1;
  const n = 2 ** showGridZ, cs = S / n;
  if (ga > 0 && lt >= 0) {
    ctx.save(); ctx.globalAlpha *= ga; ctx.strokeStyle = SC[0]; ctx.lineWidth = z >= 3 ? 1.5 : 2.5; glow(SC[0], 8);
    for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(X0 + i * cs, Y0); ctx.lineTo(X0 + i * cs, Y0 + S); ctx.moveTo(X0, Y0 + i * cs); ctx.lineTo(X0 + S, Y0 + i * cs); ctx.stroke(); }
    ctx.restore();
  }
  ctx.save(); ctx.strokeStyle = SC[0]; ctx.lineWidth = 3.5; glow(SC[0], 14); ctx.globalAlpha *= eOut(P(lt, 0.6, 1.4)); rr(X0, Y0, S, S, 6); ctx.stroke(); ctx.restore();
  if (lt >= tZ0 && z <= 2) {
    const la = eOut(P(lt, tz + 0.3, tz + 0.9));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const bx = X0 + c * cs + cs / 2, by = Y0 + r * cs + cs / 2;
      ctx.save(); ctx.globalAlpha *= la; rr(bx - (z === 2 ? 56 : z === 1 ? 70 : 100), by - (z === 0 ? 26 : 17), z === 2 ? 112 : z === 1 ? 140 : 200, z === 0 ? 52 : 34, 9); ctx.fillStyle = 'rgba(6,8,15,0.7)'; ctx.fill();
      text('256×256', bx, by + (z === 0 ? 12 : 8), { size: z === 0 ? 34 : z === 1 ? 28 : 22, weight: 700, align: 'center', font: MONO, color: SC[0] }); ctx.restore();
    }
  }
  const pp = P(lt, tz, tz + 0.7); if (z > 0 && pp > 0 && pp < 1) { ctx.save(); ctx.globalAlpha = (1 - pp) * 0.5; ctx.fillStyle = SC[0]; ctx.fillRect(X0, Y0, S, S); ctx.restore(); }
  // PB 标注
  const pbA = eOut(P(lt, T('tiles', 'petabyte'), T('tiles', 'petabyte') + 0.6)) * (1 - eOut(P(lt, tCut + 0.3, tCut + 1)));
  if (pbA > 0) { ctx.save(); ctx.globalAlpha *= pbA; rr(X0 + S / 2 - 150, Y0 + S / 2 - 40, 300, 80, 20); ctx.fillStyle = 'rgba(6,8,15,0.8)'; ctx.fill(); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.stroke(); text('Petabytes: too big', X0 + S / 2, Y0 + S / 2 + 12, { maxW: 270, size: 32, weight: 800, align: 'center', color: RED }); ctx.restore(); }
  // 右侧级别列表
  for (let k = 0; k < 4; k++) {
    const tk = [tZ0, tZ1, tZ2, tZ3][k], a = eOut(P(lt, tk, tk + 0.6)), on = k === z, y = 230 + k * 150;
    if (k > 0 && a > 0) { ctx.save(); ctx.globalAlpha *= a; text('×4', 1685, y - 14, { size: 28, weight: 800, font: MONO, color: SC[3], align: 'center' }); ctx.restore(); }
    if (a <= 0) continue;
    ctx.save(); ctx.globalAlpha *= a; glass(1545, y, 290, 100, { accent: on ? SC[0] : null, fill: on ? 0.14 : 0.04 });
    text(`z${k}`, 1575, y + 62, { size: 38, weight: 800, font: MONO, color: on ? SC[0] : MUTE });
    text(`${4 ** k} ${k === 0 ? 'tile' : 'tiles'}`, 1805, y + 62, { size: 34, weight: 800, font: MONO, align: 'right', color: on ? INK : MUTE }); ctx.restore();
  }
  bullet(0, 'Lowest zoom: 1 tile = the world', eOut(P(lt, tZ0, tZ0 + 0.6)));
  bullet(1, 'Each zoom in: 1 tile splits into 4', eOut(P(lt, tZ1, tZ1 + 0.6)));
  statCard(110, 600, 640, 'Size of each tile', '256 × 256', { color: SC[0], a: eOut(P(lt, tZ0 + 0.5, tZ0 + 1.2)) });
  statCard(110, 740, 640, 'Growth in total tiles', '×4 / level', { color: SC[3], a: eOut(P(lt, tZ2, tZ2 + 0.7)) });
}

// ───────── 场景 3：只取可视区域，CDN ─────────
function sceneViewport(lt, d) {
  header(lt, '03', 'Visible Area Only', SC[0], 'Client computes IDs, CDN serves images');
  const X0 = 840, Y0 = 190, CS = 88;
  const tCDN = T('viewport', 'fetches pre-rendered'), tP1 = T('viewport', 'When you pan'), tP2 = tP1 + 3.8, tCalc = T('viewport', 'turns its position');
  const cdn = [1730, 520];
  const in0 = (c, r) => c >= 2 && c <= 5 && r >= 2 && r <= 4;
  const arr = {}; // 到达时间
  for (let r = 2; r <= 4; r++) for (let c = 2; c <= 5; c++) arr[c + ',' + r] = tCDN + 0.7 + ((r - 2) * 4 + (c - 2)) * 0.12;
  for (let r = 2; r <= 4; r++) arr['6,' + r] = tP1 + 1.4 + (r - 2) * 0.15;
  for (let c = 3; c <= 6; c++) arr[c + ',5'] = tP2 + 1.4 + (c - 3) * 0.15;
  const gone = (c, r) => (c === 2 ? P(lt, tP1 + 1.4, tP1 + 2.0) : 0) || (r === 2 ? P(lt, tP2 + 1.4, tP2 + 2.0) : 0);
  const vc = 2 + eIO(P(lt, tP1 + 0.3, tP1 + 1.3)), vr = 2 + eIO(P(lt, tP2 + 0.3, tP2 + 1.3));
  const ga = eOut(P(lt, 0.3, 1.0));
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const x = X0 + c * CS, y = Y0 + r * CS, k = c + ',' + r, at = arr[k];
    ctx.save(); ctx.globalAlpha *= ga; rr(x + 3, y + 3, CS - 6, CS - 6, 9); ctx.fillStyle = 'rgba(255,255,255,0.035)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
    if (at !== undefined) {
      const l = eOut(P(lt, at, at + 0.35)) * (1 - gone(c, r));
      if (l > 0) {
        ctx.save(); ctx.globalAlpha *= l; rr(x + 3, y + 3, CS - 6, CS - 6, 9); ctx.fillStyle = SC[0] + '40'; ctx.fill(); ctx.strokeStyle = SC[0]; ctx.lineWidth = 2.5; ctx.stroke();
        text(`3/${c}/${r}`, x + CS / 2, y + CS / 2 + 7, { size: 20, weight: 700, font: MONO, align: 'center' }); ctx.restore();
        const fl = P(lt, at, at + 0.7); if (at > tCDN + 3 && fl < 1) { ctx.save(); ctx.globalAlpha *= (1 - fl); ctx.strokeStyle = SC[4]; ctx.lineWidth = 4; rr(x + 1, y + 1, CS - 2, CS - 2, 10); ctx.stroke(); ctx.restore(); }
      }
      const pp = P(lt, at - 0.8, at - 0.05); if (pp > 0 && pp < 1) packet(cdn[0], cdn[1], x + CS / 2, y + CS / 2, pp, SC[4], { r: 8, trail: 0.2 });
    }
  }
  const va = eOut(P(lt, 1.2, 2.0));
  ctx.save(); ctx.globalAlpha *= va; ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; glow('#ffffff', 14); rr(X0 + vc * CS, Y0 + vr * CS, 4 * CS, 3 * CS, 14); ctx.stroke(); ctx.restore();
  text('Viewport', X0 + vc * CS + 4 * CS, Y0 + vr * CS - 12, { size: 22, weight: 600, align: 'right', a: va * 0.9 });
  text('z3: 64 tiles in all · illustrative', X0, Y0 + 8 * CS + 34, { size: 20, color: DIM, a: ga });
  // CDN
  const ca = eOut(P(lt, tCDN - 0.3, tCDN + 0.4));
  box(1620, 450, 200, 140, 'CDN', { color: SC[4], sub: 'static images', a: ca, size: 32 });
  // 编号计算
  const ra = eOut(P(lt, tCalc - 0.2, tCalc + 0.6));
  if (ra > 0) {
    const [hx, hy] = [X0 + 4 * CS + CS / 2, Y0 + 3 * CS + CS / 2], pu = (Math.sin(lt * 5) + 1) / 2;
    ctx.save(); ctx.globalAlpha *= ra; ctx.strokeStyle = SC[3]; ctx.lineWidth = 4; rr(X0 + 4 * CS + 1, Y0 + 3 * CS + 1, CS - 2, CS - 2, 10); ctx.stroke(); ctx.restore();
    glass(110, 400, 640, 150, { a: ra, accent: SC[3] });
    text('Position + zoom level', 140, 448, { size: 24, color: MUTE, a: ra });
    text('→ z/x/y = 3/4/3', 140, 516, { size: 42, weight: 800, font: MONO, color: SC[3], a: ra });
  }
  const ph = lt < tP1 ? 0 : lt < tP2 ? 1 : 2, vals = [[12, 0], [3, 9], [4, 8]][ph];
  statCard(110, 585, 640, ph ? 'This pan · new from CDN' : 'First screen · from CDN', `${vals[0]} tiles`, { color: SC[4], a: eOut(P(lt, tCDN + 0.4, tCDN + 1.1)) });
  statCard(110, 715, 640, 'Local cache hits', `${vals[1]} tiles`, { color: SC[0], a: eOut(P(lt, tP1, tP1 + 0.7)) });
  text('Numbering must stay client/server compatible', 110, 890, { maxW: 640, size: 24, color: MUTE, a: eOut(P(lt, T('viewport', 'The numbering'), T('viewport', 'The numbering') + 0.7)) });
}

// ───────── 路网网格（graph / rtile 共用） ─────────
const GX = 816, GY = 200, CELL = 21;
const nx = (n) => GX + (n % COLS) * CELL, ny = (n) => GY + ((n / COLS) | 0) * CELL;
function roads(a, prog = 1) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.3; ctx.beginPath();
  for (let r = 0; r < ROWS; r++) { ctx.moveTo(GX, GY + r * CELL); ctx.lineTo(GX + (COLS - 1) * CELL * prog, GY + r * CELL); }
  for (let c = 0; c < COLS; c++) { ctx.moveTo(GX + c * CELL, GY); ctx.lineTo(GX + c * CELL, GY + (ROWS - 1) * CELL * prog); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (c <= (COLS - 1) * prog) ctx.rect(GX + c * CELL - 2, GY + r * CELL - 2, 4, 4);
  ctx.fill(); ctx.restore();
}
function waves(order, k, color, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color + 'aa'; ctx.beginPath();
  const old = Math.max(0, k - 50);
  for (let i = 0; i < old; i++) { const n = order[i]; ctx.rect(nx(n) - 4.5, ny(n) - 4.5, 9, 9); }
  ctx.fill(); ctx.fillStyle = '#ffffff'; glow(color, 12); ctx.beginPath();
  for (let i = old; i < k; i++) { const n = order[i]; ctx.rect(nx(n) - 4.5, ny(n) - 4.5, 9, 9); }
  ctx.fill(); ctx.restore();
}
function endpoints(a) {
  const s = nid(SP.c, SP.r), g = nid(DP.c, DP.r);
  dot(nx(s), ny(s), 11, '#fff', { g: 22, a }); dot(nx(g), ny(g), 11, SC[2], { g: 22, a });
  text('Start', nx(s) + 18, ny(s) - 16, { size: 24, weight: 700, a }); text('End', nx(g) - 18, ny(g) + 38, { size: 24, weight: 700, color: SC[2], align: 'right', a });
}
function pathLine(path, p, color = SC[4]) {
  if (p <= 0) return; const k = p * (path.length - 1), i = Math.floor(k);
  const pts = path.slice(0, i + 1).map((n) => [nx(n), ny(n)]); if (i < path.length - 1) { const a = path[i], b = path[i + 1]; pts.push([lerp(nx(a), nx(b), k - i), lerp(ny(a), ny(b), k - i)]); }
  ctx.save(); ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = color; glow(color, 18); lineTo(pts); ctx.stroke(); ctx.restore();
}

// ───────── 场景 4：路网是图，搜索波前从起点扩散 ─────────
function sceneGraph(lt, d) {
  header(lt, '04', 'Roads Are a Graph', SC[1], 'The search front spreads from the start');
  roads(1, eOut(P(lt, 0.4, 2.2)));
  endpoints(eOut(P(lt, 1.8, 2.6)));
  const tW = T('graph', 'It expands outward') - 1.2, tE = T('graph', 'We can\'t scan') - 0.4;
  const k = Math.floor(R.dij.order.length * P(lt, tW, tE));
  waves(R.dij.order, k, SC[1]);
  const a = eIO(P(lt, tE + 0.1, tE + 1.5)); pathLine(R.dij.path, a);
  bullet(0, 'Intersection = node', eOut(P(lt, T('graph', 'Intersections are nodes'), T('graph', 'Intersections are nodes') + 0.6)));
  bullet(1, 'Road = edge', eOut(P(lt, T('graph', 'roads are edges'), T('graph', 'roads are edges') + 0.6)));
  bullet(2, 'Modified Dijkstra / A*', eOut(P(lt, T('graph', 'routes are found'), T('graph', 'routes are found') + 0.6)));
  const ca = eOut(P(lt, T('graph', 'Search is sensitive'), T('graph', 'Search is sensitive') + 0.7));
  statCard(110, 640, 640, 'Intersections expanded', `${k}`, { color: SC[1], a: ca, note: `/ ${COLS * ROWS}` });
  text('Illustrative: 48×30 road grid', GX, 872, { size: 20, color: DIM, a: eOut(P(lt, 1.2, 2)) });
  text('Whole world: cannot scan it all', 110, 810, { size: 28, weight: 700, color: RED, a: eOut(P(lt, T('graph', 'We can\'t scan'), T('graph', 'We can\'t scan') + 0.8)) });
}

// ───────── 场景 5：路由瓦片，按需加载 ─────────
const firstT = (() => { const m = {}; R.astar.order.forEach((n, i) => { const t = ((n / COLS / TS) | 0) * 100 + (((n % COLS) / TS) | 0); if (m[t] === undefined) m[t] = i; }); return m; })();
function sceneRtile(lt, d) {
  header(lt, '05', 'Routing Tiles', SC[3], 'Load on demand, only tiles en route');
  roads(0.55, 1);
  const TW = TS * CELL, tx0 = GX - CELL / 2, ty0 = GY - CELL / 2, TC = COLS / TS, TR = ROWS / TS;
  const tCut = 0.5, tLink = T('rtile', 'each holding'), tRun = T('rtile', 'The search stitches'), tEnd = T('rtile', 'The rest is never') - 0.6;
  const k = Math.floor(R.astar.order.length * P(lt, tRun + 0.4, tEnd));
  let loaded = 0;
  for (let r = 0; r < TR; r++) for (let c = 0; c < TC; c++) {
    const key = r * 100 + c, x = tx0 + c * TW, y = ty0 + r * TW, born = eOut(P(lt, tCut + (c + r) * 0.05, tCut + 0.6 + (c + r) * 0.05));
    const touched = firstT[key] !== undefined && firstT[key] < k, since = touched ? 1 : 0; if (touched) loaded++;
    ctx.save(); ctx.globalAlpha *= born; rr(x + 3, y + 3, TW - 6, TW - 6, 12);
    ctx.fillStyle = touched ? SC[3] + '38' : 'rgba(255,255,255,0.03)'; ctx.fill(); ctx.lineWidth = touched ? 3 : 1.6; ctx.strokeStyle = touched ? SC[3] : 'rgba(255,255,255,0.2)'; if (touched) glow(SC[3], 10); ctx.stroke(); ctx.restore();
  }
  // 相邻引用
  const la = eOut(P(lt, tLink, tLink + 0.8)) * (1 - 0.7 * eOut(P(lt, tRun, tRun + 0.8)));
  if (la > 0) { ctx.save(); ctx.globalAlpha *= la; ctx.strokeStyle = SC[3]; ctx.lineWidth = 2.5; ctx.setLineDash([6, 8]); ctx.beginPath();
    for (let r = 0; r < TR; r++) for (let c = 0; c < TC; c++) { const x = tx0 + c * TW + TW / 2, y = ty0 + r * TW + TW / 2; if (c < TC - 1) { ctx.moveTo(x, y); ctx.lineTo(x + TW, y); } if (r < TR - 1) { ctx.moveTo(x, y); ctx.lineTo(x, y + TW); } }
    ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = SC[3]; for (let r = 0; r < TR; r++) for (let c = 0; c < TC; c++) { ctx.beginPath(); ctx.arc(tx0 + c * TW + TW / 2, ty0 + r * TW + TW / 2, 5, 0, 7); ctx.fill(); } ctx.restore(); }
  endpoints(eOut(P(lt, 1.0, 1.8)));
  waves(R.astar.order, k, SC[1]);
  pathLine(R.astar.path, eIO(P(lt, tEnd + 0.1, tEnd + 1.3)));
  bullet(0, 'Network cut into routing tiles', eOut(P(lt, 0.7, 1.3)));
  bullet(1, 'Each tile links to neighbors', eOut(P(lt, tLink, tLink + 0.6)));
  const ca = eOut(P(lt, tRun + 0.5, tRun + 1.2));
  statCard(110, 560, 640, 'Tiles loaded', `${loaded}`, { color: SC[3], a: ca, note: `of ${TC * TR}` });
  statCard(110, 690, 640, 'Intersections expanded', `${Math.min(k, R.astar.order.length)}`, { color: SC[1], a: ca, note: `full scan ${R.dij.order.length}` });
  text('Illustrative: same 48×30 grid, A* variant', GX, 872, { size: 20, color: DIM, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 6：分层路由 ─────────
const HC_ = 32, HR_ = 20, HCS = 32, HX = 816, HY = 205;
const HS = [2, 17], HD = [30, 3];
const hpts = [[2.5, 17.5], [9.5, 12.5], [20.5, 10.5], [30.5, 3.5]];
const hfine = []; const hseen = new Set();
for (let i = 0; i <= 900; i++) { const u = (i / 900) * (hpts.length - 1), s = Math.min(Math.floor(u), hpts.length - 2), f = u - s; const x = lerp(hpts[s][0], hpts[s + 1][0], f), y = lerp(hpts[s][1], hpts[s + 1][1], f); const c = Math.floor(x), r = Math.floor(y), key = c + ',' + r; if (!hseen.has(key)) { hseen.add(key); hfine.push([c, r]); } }
const hlevel = ([c, r]) => { const dd = Math.min(Math.max(Math.abs(c - HS[0]), Math.abs(r - HS[1])), Math.max(Math.abs(c - HD[0]), Math.abs(r - HD[1]))); return dd <= 2 ? 1 : dd <= 6 ? 2 : dd <= 11 ? 4 : 8; };
const hblocks = []; const hbs = new Set();
hfine.forEach(([c, r]) => { const s = hlevel([c, r]), bx = Math.floor(c / s) * s, by = Math.floor(r / s) * s, key = `${s}:${bx},${by}`; if (!hbs.has(key)) { hbs.add(key); hblocks.push({ s, bx, by }); } });
const HLC = { 1: SC[3], 2: SC[2], 4: SC[1], 8: SC[0] };
function sceneHier(lt, d) {
  header(lt, '06', 'Hierarchical Routing', SC[2], 'Long trips use upper levels first');
  const ga = eOut(P(lt, 0.3, 1.0));
  ctx.save(); ctx.globalAlpha *= ga; ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1.3; ctx.beginPath();
  for (let i = 0; i <= HC_; i++) { ctx.moveTo(HX + i * HCS, HY); ctx.lineTo(HX + i * HCS, HY + HR_ * HCS); }
  for (let i = 0; i <= HR_; i++) { ctx.moveTo(HX, HY + i * HCS); ctx.lineTo(HX + HC_ * HCS, HY + i * HCS); }
  ctx.stroke(); ctx.restore();
  const tF0 = T('hier', 'But a long trip') + 0.8, tF1 = T('hier', 'which is expensive') + 0.6, tH = T('hier', 'So we add hierarchy'), tFar = T('hier', 'Far from'), tNear = T('hier', 'Near it');
  const nF = hfine.length, kF = Math.floor(nF * P(lt, tF0, tF1 + 0.4));
  const fade = 1 - 0.8 * eOut(P(lt, tFar - 0.5, tFar + 0.3));
  hfine.forEach(([c, r], i) => {
    if (i >= kF) return; const x = HX + c * HCS, y = HY + r * HCS;
    ctx.save(); ctx.globalAlpha *= fade; rr(x + 2, y + 2, HCS - 4, HCS - 4, 5); ctx.fillStyle = SC[3] + '66'; ctx.fill(); ctx.strokeStyle = SC[3]; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  });
  // 分层方块：高层先出，近处后出
  const tOf = { 8: tFar, 4: tFar + 0.9, 2: tNear - 0.3, 1: tNear + 0.5 }; const seq = { 1: 0, 2: 0, 4: 0, 8: 0 }; let nB = 0;
  hblocks.forEach((b) => {
    const t0 = tOf[b.s] + seq[b.s]++ * 0.18, p = eOut(P(lt, t0, t0 + 0.5)); if (p <= 0) return; nB++;
    const x = HX + b.bx * HCS, y = HY + b.by * HCS, w = Math.min(b.s, HC_ - b.bx) * HCS, h = Math.min(b.s, HR_ - b.by) * HCS;
    ctx.save(); ctx.globalAlpha *= p; rr(x + 3, y + 3, w - 6, h - 6, 8); ctx.fillStyle = HLC[b.s] + '30'; ctx.fill(); ctx.strokeStyle = HLC[b.s]; ctx.lineWidth = 3; glow(HLC[b.s], 10); ctx.stroke(); ctx.restore();
  });
  ctx.save(); ctx.globalAlpha *= ga; dot(HX + (HS[0] + 0.5) * HCS, HY + (HS[1] + 0.5) * HCS, 11, '#fff', { g: 20 }); dot(HX + (HD[0] + 0.5) * HCS, HY + (HD[1] + 0.5) * HCS, 11, SC[2], { g: 20 });
  text('Start', HX + (HS[0] + 0.5) * HCS + 16, HY + (HS[1] + 0.5) * HCS + 40, { size: 22, weight: 700 }); text('End', HX + (HD[0] + 0.5) * HCS - 16, HY + (HD[1] + 0.5) * HCS - 22, { size: 22, weight: 700, color: SC[2], align: 'right' }); ctx.restore();
  // 图例
  const lg = eOut(P(lt, tH, tH + 0.8)); let lx = HX;
  [[1, 'Fine'], [2, 'Mid'], [4, 'High'], [8, 'Top']].forEach(([s, nm]) => { ctx.save(); ctx.globalAlpha *= lg; ctx.fillStyle = HLC[s]; rr(lx, 166, 20, 20, 5); ctx.fill(); text(nm, lx + 28, 184, { size: 22, weight: 600, color: INK }); ctx.restore(); lx += 130; });
  const fineN = Math.min(kF, nF), hierN = hblocks.length;
  statCard(110, 470, 640, 'Fine level only: tiles to stitch', `${fineN}`, { color: SC[3], a: eOut(P(lt, tF0, tF0 + 0.7)) });
  statCard(110, 600, 640, 'Hierarchy: far part on high levels', `${nB}`, { color: SC[0], a: eOut(P(lt, tFar, tFar + 0.7)) });
  bullet(0, 'Same network, several detail levels', eOut(P(lt, T('hier', 'The same road network'), T('hier', 'The same road network') + 0.6)), { y0: 770 });
  bullet(1, 'Level chosen by distance: highway first', eOut(P(lt, tFar, tFar + 0.6)), { y0: 770, step: 56 });
  text('Illustrative: tile sizes and counts', HX + HC_ * HCS, 878, { size: 20, color: DIM, align: 'right', a: ga });
}

// ───────── 场景 7：导航服务流水线 ─────────
function sceneNav(lt, d) {
  header(lt, '07', 'Navigation Service', SC[2], 'How one request flows');
  const tCli = 0.8, tGeo = T('nav', 'geocoding'), tPlan = T('nav', 'route planner'), tSP = T('nav', 'shortest-path service'), tEta = T('nav', 'The ETA service'), tRank = T('nav', 'the ranker');
  const bx = (t, dl = 0.6) => eBack(P(lt, t, t + dl));
  const U = {
    cli: [810, 470, 150, 100], geo: [1060, 230, 260, 100], plan: [1060, 470, 260, 100], eta: [1060, 710, 260, 100],
    sp: [1490, 470, 330, 100], rk: [1490, 710, 330, 100], s3: [1560, 250, 190, 110],
  };
  const sc = (t) => clamp(bx(t)), al = (t) => eOut(P(lt, t, t + 0.4));
  box(...U.cli.slice(0, 4), 'Client', { color: SC[0], sub: 'A → B', a: al(tCli), s: sc(tCli), size: 32 });
  box(...U.geo, 'Geocoding', { color: SC[3], sub: 'address → lat/lng', a: al(tGeo), s: sc(tGeo), size: 32 });
  box(...U.plan, 'Route planner', { color: SC[1], sub: 'coords → tiles', a: al(1.6), s: sc(1.6), size: 32 });
  box(...U.sp, 'Shortest path', { color: SC[2], sub: 'A* variant', a: al(tSP), s: sc(tSP), size: 32 });
  dbIcon(U.s3[0], U.s3[1], U.s3[2], U.s3[3], '', { color: SC[3], a: al(tSP + 0.4) });
  text('Object storage · routing tiles', 1655, 232, { size: 24, weight: 600, align: 'center', a: al(tSP + 0.4) });
  box(...U.eta, 'ETA service', { color: SC[4], sub: 'traffic + ML', a: al(tEta), s: sc(tEta), size: 32 });
  box(...U.rk, 'Ranker', { color: SC[0], sub: 'by user preference', a: al(tRank), s: sc(tRank), size: 32 });
  const hop = (x1, y1, x2, y2, t, color) => { arrow(x1, y1, x2, y2, { color, p: eOut(P(lt, t, t + 0.5)), a: 0.9, w: 4 }); const q = P(lt, t + 0.4, t + 1.6); packet(x1, y1, x2, y2, q, color, { r: 8 }); };
  hop(960, 520, 1060, 520, 1.9, SC[0]);
  { const q = P(lt, tPlan, tPlan + 0.9); if (q > 0 && q < 1) { ctx.save(); ctx.strokeStyle = SC[1]; ctx.globalAlpha = 1 - q; ctx.lineWidth = 4; rr(1060 - q * 24, 470 - q * 24, 260 + q * 48, 100 + q * 48, 22 + q * 10); ctx.stroke(); ctx.restore(); } }
  hop(1190, 470, 1190, 332, tGeo + 0.3, SC[3]);
  hop(1320, 520, 1490, 520, tSP + 0.1, SC[2]);
  hop(1655, 470, 1655, 368, tSP + 0.9, SC[3]);
  hop(1190, 570, 1190, 710, tEta + 0.1, SC[4]);
  hop(1300, 570, 1490, 740, tRank + 0.1, SC[0]);
  bullet(0, 'Address → lat/lng → tiles', eOut(P(lt, tGeo, tGeo + 0.6)));
  bullet(1, 'Routing tiles in object storage', eOut(P(lt, tSP, tSP + 0.6)));
  bullet(2, 'ETA and ranking: one job each', eOut(P(lt, tEta, tEta + 0.6)));
  text('An updater service refreshes key databases asynchronously', 110, 640, { maxW: 640, size: 24, color: MUTE, a: eOut(P(lt, tRank + 1.2, tRank + 2)) });
}

// ───────── 场景 8：动态 ETA 与重新规划 ─────────
const EC = 160, ER = 130, EX = 830, EY = 200;
const POS = { 1: [0, 0], 2: [1, 0], 3: [2, 0], 11: [3, 0], 5: [0, 1], 8: [1, 1], 7: [2, 1], 10: [3, 1], 12: [0, 2], 9: [1, 2], 6: [2, 2], 4: [3, 2] };
const tc = (r, o = 0) => [EX + POS[r][0] * EC + EC / 2 + o, EY + POS[r][1] * ER + ER / 2 + o];
const UR = { // 原路线与改道
  u1: { c: SC[0], o: -10, route: [1, 2, 3], re: null },
  u2: { c: SC[1], o: 0, route: [4, 6, 9, 12], re: [4, 6, 7, 8, 5, 12] },
  u3: { c: SC[3], o: 10, route: [2, 8, 9, 12], re: [2, 8, 5, 12] },
};
function polyAt(pts, p) { const L = []; let tot = 0; for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(l); tot += l; } let rem = clamp(p) * tot; const out = [pts[0]]; let i = 1; for (; i < pts.length; i++) { if (rem >= L[i - 1]) { out.push(pts[i]); rem -= L[i - 1]; } else { const f = rem / L[i - 1]; out.push([lerp(pts[i - 1][0], pts[i][0], f), lerp(pts[i - 1][1], pts[i][1], f)]); break; } } return out; }
function sceneEta(lt, d) {
  header(lt, '08', 'Dynamic ETA', RED, 'Traffic changed: notify only those affected');
  const tRec = T('eta', 'The system records'), tAcc = T('eta', 'When an accident'), tFind = T('eta', 'it looks up'), tRe = T('eta', 'reroutes only'), tWs = T('eta', 'pushes new routes'), tCoarse = T('eta', 'If we store only coarse');
  const ga = eOut(P(lt, 0.3, 1.0));
  const hitFind = eOut(P(lt, tFind, tFind + 0.6));
  for (const [r, [c, rw]] of Object.entries(POS)) {
    const x = EX + c * EC, y = EY + rw * ER, isAcc = Number(r) === 9, accA = isAcc ? eOut(P(lt, tAcc, tAcc + 0.5)) : 0;
    ctx.save(); ctx.globalAlpha *= ga; rr(x + 4, y + 4, EC - 8, ER - 8, 14); ctx.fillStyle = accA > 0 ? `rgba(255,93,115,${0.18 * accA})` : 'rgba(255,255,255,0.035)'; ctx.fill();
    ctx.strokeStyle = accA > 0 ? RED : 'rgba(255,255,255,0.16)'; ctx.lineWidth = accA > 0 ? 3.5 : 1.6; if (accA > 0) glow(RED, 14 * accA); ctx.stroke(); ctx.shadowBlur = 0;
    text(`r_${r}`, x + 16, y + 34, { size: 22, weight: 700, font: MONO, color: accA > 0 ? RED : MUTE }); ctx.restore();
  }
  // 事故标记
  const accA = eBack(P(lt, tAcc, tAcc + 0.6));
  if (accA > 0.02) { const [ax, ay] = tc(9); const pul = P(lt, tAcc + 0.2, tAcc + 1.4); if (pul < 1) { ctx.save(); ctx.strokeStyle = RED; ctx.globalAlpha = 1 - pul; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ax, ay - 4, 20 + pul * 70, 0, 7); ctx.stroke(); ctx.restore(); } dot(ax, ay - 4, 16 * clamp(accA), RED, { g: 26 }); text('Accident', ax, ay + 40, { size: 24, weight: 800, color: RED, align: 'center', a: clamp(accA) }); }
  // 原路线 + 车
  const affected = eOut(P(lt, tFind, tFind + 0.6));
  Object.entries(UR).forEach(([u, U], i) => {
    const t0 = tRec + 0.3 + i * 0.5, pr = P(lt, t0, t0 + 1.8), reroute = U.re ? eIO(P(lt, tRe, tRe + 1.6)) : 0;
    const orig = U.route.map((r) => tc(r, U.o));
    const dimA = (U.re ? 1 : 1 - 0.65 * affected);
    ctx.save(); ctx.globalAlpha *= dimA * (U.re ? 1 - 0.7 * reroute : 1); ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = U.c; glow(U.c, 8);
    const seg = polyAt(orig, pr); if (pr > 0) { lineTo(seg); ctx.stroke(); } ctx.restore();
    if (pr > 0) { const [px, py] = seg[seg.length - 1]; if (!U.re || reroute < 0.01) dot(px, py, 10, '#fff', { g: 14, a: dimA }); text(u.replace('u', 'user_'), orig[0][0] - 60, orig[0][1] + 46 + (i - 1) * 0, { size: 20, weight: 700, font: MONO, color: U.c, a: 0 }); }
    if (U.re && reroute > 0) {
      const re = U.re.map((r) => tc(r, U.o + (u === 'u2' ? 0 : 12))), seg2 = polyAt(re, reroute);
      ctx.save(); ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.setLineDash([12, 9]); ctx.strokeStyle = SC[4]; glow(SC[4], 12); lineTo(seg2); ctx.stroke(); ctx.restore();
      const [px, py] = seg2[seg2.length - 1]; dot(px, py, 10, '#fff', { g: 14 });
    }
  });
  // 用户标签图例
  const la = eOut(P(lt, tRec, tRec + 0.6)); [['user_1', SC[0]], ['user_2', SC[1]], ['user_3', SC[3]]].forEach(([n, c], i) => { ctx.save(); ctx.globalAlpha *= la; ctx.fillStyle = c; rr(EX + i * 190, 166, 20, 20, 5); ctx.fill(); text(n, EX + i * 190 + 30, 184, { size: 22, weight: 700, font: MONO, color: c }); ctx.restore(); });
  // 反查表
  const ta = eOut(P(lt, tRec + 1.5, tRec + 2.3));
  glass(EX, 640, 1010, 250, { a: ta, accent: '#8b8dfc' });
  text('User → tiles on the route', EX + 28, 680, { size: 22, color: MUTE, a: ta });
  [['user_1', '1  2  3  …  k', null, SC[0]], ['user_2', '4  6  9  …  n', 9, SC[1]], ['user_3', '2  8  9  …  m', 9, SC[3]]].forEach(([n, s, hit, c], i) => {
    const y = 730 + i * 50, hl = hit ? hitFind : 0;
    ctx.save(); ctx.globalAlpha *= ta; if (hl > 0) { rr(EX + 14, y - 32, 982, 46, 12); ctx.fillStyle = `rgba(255,93,115,${0.16 * hl})`; ctx.fill(); }
    text(n, EX + 30, y, { size: 26, weight: 700, font: MONO, color: c }); text(': r_' + s.split('  ').join(', r_').replace(', r_…, r_', ', …, r_'), EX + 150, y, { size: 26, font: MONO, color: INK, weight: 600 });
    if (hl > 0) text('crosses r_9 → reroute', EX + 990, y, { size: 24, weight: 800, color: RED, align: 'right', a: hl }); ctx.restore();
  });
  // 粗瓦片
  const ca = eOut(P(lt, tCoarse, tCoarse + 0.8));
  if (ca > 0) {
    const x = EX + 1 * EC, y = EY + 1 * ER; ctx.save(); ctx.globalAlpha *= ca; ctx.strokeStyle = SC[2]; ctx.lineWidth = 4; ctx.setLineDash([14, 10]); glow(SC[2], 10); rr(x - 2, y - 2, 2 * EC + 4, 2 * ER + 4, 20); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
    text('Coarse tile super(r)', x + EC, y + 2 * ER + 28, { size: 24, weight: 700, color: SC[2], align: 'center' }); ctx.restore();
  }
  // WebSocket 推送
  const wa = eOut(P(lt, tWs, tWs + 0.8));
  if (wa > 0) {
    box(1530, 200, 300, 110, 'Push new routes', { color: SC[4], sub: 'WebSocket', a: wa, size: 32 });
    [['user_2', SC[1]], ['user_3', SC[3]]].forEach(([n, c], i) => { const y = 370 + i * 100; ctx.save(); ctx.globalAlpha *= wa; glass(1560, y, 240, 78, { accent: c, r: 18 }); text(n, 1590, y + 48, { size: 26, weight: 700, font: MONO, color: c }); text('new', 1778, y + 48, { size: 24, weight: 800, color: SC[4], align: 'right' }); ctx.restore(); packet(1680, 310, 1680, y, P(lt, tWs + 0.6 + i * 0.3, tWs + 1.4 + i * 0.3), SC[4], { r: 7 }); });
  }
  bullet(0, 'Record tiles each user will pass', eOut(P(lt, tRec + 0.2, tRec + 0.8)));
  bullet(1, 'Accident tile → look up users', eOut(P(lt, tFind, tFind + 0.6)));
  bullet(2, 'Reroute only affected users', eOut(P(lt, tRe, tRe + 0.6)));
  bullet(3, 'Push new routes via WebSocket', eOut(P(lt, tWs, tWs + 0.6)));
  bullet(4, 'Coarse hit ≠ certainly affected', eOut(P(lt, tCoarse, tCoarse + 0.6)), { color: SC[2] });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  const gx = 1480, gy = 120, cs = 44;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) { ctx.save(); ctx.globalAlpha *= 0.5 * eOut(P(lt, 0.2 + (r + c) * 0.04, 0.8 + (r + c) * 0.04)); rr(gx + c * cs + 3, gy + r * cs + 3, cs - 6, cs - 6, 7); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.globalAlpha *= 0.8; ctx.strokeStyle = SC[4]; ctx.lineWidth = 6; ctx.lineJoin = 'round'; glow(SC[4], 14); lineTo([[0, 4], [2, 4], [2, 2], [5, 2], [5, 0], [7, 0]].map(([c, r]) => [gx + c * cs + cs / 2, gy + r * cs + cs / 2])); ctx.stroke(); ctx.restore();
  text('Google Maps', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Tiles · Hierarchy · Re-routing', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['Tiles', '×4 per level, fetch only the view', SC[0]], ['Hierarchy', 'Cut roads; long trips go high', SC[3]], ['Live rerouting', 'Look up, notify only the affected', SC[2]]].forEach(([w, s, c], k) => {
    const t0 = [1.9, 2.6, 3.4][k], p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560; glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: k === 2 ? 56 : 70, weight: 800, maxW: 470 }); text(s, x + 36, 620, { size: 26, color: MUTE, maxW: 470 }); ctx.restore();
  });
  text('Image tiles to view, routing tiles to compute', 110, 750, { size: 30, weight: 700, a: eOut(P(lt, 4.8, 5.6)) });
  text('Illustrative animation: grids and counts only explain the mechanism', 110, 880, { size: 20, color: DIM, a: eOut(P(lt, 5.8, 6.6)) });
}

export const scenes = { title: sceneTitle, three: sceneThree, tiles: sceneTiles, viewport: sceneViewport, graph: sceneGraph, rtile: sceneRtile, hier: sceneHier, nav: sceneNav, eta: sceneEta, end: sceneEnd };
