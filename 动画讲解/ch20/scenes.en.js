// Chapter 20 Metrics Monitoring and Alerting System: English scenes (shell and helpers from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 20, title: 'Metrics Monitoring and Alerting System', en: 'Metrics Monitoring and Alerting System' };

// 角色配色：采集器 青、队列 琥珀、处理/消费者 靛、时序库 粉、新增/成功 青柠、失败/告警 红
const C_COL = SC[0], C_Q = SC[3], C_PROC = SC[1], C_DB = SC[2], C_OK = SC[4];

// 旁白原文（用于按字符位置估算画面节拍；与 script.json 保持一致）
const TX = {
 "title": "Chapter 20, the metrics monitoring and alerting system. Let's see how it works in a few minutes.",
 "model": "Monitoring data is called a time series. A series is identified by a metric name plus a set of labels, like CPU load, host web zero one, region us-west. Every few seconds it gains a timestamped value, forming a curve. A thousand pools, a hundred hosts each, a hundred metrics per host: that is ten million series.",
 "card": "The number of series depends on the label combinations that actually appear. The method label has only two values, GET and POST, so series merely double. But put the request ID in a label, and every request opens a brand new series. That is why label cardinality must be limited.",
 "pull": "How does data get in? First, the pull model. Collectors find services through service discovery, using ZooKeeper or etcd. With the list in hand, they visit each service's metrics endpoint on a schedule and pull the data back. With several collectors, a hash ring assigns each target to exactly one collector.",
 "push": "The push model is the opposite. An agent sits beside each machine, collects locally, and pushes to a central collector, behind a load balancer. Which one? Say a service suddenly goes silent. With pull, a failed scrape is itself a signal. With push, the service may be down, or the network may just be cut, and you can't tell which.",
 "queue": "If collectors write straight to the time series database, a database outage loses data. So we put Kafka in the middle. Collectors only write to the queue, and consumers write to the database. When the database fails, data piles up in the queue, and writing resumes after recovery. The cost: one more system to run.",
 "tsdb": "Storage is the core. The workload is constant heavy writes, with few reads until an incident. The book says about eighty-five percent of queries hit the last twenty-six hours, so recent data belongs on fast storage. Time series databases also compress: store only the time delta. When the interval is steady, the delta of deltas is almost always zero.",
 "down": "Old data is downsampled. Keep seven days as is, then one-minute resolution for thirty days, then one-hour resolution for up to a year. Take points every ten seconds. Averaging each thirty seconds gives fifteen point three three and twenty-six point six seven. Note that spikes get averaged away, and dropped raw points are gone. Store the max separately if needed.",
 "alert": "An alert rule should not fire the moment a line is crossed. This rule says: up equals zero, for five minutes. When the curve crosses, the rule becomes pending and a timer starts. A quick recovery was just a spike, so nothing fires. Only when it stays down for the full five minutes does it fire and create an alert event. The duration is what filters out flapping.",
 "mgr": "A firing alert goes to the alert manager. It filters, merges and deduplicates, so one instance firing repeatedly makes one event. The event is written to Kafka, and consumers send email, phone calls, PagerDuty or webhooks. If delivery fails, it retries. That is at-least-once delivery, so receivers must deduplicate too. One more rule: no data does not mean healthy.",
 "end": "To recap. One: metrics are time series, with a name, labels and timestamped values, and cardinality must be controlled. Two: collect by push or pull, a queue rides out failures, and the database downsamples. Three: alerts use a threshold plus a duration, with dedup and retry, and a rule for missing data."
};
// 短语在旁白中出现的局部时间（旁白从 lt=0.7 开始，时长 = d-1.7）
const cue = (id, phrase, d) => { const t = TX[id], i = t.indexOf(phrase); if (i < 0) throw new Error('cue missing: ' + phrase); let w = 0, wi = 0; for (let k = 0; k < t.length; k++) { if (k === i) wi = w; w += 1 + (',.:?'.includes(t[k]) ? 7 : 0); } return 0.7 + (d - 1.7) * (wi / w) - 0.1; };
// English titles are wider: shrink to fit the 640px left column
function header(lt, num, title, accent, sub) {
  ctx.save(); ctx.font = `800 70px ${SANS}`; const w = ctx.measureText(title).width; ctx.restore();
  const size = Math.min(70, Math.floor(70 * 640 / Math.max(w, 1)));
  const a = eOut(P(lt, 0.1, 0.7));
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(-30 * (1 - a), 0);
  text(`STEP ${num}`, 110, 188, { size: 22, weight: 700, color: accent, font: MONO, ls: 5 });
  text(title, 108, 262, { size, weight: 800 });
  const g = ctx.createLinearGradient(110, 0, 520, 0); g.addColorStop(0, accent); g.addColorStop(1, accent + '00');
  ctx.fillStyle = g; ctx.fillRect(110, 288, 410, 4);
  if (sub) text(sub, 110, 336, { size: 26, color: MUTE });
  ctx.restore();
}
function fitSize(s, maxW, size, weight = 800) { ctx.save(); ctx.font = `${weight} ${size}px ${SANS}`; const w = ctx.measureText(s).width; ctx.restore(); return Math.min(size, Math.floor(size * maxW / Math.max(w, 1))); }
const fr = (x) => x - Math.floor(x);

function panel(x, y, w, h, title, color, a = 1) {
  glass(x, y, w, h, { a, r: 24, accent: color });
  if (title) text(title, x + 26, y + 38, { size: 22, weight: 700, color, font: MONO, ls: 2, a });
}
function segText(parts, x, y, size, a = 1, weight = 700) { // 彩色分段文字，返回各段 x
  ctx.save(); ctx.font = `${weight} ${size}px ${MONO}`; const xs = []; let cx = x;
  parts.forEach(([s]) => { xs.push(cx); cx += ctx.measureText(s).width; }); ctx.restore();
  parts.forEach(([s, c], i) => text(s, xs[i], y, { size, weight, color: c, font: MONO, a }));
  return { xs, end: ctx.measureText ? 0 : 0 };
}
function measure(s, size, weight = 700) { ctx.save(); ctx.font = `${weight} ${size}px ${MONO}`; const w = ctx.measureText(s).width; ctx.restore(); return w; }

