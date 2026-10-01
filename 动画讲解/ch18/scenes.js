// 第 18 章 Google Maps：地图瓦片 / 路由瓦片分层 / 动态 ETA
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';
import { COLS, ROWS, TS, SP, DP, R, id as nid } from './sim.js';

export const meta = { no: 18, title: 'Google Maps', en: 'Designing Google Maps' };

// 旁白文本与时长（用于按短语对齐画面节拍；与 script.json 保持一致）
const TX = {
  three: '地图产品可以拆成三条链路。位置上报，由客户端批量上传，写进 Cassandra，再用 Kafka 分发，书里估算约二十万 QPS，峰值一百万。真正难懂的是另外两条：看地图，靠图像瓦片；算路线，靠路由瓦片。',
  tiles: '先看地图瓦片。PB 级的地图不可能整张下载，所以把世界切成小块。最小缩放级别，一张二百五十六乘二百五十六的瓦片就是整个世界；每放大一级，每张瓦片再切成四张，总数变成原来的四倍。',
  viewport: '屏幕上只需要少数几张。客户端按位置和缩放级别算出瓦片编号，直接去 CDN 取预先生成的静态图。平移地图时，只补新进入屏幕的那一排，其余用本地缓存。编号规则要和服务端保持兼容。',
  graph: '再看导航。路口是节点，道路是边，路线用改进的 Dijkstra 或 A* 搜索。可搜索对图的大小很敏感：从起点一圈圈向外扩散，图越大，要展开的路口越多，所以不能每次都扫描全球路网。',
  rtile: '办法是把路网切成路由瓦片，每块保存相邻瓦片的引用。搜索时按需拼接，只加载起点到终点沿途用得到的几块，其余完全不碰，内存和带宽都省下来。',
  hier: '但长途路线要拼的小瓦片太多，代价很高。于是再分层：同一片路网保存不同细节的瓦片，按距离选层级。远处先在高层走，像先上高速；到了目的地附近，再展开细层的小路。',
  nav: '一次导航请求是这样走的。地理编码服务先把地址变成经纬度，路线规划器算出所在瓦片，让最短路径服务在对象存储里的路由瓦片上跑 A* 的变体。ETA 服务结合路况和机器学习估时间，排序服务再按用户偏好挑出路线。',
  eta: '路况是会变的。系统记下每位导航用户会经过哪些瓦片。某块瓦片发生事故，就反查经过它的用户，只给这些人重新规划，再通过 WebSocket 推送新路线。若只存粗瓦片来省空间，命中只是候选，还要核对具体路径。',
};
const NARR = { three: 21.24, tiles: 20.376, viewport: 20.184, graph: 19.608, rtile: 15.504, hier: 18.168, nav: 23.016, eta: 22.128 };
const T = (id, phrase, off = 0) => { const i = TX[id].indexOf(phrase); if (i < 0) throw new Error('phrase ' + phrase); return 0.7 + NARR[id] * (i / TX[id].length) + off; };

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
  text('系统设计面试 · 动画讲解', 110, 400, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4)); ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 118px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('Google Maps', 104, 540); ctx.restore();
  text('Designing Google Maps', 112, 610, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 18 章', 112, 700, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 场景 1：三条链路 ─────────
function sceneThree(lt, d) {
  header(lt, '01', '三条链路', SC[1], '位置 · 瓦片 · 路由');
  const CW = 330, CY = 230, CH = 560, cx = (k) => 800 + k * 355;
  const tL = T('three', '位置上报，'), tT = T('three', '看地图'), tR = T('three', '算路线'), tHard = T('three', '真正难懂');
  const cols = [SC[3], SC[0], SC[2]], titles = ['位置上报', '地图瓦片', '导航路线'];
  for (let k = 0; k < 3; k++) {
    const a = eOut(P(lt, 0.5 + k * 0.2, 1.3 + k * 0.2));
    const dimv = k === 0 ? 1 - 0.55 * eOut(P(lt, tHard, tHard + 0.8)) : 1;
    ctx.save(); ctx.globalAlpha *= a * dimv; glass(cx(k), CY, CW, CH, { accent: cols[k] });
    text(titles[k], cx(k) + CW / 2, CY + 62, { size: 40, weight: 800, align: 'center', color: cols[k] }); ctx.restore();
  }
  // 卡 1：批量上传 → Cassandra / Kafka
  { const x = cx(0), a = eOut(P(lt, tL - 0.2, tL + 0.6)) * (1 - 0.55 * eOut(P(lt, tHard, tHard + 0.8)));
    if (a > 0) { ctx.save(); ctx.globalAlpha *= a;
      text('批量上传，写入为主', x + CW / 2, CY + 104, { size: 24, color: MUTE, align: 'center' });
      dbIcon(x + 38, CY + 140, 110, 90, 'Cassandra', { color: SC[3] });
      box(x + 190, CY + 150, 110, 78, 'Kafka', { color: SC[1], size: 26 });
      box(x + 38, CY + 370, 254, 80, '客户端', { color: SC[3], sub: '攒一批再传', size: 32 });
      arrow(x + 93, CY + 368, x + 93, CY + 300, { color: SC[3], w: 3 }); arrow(x + 245, CY + 368, x + 245, CY + 244, { color: SC[1], w: 3 });
      for (let i = 0; i < 4; i++) { const u = ((lt - tL) * 0.5 + i / 4) % 1; packet(x + 93, CY + 366, x + 93, CY + 304, u, SC[3], { r: 6, trail: 0.2 }); packet(x + 245, CY + 366, x + 245, CY + 248, u, SC[1], { r: 6, trail: 0.2 }); }
      text('约 20 万 QPS', x + CW / 2, CY + 508, { size: 32, weight: 800, align: 'center', font: MONO, a: eOut(P(lt, T('three', '书里估算'), T('three', '书里估算') + 0.7)) });
      text('峰值 100 万', x + CW / 2, CY + 546, { size: 26, color: MUTE, align: 'center', font: MONO, a: eOut(P(lt, T('three', '峰值'), T('three', '峰值') + 0.7)) });
      ctx.restore(); } }
  // 卡 2：图像瓦片
  { const x = cx(1), a = eOut(P(lt, tT - 0.2, tT + 0.6));
    if (a > 0) { ctx.save(); ctx.globalAlpha *= a;
      text('图像瓦片 · CDN', x + CW / 2, CY + 104, { size: 24, color: MUTE, align: 'center' });
      const gx = x + 41, gy = CY + 150, cs = 62, ph = Math.floor(((lt - tT) * 0.8) % 3);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const on = c >= ph && c < ph + 2 && r >= 1 && r < 3;
        rr(gx + c * cs + 2, gy + r * cs + 2, cs - 4, cs - 4, 8); ctx.fillStyle = on ? SC[0] + '55' : 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.strokeStyle = on ? SC[0] : 'rgba(255,255,255,0.14)'; ctx.lineWidth = on ? 3 : 1.5; ctx.stroke();
      }
      text('只取可视的几张', x + CW / 2, CY + 450, { size: 28, weight: 600, align: 'center' });
      text('每级 ×4', x + CW / 2, CY + 500, { size: 28, weight: 800, align: 'center', font: MONO, color: SC[0] });
      ctx.restore(); } }
  // 卡 3：路由瓦片
  { const x = cx(2), a = eOut(P(lt, tR - 0.2, tR + 0.6));
    if (a > 0) { ctx.save(); ctx.globalAlpha *= a;
      text('路由瓦片 · A*', x + CW / 2, CY + 104, { size: 24, color: MUTE, align: 'center' });
      const gx = x + 41, gy = CY + 150, cs = 62;
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
      for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(gx, gy + i * cs); ctx.lineTo(gx + 4 * cs, gy + i * cs); ctx.moveTo(gx + i * cs, gy); ctx.lineTo(gx + i * cs, gy + 4 * cs); ctx.stroke(); } ctx.setLineDash([]);
      const nodes = [[0, 3], [1, 3], [1, 2], [2, 2], [2, 1], [3, 1], [3, 0], [4, 0]].map(([c, r]) => [gx + c * cs, gy + r * cs]);
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; for (let r = 0; r <= 4; r++) for (let c = 0; c <= 4; c++) ctx.fillRect(gx + c * cs - 3, gy + r * cs - 3, 6, 6);
      const p = eIO(P(lt, tR + 0.6, tR + 2.6)); const k = p * (nodes.length - 1), i = Math.floor(k); const pts = nodes.slice(0, i + 1); if (i < nodes.length - 1) pts.push([lerp(nodes[i][0], nodes[i + 1][0], k - i), lerp(nodes[i][1], nodes[i + 1][1], k - i)]);
      ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = SC[4]; glow(SC[4], 14); lineTo(pts); ctx.stroke(); ctx.shadowBlur = 0;
      dot(nodes[0][0], nodes[0][1], 9, '#fff', { g: 14 }); dot(nodes[7][0], nodes[7][1], 9, SC[2], { g: 14 });
      text('按需加载，分层', x + CW / 2, CY + 450, { size: 28, weight: 600, align: 'center' });
      text('只算沿途', x + CW / 2, CY + 500, { size: 28, weight: 800, align: 'center', color: SC[2] });
      ctx.restore(); } }
  bullet(0, '位置按时间保存', eOut(P(lt, tL, tL + 0.6)));
  bullet(1, '图片切瓦片', eOut(P(lt, tT, tT + 0.6)));
  bullet(2, '道路切子图', eOut(P(lt, tR, tR + 0.6)));
  text('本片只讲后两条', 110, 680, { size: 28, color: SC[1], weight: 700, a: eOut(P(lt, tHard + 0.4, tHard + 1.2)) });
}

