// 第 3 章 系统设计面试框架：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC,
         rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 3, title: '系统设计面试框架', en: 'System Design Framework' };

// ───────── 贯穿全片的 45 分钟时间轴 ─────────
// 示意分配 8 + 12 + 20 + 5 = 45（书中为区间：3–10 / 10–15 / 10–25 / 3–5 分钟）
const SEG = [[0, 8, '理解问题', SC[0]], [8, 20, '高层设计', SC[1]], [20, 40, '深入设计', SC[2]], [40, 45, '收尾', SC[3]]];
const FLAGS = [[10, '需求 + 核心 API'], [20, '高层图 + 量级'], [40, '停止加组件']];
function timeline(lt, o = {}) {
  const { x0 = 830, w = 980, y = 190, h = 44, active = -1, grow = [1, 1, 1, 1], labels = 'name', labelA = [1, 1, 1, 1],
          play = null, flags = [0, 0, 0], a = 1, size = 22 } = o;
  const mx = (m) => x0 + (m / 45) * w;
  ctx.save(); ctx.globalAlpha *= a;
  SEG.forEach(([s, e, name, c], i) => {
    const g = grow[i]; if (g <= 0) return;
    const sx = mx(s), ww = (mx(e) - sx - 4) * g, on = active === i, dim = active >= 0 && !on;
    ctx.save(); ctx.globalAlpha *= dim ? 0.38 : 1;
    if (on) glow(c, 22);
    rr(sx, y, ww, h, h / 2.6); ctx.fillStyle = c + (on ? '55' : '26'); ctx.fill();
    ctx.lineWidth = on ? 2.5 : 1.8; ctx.strokeStyle = c; ctx.stroke(); ctx.shadowBlur = 0;
    ctx.restore();
    if (g > 0.95 && labelA[i] > 0) {
      const lab = labels === 'min' ? `${e - s}′` : `${name} ${e - s}′`;
      text(lab, sx + (mx(e) - sx - 4) / 2, y + h / 2 + size * 0.36, { size, weight: 700, align: 'center', color: dim ? MUTE : INK, a: labelA[i] * (labels === 'min' ? 1 : 1) });
    }
  });
  FLAGS.forEach(([m, lab], i) => {
    const f = flags[i]; if (f <= 0) return;
    const x = mx(m);
    ctx.save(); ctx.globalAlpha *= f; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + h + 26); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    dot(x, y + h + 28, 5, i === 2 ? RED : '#ffffff', { g: 10, a: f });
    text(`${m}′ ${lab}`, x, y + h + 62, { size: 20, color: i === 2 ? RED : MUTE, align: 'center', weight: 600, a: f });
  });
  if (play !== null) {
    const x = mx(clamp(play, 0, 45));
    ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; glow('#ffffff', 14);
    ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x, y + 1); ctx.moveTo(x, y + h - 1); ctx.lineTo(x, y + h + 10); ctx.stroke(); ctx.restore();
    dot(x, y - 14, 7, '#fff', { g: 18 });
    text(`第 ${Math.floor(play)} 分钟`, x, y - 32, { size: 20, font: MONO, weight: 700, align: 'center' });
  }
  ctx.restore();
}
// 自定义左栏标题（STEP 之外的标签）
function hd(lt, tag, title, accent, sub) {
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(tag, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size: 70, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: 26, color: MUTE });
  ctx.restore();
}
const typed = (s, p) => s.slice(0, Math.floor(s.length * clamp(p)));
function cross(x, y, w, h, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = RED; ctx.lineWidth = 6; ctx.lineCap = 'round'; glow(RED, 12);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + h); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.stroke(); ctx.restore();
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  text('45′', 1810, 640, { size: 300, weight: 900, color: 'rgba(139,141,252,0.14)', align: 'right', font: MONO, a });
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 1000, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  const k = eOut(P(lt, 0.4, 1.4));
  ctx.save(); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 112px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('系统设计面试框架', 104, 520); ctx.restore();
  text('System Design Framework', 112, 590, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 3 章', 112, 680, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
  const gr = SEG.map((_, i) => eOut(P(lt, 1.6 + i * 0.5, 2.4 + i * 0.5)));
  timeline(lt, { x0: 110, w: 1700, y: 790, h: 56, grow: gr, size: 26, play: lt > 3.4 ? 45 * eIO(P(lt, 3.4, 7.2)) : null, a: 1 });
}

