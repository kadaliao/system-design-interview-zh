// 第 12 章 聊天系统：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet, hbar } from '../lib/core.js';

export const meta = { no: 12, title: '聊天系统', en: 'Chat System' };

// 角色配色（全片统一）
const COL = { client: '#9aa6d6', chat: SC[1], kv: SC[0], msg: SC[2], pres: SC[4], noti: SC[3], api: '#8f98b0' };

// ───────── 通用小组件 ─────────
/** 以 (x,y) 为中心的消息小方块 */
function chipMsg(x, y, label, { a = 1, color = COL.msg, s = 1 } = {}) {
  if (a <= 0 || s <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(s, s);
  glow(color, 16); rr(-42, -19, 84, 38, 11); ctx.fillStyle = '#10142a'; ctx.fill();
  ctx.fillStyle = color + '40'; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = color; ctx.stroke(); ctx.shadowBlur = 0;
  text(label, 0, 7, { size: 20, weight: 800, align: 'center', font: MONO });
  ctx.restore();
}
/** 沿直线移动的消息块，p∈(0,1) 才画 */
function flyChip(x1, y1, x2, y2, p, label, color = COL.msg) {
  if (p <= 0 || p >= 1) return;
  const q = eIO(p);
  chipMsg(lerp(x1, x2, q), lerp(y1, y2, q), label, { color });
}
function pulse(x, y, r0, t, color, grow = 60) {
  if (t <= 0 || t >= 1) return;
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = 1 - t; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.arc(x, y, r0 + t * grow, 0, 7); ctx.stroke(); ctx.restore();
}
function rectPulse(x, y, w, h, t, color) {
  if (t <= 0 || t >= 1) return;
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = (1 - t) * 0.9; ctx.lineWidth = 4; glow(color, 18);
  rr(x - t * 12, y - t * 12, w + t * 24, h + t * 24, 24 + t * 8); ctx.stroke(); ctx.restore();
}
function line(x1, y1, x2, y2, color = 'rgba(255,255,255,0.12)', w = 2, dash = null) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function tag(x, y, s, color, a = 1, size = 22, align = 'left') { text(s, x, y, { size, weight: 700, color, a, align }); }

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  text('系统设计面试 · 动画讲解', 110, 400, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 150px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('聊天系统', 104, 560); ctx.restore();
  text('Chat System', 112, 630, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 12 章', 112, 720, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
  // 右侧：来回的聊天气泡
  const bub = [[1000, 300, 560, 'A', SC[0], 1.6], [1180, 450, 560, 'B', SC[2], 2.6], [1000, 600, 560, 'A', SC[0], 3.6], [1180, 750, 560, 'B', SC[2], 4.6]];
  bub.forEach(([x, y, w, who, c, t0], i) => {
    const p = eBack(P(lt, t0, t0 + 0.6)), al = clamp(p * 2);
    if (al <= 0) return;
    const bx = x + 140 * (who === 'A' ? 0 : 0), bw = 480 - (i % 2) * 90;
    ctx.save(); ctx.globalAlpha *= al; ctx.translate(bx + (who === 'B' ? 220 : 0), y); ctx.scale(clamp(p, 0, 1.05), clamp(p, 0, 1.05));
    glass(0, -50, bw, 100, { r: 36, accent: c });
    for (let k = 0; k < 3; k++) { const w2 = k === 0 ? bw - 150 : k === 1 ? bw - 220 : 0; if (w2 > 0) { rr(40, -22 + k * 26, w2, 12, 6); ctx.fillStyle = c + '66'; ctx.fill(); } }
    ctx.restore();
    const typing = P(lt, t0 - 0.8, t0);
    if (typing > 0 && typing < 1) for (let k = 0; k < 3; k++) dot(bx + (who === 'B' ? 260 : 40) + k * 26, y, 7, c, { g: 8, a: 0.4 + 0.6 * Math.max(0, Math.sin(lt * 8 - k)) });
  });
}

// ───────── 场景 1：轮询 / 长轮询 ─────────
const LX0 = 830, LX1 = 1640, REQY = -18, RESY = 22;
function laneFrame(cy, title, color, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  tag(830, cy - 82, title, color, 1, 28);
  line(1010, cy + REQY, 1630, cy + REQY); line(1010, cy + RESY, 1630, cy + RESY);
  box(LX0, cy - 50, 170, 100, '客户端', { color: COL.client });
  box(LX1, cy - 50, 170, 100, '服务器', { color: COL.chat });
  ctx.restore();
}
function reqP(cy, p, label = '请求', color = '#8f98b0') { flyChip(1010, cy + REQY, 1630, cy + REQY, p, label, color); }
function resP(cy, p, label, color) { flyChip(1630, cy + RESY, 1010, cy + RESY, p, label, color); }
function scenePoll(lt) {
  header(lt, '01', '轮询与长轮询', SC[3], '服务器怎么把消息交出去');
  const c1 = 390, c2 = 720;
  const dim = 1 - 0.55 * eOut(P(lt, 11, 11.8));
  // 轮询泳道
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 0.3, 1)) * dim;
  laneFrame(c1, '轮询：隔一会儿问一次', SC[3]);
  ctx.restore();
  let empties = 0;
  ctx.save(); ctx.globalAlpha *= dim;
  for (let k = 0; k < 6; k++) {
    const t = 1.6 + k * 1.5, last = k === 5;
    reqP(c1, P(lt, t, t + 0.55), '问');
    if (!last) { resP(c1, P(lt, t + 0.6, t + 1.15), '空', '#6b7490'); if (lt > t + 1.15) empties++; if (lt > t + 0.55 && lt < t + 0.65) pulse(LX1 + 85, c1, 60, P(lt, t + 0.55, t + 0.65), '#6b7490', 20); }
    else resP(c1, P(lt, t + 0.6, t + 1.15), '新消息', COL.msg);
  }
  const mp = eBack(P(lt, 8.5, 9.1)); // 服务器上到达的新消息
  if (lt > 8.5 && lt < 9.7) chipMsg(LX1 + 85, c1 + 84, '新消息', { s: mp, a: lt < 9.6 ? 1 : 0 });
  if (lt > 9.7) chipMsg(LX0 + 85, c1 + 84, '收到', { color: SC[4], a: eOut(P(lt, 9.7, 10.2)) });
  ctx.restore();
  // 长轮询泳道
  const a2 = eOut(P(lt, 10.8, 11.5));
  if (a2 > 0) {
    ctx.save(); ctx.globalAlpha *= a2;
    laneFrame(c2, '长轮询：请求挂着等', SC[0]);
    const hang = (t0, t1, col) => { // 挂起：虚线流动 + 提示
      if (lt < t0 || lt > t1) return;
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineCap = 'round'; glow(col, 14); ctx.setLineDash([16, 14]); ctx.lineDashOffset = -lt * 70;
      ctx.beginPath(); ctx.moveTo(1010, c2 + REQY); ctx.lineTo(1630, c2 + REQY); ctx.stroke(); ctx.restore();
      text('挂起等待…', 1320, c2 - 42, { size: 24, weight: 700, color: col, align: 'center', a: 0.55 + 0.45 * Math.sin(lt * 4) ** 2 });
    };
    reqP(c2, P(lt, 11.3, 11.9), '请求', SC[0]);
    hang(11.9, 13.9, SC[0]);
    if (lt > 13.8) chipMsg(LX1 + 85, c2 + 84, '新消息', { s: eBack(P(lt, 13.8, 14.4)), a: lt < 14.6 ? 1 : 0 });
    resP(c2, P(lt, 14.0, 14.7), '新消息', COL.msg);
    if (lt > 14.7) chipMsg(LX0 + 85, c2 + 84, '收到', { color: SC[4], a: eOut(P(lt, 14.7, 15.2)) });
    reqP(c2, P(lt, 16.3, 16.9), '再请求', SC[0]);
    hang(16.9, 99, SC[0]);
    ctx.restore();
  }
  bullet(0, '客户端定时询问', eOut(P(lt, 1.2, 1.8)));
  bullet(1, '多数是空响应，浪费', eOut(P(lt, 6.0, 6.6)));
  bullet(2, '长轮询：挂起到有消息', eOut(P(lt, 11.2, 11.8)));
  bullet(3, '返回后要重新发起', eOut(P(lt, 16.4, 17)));
  const sa = eOut(P(lt, 3.0, 3.7));
  statCard(110, 730, 640, '空响应次数', String(empties), { color: '#8f98b0', a: sa, note: '白白占用请求' });
}