// ───────── 场景 2：缩放级别，瓦片 ×4 ─────────
function sceneTiles(lt, d) {
  header(lt, '02', '地图瓦片', SC[0], '缩放一级，瓦片数 ×4');
  const X0 = 860, Y0 = 210, S = 600;
  const tCut = T('tiles', '所以把世界'), tZ0 = T('tiles', '最小缩放'), tZ1 = T('tiles', '每放大一级'), tZ2 = T('tiles', '总数变成'), tZ3 = tZ2 + 1.9;
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
  const pbA = eOut(P(lt, T('tiles', 'PB'), T('tiles', 'PB') + 0.6)) * (1 - eOut(P(lt, tCut + 0.3, tCut + 1)));
  if (pbA > 0) { ctx.save(); ctx.globalAlpha *= pbA; rr(X0 + S / 2 - 150, Y0 + S / 2 - 40, 300, 80, 20); ctx.fillStyle = 'rgba(6,8,15,0.8)'; ctx.fill(); ctx.strokeStyle = RED; ctx.lineWidth = 3; ctx.stroke(); text('PB 级，整张太大', X0 + S / 2, Y0 + S / 2 + 12, { size: 32, weight: 800, align: 'center', color: RED }); ctx.restore(); }
  // 右侧级别列表
  for (let k = 0; k < 4; k++) {
    const tk = [tZ0, tZ1, tZ2, tZ3][k], a = eOut(P(lt, tk, tk + 0.6)), on = k === z, y = 230 + k * 150;
    if (k > 0 && a > 0) { ctx.save(); ctx.globalAlpha *= a; text('×4', 1685, y - 14, { size: 28, weight: 800, font: MONO, color: SC[3], align: 'center' }); ctx.restore(); }
    if (a <= 0) continue;
    ctx.save(); ctx.globalAlpha *= a; glass(1545, y, 290, 100, { accent: on ? SC[0] : null, fill: on ? 0.14 : 0.04 });
    text(`z${k}`, 1575, y + 62, { size: 38, weight: 800, font: MONO, color: on ? SC[0] : MUTE });
    text(`${4 ** k} 张`, 1805, y + 64, { size: 42, weight: 800, font: MONO, align: 'right', color: on ? INK : MUTE }); ctx.restore();
  }
  bullet(0, '最小缩放：1 张 = 整个世界', eOut(P(lt, tZ0, tZ0 + 0.6)));
  bullet(1, '每放大一级，1 张切成 4 张', eOut(P(lt, tZ1, tZ1 + 0.6)));
  statCard(110, 600, 640, '每张瓦片尺寸', '256 × 256', { color: SC[0], a: eOut(P(lt, tZ0 + 0.5, tZ0 + 1.2)) });
  statCard(110, 740, 640, '总数增长', '×4 / 级', { color: SC[3], a: eOut(P(lt, tZ2, tZ2 + 0.7)) });
}