// ───────── 总览：四步 + 时间预算 ─────────
function sceneOverview(lt) {
  hd(lt, 'OVERVIEW', '四步框架', SC[1], '四十五分钟的时间预算');
  const T = [8.7, 9.8, 10.9, 12.0], M = [15.3, 16.2, 17.3, 18.4];
  timeline(lt, { y: 330, h: 84, labels: 'min', size: 34, grow: T.map((t) => eOut(P(lt, t, t + 0.7))), labelA: M.map((t) => eOut(P(lt, t, t + 0.5))), a: eOut(P(lt, 6.4, 7.2)) });
  const C = [['01', '理解问题', '澄清需求，锁定范围', '书中 3–10 分钟'], ['02', '高层设计', '画蓝图，取得共识', '书中 10–15 分钟'],
             ['03', '深入设计', '只挖最关键的瓶颈', '书中 10–25 分钟'], ['04', '收尾', '回顾取舍，谈演进', '书中 3–5 分钟']];
  C.forEach(([n, t, s, r], i) => {
    const x = 830 + (i % 2) * 520, y = 520 + Math.floor(i / 2) * 180, a = eOut(P(lt, T[i], T[i] + 0.7)), c = SEG[i][3];
    glass(x, y, 490, 156, { accent: c, a });
    text(n, x + 28, y + 44, { size: 22, color: c, font: MONO, weight: 700, ls: 3, a });
    text(t, x + 28, y + 96, { size: 38, weight: 800, a });
    text(s, x + 28, y + 136, { size: 24, color: MUTE, a });
    text(r, x + 462, y + 44, { size: 20, color: DIM, font: MONO, align: 'right', a });
  });
  text('典型分配（示意）：8 + 12 + 20 + 5 = 45', 830, 478, { size: 24, color: MUTE, a: eOut(P(lt, 15.3, 16.1)) });
  bullet(0, '不是想到哪儿答到哪儿', eOut(P(lt, 4.0, 4.7)));
  bullet(1, '四步，各有时间预算', eOut(P(lt, 6.5, 7.2)));
  statCard(110, 600, 640, '总时长', '45 分钟', { color: SC[1], a: eOut(P(lt, 12.7, 13.4)), note: '8 + 12 + 20 + 5' });
}

// ───────── 第 1 步：先提问 ─────────
const ASK = [
  { q: '按什么排序？', out: '时间 + ID 游标', sub: '只按时间倒序，不需要推荐系统', c: SC[0], tq: 3.8, to: 8.0 },
  { q: '好友数量有多大？', out: '发帖要扇出给多少人', sub: '名人会压垮扇出队列', c: SC[2], tq: 10.6, to: 12.5 },
  { q: '有图片视频吗？', out: '对象存储 + CDN', sub: '帖子里只存媒体引用', c: SC[3], tq: 15.4, to: 17.3 },
];
function sceneAsk(lt) {
  header(lt, '01', '先提问', SC[0], '理解问题，确定设计范围');
  timeline(lt, { active: 0, play: lerp(0, 5, P(lt, 0.5, 20)) });
  ASK.forEach((r, k) => {
    const y = 340 + k * 170, qa = eOut(P(lt, r.tq, r.tq + 0.6)), oa = eOut(P(lt, r.to, r.to + 0.6));
    glass(830, y, 400, 130, { accent: r.c, a: qa });
    text(`Q${k + 1}`, 858, y + 40, { size: 20, color: r.c, font: MONO, weight: 700, a: qa });
    text(r.q, 858, y + 92, { size: 34, weight: 700, a: qa });
    arrow(1244, y + 65, 1326, y + 65, { color: r.c, p: eOut(P(lt, r.to - 0.3, r.to + 0.3)), g: 8 });
    glass(1340, y, 500, 130, { accent: r.c, a: oa, fill: 0.09 });
    text(r.out, 1368, y + 60, { size: 32, weight: 800, color: r.c, a: oa });
    text(r.sub, 1368, y + 98, { size: 24, color: MUTE, a: oa });
    bullet(k, ['排序规则', '关注规模', '内容类型'][k], qa);
  });
  badge(110, 640, '好问题 = 能改变设计', SC[0], eOut(P(lt, 3.8, 4.5)));
  text('不改变方案的问题，不用问', 110, 744, { size: 26, color: MUTE, a: eOut(P(lt, 19.0, 19.8)) });
}

