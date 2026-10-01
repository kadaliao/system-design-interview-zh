// 第 11 章 新闻流系统：推（写扩散）与拉（读扩散）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 11, title: '新闻流系统', en: 'News Feed System' };

// 角色配色（全片统一）
const C_PUSH = SC[2];   // 写扩散 / 扩散服务 / 队列：粉
const C_PULL = SC[0];   // 读扩散 / 帖子库(数据库)：青
const C_MIX = SC[4];    // 混合方案：青柠
const C_CACHE = SC[3];  // 缓存：琥珀
const C_SVC = SC[1];    // 普通服务 / 用户端：靛
const C_NOTI = SC[4];

const a_ = (lt, t0, d = 0.6) => eOut(P(lt, t0, t0 + d));
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function idChip(x, y, label, color, { a = 1, w = 64, s = 1, ring = null, dim = false } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x + w / 2, y + 17); ctx.scale(s, s);
  if (ring) glow(ring, 20); rr(-w / 2, -17, w, 34, 10); ctx.fillStyle = color + (dim ? '18' : '30'); ctx.fill();
  ctx.lineWidth = ring ? 3 : 1.8; ctx.strokeStyle = ring || color; ctx.stroke(); ctx.shadowBlur = 0;
  text(label, 0, 7, { size: 20, weight: 700, align: 'center', font: MONO, color: dim ? MUTE : INK });
  ctx.restore();
}
function pulse(x, y, p, color, r0 = 30, r1 = 90) {
  if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, eOut(p)), 0, 7); ctx.stroke(); ctx.restore();
}
function cross(x, y, s = 14, color = RED, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round'; glow(color, 12);
  ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); ctx.restore();
}
function check(x, y, s = 14, color = C_MIX, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; glow(color, 12);
  ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.3, y + s * 0.7); ctx.lineTo(x + s, y - s * 0.7); ctx.stroke(); ctx.restore();
}
const faint = (x1, y1, x2, y2, a = 1) => arrow(x1, y1, x2, y2, { color: 'rgba(255,255,255,0.22)', w: 3, a, dash: [8, 8], head: 11 });
const lerp2 = (A, B, p) => [lerp(A[0], B[0], p), lerp(A[1], B[1], p)];

// ───────── 场景 1：总览 ─────────
function sceneOverview(lt) {
  header(lt, '01', '两条主流程', C_SVC, '发布与构建');
  bullet(0, '发布：帖子入库，传给好友', a_(lt, 2.6), { color: INK });
  bullet(1, '构建：聚合好友帖子，倒序返回', a_(lt, 7.8));
  statCard(110, 620, 300, '好友上限', '5000', { color: C_SVC, a: a_(lt, 14.5), note: '人' });
  statCard(440, 620, 300, '日活', '1000 万', { color: C_PULL, a: a_(lt, 17.3) });
  // 泳道 1：发布
  const l1 = a_(lt, 2.6);
  text('① 发布  Feed Publishing', 830, 222, { size: 28, weight: 700, color: C_PUSH, a: l1 });
  text('POST /v1/me/feed', 1840, 222, { size: 22, color: MUTE, font: MONO, align: 'right', a: l1 });
  box(830, 250, 200, 100, '用户', { color: C_SVC, a: l1, sub: 'content' });
  dbIcon(1190, 240, 110, 120, '帖子库', { color: C_PULL, a: a_(lt, 3.7), fill: 0.5 });
  box(1540, 250, 260, 100, '好友 feed 缓存', { color: C_CACHE, a: a_(lt, 5.4), size: 26 });
  arrow(1030, 300, 1190, 300, { color: C_SVC, p: eOut(P(lt, 3.2, 3.9)) });
  arrow(1300, 300, 1540, 300, { color: C_PUSH, p: eOut(P(lt, 5.0, 5.8)) });
  packet(1030, 300, 1190, 300, P(lt, 3.4, 4.2), C_SVC);
  packet(1300, 300, 1540, 300, P(lt, 5.6, 6.6), C_PUSH);
  // 泳道 2：构建
  const l2 = a_(lt, 7.8);
  text('② 构建  News Feed Building', 830, 562, { size: 28, weight: 700, color: C_CACHE, a: l2 });
  text('GET /v1/me/feed', 1840, 562, { size: 22, color: MUTE, font: MONO, align: 'right', a: l2 });
  box(830, 590, 260, 100, 'feed 缓存', { color: C_CACHE, a: a_(lt, 10.4), sub: '帖子 ID' });
  dbIcon(1250, 580, 110, 120, '帖子内容', { color: C_PULL, a: a_(lt, 11.4), fill: 0.5 });
  box(1590, 590, 210, 100, '用户', { color: C_SVC, a: l2, sub: '倒序列表' });
  arrow(1090, 640, 1250, 640, { color: C_CACHE, p: eOut(P(lt, 11.0, 11.8)) });
  arrow(1360, 640, 1590, 640, { color: C_PULL, p: eOut(P(lt, 12.0, 12.8)) });
  packet(1090, 640, 1250, 640, P(lt, 11.2, 12.0), C_CACHE);
  packet(1360, 640, 1590, 640, P(lt, 12.6, 13.6), C_PULL);
  text('时间倒序（reverse chronological）', 830, 760, { size: 24, color: MUTE, a: a_(lt, 12.8) });
}