// ───────── 场景 3：只取可视区域，CDN ─────────
function sceneViewport(lt, d) {
  header(lt, '03', '只取可视区域', SC[0], '客户端算编号，CDN 取图');
  const X0 = 840, Y0 = 190, CS = 88;
  const tCDN = T('viewport', '直接去 CDN'), tP1 = T('viewport', '平移地图时'), tP2 = tP1 + 3.8, tCalc = T('viewport', '算出瓦片编号');
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
  text('屏幕可视范围', X0 + vc * CS + 4 * CS, Y0 + vr * CS - 12, { size: 22, weight: 600, align: 'right', a: va * 0.9 });
  text('z3 共 64 张 · 示意', X0, Y0 + 8 * CS + 34, { size: 20, color: DIM, a: ga });
  // CDN
  const ca = eOut(P(lt, tCDN - 0.3, tCDN + 0.4));
  box(1620, 450, 200, 140, 'CDN', { color: SC[4], sub: '静态瓦片图', a: ca, size: 32 });
  // 编号计算
  const ra = eOut(P(lt, tCalc - 0.2, tCalc + 0.6));
  if (ra > 0) {
    const [hx, hy] = [X0 + 4 * CS + CS / 2, Y0 + 3 * CS + CS / 2], pu = (Math.sin(lt * 5) + 1) / 2;
    ctx.save(); ctx.globalAlpha *= ra; ctx.strokeStyle = SC[3]; ctx.lineWidth = 4; rr(X0 + 4 * CS + 1, Y0 + 3 * CS + 1, CS - 2, CS - 2, 10); ctx.stroke(); ctx.restore();
    glass(110, 400, 640, 150, { a: ra, accent: SC[3] });
    text('位置 + 缩放级别', 140, 448, { size: 24, color: MUTE, a: ra });
    text('→ z/x/y = 3/4/3', 140, 516, { size: 42, weight: 800, font: MONO, color: SC[3], a: ra });
  }
  const ph = lt < tP1 ? 0 : lt < tP2 ? 1 : 2, vals = [[12, 0], [3, 9], [4, 8]][ph];
  statCard(110, 585, 640, ph ? '本次平移 · 新取自 CDN' : '首屏 · 取自 CDN', `${vals[0]} 张`, { color: SC[4], a: eOut(P(lt, tCDN + 0.4, tCDN + 1.1)) });
  statCard(110, 715, 640, '本地缓存命中', `${vals[1]} 张`, { color: SC[0], a: eOut(P(lt, tP1, tP1 + 0.7)) });
  text('编号规则：客户端与服务端须长期兼容', 110, 890, { size: 24, color: MUTE, a: eOut(P(lt, T('viewport', '编号规则'), T('viewport', '编号规则') + 0.7)) });
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
  text('起点', nx(s) + 18, ny(s) - 16, { size: 24, weight: 700, a }); text('终点', nx(g) - 18, ny(g) + 38, { size: 24, weight: 700, color: SC[2], align: 'right', a });
}
function pathLine(path, p, color = SC[4]) {
  if (p <= 0) return; const k = p * (path.length - 1), i = Math.floor(k);
  const pts = path.slice(0, i + 1).map((n) => [nx(n), ny(n)]); if (i < path.length - 1) { const a = path[i], b = path[i + 1]; pts.push([lerp(nx(a), nx(b), k - i), lerp(ny(a), ny(b), k - i)]); }
  ctx.save(); ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = color; glow(color, 18); lineTo(pts); ctx.stroke(); ctx.restore();
}