// ───────── 第 1 步（续）：写下假设，取得确认 ─────────
function sceneAssume(lt) {
  header(lt, '01', '写下假设', SC[0], '没有数字，就主动提初始值');
  timeline(lt, { active: 0, play: lerp(5, 10, P(lt, 0.5, 17.4)), flags: [eOut(P(lt, 16.8, 17.6)), 0, 0] });
  const ba = eOut(P(lt, 1.9, 2.6));
  glass(830, 340, 480, 360, { accent: SC[0], a: ba });
  text('白板 · 假设', 860, 384, { size: 22, color: MUTE, a: ba });
  text('示意', 1280, 384, { size: 20, color: DIM, align: 'right', a: ba });
  const L = [['用户规模', '≈ 1000 万', 9.6], ['读写比', '读远多于写', 11.4], ['排序', '时间倒序', 12.8], ['范围外', '暂不做推荐', 13.8]];
  L.forEach(([k, v, t0], i) => {
    const y = 450 + i * 62;
    text(k, 860, y, { size: 26, color: MUTE, a: ba });
    if (i === 0 && lt < t0) text('?', 1010, y, { size: 30, color: DIM, font: MONO, a: eOut(P(lt, 3.5, 4.1)) });
    const s = typed(v, P(lt, t0, t0 + 1.0));
    text(s, 1010, y, { size: 30, weight: 700, color: SC[0], font: i === 0 ? MONO : SANS });
  });
  badge(830, 730, '主动提一个初始值', SC[4], eOut(P(lt, 4.7, 5.4)));
  badge(1100, 730, '邀请面试官修正', SC[3], eOut(P(lt, 7.0, 7.7)));
  // 对话
  const b1 = eOut(P(lt, 9.0, 9.8));
  glass(1340, 340, 500, 190, { accent: SC[0], a: b1 });
  text('你', 1368, 380, { size: 20, color: SC[0], font: MONO, weight: 700, a: b1 });
  const q = ['我先按 1000 万用户、读远', '多于写、按时间排序来设计，', '这个范围可以吗？'];
  q.forEach((s, i) => text(typed(s, P(lt, 9.4 + i * 1.9, 11.2 + i * 1.9)), 1368, 424 + i * 38, { size: 26, a: b1 }));
  const b2 = eOut(P(lt, 15.6, 16.3));
  glass(1340, 560, 500, 120, { accent: SC[3], a: b2 });
  text('面试官（示意）', 1368, 600, { size: 20, color: SC[3], font: MONO, weight: 700, a: b2 });
  text('可以，另外要支持图片', 1368, 648, { size: 28, a: b2 });
  const ca = eOut(P(lt, 16.8, 17.6));
  glass(830, 790, 1010, 100, { accent: '#ffffff', a: ca });
  text('第 10 分钟前', 860, 850, { size: 28, color: MUTE, a: ca });
  const c1 = eOut(P(lt, 17.2, 17.8)), c2 = eOut(P(lt, 18.4, 19.0));
  text('需求 ✓', 1130, 850, { size: 34, weight: 800, color: SC[4], a: c1 });
  text('核心 API ✓', 1340, 850, { size: 34, weight: 800, color: SC[4], a: c2 });
  bullet(0, '假设写在白板上', eOut(P(lt, 1.9, 2.6)));
  bullet(1, '后面每次改动可回看', eOut(P(lt, 8.9, 9.6)));
}