// ───────── 场景 1：数据模型 ─────────
const MV = (k) => 50 + 22 * Math.sin(k * 0.55) + 8 * Math.sin(k * 1.7 + 1);
function sceneModel(lt, d) {
  header(lt, '01', 'Metrics Data Model', SC[0], 'Series = name + labels + timestamped value');
  const tN = cue('model', 'A series is', d), tL = cue('model', 'like CPU load', d), tT = cue('model', 'Every few seconds', d), tS = cue('model', 'A thousand pools', d);
  bullet(0, 'Metric name: CPU.load', eOut(P(lt, tN, tN + 0.6)));
  bullet(1, 'Labels: host, region', eOut(P(lt, tL, tL + 0.6)));
  bullet(2, 'Timestamp + value: one data point', eOut(P(lt, tT, tT + 0.6)));
  statCard(110, 640, 640, 'Total series', '10 million', { color: SC[0], a: eOut(P(lt, tS, tS + 0.7)), note: '1000×100×100' });
  text('Illustrative: 10 s interval = ~1M points per second', 110, 790, { size: 22, color: DIM, a: eOut(P(lt, tS + 3, tS + 3.8)) });
  // 序列标识
  const ka = eOut(P(lt, 0.8, 1.6));
  glass(820, 180, 1000, 140, { a: ka, r: 24, accent: SC[1] });
  const parts = [['CPU.load', SC[0]], ['{', MUTE], ['host', SC[1]], ['=', MUTE], ['"web01"', SC[1]], [', ', MUTE], ['region', SC[2]], ['=', MUTE], ['"us-west"', SC[2]], ['}', MUTE]];
  segText(parts, 850, 245, 38, ka);
  const wName = measure('CPU.load', 38), wTags = measure('{host="web01", region="us-west"}', 38);
  const cl = (t0, x, w, label, c) => { const a = eOut(P(lt, t0, t0 + 0.5)); if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = c; ctx.fillRect(x, 262, w, 4); ctx.restore(); text(label, x + w / 2, 300, { size: 22, weight: 700, color: c, align: 'center', a }); };
  cl(tN, 850, wName, 'Metric name', SC[0]);
  cl(tL, 850 + wName, wTags, 'Labels (together they identify a series)', SC[1]);
  // 曲线
  const cx = 820, cy = 350, cw = 1000, chh = 530;
  panel(cx, cy, cw, chh, 'ONE SERIES · each point: timestamp + value', SC[0], eOut(P(lt, 1.2, 2)));
  const x0 = cx + 60, x1 = cx + cw - 40, yb = cy + chh - 60, yt = cy + 110, N = 24;
  const px = (k) => lerp(x0, x1, k / (N - 1)), py = (v) => lerp(yb, yt, (v - 20) / 80);
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 1.4, 2.2)); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5;
  [20, 40, 60, 80, 100].forEach((v) => { ctx.beginPath(); ctx.moveTo(x0 - 10, py(v)); ctx.lineTo(x1 + 10, py(v)); ctx.stroke(); text(String(v), x0 - 16, py(v) + 7, { size: 20, color: DIM, align: 'right', font: MONO }); });
  ctx.restore();
  text('time →', x1 + 10, yb + 40, { size: 20, color: DIM, align: 'right', a: eOut(P(lt, 1.6, 2.2)) });
  const tp = (k) => tT - 0.3 + k * 0.68;
  let last = -1; for (let k = 0; k < N; k++) if (lt >= tp(k)) last = k;
  if (last >= 0) {
    ctx.save(); ctx.lineWidth = 5; ctx.strokeStyle = SC[0]; ctx.lineJoin = 'round'; glow(SC[0], 14); ctx.beginPath();
    for (let k = 0; k <= last; k++) k ? ctx.lineTo(px(k), py(MV(k))) : ctx.moveTo(px(k), py(MV(k)));
    ctx.stroke(); ctx.restore();
    for (let k = 0; k <= last; k++) {
      const age = lt - tp(k), pop = eBack(P(age, 0, 0.35));
      dot(px(k), py(MV(k)), 7 * clamp(pop, 0, 1.3), k === last ? '#fff' : SC[0], { g: k === last ? 26 : 8 });
      if (age < 0.7) { ctx.save(); ctx.strokeStyle = SC[0]; ctx.globalAlpha = 1 - age / 0.7; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px(k), py(MV(k)), 8 + age * 40, 0, 7); ctx.stroke(); ctx.restore(); }
    }
    const lx = px(last), ly = py(MV(last)), bw = 330, bx = clamp(lx - bw / 2, cx + 20, cx + cw - bw - 20);
    glass(bx, cy + 52, bw, 44, { r: 14, accent: SC[0] });
    text(`${1613707265 + last * 10}  ·  ${MV(last).toFixed(0)}`, bx + bw / 2, cy + 82, { size: 24, weight: 700, font: MONO, align: 'center' });
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([4, 6]); ctx.beginPath(); ctx.moveTo(lx, cy + 96); ctx.lineTo(lx, ly - 12); ctx.stroke(); ctx.restore();
  }
}