// ───────── 场景 2：WebSocket ─────────
function sceneWs(lt) {
  header(lt, '02', 'WebSocket', SC[1], '一条双向持久连接');
  const cy = 330;
  box(830, cy - 55, 180, 110, '客户端', { color: COL.client, a: eOut(P(lt, 0.3, 0.9)) });
  box(1630, cy - 55, 180, 110, '服务器', { color: COL.chat, a: eOut(P(lt, 0.3, 0.9)) });
  const x0 = 1020, x1 = 1620;
  line(x0, cy, x1, cy, 'rgba(255,255,255,0.1)', 2, [4, 8]);
  // 握手
  flyChip(x0, cy - 12, x1, cy - 12, P(lt, 4.2, 4.9), '握手', COL.api);
  flyChip(x1, cy + 12, x0, cy + 12, P(lt, 5.0, 5.7), '确认', COL.api);
  const tube = eOut(P(lt, 5.6, 6.6));
  if (tube > 0) {
    ctx.save(); const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, COL.client); g.addColorStop(1, COL.chat);
    ctx.globalAlpha *= tube; ctx.strokeStyle = g; ctx.lineWidth = 16; ctx.lineCap = 'round'; glow(COL.chat, 22);
    ctx.beginPath(); ctx.moveTo(x0, cy); ctx.lineTo(lerp(x0, x1, tube), cy); ctx.stroke(); ctx.restore();
    text('ws 持久连接 · 双向', (x0 + x1) / 2, cy - 44, { size: 26, weight: 700, color: INK, align: 'center', a: tube });
  }
  // 双向收发
  const tp = (t0, dir, label, col) => { const p = P(lt, t0, t0 + 0.9); if (p <= 0 || p >= 1) return; const q = eIO(p); const x = dir > 0 ? lerp(x0 + 30, x1 - 30, q) : lerp(x1 - 30, x0 + 30, q); chipMsg(x, cy, label, { color: col }); };
  tp(8.2, 1, '发', SC[0]); tp(9.4, -1, '收', COL.msg);
  tp(11.2, -1, '推送', COL.msg); tp(12.6, -1, '推送', COL.msg); tp(14.0, 1, '发', SC[0]);
  if (lt > 11.2) text('服务器主动推，不用再问', 1320, cy + 82, { size: 24, color: COL.msg, weight: 700, align: 'center', a: eOut(P(lt, 11.4, 12)) });
  // 三种方式对比
  const cards = [['轮询', '客户端主动问', '多是空响应', COL.api], ['长轮询', '请求挂起等待', '返回后要重连', SC[0]], ['WebSocket', '双向持久连接', '服务器可主动推', COL.chat]];
  cards.forEach(([t, l1, l2, c], i) => {
    const x = 830 + i * 340, a = eOut(P(lt, 1.0 + i * 0.3, 1.8 + i * 0.3));
    const on = i === 2, fade = on ? 1 : 1 - 0.5 * eOut(P(lt, 14.5, 15.3));
    ctx.save(); ctx.globalAlpha *= a * fade; ctx.translate(0, (1 - a) * 20);
    glass(x, 560, 320, 230, { accent: c, r: 26 });
    ctx.fillStyle = c; glow(c, 14); rr(x + 28, 560, 70, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(t, x + 28, 626, { size: 38, weight: 800 });
    text(l1, x + 28, 690, { size: 26, color: INK });
    text(l2, x + 28, 736, { size: 26, color: MUTE });
    ctx.restore();
    if (on) rectPulse(x, 560, 320, 230, P(lt, 15, 16), c);
  });
  bullet(0, '建立后双向通信', eOut(P(lt, 8.0, 8.6)));
  bullet(1, '服务器可主动推送', eOut(P(lt, 11.0, 11.6)));
  bullet(2, '收、发都用 ws', eOut(P(lt, 15.2, 15.8)));
  statCard(110, 640, 640, '本设计的通道', 'WebSocket', { color: COL.chat, a: eOut(P(lt, 15.4, 16.2)), note: '生产常用 wss' });
}

