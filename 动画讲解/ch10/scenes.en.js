// Chapter 10 Notification System: English scenes (shell and helpers from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC,
         rr, glass, text, glow, dot, badge, header as header0, arrow, box as box0, dbIcon, packet, bullet as bullet0, hbar } from '../lib/core.js';


function fitSize(str, size, weight, maxW) {
  ctx.save(); ctx.font = `${weight} ${size}px ${SANS}`; const w = ctx.measureText(str).width; ctx.restore();
  return Math.min(size, Math.floor(size * maxW / Math.max(w, 1)));
}
// 英文标题更宽：自适应字号，保证不超过左栏 640px
function header(lt, num, title, accent, sub) {
  const size = fitSize(title, 70, 800, 640);
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: fitSize(sub, 26, 500, 640), color: MUTE });
  ctx.restore();
}
function bullet(i, str, a, o = {}) { bullet0(i, str, a, { ...o, size: fitSize(str, o.size || 30, 600, 590) }); }
function statCard(x, y, w, label, value, { color = '#8b8dfc', a = 1, h = 112 } = {}) {
  if (a <= 0) return;
  glass(x, y, w, h, { a, accent: color });
  text(label, x + 30, y + 44, { size: 22, color: MUTE, a });
  ctx.save(); ctx.font = `800 48px ${MONO}`; const tw = ctx.measureText(value).width; ctx.restore();
  text(value, x + 30, y + 94, { size: Math.min(48, Math.floor(48 * (w - 60) / Math.max(tw, 1))), weight: 800, font: MONO, color, a });
}
// box：标签可含 \n 分两行；单行自动缩字号
function box(x, y, w, h, label, { color = '#8b8dfc', sub = null, a = 1, s = 1, hot = false, size = 28 } = {}) {
  if (a <= 0 || s <= 0) return;
  box0(x, y, w, h, '', { color, a, s, hot, size });
  const cx = x + w / 2, cy = y + h / 2, lines = label.split('\n');
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  if (lines.length > 1) {
    const sz = Math.min(size, ...lines.map((l) => fitSize(l, size, 700, w - 16)));
    lines.forEach((l, i) => text(l, cx, cy + sz * 0.35 + (i - (lines.length - 1) / 2) * (sz + 6) + 4, { size: sz, weight: 700, align: 'center' }));
  } else {
    const sz = fitSize(label, size, 700, w - 20);
    text(label, cx, sub ? cy - 2 : cy + sz * 0.35, { size: sz, weight: 700, align: 'center' });
    if (sub) text(sub, cx, cy + 32, { size: Math.round(size * 0.62), align: 'center', color: MUTE, font: MONO });
  }
  ctx.restore();
}
// 按英语旁白节拍重映射时间：anchors = [[英语场景时间, 中文版时间], ...]（纯函数，单调分段线性）
function warp(fn, anchors) {
  return (lt, d, sc) => {
    let t = lt;
    if (lt <= anchors[0][0]) t = anchors[0][1] * (anchors[0][0] ? lt / anchors[0][0] : 1);
    else if (lt >= anchors[anchors.length - 1][0]) { const [e, z] = anchors[anchors.length - 1]; t = z + (lt - e); }
    else for (let i = 1; i < anchors.length; i++) {
      if (lt <= anchors[i][0]) { const [e0, z0] = anchors[i - 1], [e1, z1] = anchors[i]; t = z0 + (z1 - z0) * (lt - e0) / (e1 - e0); break; }
    }
    return fn(t, d, sc);
  };
}

export const meta = { no: 10, title: 'Notification System', en: 'Notification System' };