// ───────── 场景 2：标签基数 ─────────
function sceneCard(lt, d) {
  header(lt, '02', 'Label Cardinality', RED, 'Series = label combinations seen');
  const tA = cue('card', 'The method label', d), tB = cue('card', 'But put', d), tC = cue('card', 'That is why', d);
  bullet(0, 'Series count = label combinations', eOut(P(lt, 0.9, 1.5)));
  bullet(1, 'Low cardinality: method has 2 values', eOut(P(lt, tA, tA + 0.6)));
  bullet(2, 'High cardinality: request_id, unbounded', eOut(P(lt, tB, tB + 0.6)), { color: RED });
  statCard(110, 660, 640, 'Takeaway', 'Cap cardinality', { color: RED, a: eOut(P(lt, tC, tC + 0.7)) });
  // 面板 A
  const aa = eOut(P(lt, 0.7, 1.4));
  panel(820, 180, 1000, 250, 'LOW CARDINALITY', SC[0], aa);
  text('method = { GET, POST }', 850, 262, { size: 30, weight: 700, font: MONO, color: SC[0], a: aa });
  ['GET', 'POST'].forEach((m, i) => { const t0 = tA + 0.3 + i * 0.5, p = eBack(P(lt, t0, t0 + 0.5)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; const x = 850 + i * 250; glass(x, 300, 220, 80, { r: 18, accent: SC[0] }); text(`method=${m}`, x + 110, 349, { size: 26, weight: 700, font: MONO, align: 'center' }); ctx.restore(); });
  text('2 series', 1790, 349, { size: 40, weight: 800, font: MONO, color: SC[0], align: 'right', a: eOut(P(lt, tA + 1, tA + 1.6)) });
  // 面板 B
  const ba = eOut(P(lt, tB - 0.4, tB + 0.3));
  panel(820, 460, 1000, 440, 'HIGH CARDINALITY', RED, ba);
  text('request_id = different every request', 850, 540, { size: 30, weight: 700, font: MONO, color: RED, a: ba });
  const cols = 25, rows = 6, cs = 38, gx = 850, gy = 580, total = cols * rows;
  const prog = P(lt, tB + 0.8, tB + 0.8 + 6.5), n = Math.floor(total * prog * prog) + (prog > 0 ? 1 : 0);
  for (let i = 0; i < Math.min(n, total); i++) {
    const age = (lt - (tB + 0.8)) , c = i % cols, r = Math.floor(i / cols), appear = eBack(P(prog * prog * total - i, 0, 1.5));
    const s = clamp(appear, 0, 1.2);
    ctx.save(); ctx.translate(gx + c * cs + 15, gy + r * cs + 15); ctx.scale(s, s); ctx.fillStyle = RED + (i % 3 ? '99' : 'dd'); rr(-15, -15, 30, 30, 8); ctx.fill(); ctx.restore(); void age;
  }
  const cnt = Math.round(10000000 * prog * prog / 10000);
  text(`Each square = one new series (illustrative)`, 850, 882, { size: 22, color: DIM, a: ba });
  if (prog > 0) text(`≈ ${(cnt / 100).toFixed(1)}M series`, 1800, 882, { size: 34, weight: 800, font: MONO, color: RED, align: 'right', a: ba });
}

// ───────── 场景 3：拉模型 ─────────
function scenePull(lt, d) {
  header(lt, '03', 'Pull Model', SC[0], 'Discovery + scheduled scrape');
  const tD = cue('pull', 'service discovery', d), tList = cue('pull', 'With the list', d), tPull = cue('pull', 'they visit', d), tMulti = cue('pull', 'With several', d);
  bullet(0, 'Discovery: etcd / ZooKeeper', eOut(P(lt, tD, tD + 0.6)));
  bullet(1, 'Scrape /metrics on a schedule', eOut(P(lt, tPull, tPull + 0.6)));
  bullet(2, 'Hash ring: one collector per target', eOut(P(lt, tMulti, tMulti + 0.6)));
  const TY = (i) => 200 + i * 118, ownC = [0, 0, 1, 0, 1, 1];
  const split = eOut(P(lt, tMulti + 0.8, tMulti + 1.6)) > 0.5;
  const own = (i) => (split ? ownC[i] : 0);
  for (let i = 0; i < 6; i++) { const a = eOut(P(lt, 0.6 + i * 0.12, 1.2 + i * 0.12)); box(1590, TY(i), 230, 78, `web-${String(i + 1).padStart(2, '0')}`, { color: SC[own(i) === 0 ? 0 : 2], sub: ':9100/metrics', a, size: 24 }); }
  // 服务发现
  box(820, 400, 240, 150, 'Discovery', { color: C_Q === 0 ? SC[3] : SC[3], sub: 'etcd / ZooKeeper', a: eOut(P(lt, tD - 0.3, tD + 0.4)), size: 28 });
  // 采集器
  const spP = eIO(P(lt, tMulti + 0.6, tMulti + 1.6)), c1y = lerp(400, 250, spP), c2y = 590;
  box(1190, c1y, 220, 120, 'Collector 1', { color: SC[0], a: eOut(P(lt, tList - 1.2, tList - 0.5)), size: 26, sub: 'collector' });
  const c2p = eBack(P(lt, tMulti, tMulti + 0.8));
  if (c2p > 0.02) box(1190, c2y, 220, 120, 'Collector 2', { color: SC[2], a: clamp(c2p * 2), s: clamp(c2p, 0.01, 1.1), size: 26, sub: 'collector' });
  // 名单
  const lp = P(lt, tList, tList + 1.2);
  if (lp > 0 && lp < 1) { const yy = 475; for (let k = 0; k < 3; k++) packet(1060, yy, 1190, 460, clamp(lp - k * 0.1), SC[3], { r: 8 }); }
  if (lt > tList + 1) arrow(1060, 475, 1190, c1y + 60, { color: SC[3] + '99', w: 3, dash: [8, 8], a: 1 });
  if (lt > tList + 1 && split) arrow(1060, 475, 1190, 650, { color: SC[3] + '99', w: 3, dash: [8, 8] });
  // 拉取循环
  for (let i = 0; i < 6; i++) {
    const o = own(i), cy0 = o === 0 ? c1y : c2y, sy = cy0 + 60, ty = TY(i) + 39, col = SC[o === 0 ? 0 : 2];
    if (lt > tList + 0.8) arrow(1410, sy + (i - 2.5) * 4, 1590, ty, { color: col + '55', w: 2, head: 9 });
    const t0 = tPull + (i % 3) * 0.3 + (i >= 3 ? 0.15 : 0), u = ((lt - t0) / 2.4); if (lt < t0) continue;
    const ph = fr(u);
    if (ph < 0.35) packet(1410, sy, 1590, ty, ph / 0.35, SC[3], { r: 6, trail: 0.05 });
    else if (ph < 0.75) packet(1590, ty, 1410, sy, (ph - 0.35) / 0.4, col, { r: 9 });
  }
  if (lt > tPull) text('GET /metrics', 1500, 190, { size: 22, color: SC[3], align: 'center', font: MONO, a: eOut(P(lt, tPull, tPull + 0.6)) });
  if (split) text('Consistent-hash assignment', 1300, 760, { size: 24, color: MUTE, align: 'center', a: eOut(P(lt, tMulti + 1.4, tMulti + 2.2)) });
}

// ───────── 场景 4：推 vs 拉 ─────────
function scenePush(lt, d) {
  header(lt, '04', 'Push vs Pull', SC[1], 'A service goes silent. Which is it?');
  const tA = cue('push', 'An agent', d), tQ = cue('push', 'Which one', d), tPullF = cue('push', 'With pull', d), tPushF = cue('push', 'With push', d);
  bullet(0, 'Push: agent collects, then sends', eOut(P(lt, tA, tA + 0.6)));
  bullet(1, 'Pull: a failure is the signal', eOut(P(lt, tPullF, tPullF + 0.6)));
  bullet(2, 'Push: no data, cause unclear', eOut(P(lt, tPushF, tPushF + 0.6)), { color: SC[3] });
  const fail = lt > tQ + 0.8;
  // 上：推
  const pa = eOut(P(lt, 0.5, 1.2));
  panel(810, 170, 1020, 360, 'PUSH', SC[1], pa);
  box(840, 250, 230, 160, 'Service', { color: fail ? RED : SC[0], sub: '+ Agent', a: pa, hot: fail && lt < tPushF + 3 });
  box(1190, 275, 170, 110, 'LB', { color: SC[1], sub: 'load balancer', a: pa * eOut(P(lt, tA + 0.8, tA + 1.4)), size: 28 });
  box(1470, 250, 200, 160, 'Collector', { color: SC[0], a: pa, size: 28 });
  arrow(1070, 330, 1190, 330, { color: MUTE, a: pa * eOut(P(lt, tA + 0.6, tA + 1.2)) }); arrow(1360, 330, 1470, 330, { color: MUTE, a: pa * eOut(P(lt, tA + 0.8, tA + 1.4)) });
  const tPk = tA + 0.5;
  if (lt > tPk && !fail) { for (let k = 0; k < 3; k++) { const u = fr(lt * 0.8 + k / 3); packet(1070, 330, 1470, 330, u, SC[0], { r: 8 }); } }
  const q = eOut(P(lt, tPushF, tPushF + 0.8));
  if (q > 0) {
    ctx.save(); ctx.globalAlpha *= q; ctx.setLineDash([8, 8]); ctx.strokeStyle = SC[3]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1090, 330); ctx.lineTo(1450, 330); ctx.stroke(); ctx.restore();
    text('?', 1270, 440, { size: 80, weight: 800, color: SC[3], align: 'center', a: q });
    badge(850, 450, 'Service down?', SC[3], q); badge(1090, 450, 'Network cut?', SC[3], q * eOut(P(lt, tPushF + 0.6, tPushF + 1.2)));
  }
  // 下：拉
  panel(810, 560, 1020, 350, 'PULL', SC[0], pa);
  box(840, 640, 230, 160, 'Collector', { color: SC[0], a: pa, size: 28 });
  box(1470, 640, 230 - 30, 160, 'Service', { color: fail ? RED : SC[0], sub: '/metrics', a: pa, hot: fail && lt < tPullF + 4 });
  arrow(1070, 700, 1470, 700, { color: MUTE, a: pa * 0.6 }); arrow(1470, 745, 1070, 745, { color: MUTE, a: pa * 0.6 });
  if (!fail && lt > 1.5) { for (let k = 0; k < 2; k++) { const u = fr(lt * 0.7 + k / 2); packet(1070, 700, 1470, 700, u, SC[3], { r: 6, trail: 0.05 }); packet(1470, 745, 1070, 745, u, SC[0], { r: 8 }); } }
  if (fail) {
    const u = fr((lt - tQ) * 0.7); packet(1070, 700, 1470, 700, u, SC[3], { r: 6, trail: 0.05 });
    const ra = eOut(P(lt, tPullF, tPullF + 0.6));
    text('✕', 1585, 640 + 80 + 14, { size: 40, weight: 800, color: RED, align: 'center', a: 0 });
    if (ra > 0) { badge(850, 835, 'Failed scrape = a clear signal', RED, ra); text('up = 0', 1700, 700, { size: 30, weight: 800, color: RED, font: MONO, a: ra }); }
  }
}