// ───────── 场景 3：整体架构 ─────────
function sceneArch(lt) {
  header(lt, '03', '整体架构', SC[1], '无状态 + 有状态');
  const cl = { x: 820, y: 470, w: 160, h: 110 }, chat = { x: 1110, y: 290, w: 250, h: 120 }, api = { x: 1110, y: 690, w: 250, h: 110 };
  box(cl.x, cl.y, cl.w, cl.h, '客户端', { color: COL.client, a: eOut(P(lt, 0.8, 1.4)) });
  // API + 服务发现
  const aa = eBack(P(lt, 3.6, 4.4));
  box(api.x, api.y, api.w, api.h, 'API 服务', { color: COL.api, sub: '登录·注册·资料', a: clamp(aa * 2), s: clamp(aa, 0, 1.02), size: 30 });
  arrow(cl.x + 100, cl.y + cl.h, api.x, api.y + 40, { color: COL.api, dash: [10, 8], p: eOut(P(lt, 4.4, 5.2)) });
  tag(840, 690, 'HTTP', COL.api, eOut(P(lt, 5, 5.6)), 22);
  if (lt > 4.4) flyChip(cl.x + 100, cl.y + cl.h + 8, api.x - 20, api.y + 40, P(lt, 5.4, 6.4), '登录', COL.api);
  const disc = eOut(P(lt, 8.4, 9.4));
  arrow(api.x + 125, api.y, api.x + 125, chat.y + chat.h + 12, { color: SC[3], dash: [10, 8], p: disc, g: 8 });
  text('服务发现', api.x + 142, 590, { size: 24, weight: 700, color: SC[3], a: disc });
  text('推荐一台聊天服务器', api.x + 142, 624, { size: 22, color: MUTE, a: disc });
  // 聊天服务器
  const ca = eBack(P(lt, 12.0, 12.8));
  box(chat.x, chat.y, chat.w, chat.h, '聊天服务器', { color: COL.chat, sub: '有状态 · 持有连接', a: clamp(ca * 2), s: clamp(ca, 0, 1.02), size: 32 });
  const wsp = eOut(P(lt, 13.4, 14.4));
  if (wsp > 0) {
    ctx.save(); const wp = wsp; ctx.strokeStyle = COL.chat; ctx.lineWidth = 12; ctx.lineCap = 'round'; glow(COL.chat, 18);
    ctx.beginPath(); ctx.moveTo(cl.x + cl.w, cl.y + 40); ctx.lineTo(lerp(cl.x + cl.w, chat.x, wp), lerp(cl.y + 40, chat.y + 70, wp)); ctx.stroke(); ctx.restore();
    text('WebSocket', 960, 380, { size: 24, weight: 700, color: COL.chat, align: 'center', a: wsp });
    text('长连接', 960, 410, { size: 22, color: MUTE, align: 'center', a: wsp });
  }
  // 其它服务
  const pa = eBack(P(lt, 18.6, 19.4)), ka = eBack(P(lt, 20.4, 21.2)), na = eBack(P(lt, 22.2, 23.0));
  box(1520, 190, 280, 100, '在线状态服务', { color: COL.pres, a: clamp(pa * 2), s: clamp(pa, 0, 1.02), size: 30 });
  dbIcon(1600, 370, 120, 110, 'KV 存储', { color: COL.kv, a: clamp(ka * 2) });
  box(1520, 600, 280, 100, '通知服务', { color: COL.noti, a: clamp(na * 2), s: clamp(na, 0, 1.02), size: 30 });
  arrow(chat.x + chat.w, chat.y + 30, 1510, 245, { color: COL.pres, p: eOut(P(lt, 19, 19.8)) });
  arrow(chat.x + chat.w, chat.y + 80, 1585, 428, { color: COL.kv, p: eOut(P(lt, 20.8, 21.6)) });
  text('聊天历史', 1745, 432, { size: 22, color: MUTE, a: eOut(P(lt, 21.4, 22)) });
  arrow(chat.x + chat.w - 20, chat.y + chat.h, 1510, 640, { color: COL.noti, p: eOut(P(lt, 22.6, 23.4)) });
  bullet(0, '无状态：登录·注册·资料', eOut(P(lt, 4, 4.6)));
  bullet(1, '有状态：持有 ws 连接', eOut(P(lt, 12.2, 12.8)));
  bullet(2, '另有：在线状态·通知·KV', eOut(P(lt, 18.4, 19)));
  statCard(110, 700, 640, '聊天历史存在', '键值存储', { color: COL.kv, a: eOut(P(lt, 21, 21.8)), note: '易水平扩展' });
}

