// 第 10 章 通知系统：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC,
         rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet, hbar } from '../lib/core.js';

export const meta = { no: 10, title: '通知系统', en: 'Notification System' };

// 角色配色：触发=琥珀 通知服务器=靛 DB/缓存=青 队列=粉 worker=青柠 第三方=灰蓝
const C_TRIG = SC[3], C_SRV = SC[1], C_DB = SC[0], C_Q = SC[2], C_W = SC[4], C_TP = '#9aa6d6';
const ROWS = [['iOS 队列', 'APNS'], ['Android 队列', 'FCM'], ['短信队列', '短信服务商'], ['邮件队列', '邮件服务商']];
const rowY = (i) => 270 + i * 130;
const fade = (lt, a, b) => eOut(P(lt, a, b));
const frac = (x) => x - Math.floor(x);

// ───────── 小工具 ─────────
function polyLen(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function posAt(pts, p) {
  const L = polyLen(pts); let d = clamp(p) * L;
  for (let i = 1; i < pts.length; i++) {
    const s = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (d <= s || i === pts.length - 1) { const k = s ? clamp(d / s) : 0; return [lerp(pts[i - 1][0], pts[i][0], k), lerp(pts[i - 1][1], pts[i][1], k)]; }
    d -= s;
  }
  return pts[pts.length - 1];
}
function pk(pts, p, color, { r = 9, a = 1 } = {}) {
  if (p <= 0 || p >= 1 || a <= 0) return;
  for (let k = 4; k >= 0; k--) { const [x, y] = posAt(pts, p - k * 0.012); dot(x, y, r * (1 - k * 0.14), color, { g: k ? 0 : 18, a: a * (1 - k / 5.5) * 0.95 }); }
}
function line(x1, y1, x2, y2, color = 'rgba(143,152,176,0.55)', w = 3, a = 1, dash = null) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
}
function polyline(pts, color, w = 3, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); ctx.restore();
}
function drawX(x, y, s, color = RED, a = 1, w = 7) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; glow(color, 16);
  ctx.beginPath(); ctx.moveTo(x - s, y - s); ctx.lineTo(x + s, y + s); ctx.moveTo(x + s, y - s); ctx.lineTo(x - s, y + s); ctx.stroke(); ctx.restore();
}
function drawCheck(x, y, s, color = SC[4], a = 1, w = 7) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; glow(color, 16);
  ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.3, y + s * 0.7); ctx.lineTo(x + s, y - s * 0.7); ctx.stroke(); ctx.restore();
}
function ring(x, y, p, color, r0 = 30, r1 = 110) {
  if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.strokeStyle = color; ctx.globalAlpha = 1 - p; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, eOut(p)), 0, 7); ctx.stroke(); ctx.restore();
}
function tag(x, y, s, color, a = 1, size = 22) { // 居中小标签
  ctx.save(); ctx.font = `700 ${size}px ${SANS}`; const w = ctx.measureText(s).width + 28; ctx.restore();
  glass(x - w / 2, y - 22, w, 44, { r: 14, a, accent: color });
  text(s, x, y + 8, { size, weight: 700, color, align: 'center', a });
}
function stepCard(i, label, value, color, a, y0 = 430) { statCard(110, y0 + i * 126, 640, label, value, { color, a }); }

// ───────── 初版：单服务器直连 ─────────
function naiveDiag(lt, o = {}) {
  const { flow = 0, hot = false, aTr = 1, aSrv = 1, aDb = 1, aT = 1, load = 0, dimT = 1 } = o;
  const sy = 465;
  box(810, 415, 120, 100, '触发服务', { color: C_TRIG, size: 22, a: aTr });
  arrow(930, sy, 988, sy, { color: 'rgba(143,152,176,0.7)', w: 3, head: 11, a: Math.min(aTr, aSrv) });
  box(990, 375, 200, 180, '通知服务器', { color: C_SRV, hot, a: aSrv });
  if (load > 0) {
    ctx.save(); rr(1005, 520, 170, 14, 7); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.fillStyle = RED; glow(RED, 14); rr(1005, 520, Math.max(14, 170 * load), 14, 7); ctx.fill(); ctx.restore();
  }
  line(1050, 555, 1045, 652, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]);
  line(1140, 555, 1165, 662, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]);
  dbIcon(1005, 650, 80, 90, '数据库', { color: C_DB, a: aDb });
  box(1115, 662, 100, 70, '缓存', { color: C_DB, size: 24, a: aDb });
  ROWS.forEach(([, t], i) => {
    const y = rowY(i);
    arrow(1190, sy, 1470, y, { color: 'rgba(143,152,176,0.6)', w: 3, head: 11, a: aT * dimT, p: eOut(P(aT, 0, 1)) });
    box(1480, y - 40, 190, 80, t, { color: C_TP, size: 24, a: aT * dimT });
  });
  if (flow > 0) {
    ROWS.forEach((_, i) => {
      const pts = [[1190, sy], [1480, rowY(i)]], pin = [[930, sy], [990, sy]];
      const n = flow > 1 ? 3 : 1;
      for (let k = 0; k < n; k++) { const q = frac(lt * 0.34 + i * 0.21 + k / n); pk(pts, q, SC[0], { a: Math.min(1, flow) }); if (i === 0) pk(pin, q, SC[0], { a: Math.min(1, flow) }); }
    });
  }
}
function sceneNaive(lt) {
  header(lt, '01', '最直觉的设计', C_SRV, '一台服务器，直连第三方');
  naiveDiag(lt, { aTr: fade(lt, 1.0, 1.7), aSrv: fade(lt, 2.4, 3.2), aDb: fade(lt, 4.6, 5.4), aT: fade(lt, 7.6, 8.8), flow: P(lt, 9.5, 10.2) });
  bullet(0, '触发服务 → 通知服务器', fade(lt, 2.4, 3.0));
  bullet(1, '查库、渲染，再逐个调用', fade(lt, 5.0, 5.6));
  bullet(2, '推送 · 短信 · 邮件 服务商', fade(lt, 8.0, 8.6));
  statCard(110, 610, 640, '每天推送', '1000 万 条', { color: C_SRV, a: fade(lt, 12.2, 12.9) });
  statCard(110, 736, 310, '邮件', '500 万', { color: C_SRV, a: fade(lt, 14.2, 14.9) });
  statCard(440, 736, 310, '短信', '100 万', { color: C_SRV, a: fade(lt, 16.0, 16.7) });
}