// ───────── 场景 4：路网是图，搜索波前从起点扩散 ─────────
function sceneGraph(lt, d) {
  header(lt, '04', '路网是一张图', SC[1], '搜索波前从起点扩散');
  roads(1, eOut(P(lt, 0.4, 2.2)));
  endpoints(eOut(P(lt, 1.8, 2.6)));
  const tW = T('graph', '从起点一圈圈') - 1.2, tE = T('graph', '所以不能') - 0.4;
  const k = Math.floor(R.dij.order.length * P(lt, tW, tE));
  waves(R.dij.order, k, SC[1]);
  const a = eIO(P(lt, tE + 0.1, tE + 1.5)); pathLine(R.dij.path, a);
  bullet(0, '路口 = 节点', eOut(P(lt, T('graph', '路口是节点'), T('graph', '路口是节点') + 0.6)));
  bullet(1, '道路 = 边', eOut(P(lt, T('graph', '道路是边'), T('graph', '道路是边') + 0.6)));
  bullet(2, '改进的 Dijkstra / A*', eOut(P(lt, T('graph', '路线用'), T('graph', '路线用') + 0.6)));
  const ca = eOut(P(lt, T('graph', '可搜索'), T('graph', '可搜索') + 0.7));
  statCard(110, 640, 640, '已展开的路口', `${k}`, { color: SC[1], a: ca, note: `/ ${COLS * ROWS}` });
  text('示意：48×30 路口的路网', GX, 872, { size: 20, color: DIM, a: eOut(P(lt, 1.2, 2)) });
  text('全球路网：不能整张扫描', 110, 810, { size: 28, weight: 700, color: RED, a: eOut(P(lt, T('graph', '所以不能'), T('graph', '所以不能') + 0.8)) });
}