// ───────── 场景 2：发布流程 ─────────
function scenePublish(lt) {
  header(lt, '02', '发布流程', C_SVC, '一条帖子的旅程');
  bullet(0, 'Web：认证 + 限流', a_(lt, 5.7));
  bullet(1, '帖子服务：写库 + 写缓存', a_(lt, 7.8));
  bullet(2, '扩散服务：推到好友缓存', a_(lt, 11.5));
  bullet(3, '通知服务：提醒好友', a_(lt, 15.6));
  // 行 1
  const N = {
    user: [830, 220, 200, 100], lb: [1110, 220, 200, 100], web: [1390, 220, 230, 100],
    post: [1390, 450, 230, 100], db: [1110, 440, 110, 120], cache: [830, 450, 200, 100],
    fan: [1390, 690, 230, 100], fc: [1070, 690, 240, 100], noti: [800, 690, 230, 100],
  };
  const cx = (n) => n[0] + n[2] / 2, cy = (n) => n[1] + n[3] / 2;
  const t = (a, b, s) => P(lt, a, a + (b || 0.8));
  box(...N.user, '用户', { color: C_SVC, a: a_(lt, 0.8), s: eBack(P(lt, 0.8, 1.4)) });
  box(...N.lb, '负载均衡', { color: C_SVC, a: a_(lt, 1.7), size: 26 });
  box(...N.web, 'Web 服务器', { color: C_SVC, a: a_(lt, 2.4), size: 26, sub: '认证 · 限流' });
  box(...N.post, '帖子服务', { color: C_SVC, a: a_(lt, 7.8), size: 26 });
  dbIcon(N.db[0], N.db[1], N.db[2], N.db[3], '数据库', { color: C_PULL, a: a_(lt, 9.0) });
  box(...N.cache, '内容缓存', { color: C_CACHE, a: a_(lt, 9.4), size: 26 });
  box(...N.fan, '扩散服务', { color: C_PUSH, a: a_(lt, 11.5), size: 26, sub: 'Fanout' });
  box(...N.fc, '好友 feed 缓存', { color: C_CACHE, a: a_(lt, 13.0), size: 26 });
  box(...N.noti, '通知服务', { color: C_NOTI, a: a_(lt, 15.6), size: 26 });
  // 连线
  arrow(1030, 270, 1110, 270, { color: C_SVC, p: eOut(P(lt, 1.5, 2.0)), head: 11 });
  arrow(1310, 270, 1390, 270, { color: C_SVC, p: eOut(P(lt, 2.2, 2.7)), head: 11 });
  arrow(1505, 320, 1505, 450, { color: C_SVC, p: eOut(P(lt, 7.6, 8.4)) });
  arrow(1390, 500, 1220, 500, { color: C_PULL, p: eOut(P(lt, 9.0, 9.6)), head: 12 });
  arrow(1110, 500, 1030, 500, { color: C_CACHE, p: eOut(P(lt, 9.6, 10.2)), head: 11 });
  arrow(1505, 550, 1505, 690, { color: C_PUSH, p: eOut(P(lt, 11.3, 12.0)) });
  arrow(1390, 740, 1310, 740, { color: C_PUSH, p: eOut(P(lt, 12.8, 13.4)), head: 11 });
  arrow(1070, 740, 1030, 740, { color: C_NOTI, p: eOut(P(lt, 15.4, 15.9)), head: 11 });
  // 数据包（时间对齐旁白）
  packet(830 + 200, 270, 1110, 270, P(lt, 1.7, 2.3), C_SVC);
  packet(1310, 270, 1390, 270, P(lt, 2.7, 3.3), C_SVC);
  packet(1505, 320, 1505, 450, P(lt, 8.2, 9.0), C_SVC);
  packet(1390, 500, 1220, 500, P(lt, 9.2, 9.9), C_PULL);
  packet(1110, 500, 1030, 500, P(lt, 9.8, 10.4), C_CACHE);
  packet(1505, 550, 1505, 690, P(lt, 11.8, 12.6), C_PUSH);
  packet(1390, 740, 1310, 740, P(lt, 13.2, 14.4), C_PUSH, { r: 11 });
  packet(1070, 740, 1030, 740, P(lt, 15.8, 16.6), C_NOTI);
  // 限流提示
  pulse(cx(N.web), cy(N.web), P(lt, 5.8, 6.8), C_SVC, 60, 130);
  // 步骤序号
  [[N.user, 1], [N.lb, 2], [N.web, 3], [N.post, 4], [N.fan, 5], [N.noti, 6]].forEach(([n, k]) => {
    const st = [0.8, 1.7, 2.4, 7.8, 11.5, 15.6][k - 1];
    const a = a_(lt, st + 0.2);
    dot(n[0] + 6, n[1] + 6, 17, '#0a0d18', { g: 0, a }); text(String(k), n[0] + 6, n[1] + 13, { size: 20, weight: 800, font: MONO, align: 'center', color: INK, a });
  });
  text('帖子 ID 的传播，而不是正文的复制', 830, 862, { size: 24, color: MUTE, a: a_(lt, 16.8) });
}

