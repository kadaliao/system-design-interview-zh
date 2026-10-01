// 第 1 章 从零扩展到百万用户：场景定义（外壳与工具来自 ../lib/core.js）
// 主线：每一步都是「瓶颈 → 加一层能力 → 新问题」。同一角色同一颜色：
//   Web=靛 数据库=青 缓存/CDN=琥珀 负载均衡/路由=粉 队列=天蓝 新增/成功=青柠 告警=红
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, hash32, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard } from '../lib/core.js';

export const meta = { no: 1, title: 'Scaling from Zero to Millions', en: 'Scaling from Zero to Millions' };

const WEB = SC[1], DBC = SC[0], CACHE = SC[3], LBC = SC[2], QC = '#38bdf8', GOOD = SC[4];

// ───────── 通用工具 ─────────
/** 旁白里某个短语开始说的时刻（按字数线性估计），off 微调 */
const at = (sc, s, off = 0) => {
  const i = sc.text.indexOf(s);
  if (i < 0) throw new Error(`[ch01] phrase not found in ${sc.id}: ${s}`);
  return sc.lead + (sc.voiceDur * i) / sc.text.length + off - 0.1;
};
const fade = (lt, t0, dt = 0.6) => eOut(P(lt, t0, t0 + dt));

/** 左栏因果条：小标签 + 一句话，按旁白节奏逐条出现 */
function tri(i, tag, str, a, { tc = SC[1], color = INK, y0 = 430, step = 105 } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.font = `700 22px ${SANS}`; const tw = ctx.measureText(tag).width; ctx.restore();
  const y = y0 + i * step, w = tw + 44;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-20 * (1 - a), 0);
  glass(110, y - 30, w, 42, { r: 21, accent: tc });
  text(tag, 110 + w / 2, y, { size: 22, weight: 700, color: tc, align: 'center' });
  text(str, 112, y + 50, { size: 30, weight: 600, color });
  ctx.restore();
}
/** 负载条：>0.85 变红 */
function meter(x, y, w, label, v, { a = 1, color = GOOD } = {}) {
  if (a <= 0) return;
  v = clamp(v);
  const c = v > 0.85 ? RED : v > 0.6 ? CACHE : color;
  text(label, x, y, { size: 22, color: MUTE, a });
  ctx.save(); ctx.globalAlpha *= a;
  rr(x, y + 12, w, 20, 10); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  ctx.fillStyle = c; glow(c, 12); rr(x, y + 12, Math.max(20, v * w), 20, 10); ctx.fill();
  ctx.restore();
}
function person(x, y, label, { a = 1, color = '#cfd6ff' } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(x, y - 16, 13, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y + 30, 26, Math.PI, 0); ctx.stroke(); ctx.restore();
  if (label) text(label, x, y + 66, { size: 22, color: MUTE, align: 'center', a });
}
function along(pts, p) {
  const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const d = p * L[L.length - 1];
  let i = 1; while (i < pts.length - 1 && L[i] < d) i++;
  const u = clamp((d - L[i - 1]) / (L[i] - L[i - 1] || 1));
  return [lerp(pts[i - 1][0], pts[i][0], u), lerp(pts[i - 1][1], pts[i][1], u)];
}
/** 沿折线移动的数据包 */
function pk(lt, t0, dur, pts, color, { r = 9, a = 1, trail = 0.12 } = {}) {
  const p = (lt - t0) / dur;
  if (p <= 0 || p >= 1) return;
  for (let k = 5; k >= 0; k--) { const q = clamp(p - (k * trail) / 5); const [x, y] = along(pts, q); dot(x, y, r * (1 - k * 0.12), color, { g: k ? 0 : 20, a: a * (1 - k / 6) * 0.9 }); }
}
const tag = (s, x, y, color, a = 1, size = 24) => text(s, x, y, { size, weight: 700, color, a, align: 'center' });
function pill(label, x, y, color, a = 1) { // 居中小标签
  if (a <= 0) return;
  ctx.save(); ctx.font = `600 24px ${SANS}`; const w = ctx.measureText(label).width + 36; ctx.restore();
  glass(x - w / 2, y - 24, w, 44, { r: 22, a, accent: color }); text(label, x, y + 8, { size: 24, weight: 600, color, align: 'center', a });
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  text('SYSTEM DESIGN INTERVIEW', 110, 380, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 96px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '1px';
  ctx.fillText('Scaling from', 104, 500); ctx.fillText('Zero to Millions', 104, 610); ctx.restore();
  text('From one server to millions of users', 112, 690, { size: 34, color: MUTE, a: eOut(P(lt, 0.8, 1.6)) });
  text('Chapter 1', 112, 800, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
  // 右侧：一台服务器逐步长成完整架构（预告）
  const t = lt - 1.6;
  const ap = (t0) => eBack(P(t, t0, t0 + 0.6));
  const line = (x1, y1, x2, y2, t0, c = '#8f98b0') => arrow(x1, y1, x2, y2, { color: c, w: 3, a: 0.7, p: eOut(P(t, t0, t0 + 0.6)), head: 11 });
  person(920, 530, '', { a: clamp(ap(0) * 2) });
  line(960, 520, 1280, 520, 0.2);
  box(1290, 480, 160, 80, 'Web', { color: WEB, s: ap(0.2), a: clamp(ap(0.2) * 2) });
  line(1450, 520, 1660, 520, 1.0);
  dbIcon(1670, 450, 110, 130, '', { a: clamp(ap(1.0) * 2) });
  // 加 LB 与更多 Web
  box(1020, 480, 130, 80, 'LB', { color: LBC, s: ap(2.0), a: clamp(ap(2.0) * 2) });
  box(1290, 340, 160, 80, 'Web', { color: WEB, s: ap(2.3), a: clamp(ap(2.3) * 2) });
  box(1290, 620, 160, 80, 'Web', { color: WEB, s: ap(2.6), a: clamp(ap(2.6) * 2) });
  line(1150, 520, 1290, 380, 2.3); line(1150, 520, 1290, 660, 2.6);
  // 缓存、副本、CDN、队列
  box(1500, 370, 130, 80, 'Cache', { color: CACHE, s: ap(3.4), a: clamp(ap(3.4) * 2) });
  dbIcon(1670, 700, 110, 130, '', { a: clamp(ap(4.0) * 2) * 0.9 });
  box(1000, 250, 170, 80, 'CDN', { color: CACHE, s: ap(4.6), a: clamp(ap(4.6) * 2) });
  box(1290, 790, 200, 80, 'Queue', { color: QC, s: ap(5.2), a: clamp(ap(5.2) * 2) });
}

// ───────── 场景 1：单机 → 拆库 ─────────
function sceneSingle(lt, d, sc) {
  header(lt, '01', 'Single Server', WEB, 'One machine does it all');
  const tReq = at(sc, 'A user visits'), tIP = at(sc, 'DNS returns'), tGo = at(sc, 'goes straight');
  const tBusy = at(sc, 'As traffic grows'), tMove = at(sc, 'So the first move');
  const mv = eIO(P(lt, tMove, tMove + 1.6));
  const sx = 1230, sw = lerp(520, 340, mv), sh = lerp(390, 290, mv), sy = 380;
  const busy = eOut(P(lt, tBusy, tBusy + 3.0));
  const v1 = lerp(0.2 + 0.8 * busy, 0.4, mv);
  // 用户 & DNS
  person(900, 640, 'User', { a: fade(lt, 0.5) });
  for (const [y, t0] of [[500, 0], [780, 0]]) person(900, y, '', { a: fade(lt, tBusy + 0.2) * 0.8 });
  box(930, 200, 240, 100, 'DNS', { color: LBC, sub: 'api.mysite.com', a: fade(lt, 0.6), size: 30 });
  pk(lt, tReq, 0.9, [[925, 600], [1010, 300]], '#cfd6ff');
  pk(lt, tIP, 0.9, [[1060, 300], [940, 600]], LBC);
  if (lt > tIP + 0.8) pill('Got the IP', 1030, 470, LBC, fade(lt, tIP + 0.8) * (1 - P(lt, tGo + 0.5, tGo + 1.2)));
  // 服务器
  const hot = v1 > 0.9;
  ctx.save(); ctx.globalAlpha *= fade(lt, 0.7);
  glass(sx, sy, sw, sh, { accent: hot ? RED : WEB, r: 24 });
  text('One server', sx + 28, sy + 40, { size: 26, weight: 700, color: hot ? RED : INK });
  const row = (i, label, c, extra = 1) => {
    const y = sy + 64 + i * 100;
    glass(sx + 24, y, sw - 48, 74, { r: 16, accent: c, a: extra }); text(label, sx + 50, y + 47, { size: 28, weight: 700, color: c, a: extra });
  };
  row(0, 'Web app', WEB);
  const dbRowY = sy + 64 + 100;
  if (mv < 1) row(1, 'Database', DBC, 1 - clamp(mv * 2));
  // 缓存行上移补位
  { const y = lerp(sy + 64 + 200, sy + 64 + 100, mv); glass(sx + 24, y, sw - 48, 74, { r: 16, accent: CACHE }); text('Cache', sx + 50, y + 47, { size: 28, weight: 700, color: CACHE }); }
  ctx.restore();
  // 数据库搬出
  if (mv > 0) {
    const dx = lerp(sx + 60, 1640, mv), dy = lerp(dbRowY - 40, 470, mv);
    dbIcon(dx, dy, 150, 180, 'Database', { a: clamp(mv * 2.5) });
    arrow(sx + sw + 10, 560, 1625, 560, { color: DBC, p: eOut(P(mv, 0.6, 1)), a: 0.9 });
  }
  // 请求流
  pk(lt, tGo, 0.8, [[935, 650], [sx, 600]], '#cfd6ff');
  pk(lt, tGo + 1.0, 0.8, [[sx, 620], [935, 660]], GOOD);
  if (lt > tBusy) for (let k = 0; k < 24; k++) {
    const t0 = tBusy + k * 0.28;
    if (t0 > tMove + 3) break;
    const y0 = [500, 640, 780][k % 3] + 15;
    pk(lt, t0, 0.8, [[935, y0], [sx, 520 + (k % 3) * 60]], '#cfd6ff', { r: 7, a: 0.9 });
  }
  // 负载
  if (mv <= 0.01) meter(sx, 830, sw, 'Machine load (illustrative)', v1, { a: fade(lt, tBusy) });
  else {
    meter(sx, 830, 250, 'Web tier', lerp(1, 0.45, mv), { a: mv });
    meter(1520, 830, 250, 'Database tier', lerp(1, 0.4, mv), { a: mv });
  }
  if (hot && mv < 0.3) pill('Fighting for resources', sx + sw / 2, 340, RED, fade(lt, tBusy + 2.2));
  // 左栏
  tri(0, 'Now', 'Web, DB, cache on one machine', fade(lt, 0.9));
  tri(1, 'Problem', 'They compete for resources', fade(lt, tBusy), { tc: RED });
  tri(2, 'Fix', 'Give the DB its own server', fade(lt, tMove), { tc: GOOD });
  tri(3, 'Gain', 'Each tier scales on its own', fade(lt, tMove + 1.8), { tc: GOOD });
}

// ───────── 场景 2：纵向 vs 横向 ─────────
function sceneVertical(lt, d, sc) {
  header(lt, '02', 'Scale Up vs Out', WEB, 'How to grow the web tier');
  const tV = at(sc, 'Scaling up'), tCeil = at(sc, "there's a hardware"), tSp = at(sc, "it's still a single"), tH = at(sc, 'Scaling out');
  const lA = lt < tH - 0.2 ? 1 : lerp(1, 0.45, P(lt, tH - 0.2, tH + 0.6));
  const rA = lerp(0.3, 1, P(lt, tH - 0.3, tH + 0.5));
  // 左：纵向
  ctx.save(); ctx.globalAlpha *= lA * fade(lt, 0.4);
  glass(820, 200, 470, 690, { accent: WEB });
  text('Scale up', 850, 262, { size: 38, weight: 800 }); text('Vertical', 850, 298, { size: 22, color: MUTE, font: MONO });
  const g = eIO(P(lt, tV, tCeil + 0.6)), bh = lerp(150, 400, g), bw = lerp(210, 300, g), by = 800 - bh;
  const spof = fade(lt, tSp);
  ctx.setLineDash([10, 8]); ctx.strokeStyle = RED; ctx.lineWidth = 2.5; ctx.globalAlpha *= 1;
  ctx.beginPath(); ctx.moveTo(850, 395); ctx.lineTo(1260, 395); ctx.stroke(); ctx.setLineDash([]);
  text('Hardware limit', 1260, 382, { size: 24, weight: 700, color: RED, align: 'right' });
  box(1055 - bw / 2, by, bw, bh, 'One server', { color: WEB, size: 30, sub: 'more CPU · RAM', hot: spof > 0.5 });
  if (g > 0) { arrow(1055 + bw / 2 + 24, 700, 1055 + bw / 2 + 24, 700 - (bh - 150) * 0.9, { color: GOOD, w: 4, a: 0.9 }); }
  pill('Single point of failure', 1055, 850, RED, spof);
  ctx.restore();
  // 右：横向
  ctx.save(); ctx.globalAlpha *= rA * fade(lt, 0.5);
  glass(1340, 200, 480, 690, { accent: GOOD });
  text('Scale out', 1370, 262, { size: 38, weight: 800 }); text('Horizontal', 1370, 298, { size: 22, color: MUTE, font: MONO });
  text('Server pool', 1370, 372, { size: 24, color: MUTE, weight: 600 });
  for (let i = 0; i < 4; i++) {
    const p = eBack(P(lt, tH + 0.2 + i * 0.5, tH + 0.8 + i * 0.5));
    box(1370 + (i % 2) * 210, 400 + Math.floor(i / 2) * 140, 200, 100, `Web ${i + 1}`, { color: WEB, s: p, a: clamp(p * 2), size: 28 });
  }
  pill('Capacity grows with count', 1580, 760, GOOD, fade(lt, tH + 2.5));
  ctx.restore();
  tri(0, 'Up', 'Bigger box: simple, but capped', fade(lt, tV), { tc: WEB });
  tri(1, 'Risk', 'Still a single point of failure', fade(lt, tSp), { tc: RED });
  tri(2, 'Out', 'More servers: a pool', fade(lt, tH), { tc: GOOD });
  tri(3, 'Needs', 'Someone to spread the requests', fade(lt, tH + 3.2), { tc: LBC });
}

// ───────── 场景 3：负载均衡 ─────────
function sceneLB(lt, d, sc) {
  header(lt, '03', 'Load Balancer', LBC, 'Distribute, back up, scale');
  const tDown = at(sc, 'goes down'), tAdd = at(sc, 'we add one more'), tOnly = at(sc, 'the balancer only'), tMore = at(sc, 'adding web servers');
  const ys = [250, 400, 550, 700], WX = 1330, LX = 1010;
  const alive = (i, t) => (i === 0 ? t < tDown : i === 1 ? true : i === 2 ? t >= tAdd : t >= tMore);
  const appear = [0.7, 0.9, tAdd, tMore];
  // 用户、LB
  [420, 560, 700].forEach((y, i) => person(880, y - 40, '', { a: fade(lt, 0.4 + i * 0.15) * 0.9 }));
  box(LX, 490, 200, 100, 'LB', { color: LBC, sub: 'Load balancer', size: 30, a: fade(lt, 0.5) });
  const dbHot = P(lt, tOnly, tOnly + 5);
  dbIcon(1680, 440, 150, 190, 'Database', { color: dbHot > 0.8 ? RED : DBC, fill: lerp(0.15, 1, dbHot), a: fade(lt, 0.8) });
  // Web 方框
  for (let i = 0; i < 4; i++) {
    const p = eBack(P(lt, appear[i], appear[i] + 0.6)); if (p <= 0) continue;
    const dead = !alive(i, lt);
    box(WX, ys[i], 190, 100, `Web ${i + 1}`, { color: WEB, s: p, a: dead ? 0.55 : clamp(p * 2), hot: dead, sub: dead ? 'Offline' : null, size: 28 });
    // LB → web 连线
    arrow(LX + 200, 540, WX - 6, ys[i] + 50, { color: dead ? RED : '#8f98b0', w: 2.5, a: dead ? 0.3 : 0.45, p: eOut(P(lt, appear[i], appear[i] + 0.6)), head: 10, dash: dead ? [6, 8] : null });
    // web → DB（阶段三：所有请求汇聚到同一个库）
    if (!dead) arrow(WX + 190, ys[i] + 50, 1672, 535, { color: dbHot > 0.5 ? RED : '#8f98b0', w: 2.5, a: 0.5 * fade(lt, tOnly), p: eOut(P(lt, tOnly, tOnly + 0.8)), head: 10 });
  }
  // 数据包：轮流分发给存活的服务器
  for (let k = 0; k < 90; k++) {
    const tk = 1.0 + k * 0.5;
    if (tk > lt + 0.2) break;
    const al = [0, 1, 2, 3].filter((i) => alive(i, tk));
    const i = al[k % al.length];
    pk(lt, tk - 0.55, 0.55, [[920, 540], [LX, 540]], '#cfd6ff', { r: 7, a: 0.8 });
    pk(lt, tk, 0.8, [[LX + 200, 540], [WX, ys[i] + 50]], LBC, { r: 8 });
    if (tk >= tOnly) pk(lt, tk + 0.8, 0.9, [[WX + 190, ys[i] + 50], [1672, 535]], dbHot > 0.5 ? RED : DBC, { r: 7, a: 0.9 });
  }
  if (lt > tDown) { const a = fade(lt, tDown, 0.4) * (1 - P(lt, tAdd - 0.4, tAdd)); pill('Web 1 down: traffic goes to Web 2', 1330, 215, RED, a); }
  if (lt > tAdd) pill('Traffic spike: add one more', 1330, 215, GOOD, fade(lt, tAdd) * (1 - P(lt, tOnly - 0.2, tOnly + 0.3)));
  if (lt > tOnly + 1.5) pill('The bottleneck is here', 1640, 850, RED, fade(lt, tOnly + 1.5));
  tri(0, 'Fix', 'Spread requests over the pool', fade(lt, 0.9), { tc: LBC });
  tri(1, 'Backup', 'One goes down, others take over', fade(lt, tDown), { tc: GOOD });
  tri(2, 'Scale', 'Traffic spike: add one more', fade(lt, tAdd), { tc: GOOD });
  tri(3, 'New limit', 'Requests still hit one database', fade(lt, tOnly), { tc: RED });
}

// ───────── 场景 4：无状态 Web 层 ─────────
function sceneStateless(lt, d, sc) {
  header(lt, '04', 'Stateless Web', WEB, 'Keep sessions out of the machine');
  const tA = at(sc, 'login session'), tB = at(sc, 'the next request'), tMove = at(sc, 'Move the session'), tScale = at(sc, 'scale in and out');
  const WX = 1290, LX = 990, ys = [270, 470, 670], SX = 1650;
  const U = [905, 540];
  person(880, 500, 'User', { a: fade(lt, 0.4) });
  box(LX, 490, 190, 100, 'LB', { color: LBC, size: 30, a: fade(lt, 0.5) });
  const w3 = eBack(P(lt, tScale, tScale + 0.6));
  [0, 1, 2].forEach((i) => {
    const p = i < 2 ? fade(lt, 0.6 + i * 0.15) : w3; if (p <= 0) return;
    const bad = i === 1 && lt > tB + 1.5 && lt < tMove;
    box(WX, ys[i], 210, 130, `Web ${i + 1}`, { color: WEB, size: 28, s: i < 2 ? 1 : p, a: clamp(p * 2), hot: bad });
    arrow(LX + 190, 540, WX - 6, ys[i] + 65, { color: '#8f98b0', w: 2.5, a: 0.4 * clamp(p * 2), p: 1, head: 10 });
  });
  box(SX, 450, 190, 130, 'Storage', { color: DBC, size: 28, a: fade(lt, tMove - 0.4) });
  // session 小标签：先在 Web1 内存里
  const sessChip = (x, y, a = 1) => { glass(x, y, 178, 36, { r: 14, accent: GOOD, a }); text('session ✓', x + 89, y + 26, { size: 20, weight: 700, color: GOOD, align: 'center', font: MONO, a }); };
  const arriveA = tA + 1.7;
  if (lt < tMove) sessChip(WX + 16, ys[0] + 84, fade(lt, arriveA));
  else {
    const m = eIO(P(lt, tMove, tMove + 1.4)), x = lerp(WX + 16, SX + 6, m), y = lerp(ys[0] + 84, 450 + 90, m);
    sessChip(x, y, 1);
  }
  const toWeb = (i) => [[U[0] + 20, U[1]], [LX, 540], [LX + 190, 540], [WX, ys[i] + 65]];
  // 请求 A → Web1（登录成功）
  pk(lt, tA + 0.2, 1.5, toWeb(0), '#cfd6ff');
  pill('Logged in', WX + 105, ys[0] - 22, GOOD, fade(lt, arriveA) * (1 - P(lt, tB, tB + 0.5)));
  // 请求 B → Web2（没有 session）
  pk(lt, tB + 0.2, 1.5, toWeb(1), '#cfd6ff');
  if (lt > tB + 1.7 && lt < tMove) pill('No session: sign in again', WX + 105, ys[1] - 22, RED, fade(lt, tB + 1.7));
  // 共享存储之后：任意 Web 都能取到
  [[0, 2.4], [1, 3.4], [0, 4.4], [1, 5.0]].forEach(([i, dt], k) => {
    const t0 = tMove + dt; if (lt < t0) return;
    pk(lt, t0, 1.4, toWeb(i), '#cfd6ff', { r: 8 });
    pk(lt, t0 + 1.4, 0.7, [[WX + 210, ys[i] + 65], [SX, 515]], DBC, { r: 7 });
    pk(lt, t0 + 2.0, 0.7, [[SX, 535], [WX + 210, ys[i] + 85]], GOOD, { r: 7 });
    if (k < 2) pill('✓', WX + 105, ys[i] - 22, GOOD, fade(lt, t0 + 2.1) * (1 - P(lt, t0 + 3.2, t0 + 3.6)));
  });
  if (lt > tScale) pill('Auto-scales with traffic', WX + 105, ys[2] + 160, GOOD, fade(lt, tScale + 0.4));
  text('State is not gone,', SX + 95, 650, { size: 24, color: MUTE, a: fade(lt, tMove + 2.5), weight: 600, align: 'center' }); text('just kept in one place', SX + 95, 684, { size: 24, color: MUTE, a: fade(lt, tMove + 2.5), weight: 600, align: 'center' });
  tri(0, 'Problem', 'Session lives in one machine', fade(lt, tA), { tc: RED });
  tri(1, 'Result', 'Switch machines, sign in again', fade(lt, tB), { tc: RED });
  tri(2, 'Fix', 'Move sessions to shared storage', fade(lt, tMove), { tc: GOOD });
  tri(3, 'Gain', 'Stateless: auto scale in and out', fade(lt, tScale), { tc: GOOD });
}

// ───────── 场景 5：数据库主从复制 ─────────
function sceneReplica(lt, d, sc) {
  header(lt, '05', 'Replication', DBC, 'Master writes, replicas read');
  const tW = at(sc, 'The master handles'), tR = at(sc, 'the replicas handle'), tFail = at(sc, 'If the master dies'), tLag = at(sc, 'But replication has lag');
  const prom = eIO(P(lt, tFail + 0.9, tFail + 2.2));
  const M = [1380, 230], A = [1130, 640], B = [1630, 640], IW = 170, IH = 170;
  const aPos = [lerp(A[0], M[0], prom), lerp(A[1], M[1], prom)];
  const oldDead = P(lt, tFail, tFail + 0.5);
  const WB = [830, 400, 170, 100];
  box(WB[0], WB[1], WB[2], WB[3], 'Web', { color: WEB, size: 30, a: fade(lt, 0.4) });
  // 老主库
  const showMaster = lt < tFail + 1.4 ? 1 : 0;
  if (showMaster) dbIcon(M[0], M[1], IW, IH, oldDead > 0 ? 'Master down' : 'Master', { color: oldDead > 0.1 ? RED : DBC, a: fade(lt, 0.5) * (1 - P(lt, tFail + 0.9, tFail + 1.4)) });
  // 从库 A（会被提升）、B
  const aLabel = prom > 0.6 ? 'New master' : 'Replica';
  dbIcon(aPos[0], aPos[1], IW, IH, aLabel, { color: prom > 0.6 ? GOOD : DBC, a: fade(lt, tR - 0.6) });
  dbIcon(B[0], B[1], IW, IH, 'Replica', { a: fade(lt, tR - 0.6) });
  if (prom > 0 && prom < 1) { ctx.save(); ctx.setLineDash([6, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(A[0] + IW / 2, A[1] + IH / 2, IW / 2, IH / 2, 0, 0, 7); ctx.stroke(); ctx.restore(); }
  // 当前主库位置
  const MP = lt < tFail + 1.4 ? M : M; // 新主库最终落在 M
  const wTarget = [MP[0], MP[1] + 90];
  // 版本号
  const lagged = lt >= tLag;
  const vM = lagged && lt >= tLag + 0.3 ? 42 : 41;
  const vB = lt >= tLag + 2.4 ? 42 : 41;
  const vTxt = (x, y, v, c, a = 1) => text(`v${v}`, x + IW / 2, y - 12, { size: 24, weight: 800, font: MONO, color: c, align: 'center', a });
  if (lt > tW + 1) {
    if (lt < tFail + 1.4) vTxt(M[0], M[1], 41, oldDead > 0 ? RED : MUTE, fade(lt, tW + 1) * (1 - oldDead));
    vTxt(aPos[0], aPos[1], prom > 0.9 ? vM : 41, MUTE, fade(lt, tW + 1));
    vTxt(B[0], B[1], vB, vB !== vM && lagged ? RED : MUTE, fade(lt, tW + 1));
  }
  // 线条
  const wl = fade(lt, tW);
  arrow(WB[0] + WB[2], 440, M[0] - 8, M[1] + 100, { color: LBC, w: 3, a: 0.7 * wl * (lt < tFail ? 1 : 0.2), p: eOut(P(lt, tW, tW + 0.6)), head: 11 });
  [[A, 0], [B, 1]].forEach(([s, i]) => {
    const a = fade(lt, tW + 0.8) * (i === 0 && lt > tFail ? 0 : 1);
    if (lt < tFail + 1) arrow(M[0] + IW / 2 + (i ? 30 : -30), M[1] + IH + 34, s[0] + IW / 2, s[1] - 40, { color: '#8f98b0', w: 2, a: 0.5 * a, dash: [6, 8], p: eOut(P(lt, tW + 0.8, tW + 1.4)), head: 9 });
  });
  const rl = fade(lt, tR);
  arrow(WB[0] + WB[2], 470, A[0] - 8, A[1] + 70, { color: DBC, w: 3, a: 0.7 * rl * (prom > 0 ? 0 : 1), p: eOut(P(lt, tR, tR + 0.6)), head: 11 });
  arrow(WB[0] + WB[2], 480, B[0] - 8, B[1] + 70, { color: DBC, w: 3, a: 0.7 * rl, p: eOut(P(lt, tR, tR + 0.6)), head: 11 });
  // 阶段一：写 + 复制 + 读
  for (let k = 0; k < 8; k++) {
    const t0 = tW + 0.4 + k * 1.1; if (t0 > tFail - 1.2) break;
    pk(lt, t0, 0.9, [[WB[0] + WB[2], 440], [M[0], M[1] + 100]], LBC, { r: 9 });
    pk(lt, t0 + 0.9, 0.8, [[M[0] + IW / 2 - 30, M[1] + IH + 34], [A[0] + IW / 2, A[1] - 40]], '#cfd6ff', { r: 6, a: 0.8 });
    pk(lt, t0 + 0.9, 0.8, [[M[0] + IW / 2 + 30, M[1] + IH + 34], [B[0] + IW / 2, B[1] - 40]], '#cfd6ff', { r: 6, a: 0.8 });
  }
  for (let k = 0; k < 10; k++) {
    const t0 = tR + 0.2 + k * 0.7; if (t0 > tFail - 0.8) break;
    pk(lt, t0, 0.9, [[WB[0] + WB[2], k % 2 ? 480 : 470], k % 2 ? [B[0], B[1] + 70] : [A[0], A[1] + 70]], DBC, { r: 8 });
  }
  if (lt > tR + 1.0 && lt < tFail) pill('Read-heavy: more replicas', 1380, 895, MUTE, fade(lt, tR + 1.0));
  // 阶段二：故障提升
  if (lt > tFail) {
    const a = fade(lt, tFail + 1.8);
    pill('Promoted to master', 1380, 170, GOOD, a * (1 - P(lt, tLag - 0.2, tLag + 0.3)));
    arrow(WB[0] + WB[2], 440, M[0] - 8, M[1] + 100, { color: GOOD, w: 3, a: 0.8 * P(prom, 0.8, 1), p: 1, head: 11 });
  }
  // 阶段三：复制延迟
  if (lagged) {
    const t0 = tLag + 0.2;
    pk(lt, t0, 0.7, [[WB[0] + WB[2], 440], [M[0], M[1] + 100]], LBC, { r: 9 });
    pk(lt, t0 + 0.6, 2.0, [[M[0] + IW / 2 + 30, M[1] + IH + 34], [B[0] + IW / 2, B[1] - 40]], RED, { r: 7, a: 0.9, trail: 0.06 });
    const tr = t0 + 1.2;
    pk(lt, tr, 0.8, [[WB[0] + WB[2], 480], [B[0], B[1] + 70]], DBC, { r: 8 });
    pk(lt, tr + 0.8, 0.8, [[B[0], B[1] + 90], [WB[0] + 90, 505]], RED, { r: 8 });
    if (lt > tr + 1.6 && lt < tr + 4.2) pill('Read v41: stale data', 1060, 620, RED, fade(lt, tr + 1.6));
    if (lt > tLag + 2.6) pill('Caught up to v42', B[0] + IW / 2 - 20, 895, GOOD, fade(lt, tLag + 2.6));
  }
  tri(0, 'Write', 'Only to the master', fade(lt, tW), { tc: LBC });
  tri(1, 'Read', 'Spread over replicas', fade(lt, tR), { tc: DBC });
  tri(2, 'Failure', 'Master dies: promote a replica', fade(lt, tFail), { tc: GOOD });
  tri(3, 'Cost', 'Replication lag: stale reads', fade(lt, tLag), { tc: RED });
}

// ───────── 场景 6：缓存 ─────────
function sceneCache(lt, d, sc) {
  header(lt, '06', 'Caching', CACHE, 'Read-heavy? Ask memory first');
  const tQ = at(sc, 'Check the cache first'), tMiss = at(sc, 'On a miss'), tFill = at(sc, 'fill the cache'), tTTL = at(sc, 'Set an expiry'), tLRU = at(sc, 'evict the least'), tStale = at(sc, 'may disagree');
  const WB = [830, 440, 170, 100], CX = 1150, CW = 330, DBX = 1670, slotY = (i) => 410 + i * 66;
  box(WB[0], WB[1], WB[2], WB[3], 'Web', { color: WEB, size: 30, a: fade(lt, 0.4) });
  ctx.save(); ctx.globalAlpha *= fade(lt, 0.5);
  glass(CX, 330, CW, 356, { accent: CACHE }); text('Cache (in memory)', CX + 24, 372, { size: 26, weight: 700, color: CACHE });
  ctx.restore();
  dbIcon(DBX, 410, 150, 190, 'Database', { a: fade(lt, 0.6) });
  // 槽位与内容：{key, slot, born, die, ver}
  const T1 = tTTL, T2 = tLRU;
  const items = [
    { k: 'K1', s: 0, b: 0.8, d: 1e9, v: lt >= tStale + 1.2 ? 'v1' : 'v1' },
    { k: 'K2', s: 1, b: 1.0, d: T1 + 2.6 },
    { k: 'K3', s: 2, b: tFill + 0.9, d: T2 + 1.2 },
    { k: 'K4', s: 1, b: T1 + 3.4, d: 1e9 },
    { k: 'K5', s: 3, b: T1 + 3.9, d: 1e9 },
    { k: 'K6', s: 2, b: T2 + 1.2, d: 1e9 },
  ];
  items.forEach((it) => {
    const a = eOut(P(lt, it.b, it.b + 0.5)) * (1 - eOut(P(lt, it.d - 0.5, it.d)));
    if (a <= 0) return;
    const x = CX + 25, y = slotY(it.s), flash = it.k === 'K3' ? P(lt, tFill + 0.9, tFill + 0.5 + 0.9) : 1;
    glass(x, y, CW - 50, 54, { r: 14, accent: CACHE, a, fill: 0.1 });
    text(`${it.k} = ${it.k === 'K1' ? 'v1' : 'v1'}`, x + 22, y + 36, { size: 26, weight: 700, font: MONO, color: INK, a });
  });
  // TTL 倒计时环（K2）
  if (lt > T1 && lt < T1 + 2.6) {
    const p = P(lt, T1, T1 + 2.4), cx = CX + CW - 56, cy = slotY(1) + 27;
    ctx.save(); ctx.lineWidth = 5; ctx.strokeStyle = CACHE; glow(CACHE, 10); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, 15, -Math.PI / 2, -Math.PI / 2 + (1 - p) * Math.PI * 2); ctx.stroke(); ctx.restore();
    pill('TTL expired', 1000, 600, CACHE, fade(lt, T1 + 1.6) * (1 - P(lt, T1 + 2.4, T1 + 2.8)));
  }
  // LRU 标记
  if (lt > T2 - 0.8 && lt < T2 + 1.2) {
    const y = slotY(2) + 27;
    arrow(CX - 10, y, CX + 22, y, { color: RED, w: 4, head: 11 });
    pill('LRU → evict', 1000, y + 120, RED, fade(lt, T2 - 0.8));
  }
  if (lt > T2 + 1.2) pill('New key replaces it', 1000, slotY(2) + 147, GOOD, fade(lt, T2 + 1.2) * (1 - P(lt, T2 + 2.8, T2 + 3.2)));
  // 请求事件
  const reqs = [];
  reqs.push({ t: tQ + 0.2, hit: true, key: 'K1' });
  reqs.push({ t: tMiss + 0.2, hit: false, key: 'K3' });
  for (let i = 0; i < 8; i++) reqs.push({ t: tFill + 1.8 + i * 0.85, hit: true, key: ['K1', 'K3', 'K2'][i % 3] });
  reqs.forEach((r) => {
    const y = slotY({ K1: 0, K2: 1, K3: 2 }[r.key]) + 27;
    pk(lt, r.t, 0.6, [[WB[0] + 170, 490], [CX - 6, y]], WEB, { r: 8 });
    if (r.hit) pk(lt, r.t + 0.6, 0.6, [[CX - 6, y + 4], [WB[0] + 170, 500]], CACHE, { r: 8 });
    else {
      pk(lt, r.t + 0.6, 0.9, [[CX + CW, y], [DBX, 505]], DBC, { r: 8 });
      pk(lt, r.t + 1.5, 0.9, [[DBX, 515], [CX + CW - 30, y]], GOOD, { r: 8 });
      pk(lt, r.t + 2.4, 0.5, [[CX + 40, y], [WB[0] + 170, 500]], DBC, { r: 7, a: 0.7 });
    }
    if (lt > r.t + 0.6 && lt < r.t + 1.5) pill(r.hit ? 'Hit' : 'Miss', CX - 110, y - 36, r.hit ? GOOD : RED, fade(lt, r.t + 0.6, 0.3) * (1 - P(lt, r.t + 1.2, r.t + 1.5)));
  });
  if (lt > tFill && lt < tFill + 1.5) pill('Fill cache', CX + CW / 2, 700, GOOD, fade(lt, tFill) * (1 - P(lt, tFill + 1.2, tFill + 1.5)));
  // 命中率：以事件计
  const done = reqs.filter((r) => lt >= r.t + (r.hit ? 1.2 : 2.9));
  const hits = done.filter((r) => r.hit).length, tot = done.length;
  const hr = tot ? hits / tot : 0, show = fade(lt, tFill + 1.0);
  statCard(110, 770, 640, 'Cache hit rate (illustrative)', tot ? `${Math.round(hr * 100)} %` : '— %', { color: hr > 0.8 ? GOOD : CACHE, a: show });
  meter(850, 790, 270, 'DB load (illustrative)', tot ? 1 - hr * 0.9 : 1, { a: show });
  // 不一致
  if (lt > tStale) {
    const a = fade(lt, tStale + 0.3);
    glass(1150, 760, 640, 100, { accent: RED, a });
    text('Database', 1180, 804, { size: 26, weight: 700, color: INK, a }); text('K1 = v2', 1340, 804, { size: 28, weight: 700, font: MONO, color: INK, a });
    text('Cache', 1180, 844, { size: 26, weight: 700, color: RED, a }); text('K1 = v1', 1340, 844, { size: 28, weight: 700, font: MONO, color: RED, a });
    text('≠ Mismatch', 1520, 844, { size: 28, weight: 800, color: RED, a });
  }
  tri(0, 'Fix', 'Cache first, then the database', fade(lt, tQ), { tc: CACHE });
  tri(1, 'Rules', 'Set expiry; evict least used', fade(lt, tTTL), { tc: CACHE });
  tri(2, 'Cost', 'Cache and DB can disagree', fade(lt, tStale), { tc: RED });
}

// ───────── 场景 7：CDN ─────────
function sceneCDN(lt, d, sc) {
  header(lt, '07', 'CDN', CACHE, 'Static content, closer to users');
  const tR1 = at(sc, 'Users ask the nearest'), tMiss = at(sc, "If it doesn't have"), tHit = at(sc, 'so the next users'), tInv = at(sc, 'When a file changes');
  const NA = [1150, 330, 240, 120], OR = [1600, 470, 230, 130], inv = lt >= tInv;
  const file = lt >= tInv + 3 ? 'app.a91d.js' : 'app.8f3c.js';
  person(880, 340, 'User 1', { a: fade(lt, 0.4) });
  person(880, 520, 'User 2', { a: fade(lt, tHit - 0.8) });
  person(880, 770, '', { a: fade(lt, 0.8) * 0.4 });
  box(NA[0], NA[1], NA[2], NA[3], 'CDN node', { color: CACHE, sub: 'nearest to user', size: 28, a: fade(lt, 0.5) });
  // 另一个节点（虚）
  ctx.save(); ctx.globalAlpha *= fade(lt, 0.9) * 0.5; ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.strokeStyle = CACHE;
  rr(NA[0], 700, 240, 120, 22); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  text('More nodes', NA[0] + 120, 770, { size: 24, color: MUTE, align: 'center', a: fade(lt, 0.9) * 0.7 });
  box(OR[0], OR[1], OR[2], OR[3], 'Origin', { color: WEB, sub: 'your servers', size: 28, a: fade(lt, 0.5) });
  // 远距离
  ctx.save(); ctx.globalAlpha *= 0.45 * fade(lt, 0.8); ctx.setLineDash([4, 12]); ctx.lineWidth = 3; ctx.strokeStyle = '#8f98b0';
  ctx.beginPath(); ctx.moveTo(NA[0] + 240, 400); ctx.lineTo(OR[0], 520); ctx.stroke(); ctx.restore();
  text('Far away: high latency', 1545, 425, { size: 22, color: MUTE, align: 'center', a: fade(lt, 0.9) * 0.9 });
  // 节点里的文件
  const stored = lt >= tMiss + 2.9 && !(lt >= tInv + 0.8 && lt < tInv + 3);
  const chipA = lt >= tInv + 3 ? eOut(P(lt, tInv + 3, tInv + 3.6)) : eOut(P(lt, tMiss + 2.9, tMiss + 3.5)) * (1 - eOut(P(lt, tInv + 0.6, tInv + 1.2)));
  if (chipA > 0) {
    glass(NA[0], 466, 240, 44, { r: 14, accent: CACHE, a: chipA, fill: 0.1 });
    text(file, NA[0] + 120, 497, { size: 22, weight: 700, font: MONO, align: 'center', a: chipA });
  }
  // 首次：回源
  const a0 = [[925, 340], [NA[0] - 6, 370]];
  pk(lt, tR1 + 0.2, 0.7, a0, WEB);
  if (lt > tMiss && lt < tMiss + 2.5) pill('Miss', NA[0] + 120, 300, RED, fade(lt, tMiss, 0.3) * (1 - P(lt, tMiss + 2.2, tMiss + 2.5)));
  pk(lt, tMiss + 0.3, 1.2, [[NA[0] + 240, 410], [OR[0] - 6, 520]], CACHE);
  pk(lt, tMiss + 1.5, 1.2, [[OR[0], 540], [NA[0] + 240, 430]], GOOD);
  pk(lt, tMiss + 2.7, 0.7, [[NA[0] - 6, 390], [925, 360]], GOOD);
  // 后面的人：直接命中
  [0, 1].forEach((i) => {
    const t0 = tHit + 0.2 + i * 1.6; if (lt < t0) return;
    pk(lt, t0, 0.5, [[925, 540], [NA[0] - 6, 430]], WEB, { r: 8 });
    pk(lt, t0 + 0.5, 0.5, [[NA[0] - 6, 440], [925, 560]], GOOD, { r: 8 });
    if (lt > t0 + 0.4 && lt < t0 + 1.4) pill('Hit', NA[0] - 80, 400, GOOD, fade(lt, t0 + 0.4, 0.3) * (1 - P(lt, t0 + 1.0, t0 + 1.4)));
  });
  // 失效
  if (inv) {
    const a = fade(lt, tInv);
    if (lt < tInv + 3) { pill('Old copy invalidated', NA[0] + 120, 560, RED, a * (1 - P(lt, tInv + 2.6, tInv + 3))); }
    else pill('Hash in filename: new URL, new version', 1360, 640, GOOD, fade(lt, tInv + 3));
  }
  // 延迟卡
  const fast = lt >= tHit + 0.6;
  statCard(110, 740, 640, fast ? 'Hit: served from the edge (illustrative)' : 'First request: back to origin (illustrative)', fast ? '~20 ms' : '~180 ms', { color: fast ? GOOD : RED, a: fade(lt, tMiss) });
  tri(0, 'Flow', 'Nearest node; origin on a miss', fade(lt, tR1), { tc: CACHE });
  tri(1, 'Note', 'Expiry: not too long or short', fade(lt, tHit + 1), { tc: CACHE });
  tri(2, 'Purge', 'Invalidate old copies on update', fade(lt, tInv), { tc: RED });
}

// ───────── 场景 8：消息队列 ─────────
function sceneQueue(lt, d, sc) {
  header(lt, '08', 'Message Queue', QC, 'Slow work can wait');
  const tBurst = at(sc, 'A producer puts'), tPeak = at(sc, 'A spike piles'), tDup = at(sc, 'delivered twice');
  const PB = [830, 430, 160, 100], QX = 1040, QY = 430, SLOT = 50, C = [[1650, 340], [1650, 530]];
  box(PB[0], PB[1], PB[2], PB[3], 'Web', { color: WEB, sub: 'producer', size: 28, a: fade(lt, 0.4) });
  ctx.save(); ctx.globalAlpha *= fade(lt, 0.5);
  glass(QX, QY, 520, 100, { accent: QC }); for (let j = 0; j < 10; j++) { rr(QX + 485 - j * SLOT - 26, QY + 26, 40, 48, 10); ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5; ctx.stroke(); }
  text('Message queue', QX + 260, QY - 18, { size: 24, color: QC, align: 'center', weight: 700 });
  ctx.restore();
  C.forEach(([x, y], i) => box(x, y, 180, 100, `Consumer ${i + 1}`, { color: GOOD, size: 26, a: fade(lt, 0.6) }));
  arrow(QX + 520, 480, 1640, 480, { color: '#8f98b0', w: 2.5, a: 0.5 * fade(lt, 0.6), head: 10 });
  // 模拟
  const N = 14, e = [], arr = [], st = [], en = [], cs = [];
  const f = [0, 0];
  for (let k = 0; k < N; k++) {
    e[k] = tBurst + 0.2 + k * 0.22; arr[k] = e[k] + 0.55;
    const c = f[0] <= f[1] ? 0 : 1, s = Math.max(arr[k], f[c]);
    st[k] = s; f[c] = s + 1.15; cs[k] = c; en[k] = s + 0.5 + 0.8;
  }
  let depth = 0;
  const col = (k) => [SC[0], SC[1], SC[2], SC[3], QC][k % 5];
  for (let k = 0; k < N; k++) {
    if (lt < e[k] || lt > en[k] + 0.4) continue;
    let j = 0; for (let m = 0; m < k; m++) j += 1 - eIO(P(lt, st[m], st[m] + 0.3));
    const slotX = QX + 485 - j * SLOT - 6;
    let x, y = 480;
    const a = 1 - eOut(P(lt, en[k] - 0.1, en[k] + 0.4));
    if (lt < arr[k]) { const p = eOut(P(lt, e[k], arr[k])); x = lerp(PB[0] + PB[2] + 10, slotX, p); }
    else if (lt < st[k] + 0.3) x = slotX;
    else { const p = eIO(P(lt, st[k] + 0.3, st[k] + 0.8)); x = lerp(slotX, C[cs[k]][0] + 20, p); y = lerp(480, C[cs[k]][1] + 50 - (cs[k] ? 0 : 0), p); }
    dot(x, y, 15, col(k), { g: 14, a }); text(String(k + 1), x, y + 7, { size: 18, weight: 800, align: 'center', font: MONO, color: '#06080f', a });
    if (lt >= arr[k] && lt < st[k] + 0.3) depth++;
  }
  // 立即返回
  if (lt > tBurst) { text('Returns at once', PB[0] + 80, 580, { size: 22, color: GOOD, weight: 700, align: 'center', a: fade(lt, tBurst + 0.5) }); }
  statCard(110, 740, 640, 'Queue backlog (illustrative)', String(depth), { color: depth >= 6 ? CACHE : GOOD, a: fade(lt, tBurst), note: 'msgs' });
  if (lt > tPeak && lt < tPeak + 4) pill('Spikes wait in the queue', 1300, 330, QC, fade(lt, tPeak) * (1 - P(lt, tPeak + 3.4, tPeak + 4)));
  // 重复投递
  const steps = [['M9', QC], ['Processed ✓', GOOD], ['Ack lost ✗', RED], ['M9 resent', QC], ['Idempotent', GOOD]];
  steps.forEach(([s, c], i) => {
    const a = fade(lt, tDup - 0.3 + i * 0.5), x = 830 + i * 205;
    if (a <= 0) return;
    glass(x, 780, 175, 70, { r: 18, accent: c, a }); text(s, x + 87, 824, { size: 24, weight: 700, color: c, align: 'center', a });
    if (i < 4) arrow(x + 179, 815, x + 202, 815, { color: '#8f98b0', w: 3, a: a * 0.8, head: 9 });
  });
  tri(0, 'Fix', 'Enqueue now, handle later', fade(lt, tBurst), { tc: QC });
  tri(1, 'Gain', 'Consumers pull at their pace', fade(lt, tPeak), { tc: GOOD });
  tri(2, 'Cost', 'Duplicates: be idempotent', fade(lt, tDup), { tc: RED });
}

// ───────── 场景 9：多数据中心 ─────────
function sceneDC(lt, d, sc) {
  header(lt, '09', 'Data Centers', LBC, 'Nearest routing, failover');
  const tGeo = at(sc, 'GeoDNS sends'), tFail = at(sc, 'if one data center'), tRepl = at(sc, 'The cost is that data'), tDep = at(sc, 'every deployment');
  const tRec = tRepl - 0.4;
  const failed = lt >= tFail + 0.8 && lt < tRec;
  const DA = [830, 520, 350, 300], DB = [1470, 520, 350, 300];
  box(1195, 200, 250, 100, 'GeoDNS', { color: LBC, size: 30, a: fade(lt, 0.5) });
  person(900, 380, 'User A', { a: fade(lt, 0.4) }); person(1740, 380, 'User B', { a: fade(lt, 0.5) });
  const dc = (r, name, dead, a) => {
    ctx.save(); ctx.globalAlpha *= a;
    glass(r[0], r[1], r[2], r[3], { accent: dead ? RED : WEB, r: 24 });
    text(name, r[0] + 28, r[1] + 46, { size: 28, weight: 800, color: dead ? RED : INK });
    for (let i = 0; i < 2; i++) { glass(r[0] + 28 + i * 110, r[1] + 80, 96, 56, { r: 12, accent: WEB }); text('Web', r[0] + 76 + i * 110, r[1] + 116, { size: 24, weight: 700, color: WEB, align: 'center' }); }
    dbIcon(r[0] + 260, r[1] + 76, 66, 86, '', { color: dead ? RED : DBC });
    text('Cache · Database', r[0] + 28, r[1] + 200, { size: 22, color: MUTE });
    if (dead) text('Down', r[0] + r[2] - 28, r[1] + 46, { size: 26, weight: 800, color: RED, align: 'right' });
    ctx.restore();
  };
  dc(DA, 'Data center A', failed, fade(lt, 0.6)); dc(DB, 'Data center B', false, fade(lt, 0.7));
  // GeoDNS 解析 → 就近路由
  pk(lt, tGeo + 0.2, 0.8, [[935, 360], [1190, 270]], '#cfd6ff'); pk(lt, tGeo + 0.8, 0.8, [[1700, 360], [1450, 270]], '#cfd6ff');
  const rA = P(lt, tGeo + 1.4, tGeo + 2.2), rB = P(lt, tGeo + 1.8, tGeo + 2.6);
  const toB = failed || (lt >= tFail + 0.8 && lt < tRec + 0.0);
  arrow(912, 470, 1000, 515, { color: toB ? DIM : GOOD, w: 4, p: eOut(rA), a: toB ? 0.4 : 0.95 });
  arrow(1728, 470, 1650, 515, { color: GOOD, w: 4, p: eOut(rB), a: 0.95 });
  if (lt >= tFail + 0.8 && lt < tRec) {
    const p = eOut(P(lt, tFail + 1.0, tFail + 2.0));
    const pts = [[945, 400], [1320, 450], [1570, 515]];
    ctx.save(); ctx.strokeStyle = CACHE; ctx.fillStyle = CACHE; ctx.lineWidth = 4; ctx.setLineDash([12, 8]); glow(CACHE, 10);
    ctx.beginPath(); ctx.moveTo(...pts[0]); const [mx, my] = along(pts, 0.5 * p + 0.0); ctx.lineTo(...pts[1]); ctx.lineTo(...(p < 1 ? along(pts, p) : pts[2])); ctx.stroke(); ctx.restore();
    pill('Rerouted to DC B', 1320, 420, CACHE, fade(lt, tFail + 1.4));
    for (let k = 0; k < 6; k++) pk(lt, tFail + 2.0 + k * 0.7, 1.4, pts, CACHE, { r: 7 });
  }
  // 复制
  const replOn = lt >= tGeo + 2.4;
  const ra = replOn ? (lt < tFail + 0.8 || lt >= tRec ? 1 : 0.2) : 0;
  arrow(1185, 640, 1465, 640, { color: '#8f98b0', w: 3, a: 0.6 * ra, dash: [8, 8], head: 12 });
  arrow(1465, 690, 1185, 690, { color: '#8f98b0', w: 3, a: 0.6 * ra, dash: [8, 8], head: 12 });
  text('Data replication', 1325, 625, { size: 24, weight: 700, color: lt >= tRepl ? CACHE : MUTE, align: 'center', a: fade(lt, tGeo + 2.4) });
  if (ra > 0.5) for (let k = 0; k < 14; k++) {
    const t0 = tGeo + 2.6 + k * 0.9; if (t0 > tFail || (t0 > tRec - 0.2 ? false : false)) { if (t0 < tRec) continue; }
    const dir = k % 2;
    pk(lt, t0, 1.0, dir ? [[1465, 690], [1185, 690]] : [[1185, 640], [1465, 640]], dir ? DBC : DBC, { r: 6, a: 0.9 });
  }
  if (lt >= tRec) pill('Recovered', DA[0] + DA[2] / 2, 490, GOOD, fade(lt, tRec) * (1 - P(lt, tRec + 2, tRec + 2.5)));
  if (lt >= tDep) { ['A', 'B'].forEach((n, i) => pill('Deploys in sync', (i ? DB[0] : DA[0]) + 175, 868, GOOD, fade(lt, tDep + i * 0.3))); }
  tri(0, 'Nearest', 'GeoDNS: route to nearest DC', fade(lt, tGeo), { tc: LBC });
  tri(1, 'Failover', 'One DC fails: traffic moves', fade(lt, tFail), { tc: GOOD });
  tri(2, 'Cost', 'Data replicated between DCs', fade(lt, tRepl), { tc: CACHE });
  tri(3, 'Cost', 'Consistent deployments', fade(lt, tDep), { tc: CACHE });
}

// ───────── 场景 10：分片 ─────────
const SH_ID = [3, 11, 7, 20, 14, 5, 9, 26, 18, 1, 22, 13, 30, 8, 17, 25];
const shardOf = (i) => Math.floor(hash32('u' + SH_ID[i]) / 25) % 4;
function sceneShard(lt, d, sc) {
  header(lt, '10', 'Sharding', DBC, 'The last mile of the data tier');
  const tKey = at(sc, 'we split data across'), tEven = at(sc, 'The key should spread'), tRe = at(sc, 'resharding'), tCel = at(sc, 'celebrity hotspots'), tJoin = at(sc, 'joins across shards');
  const SX = (i) => 1010 + i * 165, SY = 540, IW = 125, IH = 170;
  // 单库阶段
  const one = 1 - eOut(P(lt, tKey, tKey + 0.6));
  if (one > 0) dbIcon(1250, 440, 200, 260, 'One DB', { color: RED, fill: lerp(0.3, 1, P(lt, 0.8, tKey - 0.3)), a: fade(lt, 0.6) * one });
  if (one > 0) pill('Scale-up has a limit', 1350, 400, RED, fade(lt, 2.0) * one);
  // 路由器
  const ra = fade(lt, tKey);
  ctx.save(); ctx.globalAlpha *= ra;
  box(1130, 230, 400, 90, 'user_id → shard', { color: LBC, size: 28, a: 1 });
  ctx.restore();
  // 分片与填充
  const counts = [0, 0, 0, 0];
  const stream = [];
  SH_ID.forEach((id, i) => { stream.push({ i, t: tKey + 0.7 + i * 0.34, s: shardOf(i) }); });
  stream.forEach((c) => { if (lt >= c.t + 0.9) counts[c.s]++; });
  const maxC = Math.max(...counts, 1);
  const mig = eIO(P(lt, tRe + 0.8, tRe + 2.2));
  const cel = eOut(P(lt, tCel + 1.2, tCel + 4));
  const fills = [0, 1, 2, 3].map((s) => 0.15 + counts[s] * 0.1);
  fills[3] = fills[3] * lerp(1, 0.5, mig);
  const f4 = 0.15 + counts[3] * 0.1 * 0.5 * mig;
  fills[1] = lerp(fills[1], 1, cel);
  for (let i = 0; i < 5; i++) {
    const a = i < 4 ? ra : fade(lt, tRe);
    if (a <= 0) continue;
    const fv = i < 4 ? fills[i] : f4, hot = i === 1 && cel > 0.8;
    if (i === 4 && mig <= 0) { ctx.save(); ctx.globalAlpha *= a * 0.6; ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; rr(SX(4), SY, IW, IH, 30); ctx.stroke(); ctx.restore(); text('New shard', SX(4) + IW / 2, SY + IH + 34, { size: 24, color: MUTE, align: 'center', a: a * 0.8 }); continue; }
    dbIcon(SX(i), SY, IW, IH, `Shard ${i}`, { color: hot ? RED : DBC, fill: clamp(fv), a });
  }
  if (lt > tRe && lt < tRe + 3.2) { arrow(SX(3) + IW + 4, SY + IH / 2, SX(4) - 6, SY + IH / 2, { color: GOOD, w: 4, p: eOut(P(lt, tRe + 0.6, tRe + 1.4)), a: 1 - P(lt, tRe + 2.6, tRe + 3.2) }); pill('Moving data', SX(4) - 40, SY - 40, GOOD, fade(lt, tRe + 0.4) * (1 - P(lt, tRe + 2.6, tRe + 3.2))); }
  // 用户 id 小球落入分片
  stream.forEach((c) => {
    const p = P(lt, c.t, c.t + 0.9); if (p <= 0 || p >= 1) return;
    const x = lerp(1330, SX(c.s) + IW / 2, eIO(p)), y = lerp(320, SY + IH * 0.5, eIO(p));
    dot(x, y, 15, [SC[0], SC[1], SC[2], SC[3]][c.s], { g: 14 });
    text(String(SH_ID[c.i]), x, y + 7, { size: 15, weight: 800, font: MONO, align: 'center', color: '#06080f' });
  });
  if (lt > tEven + 0.5 && lt < tRe) pill('A good key spreads data evenly', 1330, 850, GOOD, fade(lt, tEven + 0.5));
  // 名人
  if (lt > tCel) {
    const a = fade(lt, tCel);
    dot(1330, 380, 22, CACHE, { g: 24, a }); text('★', 1330, 389, { size: 26, align: 'center', weight: 800, color: '#06080f', a });
    text('Celebrity', 1330 + 40, 387, { size: 22, color: CACHE, weight: 700, a });
    for (let k = 0; k < 40; k++) {
      const u = (lt * 1.1 + k / 40) % 1, x = lerp(1330, SX(1) + IW / 2, eIO(u)), y = lerp(380, SY + 40, eIO(u));
      dot(x + Math.sin(k * 3) * 6, y, 4, RED, { g: 8, a: a * Math.sin(u * Math.PI) * 0.9 });
    }
    pill('Hotspot: one user_id, one shard', 1220, 850, RED, fade(lt, tCel + 2.2) * (1 - P(lt, tJoin - 0.2, tJoin + 0.3)));
  }
  // 跨分片 JOIN
  if (lt > tJoin) {
    const a = fade(lt, tJoin);
    [0, 2].forEach((s, i) => arrow(SX(s) + IW / 2, 760, 1230 + i * 100, 792, { color: '#8f98b0', w: 3, a: 0.8 * a, p: eOut(P(lt, tJoin + i * 0.3, tJoin + 0.9 + i * 0.3)) }));
    glass(1130, 795, 300, 70, { accent: RED, a }); text('JOIN ？', 1280, 840, { size: 30, weight: 800, color: RED, align: 'center', a });
    text('Different servers: hard', 1460, 840, { size: 24, color: MUTE, a });
  }
  tri(0, 'Limit', 'One DB can only scale up so far', fade(lt, 0.9), { tc: RED, step: 95 });
  tri(1, 'Fix', 'Split into shards by key', fade(lt, tKey), { tc: GOOD, step: 95 });
  tri(2, 'Issue', 'Resharding', fade(lt, tRe), { tc: CACHE, step: 95 });
  tri(3, 'Issue', 'Celebrity hotspots', fade(lt, tCel), { tc: CACHE, step: 95 });
  tri(4, 'Issue', 'Cross-shard JOINs', fade(lt, tJoin), { tc: CACHE, step: 95 });
}

// ───────── 总结 ─────────
function sceneEnd(lt, d, sc) {
  text('Scaling from Zero to Millions', 110, 250, { size: 80, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Chapter 1 recap', 112, 304, { size: 32, color: MUTE, a: eOut(P(lt, 0.4, 1.1)) });
  const cards = [['Stateless + Redundancy', 'Stateless web, backups everywhere', SC[1]], ['Cache + CDN', 'Shield the DB from read load', SC[3]], ['Sharding + Decoupling', 'Split data, decouple with queues', SC[0]]];
  const t0s = [at(sc, 'stateless plus'), at(sc, 'cache plus'), at(sc, 'sharding plus')];
  cards.forEach(([w, s, c], k) => {
    const p = eBack(P(lt, t0s[k] - 0.3, t0s[k] + 0.4)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 590;
    glass(x, 400, 550, 240, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 400, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 460, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    { ctx.save(); let fs = 54; ctx.font = `800 ${fs}px ${SANS}`; while (ctx.measureText(w).width > 480 && fs > 30) { fs -= 2; ctx.font = `800 ${fs}px ${SANS}`; } ctx.restore(); text(w, x + 36, 546, { size: fs, weight: 800 }); }
    text(s, x + 36, 598, { size: 26, color: MUTE });
    ctx.restore();
  });
  const a = fade(lt, at(sc, 'Before adding any layer'), 0.8);
  text('Before adding any layer', 110, 740, { size: 24, color: MUTE, a });
  let x = 110;
  [['Find the bottleneck', RED], ['Add a capability', GOOD], ['Think through new problems', CACHE]].forEach(([s, c], i) => {
    x += badge(x, 770, s, c, fade(lt, at(sc, 'Before adding any layer') + i * 0.5, 0.6)) + 16;
    if (i < 2) { arrow(x - 12, 796, x + 20, 796, { color: '#8f98b0', w: 3, a: fade(lt, at(sc, 'Before adding any layer') + i * 0.5 + 0.3), head: 9 }); x += 36; }
  });
  text('Where the bottleneck appears decides the next layer to add', 110, 880, { size: 22, color: DIM, a: fade(lt, at(sc, 'ask where the bottleneck') + 1, 0.8) });
}

export const scenes = { title: sceneTitle, single: sceneSingle, vertical: sceneVertical, lb: sceneLB, stateless: sceneStateless, replica: sceneReplica, cache: sceneCache, cdn: sceneCDN, queue: sceneQueue, dc: sceneDC, shard: sceneShard, end: sceneEnd };