// ───────── 第 2 步：高层蓝图 ─────────
function sceneBlueprint(lt) {
  header(lt, '02', '高层蓝图', SC[1], '把面试官当队友');
  timeline(lt, { active: 1, play: lerp(8, 20, P(lt, 0.8, 26.5)), flags: [0.6, eOut(P(lt, 25.2, 26)), 0] });
  const pop = (t) => eBack(P(lt, t, t + 0.6));
  box(830, 450, 180, 110, '客户端', { color: SC[0], s: pop(6.6), a: clamp(pop(6.6) * 2) });
  box(1100, 450, 180, 110, 'API', { color: SC[1], s: pop(8.5), a: clamp(pop(8.5) * 2) });
  box(1440, 340, 250, 110, 'Feed 缓存', { color: SC[2], s: pop(10.3), a: clamp(pop(10.3) * 2) });
  dbIcon(1500, 600, 130, 150, '帖子数据库', { color: SC[3], a: clamp(pop(9.4) * 2) });
  const wa = eOut(P(lt, 10.5, 11.5));
  arrow(1020, 505, 1090, 505, { color: MUTE, p: eOut(P(lt, 8.6, 9.2)) });
  arrow(1290, 480, 1430, 420, { color: MUTE, p: eOut(P(lt, 10.4, 11)) });
  arrow(1290, 540, 1490, 660, { color: MUTE, p: eOut(P(lt, 10.4, 11)) });
  arrow(1565, 590, 1565, 462, { color: SC[2], p: eOut(P(lt, 20.2, 21)), dash: [8, 8] });
  text('填充好友 Feed', 1590, 535, { size: 22, color: SC[2], weight: 600, a: eOut(P(lt, 20.4, 21.2)) });
  // 纸巾盒背面估算
  const ea = eOut(P(lt, 11.0, 11.8));
  text('纸巾盒背面估算', 830, 846, { size: 24, color: MUTE, weight: 600, a: ea });
  ['请求量', '峰值', '存储', '带宽'].forEach((s, i) => badge(1030 + i * 150, 816, s, SC[3], eOut(P(lt, 11.4 + i * 0.5, 12.1 + i * 0.5))));
  // 发布流程（绿）
  const pc = SC[4], rc = '#eef1fa';
  const pa = lt > 17 && lt < 23 ? 1 : 0.35;
  [[1020, 505, 1090, 505, 17.4, 18.3], [1280, 540, 1490, 660, 18.4, 20.0], [1565, 590, 1565, 462, 20.5, 22.0]].forEach(([a1, b1, a2, b2, t0, t1]) => {
    packet(a1, b1, a2, b2, P(lt, t0, t1), pc, { r: 11 });
  });
  [[1020, 505, 1090, 505, 23.2, 24.0], [1290, 480, 1430, 420, 24.2, 25.4], [1430, 420, 1290, 480, 25.7, 26.5], [1090, 505, 1020, 505, 26.5, 27.3]].forEach(([a1, b1, a2, b2, t0, t1]) => {
    packet(a1, b1, a2, b2, P(lt, t0, t1), rc, { r: 11 });
  });
  void pa;
  bullet(0, '方框 + 箭头，边画边确认', eOut(P(lt, 3.0, 3.7)), { size: 28 });
  bullet(1, '估算量级，看扛不扛得住', eOut(P(lt, 11.0, 11.7)), { size: 28 });
  bullet(2, '走通两条核心流程', eOut(P(lt, 15.3, 16)), { size: 28 });
  bullet(3, '发布：写库 → 填充好友 Feed', eOut(P(lt, 17.1, 17.8)), { color: SC[4], size: 26 });
  bullet(4, '获取：聚合帖子，倒序展示', eOut(P(lt, 23.0, 23.7)), { color: INK, size: 26 });
}