// ───────── 场景 3：写扩散机制 ─────────
const FR = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'];
const KEEP = ['u1', 'u2', 'u4', 'u6'];
function sceneFanout(lt) {
  header(lt, '03', '写扩散', C_PUSH, 'Fanout on Write');
  bullet(0, '① 取好友 ID（图数据库）', a_(lt, 2.6), { size: 28 });
  bullet(1, '② 按设置过滤：静音、屏蔽', a_(lt, 5.1), { size: 28 });
  bullet(2, '③ 好友列表 + post_id 进队列', a_(lt, 8.5), { size: 28 });
  bullet(3, '④ Worker 写好友 feed 缓存', a_(lt, 11.9), { size: 28 });
  bullet(4, '⑤ 只留最近 N 条，长度可配', a_(lt, 18.6), { size: 28 });
  const b = a_(lt, 20.5);
  if (b > 0) badge(110, 780, '发帖时就推给读者', C_PUSH, b);
  // 行 1：图数据库 → 过滤 → 队列
  dbIcon(830, 190, 100, 110, '图数据库', { color: C_PULL, a: a_(lt, 1.0) });
  box(1190, 215, 220, 90, '按设置过滤', { color: C_SVC, a: a_(lt, 4.2), size: 24 });
  box(1560, 215, 240, 90, '消息队列', { color: C_PUSH, a: a_(lt, 7.6), size: 26 });
  arrow(930, 260, 1190, 260, { color: C_PULL, p: eOut(P(lt, 2.4, 3.2)), head: 11 });
  arrow(1410, 260, 1560, 260, { color: C_PUSH, p: eOut(P(lt, 7.4, 8.2)), head: 11 });
  // 好友 chips：先从图数据库出来，过滤后一部分被剔除
  FR.forEach((u, i) => {
    const out = a_(lt, 2.8 + i * 0.12, 0.4);
    const kept = KEEP.includes(u);
    const ki = KEEP.indexOf(u);
    const x0 = 830 + i * 76, y0 = 372;
    const drop = !kept ? eOut(P(lt, 6.6, 7.4)) : 0;
    let x = x0, y = y0;
    // 通过过滤后向右下聚拢
    if (kept) { const m = eIO(P(lt, 6.2, 7.0)); x = lerp(x0, 830 + ki * 76, m); }
    // 进队列：飞向队列
    const q = eIO(P(lt, 8.9 + ki * 0.1, 9.9 + ki * 0.1));
    if (kept && q > 0) { x = lerp(x, 1580 + ki * 52, q); y = lerp(y, 310, q); }
    const ring = !kept && lt > 5.3 && lt < 7.4 ? RED : null;
    const col = !kept && lt > 5.6 ? DIM : C_SVC;
    const aa = (kept ? (q > 0.98 ? 0 : 1) : 1 - drop) * out;
    idChip(x, y - 17 + 17 - (0), u, col, { a: aa, w: 58, ring });
    if (!kept && lt > 5.6) cross(x0 + 29, y0 + 17, 11, RED, out * (1 - drop));
    if (!kept && lt > 5.6 && drop < 1) text(u === 'u3' ? '静音' : '屏蔽', x0 + 29, y0 + 62, { size: 20, color: RED, align: 'center', weight: 700, a: out * (1 - drop) });
  });
  // 队列里的消息
  const qm = a_(lt, 10.0, 0.5);
  if (qm > 0) {
    glass(1530, 318, 300, 70, { a: qm, accent: C_PUSH, r: 14 });
    text('post 88 → [u1 u2 u4 u6]', 1680, 360, { size: 20, font: MONO, weight: 700, align: 'center', a: qm });
  }
  // 行 2：workers
  const WK = [[1170, 0], [1380, 1], [1590, 2]];
  WK.forEach(([x, k]) => box(x, 450, 190, 80, `worker ${k + 1}`, { color: C_PUSH, a: a_(lt, 11.6 + k * 0.25), size: 22 }));
  [1265, 1475, 1685].forEach((x, k) => {
    arrow(1680, 388, x, 450, { color: C_PUSH, p: eOut(P(lt, 11.7 + k * 0.15, 12.5 + k * 0.15)), head: 9, w: 3, a: 0.7 });
  });
  // 行 3：4 个好友 feed 缓存
  const cxs = [830, 1040, 1250, 1460], cyTop = 650;
  const old = ['81', '77', '64', '52'];
  KEEP.forEach((u, i) => {
    const x = cxs[i], a = a_(lt, 13.0 + i * 0.12);
    glass(x, cyTop, 180, 250, { a, accent: C_CACHE, r: 18 });
    text(`${u} 的 feed 缓存`, x + 90, cyTop + 34, { size: 20, weight: 700, color: C_CACHE, align: 'center', a });
    const ins = eIO(P(lt, 15.0 + i * 0.12, 15.8 + i * 0.12));
    old.forEach((id, k) => {
      let aa = a;
      if (k === 3) aa = a * (1 - eOut(P(lt, 18.8, 19.8)));
      idChip(x + 58, cyTop + 56 + (k + ins) * 38, id, '#9aa6d6', { a: aa, w: 64, dim: true });
    });
    // 新条目 88 飞入
    const fly = eIO(P(lt, 14.0 + i * 0.12, 15.0 + i * 0.12));
    if (fly > 0) {
      const wx = [1265, 1265, 1475, 1685][i];
      const [fx, fy] = lerp2([wx - 32, 520], [x + 58 + 32 - 32, cyTop + 56], fly);
      idChip(fx, fy, '88', '#ffffff', { a: 1, w: 64, ring: C_PUSH });
    }
    pulse(x + 90, cyTop + 125, P(lt, 15.0 + i * 0.12, 16.0 + i * 0.12), C_PUSH, 40, 100);
  });
  [[0, 0], [1, 0], [2, 1], [3, 2]].forEach(([i, w]) => {
    const wx = [1265, 1475, 1685][w], x = cxs[i];
    const p = P(lt, 13.8 + i * 0.12, 14.9 + i * 0.12);
    arrow(wx, 530, x + 90, cyTop, { color: C_PUSH, w: 3, a: 0.55 * a_(lt, 13.6), p: eOut(P(lt, 13.4, 14.2)), head: 9, dash: [6, 8] });
    void p;
  });
  const an = a_(lt, 17.1);
  if (an > 0) {
    text('只存 <post_id, user_id>，不复制帖子', 830, 628, { size: 22, color: MUTE, font: MONO, a: an });
  }
}

