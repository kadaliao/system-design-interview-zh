// 第 23 章 分布式邮件服务：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header,
         arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 23, title: '分布式邮件服务', en: 'Distributed Email Service' };

// 角色配色（全片统一）
const C_CLIENT = '#9aa6d6', C_SVC = SC[1], C_QUEUE = SC[2], C_DB = SC[0], C_OBJ = SC[3], C_SEARCH = SC[4];

const ap = (lt, t0, d = 0.6) => eOut(P(lt, t0, t0 + d));
function bx(lt, t0, x, y, w, h, label, o = {}) {
  const p = eBack(P(lt, t0, t0 + 0.6));
  box(x, y, w, h, label, { size: 32, ...o, a: clamp(p * 2) * (o.a ?? 1), s: 0.85 + 0.15 * clamp(p, 0, 1.1) });
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
// 信封沿直线移动 t0→t1，到达时在终点放一个涟漪
function hop(lt, t0, t1, x1, y1, x2, y2, color = '#fff', { s = 1 } = {}) {
  const p = P(lt, t0, t1);
  if (p > 0 && p < 1) { const q = eIO(p); envelope(lerp(x1, x2, q), lerp(y1, y2, q), color, { s }); }
  ringPulse(x2, y2, color, lt, t1, 36, 54);
}
function card(x, y, w, h, color, title, lines, a, { tsize = 36, font = SANS } = {}) {
  if (a <= 0) return;
  glass(x, y, w, h, { a, accent: color });
  ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; glow(color, 14); rr(x + 24, y, 70, 5, 3); ctx.fill(); ctx.restore();
  text(title, x + 26, y + 56, { size: tsize, weight: 800, color, font, a });
  lines.forEach((l, i) => text(l, x + 26, y + 100 + i * 36, { size: 26, color: i === 0 ? INK : MUTE, a }));
}
const lab = (s, x, y, a = 1, o = {}) => text(s, x, y, { size: 22, color: MUTE, a, ...o });

// ───────── 片头：一封信的路线 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  text('系统设计面试 · 动画讲解', 110, 280, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 1100, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 150px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('分布式邮件服务', 104, 450); ctx.restore();
  text('Distributed Email Service', 112, 520, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 23 章', 112, 600, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
  // 一封信走过的路
  const nodes = [['写信', C_CLIENT], ['发信队列', C_QUEUE], ['SMTP', C_SVC], ['过滤', SC[3]], ['入库', C_DB], ['收件箱', SC[4]]];
  const x0 = 200, x1 = 1720, y = 800, gap = (x1 - x0) / 5;
  nodes.forEach(([n, c], i) => {
    const x = x0 + i * gap, p = eBack(P(lt, 2.0 + i * 0.25, 2.7 + i * 0.25));
    if (i) arrow(x - gap + 44, y, x - 44, y, { color: DIM, a: clamp(p * 2) * 0.8, p: clamp(p), head: 12, w: 3 });
    ctx.save(); ctx.globalAlpha *= clamp(p * 2); ctx.translate(x, y); ctx.scale(clamp(p, 0, 1.1), clamp(p, 0, 1.1));
    glow(c, 22); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = c; ctx.stroke(); ctx.restore();
    text(n, x, y + 84, { size: 26, weight: 600, align: 'center', color: MUTE, a: clamp(p * 2) });
  });
  const tp = P(lt, 4.0, 9.0);
  if (tp > 0 && tp < 1) { const q = eIO(tp); envelope(lerp(x0, x1, q), y, '#fff'); }
  if (tp >= 1) envelope(x1, y, SC[4]);
}

// ───────── 1 邮件协议：从写信到取信 ─────────
function sceneProto(lt) {
  header(lt, '01', '邮件协议', SC[1], '一封信的四站');
  const y = 430, h = 120, w = 160, xs = [800, 1093, 1386, 1679];
  bx(lt, 0.7, xs[0], y, w, h, 'Alice', { color: C_CLIENT, sub: '发件人', size: 33 });
  bx(lt, 4.0, xs[1], y, w, h, 'Outlook', { color: C_SVC, sub: '发信服务器', size: 33 });
  bx(lt, 9.4, xs[2], y, w, h, 'Gmail', { color: C_SVC, sub: '收信服务器', size: 33 });
  bx(lt, 14.6, xs[3], y, w, h, 'Bob', { color: C_CLIENT, sub: '收件人', size: 33 });
  const my = y + h / 2;
  const seg = (i, t0, label, col) => {
    const x1 = xs[i] + w + 6, x2 = xs[i + 1] - 6, p = ap(lt, t0, 0.6);
    arrow(x1, my, x2, my, { color: col, p, a: p, g: 6 });
    text(label, (x1 + x2) / 2, my - 22, { size: 22, weight: 700, color: col, align: 'center', font: MONO, a: p });
  };
  seg(0, 4.0, '发送', C_CLIENT); seg(1, 12.2, 'SMTP', SC[0]); seg(2, 18.1, 'IMAP/POP', SC[3]);
  // MX 查询
  const dp = ap(lt, 5.4);
  bx(lt, 5.4, 1240, 200, 200, 110, 'DNS', { color: SC[4], sub: 'MX 记录', size: 32 });
  arrow(1190, y - 4, 1285, 318, { color: SC[4], p: ap(lt, 5.8, 0.8), a: dp, dash: [8, 7] });
  lab('MX 查询', 1130, 372, ap(lt, 6.2), { color: SC[4], size: 24 });
  const ra = ap(lt, 9.4);
  lab('gmail.com 的 MX', 1460, 250, ra, { size: 24 });
  text('→ Gmail 的收信服务器', 1460, 288, { size: 24, weight: 700, color: SC[4], a: ra });
  arrow(1380, 318, 1466, y - 4, { color: SC[4], p: ap(lt, 9.4, 0.8), a: ra, dash: [8, 7] });
  // 信封：静止时停在方框上方，移动时沿箭头
  const rest = (i, col, s0 = 0.8) => envelope(xs[i] + w / 2, y - 44, col, { s: s0 });
  const wr = P(lt, 0.7, 4.0);
  if (wr < 1) rest(0, '#fff', 0.8 * eOut(P(lt, 0.9, 1.5)));
  hop(lt, 4.0, 5.2, xs[0] + w, my, xs[1], my, '#fff');
  if (lt >= 5.2 && lt < 12.2) rest(1, '#fff');
  hop(lt, 12.2, 13.8, xs[1] + w, my, xs[2], my, SC[0]);
  if (lt >= 13.8 && lt < 18.1) rest(2, SC[0]);
  hop(lt, 18.1, 19.6, xs[2] + w, my, xs[3], my, SC[3]);
  if (lt >= 19.6) rest(3, SC[3]);
  // 协议分工卡片
  card(800, 640, 330, 190, SC[0], 'SMTP', ['服务器之间传信', '发信方 → 收信方'], ap(lt, 20.0), { font: MONO });
  card(1155, 640, 330, 190, SC[3], 'IMAP / POP', ['用户从邮箱取信', 'IMAP 留在服务器', ], ap(lt, 22.1), { font: MONO, tsize: 34 });
  card(1510, 640, 330, 190, C_SVC, 'HTTP', ['网页客户端调用', '邮件服务的 API'], ap(lt, 24.7), { font: MONO });
  text('POP 可下载到本地；IMAP 更适合多设备同步', 800, 872, { size: 22, color: DIM, a: ap(lt, 22.8) });
  bullet(0, '写信发送', ap(lt, 0.7)); bullet(1, '查 MX，找收信服务器', ap(lt, 4.7)); bullet(2, 'SMTP 递给 Gmail', ap(lt, 12.2)); bullet(3, 'IMAP / POP 取信', ap(lt, 18.1));
}

// ───────── 2 发送流水线 ─────────
function sceneSend(lt) {
  header(lt, '02', '发送流水线', C_QUEUE, '先排队，再慢慢投递');
  const w = 220, h = 110;
  const X = [800, 1100, 1400], Y1 = 220, Y2 = 470;
  bx(lt, 0.7, X[0], Y1, w, h, '客户端', { color: C_CLIENT, sub: 'Webmail' });
  bx(lt, 2.4, X[1], Y1, w, h, '负载均衡', { color: C_SVC, sub: '限流' });
  bx(lt, 4.6, X[2], Y1, w, h, 'Web 服务器', { color: C_SVC, sub: '基本校验' });
  arrow(X[0] + w + 6, Y1 + 55, X[1] - 6, Y1 + 55, { color: DIM, p: ap(lt, 2.4), a: ap(lt, 2.4) });
  arrow(X[1] + w + 6, Y1 + 55, X[2] - 6, Y1 + 55, { color: DIM, p: ap(lt, 4.6), a: ap(lt, 4.6) });
  // 校验
  badge(800, 372, '大小等基本校验 通过', SC[4], ap(lt, 7.7));
  // 队列
  bx(lt, 11.0, X[2], Y2, w, h, '发信队列', { color: C_QUEUE, sub: '出站队列' });
  arrow(X[2] + w / 2, Y1 + h + 6, X[2] + w / 2, Y2 - 6, { color: C_QUEUE, p: ap(lt, 11.0), a: ap(lt, 11.0) });
  // 对象存储
  bx(lt, 13.1, 1660, Y2, 180, h, '对象存储', { color: C_OBJ, sub: '附件' });
  arrow(X[2] + w + 6, Y2 + 55, 1654, Y2 + 55, { color: C_OBJ, dash: [7, 7], p: ap(lt, 13.1), a: ap(lt, 13.1) });
  badge(1660, 600, '只传引用', C_OBJ, ap(lt, 13.6));
  // 错误队列
  bx(lt, 15.6, 1660, Y1, 180, h, '错误队列', { color: RED, sub: '校验失败', hot: true });
  arrow(X[2] + w + 6, Y1 + 55, 1654, Y1 + 55, { color: RED, p: ap(lt, 15.6), a: ap(lt, 15.6), dash: [7, 7] });
  // worker / 对方 / 已发送
  bx(lt, 18.3, X[1], Y2, w, h, 'SMTP 出站', { color: C_SVC, sub: 'worker' });
  arrow(X[2] - 6, Y2 + 55, X[1] + w + 6, Y2 + 55, { color: DIM, p: ap(lt, 18.3), a: ap(lt, 18.3) });
  bx(lt, 24.1, X[0], Y2, w, h, '对方服务器', { color: C_CLIENT, sub: '外部' });
  arrow(X[1] - 6, Y2 + 55, X[0] + w + 6, Y2 + 55, { color: SC[0], p: ap(lt, 24.1), a: ap(lt, 24.1) });
  const sa = ap(lt, 25.3);
  dbIcon(1155, 700, 110, 100, '已发送', { color: C_DB, a: sa });
  arrow(X[1] + w / 2, Y2 + h + 6, X[1] + w / 2, 694, { color: C_DB, p: sa, a: sa });
  // 过滤扫描
  if (lt > 22.0) { const p = P(lt, 22.0, 24.0); text('垃圾邮件 / 病毒检查', X[1] + w / 2, 640, { size: 22, color: SC[3], align: 'center', weight: 700, a: Math.min(ap(lt, 22.0), 1 - P(lt, 24.0, 24.6)) });
    ringPulse(X[1] + w / 2, Y2 + 55, SC[3], lt, 22.0, 70, 40); ringPulse(X[1] + w / 2, Y2 + 55, SC[3], lt, 22.6, 70, 40); void p; }
  // 信封
  const m = '#fff';
  hop(lt, 2.4, 3.6, X[0] + w, Y1 + 55, X[1], Y1 + 55, m);
  hop(lt, 4.6, 5.8, X[1] + w, Y1 + 55, X[2], Y1 + 55, m);
  hop(lt, 11.0, 12.4, X[2] + w / 2, Y1 + h, X[2] + w / 2, Y2, m);
  hop(lt, 16.0, 17.0, X[2] + w, Y1 + 55, 1660, Y1 + 55, RED);
  hop(lt, 18.3, 19.6, X[2], Y2 + 55, X[1] + w, Y2 + 55, m);
  hop(lt, 24.1, 25.0, X[1], Y2 + 55, X[0] + w, Y2 + 55, SC[0]);
  hop(lt, 25.3, 26.2, X[1] + w / 2, Y2 + h, X[1] + w / 2, 700, C_DB);
  // 暂存的信封
  if (lt >= 12.4 && lt < 18.3) envelope(X[2] + w / 2, Y2 + h + 40, m, { s: 0.8 });
  if (lt >= 19.6 && lt < 24.1) envelope(X[1] + w / 2, Y2 - 34, m, { s: 0.8 });
  [[0.7, '入口限流', 2.4], [1, '基本校验', 7.7], [2, '进发信队列', 11.0], [3, '附件传引用', 13.1], [4, '出站 worker 检查并投递', 18.3], [5, '存入已发送', 25.3]]
    .forEach(([, s, t], i) => bullet(i, s, ap(lt, t)));
}

// ───────── 3 积压、重试与退信 ─────────
function qLevel(lt) {
  if (lt < 3.5) return 18 * eOut(P(lt, 0.7, 3.5));
  if (lt < 9.0) return 18;
  if (lt < 12.5) return lerp(18, 4, eIO(P(lt, 9.0, 12.2)));
  if (lt < 14.4) return 4;
  return lerp(4, 22, eIO(P(lt, 14.4, 17.2)));
}
function sceneRetry(lt) {
  header(lt, '03', '积压与重试', C_QUEUE, '先问：为什么堵');
  // 队列水位
  const qa = ap(lt, 0.7), cells = 24, lv = qLevel(lt);
  lab('发信队列长度（示意）', 800, 214, qa);
  for (let i = 0; i < cells; i++) {
    const x = 810 + i * 42, on = i < Math.floor(lv), part = i === Math.floor(lv) ? lv - Math.floor(lv) : 0;
    const col = lt > 14.4 ? RED : C_QUEUE;
    ctx.save(); ctx.globalAlpha *= qa; rr(x, 232, 34, 56, 6); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    if (on || part > 0) { ctx.globalAlpha *= on ? 1 : part; glow(col, 10); rr(x, 232, 34, 56, 6); ctx.fillStyle = col; ctx.fill(); }
    ctx.restore();
  }
  // 面板 A：指数退避
  const A = ap(lt, 5.2) * (1 - P(lt, 8.9, 9.4)), py = 340;
  if (A > 0) {
    glass(800, py, 1040, 290, { a: A, accent: SC[3] });
    text('对方不可用：间隔翻倍重试（示意）', 830, py + 52, { size: 28, weight: 700, color: SC[3], a: A });
    const ly = py + 170, cum = [0, 1, 3, 7, 15], tt = [5.4, 6.1, 6.8, 7.5, 8.2];
    ctx.save(); ctx.globalAlpha *= A; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(850, ly); ctx.lineTo(1810, ly); ctx.stroke(); ctx.restore();
    cum.forEach((c, i) => {
      const x = 880 + c * 60, p = eBack(P(lt, tt[i], tt[i] + 0.5)); if (p <= 0.02) return;
      const ok = i === 4, col = ok ? SC[4] : RED;
      ctx.save(); ctx.globalAlpha *= A * clamp(p * 2); ctx.translate(x, ly); ctx.scale(clamp(p, 0, 1.1), clamp(p, 0, 1.1));
      glow(col, 14); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.stroke(); ctx.shadowBlur = 0;
      text(ok ? '✓' : '×', 0, 10, { size: 30, weight: 800, color: col, align: 'center' }); ctx.restore();
      text(ok ? '成功' : `${i + 1}`, x, ly + 60, { size: 22, color: ok ? SC[4] : MUTE, align: 'center', a: A * clamp(p * 2) });
      if (i > 0) { const g = cum[i] - cum[i - 1]; text(`+${g}`, x - g * 30, ly - 42, { size: 24, weight: 700, color: SC[3], align: 'center', font: MONO, a: A * clamp(p * 2) }); }
    });
  }
  // 面板 B：扩容 vs 被限流
  const B = ap(lt, 9.2) * 1, py2 = 340;
  if (B > 0) {
    glass(800, py2, 1040, 290, { a: B, accent: lt > 12.5 ? RED : C_SVC });
    const nw = lt < 9.8 ? 2 : lt < 11.0 ? Math.round(lerp(2, 4, P(lt, 9.8, 11.0))) : lt < 14.4 ? 4 : Math.round(lerp(4, 8, eIO(P(lt, 14.4, 16.4))));
    text(lt < 12.5 ? '消费者不足：扩容 worker' : '对方限流：越加 worker 越糟', 830, py2 + 52, { size: 28, weight: 700, color: lt < 12.5 ? C_SVC : RED, a: B });
    for (let i = 0; i < 8; i++) {
      const x = 840 + i * 62, on = i < nw, born = on ? eBack(P(lt, lt < 12.5 ? 9.8 + i * 0.4 : 14.4 + (i - 4) * 0.5, (lt < 12.5 ? 9.8 + i * 0.4 : 14.4 + (i - 4) * 0.5) + 0.4)) : 0;
      ctx.save(); ctx.globalAlpha *= B; rr(x, py2 + 130, 52, 52, 10); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      if (on && (i < 2 || born > 0.02 || lt > 12.5 && i < 4)) { glow(lt > 12.5 ? RED : C_SVC, 12); rr(x, py2 + 130, 52, 52, 10); ctx.fillStyle = (lt > 12.5 ? RED : C_SVC) + '55'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = lt > 12.5 ? RED : C_SVC; ctx.stroke(); }
      ctx.restore();
    }
    text(`worker × ${nw}`, 840, py2 + 250, { size: 40, weight: 800, font: MONO, color: lt > 12.5 ? RED : C_SVC, a: B });
    // 对方服务器
    const op = ap(lt, 9.4);
    const hot = lt > 12.5;
    box(1530, py2 + 100, 270, 110, '对方服务器', { color: C_CLIENT, sub: hot ? '限流中' : '正常', hot, a: op * B, size: 32 });
    arrow(1360, py2 + 156, 1520, py2 + 156, { color: hot ? RED : DIM, a: B, dash: hot ? [8, 8] : null });
    // 数据包
    const n = lt < 12.5 ? 3 : 5;
    for (let k = 0; k < n; k++) {
      const u = ((lt * (hot ? 0.9 : 0.7) + k / n) % 1);
      if (lt < 10.0) continue;
      if (!hot) packet(1360, py2 + 156, 1520, py2 + 156, u, C_QUEUE, { r: 8, trail: 0.2, a: B });
      else if (lt > 13.0) { const bounce = u < 0.5 ? u * 2 : 2 - u * 2; dot(lerp(1360, 1520, bounce), py2 + 156, 8, RED, { g: 14, a: B * (lt > 14.4 ? 1 : 0.7) }); }
    }
  }
  // 底部：临时 / 永久
  card(800, 690, 505, 200, SC[3], '临时故障 · 4xx', ['带退避地重试', '不丢信，也不狂轰'], ap(lt, 17.4));
  card(1335, 690, 505, 200, RED, '永久拒收 · 5xx', ['生成失败结果，记录原因', '不再无限重发'], ap(lt, 19.3));
  bullet(0, '积压 ≠ 一定要扩容', ap(lt, 3.5)); bullet(1, '不可用 → 指数退避', ap(lt, 5.4)); bullet(2, 'worker 不够 → 扩容', ap(lt, 9.2)); bullet(3, '被限流 → 别加 worker', ap(lt, 12.5)); bullet(4, '永久拒收 → 失败结果', ap(lt, 19.3));
}

// ───────── 4 接收流水线 ─────────
function sceneReceive(lt) {
  header(lt, '04', '接收流水线', C_SVC, '先拦截，再入库');
  const w = 200, h = 110, Y1 = 200, Y2 = 440, Y3 = 690;
  bx(lt, 0.7, 800, Y1, w, h, '外部邮件', { color: C_CLIENT, sub: '来自对方' });
  bx(lt, 2.5, 1075, Y1, w, h, 'SMTP LB', { color: C_SVC, sub: '负载均衡' });
  bx(lt, 6.0, 1335, Y1, 230, h, 'SMTP 服务器', { color: C_SVC, sub: '接收策略' });
  arrow(1006, Y1 + 55, 1069, Y1 + 55, { color: DIM, p: ap(lt, 2.5), a: ap(lt, 2.5) });
  arrow(1281, Y1 + 55, 1329, Y1 + 55, { color: DIM, p: ap(lt, 6.0), a: ap(lt, 6.0) });
  bx(lt, 10.3, 1650, Y1, 190, h, '拒绝', { color: RED, sub: '无效邮件', hot: true });
  arrow(1571, Y1 + 55, 1644, Y1 + 55, { color: RED, p: ap(lt, 10.3), a: ap(lt, 10.3), dash: [7, 7] });
  bx(lt, 12.3, 1650, Y2, 190, h, '对象存储', { color: C_OBJ, sub: '大附件' });
  arrow(1520, Y1 + h + 6, 1700, Y2 - 6, { color: C_OBJ, p: ap(lt, 12.3), a: ap(lt, 12.3), dash: [7, 7] });
  bx(lt, 15.2, 1350, Y2, w, h, '邮件处理', { color: C_SVC, sub: '初步检查' });
  arrow(1450, Y1 + h + 6, 1450, Y2 - 6, { color: DIM, p: ap(lt, 15.2), a: ap(lt, 15.2) });
  // 输出
  const outs = [[800, '持久存储', C_DB, 19.6], [1010, '缓存', SC[0], 21.8], [1220, '实时服务器', C_SVC, 22.4]];
  outs.forEach(([x, n, c, t], i) => {
    if (i === 0) { const a = ap(lt, t); dbIcon(x + 40, Y3 - 6, 110, 100, '持久存储', { color: C_DB, a }); }
    else bx(lt, t, x, Y3, i === 2 ? 220 : 160, 100, n, { color: i === 1 ? SC[0] : c, size: i === 2 ? 30 : 32 });
  });
  const tx = [895, 1090, 1330];
  tx.forEach((x, i) => arrow(1450, Y2 + h + 6, x, i === 0 ? Y3 - 12 : Y3 - 6, { color: DIM, p: ap(lt, outs[i][3]), a: ap(lt, outs[i][3]), w: 3 }));
  // 用户
  bx(lt, 24.4, 1560, Y3, 280, 100, 'Bob', { color: C_CLIENT, sub: lt < 26.1 ? '在线' : lt < 28.1 ? '离线' : '重新上线', size: 32 });
  arrow(1446, Y3 + 50, 1554, Y3 + 50, { color: SC[3], p: ap(lt, 24.4), a: ap(lt, 24.4) });
  lab('WebSocket 推送', 1450, Y3 + 150, ap(lt, 24.6), { align: 'center', color: SC[3], size: 22 });
  if (lt > 28.1) { // HTTP 读取
    const a = ap(lt, 28.1);
    arrow(1700, Y3 + 108, 1700, 858, { color: SC[0], a, p: ap(lt, 28.1, 0.4), w: 3, head: 1 });
    arrow(1700, 858, 990, 858, { color: SC[0], a, p: ap(lt, 28.4, 0.8), w: 3, head: 1 });
    arrow(990, 858, 990, 745, { color: SC[0], a, p: ap(lt, 29.0, 0.3), w: 3, head: 1 });
    arrow(990, 745, 958, 745, { color: SC[0], a, p: ap(lt, 29.2, 0.3), w: 3 });
    lab('HTTP 读取', 1350, 840, a, { align: 'center', color: SC[0] });
  }
  // 信封与动作
  const m = '#fff';
  hop(lt, 2.5, 3.7, 1000, Y1 + 55, 1075, Y1 + 55, m);
  hop(lt, 6.0, 7.2, 1275, Y1 + 55, 1335, Y1 + 55, m);
  ringPulse(1450, Y1 + 55, SC[3], lt, 8.8, 70, 40);
  hop(lt, 10.5, 11.5, 1565, Y1 + 55, 1650, Y1 + 55, RED);
  hop(lt, 12.4, 13.4, 1520, Y1 + h, 1700, Y2, C_OBJ, { s: 0.7 });
  hop(lt, 15.2, 16.6, 1450, Y1 + h, 1450, Y2, m);
  if (lt >= 16.6 && lt < 19.6) envelope(1290, Y2 + 55, m, { s: 0.85 });
  hop(lt, 19.6, 20.8, 1450, Y2 + h, 895, Y3 - 12, C_DB);
  hop(lt, 21.8, 22.6, 1450, Y2 + h, 1090, Y3 - 6, SC[0]);
  hop(lt, 22.4, 23.6, 1450, Y2 + h, 1330, Y3 - 6, C_SVC);
  hop(lt, 24.4, 25.6, 1440, Y3 + 50, 1560, Y3 + 50, SC[3]);
  if (lt > 8.8 && lt < 9.8) text('接收策略', 1450, Y1 - 10, { size: 22, color: SC[3], align: 'center', weight: 700, a: ap(lt, 8.8) });
  bullet(0, '负载均衡 → SMTP 服务器', ap(lt, 2.5)); bullet(1, '无效邮件直接拒绝', ap(lt, 10.3)); bullet(2, '大附件分离到对象存储', ap(lt, 12.3));
  bullet(3, '初步检查后入库、缓存、通知', ap(lt, 15.2)); bullet(4, '在线推送 · 离线上线后读取', ap(lt, 24.4));
}

// ───────── 5 附件与元数据分开存 ─────────
function sceneStore(lt) {
  header(lt, '05', '正文与附件分开存', C_OBJ, '先算一笔账');
  const chips = (y, items, t0, col, final, ft) => {
    let x = 810;
    items.forEach(([s], k) => {
      const p = ap(lt, t0 + k * 1.5, 0.5); ctx.save(); ctx.font = `700 26px ${MONO}`; const tw = ctx.measureText(s).width + 36; ctx.restore();
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
    text(`${Math.round(pb * p).toLocaleString('en-US')} PB / 年`, 810 + Math.max(barW(pb) * p, 12) + 20, y + 34, { size: 32, weight: 800, font: MONO, color: col, a: A });
    text(label, 810, y - 12, { size: 22, color: MUTE, a: A });
  };
  chips(230, [['10 亿用户'], ['40 封/天'], ['50 KB']], 5.3, C_DB, 0, 10.7);
  bar(330, 730, 10.7, 12.2, C_DB, '邮件数据（含正文）');
  chips(470, [['20% 带附件'], ['500 KB']], 13.1, C_OBJ, 0, 17.5);
  bar(570, 1460, 17.5, 19.6, C_OBJ, '附件（只占 20% 的邮件）');
  text('十进制 KB / PB，未计副本、索引与编码开销', 810, 660, { size: 20, color: DIM, a: ap(lt, 19.6) });
  // 分流示意
  const sp = ap(lt, 20.4);
  dbIcon(870, 720, 120, 110, '数据库', { color: C_DB, a: sp });
  bx(lt, 22.0, 1290, 726, 240, 100, '对象存储', { color: C_OBJ, sub: '附件字节', size: 32 });
  arrow(1030, 776, 1280, 776, { color: C_OBJ, dash: [8, 8], p: ap(lt, 23.7, 0.6), a: ap(lt, 23.7) });
  text('引用', 1155, 756, { size: 24, weight: 700, color: C_OBJ, align: 'center', a: ap(lt, 23.7) });
  statCard(110, 430, 640, '邮件数据', '730 PB/年', { color: C_DB, a: ap(lt, 10.7) });
  statCard(110, 570, 640, '附件', '1,460 PB/年', { color: C_OBJ, a: ap(lt, 17.5) });
  statCard(110, 710, 640, '附件占总字节', '2 / 3', { color: INK, a: ap(lt, 20.4), note: '合计约 2,190 PB' });
}

// ───────── 6 按用户分片 ─────────
const USERS = ['alice', 'bob', 'carol', 'dave'];
const ORDER = [0, 2, 1, 3, 0, 1, 2, 3, 0, 3, 2, 1];
const cx0 = 800, cwd = 235, cgap = 33.5;
function sceneShard(lt) {
  header(lt, '06', '按用户分片', C_DB, '分区键决定去哪台');
  const cy = 330, ch = 210;
  const focus = lt > 11.3 && lt < 22;
  USERS.forEach((u, i) => {
    const x = cx0 + i * (cwd + cgap), a = ap(lt, 0.7 + i * 0.15) * (focus && i !== 0 ? 0.35 : 1);
    glass(x, cy, cwd, ch, { a, accent: SC[i] });
    text(`shard ${i + 1}`, x + 22, cy + 46, { size: 30, weight: 800, font: MONO, color: SC[i], a });
    text(`user: ${u}`, x + 22, cy + 84, { size: 22, color: MUTE, font: MONO, a: a * ap(lt, 2.4) });
  });
  const cnt = [0, 0, 0, 0];
  ORDER.forEach((u, k) => {
    const s = cnt[u]++, t0 = 2.8 + k * 0.38, p = eIO(P(lt, t0, t0 + 0.9));
    const ox = 810 + k * 76, oy = 215, tx = cx0 + u * (cwd + cgap) + 16 + s * 72, ty = cy + 130;
    const x = lerp(ox, tx, p), y = lerp(oy, ty, p) - Math.sin(p * Math.PI) * 30;
    const born = ap(lt, 2.2 + k * 0.05, 0.4), dim = focus && u !== 0 ? 0.35 : 1;
    ctx.save(); ctx.globalAlpha *= born * dim; glow(SC[u], 8); rr(x, y, 64, 34, 10); ctx.fillStyle = SC[u] + '30'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = SC[u]; ctx.stroke(); ctx.shadowBlur = 0;
    text(`${USERS[u][0]}${s + 1}`, x + 32, y + 25, { size: 20, weight: 700, font: MONO, align: 'center' }); ctx.restore();
  });
  lab('每封信按收件人 user_id 路由', 800, 190, ap(lt, 2.4), { size: 20 });
  if (focus) text('获取 · 标已读 · 搜索：只访问一个分片', 800, 574, { size: 26, weight: 700, color: SC[0], a: ap(lt, 11.3) * (1 - P(lt, 21, 22)) });
  // 分片内的表
  const ta = ap(lt, 13.5);
  glass(800, 610, 1040, 300, { a: ta, accent: C_DB });
  const cols = [830, 1010, 1470];
  const colA = lt > 16.3 ? C_DB : INK, colB = lt > 18.7 ? C_QUEUE : INK;
  text('user_id', cols[0], 662, { size: 26, weight: 800, font: MONO, color: colA, a: ta });
  text('email_id (timeuuid)', cols[1], 662, { size: 26, weight: 800, font: MONO, color: colB, a: ta });
  text('subject', cols[2], 662, { size: 26, weight: 800, font: MONO, a: ta });
  if (lt > 16.3) { const p = ap(lt, 16.3); ctx.fillStyle = C_DB; rr(cols[0], 674, 100 * p, 4, 2); ctx.fill(); text('分区键 → 选分片', cols[0], 892, { size: 22, color: C_DB, weight: 700, a: p }); }
  if (lt > 18.7) { const p = ap(lt, 18.7); ctx.fillStyle = C_QUEUE; rr(cols[1], 674, 330 * p, 4, 2); ctx.fill(); text('聚簇键 → 片内排序', cols[1] + 40, 892, { size: 22, color: C_QUEUE, weight: 700, a: p }); }
  const rows = [['09:12:03', '周报'], ['09:40:51', '发票'], ['10:05:27', '会议纪要']];
  rows.forEach(([t, s], i) => {
    const a = ap(lt, 14.3 + i * 0.4, 0.5), y = 704 + i * 54;
    ctx.save(); ctx.globalAlpha *= a; rr(822, y, 1000, 46, 10); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill(); ctx.restore();
    text('alice', cols[0], y + 33, { size: 26, font: MONO, color: SC[0], a });
    text(`${t}`, cols[1], y + 33, { size: 26, font: MONO, a }); text(s, cols[2], y + 33, { size: 26, color: MUTE, a });
  });
  if (lt > 20.8) { const a = ap(lt, 20.8); arrow(1775, 712, 1775, 836, { color: C_QUEUE, p: ap(lt, 21.2, 1.2), a }); text('创建时间', 1755, 780, { size: 20, color: C_QUEUE, a, align: 'right', base: 'alphabetic' }); }
  text('示意', 1800, 662, { size: 20, color: DIM, align: 'right', a: ta });
  bullet(0, '同一用户 → 同一分片', ap(lt, 5.2)); bullet(1, '分区键 user_id：选分片', ap(lt, 13.5)); bullet(2, '聚簇键：片内排序', ap(lt, 18.7)); bullet(3, 'timeuuid：按创建时间', ap(lt, 20.8));
}

// ───────── 7 已读 / 未读的反规范化 ─────────
function sceneViews(lt) {
  header(lt, '07', '反规范化的代价', SC[3], '读省事，写有责任');
  // 过滤问题
  const fa = ap(lt, 1.4) * (1 - P(lt, 8.0, 9.2)) ;
  if (fa > 0) {
    glass(800, 200, 1040, 110, { a: fa, accent: RED });
    text('WHERE is_read = false', 840, 268, { size: 40, weight: 700, font: MONO, a: fa });
    const sp = ap(lt, 4.6, 0.6); ctx.save(); ctx.globalAlpha *= fa; ctx.fillStyle = RED; rr(836, 244, 520 * sp, 5, 2); ctx.fill(); ctx.restore();
    text('非键过滤 → 无界扫描', 1420, 266, { size: 28, weight: 700, color: RED, a: ap(lt, 5.0) * fa });
  }
  const tp = ap(lt, 7.5);
  const row = (x, y, label, unread, a = 1) => {
    ctx.save(); ctx.globalAlpha *= a; rr(x, y, 470, 46, 10); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.restore();
    dot(x + 28, y + 24, 7, unread ? SC[0] : DIM, { g: unread ? 10 : 0, a });
    text(label, x + 52, y + 33, { size: 26, weight: 600, font: MONO, a });
    text(unread ? '未读' : '已读', x + 452, y + 33, { size: 22, color: unread ? SC[0] : MUTE, align: 'right', a });
  };
  // 两张表
  const ux = 800, rx = 1340, ty = 330;
  const mv = eIO(P(lt, 13.3, 15.0)), sh = eIO(P(lt, 15.0, 15.7));
  const n = lt < 16.5 ? 4 : 3;
  glass(ux, ty - 10, 500, 340, { a: ap(lt, 9.6), accent: SC[0] });
  glass(rx, ty - 10, 500, 340, { a: ap(lt, 11.2), accent: C_CLIENT });
  text('未读表', ux + 20, ty + 34, { size: 30, weight: 800, color: SC[0], a: ap(lt, 9.6) });
  text(`未读 ${n}`, ux + 480, ty + 34, { size: 28, weight: 800, font: MONO, align: 'right', a: ap(lt, 9.6) });
  text('已读表', rx + 20, ty + 34, { size: 30, weight: 800, color: C_CLIENT, a: ap(lt, 11.2) });
  const unread = ['M1', 'M2', 'M3', 'M4'];
  unread.forEach((m, i) => {
    const a = ap(lt, 9.8 + i * 0.25, 0.5);
    let y = ty + 56 + i * 58, x = ux + 15;
    if (i === 2) { const q = mv; x = lerp(ux + 15, rx + 15, q); y = lerp(y, ty + 56 + 2 * 58, q) - Math.sin(q * Math.PI) * 50; row(x, y, m, q < 0.5, a); return; }
    if (i === 3) y -= 58 * sh;
    row(x, y, m, true, a);
  });
  ['M5', 'M6'].forEach((m, i) => row(rx + 15, ty + 56 + i * 58, m, false, ap(lt, 11.4 + i * 0.25, 0.5)));
  if (lt > 13.3 && lt < 15.3) ringPulse(ux + 240, ty + 56 + 2 * 58 + 23, SC[3], lt, 13.3, 60, 40);
  // 步骤
  const st = [['① 从未读表删除', 13.3, SC[0]], ['② 写入已读表', 15.0, C_CLIENT], ['③ 未读计数 −1', 16.4, SC[3]]];
  st.forEach(([s, t, c], i) => { const a = ap(lt, t); glass(800 + i * 358, 700, 330, 80, { a, accent: c, r: 20 }); text(s, 800 + i * 358 + 24, 750, { size: 26, weight: 700, a }); });
  const ia = ap(lt, 17.5);
  glass(800, 810, 1040, 90, { a: ia, accent: RED });
  text('事件会重复、会乱序 → 写入必须幂等', 830, 866, { size: 30, weight: 700, a: ia });
  text('记录已应用版本', 1810, 866, { size: 24, color: MUTE, align: 'right', a: ap(lt, 18.8) });
  bullet(0, '读：直接查对应的表', ap(lt, 9.6)); bullet(1, '写：同时维护多份视图', ap(lt, 13.3)); bullet(2, '重复、乱序要幂等', ap(lt, 17.5));
}

// ───────── 8 搜索与索引水位 ─────────
function sceneSearch(lt) {
  header(lt, '08', '搜索与索引', C_SEARCH, '异步写入，近实时可见');
  const w = 200, h = 110, Y = 210, xs = [800, 1080, 1360, 1640];
  bx(lt, 0.7, xs[0], Y, w, h, '主存', { color: C_DB, sub: '邮件库' });
  bx(lt, 10.3, xs[1], Y, w, h, 'Kafka', { color: C_QUEUE, sub: '变更队列' });
  bx(lt, 12.1, xs[2], Y, w, h, '索引消费者', { color: C_SVC, sub: 'indexer', size: 28 });
  bx(lt, 0.9, xs[3], Y, w, h, 'ES 索引', { color: C_SEARCH, sub: 'Elasticsearch', size: 32 });
  [1, 2, 3].forEach((i) => arrow(xs[i - 1] + w + 6, Y + 55, xs[i] - 6, Y + 55, { color: DIM, p: ap(lt, i === 1 ? 10.3 : i === 2 ? 12.1 : 12.4), a: ap(lt, i === 1 ? 10.3 : i === 2 ? 12.1 : 12.4) }));
  // 路由
  const sp = ap(lt, 4.4);
  [0, 1, 2].forEach((i) => { const x = 1650 + i * 66; glass(x, 350, 56, 56, { a: sp, r: 10, accent: i === 0 ? SC[0] : null }); if (i === 0 && lt > 7.0) dot(x + 28, 378, 9, SC[0], { g: 10, a: ap(lt, 7.0) }); else dot(x + 28, 378, 5, DIM, { g: 0, a: sp * 0.7 }); });
  text('按 user_id 路由', 1840, 446, { size: 22, color: MUTE, align: 'right', a: sp });
  if (lt > 7.0) text('同一用户 → 同一分片', 1840, 480, { size: 22, color: SC[0], align: 'right', a: ap(lt, 7.0), weight: 700 });
  // 信封流
  hop(lt, 10.3, 11.4, xs[0] + w, Y + 55, xs[1], Y + 55, '#fff', { s: 0.8 });
  hop(lt, 12.1, 13.3, xs[1] + w, Y + 55, xs[2], Y + 55, '#fff', { s: 0.8 });
  hop(lt, 13.3, 14.4, xs[2] + w, Y + 55, xs[3], Y + 55, C_SEARCH, { s: 0.8 });
  // 搜索框
  const sa = ap(lt, 14.5);
  glass(800, 360, 480, 64, { a: sa, r: 32 });
  text('搜索：发票', 836, 402, { size: 28, a: sa });
  arrow(1290, 392, 1636, 392, { color: C_SEARCH, p: ap(lt, 15.6, 0.7), a: ap(lt, 15.6), dash: [8, 7] });
  lab('同步查询', 1460, 374, ap(lt, 15.6), { align: 'center' });
  text('0 条', 1250, 464, { size: 30, weight: 800, font: MONO, color: RED, align: 'right', a: ap(lt, 17.2) * (1 - P(lt, 23.2, 23.8)) });
  text('刚收到的信，暂时搜不到', 800, 464, { size: 24, color: RED, a: ap(lt, 17.2) * (1 - P(lt, 23.2, 23.8)) });
  if (lt > 23.4) { text('发票：1 条', 1250, 464, { size: 30, weight: 800, font: MONO, color: SC[4], align: 'right', a: ap(lt, 23.4) }); }
  // 水位面板
  const pa = ap(lt, 18.4);
  glass(800, 520, 1040, 380, { a: pa, accent: C_QUEUE });
  text('定位水位 · Kafka 分区', 830, 566, { size: 28, weight: 700, color: C_QUEUE, a: pa });
  text('数字为示意', 1810, 566, { size: 20, color: DIM, align: 'right', a: pa });
  const X0 = 880, X1 = 1760, ty = 700, ox = (o) => X0 + ((o - 4270) / 50) * (X1 - X0);
  ctx.save(); ctx.globalAlpha *= pa; ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(X0, ty); ctx.lineTo(X1, ty); ctx.stroke(); ctx.restore();
  const cons = lerp(4280, 4315, eIO(P(lt, 20.8, 22.5)));
  // 积压区
  const lagA = P(lt, 20.5, 21.0);
  if (lagA > 0) { ctx.save(); ctx.globalAlpha *= lagA * 0.7; glow(SC[3], 10); ctx.fillStyle = SC[3]; rr(ox(cons), ty - 9, Math.max(ox(4315) - ox(cons), 0), 18, 8); ctx.fill(); ctx.restore(); }
  dot(ox(4312), ty, 10, '#fff', { g: 18, a: pa });
  text('这封信 4312', ox(4312), ty + 52, { size: 22, color: INK, align: 'center', weight: 700, a: pa });
  dot(ox(4315), ty, 7, C_QUEUE, { g: 10, a: pa });
  text('日志末尾 4315', ox(4315) + 30, ty + 92, { size: 22, color: C_QUEUE, align: 'right', weight: 700, a: pa });
  // 消费指针
  const cp = ap(lt, 20.5);
  ctx.save(); ctx.globalAlpha *= cp; ctx.fillStyle = C_SVC; glow(C_SVC, 12); ctx.beginPath(); ctx.moveTo(ox(cons), ty - 12); ctx.lineTo(ox(cons) - 14, ty - 40); ctx.lineTo(ox(cons) + 14, ty - 40); ctx.closePath(); ctx.fill(); ctx.restore();
  text(`消费进度 ${Math.round(cons)}`, Math.min(ox(cons), ox(4315) - 270), ty - 58, { size: 22, color: C_SVC, align: 'center', weight: 700, a: cp, font: MONO });
  // 步骤
  [['① 原信在主存', 18.6, C_DB], ['② 消费进度追上', 20.5, C_SVC], ['③ ES 写入成功', 22.5, C_SEARCH], ['④ 等待 refresh 可见', 23.7, SC[4]]].forEach(([s, t, c], i) => {
    const a = ap(lt, t), x = 816 + i * 256;
    glass(x, 790, 240, 70, { a, r: 18, accent: c }); text(s, x + 120, 834, { size: 23, weight: 700, align: 'center', a });
  });
  bullet(0, '写：主存 → Kafka → 索引', ap(lt, 10.3)); bullet(1, '读：搜索同步查询', ap(lt, 14.5)); bullet(2, '搜不到：先查主存', ap(lt, 18.6)); bullet(3, '再看队列水位', ap(lt, 20.5));
}

// ───────── 9 四层「成功」 ─────────
function sceneLevels(lt) {
  header(lt, '09', '成功有四层', SC[3], '别把一个对勾混着用');
  const L = [[['本系统', '接受发送'], SC[0], '10:00', 3.9], [['对方 SMTP', '接受'], SC[1], '10:01', 5.7], [['邮件进入', '收件箱'], SC[2], '10:02', 8.1], [['用户', '已读'], SC[3], '11:30', 9.9]];
  const lit = lt > 11.1;
  L.forEach(([ls, c, t, t0], i) => {
    const x = 800 + i * 262, a = ap(lt, t0) * (lit && i < 3 ? 0.4 : 1), p = eBack(P(lt, t0, t0 + 0.6));
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 24);
    glass(x, 250, 240, 230, { accent: c, r: 24, a: 1 });
    text(`0${i + 1}`, x + 24, 300, { size: 22, color: c, weight: 700, font: MONO, ls: 3 });
    text(ls[0], x + 24, 372, { size: 34, weight: 800 }); text(ls[1], x + 24, 420, { size: 34, weight: 800, color: c });
    ctx.restore();
    // 时间线
    const dx = x + 120;
    if (i < 3) { const q = ap(lt, L[i + 1][3] - 0.2, 0.5); arrow(dx + 14, 560, dx + 262 - 14, 560, { color: DIM, p: q, a: q * (lit ? 0.4 : 1), w: 3, head: 10 }); }
    dot(dx, 560, 12, c, { g: 14, a: a });
    text(t, dx, 614, { size: 28, weight: 700, font: MONO, align: 'center', color: INK, a });
  });
  text('示意时间', 800, 668, { size: 20, color: DIM, a: ap(lt, 3.9) });
  // ≠
  const na = ap(lt, 11.1);
  ctx.save(); ctx.globalAlpha *= na; ctx.strokeStyle = SC[3]; ctx.lineWidth = 3; glow(SC[3], 14); rr(800 + 3 * 262 - 8, 242, 256, 246, 28); ctx.stroke(); ctx.restore();
  const ba = ap(lt, 14.2);
  glass(800, 720, 1040, 130, { a: ba, accent: RED });
  text('SMTP 接受  ≠  用户已读', 836, 800, { size: 52, weight: 800, a: ba });
  statCard(110, 430, 640, '一个对勾，其实是', '4 种状态', { color: SC[3], a: ap(lt, 2.5) });
  bullet(3, '前三层都不能替代已读', ap(lt, 11.1), { y0: 520 }); bullet(4, '也可能被分类到垃圾箱', ap(lt, 12.6), { y0: 520, color: MUTE });
}

// ───────── 10 总结 ─────────
function sceneEnd(lt) {
  text('分布式邮件服务', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Distributed Email Service', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['SMTP', '服务器间传信；取信用 IMAP / POP / HTTP', SC[1]], ['分离存储', '元数据进数据库，附件进对象存储', SC[3]], ['按用户分片', 'user_id 分区，搜索也按它路由', SC[0]]].forEach(([w, s, c], k) => {
    const t0 = 2.2 + k * 1.5, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 580;
    glass(x, 400, 540, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 400, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 460, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 548, { size: w.length > 4 ? 60 : 70, weight: 800 });
    text(s, x + 36, 600, { size: 24, color: MUTE });
    ctx.restore();
  });
  const fa = ap(lt, 6.4);
  text('先可靠接收，再异步', 110, 740, { size: 26, color: MUTE, a: fa });
  let bxp = 110;
  ['投递', '建索引', '通知'].forEach((s, k) => { bxp += badge(bxp, 770, s, [C_QUEUE, C_SEARCH, SC[3]][k], ap(lt, 6.8 + k * 0.4)) + 16; });
}

export const scenes = { title: sceneTitle, proto: sceneProto, send: sceneSend, retry: sceneRetry, receive: sceneReceive, store: sceneStore, shard: sceneShard, views: sceneViews, search: sceneSearch, levels: sceneLevels, end: sceneEnd };