// ───────── 第 3 步：深挖瓶颈 ─────────
function sceneBottleneck(lt) {
  header(lt, '03', '深挖瓶颈', SC[2], '只挖最关键的那一处');
  timeline(lt, { active: 2, play: lerp(20, 30, P(lt, 0.8, 25)) });
  const pop = (t) => eBack(P(lt, t, t + 0.6));
  box(830, 440, 200, 110, '名人发帖', { color: SC[2], s: pop(3.9), a: clamp(pop(3.9) * 2) });
  // 积压：12.5-17.3 快进一分钟；21.5 后加 worker 开始消化
  const grow = P(lt, 12.5, 17.3), drain = P(lt, 22, 25.5);
  const backlog = Math.round(600000 * grow * (1 - 0.7 * eIO(drain)));
  const fill = clamp(0.92 * grow * (1 - 0.7 * eIO(drain)));
  const hotQ = grow > 0.45 && drain < 0.5;
  dbIcon(1170, 370, 200, 250, '扇出队列', { color: hotQ ? RED : SC[3], a: eOut(P(lt, 5.5, 6.3)), fill });
  box(1500, 440, 260, 110, 'worker', { color: SC[1], sub: '2 万次 / 秒', s: pop(7.6), a: clamp(pop(7.6) * 2), hot: hotQ });
  arrow(1040, 495, 1160, 495, { color: SC[2], p: eOut(P(lt, 4.4, 5)) });
  arrow(1380, 495, 1490, 495, { color: SC[1], p: eOut(P(lt, 7.6, 8.2)) });
  if (lt > 12.0) for (let k = 0; k < 9; k++) packet(1040, 495, 1160, 495, (lt * 1.1 + k / 9) % 1, SC[2], { r: 8, trail: 0.2 });
  if (lt > 8.2) for (let k = 0; k < (lt > 21.8 ? 9 : 6); k++) packet(1380, 495, 1490, 495, (lt * 1.1 + k / 6) % 1, SC[1], { r: 8, trail: 0.2 });
  if (grow > 0) {
    text(`积压 ${backlog.toLocaleString('en-US')} 条`, 1270, 722, { size: 34, weight: 800, font: MONO, color: drain > 0.5 ? SC[3] : RED, align: 'center' });
    text('示意：快进 1 分钟', 1270, 760, { size: 20, color: DIM, align: 'center', a: 1 - drain });
  }
  // 只加 API 没用
  const na = eOut(P(lt, 17.1, 17.9));
  box(830, 650, 200, 100, 'API × N', { color: SC[1], a: na * 0.7 });
  cross(850, 662, 160, 76, eOut(P(lt, 18.0, 18.8)));
  text('无状态，帮不上', 930, 790, { size: 24, color: RED, align: 'center', weight: 600, a: eOut(P(lt, 18.2, 19)) });
  // 提升处理能力
  const wb = pop(21.5);
  box(1500, 620, 260, 110, 'worker × 2', { color: SC[4], s: wb, a: clamp(wb * 2) });
  arrow(1380, 560, 1500, 650, { color: SC[4], p: eOut(P(lt, 21.6, 22.2)) });
  text('或：名人改为读时合并', 1630, 780, { size: 24, color: MUTE, align: 'center', a: eOut(P(lt, 23.0, 23.8)) });
  statCard(110, 420, 640, '收件箱更新 · 处理能力', '20,000', { color: SC[4], a: eOut(P(lt, 7.6, 8.3)), note: '次 / 秒' });
  statCard(110, 550, 640, '收件箱更新 · 到达', '30,000', { color: SC[3], a: eOut(P(lt, 12.0, 12.7)), note: '次 / 秒' });
  statCard(110, 680, 640, '一分钟积压', (600000 * grow > 0 ? Math.round(600000 * grow) : 0).toLocaleString('en-US'), { color: RED, a: eOut(P(lt, 14.5, 15.2)), note: '条' });
  text('数字为书中自测题的演示假设', 110, 840, { size: 20, color: DIM, a: eOut(P(lt, 14.5, 15.2)) });
}