// ───────── 场景 4：写放大 ─────────
const GC = 32, GR = 14, GP = 24, GX = 1040, GY = 230;
function sceneAmp(lt) {
  header(lt, '04', '写放大', RED, '读得快的代价');
  bullet(0, '读得快，更新及时', a_(lt, 0.7));
  bullet(1, '代价：好友多，写得多', a_(lt, 3.4));
  const sc1 = a_(lt, 5.5);
  statCard(110, 590, 640, '普通用户 · 几百粉丝（示意）', '≈ 300 次写入', { color: C_MIX, a: sc1 * (1 - 0.35 * P(lt, 9.9, 10.5)), h: 112 });
  // 名人计数
  const N0 = 1000000;
  const wave0 = 12.9, waveD = 3.3;
  const frac = (() => {
    let n = 0; const total = GC * GR;
    for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) if (lt >= cellT(c, r, wave0, waveD)) n++;
    return n / total;
  })();
  const sc2 = a_(lt, 9.9);
  statCard(110, 730, 640, '名人 · 100 万读者', fmt(N0 * frac) + ' 次', { color: RED, a: sc2, h: 112 });
  // 作者
  const normal = P(lt, 5.5, 5.9) * (1 - eOut(P(lt, 9.4, 9.9)));
  const celeb = a_(lt, 9.9);
  box(820, 330, 190, 100, '普通用户', { color: C_MIX, a: normal, size: 24 });
  box(820, 330, 190, 100, '名人', { color: '#ffffff', a: celeb, size: 28 });
  // 网格：每一格是一批读者的 feed 缓存
  const ga = a_(lt, 4.4, 1.0);
  for (let r = 0; r < GR; r++) for (let c = 0; c < GC; c++) {
    const x = GX + c * GP, y = GY + r * GP;
    ctx.save(); ctx.globalAlpha *= ga;
    rr(x, y, GP - 6, GP - 6, 5);
    const lit = lt >= cellT(c, r, wave0, waveD);
    const age = lit ? P(lt, cellT(c, r, wave0, waveD), cellT(c, r, wave0, waveD) + 0.5) : 0;
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
    if (lit) { ctx.fillStyle = C_PUSH; ctx.globalAlpha *= 0.35 + 0.65 * age; ctx.fill(); }
    ctx.restore();
  }
  // 普通用户只亮一格
  const nl = P(lt, 6.6, 7.2) * (1 - eOut(P(lt, 9.6, 10.2)));
  if (nl > 0) { ctx.save(); ctx.globalAlpha *= nl; glow(C_MIX, 16); rr(GX, GY + 6 * GP, GP - 6, GP - 6, 5); ctx.fillStyle = C_MIX; ctx.fill(); ctx.restore(); if (nl > 0.3) packet(1010, 380, GX + 9, GY + 6 * GP + 9, P(lt, 6.0, 6.8), C_MIX); }
  text('示意：每格 ≈ 两千位读者的 feed 缓存', GX, GY + GR * GP + 22, { size: 22, color: DIM, a: ga });
  // 共享正文 vs 每人一份目录
  const ex = a_(lt, 14.2);
  if (ex > 0) {
    glass(830, 690, 450, 150, { a: ex, accent: C_PULL });
    text('帖子正文', 860, 736, { size: 24, color: MUTE, a: ex });
    text('× 1 份，共享', 860, 790, { size: 38, weight: 800, color: C_PULL, a: ex });
    glass(1340, 690, 470, 150, { a: ex, accent: C_PUSH });
    text('待读帖子 ID 目录', 1370, 736, { size: 24, color: MUTE, a: ex });
    text(`× ${fmt(N0)} 份`, 1370, 790, { size: 38, weight: 800, color: RED, font: MONO, a: ex });
    arrow(1280, 765, 1340, 765, { color: MUTE, a: ex, head: 10 });
  }
  const wa = a_(lt, 16.5);
  if (wa > 0) { const bw = badge(830, 868, '写放大 Write Amplification', RED, wa); }
}
function cellT(c, r, t0, d) {
  const dx = c, dy = Math.abs(r - 6.5) * 0.9; const dist = Math.hypot(dx, dy) / Math.hypot(GC, 6.5 * 0.9);
  return t0 + dist * d + rnd(c * 31 + r) * 0.25;
}