// ───────── 三个毛病 ─────────
function sceneProblems(lt) {
  header(lt, '02', '三个毛病', RED, '为什么这个设计撑不住');
  const down = lt > 2.0 && lt < 6.0;
  const aRec = fade(lt, 6.0, 6.6);
  const load = P(lt, 12.2, 15.0);
  naiveDiag(lt, { flow: down ? 0 : (lt < 2 ? 1 : lt < 6.4 ? 0 : load > 0 ? 3 : 1), hot: down || load > 0.8, aT: 1, dimT: down ? 0.3 : 1, load: eIO(load) });
  // 单点故障：请求堆在触发端
  if (lt > 2.0) {
    const pa = lt < 6.0 ? fade(lt, 2.0, 2.8) : 1 - aRec;
    if (pa > 0) {
      for (let k = 0; k < 4; k++) dot(868, 396 - k * 22, 9, RED, { g: 10, a: pa * fade(lt, 2.6 + k * 0.35, 3.0 + k * 0.35) });
      drawX(1090, 465, 36, RED, pa * fade(lt, 2.0, 2.5), 9);
      tag(1090, 340, '全部通知停摆', RED, pa);
    }
  }
  // 耦合
  const br = fade(lt, 7.0, 7.9) * (1 - fade(lt, 11.4, 12.0));
  if (br > 0) {
    ctx.save(); ctx.globalAlpha *= br; ctx.strokeStyle = SC[3]; ctx.lineWidth = 3; ctx.setLineDash([12, 9]); glow(SC[3], 12);
    rr(968, 352, 270, 440, 26); ctx.stroke(); ctx.restore();
    tag(1103, 326, '绑在一起，只能整体扩容', SC[3], br);
  }
  // 性能瓶颈
  if (load > 0) tag(1090, 340, '发送占满资源', RED, fade(lt, 12.4, 13.0));
  stepCard(0, '毛病 1', '单点故障', RED, fade(lt, 1.6, 2.3));
  stepCard(1, '毛病 2', '耦合，难扩展', SC[3], fade(lt, 6.4, 7.1));
  stepCard(2, '毛病 3', '性能瓶颈', RED, fade(lt, 11.6, 12.3));
}