// ───────── 第 3 步（续）：四问 + 取舍 ─────────
function sceneTradeoff(lt) {
  header(lt, '03', '四问与取舍', SC[2], '深挖的落点是取舍');
  timeline(lt, { active: 2, play: lerp(30, 38, P(lt, 0.8, 22)) });
  const Q = [['主键·访问', ['key = 用户 ID', '读最新 N 条'], 3.4, 2], ['容量·故障', ['队列积压', '最老消息年龄'], 5.9, 1], ['丢·重·延迟', ['重试要幂等', '消息可去重'], 8.9, 1], ['何时升级', ['实测达上限', '再分片 / 加副本'], 12.5, 2]];
  const out = 1 - eOut(P(lt, 13.4, 14.2));
  if (out > 0) {
    ctx.save(); ctx.globalAlpha *= out;
    const bx = [830, 1210, 1590], bn = ['发帖 API', '扇出队列', '收件箱'], bc = [SC[1], SC[3], SC[2]];
    bn.forEach((n, i) => box(bx[i], 340, 250, 90, n, { color: bc[i], size: 28, a: eOut(P(lt, 1.0 + i * 0.3, 1.8 + i * 0.3)) }));
    arrow(1090, 385, 1200, 385, { color: MUTE, p: eOut(P(lt, 1.6, 2.2)) });
    arrow(1470, 385, 1580, 385, { color: MUTE, p: eOut(P(lt, 1.9, 2.5)) });
    Q.forEach(([t, ls, t0, bi], k) => {
      const x = 830 + k * 257, a = eOut(P(lt, t0, t0 + 0.6)), on = lt >= t0 && (k === 3 || lt < Q[k + 1][2]);
      glass(x, 520, 240, 250, { accent: on ? SC[2] : null, a, fill: on ? 0.1 : 0.04 });
      text(`0${k + 1}`, x + 22, 560, { size: 20, color: SC[2], font: MONO, weight: 700, a });
      text(t, x + 22, 608, { size: 28, weight: 800, a });
      ls.forEach((s, i) => text(s, x + 22, 662 + i * 40, { size: 24, color: MUTE, a: a * eOut(P(lt, t0 + 0.6 + i * 0.3, t0 + 1.2 + i * 0.3)) }));
      if (on) { ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = SC[2]; ctx.lineWidth = 2; ctx.setLineDash([6, 7]); ctx.beginPath(); ctx.moveTo(x + 120, 520); ctx.lineTo(bx[bi] + 125, 432); ctx.stroke(); ctx.restore(); }
    });
    text('示例说明，非书中数据', 830, 826, { size: 20, color: DIM, a: eOut(P(lt, 3.4, 4)) });
    ctx.restore();
  }
  const la = eOut(P(lt, 14.2, 15));
  if (la > 0) {
    // 泳道 A：普通用户写时推送
    text('普通用户 · 写时推送', 830, 366, { size: 30, weight: 800, color: SC[0], a: la });
    box(830, 400, 170, 90, '发帖', { color: SC[0], a: la, size: 28 });
    for (let i = 0; i < 5; i++) {
      const x = 1200 + i * 125, ta = eOut(P(lt, 15.0 + i * 0.1, 15.6 + i * 0.1));
      box(x, 400, 105, 90, '收件箱', { color: SC[2], a: la * ta, size: 20 });
      packet(1010, 445, x, 445, P(lt, 15.5 + i * 0.12, 16.5 + i * 0.12), SC[0], { r: 8 });
      dot(x + 52, 478, 6, SC[0], { g: 10, a: la * eOut(P(lt, 16.4 + i * 0.12, 16.8 + i * 0.12)) });
    }
    text('一次发帖，写进每个粉丝的收件箱', 830, 548, { size: 24, color: MUTE, a: eOut(P(lt, 16.6, 17.2)) });
    badge(1400, 566, '读取快', SC[4], eOut(P(lt, 17.5, 18.1)));
    // 泳道 B：名人读时合并
    text('名人 · 读时合并', 830, 662, { size: 30, weight: 800, color: SC[2], a: eOut(P(lt, 18.2, 18.8)) });
    const lb = eOut(P(lt, 18.4, 19));
    box(830, 696, 170, 90, '名人发帖', { color: SC[2], a: lb, size: 26 });
    box(1180, 696, 220, 90, '帖子库', { color: SC[3], a: lb, size: 28 });
    box(1560, 696, 200, 90, '读者', { color: SC[0], a: lb, size: 28 });
    arrow(1010, 741, 1170, 741, { color: SC[2], p: eOut(P(lt, 18.8, 19.4)) });
    arrow(1410, 741, 1550, 741, { color: SC[0], p: eOut(P(lt, 19.6, 20.2)) });
    packet(1010, 741, 1170, 741, P(lt, 18.9, 19.7), SC[2], { r: 8 });
    for (let k = 0; k < 3; k++) packet(1410, 741, 1550, 741, P(lt, 19.8 + k * 0.2, 20.7 + k * 0.2), SC[0], { r: 8 });
    text('读时才合并，只写一次', 830, 838, { size: 24, color: MUTE, a: eOut(P(lt, 19.6, 20.2)) });
    badge(1400, 810, '额外读计算', RED, eOut(P(lt, 20.4, 21)));
  }
  [['主键和访问模式', 3.4], ['容量上限和故障模式', 5.9], ['丢了、重了、晚了', 8.9], ['何时升级、怎么迁移', 12.5]].forEach(([s, t], i) => bullet(i, s, eOut(P(lt, t, t + 0.6)), { size: 28 }));
}