// ───────── 场景 5：读扩散 ─────────
const FRIEND_POSTS = ['p81', 'p88', 'p64', 'p77', 'p52'];
function scenePull(lt) {
  header(lt, '05', '读扩散', C_PULL, 'Fanout on Read');
  bullet(0, '发帖：只存一份，不推送', a_(lt, 2.0));
  bullet(1, '打开：逐个好友去取', a_(lt, 7.5));
  bullet(2, '合并排序后返回', a_(lt, 11.1));
  bullet(3, '不活跃用户不用提前算', a_(lt, 12.4));
  const fx = 830, fw = 300, fh = 92, fy = (i) => 200 + i * 128;
  const R = [1560, 440, 250, 140];
  const rcx = R[0], rcy = R[1] + R[3] / 2;
  // 好友：各自帖子库
  FRIEND_POSTS.forEach((p, i) => {
    const a = a_(lt, 0.5 + i * 0.12);
    box(fx, fy(i), fw, fh, `好友 ${i + 1}`, { color: C_PULL, a, size: 26 });
    const isNew = i === 1;
    const ca = isNew ? eBack(P(lt, 3.0, 3.8)) : 1;
    const pa = isNew ? clamp(ca) : a;
    idChip(fx + fw - 86, fy(i) + 28, p, isNew ? '#ffffff' : '#9aa6d6', { a: pa, w: 66, s: isNew ? clamp(ca, 0, 1.2) : 1, ring: isNew && lt < 5.5 ? C_PULL : null });
  });
  if (a_(lt, 3.8) > 0) text('只存在自己这里，不推', fx + fw + 24, fy(1) + 52, { size: 22, color: MUTE, a: a_(lt, 3.8) * (1 - P(lt, 6.2, 7.0)) });
  // 读者
  const ra = a_(lt, 5.6);
  box(...R, '读者', { color: C_SVC, a: ra, sub: '打开 feed' });
  pulse(rcx + R[2] / 2, rcy, P(lt, 5.8, 6.8), C_SVC, 60, 140);
  // 请求包：逐个好友
  let reads = 0;
  FRIEND_POSTS.forEach((p, i) => {
    const t0 = 7.6 + i * 0.7;
    const sx = rcx, sy = rcy, tx = fx + fw, ty = fy(i) + fh / 2;
    const go = P(lt, t0, t0 + 0.35), back = P(lt, t0 + 0.35, t0 + 0.7);
    faint(sx, sy, tx, ty, a_(lt, 7.3) * 0.6);
    if (go > 0 && go < 1) packet(sx, sy, tx, ty, go, C_SVC, { r: 8 });
    if (back > 0 && back < 1) packet(tx, ty, sx, sy, back, C_PULL, { r: 9 });
    if (lt >= t0) reads++;
    if (lt >= t0 && lt < t0 + 0.7) pulse(fx + fw / 2, fy(i) + fh / 2, P(lt, t0, t0 + 0.7), C_PULL, 50, 100);
  });
  // 读取计数
  const cA = a_(lt, 7.5);
  if (cA > 0) {
    text('读取次数', rcx + 125, 650, { size: 22, color: MUTE, align: 'center', a: cA });
    text(String(reads), rcx + 125, 710, { size: 56, weight: 800, font: MONO, color: C_PULL, align: 'center', a: cA });
  }
  // 合并后的列表（倒序）
  const sorted = ['p88', 'p81', 'p77', 'p64', 'p52'];
  sorted.forEach((p, k) => {
    const m = eOut(P(lt, 11.1 + k * 0.18, 11.7 + k * 0.18));
    idChip(1590, 202 + k * 44, p, C_PULL, { a: m * 0.0 + (m > 0 ? 1 : 0), w: 66, s: 0.5 + 0.5 * m });
  });
  if (a_(lt, 11.1) > 0) text('合并后倒序', 1580, 190, { size: 22, color: MUTE, a: a_(lt, 11.1) });
  const sa = a_(lt, 16.4);
  statCard(110, 690, 640, '每次打开的读取次数', '≈ 好友数', { color: RED, a: sa, note: '最多 5000' });
  // 延迟条（示意）
  const la = a_(lt, 16.4);
  if (la > 0) {
    text('打开延迟（示意）', 830, 860, { size: 22, color: MUTE, a: la });
    rr(1050, 840, 700, 24, 12); ctx.save(); ctx.globalAlpha *= la; ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
    rr(1050, 840, 700 * 0.88 * eOut(P(lt, 16.6, 19.4)), 24, 12); ctx.fillStyle = RED; glow(RED, 12); ctx.fill(); ctx.restore();
    text('读得更慢', 1770, 860, { size: 22, color: RED, weight: 700, a: la });
  }
}