// ───────── 场景 5：路由瓦片，按需加载 ─────────
const firstT = (() => { const m = {}; R.astar.order.forEach((n, i) => { const t = ((n / COLS / TS) | 0) * 100 + (((n % COLS) / TS) | 0); if (m[t] === undefined) m[t] = i; }); return m; })();
function sceneRtile(lt, d) {
  header(lt, '05', '路由瓦片', SC[3], '按需加载，只拼沿途几块');
  roads(0.55, 1);
  const TW = TS * CELL, tx0 = GX - CELL / 2, ty0 = GY - CELL / 2, TC = COLS / TS, TR = ROWS / TS;
  const tCut = 0.5, tLink = T('rtile', '每块保存'), tRun = T('rtile', '搜索时按需'), tEnd = T('rtile', '其余完全不碰') - 0.6;
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
  bullet(0, '路网切成路由瓦片', eOut(P(lt, 0.7, 1.3)));
  bullet(1, '每块存相邻瓦片的引用', eOut(P(lt, tLink, tLink + 0.6)));
  const ca = eOut(P(lt, tRun + 0.5, tRun + 1.2));
  statCard(110, 560, 640, '加载的瓦片', `${loaded}`, { color: SC[3], a: ca, note: `/ ${TC * TR} 块` });
  statCard(110, 690, 640, '展开的路口', `${Math.min(k, R.astar.order.length)}`, { color: SC[1], a: ca, note: `整图扫描 ${R.dij.order.length}` });
  text('示意：同一张 48×30 路网，A* 变体', GX, 872, { size: 20, color: DIM, a: eOut(P(lt, 1.2, 2)) });
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
  header(lt, '06', '分层路由', SC[2], '长途先走高层，近处再展开');
  const ga = eOut(P(lt, 0.3, 1.0));
  ctx.save(); ctx.globalAlpha *= ga; ctx.strokeStyle = 'rgba(255,255,255,0.09)'; ctx.lineWidth = 1.3; ctx.beginPath();
  for (let i = 0; i <= HC_; i++) { ctx.moveTo(HX + i * HCS, HY); ctx.lineTo(HX + i * HCS, HY + HR_ * HCS); }
  for (let i = 0; i <= HR_; i++) { ctx.moveTo(HX, HY + i * HCS); ctx.lineTo(HX + HC_ * HCS, HY + i * HCS); }
  ctx.stroke(); ctx.restore();
  const tF0 = T('hier', '但长途') + 0.8, tF1 = T('hier', '代价很高') + 0.6, tH = T('hier', '于是再分层'), tFar = T('hier', '远处先'), tNear = T('hier', '到了目的地');
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
  text('起点', HX + (HS[0] + 0.5) * HCS + 16, HY + (HS[1] + 0.5) * HCS + 40, { size: 22, weight: 700 }); text('终点', HX + (HD[0] + 0.5) * HCS - 16, HY + (HD[1] + 0.5) * HCS - 22, { size: 22, weight: 700, color: SC[2], align: 'right' }); ctx.restore();
  // 图例
  const lg = eOut(P(lt, tH, tH + 0.8)); let lx = HX;
  [[1, '细层'], [2, '中层'], [4, '高层'], [8, '顶层']].forEach(([s, nm]) => { ctx.save(); ctx.globalAlpha *= lg; ctx.fillStyle = HLC[s]; rr(lx, 166, 20, 20, 5); ctx.fill(); text(nm, lx + 28, 184, { size: 22, weight: 600, color: INK }); ctx.restore(); lx += 130; });
  const fineN = Math.min(kF, nF), hierN = hblocks.length;
  statCard(110, 470, 640, '只用细层：要拼的瓦片', `${fineN} 块`, { color: SC[3], a: eOut(P(lt, tF0, tF0 + 0.7)) });
  statCard(110, 600, 640, '分层：高层带过长途', `${nB} 块`, { color: SC[0], a: eOut(P(lt, tFar, tFar + 0.7)) });
  bullet(0, '同一片路网，多个细节层级', eOut(P(lt, T('hier', '同一片路网'), T('hier', '同一片路网') + 0.6)), { y0: 770 });
  bullet(1, '按距离选层级：先上高速', eOut(P(lt, tFar, tFar + 0.6)), { y0: 770, step: 56 });
  text('示意：瓦片大小与数量', HX + HC_ * HCS, 878, { size: 20, color: DIM, align: 'right', a: ga });
}