// ───────── 场景 5：队列缓冲 ─────────
function sceneQueue(lt, d) {
  header(lt, '05', 'Queue Buffering', C_Q, 'Kafka absorbs downstream failures');
  const tDie1 = cue('queue', 'a database outage', d), tK = cue('queue', 'So we put', d), tDie2 = cue('queue', 'When the database fails', d) - 0.4, tRec = cue('queue', 'writing resumes', d), tCost = cue('queue', 'The cost', d);
  bullet(0, 'Direct write: DB down = data lost', eOut(P(lt, 0.9, 1.5)), { color: RED });
  bullet(1, 'Collectors only write to the queue', eOut(P(lt, tK + 0.3, tK + 0.9)));
  bullet(2, 'Resume consuming after recovery', eOut(P(lt, tRec - 0.2, tRec + 0.4)));
  bullet(3, 'Cost: one more system to run', eOut(P(lt, tCost, tCost + 0.6)), { color: MUTE });
  const dbDown1 = lt > tDie1 && lt < tK - 0.2, dbDown2 = lt > tDie2 && lt < tRec;
  const hot = dbDown1 || dbDown2;
  const Y = 440;
  box(820, Y, 190, 120, 'Collector', { color: C_COL, a: eOut(P(lt, 0.4, 1)), size: 26 });
  const ka = eOut(P(lt, tK, tK + 0.7)), kp = eBack(P(lt, tK, tK + 0.7));
  box(1100, Y, 190, 120, 'Kafka', { color: C_Q, sub: 'queue', a: clamp(ka), s: clamp(kp, 0.01, 1.1), size: 28 });
  box(1380, Y, 180, 120, 'Consumer', { color: C_PROC, a: clamp(ka), s: clamp(kp, 0.01, 1.1), size: 26 });
  dbIcon(1670, Y - 20, 130, 150, 'TSDB', { color: hot ? RED : C_DB, a: eOut(P(lt, 0.4, 1)) });
  // 阶段 A：直写
  if (lt < tK + 0.6) {
    const fa = 1 - eOut(P(lt, tK, tK + 0.6));
    arrow(1010, Y + 60, 1670, Y + 60, { color: MUTE, a: fa * 0.7 });
    let lost = 0;
    for (let k = 0; k < 120; k++) { const t0 = 1.0 + k * 0.45; if (t0 > lt - 1.3) break; if (t0 > tDie1 - 0.55 && t0 < tK - 0.5) lost++; }
    for (let k = 0; k < 4; k++) { const t0 = 1.0 + k * 0.45, u = fr((lt - 1.0) * 0.5 + k / 4); if (lt < 1.0) break; const x = lerp(1010, 1670, u); const dead = lt > tDie1 && u > 0.97; if (dead) continue; dot(x, Y + 60, 8, C_COL, { g: 18, a: fa }); }
    if (dbDown1) { const t = lt - tDie1; for (let k = 0; k < 3; k++) { const u = fr(t * 0.9 + k / 3), a = 1 - u; text('✕', 1640, Y + 70 - u * 30, { size: 30, weight: 800, color: RED, align: 'center', a }); } }
    text('Database down', 1735, Y + 200, { size: 24, weight: 700, color: RED, align: 'center', a: fa * eOut(P(lt, tDie1, tDie1 + 0.5)) });
    if (dbDown1) text(`Lost ${Math.round((lt - tDie1) * 9)} pts`, 1340, Y - 40, { size: 40, weight: 800, color: RED, font: MONO, align: 'center', a: fa });
  }
  // 阶段 B：队列
  let backlog = 0;
  if (lt > tDie2) backlog = lt < tRec ? clamp((lt - tDie2) / (tRec - tDie2)) * 0.82 : Math.max(0, 0.82 * (1 - (lt - tRec) / 3));
  if (ka > 0) {
    arrow(1010, Y + 60, 1100, Y + 60, { color: MUTE, a: ka }); arrow(1290, Y + 60, 1380, Y + 60, { color: MUTE, a: ka }); arrow(1560, Y + 60, 1670, Y + 60, { color: dbDown2 ? RED + '66' : MUTE, a: ka });
    if (lt > tK + 0.5) {
      for (let k = 0; k < 3; k++) { const u = fr(lt * 0.8 + k / 3); packet(1010, Y + 60, 1100, Y + 60, u, C_COL, { r: 7, trail: 0.2 }); }
      for (let k = 0; k < 3; k++) { const u = fr(lt * 0.8 + k / 3); packet(1290, Y + 60, 1380, Y + 60, u, C_Q, { r: 7, trail: 0.2 }); }
      if (!dbDown2) for (let k = 0; k < 3; k++) { const u = fr(lt * (lt > tRec && backlog > 0 ? 2 : 0.8) + k / 3); packet(1560, Y + 60, 1670, Y + 60, u, C_PROC, { r: 7, trail: 0.2 }); }
    }
    // 积压量表
    glass(1100, 620, 190, 270, { a: ka, r: 20, accent: C_Q });
    ctx.save(); ctx.globalAlpha *= ka; ctx.fillStyle = C_Q + '55'; glow(C_Q, 12); const hh = 220 * backlog; rr(1116, 874 - hh - 20, 158, Math.max(hh, 0.1), 10); if (hh > 4) ctx.fill(); ctx.restore();
    text('Backlog', 1195, 660, { size: 22, color: MUTE, align: 'center', a: ka });
    text(`${Math.round(backlog * 1000)}`, 1195, 704, { size: 34, weight: 800, font: MONO, color: C_Q, align: 'center', a: ka });
    if (dbDown2) text('Data piles up in the queue', 1500, 640, { size: 26, weight: 700, color: C_Q, align: 'center', a: eOut(P(lt, tDie2 + 0.3, tDie2 + 1)) });
    if (lt > tRec) text('Recovered: writes resume, nothing lost', 1600, 700, { size: 26, weight: 700, color: C_OK, align: 'center', a: eOut(P(lt, tRec, tRec + 0.6)) });
    text('illustrative', 1195, 890 - 0, { size: 0.1, a: 0 });
  }
}