// ───────── 场景 6：对比 ─────────
function sceneCompare(lt) {
  header(lt, '06', '推 vs 拉', C_MIX, '成本放在哪一头');
  badge(110, 430, '写扩散 · 推', C_PUSH, a_(lt, 0.9));
  badge(110, 500, '读扩散 · 拉', C_PULL, a_(lt, 1.4));
  const t1 = a_(lt, 16.4), t2 = a_(lt, 18.2);
  text('成本要么放在写', 110, 680, { size: 40, weight: 800, color: C_PUSH, a: t1 });
  text('要么放在读', 110, 740, { size: 40, weight: 800, color: C_PULL, a: t2 });
  const panel = (y, title, sub, rows, a, start) => {
    glass(830, y, 980, 330, { a, r: 26 });
    text(title, 866, y + 56, { size: 30, weight: 700, a });
    text(sub, 1780, y + 56, { size: 22, color: MUTE, align: 'right', a });
    rows.forEach((r, i) => {
      const yy = y + 100 + i * 88;
      text(r.name, 866, yy + 36, { size: 28, weight: 700, color: r.c, a });
      ctx.save(); ctx.globalAlpha *= a; rr(1030, yy + 8, 480, 38, 19); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
      const g = eOut(P(lt, r.t, r.t + 1.4)), w = Math.max(18, 480 * r.v * g);
      ctx.fillStyle = r.c; glow(r.c, 14); rr(1030, yy + 8, w, 38, 19); ctx.fill(); ctx.restore();
      if (g > 0) text(r.label(g), 1780, yy + 38, { size: 30, weight: 800, font: MONO, color: r.bad ? RED : INK, align: 'right', a: a * clamp(g * 3) });
    });
    text(rows[0].note, 866, y + 300, { size: 22, color: DIM, a });
  };
  panel(190, '名人发一条帖：写入次数', '各面板自有刻度', [
    { name: '写扩散', c: C_PUSH, v: 1, t: 4.6, bad: true, label: (g) => fmt(1000000 * g) + ' 次', note: '书中示例：100 万读者' },
    { name: '读扩散', c: C_PULL, v: 0.0001, t: 6.7, label: () => '1 次' },
  ], a_(lt, 3.1), 3.1);
  panel(550, '读者打开一次：读取次数', '好友上限 5000', [
    { name: '写扩散', c: C_PUSH, v: 0.0001, t: 10.8, label: () => '1 次', note: '读扩散：每个好友都要读一次，最多 5000 次' },
    { name: '读扩散', c: C_PULL, v: 1, t: 13.2, bad: true, label: (g) => '≤ ' + fmt(5000 * g) + ' 次' },
  ], a_(lt, 9.3), 9.3);
}