// ───────── 目标架构（共用） ─────────
const Q = { x: 1145, w: 160 }, WK = { x: 1350, w: 100 }, TH = { x: 1490, w: 190 }, USR = { x: 1770 };
const srvY = (k, sp) => lerp(465, 465 + (k - 1) * 150, eIO(sp));
function archPath(i, k = 1) {
  const sy = srvY(k, 1), y = rowY(i);
  return [[1100, sy], [1125, sy], [1125, y], [Q.x, y], [Q.x + Q.w, y], [WK.x, y], [WK.x + WK.w, y], [TH.x, y]];
}
// o: sp 服务器展开 0-1；aDb；aQ；aW；aT；aTr；qf[4]；hotRow；rowA[4]
function arch(lt, o = {}) {
  const { sp = 1, aDb = 1, aQ = 1, aW = 1, aT = 1, aTr = 1, aSrv = 1, qf = [0.15, 0.15, 0.15, 0.15], hotRow = -1, rowA = [1, 1, 1, 1], aOld = 0 } = o;
  box(810, 415, 120, 100, '触发服务', { color: C_TRIG, size: 22, a: aTr });
  // 旧的直连线（淡出）
  if (aOld > 0) ROWS.forEach((_, i) => arrow(1100, 465, 1480, rowY(i), { color: 'rgba(143,152,176,0.5)', w: 3, head: 11, a: aOld }));
  // 总线与队列
  [0, 1, 2].forEach((k) => {
    const a = (k === 1 ? 1 : sp) * aSrv; if (a <= 0) return;
    const y = srvY(k, sp);
    line(930, 465, 960, y, 'rgba(143,152,176,0.55)', 3, a);
    if (aQ > 0) line(1100, y, 1125, y, 'rgba(143,152,176,0.55)', 3, a * aQ);
  });
  if (aQ > 0) line(1125, 270, 1125, 660, 'rgba(143,152,176,0.45)', 3, aQ);
  [0, 1, 2].forEach((k) => {
    const a = (k === 1 ? 1 : eOut(sp)) * aSrv; if (a <= 0) return;
    box(960, srvY(k, sp) - 45, 140, 90, '通知服务器', { color: C_SRV, size: 22, a, s: k === 1 ? 1 : 0.7 + 0.3 * eOut(sp) });
  });
  // DB / 缓存
  if (aDb > 0) {
    line(1030, 665, 1030, 710, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]); line(1030, 710, 1145, 710, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]);
    line(1015, 710, 1015, 758, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]); line(1145, 710, 1145, 770, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]);
    dbIcon(975, 760, 80, 80, '数据库', { color: C_DB, a: aDb });
    box(1090, 772, 110, 64, '缓存', { color: C_DB, size: 24, a: aDb });
  }
  ROWS.forEach(([ql, tl], i) => {
    const y = rowY(i), ra = rowA[i], hot = hotRow === i;
    if (aQ > 0) {
      ctx.save(); ctx.globalAlpha *= aQ * ra;
      line(1125, y, Q.x, y, 'rgba(143,152,176,0.5)', 3);
      glass(Q.x, y - 40, Q.w, 80, { accent: hot ? RED : C_Q });
      text(ql, Q.x + Q.w / 2, y - 4, { size: 22, weight: 700, align: 'center' });
      rr(Q.x + 18, y + 12, Q.w - 36, 12, 6); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
      ctx.fillStyle = hot ? RED : C_Q; glow(hot ? RED : C_Q, 10); rr(Q.x + 18, y + 12, Math.max(12, (Q.w - 36) * qf[i]), 12, 6); ctx.fill();
      ctx.restore();
    }
    if (aW > 0) {
      line(Q.x + Q.w, y, WK.x, y, 'rgba(143,152,176,0.5)', 3, aW * ra); line(WK.x + WK.w, y, TH.x, y, 'rgba(143,152,176,0.5)', 3, aW * ra);
      box(WK.x, y - 35, WK.w, 70, 'worker', { color: C_W, size: 22, a: aW * ra });
    }
    if (aT > 0) box(TH.x, y - 40, TH.w, 80, tl, { color: C_TP, size: 24, a: aT * ra, hot });
  });
}

// ───────── 改进：队列 + worker ─────────
function sceneSplit(lt) {
  header(lt, '03', '改进设计', SC[4], '拆开，用队列连起来');
  const sp = eIO(P(lt, 5.0, 6.6));
  const qIn = fade(lt, 8.3, 9.3);
  arch(lt, { sp, aDb: fade(lt, 2.0, 2.8), aQ: qIn, aW: fade(lt, 12.2, 13.0), aOld: (1 - qIn) * fade(lt, 0.6, 1.2), aSrv: 1 });
  // 搬出数据库时的提示
  const t1 = fade(lt, 2.2, 3.0) * (1 - fade(lt, 4.6, 5.2));
  if (t1 > 0) tag(1330, 806, '独立部署', C_DB, t1);
  const t2 = fade(lt, 5.8, 6.6) * (1 - fade(lt, 8.0, 8.6));
  if (t2 > 0) tag(1030, 215, '水平扩展', C_SRV, t2);
  // 流动的包
  if (lt > 13.6) ROWS.forEach((_, i) => { for (let k = 0; k < 2; k++) pk(archPath(i, (i + k) % 3), frac(lt * 0.22 + i * 0.19 + k * 0.5), SC[0], { a: fade(lt, 13.6, 14.4) }); });
  bullet(0, '数据库、缓存搬出服务器', fade(lt, 2.0, 2.6));
  bullet(1, '通知服务器水平扩展', fade(lt, 5.0, 5.6));
  bullet(2, '消息队列解耦 + 缓冲', fade(lt, 8.3, 8.9));
  bullet(3, 'worker 取消息调第三方', fade(lt, 12.2, 12.8));
}