// ───────── 场景 6：时序数据库 ─────────
function sceneTsdb(lt, d) {
  header(lt, '06', 'Time Series Database', C_DB, 'Write-heavy; recent data is hot');
  const tW = cue('tsdb', 'The workload', d), tR = cue('tsdb', 'with few reads', d), t85 = cue('tsdb', 'The book says', d), tEnc = cue('tsdb', 'Time series databases', d), tDD = cue('tsdb', 'the delta of deltas', d);
  bullet(0, 'Constant heavy writes', eOut(P(lt, tW, tW + 0.6)));
  bullet(1, 'Few reads, then incident bursts', eOut(P(lt, tR, tR + 0.6)));
  bullet(2, 'Hot recent data on fast storage', eOut(P(lt, t85 + 2, t85 + 2.6)));
  bullet(3, 'Delta-encoded compression', eOut(P(lt, tEnc, tEnc + 0.6)));
  statCard(110, 700, 640, 'Queries on the last 26 hours', '~85%', { color: SC[3], a: eOut(P(lt, t85, t85 + 0.7)), h: 130 });
  // A：写读流
  const aa = eOut(P(lt, 0.4, 1.1));
  panel(820, 170, 1000, 230, 'WRITE / READ', C_DB, aa);
  const sx = 850, ex = 1790, cur = lerp(sx, ex, P(lt, tW - 0.3, tR + 5.5));
  for (let x = sx; x <= cur; x += 7) {
    const i = Math.round((x - sx) / 7), inc = x > 1480 && x < 1640;
    const hh = 22 + rnd(i + 11) * 40; ctx.fillStyle = C_DB + 'cc'; rr(x, 345 - hh * (inc ? 1.25 : 1), 4, hh * (inc ? 1.25 : 1), 2); ctx.fill();
    if (inc && x > 1480 && x < 1640 && rnd(i + 70) > 0.15) { const rh = 20 + rnd(i + 3) * 36; ctx.fillStyle = SC[3] + 'cc'; rr(x + 2, 214, 4, rh, 2); ctx.fill(); }
  }
  if (lt > tW) text('Write: constant, heavy', 850, 244, { size: 24, weight: 700, color: C_DB, a: eOut(P(lt, tW, tW + 0.5)) });
  if (lt > tR) text('Read: bursts', 1655, 244, { size: 22, weight: 700, color: SC[3], a: eOut(P(lt, tR + 1, tR + 1.6)), align: 'left' });
  // B：85%
  const ba = eOut(P(lt, t85 - 0.3, t85 + 0.4));
  panel(820, 420, 1000, 190, 'QUERY RANGE', SC[3], ba);
  [['Last 26 hours', 0.85, SC[3], '85%'], ['Older', 0.15, DIM, '15%']].forEach(([l, v, c, vt], i) => {
    const y = 470 + i * 62, p = eOut(P(lt, t85 + 0.3 + i * 0.3, t85 + 1.6 + i * 0.3));
    text(l, 850, y + 33, { size: 26, weight: 700, color: c === DIM ? MUTE : c, a: ba });
    ctx.save(); ctx.globalAlpha *= ba; rr(1100, y + 8, 600, 30, 15); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.fillStyle = c; glow(c === DIM ? 'transparent' : c, 12); rr(1100, y + 8, Math.max(30, 600 * v * p), 30, 15); ctx.fill(); ctx.restore();
    text(vt, 1790, y + 33, { size: 26, weight: 800, font: MONO, align: 'right', a: ba * p });
  });
  // C：差值编码
  const ca = eOut(P(lt, tEnc - 0.3, tEnc + 0.4));
  panel(820, 630, 1000, 270, 'DELTA ENCODING', C_DB, ca);
  const rows = [['Timestamp', ['1613707265', '1613707275', '1613707285', '1613707295'], MUTE, 0], ['Delta', ['—', '+10', '+10', '+10'], SC[1], 0.6], ['Delta of deltas', ['—', '—', '0', '0'], C_OK, 0]];
  rows.forEach(([lab, cells, col, dl], r) => {
    const t0 = r === 0 ? tEnc : r === 1 ? tEnc + 1.2 : tDD - 0.2, a = eOut(P(lt, t0, t0 + 0.6)) * ca, y = 690 + r * 66;
    text(lab, 850, y + 36, { size: 24, weight: 700, color: col === MUTE ? INK : col, a });
    cells.forEach((c, i) => { const x = 1100 + i * 175; glass(x, y, 160, 54, { r: 12, a, accent: r === 2 && i > 1 ? C_OK : null, fill: 0.04 }); text(c, x + 80, y + 36, { size: r === 0 ? 22 : 28, weight: 700, font: MONO, align: 'center', color: i === 0 && r > 0 ? DIM : (r === 2 && i > 1 ? C_OK : INK), a }); });
  });
}