// ───────── 场景 7：混合方案 ─────────
function sceneHybrid(lt) {
  header(lt, '07', '混合方案', C_MIX, 'Hybrid');
  bullet(0, '普通用户：写扩散（推）', a_(lt, 4.5), { color: INK });
  bullet(1, '粉丝特别多：不扩散，读时拉', a_(lt, 8.1), { size: 28 });
  bullet(2, '读者打开：缓存 + 拉名人帖', a_(lt, 13.6), { size: 28 });
  const na = a_(lt, 19.0);
  text('按粉丝规模、读者活跃度、发帖频率判断', 110, 670, { size: 22, color: MUTE, a: na });
  text('不能只凭“名人”标签', 110, 704, { size: 22, color: MUTE, a: na });
  statCard(110, 740, 300, '写放大', '可控', { color: C_MIX, a: a_(lt, 17.6) });
  statCard(440, 740, 300, '读延迟', '可控', { color: C_MIX, a: a_(lt, 19.4) });
  const U = [830, 230, 200, 96], B = [830, 470, 200, 96], F = [1140, 230, 200, 96], D = [1140, 470, 200, 96], K = [1480, 230, 320, 96], M = [1480, 610, 320, 260];
  box(...U, '普通用户', { color: C_MIX, a: a_(lt, 2.9), size: 26, sub: '粉丝几百' });
  box(...B, '大 V', { color: '#ffffff', a: a_(lt, 6.0), size: 28, sub: '粉丝百万级' });
  box(...F, '扩散服务', { color: C_PUSH, a: a_(lt, 3.6), size: 26 });
  box(...D, '帖子库', { color: C_PULL, a: a_(lt, 8.1), size: 26, sub: '只存一份' });
  box(...K, '粉丝的 feed 缓存', { color: C_CACHE, a: a_(lt, 4.5), size: 26 });
  arrow(1030, 278, 1140, 278, { color: C_MIX, p: eOut(P(lt, 4.0, 4.6)), head: 11 });
  arrow(1340, 278, 1480, 278, { color: C_PUSH, p: eOut(P(lt, 4.6, 5.2)), head: 11 });
  packet(1030, 278, 1140, 278, P(lt, 4.2, 5.0), C_MIX);
  packet(1340, 278, 1480, 278, P(lt, 5.0, 6.0), C_PUSH, { r: 10 });
  // 大 V：不扩散（虚线 + 叉）
  const nf = a_(lt, 8.1);
  if (nf > 0) { arrow(930, 470, 1240, 326, { color: 'rgba(255,255,255,0.28)', w: 3, dash: [8, 8], a: nf, head: 10 }); cross(1085, 398, 13, RED, nf); text('不扩散', 1128, 408, { size: 22, weight: 700, color: RED, a: nf }); }
  arrow(1030, 518, 1140, 518, { color: '#ffffff', p: eOut(P(lt, 8.3, 8.9)), head: 11 });
  packet(1030, 518, 1140, 518, P(lt, 8.5, 9.3), '#ffffff');
  // 读者合并
  const ma = a_(lt, 10.5);
  glass(...M, { a: ma, accent: C_MIX });
  text('读者打开 feed', 1500, 650, { size: 24, weight: 700, color: C_MIX, a: ma });
  arrow(1640, 326, 1640, 610, { color: C_CACHE, p: eOut(P(lt, 11.8, 12.8)), a: 1, w: 4 });
  packet(1640, 326, 1640, 610, P(lt, 11.8, 13.0), C_CACHE);
  arrow(1340, 518, 1480, 700, { color: '#ffffff', p: eOut(P(lt, 13.6, 14.6)), w: 4 });
  packet(1340, 518, 1480, 700, P(lt, 13.8, 15.0), '#ffffff');
  const items = [['p92', '#ffffff', 13.6], ['p88', C_CACHE, 11.9], ['p81', C_CACHE, 12.1], ['p77', '#ffffff', 14.1], ['p64', C_CACHE, 12.3]];
  const sorted = [['p92', '#ffffff'], ['p88', C_CACHE], ['p81', C_CACHE], ['p77', '#ffffff'], ['p64', C_CACHE]];
  // 先依序出现（缓存条目 → 名人条目），再按时间排好
  const mg = eIO(P(lt, 15.2, 16.4));
  const order = ['p88', 'p81', 'p64', 'p92', 'p77'];
  items.forEach(([id, col, t0]) => {
    const i0 = order.indexOf(id), i1 = sorted.findIndex((s) => s[0] === id);
    const y = lerp(682 + i0 * 36, 682 + i1 * 36, mg);
    idChip(1500 + 0, y, id, col, { a: a_(lt, id === 'p92' || id === 'p77' ? 14.6 : t0 + 1.0, 0.4), w: 66 });
  });
  const leg = a_(lt, 16.6);
  if (leg > 0) {
    dot(1620, 700, 7, C_CACHE, { g: 6, a: leg }); text('来自缓存', 1636, 708, { size: 20, color: MUTE, a: leg });
    dot(1620, 744, 7, '#ffffff', { g: 6, a: leg }); text('读时拉取', 1636, 752, { size: 20, color: MUTE, a: leg });
    text('合并 · 倒序', 1620, 800, { size: 22, color: C_MIX, weight: 700, a: leg });
  }
}