// ───────── 场景 7：导航服务流水线 ─────────
function sceneNav(lt, d) {
  header(lt, '07', '导航服务', SC[2], '一次请求怎么走');
  const tCli = 0.8, tGeo = T('nav', '地理编码'), tPlan = T('nav', '路线规划器'), tSP = T('nav', '最短路径服务'), tEta = T('nav', 'ETA'), tRank = T('nav', '排序服务');
  const bx = (t, dl = 0.6) => eBack(P(lt, t, t + dl));
  const U = {
    cli: [810, 470, 150, 100], geo: [1060, 230, 260, 100], plan: [1060, 470, 260, 100], eta: [1060, 710, 260, 100],
    sp: [1490, 470, 330, 100], rk: [1490, 710, 330, 100], s3: [1560, 250, 190, 110],
  };
  const sc = (t) => clamp(bx(t)), al = (t) => eOut(P(lt, t, t + 0.4));
  box(...U.cli.slice(0, 4), '客户端', { color: SC[0], sub: 'A → B', a: al(tCli), s: sc(tCli), size: 32 });
  box(...U.geo, '地理编码', { color: SC[3], sub: '地址 → 经纬度', a: al(tGeo), s: sc(tGeo), size: 32 });
  box(...U.plan, '路线规划器', { color: SC[1], sub: '坐标 → 瓦片', a: al(1.6), s: sc(1.6), size: 32 });
  box(...U.sp, '最短路径服务', { color: SC[2], sub: 'A* 变体', a: al(tSP), s: sc(tSP), size: 32 });
  dbIcon(U.s3[0], U.s3[1], U.s3[2], U.s3[3], '', { color: SC[3], a: al(tSP + 0.4) });
  text('对象存储 · 路由瓦片', 1655, 232, { size: 24, weight: 600, align: 'center', a: al(tSP + 0.4) });
  box(...U.eta, 'ETA 服务', { color: SC[4], sub: '路况 + 机器学习', a: al(tEta), s: sc(tEta), size: 32 });
  box(...U.rk, '排序服务', { color: SC[0], sub: '按用户条件排序', a: al(tRank), s: sc(tRank), size: 32 });
  const hop = (x1, y1, x2, y2, t, color) => { arrow(x1, y1, x2, y2, { color, p: eOut(P(lt, t, t + 0.5)), a: 0.9, w: 4 }); const q = P(lt, t + 0.4, t + 1.6); packet(x1, y1, x2, y2, q, color, { r: 8 }); };
  hop(960, 520, 1060, 520, 1.9, SC[0]);
  { const q = P(lt, tPlan, tPlan + 0.9); if (q > 0 && q < 1) { ctx.save(); ctx.strokeStyle = SC[1]; ctx.globalAlpha = 1 - q; ctx.lineWidth = 4; rr(1060 - q * 24, 470 - q * 24, 260 + q * 48, 100 + q * 48, 22 + q * 10); ctx.stroke(); ctx.restore(); } }
  hop(1190, 470, 1190, 332, tGeo + 0.3, SC[3]);
  hop(1320, 520, 1490, 520, tSP + 0.1, SC[2]);
  hop(1655, 470, 1655, 368, tSP + 0.9, SC[3]);
  hop(1190, 570, 1190, 710, tEta + 0.1, SC[4]);
  hop(1300, 570, 1490, 740, tRank + 0.1, SC[0]);
  bullet(0, '地址 → 经纬度 → 瓦片', eOut(P(lt, tGeo, tGeo + 0.6)));
  bullet(1, '路由瓦片放在对象存储', eOut(P(lt, tSP, tSP + 0.6)));
  bullet(2, 'ETA 与排序各管一段', eOut(P(lt, tEta, tEta + 0.6)));
  text('另有更新服务，异步刷新重要数据库', 110, 640, { size: 24, color: MUTE, a: eOut(P(lt, tRank + 1.2, tRank + 2)) });
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
  header(lt, '08', '动态 ETA', RED, '路况变了，只通知受影响的人');
  const tRec = T('eta', '系统记下'), tAcc = T('eta', '某块瓦片'), tFind = T('eta', '就反查'), tRe = T('eta', '只给这些人'), tWs = T('eta', '再通过'), tCoarse = T('eta', '若只存粗');
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
  if (accA > 0.02) { const [ax, ay] = tc(9); const pul = P(lt, tAcc + 0.2, tAcc + 1.4); if (pul < 1) { ctx.save(); ctx.strokeStyle = RED; ctx.globalAlpha = 1 - pul; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ax, ay - 4, 20 + pul * 70, 0, 7); ctx.stroke(); ctx.restore(); } dot(ax, ay - 4, 16 * clamp(accA), RED, { g: 26 }); text('事故', ax, ay + 40, { size: 24, weight: 800, color: RED, align: 'center', a: clamp(accA) }); }
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
  text('用户 → 将经过的瓦片', EX + 28, 680, { size: 22, color: MUTE, a: ta });
  [['user_1', '1  2  3  …  k', null, SC[0]], ['user_2', '4  6  9  …  n', 9, SC[1]], ['user_3', '2  8  9  …  m', 9, SC[3]]].forEach(([n, s, hit, c], i) => {
    const y = 730 + i * 50, hl = hit ? hitFind : 0;
    ctx.save(); ctx.globalAlpha *= ta; if (hl > 0) { rr(EX + 14, y - 32, 982, 46, 12); ctx.fillStyle = `rgba(255,93,115,${0.16 * hl})`; ctx.fill(); }
    text(n, EX + 30, y, { size: 26, weight: 700, font: MONO, color: c }); text(': r_' + s.split('  ').join(', r_').replace(', r_…, r_', ', …, r_'), EX + 150, y, { size: 26, font: MONO, color: INK, weight: 600 });
    if (hl > 0) text('经过 r_9 → 重新规划', EX + 990, y, { size: 24, weight: 800, color: RED, align: 'right', a: hl }); ctx.restore();
  });
  // 粗瓦片
  const ca = eOut(P(lt, tCoarse, tCoarse + 0.8));
  if (ca > 0) {
    const x = EX + 1 * EC, y = EY + 1 * ER; ctx.save(); ctx.globalAlpha *= ca; ctx.strokeStyle = SC[2]; ctx.lineWidth = 4; ctx.setLineDash([14, 10]); glow(SC[2], 10); rr(x - 2, y - 2, 2 * EC + 4, 2 * ER + 4, 20); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
    text('粗瓦片 super(r)', x + EC, y + 2 * ER + 28, { size: 24, weight: 700, color: SC[2], align: 'center' }); ctx.restore();
  }
  // WebSocket 推送
  const wa = eOut(P(lt, tWs, tWs + 0.8));
  if (wa > 0) {
    box(1530, 200, 300, 110, '推送新路线', { color: SC[4], sub: 'WebSocket', a: wa, size: 32 });
    [['user_2', SC[1]], ['user_3', SC[3]]].forEach(([n, c], i) => { const y = 370 + i * 100; ctx.save(); ctx.globalAlpha *= wa; glass(1560, y, 240, 78, { accent: c, r: 18 }); text(n, 1590, y + 48, { size: 26, weight: 700, font: MONO, color: c }); text('新', 1778, y + 48, { size: 24, weight: 800, color: SC[4], align: 'right' }); ctx.restore(); packet(1680, 310, 1680, y, P(lt, tWs + 0.6 + i * 0.3, tWs + 1.4 + i * 0.3), SC[4], { r: 7 }); });
  }
  bullet(0, '记录每人将经过的瓦片', eOut(P(lt, tRec + 0.2, tRec + 0.8)));
  bullet(1, '事故瓦片 → 反查用户', eOut(P(lt, tFind, tFind + 0.6)));
  bullet(2, '只重新规划受影响的人', eOut(P(lt, tRe, tRe + 0.6)));
  bullet(3, 'WebSocket 推送新路线', eOut(P(lt, tWs, tWs + 0.6)));
  bullet(4, '粗瓦片命中 ≠ 一定受影响', eOut(P(lt, tCoarse, tCoarse + 0.6)), { color: SC[2] });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  const gx = 1480, gy = 120, cs = 44;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 8; c++) { ctx.save(); ctx.globalAlpha *= 0.5 * eOut(P(lt, 0.2 + (r + c) * 0.04, 0.8 + (r + c) * 0.04)); rr(gx + c * cs + 3, gy + r * cs + 3, cs - 6, cs - 6, 7); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.globalAlpha *= 0.8; ctx.strokeStyle = SC[4]; ctx.lineWidth = 6; ctx.lineJoin = 'round'; glow(SC[4], 14); lineTo([[0, 4], [2, 4], [2, 2], [5, 2], [5, 0], [7, 0]].map(([c, r]) => [gx + c * cs + cs / 2, gy + r * cs + cs / 2])); ctx.stroke(); ctx.restore();
  text('Google Maps', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Tiles · Hierarchy · Re-routing', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['瓦片', '每级 ×4，只取可视区', SC[0]], ['分层', '路网切块，长途走高层', SC[3]], ['实时重规划', '事故反查，只通知受影响者', SC[2]]].forEach(([w, s, c], k) => {
    const t0 = 1.0 + k * 1.3, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560; glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: k === 2 ? 56 : 70, weight: 800 }); text(s, x + 36, 620, { size: 26, color: MUTE }); ctx.restore();
  });
  text('图像瓦片用来看，路由瓦片用来算', 110, 750, { size: 30, weight: 700, a: eOut(P(lt, 5.4, 6.2)) });
  text('示意动画：网格与数量为说明机制而设', 110, 880, { size: 20, color: DIM, a: eOut(P(lt, 6.2, 7)) });
}

export const scenes = { title: sceneTitle, three: sceneThree, tiles: sceneTiles, viewport: sceneViewport, graph: sceneGraph, rtile: sceneRtile, hier: sceneHier, nav: sceneNav, eta: sceneEta, end: sceneEnd };