// 角色配色：触发=琥珀 通知服务器=靛 DB/缓存=青 队列=粉 worker=青柠 第三方=灰蓝
const C_TRIG = SC[3], C_SRV = SC[1], C_DB = SC[0], C_Q = SC[2], C_W = SC[4], C_TP = '#9aa6d6';
const ROWS = [['iOS', 'APNS'], ['Android', 'FCM'], ['SMS', 'SMS Provider'], ['Email', 'Email Provider']];
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
  box(810, 415, 120, 100, 'Trigger', { color: C_TRIG, size: 22, a: aTr });
  arrow(930, sy, 988, sy, { color: 'rgba(143,152,176,0.7)', w: 3, head: 11, a: Math.min(aTr, aSrv) });
  box(990, 375, 200, 180, 'Notification\nServer', { color: C_SRV, hot, a: aSrv });
  if (load > 0) {
    ctx.save(); rr(1005, 520, 170, 14, 7); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.fillStyle = RED; glow(RED, 14); rr(1005, 520, Math.max(14, 170 * load), 14, 7); ctx.fill(); ctx.restore();
  }
  line(1050, 555, 1045, 652, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]);
  line(1140, 555, 1165, 662, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]);
  dbIcon(1005, 650, 80, 90, 'Database', { color: C_DB, a: aDb });
  box(1115, 662, 100, 70, 'Cache', { color: C_DB, size: 24, a: aDb });
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
  header(lt, '01', 'Simplest Design', C_SRV, 'One server, direct to providers');
  naiveDiag(lt, { aTr: fade(lt, 1.0, 1.7), aSrv: fade(lt, 2.4, 3.2), aDb: fade(lt, 4.6, 5.4), aT: fade(lt, 7.6, 8.8), flow: P(lt, 9.5, 10.2) });
  bullet(0, 'Trigger → Notification Server', fade(lt, 2.4, 3.0));
  bullet(1, 'Read DB, render, call each', fade(lt, 5.0, 5.6));
  bullet(2, 'Push · SMS · Email providers', fade(lt, 8.0, 8.6));
  statCard(110, 610, 640, 'Push per day', '10M', { color: C_SRV, a: fade(lt, 12.2, 12.9) });
  statCard(110, 736, 310, 'Email per day', '5M', { color: C_SRV, a: fade(lt, 14.2, 14.9) });
  statCard(440, 736, 310, 'SMS per day', '1M', { color: C_SRV, a: fade(lt, 16.0, 16.7) });
}