// ───────── 场景 7：降采样 ─────────
function sceneDown(lt, d) {
  header(lt, '07', 'Downsampling', SC[3], 'The older the data, the coarser');
  const tRet = cue('down', 'Keep seven', d), tEx = cue('down', 'Take points', d), tAvg = cue('down', 'Averaging each', d), tLoss = cue('down', 'Note that', d), tMax = cue('down', 'Store the max', d);
  // 保留策略
  const segs = [[820, 280, '0–7 days', 'raw', SC[0]], [1110, 340, '7–30 days', '1-min resolution', SC[1]], [1460, 360, '30 days–1 year', '1-hour resolution', SC[3]]];
  segs.forEach(([x, w, a1, b1, c], i) => { const t0 = tRet + i * 1.8, a = eOut(P(lt, t0, t0 + 0.6)); glass(x, 180, w, 110, { a, accent: c, r: 20 }); text(a1, x + w / 2, 226, { size: 26, weight: 700, align: 'center', color: c, a }); text(b1, x + w / 2, 266, { size: 24, align: 'center', color: INK, a }); });
  text('Illustrative: retention tiers by data age, not to scale', 820, 322, { size: 20, color: DIM, a: eOut(P(lt, tRet + 3.6, tRet + 4.4)) });
  // 示例
  const vals = [10, 16, 20, 30, 20, 30], bx = (i) => 900 + i * 150, by = (v) => 860 - v * 9;
  const ea = eOut(P(lt, tEx, tEx + 0.7));
  glass(820, 350, 1000, 550, { a: ea, r: 24 });
  text('cpu · host-a · one point per 10 s (book example)', 850, 392, { size: 22, weight: 700, color: MUTE, font: MONO, a: ea });
  const wins = [[0, 2, SC[0], '[00, 30)', 15.33], [3, 5, SC[1], '[30, 60)', 26.67]];
  const ghost = eOut(P(lt, tLoss + 1.5, tLoss + 2.5));
  vals.forEach((v, i) => {
    const a = eOut(P(lt, tEx + 0.3 + i * 0.25, tEx + 0.8 + i * 0.25)) * ea, h = (860 - by(v)) * a, col = i < 3 ? SC[0] : SC[1];
    ctx.save(); ctx.globalAlpha *= (1 - ghost * 0.72);
    ctx.fillStyle = col + '88'; glow(col, 10); rr(bx(i) - 30, 860 - h, 60, Math.max(h, 0.1), 8); if (h > 3) ctx.fill(); ctx.restore();
    text(String(v), bx(i), 860 - h - 12, { size: 26, weight: 800, font: MONO, align: 'center', a, color: INK });
    text(`:${String(i * 10).padStart(2, '0')}`, bx(i), 890, { size: 22, font: MONO, color: DIM, align: 'center', a });
  });
  wins.forEach(([a0, a1, c, lab, avg], k) => {
    const t0 = tAvg + k * 1.2, p = eOut(P(lt, tAvg - 0.8 + k * 1.2, tAvg + 0.2 + k * 1.2)), x0 = bx(a0) - 55, x1 = bx(a1) + 55;
    if (p > 0) { ctx.save(); ctx.globalAlpha *= p; ctx.fillStyle = c + '14'; rr(x0, 410, x1 - x0, 470, 16); ctx.fill(); ctx.setLineDash([6, 8]); ctx.strokeStyle = c + '88'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); text(lab, x0 + 16, 440, { size: 22, color: c, font: MONO, weight: 700, a: p }); }
    const q = eOut(P(lt, t0, t0 + 0.9));
    if (q > 0) { const y = by(avg); ctx.save(); ctx.strokeStyle = SC[3]; ctx.lineWidth = 5; glow(SC[3], 14); ctx.beginPath(); ctx.moveTo(x0 + 12, y); ctx.lineTo(lerp(x0 + 12, x1 - 12, q), y); ctx.stroke(); ctx.restore(); text(`avg ${avg.toFixed(2)}`, (x0 + x1) / 2, 484, { size: 28, weight: 800, color: SC[3], font: MONO, align: 'center', a: q }); }
    const m = eOut(P(lt, tMax + k * 0.5, tMax + 0.6 + k * 0.5)); if (m > 0) badge((x0 + x1) / 2 - 70, 506, `max ${k ? 30 : 20}`, SC[4], m);
  });
  // 左栏
  statCard(110, 430, 640, 'Window [00, 30)', '15.33', { color: SC[0], a: eOut(P(lt, tAvg - 0.4, tAvg + 0.3)), note: '(10+16+20) / 3' });
  statCard(110, 570, 640, 'Window [30, 60)', '26.67', { color: SC[1], a: eOut(P(lt, tAvg + 0.8, tAvg + 1.5)), note: '(30+20+30) / 3' });
  const na = eOut(P(lt, tAvg + 1.6, tAvg + 2.4));
  text('The book table lists 19 and 25, which is', 110, 740, { size: 24, color: MUTE, a: na });
  text('an arithmetic slip; corrected values used here.', 110, 776, { size: 24, color: MUTE, a: na });
  const la = eOut(P(lt, tLoss, tLoss + 0.7));
  text('Drop the raw points and spikes are lost', 110, 840, { size: 28, weight: 700, color: RED, a: la });
}