// ───────── 场景 4：一对一消息流 ─────────
function sceneFlow(lt) {
  header(lt, '04', '一对一消息', COL.msg, '从发送到送达');
  const A = { x: 810, y: 520, w: 150, h: 100 }, C1 = { x: 1020, y: 520, w: 200, h: 100 }, C2 = { x: 1340, y: 520, w: 200, h: 100 }, B = { x: 1650, y: 520, w: 170, h: 100 };
  const N = { x: 1340, y: 270, w: 200, h: 100 }, KVp = { x: 1075, y: 740, w: 110, h: 100 };
  const off = eOut(P(lt, 16.6, 17.3));
  box(A.x, A.y, A.w, A.h, '用户 A', { color: COL.client });
  box(C1.x, C1.y, C1.w, C1.h, '聊天服务 1', { color: COL.chat, size: 26 });
  box(C2.x, C2.y, C2.w, C2.h, '聊天服务 2', { color: COL.chat, size: 26, a: 1 - 0.55 * off });
  box(B.x, B.y, B.w, B.h, '用户 B', { color: COL.client, a: 1 - 0.55 * off });
  box(N.x, N.y, N.w, N.h, '通知服务', { color: COL.noti, size: 28, a: 0.35 + 0.65 * off });
  dbIcon(KVp.x, KVp.y, KVp.w, KVp.h, 'KV 存储', { color: COL.kv, fill: 0.25 + 0.2 * eOut(P(lt, 9.0, 9.8)) });
  // 路径底线
  [[A.x + A.w, 570, C1.x, 570], [C1.x + C1.w, 570, C2.x, 570], [C2.x + C2.w, 570, B.x, 570]].forEach((s) => line(...s));
  line(1130, 620, 1130, 735); line(1200, 520, 1370, 372, 'rgba(255,255,255,0.1)'); line(1540, 330, 1710, 518, 'rgba(255,255,255,0.1)');
  // B 状态
  const online = lt < 16.6;
  dot(B.x + 30, B.y + 142, 9, online ? COL.pres : DIM, { g: online ? 14 : 0 });
  text(online ? '在线' : '离线', B.x + 52, B.y + 150, { size: 24, weight: 700, color: online ? COL.pres : MUTE, a: eOut(P(lt, 10.2, 10.8)) + (lt > 16.6 ? 1 : 0) });
  // ① A → 服务 1
  flyChip(A.x + A.w - 10, 570, C1.x + 14, 570, P(lt, 2.6, 3.5), '消息');
  const arr1 = P(lt, 3.5, 4.1); pulse(C1.x + 100, 570, 60, arr1, COL.chat, 30);
  // ② 分配 ID
  const ida = eBack(P(lt, 5.8, 6.6));
  if (ida > 0) { ctx.save(); ctx.translate(0, (1 - clamp(ida)) * 10); badge(C1.x - 20, 438, 'ID 1042 · 示意', SC[3], clamp(ida * 2)); ctx.restore(); }
  // 写入 KV
  flyChip(1130, 624, 1130, 730, P(lt, 8.8, 9.6), '写入', COL.kv);
  rectPulse(KVp.x, KVp.y, KVp.w, KVp.h, P(lt, 9.6, 10.2), COL.kv);
  // ③ 在线路径
  flyChip(C1.x + C1.w - 10, 570, C2.x + 14, 570, P(lt, 12.2, 13.2), '#1042');
  pulse(C2.x + 100, 570, 60, P(lt, 13.2, 13.8), COL.chat, 30);
  flyChip(C2.x + C2.w - 10, 570, B.x + 14, 570, P(lt, 15.0, 15.9), '#1042');
  if (lt > 15.9 && lt < 16.9) { chipMsg(B.x + 85, B.y - 40, '送达', { color: SC[4], a: eOut(P(lt, 15.9, 16.3)) * (1 - eOut(P(lt, 16.5, 16.9))) }); }
  // ④ 离线路径
  flyChip(C1.x + 120, 520, N.x + 40, 372, P(lt, 17.6, 18.5), '#1042', COL.noti);
  flyChip(N.x + C2.w - 20, 330, B.x + 60, 515, P(lt, 18.7, 19.6), '推送', COL.noti);
  if (lt > 19.6) chipMsg(B.x + 85, B.y - 40, '提醒', { color: COL.noti, a: eOut(P(lt, 19.6, 20)) });
  bullet(0, '发给聊天服务 1', eOut(P(lt, 2.4, 3.0)));
  bullet(1, '分配 ID，写入 KV', eOut(P(lt, 5.6, 6.2)));
  bullet(2, '在线：转服务 2 → B', eOut(P(lt, 11.2, 11.8)));
  bullet(3, '离线：推送通知', eOut(P(lt, 17, 17.6)), { color: COL.noti });
}