// ───────── 第 4 步：收尾 ─────────
function sceneWrap(lt) {
  header(lt, '04', '收尾', SC[3], '最后五分钟，不再加组件');
  timeline(lt, { active: 3, play: 40 + 5 * P(lt, 1.0, 21.5), flags: [0, 0, eOut(P(lt, 19.3, 20))] });
  const M = [['重述', '目标', '核心假设', 5.4], ['路径', '走一遍', '写 / 读路径', 8.1], ['取舍', '两个取舍', '及其代价', 12.1], ['瓶颈', '瓶颈 + 故障', '对应防护', 14.0], ['升级', '升级条件', '留给追问', 16.5]];
  M.forEach(([t, l1, l2, t0], i) => {
    const x = 830 + i * 205, a = eOut(P(lt, t0, t0 + 0.6)), on = lt >= t0 && lt < (i < 4 ? M[i + 1][3] : 99);
    glass(x, 340, 186, 250, { accent: SC[3], a, fill: on ? 0.11 : 0.04 });
    text(`第 ${i + 1} 分钟`, x + 22, 382, { size: 20, color: SC[3], font: MONO, weight: 700, a });
    text(t, x + 22, 450, { size: 44, weight: 800, a });
    text(l1, x + 22, 506, { size: 22, color: MUTE, a });
    text(l2, x + 22, 540, { size: 22, color: MUTE, a });
    if (on) { ctx.save(); ctx.fillStyle = SC[3]; glow(SC[3], 14); rr(x + 22, 566, 142, 5, 3); ctx.fill(); ctx.restore(); }
  });
  const sa = eOut(P(lt, 19.3, 20.1));
  glass(830, 660, 1010, 190, { accent: RED, a: sa });
  text('第 40 分钟', 866, 722, { size: 40, weight: 800, font: MONO, color: RED, a: sa });
  text('停止新增组件，只回顾故障与取舍', 866, 776, { size: 28, weight: 600, a: sa });
  const bw = badge(1560, 700, '+ 新组件', MUTE, sa * 0.8);
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 20.0, 20.8)); ctx.fillStyle = RED; glow(RED, 10); ctx.fillRect(1550, 724, (bw + 20) * eOut(P(lt, 20.0, 20.8)), 4); ctx.restore();
  bullet(0, '停止扩张范围', eOut(P(lt, 3.7, 4.4)));
  bullet(1, '证明方案能跑通', eOut(P(lt, 8.5, 9.2)));
  bullet(2, '取舍清楚，故障有边界', eOut(P(lt, 14.5, 15.2)));
}

// ───────── 时间线上的坑 ─────────
function scenePitfalls(lt) {
  hd(lt, 'PITFALLS', '常见的坑', RED, '都发生在时间线上');
  timeline(lt, { active: -1, flags: [1, 1, 1] });
  const mx = (m) => 830 + (m / 45) * 980;
  const PIT = [
    { m: 2, t0: 4.0, title: '开头：先画技术名', lines: [['Kafka · Redis · 十个微服务', INK], ['范围没锁定，越画越跑题', RED]], fix: '10′ 前：需求 + API' },
    { m: 28, t0: 8.6, title: '中间：陷进细节', lines: [['表字段、类名讲半天', INK], ['热点·超时·重试没讲', RED]], fix: '20′ 前：高层图 + 量级' },
    { m: 44, t0: 14.8, title: '最后：还在加组件', lines: [['没有收尾', RED], ['没有取舍与演进', RED]], fix: '40′ 后：停止加组件' },
  ];
  PIT.forEach((p, k) => {
    const a = eOut(P(lt, p.t0, p.t0 + 0.7)), x = 830 + k * 345, cx = x + 160, px = mx(p.m), py = 190 + 44;
    if (a > 0) {
      const pulse = (lt * 0.8) % 1;
      ctx.save(); ctx.strokeStyle = RED; ctx.globalAlpha *= a * (1 - pulse); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, py, 14 + pulse * 22, 0, 7); ctx.stroke(); ctx.restore();
      dot(px, py, 9, RED, { g: 20, a });
      ctx.save(); ctx.globalAlpha *= a * 0.7; ctx.strokeStyle = RED; ctx.lineWidth = 2; ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.moveTo(px, py + 8); ctx.lineTo(px, 372); ctx.lineTo(cx, 372); ctx.lineTo(cx, 450); ctx.stroke(); ctx.restore();
    }
    glass(x, 450, 320, 290, { accent: RED, a });
    text(p.title, x + 24, 506, { size: 30, weight: 800, a });
    p.lines.forEach(([s, c], i) => {
      const la = a * eOut(P(lt, p.t0 + 0.6 + i * 0.8, p.t0 + 1.2 + i * 0.8));
      text(s, x + 24, 566 + i * 56, { size: 22, color: c, weight: c === RED ? 700 : 500, a: la });
    });
    const fa = a * eOut(P(lt, p.t0 + 2.8, p.t0 + 3.5));
    ctx.save(); ctx.globalAlpha *= fa; ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + 24, 650, 272, 2); ctx.restore();
    text('对策', x + 24, 686, { size: 20, color: SC[4], font: MONO, weight: 700, ls: 3, a: fa });
    text(p.fix, x + 24, 722, { size: 24, color: SC[4], weight: 700, a: fa });
  });
  [['多提问，澄清再设计', 17.9], ['不沉默，持续沟通', 19.6], ['聚焦关键组件', 20.6], ['避免过度工程', 21.8]].forEach(([s, t], i) => {
    bullet(i, s, eOut(P(lt, t, t + 0.6)), { color: SC[4], size: 28 });
  });
  text('应该做', 110, 388, { size: 22, color: SC[4], font: MONO, weight: 700, ls: 3, a: eOut(P(lt, 17.5, 18)) });
}