// ───────── 场景 8：告警规则（阈值 + 持续时间） ─────────
const UPM = (m) => { // up 指标：m 分钟处的值（0/1，带短暂过渡）
  const ramp = (a, b) => clamp((m - a) / 0.25) * (1 - clamp((m - b) / 0.25));
  return 1 - Math.max(ramp(2, 4), ramp(7, 15.5));
};
const stateAt = (m) => { // 返回 [状态, 已持续分钟]
  if (m >= 2 && m < 4) return ['pending', m - 2];
  if (m >= 7) { const e = m - 7; return e >= 5 ? ['firing', e] : ['pending', e]; }
  return ['inactive', 0];
};
function sceneAlert(lt, d) {
  header(lt, '08', 'Alert Rules', RED, 'Threshold + duration');
  const tRule = cue('alert', 'This rule', d), tDip1 = cue('alert', 'When the curve', d), tDip2 = cue('alert', 'Only when', d), tFire = cue('alert', 'does it fire', d);
  const tFast = cue('alert', 'A quick recovery', d);
  // 时间映射（分段线性）：各关键事件对齐旁白
  const KF = [[1.0, 0], [tDip1, 2], [tFast, 4], [tDip2 - 0.3, 7], [tFire, 12], [tFire + 4.0, 15]];
  let mCur = 0; for (let i = 1; i < KF.length; i++) if (lt >= KF[i - 1][0]) mCur = lerp(KF[i - 1][1], KF[i][1], clamp((lt - KF[i - 1][0]) / (KF[i][0] - KF[i - 1][0])));
  mCur = clamp(mCur, 0, 15);
  const run = lt > KF[0][0];
  const [st, dur] = run ? stateAt(mCur) : ['inactive', 0];
  // YAML 卡
  const ya = eOut(P(lt, 0.5, 1.2));
  glass(110, 390, 640, 250, { a: ya, accent: RED });
  [['alert: instance_down', INK], ['expr: up == 0', SC[1]], ['for: 5m', st === 'pending' ? SC[3] : INK], ['labels: { severity: page }', MUTE]].forEach(([s, c], i) => {
    const hl = (i === 1 && st !== 'inactive') || (i === 2 && st === 'pending');
    if (hl) { ctx.save(); ctx.fillStyle = (i === 2 ? SC[3] : RED) + '22'; rr(124, 430 + i * 50 - 6, 612, 44, 10); ctx.fill(); ctx.restore(); }
    text(s, 144, 468 + i * 50, { size: 28, weight: 700, font: MONO, color: c, a: ya * eOut(P(lt, tRule - 0.2 + i * 0.3, tRule + 0.4 + i * 0.3)) * 0 + ya });
  });
  const stC = { inactive: DIM, pending: SC[3], firing: RED };
  statCard(110, 680, 640, 'Rule state', st, { color: st === 'inactive' ? MUTE : stC[st], a: ya, h: 112 });
  text('for filters out flapping: spikes stay quiet', 110, 840, { size: 26, weight: 600, color: MUTE, a: eOut(P(lt, tDip2 + 2, tDip2 + 3)) });
  // 曲线
  const cx = 820, cy = 170, cw = 1000, chh = 400, x0 = 900, x1 = 1790, yU = 270, yD = 470, px = (m) => lerp(x0, x1, m / 15), py = (v) => lerp(yD, yU, v);
  panel(cx, cy, cw, chh, 'up · illustrative: one point per minute', SC[0], ya);
  ctx.save(); ctx.globalAlpha *= ya;
  ctx.fillStyle = RED + '14'; rr(x0 - 20, yD - 40, x1 - x0 + 40, 86, 10); ctx.fill();
  ctx.setLineDash([8, 8]); ctx.strokeStyle = RED + 'aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 - 20, yD - 40); ctx.lineTo(x1 + 20, yD - 40); ctx.stroke(); ctx.setLineDash([]);
  text('Condition true: up == 0', x0 - 6, yD + 36, { size: 20, color: RED, font: MONO, weight: 700 });
  text('1', x0 - 40, yU + 8, { size: 22, color: DIM, font: MONO }); text('0', x0 - 40, yD + 8, { size: 22, color: DIM, font: MONO });
  for (let m = 0; m <= 15; m += 5) text(`${m}`, px(m), cy + chh - 22, { size: 20, color: DIM, font: MONO, align: 'center' });
  text('min', cx + 26, cy + chh - 22, { size: 20, color: DIM });
  ctx.restore();
  if (run) {
    ctx.save(); ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const step = 0.05; let prev = 0;
    for (let m = step; m <= mCur + 1e-6; m += step) { const v = UPM(m), c = v < 0.5 ? RED : SC[0]; ctx.strokeStyle = c; glow(c, 12); ctx.beginPath(); ctx.moveTo(px(prev), py(UPM(prev))); ctx.lineTo(px(m), py(v)); ctx.stroke(); prev = m; }
    ctx.restore();
    dot(px(mCur), py(UPM(mCur)), 10, '#fff', { g: 26 });
  }
  // 状态时间线
  ctx.save(); ctx.globalAlpha *= ya;
  text('Rule state over time', 820, 618, { size: 22, color: MUTE, weight: 700 });
  rr(x0 - 20, 636, x1 - x0 + 40, 54, 12); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.restore();
  if (run) for (let m = 0; m < mCur; m += 0.05) { const [s] = stateAt(m + 0.025); if (s === 'inactive') continue; ctx.fillStyle = stC[s]; ctx.fillRect(px(m), 640, px(0.05) - px(0) + 0.8, 46); }
  [['inactive', 820], ['pending', 1010], ['firing', 1200]].forEach(([s, x]) => { dot(x + 12, 732, 8, stC[s], { g: 8 }); text(s, x + 30, 740, { size: 22, color: s === 'inactive' ? MUTE : stC[s], font: MONO, weight: 700 }); });
  // 计时器
  const tmA = eOut(P(lt, tRule, tRule + 0.6));
  glass(820, 770, 1000, 130, { a: tmA, r: 22, accent: SC[3] });
  text('Duration timer (for: 5m)', 850, 812, { size: 22, weight: 700, color: MUTE, a: tmA });
  const prog = st === 'inactive' ? 0 : clamp(dur / 5);
  ctx.save(); ctx.globalAlpha *= tmA; rr(850, 836, 780, 32, 16); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  if (prog > 0) { ctx.fillStyle = st === 'firing' ? RED : SC[3]; glow(st === 'firing' ? RED : SC[3], 14); rr(850, 836, Math.max(32, 780 * prog), 32, 16); ctx.fill(); } ctx.restore();
  text(`${(prog * 5).toFixed(1)} / 5 min`, 1800, 812, { size: 28, weight: 800, font: MONO, color: st === 'firing' ? RED : st === 'pending' ? SC[3] : DIM, align: 'right', a: tmA });
  // 回落提示
  if (run && mCur >= 4 && mCur < 7) text('Recovered, timer reset, no alert', 1335, 810 + 0, { size: 0.1, a: 0 });
  if (run && mCur >= 4 && mCur < 7.2) text('Recovered: timer reset', 1190, 812, { size: 26, weight: 700, color: C_OK, a: eOut(P(mCur, 4.1, 4.5)) * (1 - P(mCur, 6.4, 7.2)), align: 'left' });
  // 触发
  if (run && st === 'firing') {
    const fa = eBack(P(lt, tFire - 0.1, tFire + 0.6)), a = clamp(fa * 1.5);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(1600, 335); ctx.scale(clamp(fa, 0.01, 1.1), clamp(fa, 0.01, 1.1));
    glass(-170, -52, 340, 104, { r: 22, accent: RED, fill: 0.12 }); glow(RED, 20);
    text('FIRING · event', 0, 12, { size: 28, weight: 800, color: RED, align: 'center', font: MONO });
    ctx.restore();
  }
}