// ───────── 一条通知的完整路径 ─────────
const FL = [ // [t0, t1, 折线]
  [3.0, 4.6, [[930, 465], [1030, 465]]],
  [6.4, 8.4, [[1030, 465], [1125, 465], [1125, 270], [1225, 270]]],
  [10.4, 11.2, [[1225, 270], [1305, 270], [1400, 270]]],
  [11.8, 12.9, [[1400, 270], [1490, 270], [1585, 270]]],
  [13.3, 14.4, [[1585, 270], [1680, 270], [1770, 270]]],
];
function sceneFlow(lt) {
  header(lt, '04', '一条通知的路径', C_Q, '交给队列，业务方就可以走了');
  const step = lt < 3.0 ? -1 : lt < 5.8 ? 0 : lt < 10.2 ? 1 : lt < 11.6 ? 2 : lt < 13.3 ? 3 : 4;
  const rowA = [1, 0.28, 0.28, 0.28];
  const qf = [lt > 8.4 && lt < 10.6 ? 0.45 : 0.1, 0.1, 0.1, 0.1];
  arch(lt, { rowA, qf });
  // 用户
  const ua = fade(lt, 0.6, 1.2);
  ctx.save(); ctx.globalAlpha *= ua; glow(SC[0], 16); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(USR.x, 270, 42, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = SC[0]; ctx.stroke(); ctx.restore();
  text('用户', USR.x, 279, { size: 24, weight: 700, align: 'center', a: ua });
  line(1680, 270, 1726, 270, 'rgba(143,152,176,0.5)', 3, ua);
  // 当前节点高亮环
  const hl = [[810, 415, 120, 100], [960, 420, 140, 90], [1145, 230, 160, 80], [1350, 235, 100, 70], [1490, 230, 190, 80]][step];
  if (hl) { ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; glow('#ffffff', 16); ctx.globalAlpha = 0.65 + Math.sin(lt * 5) * 0.2; rr(hl[0] - 8, hl[1] - 8, hl[2] + 16, hl[3] + 16, 24); ctx.stroke(); ctx.restore(); }
  // 事件包（有因果的主角）
  let drawn = false;
  FL.forEach(([t0, t1, pts]) => { const p = P(lt, t0, t1); if (p > 0 && p < 1) { pk(pts, eIO(p), '#ffffff', { r: 11 }); drawn = true; } });
  if (!drawn) {
    const stops = [[3.0, 930, 465], [4.6, 1030, 465], [8.4, 1225, 270], [11.2, 1400, 270], [12.9, 1585, 270], [14.4, 1770, 270]];
    let sx = null;
    if (lt >= 3.0 && lt < 6.4) sx = [1030, 465]; else if (lt >= 8.4 && lt < 10.4) sx = [1225, 270]; else if (lt >= 11.2 && lt < 11.8) sx = [1400, 270]; else if (lt >= 12.9 && lt < 13.3) sx = [1585, 270]; else if (lt >= 14.4) sx = null;
    if (sx) dot(sx[0], sx[1], 11, '#ffffff', { g: 22 });
    void stops;
  }
  // 节点标注
  if (lt > 4.6 && lt < 6.4) { tag(1030, 355, '校验 · 取元数据', C_SRV, fade(lt, 4.8, 5.4) * (1 - fade(lt, 6.0, 6.4))); }
  if (lt > 14.4) { ring(USR.x, 270, P(lt, 14.4, 15.2), SC[4], 42, 90); drawCheck(USR.x, 350, 18, SC[4], fade(lt, 14.4, 14.9)); }
  const items = ['触发服务调用接口', '校验请求，取元数据', '事件放进消息队列', 'worker 取走并处理', '第三方送达用户'];
  items.forEach((s, i) => bullet(i, `${i + 1}  ${s}`, fade(lt, [3.0, 4.8, 8.2, 10.6, 13.0][i], [3.6, 5.4, 8.8, 11.2, 13.6][i]), { color: i === step ? '#fff' : MUTE }));
  const na = fade(lt, 15.6, 16.4);
  glass(110, 780, 640, 90, { a: na, accent: C_Q });
  text('业务方：交给队列，立即返回', 140, 838, { size: 30, weight: 700, a: na });
}

// ───────── 削峰与隔离 ─────────
function sceneIsolate(lt) {
  header(lt, '05', '削峰与隔离', C_Q, '一个渠道出事，不拖累别的');
  const burst = P(lt, 1.0, 3.0), drain = P(lt, 3.6, 6.4);
  const base = (i) => 0.12 + 0.6 * Math.sin(burst * Math.PI * 0.5) * (1 - eIO(drain)) + 0.0 * i;
  const smsFill = 0.14 + 0.86 * eIO(P(lt, 5.4, 11.0));
  const failT = lt > 5.2;
  const qf = [base(0), base(1), smsFill > 0.2 && failT ? smsFill : base(2), base(3)];
  qf[1] = base(1) + 0.04;
  arch(lt, { qf, hotRow: failT ? 2 : -1 });
  // 持续流动：高峰期更密，故障后短信行只进不出
  [0, 1, 2, 3].forEach((i) => {
    const pts = archPath(i, 1);
    const n = lt > 1.0 && lt < 4.2 ? 5 : 2;
    for (let k = 0; k < n; k++) {
      let p = frac(lt * (n > 2 ? 0.34 : 0.24) + i * 0.17 + k / n);
      if (i === 2 && failT) { p = p * 0.62; if (lt > 5.2 + 0.4) { /* 只进不出 */ } }
      pk(pts, p, i === 2 && failT ? RED : SC[0], { a: lt < 1.2 ? 0 : 1 });
    }
  });
  if (lt > 1.2 && lt < 4.8) tag(1225, 200, '突发高峰：队列缓冲', C_Q, fade(lt, 1.2, 1.8) * (1 - fade(lt, 4.2, 4.8)));
  if (failT) {
    const ta = fade(lt, 5.2, 5.8);
    tag(TH.x + 95, rowY(2) + 62, '服务商故障', RED, ta);
    drawX(TH.x - 20, rowY(2), 16, RED, ta, 6);
    tag(Q.x + 80, rowY(2) + 62, '只有它积压', RED, fade(lt, 7.4, 8.0));
  }
  bullet(0, '队列削平短期高峰', fade(lt, 1.0, 1.6));
  bullet(1, '渠道独立，故障互不影响', fade(lt, 4.8, 5.4));
  bullet(2, '队列不增加第三方的能力', fade(lt, 11.4, 12.0), { color: SC[3] });
  statCard(110, 610, 640, '短信队列', '积压中', { color: RED, a: fade(lt, 7.8, 8.5) });
  statCard(110, 736, 640, '推送 · 邮件', '照常投递', { color: SC[4], a: fade(lt, 8.6, 9.3) });
  if (lt > 12.0) {
    const a = fade(lt, 12.2, 13.0);
    tag(1560, 800, '积压不降：看渠道限额与 worker 吞吐', SC[3], a, 22);
  }
}

// ───────── 重试 ─────────
const RT = { wx: 830, tx: 1500, y: 480 };
function sceneRetry(lt) {
  header(lt, '06', '不丢、会重试', SC[3], '日志库 + 退避重试');
  box(RT.wx, 430, 150, 100, 'worker', { color: C_W, size: 26 });
  box(RT.tx, 430, 220, 100, '第三方服务', { color: C_TP, size: 26, hot: lt > 8.5 && lt < 9.6 || lt > 10.4 && lt < 11.5 });
  line(RT.wx + 150, RT.y, RT.tx, RT.y, 'rgba(143,152,176,0.5)', 3);
  // 日志库
  const la = fade(lt, 2.2, 3.0);
  dbIcon(1180, 190, 120, 120, '通知日志库', { color: C_DB, a: la });
  arrow(940, 428, 1170, 270, { color: 'rgba(143,152,176,0.6)', w: 3, head: 11, a: la, dash: [8, 8] });
  const p0 = P(lt, 3.0, 3.8); if (p0 > 0 && p0 < 1) packet(940, 428, 1170, 270, p0, SC[3]);
  ring(1240, 250, P(lt, 3.8, 4.5), C_DB, 60, 110);
  // 状态
  const st = lt < 3.8 ? ['—', MUTE] : lt < 7.8 ? ['排队中', SC[3]] : lt < 8.6 ? ['发送中', SC[1]] : lt < 11.8 ? ['失败，等待重试', RED] : lt < 12.5 ? ['发送中', SC[1]] : ['已被第三方接受', SC[4]];
  if (la > 0) { glass(1340, 215, 330, 64, { a: la, accent: st[1], r: 16 }); text(st[0], 1505, 256, { size: 26, weight: 700, color: st[1], align: 'center', a: la }); text('状态', 1340, 205, { size: 20, color: MUTE, a: la }); }
  // 三次尝试
  const att = [[7.8, 8.6, false], [9.6, 10.4, false], [11.6, 12.4, true]];
  att.forEach(([a, b, ok], k) => {
    const p = P(lt, a, b);
    pk([[RT.wx + 150, RT.y], [RT.tx, RT.y]], p, ok ? SC[4] : SC[3], { r: 11 });
    if (lt >= b) {
      const q = P(lt, b, b + 0.7);
      ring(RT.tx, RT.y, q, ok ? SC[4] : RED, 60, 130);
      if (ok) drawCheck(RT.tx - 70, RT.y - 62, 15, SC[4], lt < b + 1.4 ? fade(lt, b, b + 0.3) : fade(lt, b, b + 0.3));
      else drawX(RT.tx - 70, RT.y - 62, 14, RED, lt < b + 1.0 ? 1 : 1 - fade(lt, b + 1.0, b + 1.2), 6);
    }
  });
  // 退避时间轴（示意）
  const ta = fade(lt, 6.0, 6.8);
  text('重试间隔逐步拉长', 830, 640, { size: 26, weight: 600, a: ta });
  text('示意', 1830, 640, { size: 20, color: DIM, align: 'right', a: ta });
  const nx = [860, 1020, 1340];
  ctx.save(); ctx.globalAlpha *= ta; line(nx[0], 700, nx[2], 700, 'rgba(255,255,255,0.14)', 4); ctx.restore();
  att.forEach(([a, b, ok], k) => {
    const on = lt >= a, c = lt >= b ? (ok ? SC[4] : RED) : on ? SC[3] : DIM;
    ctx.save(); ctx.globalAlpha *= ta; glow(on ? c : 'transparent', 14); ctx.fillStyle = '#0a0d18'; ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(nx[k], 700, 22, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    text(`第 ${k + 1} 次`, nx[k], 760, { size: 22, color: on ? INK : DIM, align: 'center', weight: 600, a: ta });
  });
  text('等一会', (nx[0] + nx[1]) / 2, 690, { size: 20, color: MUTE, align: 'center', a: ta });
  text('等更久', (nx[1] + nx[2]) / 2, 690, { size: 20, color: MUTE, align: 'center', a: ta });
  // 过期验证码
  const ea = fade(lt, 13.0, 13.8);
  glass(1500, 740, 320, 120, { a: ea, accent: RED }); // 右下，与时间轴错开
  text('验证码 · 已过期', 1530, 788, { size: 26, weight: 700, a: ea });
  text('丢弃，不再发送', 1530, 836, { size: 26, weight: 700, color: RED, a: ea });
  bullet(0, '先写日志，崩溃能恢复', fade(lt, 2.4, 3.0));
  bullet(1, '失败重试，间隔拉长', fade(lt, 7.0, 7.6));
  bullet(2, '过期的通知不再重发', fade(lt, 12.8, 13.4));
}

// ───────── 去重 ─────────
const DD = { ax: 830, ay: 250, bx: 830, by: 650, sx: 1215, sy: 430, ux: 1700, uy: 520 };
function chipE(x, y, a = 1, color = SC[3], s = 1) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(s, s); glow(color, 10); rr(-52, -18, 104, 36, 11); ctx.fillStyle = color + '30'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke(); ctx.shadowBlur = 0; text('evt-42', 0, 7, { size: 20, weight: 700, align: 'center', font: MONO }); ctx.restore();
}
function sceneDedup(lt) {
  header(lt, '07', '去重', SC[2], '先查后发，为什么不够');
  const ph = lt < 6.6 ? 0 : lt < 13.3 ? 1 : 2, ps = [1.0, 6.8, 13.5][ph], u = lt - ps;
  // 底座
  dbIcon(DD.sx, DD.sy, 100, 100, '去重记录', { color: C_DB });
  box(DD.ax, DD.ay, 170, 90, 'worker A', { color: C_W, size: 24 });
  box(DD.bx, DD.by, 170, 90, 'worker B', { color: C_W, size: 24 });
  ctx.save(); glow(SC[0], 16); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(DD.ux, DD.uy, 52, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = SC[0]; ctx.stroke(); ctx.restore();
  text('用户', DD.ux, DD.uy + 9, { size: 26, weight: 700, align: 'center' });
  const qA = [[1000, 290], [1215, 455]], qB = [[1000, 700], [1215, 520]], sA = [[1000, 290], [1650, 500]], sB = [[1000, 700], [1655, 545]];
  arrow(1000, 295, 1210, 452, { color: 'rgba(143,152,176,0.35)', w: 3, head: 10, dash: [8, 8] });
  arrow(1000, 695, 1210, 522, { color: 'rgba(143,152,176,0.35)', w: 3, head: 10, dash: [8, 8] });
  arrow(1000, 285, 1640, 495, { color: 'rgba(143,152,176,0.3)', w: 3, head: 10 });
  arrow(1000, 705, 1645, 548, { color: 'rgba(143,152,176,0.3)', w: 3, head: 10 });
  const phaseNames = ['顺序到达：能挡住', '同时到达：挡不住', '原子占用：只放一个'];
  text(phaseNames[ph], 830, 176, { size: 28, weight: 700, color: [SC[4], RED, SC[4]][ph], a: fade(u, 0, 0.5) });
  let count = 0;
  const reply = (x, y, s, c, a) => tag(x, y, s, c, a);
  if (ph === 0) {
    const a1 = fade(u, 0, 0.5); chipE(915, 222, a1 * (1 - fade(u, 2.4, 2.8)));
    pk(qA, P(u, 0.8, 1.6), SC[1]); reply(1100, 395, '没见过', SC[4], fade(u, 1.6, 2.0) * (1 - fade(u, 3.0, 3.4)));
    ring(DD.sx + 50, DD.sy + 50, P(u, 1.9, 2.6), SC[2], 50, 100);
    if (u > 2.0) chipE(DD.sx + 50, DD.sy + 195, fade(u, 2.0, 2.5), SC[2], 0.8);
    pk(sA, P(u, 2.3, 3.3), SC[0], { r: 11 }); if (u > 3.3) count = 1;
    chipE(915, 605, fade(u, 3.4, 3.9) * (1 - fade(u, 5.2, 5.6)), SC[3]);
    pk(qB.map((p) => p), P(u, 4.0, 4.7), SC[1]); reply(1100, 625, '见过 → 丢弃', RED, fade(u, 4.7, 5.1));
    if (u > 5.0) drawX(1000, 695, 14, RED, fade(u, 5.0, 5.3), 6);
  } else if (ph === 1) {
    chipE(915, 222, fade(u, 0, 0.5) * (1 - fade(u, 2.6, 3.0))); chipE(915, 605, fade(u, 0, 0.5) * (1 - fade(u, 2.6, 3.0)));
    pk(qA, P(u, 0.9, 1.7), SC[1]); pk(qB, P(u, 0.9, 1.7), SC[1]);
    reply(1100, 395, '没见过', SC[4], fade(u, 1.7, 2.1)); reply(1100, 625, '没见过', SC[4], fade(u, 1.7, 2.1));
    pk(sA, P(u, 2.3, 3.4), SC[0], { r: 11 }); pk(sB, P(u, 2.3, 3.4), SC[0], { r: 11 });
    if (u > 3.4) count = 2;
    if (u > 3.4) ring(DD.ux, DD.uy, P(u, 3.4, 4.1), RED, 52, 110);
  } else {
    chipE(915, 222, fade(u, 0, 0.5) * (1 - fade(u, 2.6, 3.0))); chipE(915, 605, fade(u, 0, 0.5) * (1 - fade(u, 2.6, 3.0)));
    pk(qA, P(u, 0.9, 1.7), SC[2], { r: 11 }); pk(qB, P(u, 0.9, 1.7), SC[2], { r: 11 });
    reply(1100, 395, '占用成功', SC[4], fade(u, 1.8, 2.2)); reply(1100, 625, '已被占用', RED, fade(u, 1.8, 2.2));
    ring(DD.sx + 50, DD.sy + 50, P(u, 1.7, 2.4), SC[4], 50, 100);
    pk(sA, P(u, 2.4, 3.4), SC[0], { r: 11 }); if (u > 3.4) count = 1;
    if (u > 2.4) drawX(1000, 695, 14, RED, fade(u, 2.4, 2.8), 6);
    // 结论
    const ba = fade(u, 4.2, 5.0);
    let bx = 830; bx += badge(bx, 800, '幂等键', SC[2], ba) + 16; badge(bx, 800, '至少一次 + 去重', SC[4], ba);
  }
  text(`收到 ${count} 条`, DD.ux, 625, { size: 28, weight: 700, color: count > 1 ? RED : INK, align: 'center', font: MONO });
  [['顺序到达：先查后发有效', SC[4]], ['同时到达：都查到「没见过」', RED], ['原子占用 + 幂等键', SC[4]]].forEach(([s, c], i) =>
    bullet(i, s, fade(lt, [1.0, 6.8, 13.5][i], [1.6, 7.4, 14.1][i]), { color: ph === i ? '#fff' : MUTE, size: 28 }));
  statCard(110, 640, 640, '用户收到', `${count} 条`, { color: count > 1 ? RED : SC[4], a: fade(lt, 1.6, 2.2) });
  text('事件 ID 为示意', 110, 790, { size: 20, color: DIM, a: fade(lt, 1.6, 2.2) });
}

// ───────── 发送前的关卡 ─────────
const GT = [{ x: 960, t: '用户设置' }, { x: 1260, t: '限流' }, { x: 1560, t: '模板' }], GW = 230, GY = 380, GH = 330, PY = 545;
const SPEED = 990 / 2.6;
const PKS = [
  ...[ 'o', 'm', 'o', 'm', 'o', 'o' ].map((ty, i) => ({ t0: 1.5 + i * 0.6, ty, batch: 0, i })),
  ...[0, 1, 2, 3, 4].map((i) => ({ t0: 6.0 + i * 0.4, ty: 'o', batch: 1, i })),
];
function sceneGate(lt) {
  header(lt, '08', '发送之前的关卡', SC[1], '设置 · 限流 · 模板');
  const ga = fade(lt, 0.4, 1.2);
  GT.forEach((g, k) => {
    glass(g.x, GY, GW, GH, { a: ga, accent: '#8b8dfc' });
    text(g.t, g.x + GW / 2, GY + 52, { size: 28, weight: 800, align: 'center', a: ga });
  });
  // 用户设置内容
  [['订单通知', SC[0], true], ['营销推送', SC[3], false]].forEach(([s, c, on], i) => {
    const y = GY + 100 + i * 70;
    text(s, GT[0].x + 22, y + 34, { size: 24, weight: 600, color: c, a: ga });
    ctx.save(); ctx.globalAlpha *= ga; rr(GT[0].x + 160, y + 8, 56, 34, 17); ctx.fillStyle = on ? SC[4] + '55' : RED + '55'; ctx.fill(); ctx.strokeStyle = on ? SC[4] : RED; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = on ? SC[4] : RED; ctx.beginPath(); ctx.arc(GT[0].x + (on ? 199 : 177), y + 25, 12, 0, 7); ctx.fill(); ctx.restore();
  });
  text('退订的类型不发', GT[0].x + GW / 2, GY + 286, { size: 22, color: MUTE, align: 'center', a: ga });
  // 限流内容：3 格
  const passB = PKS.filter((p) => p.batch === 1 && lt > p.t0 + (GT[1].x - 840) / SPEED).length;
  for (let k = 0; k < 3; k++) {
    const x = GT[1].x + 28 + k * 62, on = passB > k;
    ctx.save(); ctx.globalAlpha *= ga; rr(x, GY + 100, 50, 60, 12); ctx.fillStyle = on ? SC[3] + '66' : 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.strokeStyle = on ? SC[3] : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
  text('同一用户的发送额度', GT[1].x + GW / 2, GY + 204, { size: 22, color: MUTE, align: 'center', a: ga });
  text('满了，多的不发', GT[1].x + GW / 2, GY + 286, { size: 22, color: passB >= 3 ? RED : MUTE, align: 'center', a: ga });
  // 模板内容
  const tm = fade(lt, 10.2, 11.0);
  text('你好 {name}', GT[2].x + 22, GY + 124, { size: 21, font: MONO, color: MUTE, a: ga });
  text('订单 {id} 已发货', GT[2].x + 22, GY + 168, { size: 21, font: MONO, color: MUTE, a: ga });
  text('统一格式，渲染更快', GT[2].x + GW / 2, GY + 286, { size: 22, color: MUTE, align: 'center', a: ga });
  if (tm > 0) { glass(GT[2].x + 14, GY + 196, GW - 28, 50, { a: tm, accent: SC[4], r: 14 }); text('已套用模板', GT[2].x + GW / 2, GY + 230, { size: 24, weight: 700, color: SC[4], align: 'center', a: tm }); }
  // 图例
  const ia = fade(lt, 1.0, 1.6);
  dot(840, 808, 9, SC[0], { a: ia }); text('订单通知', 862, 817, { size: 22, color: MUTE, a: ia });
  dot(1010, 808, 9, SC[3], { a: ia }); text('营销推送', 1032, 817, { size: 22, color: MUTE, a: ia });
  dot(1180, 808, 9, SC[4], { a: ia }); text('已套模板，发出', 1202, 817, { size: 22, color: MUTE, a: ia });
  // 包
  let rate = 0;
  PKS.forEach((p) => {
    const e = lt - p.t0; if (e < 0) return;
    let x = 840 + e * SPEED; if (x > 1830) return;
    let y = PY + (p.i % 3 - 1) * 22, col = p.ty === 'o' ? SC[0] : SC[3], a = 1;
    const drop = (gx) => (x > gx - 6 ? clamp((x - gx + 6) / 70) : 0);
    let dropped = false;
    if (p.ty === 'm') { const d = drop(GT[0].x); if (d > 0) { dropped = true; x = Math.min(x, GT[0].x - 6 + d * 30); y += eIO(d) * 120; col = RED; a = 1 - d * 0.9; } }
    if (!dropped && p.batch === 1 && p.i >= 3) { const d = drop(GT[1].x); if (d > 0) { dropped = true; x = Math.min(x, GT[1].x - 6 + d * 30); y += eIO(d) * 120; col = RED; a = 1 - d * 0.9; } }
    if (!dropped && x > GT[2].x) col = SC[4];
    if (a > 0) dot(x, y, 12, col, { g: 18, a });
  });
  const ba = fade(lt, 3.0, 3.6);
  bullet(0, '退订了就不发', fade(lt, 1.0, 1.6));
  bullet(1, '限制对同一用户的频率', fade(lt, 6.0, 6.6));
  bullet(2, '模板统一格式', fade(lt, 10.0, 10.6));
  void ba;
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('通知系统', 110, 250, { size: 84, weight: 900, a: fade(lt, 0.2, 0.9) });
  text('Notification System', 112, 304, { size: 32, color: MUTE, font: MONO, a: fade(lt, 0.4, 1.1) });
  [['队列', '事件持久化入队，渠道独立扩容', C_Q], ['重试 + 去重', '至少一次投递，用幂等键挡重复', SC[3]], ['设置 · 限流', '先查退订，再控频率', SC[0]]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.3, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 400, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 400, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 460, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 540, { size: k === 1 ? 56 : 66, weight: 800 });
    text(s, x + 36, 596, { size: 24, color: MUTE });
    ctx.restore();
  });
  const aa = fade(lt, 5.4, 6.2);
  text('接受 ≠ 送达 ≠ 展示 ≠ 打开', 110, 740, { size: 24, color: MUTE, a: aa });
  let bx = 110;
  [['已接受', SC[3]], ['已投递', SC[1]], ['已展示', SC[0]], ['已打开', SC[4]]].forEach(([s, c], k) => {
    bx += badge(bx, 770, s, c, fade(lt, 5.8 + k * 0.4, 6.6 + k * 0.4)) + 16;
    if (k < 3) { arrow(bx - 12, 796, bx + 10, 796, { color: DIM, w: 3, head: 9, a: fade(lt, 6.2 + k * 0.4, 6.8 + k * 0.4) }); bx += 14; }
  });
  text('是不同的状态，要分开记录', 110, 880, { size: 22, color: DIM, a: fade(lt, 7.6, 8.4) });
}

export const scenes = { naive: sceneNaive, problems: sceneProblems, split: sceneSplit, flow: sceneFlow, isolate: sceneIsolate, retry: sceneRetry, dedup: sceneDedup, gate: sceneGate, end: sceneEnd };