// ───────── 90 秒串起四步 ─────────
function sceneChain(lt) {
  hd(lt, '90 SEC', '九十秒串起来', SC[3], '四步的衔接，用同一个 Feed 例子');
  const R = [
    [15, '需求', SC[0], '好友动态 · 时间倒序 · 图文', '谁要什么？', 4.5, 12.9],
    [25, '路径', SC[1], '写库 → 扇出收件箱 → 读取聚合', '请求怎么走？', 5.9, 14.0],
    [15, '瓶颈', SC[2], '名人扇出积压 · 缓存回源', '哪里先卡？', 7.5, 15.4],
    [20, '取舍', SC[2], '普通写时推，名人读时合', '为何接受代价？', 8.8, 16.5],
    [15, '演进', SC[3], '单库起步，达到实测上限再扩', '什么证据触发升级？', 10.2, 18.1],
  ];
  // 90 秒条
  let off = 0; const x0 = 830, w = 980;
  R.forEach(([s, n, c, , , t0]) => {
    const g = eOut(P(lt, t0, t0 + 0.6)), sx = x0 + (off / 90) * w, ww = (s / 90) * w - 4;
    if (g > 0) { glass(sx, 190, ww * g, 44, { r: 16, accent: c }); if (g > 0.95) text(`${n} ${s}″`, sx + ww / 2, 220, { size: 22, weight: 700, align: 'center' }); }
    off += s;
  });
  R.forEach(([s, n, c, phrase, q, t0, t1], i) => {
    const y = 300 + i * 104, a = eOut(P(lt, t0, t0 + 0.6)), qa = eOut(P(lt, t1, t1 + 0.6));
    const on = lt >= t1 && lt < t1 + 1.3;
    glass(830, y, 1010, 88, { accent: c, a, fill: on ? 0.11 : 0.055 });
    text(n, 858, y + 56, { size: 34, weight: 800, color: c, a });
    text(`${s}″`, 960, y + 54, { size: 22, color: MUTE, font: MONO, a });
    text(phrase, 1050, y + 55, { size: 26, a });
    text(q, 1810, y + 55, { size: 26, color: c, weight: 700, align: 'right', a: qa });
  });
  statCard(110, 430, 640, '完整回答', '90 秒', { color: SC[3], a: eOut(P(lt, 0.9, 1.6)), note: '15 + 25 + 15 + 20 + 15' });
  text('需求 → 路径 → 瓶颈 → 取舍 → 演进', 110, 620, { size: 28, weight: 600, color: INK, a: eOut(P(lt, 11.5, 12.2)) });
  text('每个选择都回应前一个约束', 110, 668, { size: 24, color: MUTE, a: eOut(P(lt, 12.2, 12.9)) });
  text('示范回答出自书中自测题；Feed 数据为演示假设', 830, 846, { size: 20, color: DIM, a: eOut(P(lt, 11, 12)) });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('系统设计面试框架', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('System Design Framework', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['问清范围', '先提问，写下假设', SC[0]], ['取得共识', '蓝图与路径对齐', SC[1]], ['收口取舍', '瓶颈、代价、演进', SC[3]]].forEach(([w, s, c], k) => {
    const t0 = 1.9 + k * 1.4, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 390, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 390, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 450, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 536, { size: 70, weight: 800 });
    text(s, x + 36, 590, { size: 26, color: MUTE });
    ctx.restore();
  });
  const ta = eOut(P(lt, 6.4, 7.2));
  timeline(lt, { x0: 110, w: 1700, y: 730, h: 52, size: 26, a: ta, flags: [eOut(P(lt, 8.0, 8.6)), eOut(P(lt, 8.4, 9.0)), eOut(P(lt, 8.8, 9.4))] });
  text('45 分钟 = 8 + 12 + 20 + 5（示意分配）', 110, 900, { size: 20, color: DIM, a: eOut(P(lt, 9, 9.8)) });
}

export const scenes = { title: sceneTitle, overview: sceneOverview, ask: sceneAsk, assume: sceneAssume, blueprint: sceneBlueprint,
  bottleneck: sceneBottleneck, tradeoff: sceneTradeoff, wrap: sceneWrap, pitfalls: scenePitfalls, chain: sceneChain, end: sceneEnd };