// ───────── 场景 9：告警管理器 ─────────
function sceneMgr(lt, d) {
  header(lt, '09', 'Alert Manager', SC[3], 'Dedup, route, retry');
  const tF = cue('mgr', 'It filters', d), tK = cue('mgr', 'The event is written', d), tCh = cue('mgr', 'consumers send', d), tRetry = cue('mgr', 'If delivery fails', d), tNo = cue('mgr', 'One more rule', d);
  bullet(0, 'Filter · merge · dedup', eOut(P(lt, tF, tF + 0.6)));
  bullet(1, 'Kafka, then send via channels', eOut(P(lt, tK, tK + 0.6)));
  bullet(2, 'Retry on failure: at-least-once', eOut(P(lt, tRetry, tRetry + 0.6)));
  bullet(3, 'Receivers dedup too', eOut(P(lt, tRetry + 2, tRetry + 2.6)), { color: MUTE });
  // 事件进入
  const ma = eOut(P(lt, 0.4, 1));
  box(830, 330, 300, 200, 'Alert manager', { color: SC[3], a: ma, size: 28, sub: 'filter / merge / dedup' });
  let recv = 0; for (let k = 0; k < 5; k++) { const t0 = tF - 0.3 + k * 0.45, u = P(lt, t0, t0 + 0.7); if (u > 0) { recv++; if (u < 1) { const y = lerp(190, 360, eIO(u)); ctx.save(); glass(850, y, 260, 52, { r: 14, accent: RED, fill: 0.12 }); text('instance_down i631', 980, y + 34, { size: 20, font: MONO, weight: 700, align: 'center' }); ctx.restore(); } } }
  const tMerge = tF + 3.2;
  text(`received ${recv}  →  sent ${lt > tMerge ? 1 : 0}`, 980, 570, { size: 28, weight: 800, font: MONO, color: SC[3], align: 'center', a: eOut(P(lt, tF + 0.2, tF + 0.8)) });
  // Kafka
  const kA = eOut(P(lt, tK, tK + 0.6));
  box(1250, 345, 170, 130, 'Kafka', { color: C_Q, sub: 'alert queue', a: kA, size: 28 });
  if (lt > tMerge - 0.3) arrow(1130, 410, 1250, 410, { color: SC[3], a: eOut(P(lt, tMerge - 0.3, tMerge + 0.2)) });
  const pk = P(lt, tMerge, tMerge + 1.1); if (pk > 0 && pk < 1) packet(1130, 410, 1250, 410, pk, RED, { r: 10 });
  // 渠道
  const chs = [['Email', SC[0]], ['Phone', SC[2]], ['PagerDuty', SC[1]], ['Webhook', SC[3]]], chY = (i) => 200 + i * 130;
  chs.forEach(([n, c], i) => {
    const a = eOut(P(lt, tCh + i * 0.35, tCh + 0.6 + i * 0.35)), isF = i === 3, failing = isF && lt > tCh + 2.2 && lt < tRetry + 2.6;
    box(1600, chY(i), 230, 92, n, { color: c, a, hot: failing, size: 26 });
    if (a > 0.5) arrow(1420, 410, 1600, chY(i) + 46, { color: MUTE + '88', w: 2, head: 10 });
    const t0 = tCh + 1.0 + i * 0.15, u = P(lt, t0, t0 + 0.9);
    if (u > 0 && u < 1 && !isF) packet(1420, 410, 1600, chY(i) + 46, u, RED, { r: 8 });
    if (isF) {
      const tf = tCh + 1.0 + 0.45; const u1 = P(lt, tf, tf + 0.9); if (u1 > 0 && u1 < 1) packet(1420, 410, 1600, chY(i) + 46, u1, RED, { r: 8 });
      if (lt > tf + 0.9 && lt < tRetry + 1.2) text('✕ Failed', 1715, chY(i) + 130, { size: 26, weight: 800, color: RED, align: 'center', a: eOut(P(lt, tf + 0.9, tf + 1.3)) });
      const tr = tRetry + 0.6, u2 = P(lt, tr, tr + 0.9); if (u2 > 0 && u2 < 1) packet(1420, 410, 1600, chY(i) + 46, u2, SC[3], { r: 10 });
      if (lt > tr + 0.9) text('✓ Retry OK', 1715, chY(i) + 130, { size: 26, weight: 800, color: C_OK, align: 'center', a: eOut(P(lt, tr + 0.9, tr + 1.4)) });
    }
  });
  // 两张提示卡
  const a1 = eOut(P(lt, tRetry + 1.8, tRetry + 2.6));
  glass(820, 750, 480, 150, { a: a1, accent: SC[3], r: 22 });
  text('At-least-once', 850, 798, { size: 22, color: MUTE, weight: 700, a: a1 });
  text('May deliver twice', 850, 842, { size: 32, weight: 800, a: a1 });
  text('Receivers must dedup', 850, 880, { size: 24, color: SC[3], a: a1 });
  const a2 = eOut(P(lt, tNo, tNo + 0.7));
  glass(1330, 750, 500, 150, { a: a2, accent: RED, r: 22 });
  text('Missing metrics', 1360, 798, { size: 22, color: MUTE, weight: 700, a: a2 });
  text('No data ≠ healthy', 1360, 842, { size: 36, weight: 800, color: RED, a: a2 });
  text('Add an explicit absence rule', 1360, 880, { size: 24, color: MUTE, a: a2 });
}

// ───────── 场景 10：总结 ─────────
function sceneEnd(lt, d) {
  // 右上装饰：一条会越线的小曲线
  ctx.save(); ctx.globalAlpha *= 0.7 * eOut(P(lt, 0.2, 1));
  const x0 = 1380, x1 = 1810, y0 = 170, hh = 150, prog = P(lt, 0.4, 3);
  ctx.strokeStyle = SC[0]; ctx.lineWidth = 5; glow(SC[0], 14); ctx.lineJoin = 'round'; ctx.beginPath();
  for (let u = 0; u <= prog + 1e-6; u += 0.01) { const x = lerp(x0, x1, u), y = y0 + hh - (0.35 + 0.22 * Math.sin(u * 9) + 0.5 * u * u) * hh * 0.85; u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([8, 8]); ctx.strokeStyle = RED + 'aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0 + 40); ctx.lineTo(x1, y0 + 40); ctx.stroke(); ctx.restore();
  text('Metrics Monitoring', 110, 235, { size: 76, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('and Alerting System', 110, 315, { size: 76, weight: 900, a: eOut(P(lt, 0.3, 1.0)) });
  const tA = cue2(lt, d, 0.12), cards = [['Time series', 'Name, labels, timestamped values\nControl label cardinality', SC[0]], ['Collect + queue', 'Pull: discovery. Push: agent.\nKafka rides out failures', SC[3]], ['Threshold + duration', 'for filters flapping, dedup + retry\nMissing data needs a rule', RED]];
  void tA;
  cards.forEach(([w, s, c], k) => {
    const t0 = cue('end', ['One:', 'Two:', 'Three:'][k], d), p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 300, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: fitSize(w, 448, 56), weight: 800 });
    s.split('\n').forEach((l, i) => text(l, x + 36, 628 + i * 40, { size: 26, color: MUTE }));
    ctx.restore();
  });
  text('Collect → Transport → Store → Alert → Visualize', 110, 810, { size: 30, weight: 700, color: INK, a: eOut(P(lt, cue('end', 'Three:', d) + 3, cue('end', 'Three:', d) + 3.8)) });
}
const cue2 = () => 0;

export const scenes = { title: undefined, model: sceneModel, card: sceneCard, pull: scenePull, push: scenePush, queue: sceneQueue, tsdb: sceneTsdb, down: sceneDown, alert: sceneAlert, mgr: sceneMgr, end: sceneEnd };
delete scenes.title;