// ───────── 场景 5：消息 ID 与顺序 ─────────
function sceneOrder(lt) {
  header(lt, '05', '消息顺序', SC[3], 'ID 唯一，还要能排序');
  const arrive = [[102, 1], [101, 0], [103, 2]]; // 到达顺序：id, 发送序
  const sorted = [101, 102, 103];
  tag(830, 196, '到达服务器的顺序', MUTE, eOut(P(lt, 0.8, 1.4)), 24);
  tag(830, 396, '按消息 ID 排序后', MUTE, eOut(P(lt, 2.8, 3.4)), 24);
  line(830, 410, 1560, 410, 'rgba(255,255,255,0.08)');
  arrive.forEach(([id, send], i) => {
    const t0 = 0.9 + i * 0.5, al = eBack(P(lt, t0, t0 + 0.5));
    const slot = sorted.indexOf(id), mv = eIO(P(lt, 3.0, 4.4));
    const x = lerp(900 + i * 190, 900 + slot * 190, mv), y = lerp(260, 470, mv);
    chipMsg(x, y, `#${id}`, { a: clamp(al * 2), s: clamp(al, 0, 1.05), color: mv > 0.5 ? SC[4] : COL.msg });
  });
  text('示意', 1600, 200, { size: 20, color: DIM, a: eOut(P(lt, 1, 1.6)) });
  const q = eOut(P(lt, 4.6, 5.3)); if (q > 0) text('先发的 #101 晚到了 → 按 ID 摆回去', 830, 560, { size: 24, color: SC[4], weight: 600, a: q });
  // 下半区：雪花 → 会话内序号
  const f1 = eOut(P(lt, 8.0, 8.8)) * (1 - eOut(P(lt, 13.4, 14.0)));
  if (f1 > 0) {
    ctx.save(); ctx.globalAlpha *= f1;
    glass(830, 620, 980, 270, { accent: SC[3], r: 26 });
    tag(862, 668, '全局 64 位序号（如雪花）', SC[3], 1, 26);
    chipMsg(960, 770, '先发 #205', { color: SC[3] }); ctx.restore();
    ctx.save(); ctx.globalAlpha *= f1;
    chipMsg(1270, 770, '后发 #204', { color: RED, a: eOut(P(lt, 9.4, 10)) });
    text('时钟漂移：后发的 ID 反而更小', 862, 850, { size: 26, weight: 700, color: RED, a: eOut(P(lt, 10, 10.8)) });
    text('→ 只是近似有序', 1330, 668, { size: 24, color: MUTE, a: eOut(P(lt, 10.6, 11.4)) });
    ctx.restore();
  }
  const f2 = eOut(P(lt, 14.2, 15));
  if (f2 > 0) {
    ctx.save(); ctx.globalAlpha *= f2;
    glass(830, 620, 980, 270, { accent: SC[4], r: 26 });
    tag(862, 668, '会话内序号：每个会话自己计数', SC[4], 1, 26);
    const rowsC = [['单聊 A–B', 3, SC[0]], ['群 研发', 4, SC[1]], ['群 家人', 2, SC[2]]];
    rowsC.forEach(([nm, n, c], r) => {
      const y = 726 + r * 52;
      text(nm, 862, y + 9, { size: 24, color: c, weight: 700 });
      for (let k = 0; k < n; k++) { const a = eBack(P(lt, 15.0 + r * 0.5 + k * 0.25, 15.5 + r * 0.5 + k * 0.25)); if (a > 0) { const cx = 1110 + k * 100; ctx.save(); ctx.translate(cx, y); ctx.scale(clamp(a, 0, 1.05), clamp(a, 0, 1.05)); rr(-38, -19, 76, 38, 11); ctx.fillStyle = c + '30'; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 2.5; ctx.stroke(); text(String(k + 1), 0, 7, { size: 22, weight: 800, align: 'center', font: MONO }); ctx.restore(); } }
    });
    text('示意', 1760, 668, { size: 20, color: DIM, align: 'right' });
    ctx.restore();
  }
  bullet(0, '唯一 ≠ 有序', eOut(P(lt, 1.2, 1.8)));
  bullet(1, '全局序号：近似有序', eOut(P(lt, 8.2, 8.8)));
  bullet(2, '会话内序号：只管本会话', eOut(P(lt, 14.4, 15)), { color: SC[4] });
  statCard(110, 700, 640, '顺序只需保证在', '同一个会话内', { color: SC[4], a: eOut(P(lt, 18.2, 19)) });
}