// ───────── 场景 8：读取流程 ─────────
function sceneRead(lt) {
  header(lt, '08', '读取流程', C_CACHE, 'GET /v1/me/feed');
  bullet(0, 'feed 缓存：只存帖子 ID', a_(lt, 7.7), { size: 28 });
  bullet(1, '内容缓存 / 数据库：取详情', a_(lt, 10.7), { size: 28 });
  bullet(2, '读取时按当前权限过滤', a_(lt, 15.9), { size: 28 });
  const wa = a_(lt, 18.7);
  statCard(110, 660, 640, '命中缓存 ≠ 内容仍可见', '读时再过滤', { color: RED, a: wa, h: 112 });
  const top = [['用户', 830, 0.8], ['负载均衡', 1100, 2.3], ['Web 服务器', 1370, 3.6], ['新闻流服务', 1640, 6.0]];
  top.forEach(([n, x, t]) => box(x, 190, 200, 96, n, { color: n === '用户' ? C_SVC : C_SVC, a: a_(lt, t), size: 24 }));
  [[1030, 1100, 2.1], [1300, 1370, 3.4], [1570, 1640, 5.6]].forEach(([x1, x2, t]) => {
    arrow(x1, 238, x2, 238, { color: C_SVC, p: eOut(P(lt, t, t + 0.5)), head: 10 });
    packet(x1, 238, x2, 238, P(lt, t + 0.1, t + 0.8), C_SVC);
  });
  // 行 2：feed 缓存 → 内容缓存 → 权限过滤
  box(1640, 410, 200, 96, '新闻流缓存', { color: C_CACHE, a: a_(lt, 7.7), size: 24 });
  box(1370, 410, 200, 96, '内容缓存', { color: C_CACHE, a: a_(lt, 10.7), size: 24, sub: '或数据库' });
  box(1100, 410, 200, 96, '权限过滤', { color: C_SVC, a: a_(lt, 15.9), size: 24 });
  arrow(1740, 286, 1740, 410, { color: C_CACHE, p: eOut(P(lt, 7.5, 8.2)), head: 11 });
  packet(1740, 286, 1740, 410, P(lt, 7.7, 8.6), C_CACHE);
  arrow(1640, 458, 1570, 458, { color: C_CACHE, p: eOut(P(lt, 10.5, 11.0)), head: 10 });
  packet(1640, 458, 1570, 458, P(lt, 10.7, 11.5), C_CACHE);
  arrow(1370, 458, 1300, 458, { color: C_SVC, p: eOut(P(lt, 15.7, 16.2)), head: 10 });
  packet(1370, 458, 1300, 458, P(lt, 15.9, 16.7), C_SVC);
  // ID 列表
  const ids = ['88', '81', '77', '64'];
  ids.forEach((id, i) => idChip(1640 + 6 + (i % 2) * 96, 524 + Math.floor(i / 2) * 42, id, C_CACHE, { a: a_(lt, 8.2 + i * 0.2, 0.4), w: 84 }));
  if (a_(lt, 14.0) > 0) text('只有 ID', 1740, 636, { size: 22, color: C_CACHE, weight: 700, align: 'center', a: a_(lt, 14.0) });
  // 结果卡片
  const post = [['88', true, ''], ['81', true, ''], ['77', false, '作者已被拉黑'], ['64', false, '帖子已删除']];
  post.forEach(([id, ok, why], i) => {
    const x = 830 + i * 256, y = 700, w = 240, h = 170;
    const hy = a_(lt, 11.2 + i * 0.35, 0.5);
    const bad = !ok && lt > (id === '64' ? 18.7 : 20.0);
    if (hy <= 0) return;
    const fil = bad ? 1 : 0;
    ctx.save(); ctx.globalAlpha *= hy * (bad ? 0.55 : 1);
    glass(x, y, w, h, { accent: bad ? RED : C_PULL, r: 20 });
    text(`post ${id}`, x + 24, y + 46, { size: 26, weight: 800, font: MONO, color: bad ? RED : INK });
    [0, 1, 2].forEach((k) => { ctx.fillStyle = 'rgba(255,255,255,0.14)'; rr(x + 24, y + 70 + k * 24, (w - 48) * (k === 2 ? 0.55 : 1), 10, 5); ctx.fill(); });
    ctx.restore();
    if (bad) { text(why, x + w / 2, y + h - 18, { size: 22, weight: 700, color: RED, align: 'center', a: hy }); cross(x + w - 30, y + 36, 11, RED, hy); }
    else if (lt > 16.8 + i * 0.2) check(x + w - 32, y + 38, 12, C_MIX, hy);
  });
  text('完整帖子', 830, 690, { size: 22, color: MUTE, a: a_(lt, 11.2) });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('推与拉', 110, 250, { size: 84, weight: 900, a: a_(lt, 0.2, 0.7) });
  text('Fan-out on Write / Read / Hybrid', 112, 304, { size: 32, color: MUTE, font: MONO, a: a_(lt, 0.4, 0.7) });
  [['写扩散', '发帖时推 post_id 给读者', C_PUSH], ['读扩散', '打开时才去拉好友帖子', C_PULL], ['混合', '普通用户推，大 V 拉', C_MIX]].forEach(([w, s, c], k) => {
    const t0 = 1.0 + k * 1.2, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 70, weight: 800 });
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  const aa = a_(lt, 5.2);
  text('feed 缓存只存帖子 ID，读取时再按权限过滤', 110, 750, { size: 28, weight: 600, color: C_CACHE, a: aa });
  text('先确认时间排序、读写比例和好友分布，再选扩散策略', 110, 800, { size: 24, color: MUTE, a: a_(lt, 6.2) });
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const cx = 1390, cy = 540, R = 290;
  const a = a_(lt, 0.2, 1.0);
  const N = 30;
  ctx.save(); ctx.globalAlpha *= 0.95;
  for (let i = 0; i < N; i++) {
    const ang = (i / N) * Math.PI * 2 + rnd(i) * 0.2, r = R * (0.65 + rnd(i + 20) * 0.45);
    const x = cx + Math.cos(ang) * r, y = cy + Math.sin(ang) * r;
    const t0 = 1.0 + (i % 10) * 0.08 + Math.floor(i / 10) * 0.9;
    const k = (lt * 0.5 + i / N) % 1;
    faint(cx, cy, x, y, a_(lt, 0.6 + i * 0.03) * 0.5);
    dot(x, y, 9, i % 7 === 0 ? C_CACHE : C_PUSH, { g: 12, a: a_(lt, 0.8 + i * 0.04) * 0.9 });
    packet(cx, cy, x, y, (lt * 0.6 + i * 0.037) % 1, C_PUSH, { r: 5 });
    void k; void t0;
  }
  ctx.restore();
  box(cx - 90, cy - 50, 180, 100, '发帖', { color: '#ffffff', a: a_(lt, 0.3), s: eBack(P(lt, 0.3, 1.0)), size: 34 });
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); ctx.globalAlpha *= a_(lt, 0.4, 1.0); ctx.translate(0, (1 - a_(lt, 0.4, 1.0)) * 30);
  ctx.font = `900 130px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('新闻流系统', 104, 520); ctx.restore();
  text('News Feed System', 112, 590, { size: 40, color: MUTE, font: MONO, a: a_(lt, 0.8) });
  text('第 11 章', 112, 680, { size: 34, weight: 700, color: INK, a: a_(lt, 1.2) });
}

export const scenes = { title: sceneTitle, overview: sceneOverview, publish: scenePublish, fanout: sceneFanout, amp: sceneAmp, pull: scenePull, compare: sceneCompare, hybrid: sceneHybrid, read: sceneRead, end: sceneEnd };