// ───────── 三个毛病 ─────────
function sceneProblems(lt) {
  header(lt, '02', 'Three Problems', RED, 'Why this design breaks down');
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
      tag(1090, 340, 'All notifications stop', RED, pa);
    }
  }
  // 耦合
  const br = fade(lt, 7.0, 7.9) * (1 - fade(lt, 11.4, 12.0));
  if (br > 0) {
    ctx.save(); ctx.globalAlpha *= br; ctx.strokeStyle = SC[3]; ctx.lineWidth = 3; ctx.setLineDash([12, 9]); glow(SC[3], 12);
    rr(968, 352, 270, 440, 26); ctx.stroke(); ctx.restore();
    tag(1103, 326, 'Tightly coupled: scale as one', SC[3], br);
  }
  // 性能瓶颈
  if (load > 0) tag(1090, 340, 'Sending hogs resources', RED, fade(lt, 12.4, 13.0));
  stepCard(0, 'Problem 1', 'Single point of failure', RED, fade(lt, 1.6, 2.3));
  stepCard(1, 'Problem 2', 'Tight coupling', SC[3], fade(lt, 6.4, 7.1));
  stepCard(2, 'Problem 3', 'Bottleneck', RED, fade(lt, 11.6, 12.3));
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
  box(810, 415, 120, 100, 'Trigger', { color: C_TRIG, size: 22, a: aTr });
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
    box(960, srvY(k, sp) - 45, 140, 90, 'Notification\nServer', { color: C_SRV, size: 20, a, s: k === 1 ? 1 : 0.7 + 0.3 * eOut(sp) });
  });
  // DB / 缓存
  if (aDb > 0) {
    line(1030, 665, 1030, 710, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]); line(1030, 710, 1145, 710, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]);
    line(1015, 710, 1015, 758, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]); line(1145, 710, 1145, 770, 'rgba(143,152,176,0.5)', 3, aDb, [7, 7]);
    dbIcon(975, 760, 80, 80, 'Database', { color: C_DB, a: aDb });
    box(1090, 772, 110, 64, 'Cache', { color: C_DB, size: 24, a: aDb });
  }
  if (aQ > 0) text('message queues', Q.x + Q.w / 2, rowY(3) + 64, { size: 20, color: MUTE, align: 'center', a: aQ });
  ROWS.forEach(([ql, tl], i) => {
    const y = rowY(i), ra = rowA[i], hot = hotRow === i;
    if (aQ > 0) {
      ctx.save(); ctx.globalAlpha *= aQ * ra;
      line(1125, y, Q.x, y, 'rgba(143,152,176,0.5)', 3);
      glass(Q.x, y - 40, Q.w, 80, { accent: hot ? RED : C_Q });
      text(ql, Q.x + Q.w / 2, y - 4, { size: fitSize(ql, 22, 700, 140), weight: 700, align: 'center' });
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
  header(lt, '03', 'Improved Design', SC[4], 'Split it up, connect with queues');
  const sp = eIO(P(lt, 5.0, 6.6));
  const qIn = fade(lt, 8.3, 9.3);
  arch(lt, { sp, aDb: fade(lt, 2.0, 2.8), aQ: qIn, aW: fade(lt, 12.2, 13.0), aOld: (1 - qIn) * fade(lt, 0.6, 1.2), aSrv: 1 });
  // 搬出数据库时的提示
  const t1 = fade(lt, 2.2, 3.0) * (1 - fade(lt, 4.6, 5.2));
  if (t1 > 0) tag(1330, 806, 'Deployed separately', C_DB, t1);
  const t2 = fade(lt, 5.8, 6.6) * (1 - fade(lt, 8.0, 8.6));
  if (t2 > 0) tag(1030, 215, 'Scale out', C_SRV, t2);
  // 流动的包
  if (lt > 13.6) ROWS.forEach((_, i) => { for (let k = 0; k < 2; k++) pk(archPath(i, (i + k) % 3), frac(lt * 0.22 + i * 0.19 + k * 0.5), SC[0], { a: fade(lt, 13.6, 14.4) }); });
  bullet(0, 'Move DB and cache out', fade(lt, 2.0, 2.6));
  bullet(1, 'Scale servers out', fade(lt, 5.0, 5.6));
  bullet(2, 'Queues decouple + buffer', fade(lt, 8.3, 8.9));
  bullet(3, 'Workers call third parties', fade(lt, 12.2, 12.8));
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
  header(lt, '04', 'One Notification', C_Q, 'Enqueue it, the caller is done');
  const step = lt < 3.0 ? -1 : lt < 5.8 ? 0 : lt < 10.2 ? 1 : lt < 11.6 ? 2 : lt < 13.3 ? 3 : 4;
  const rowA = [1, 0.28, 0.28, 0.28];
  const qf = [lt > 8.4 && lt < 10.6 ? 0.45 : 0.1, 0.1, 0.1, 0.1];
  arch(lt, { rowA, qf });
  // 用户
  const ua = fade(lt, 0.6, 1.2);
  ctx.save(); ctx.globalAlpha *= ua; glow(SC[0], 16); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(USR.x, 270, 42, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = SC[0]; ctx.stroke(); ctx.restore();
  text('User', USR.x, 279, { size: 24, weight: 700, align: 'center', a: ua });
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
  if (lt > 4.6 && lt < 6.4) { tag(1030, 355, 'Validate · fetch metadata', C_SRV, fade(lt, 4.8, 5.4) * (1 - fade(lt, 6.0, 6.4))); }
  if (lt > 14.4) { ring(USR.x, 270, P(lt, 14.4, 15.2), SC[4], 42, 90); drawCheck(USR.x, 350, 18, SC[4], fade(lt, 14.4, 14.9)); }
  const items = ['Trigger calls the API', 'Validate, fetch metadata', 'Event goes on the queue', 'Worker picks it up', 'Third party delivers'];
  items.forEach((s, i) => bullet(i, `${i + 1}  ${s}`, fade(lt, [3.0, 4.8, 8.2, 10.6, 13.0][i], [3.6, 5.4, 8.8, 11.2, 13.6][i]), { color: i === step ? '#fff' : MUTE }));
  const na = fade(lt, 15.6, 16.4);
  glass(110, 780, 640, 90, { a: na, accent: C_Q });
  text('Caller: enqueue, return at once', 140, 838, { size: fitSize('Caller: enqueue, return at once', 30, 700, 570), weight: 700, a: na });
}

// ───────── 削峰与隔离 ─────────
function sceneIsolate(lt) {
  header(lt, '05', 'Buffer & Isolate', C_Q, 'One channel fails, others stay up');
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
  if (lt > 1.2 && lt < 4.8) tag(1225, 200, 'Traffic spike: queues buffer', C_Q, fade(lt, 1.2, 1.8) * (1 - fade(lt, 4.2, 4.8)));
  if (failT) {
    const ta = fade(lt, 5.2, 5.8);
    tag(TH.x + 95, rowY(2) + 62, 'Provider down', RED, ta);
    drawX(TH.x - 20, rowY(2), 16, RED, ta, 6);
    tag(Q.x + 80, rowY(2) + 62, 'Only it backs up', RED, fade(lt, 7.4, 8.0));
  }
  bullet(0, 'Queues smooth short spikes', fade(lt, 1.0, 1.6));
  bullet(1, 'Channels are independent', fade(lt, 4.8, 5.4));
  bullet(2, "Queues don't add capacity", fade(lt, 11.4, 12.0), { color: SC[3] });
  statCard(110, 610, 640, 'SMS queue', 'Backing up', { color: RED, a: fade(lt, 7.8, 8.5) });
  statCard(110, 736, 640, 'Push · Email', 'Delivering', { color: SC[4], a: fade(lt, 8.6, 9.3) });
  if (lt > 12.0) {
    const a = fade(lt, 12.2, 13.0);
    tag(1560, 800, 'Backlog? Check limits & throughput', SC[3], a, 22);
  }
}

// ───────── 重试 ─────────
const RT = { wx: 830, tx: 1500, y: 480 };
function sceneRetry(lt) {
  header(lt, '06', 'Reliability', SC[3], 'Log DB + backoff retries');
  box(RT.wx, 430, 150, 100, 'worker', { color: C_W, size: 26 });
  box(RT.tx, 430, 220, 100, 'Third Party', { color: C_TP, size: 26, hot: lt > 8.5 && lt < 9.6 || lt > 10.4 && lt < 11.5 });
  line(RT.wx + 150, RT.y, RT.tx, RT.y, 'rgba(143,152,176,0.5)', 3);
  // 日志库
  const la = fade(lt, 2.2, 3.0);
  dbIcon(1180, 190, 120, 120, 'Log DB', { color: C_DB, a: la });
  arrow(940, 428, 1170, 270, { color: 'rgba(143,152,176,0.6)', w: 3, head: 11, a: la, dash: [8, 8] });
  const p0 = P(lt, 3.0, 3.8); if (p0 > 0 && p0 < 1) packet(940, 428, 1170, 270, p0, SC[3]);
  ring(1240, 250, P(lt, 3.8, 4.5), C_DB, 60, 110);
  // 状态
  const st = lt < 3.8 ? ['—', MUTE] : lt < 7.8 ? ['Queued', SC[3]] : lt < 8.6 ? ['Sending', SC[1]] : lt < 11.8 ? ['Failed, will retry', RED] : lt < 12.5 ? ['Sending', SC[1]] : ['Accepted by provider', SC[4]];
  if (la > 0) { glass(1340, 215, 330, 64, { a: la, accent: st[1], r: 16 }); text(st[0], 1505, 256, { size: 26, weight: 700, color: st[1], align: 'center', a: la }); text('Status', 1340, 205, { size: 20, color: MUTE, a: la }); }
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
  text('Retry gaps keep growing', 830, 640, { size: 26, weight: 600, a: ta });
  text('illustrative', 1830, 640, { size: 20, color: DIM, align: 'right', a: ta });
  const nx = [860, 1020, 1340];
  ctx.save(); ctx.globalAlpha *= ta; line(nx[0], 700, nx[2], 700, 'rgba(255,255,255,0.14)', 4); ctx.restore();
  att.forEach(([a, b, ok], k) => {
    const on = lt >= a, c = lt >= b ? (ok ? SC[4] : RED) : on ? SC[3] : DIM;
    ctx.save(); ctx.globalAlpha *= ta; glow(on ? c : 'transparent', 14); ctx.fillStyle = '#0a0d18'; ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(nx[k], 700, 22, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
    text(`Try ${k + 1}`, nx[k], 760, { size: 22, color: on ? INK : DIM, align: 'center', weight: 600, a: ta });
  });
  text('wait', (nx[0] + nx[1]) / 2, 690, { size: 20, color: MUTE, align: 'center', a: ta });
  text('wait longer', (nx[1] + nx[2]) / 2, 690, { size: 20, color: MUTE, align: 'center', a: ta });
  // 过期验证码
  const ea = fade(lt, 13.0, 13.8);
  glass(1500, 740, 320, 120, { a: ea, accent: RED }); // 右下，与时间轴错开
  text('Expired code', 1530, 788, { size: 26, weight: 700, a: ea });
  text('Drop it, never send', 1530, 836, { size: 26, weight: 700, color: RED, a: ea });
  bullet(0, 'Log first, recover after crash', fade(lt, 2.4, 3.0));
  bullet(1, 'Retry on failure, back off', fade(lt, 7.0, 7.6));
  bullet(2, 'Expired ones are not resent', fade(lt, 12.8, 13.4));
}

// ───────── 去重 ─────────
const DD = { ax: 830, ay: 250, bx: 830, by: 650, sx: 1215, sy: 430, ux: 1700, uy: 520 };
function chipE(x, y, a = 1, color = SC[3], s = 1) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x, y); ctx.scale(s, s); glow(color, 10); rr(-52, -18, 104, 36, 11); ctx.fillStyle = color + '30'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke(); ctx.shadowBlur = 0; text('evt-42', 0, 7, { size: 20, weight: 700, align: 'center', font: MONO }); ctx.restore();
}
function sceneDedup(lt) {
  header(lt, '07', 'Deduplication', SC[2], 'Why check-then-send fails');
  const ph = lt < 6.6 ? 0 : lt < 13.3 ? 1 : 2, ps = [1.0, 6.8, 13.5][ph], u = lt - ps;
  // 底座
  dbIcon(DD.sx, DD.sy, 100, 100, 'Dedup store', { color: C_DB });
  box(DD.ax, DD.ay, 170, 90, 'worker A', { color: C_W, size: 24 });
  box(DD.bx, DD.by, 170, 90, 'worker B', { color: C_W, size: 24 });
  ctx.save(); glow(SC[0], 16); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(DD.ux, DD.uy, 52, 0, 7); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = SC[0]; ctx.stroke(); ctx.restore();
  text('User', DD.ux, DD.uy + 9, { size: 26, weight: 700, align: 'center' });
  const qA = [[1000, 290], [1215, 455]], qB = [[1000, 700], [1215, 520]], sA = [[1000, 290], [1650, 500]], sB = [[1000, 700], [1655, 545]];
  arrow(1000, 295, 1210, 452, { color: 'rgba(143,152,176,0.35)', w: 3, head: 10, dash: [8, 8] });
  arrow(1000, 695, 1210, 522, { color: 'rgba(143,152,176,0.35)', w: 3, head: 10, dash: [8, 8] });
  arrow(1000, 285, 1640, 495, { color: 'rgba(143,152,176,0.3)', w: 3, head: 10 });
  arrow(1000, 705, 1645, 548, { color: 'rgba(143,152,176,0.3)', w: 3, head: 10 });
  const phaseNames = ['Sequential: blocked', 'Concurrent: slips through', 'Atomic claim: only one passes'];
  text(phaseNames[ph], 830, 176, { size: 28, weight: 700, color: [SC[4], RED, SC[4]][ph], a: fade(u, 0, 0.5) });
  let count = 0;
  const reply = (x, y, s, c, a) => tag(x, y, s, c, a);
  if (ph === 0) {
    const a1 = fade(u, 0, 0.5); chipE(915, 222, a1 * (1 - fade(u, 2.4, 2.8)));
    pk(qA, P(u, 0.8, 1.6), SC[1]); reply(1100, 395, 'Not seen', SC[4], fade(u, 1.6, 2.0) * (1 - fade(u, 3.0, 3.4)));
    ring(DD.sx + 50, DD.sy + 50, P(u, 1.9, 2.6), SC[2], 50, 100);
    if (u > 2.0) chipE(DD.sx + 50, DD.sy + 195, fade(u, 2.0, 2.5), SC[2], 0.8);
    pk(sA, P(u, 2.3, 3.3), SC[0], { r: 11 }); if (u > 3.3) count = 1;
    chipE(915, 605, fade(u, 3.4, 3.9) * (1 - fade(u, 5.2, 5.6)), SC[3]);
    pk(qB.map((p) => p), P(u, 4.0, 4.7), SC[1]); reply(1100, 625, 'Seen → drop', RED, fade(u, 4.7, 5.1));
    if (u > 5.0) drawX(1000, 695, 14, RED, fade(u, 5.0, 5.3), 6);
  } else if (ph === 1) {
    chipE(915, 222, fade(u, 0, 0.5) * (1 - fade(u, 2.6, 3.0))); chipE(915, 605, fade(u, 0, 0.5) * (1 - fade(u, 2.6, 3.0)));
    pk(qA, P(u, 0.9, 1.7), SC[1]); pk(qB, P(u, 0.9, 1.7), SC[1]);
    reply(1100, 395, 'Not seen', SC[4], fade(u, 1.7, 2.1)); reply(1100, 625, 'Not seen', SC[4], fade(u, 1.7, 2.1));
    pk(sA, P(u, 2.3, 3.4), SC[0], { r: 11 }); pk(sB, P(u, 2.3, 3.4), SC[0], { r: 11 });
    if (u > 3.4) count = 2;
    if (u > 3.4) ring(DD.ux, DD.uy, P(u, 3.4, 4.1), RED, 52, 110);
  } else {
    chipE(915, 222, fade(u, 0, 0.5) * (1 - fade(u, 2.6, 3.0))); chipE(915, 605, fade(u, 0, 0.5) * (1 - fade(u, 2.6, 3.0)));
    pk(qA, P(u, 0.9, 1.7), SC[2], { r: 11 }); pk(qB, P(u, 0.9, 1.7), SC[2], { r: 11 });
    reply(1100, 395, 'Claimed', SC[4], fade(u, 1.8, 2.2)); reply(1100, 625, 'Already taken', RED, fade(u, 1.8, 2.2));
    ring(DD.sx + 50, DD.sy + 50, P(u, 1.7, 2.4), SC[4], 50, 100);
    pk(sA, P(u, 2.4, 3.4), SC[0], { r: 11 }); if (u > 3.4) count = 1;
    if (u > 2.4) drawX(1000, 695, 14, RED, fade(u, 2.4, 2.8), 6);
    // 结论
    const ba = fade(u, 4.2, 5.0);
    let bx = 830; bx += badge(bx, 800, 'Idempotency key', SC[2], ba) + 16; badge(bx, 800, 'At-least-once + dedup', SC[4], ba);
  }
  text(`Received: ${count}`, DD.ux, 625, { size: 28, weight: 700, color: count > 1 ? RED : INK, align: 'center', font: MONO });
  [['Sequential: check works', SC[4]], ['Concurrent: both see "new"', RED], ['Atomic claim + idempotency key', SC[4]]].forEach(([s, c], i) =>
    bullet(i, s, fade(lt, [1.0, 6.8, 13.5][i], [1.6, 7.4, 14.1][i]), { color: ph === i ? '#fff' : MUTE, size: 28 }));
  statCard(110, 640, 640, 'User receives', `${count} message${count === 1 ? '' : 's'}`, { color: count > 1 ? RED : SC[4], a: fade(lt, 1.6, 2.2) });
  text('Event ID is illustrative', 110, 790, { size: 20, color: DIM, a: fade(lt, 1.6, 2.2) });
}

// ───────── 发送前的关卡 ─────────
const GT = [{ x: 960, t: 'Settings' }, { x: 1260, t: 'Rate Limit' }, { x: 1560, t: 'Template' }], GW = 230, GY = 380, GH = 330, PY = 545;
const SPEED = 990 / 2.6;
const PKS = [
  ...[ 'o', 'm', 'o', 'm', 'o', 'o' ].map((ty, i) => ({ t0: 1.5 + i * 0.6, ty, batch: 0, i })),
  ...[0, 1, 2, 3, 4].map((i) => ({ t0: 6.0 + i * 0.4, ty: 'o', batch: 1, i })),
];
function sceneGate(lt) {
  header(lt, '08', 'Gates Before Send', SC[1], 'Settings · Rate limit · Template');
  const ga = fade(lt, 0.4, 1.2);
  GT.forEach((g, k) => {
    glass(g.x, GY, GW, GH, { a: ga, accent: '#8b8dfc' });
    text(g.t, g.x + GW / 2, GY + 52, { size: 28, weight: 800, align: 'center', a: ga });
  });
  // 用户设置内容
  [['Orders', SC[0], true], ['Promos', SC[3], false]].forEach(([s, c, on], i) => {
    const y = GY + 100 + i * 70;
    text(s, GT[0].x + 22, y + 34, { size: 24, weight: 600, color: c, a: ga });
    ctx.save(); ctx.globalAlpha *= ga; rr(GT[0].x + 160, y + 8, 56, 34, 17); ctx.fillStyle = on ? SC[4] + '55' : RED + '55'; ctx.fill(); ctx.strokeStyle = on ? SC[4] : RED; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = on ? SC[4] : RED; ctx.beginPath(); ctx.arc(GT[0].x + (on ? 199 : 177), y + 25, 12, 0, 7); ctx.fill(); ctx.restore();
  });
  text('Opted out: skip', GT[0].x + GW / 2, GY + 286, { size: 22, color: MUTE, align: 'center', a: ga });
  // 限流内容：3 格
  const passB = PKS.filter((p) => p.batch === 1 && lt > p.t0 + (GT[1].x - 840) / SPEED).length;
  for (let k = 0; k < 3; k++) {
    const x = GT[1].x + 28 + k * 62, on = passB > k;
    ctx.save(); ctx.globalAlpha *= ga; rr(x, GY + 100, 50, 60, 12); ctx.fillStyle = on ? SC[3] + '66' : 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.strokeStyle = on ? SC[3] : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
  text('Per-user quota', GT[1].x + GW / 2, GY + 204, { size: 22, color: MUTE, align: 'center', a: ga });
  text('Over quota: drop', GT[1].x + GW / 2, GY + 286, { size: 22, color: passB >= 3 ? RED : MUTE, align: 'center', a: ga });
  // 模板内容
  const tm = fade(lt, 10.2, 11.0);
  text('Hi {name}', GT[2].x + 22, GY + 124, { size: 21, font: MONO, color: MUTE, a: ga });
  text('Shipped: {id}', GT[2].x + 22, GY + 168, { size: 21, font: MONO, color: MUTE, a: ga });
  text('Consistent format', GT[2].x + GW / 2, GY + 286, { size: 22, color: MUTE, align: 'center', a: ga });
  if (tm > 0) { glass(GT[2].x + 14, GY + 196, GW - 28, 50, { a: tm, accent: SC[4], r: 14 }); text('Formatted', GT[2].x + GW / 2, GY + 230, { size: 24, weight: 700, color: SC[4], align: 'center', a: tm }); }
  // 图例
  const ia = fade(lt, 1.0, 1.6);
  dot(840, 808, 9, SC[0], { a: ia }); text('Orders', 862, 817, { size: 22, color: MUTE, a: ia });
  dot(1010, 808, 9, SC[3], { a: ia }); text('Promos', 1032, 817, { size: 22, color: MUTE, a: ia });
  dot(1180, 808, 9, SC[4], { a: ia }); text('Templated, sent', 1202, 817, { size: 22, color: MUTE, a: ia });
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
  bullet(0, 'Opted out? Skip it', fade(lt, 1.0, 1.6));
  bullet(1, 'Cap frequency per user', fade(lt, 6.0, 6.6));
  bullet(2, 'Templates unify format', fade(lt, 10.0, 10.6));
  void ba;
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('Notification System', 110, 250, { size: 84, weight: 900, a: fade(lt, 0.2, 0.9) });
  text('Chapter 10', 112, 304, { size: 32, color: MUTE, font: MONO, a: fade(lt, 0.4, 1.1) });
  [['Queues', 'Durable events, scale per channel', C_Q], ['Retry + Dedup', 'At-least-once, idempotency key', SC[3]], ['Settings · Limits', 'Check opt-outs, then throttle', SC[0]]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.3, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 400, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 400, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 460, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 540, { size: fitSize(w, 66, 800, 450), weight: 800 });
    text(s, x + 36, 596, { size: 24, color: MUTE });
    ctx.restore();
  });
  const aa = fade(lt, 5.4, 6.2);
  text('Accepted ≠ Delivered ≠ Displayed ≠ Opened', 110, 740, { size: 24, color: MUTE, a: aa });
  let bx = 110;
  [['Accepted', SC[3]], ['Delivered', SC[1]], ['Displayed', SC[0]], ['Opened', SC[4]]].forEach(([s, c], k) => {
    bx += badge(bx, 770, s, c, fade(lt, 5.8 + k * 0.4, 6.6 + k * 0.4)) + 16;
    if (k < 3) { arrow(bx - 12, 796, bx + 10, 796, { color: DIM, w: 3, head: 9, a: fade(lt, 6.2 + k * 0.4, 6.8 + k * 0.4) }); bx += 14; }
  });
  text('Distinct states: record them separately', 110, 880, { size: 22, color: DIM, a: fade(lt, 7.6, 8.4) });
}

export const scenes = { naive: warp(sceneNaive, [[0, 0], [2.2, 2.4], [5.8, 4.6], [9.5, 7.6], [11, 9.5], [16, 12.2], [18.7, 14.2], [20.5, 16.0], [23, 18.7]]), problems: warp(sceneProblems, [[0, 0], [2.6, 1.6], [7.8, 6.0], [8.3, 6.4], [14.2, 11.6], [14.8, 12.2], [17.2, 15.0], [19.7, 16.9]]), split: warp(sceneSplit, [[0, 0], [2.3, 2.0], [5.5, 5.0], [8.9, 8.3], [12.3, 12.2], [14.5, 13.8], [18.8, 17.35]]), flow: warp(sceneFlow, [[0, 0], [2.8, 3.0], [5.1, 4.8], [8.0, 6.4], [10.5, 8.4], [11.7, 10.4], [13.4, 11.8], [15.0, 13.3], [16.0, 14.4], [17.1, 15.6], [21.4, 17.16]]), isolate: warp(sceneIsolate, [[0, 0], [0.7, 0.9], [3.4, 3.6], [6.3, 5.2], [9.0, 7.4], [11.0, 8.6], [13.0, 11.4], [16.2, 12.2], [22.4, 18.2]]), retry: warp(sceneRetry, [[0, 0], [3.2, 2.2], [5.0, 3.0], [7.5, 4.6], [9.7, 6.0], [10.6, 7.8], [12.3, 10.0], [14.3, 13.0], [19.5, 16.06]]), dedup: warp(sceneDedup, [[0, 0], [1.0, 0.6], [2.4, 1.0], [6.2, 6.6], [11.0, 13.3], [11.2, 13.5], [15.0, 17.7], [22.1, 20.28]]), gate: warp(sceneGate, [[0, 0], [0.7, 0.4], [3.4, 1.0], [4.0, 1.5], [8.7, 6.0], [12.8, 10.0], [18.1, 14.47]]), end: warp(sceneEnd, [[0, 0], [2.3, 1.2], [3.6, 2.5], [5.0, 3.8], [7.0, 5.4], [11.0, 7.6], [13.6, 10.08]]) };