// ───────── 场景 6：多设备同步 ─────────
function sceneSync(lt) {
  header(lt, '06', '多设备同步', SC[0], '游标 + 增量补拉');
  const rx = 830, ry0 = 220, rh = 64, rg = 80, ids = [101, 102, 103, 104, 105, 106, 107];
  tag(rx, 190, 'KV 存储 · 我的消息', COL.kv, eOut(P(lt, 0.4, 1)), 24);
  const lap = { x: 1420, y: 520, w: 320, h: 120 }, ph = { x: 1420, y: 240, w: 320, h: 120 };
  // 笔记本 游标
  const pulls = [0, 1, 2, 3].map((k) => 12.4 + k * 0.7);
  const cursor = 103 + pulls.filter((t) => lt > t + 0.9).length;
  const online = lt > 11.4;
  ids.forEach((id, i) => {
    const a = eOut(P(lt, 0.5 + i * 0.1, 1.1 + i * 0.1)), y = ry0 + i * rg;
    const pulled = id > 103 && lt > 11.8, got = id > 103 && lt > pulls[id - 104] + 0.9;
    const c = id <= 103 ? SC[0] : SC[3];
    ctx.save(); ctx.globalAlpha *= a;
    glass(rx, y, 300, rh, { r: 18, accent: id <= 103 ? SC[0] : (pulled ? SC[3] : null), fill: pulled && !got ? 0.14 : 0.055 });
    text(`m${id}`, rx + 28, y + 42, { size: 28, weight: 800, font: MONO, color: id <= 103 || pulled ? c : MUTE });
    text(id <= 103 ? '本地已有' : '离线期间新增', rx + 272, y + 41, { size: 20, color: MUTE, align: 'right' });
    ctx.restore();
  });
  // 手机（已同步）与笔记本
  const da = eOut(P(lt, 3.3, 4.1));
  box(ph.x, ph.y, ph.w, ph.h, '手机', { color: COL.client, sub: 'cur_max = 107', a: da, size: 32 });
  const la = (online ? 1 : 0.5) * da;
  box(lap.x, lap.y, lap.w, lap.h, '笔记本', { color: COL.client, sub: `cur_max = ${cursor}`, a: la, size: 32 });
  text('已同步', ph.x + ph.w / 2, ph.y + ph.h + 38, { size: 24, weight: 700, color: COL.pres, align: 'center', a: da });
  dot(lap.x + 24, lap.y + lap.h + 33, 9, online ? COL.pres : DIM, { g: online ? 12 : 0, a: da });
  text(online ? '上线' : '离线', lap.x + 46, lap.y + lap.h + 41, { size: 24, weight: 700, color: online ? COL.pres : MUTE, a: da });
  if (lt > 5.5 && lt < 11.4) rectPulse(lap.x, lap.y, lap.w, lap.h, P(lt, 8.5, 9.4), SC[3]);
  // 游标线：笔记本停在 103
  const cl = eOut(P(lt, 8.4, 9.2));
  if (cl > 0) { const y = ry0 + 3 * rg + rh + 8; ctx.save(); ctx.globalAlpha *= cl; ctx.strokeStyle = SC[3]; ctx.lineWidth = 3; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.moveTo(rx - 14, y); ctx.lineTo(rx + 330, y); ctx.stroke(); ctx.restore(); tag(rx + 340, y + 8, '笔记本游标', SC[3], cl, 22); }
  // 补拉
  pulls.forEach((t, k) => flyChip(rx + 305, ry0 + (3 + k) * rg + rh / 2, lap.x - 8, lap.y + 60, P(lt, t, t + 0.9), `m${104 + k}`, SC[3]));
  const qa = eOut(P(lt, 11.4, 12.2));
  glass(830, 800, 880, 84, { a: qa, accent: SC[3] });
  text(`recipient_id = 我  AND  message_id > ${103}`, 862, 852, { size: 26, font: MONO, weight: 700, a: qa });
  bullet(0, '每台设备一个游标', eOut(P(lt, 3.6, 4.2)));
  bullet(1, '上线：拉比游标大的', eOut(P(lt, 11.6, 12.2)), { color: SC[3] });
  bullet(2, '收齐了才推进游标', eOut(P(lt, 16.8, 17.4)));
  const sa = eOut(P(lt, 18.6, 19.4));
  statCard(110, 640, 640, '断线后的消息', '仍在存储里', { color: COL.pres, a: sa });
}

// ───────── 场景 7：群聊扇出 ─────────
function sceneGroup(lt) {
  header(lt, '07', '群聊扇出', COL.msg, '写进每个人的收件箱');
  const A = { x: 820, y: 470, w: 150, h: 100 }, S = { x: 1040, y: 470, w: 220, h: 100 };
  box(A.x, A.y, A.w, A.h, '用户 A', { color: COL.client });
  box(S.x, S.y, S.w, S.h, '聊天服务器', { color: COL.chat, size: 28 });
  tag(1480, 190, '群成员的收件箱', MUTE, eOut(P(lt, 1.2, 1.8)), 24);
  const names = ['B', 'C', 'D', 'E', 'F', 'G'];
  const ys = names.map((_, i) => 215 + i * 100);
  names.forEach((n, i) => {
    const a = eOut(P(lt, 1.2 + i * 0.12, 1.9 + i * 0.12));
    glass(1480, ys[i], 320, 76, { a, accent: i % 2 ? SC[0] : SC[1], r: 20 });
    text(`${n} 的收件箱`, 1506, ys[i] + 47, { size: 26, weight: 600, a });
    const t0 = 5.0 + i * 0.35;
    const got = P(lt, t0 + 0.9, t0 + 1.3);
    if (got > 0) { ctx.save(); ctx.translate(1752, ys[i] + 38); ctx.scale(eBack(got), eBack(got)); rr(-30, -17, 60, 34, 10); ctx.fillStyle = COL.msg + '55'; ctx.fill(); ctx.strokeStyle = COL.msg; ctx.lineWidth = 2.5; ctx.stroke(); text('+1', 0, 7, { size: 20, weight: 800, align: 'center', font: MONO }); ctx.restore(); }
    // 连线与扇出
    const x1 = S.x + S.w, y1 = S.y + 50, x2 = 1470, y2 = ys[i] + 38;
    const lp = eOut(P(lt, 4.6 + i * 0.35, 5.2 + i * 0.35));
    if (lp > 0) arrow(x1, y1, lerp(x1, x2, lp), lerp(y1, y2, lp), { color: COL.msg + '88', w: 3, head: 10, p: 1 });
    flyChip(x1 + 20, y1, x2 - 50, y2, P(lt, t0, t0 + 1.0), '消息');
  });
  text('…', 1640, 862, { size: 40, color: MUTE, align: 'center', a: eOut(P(lt, 2.4, 3)) });
  text('共最多 100 人', 1640, 900, { size: 22, color: MUTE, align: 'center', a: eOut(P(lt, 2.4, 3)) });
  flyChip(A.x + A.w - 10, 520, S.x + 14, 520, P(lt, 2.8, 3.8), '消息');
  const n = Math.round(1 + 99 * eIO(P(lt, 7.6, 9.6)));
  const amp = eOut(P(lt, 14.4, 15.2));
  statCard(110, 700, 640, '一条消息要写', `${lt < 7 ? 1 : n} 份`, { color: lerp(0, 1, amp) > 0.5 ? RED : COL.msg, a: eOut(P(lt, 7.0, 7.8)), note: amp > 0.5 ? '写放大' : '最多' });
  bullet(0, '最多 100 人', eOut(P(lt, 1.4, 2)));
  bullet(1, '每人一个收件箱', eOut(P(lt, 4.4, 5)));
  bullet(2, '复制消息或索引', eOut(P(lt, 9.8, 10.4)));
  bullet(3, '同步简单，写入放大', eOut(P(lt, 11.5, 12.1)));
}

// ───────── 场景 8：心跳 ─────────
const AX0 = 880, PXS = 20;
function hbLane(cy, T, beats, lost, title, pillOn, a = 1, thr = true) {
  ctx.save(); ctx.globalAlpha *= a;
  tag(830, cy - 70, title, SC[3], 1, 28);
  const xs = (t) => AX0 + t * PXS;
  line(AX0, cy, AX0 + 44 * PXS, cy, 'rgba(255,255,255,0.2)', 3);
  for (let t = 0; t <= 40; t += 5) { line(xs(t), cy - 8, xs(t), cy + 8, 'rgba(255,255,255,0.3)', 2); text(`${t}s`, xs(t), cy - 20, { size: 20, color: DIM, align: 'center' }); }
  let last = 0;
  beats.forEach((t) => { if (T >= t) { last = t; pulse(xs(t), cy, 12, P(T, t, t + 1.2), COL.pres, 24); dot(xs(t), cy, 12, COL.pres, { g: 16 }); } });
  lost.forEach((t) => { if (T >= t) text('×', xs(t), cy + 10, { size: 30, weight: 800, color: RED, align: 'center' }); });
  const d = Math.max(0, T - last);
  if (T > last) {
    const hot = d >= 30;
    ctx.fillStyle = hot ? RED : SC[3]; glow(hot ? RED : SC[3], 10); rr(xs(last), cy + 30, Math.max(6, (T - last) * PXS), 12, 6); ctx.fill(); ctx.shadowBlur = 0;
    text(`距上次心跳 ${Math.floor(d)} 秒`, xs(last), cy + 80, { size: 24, weight: 700, color: hot ? RED : SC[3], font: MONO });
  }
  if (thr) { const x = xs(last + 30); if (last + 30 <= 44 && (T >= last && last > 0)) { line(x, cy - 54, x, cy + 24, 'rgba(255,255,255,0.4)', 2, [6, 6]); tag(x, cy - 64, '30 秒超时', MUTE, 1, 22, 'center'); } }
  if (T < 44) { const x = xs(T); line(x, cy - 34, x, cy + 24, 'rgba(255,255,255,0.8)', 2); }
  // 状态
  const off = pillOn && d >= 30;
  glass(1200, cy - 112, 230, 56, { accent: off ? '#8f98b0' : COL.pres, r: 28 });
  dot(1230, cy - 84, 9, off ? DIM : COL.pres, { g: off ? 0 : 14 });
  text(off ? '离线' : '在线', 1256, cy - 74, { size: 28, weight: 800, color: off ? MUTE : COL.pres });
  ctx.restore();
  return d;
}
function sceneBeat(lt) {
  header(lt, '08', '心跳在线', COL.pres, '用心跳判断是否在线');
  const T1 = clamp((lt - 2.4) / 9.1) * 40.5;
  const a1 = eOut(P(lt, 0.4, 1.2));
  hbLane(400, T1, [0, 5, 10], [15, 20, 25, 30, 35, 40], '连接断了：心跳一直没到', true, a1, true);
  const a2 = eOut(P(lt, 12.2, 13));
  const T2 = clamp((lt - 12.8) / 4.2) * 25;
  hbLane(750, T2, [0, 5, 15, 20], [10], '网络抖一下：只漏了一次', true, a2, 2);
  { const na = eOut(P(lt, 16.6, 17.2)); text('不到 30 秒，仍然在线', 1200, 850 + 40, { size: 24, weight: 700, color: COL.pres, a: na }); }
  bullet(0, '每 5 秒一次心跳', eOut(P(lt, 2.4, 3)));
  bullet(1, '连续 30 秒没收到 → 离线', eOut(P(lt, 7.6, 8.2)));
  bullet(2, '短暂抖动不会立刻下线', eOut(P(lt, 13, 13.6)));
  statCard(110, 700, 640, '这是近似的在线', '弱网·休眠也会超时', { color: SC[3], a: eOut(P(lt, 17, 17.8)), h: 112 });
}

// ───────── 场景 9：状态扇出（发布订阅） ─────────
function scenePresence(lt) {
  header(lt, '09', '状态扇出', COL.pres, '发布订阅，通知好友');
  const A = { x: 820, y: 470, w: 170, h: 110 };
  const rows = [['B', 300], ['C', 525], ['D', 750]];
  const flip = lt > 9.6;
  box(A.x, A.y, A.w, A.h, '用户 A', { color: COL.client, size: 32 });
  dot(A.x + 40, A.y + A.h + 36, 9, flip ? DIM : COL.pres, { g: flip ? 0 : 14 });
  text(flip ? '离线' : '在线', A.x + 62, A.y + A.h + 44, { size: 26, weight: 700, color: flip ? MUTE : COL.pres });
  if (lt > 9.4) rectPulse(A.x, A.y, A.w, A.h, P(lt, 9.4, 10.2), COL.pres);
  const pubT = [10.4, 12.0, 13.4];
  rows.forEach(([n, cy], i) => {
    const fa = eOut(P(lt, 2.2 + i * 0.3, 3 + i * 0.3)), ca = eBack(P(lt, 4.0 + i * 0.7, 4.8 + i * 0.7));
    const delivered = lt > 16.8 + i * 0.1;
    box(1590, cy - 55, 210, 110, `好友 ${n}`, { color: COL.client, sub: delivered ? 'A 离线' : 'A 在线', a: fa, size: 33 });
    box(1250, cy - 40, 190, 80, `A-${n}`, { color: COL.pres, a: clamp(ca * 2), s: clamp(ca, 0, 1.02), size: 30 });
    // 发布路径
    arrow(A.x + A.w, 525, 1240, cy, { color: COL.pres + '66', w: 3, head: 10, p: eOut(P(lt, pubT[i] - 0.2, pubT[i] + 0.3)) });
    flyChip(A.x + A.w + 30, 525, 1240, cy, P(lt, pubT[i], pubT[i] + 0.9), '离线', COL.pres);
    // 订阅（虚线反向）
    const sp = eOut(P(lt, 15.2 + i * 0.15, 15.9 + i * 0.15));
    arrow(1585, cy + 22, 1450, cy + 22, { color: SC[3], dash: [9, 7], w: 3, head: 11, p: sp });
    if (i === 0) text('订阅', 1517, cy + 62, { size: 22, weight: 700, color: SC[3], align: 'center', a: sp });
    arrow(1450, cy - 12, 1580, cy - 12, { color: COL.pres + '66', w: 3, head: 10, p: eOut(P(lt, 15.7, 16.2)) });
    flyChip(1450, cy - 12, 1570, cy - 12, P(lt, 15.9 + i * 0.1, 16.8 + i * 0.1), '离线', COL.pres);
    if (delivered) rectPulse(1590, cy - 55, 210, 110, P(lt, 16.8 + i * 0.1, 17.6 + i * 0.1), COL.pres);
  });
  bullet(0, 'A 与每位好友一个频道', eOut(P(lt, 3.6, 4.2)));
  bullet(1, 'A 状态变化 → 发布', eOut(P(lt, 9.6, 10.2)));
  bullet(2, '好友订阅 → 收到更新', eOut(P(lt, 15.4, 16)));
  const na = eOut(P(lt, 19.6, 20.4));
  glass(110, 650, 640, 150, { a: na, accent: COL.pres });
  text('适合好友数较少', 140, 700, { size: 28, weight: 700, a: na });
  text('好友很多：只订阅打开的联系人', 140, 750, { size: 24, color: MUTE, a: na });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('聊天系统', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Chat System', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['WebSocket', '实时通道', COL.chat], ['消息库', '保存历史', COL.kv], ['游标', '断线后补拉', SC[3]]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.5, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: w.length > 6 ? 62 : 70, weight: 800 });
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  text('顺序只需在会话内保证', 110, 750, { size: 28, weight: 600, a: eOut(P(lt, 6.0, 6.8)) });
  text('在线状态是近似判断', 110, 800, { size: 28, weight: 600, a: eOut(P(lt, 7.0, 7.8)) });
  text('重试靠稳定的消息 ID 去重', 110, 850, { size: 24, color: MUTE, a: eOut(P(lt, 8.0, 8.8)) });
}

export const scenes = { title: sceneTitle, poll: scenePoll, ws: sceneWs, arch: sceneArch, flow: sceneFlow, order: sceneOrder, sync: sceneSync, group: sceneGroup, beat: sceneBeat, presence: scenePresence, end: sceneEnd };
