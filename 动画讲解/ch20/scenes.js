// 第 20 章 指标监控与告警系统：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 20, title: '指标监控与告警系统', en: 'Metrics Monitoring & Alerting' };

// 角色配色：采集器 青、队列 琥珀、处理/消费者 靛、时序库 粉、新增/成功 青柠、失败/告警 红
const C_COL = SC[0], C_Q = SC[3], C_PROC = SC[1], C_DB = SC[2], C_OK = SC[4];

// 旁白原文（用于按字符位置估算画面节拍；与 script.json 保持一致）
const TX = {
  model: '监控的数据叫时间序列。一条序列由指标名加一组标签确定，比如 CPU 负载，主机 web 零一，地域美西。每隔一会儿，它就多一个带时间戳的值，连起来就是曲线。一千个池，每池一百台，每台约一百个指标，共一千万条序列。',
  card: '序列数由实际出现的标签组合决定。方法名只有 GET 和 POST，序列只多一倍。可要是把请求 ID 放进标签，每个请求都会新开一条序列，一千万条很快就失控。所以标签基数必须限制。',
  pull: '数据怎么进来？先看拉模型。采集器要知道有哪些服务，所以用 ZooKeeper 或 etcd 做服务发现。拿到名单，就按间隔访问每台服务的 metrics 端点，把指标拉回来。采集器有多个，每个目标由哈希环上的一个采集器负责，避免重复采集。',
  push: '推模型相反：每台机器旁放一个 Agent，在本机采集，再主动推给中央采集器，前面要有负载均衡。怎么选？看服务突然没数据。拉模型里，拉取失败本身就是信号。推模型里，可能是服务挂了，也可能只是网络断了，分不清。',
  queue: '采集器直接写时序数据库，数据库一宕机数据就丢了。所以中间放一个 Kafka：采集器只管写入队列，消费者再写进数据库。数据库故障时，数据先堆在队列里，恢复后继续写。代价是多一套要运维的系统。',
  tsdb: '存储是设计的核心。访问模式是持续大量写入，平时读得少，出事才集中查。书里说，约百分之八十五的查询针对过去二十六小时，所以近期数据要放在快的地方。时序库还会压缩：只存时间差，间隔稳定时，差值的差值几乎全是零。',
  down: '旧数据还要降采样：七天内保留原样，之后一分钟精度留三十天，再往后一小时精度留到一年。例子里十秒一个点，三十秒取平均，应是十五点三三和二十六点六七。注意，尖峰被平均抹平，原始点丢了就找不回，必要时要另存最大值。',
  alert: '告警规则不是一越线就响。这条规则是：up 等于零，持续 for 五分钟。曲线越线，先进入待定状态，开始计时。很快回落，只是尖峰，不报警。一直越线满五分钟，才触发，生成告警事件。持续时长，就是用来过滤抖动的。',
  mgr: '触发后交给告警管理器：先过滤、合并、去重，同一实例反复触发只产生一个事件，再写入 Kafka，由消费者发邮件、电话、PagerDuty 或 Webhook。送不出就重试，至少一次送达，所以通知端也要去重。还有一条：没有数据，不等于健康。',
};
// 短语在旁白中出现的局部时间（旁白从 lt=0.7 开始，时长 = d-1.7）
const cue = (id, phrase, d) => { const t = TX[id], i = t.indexOf(phrase); if (i < 0) throw new Error('cue missing: ' + phrase); return 0.7 + (d - 1.7) * (i / t.length); };
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
  header(lt, '01', '指标数据模型', SC[0], '时间序列 = 名称 + 标签 + 时间戳的值');
  const tN = cue('model', '一条序列', d), tL = cue('model', '比如', d), tT = cue('model', '每隔一会儿', d), tS = cue('model', '一千个池', d);
  bullet(0, '指标名：CPU.load', eOut(P(lt, tN, tN + 0.6)));
  bullet(1, '标签：host、region', eOut(P(lt, tL, tL + 0.6)));
  bullet(2, '时间戳 + 值：一个数据点', eOut(P(lt, tT, tT + 0.6)));
  statCard(110, 640, 640, '序列总数', '1000 万', { color: SC[0], a: eOut(P(lt, tS, tS + 0.7)), note: '1000×100×100' });
  text('示意：若 10 秒采一次，约每秒 100 万个点', 110, 790, { size: 22, color: DIM, a: eOut(P(lt, tS + 3, tS + 3.8)) });
  // 序列标识
  const ka = eOut(P(lt, 0.8, 1.6));
  glass(820, 180, 1000, 140, { a: ka, r: 24, accent: SC[1] });
  const parts = [['CPU.load', SC[0]], ['{', MUTE], ['host', SC[1]], ['=', MUTE], ['"web01"', SC[1]], [', ', MUTE], ['region', SC[2]], ['=', MUTE], ['"us-west"', SC[2]], ['}', MUTE]];
  segText(parts, 850, 245, 38, ka);
  const wName = measure('CPU.load', 38), wTags = measure('{host="web01", region="us-west"}', 38);
  const cl = (t0, x, w, label, c) => { const a = eOut(P(lt, t0, t0 + 0.5)); if (a <= 0) return; ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = c; ctx.fillRect(x, 262, w, 4); ctx.restore(); text(label, x + w / 2, 300, { size: 22, weight: 700, color: c, align: 'center', a }); };
  cl(tN, 850, wName, '指标名', SC[0]);
  cl(tL, 850 + wName, wTags, '标签（共同标识一条序列）', SC[1]);
  // 曲线
  const cx = 820, cy = 350, cw = 1000, chh = 530;
  panel(cx, cy, cw, chh, 'ONE SERIES · 每个点：时间戳 + 值', SC[0], eOut(P(lt, 1.2, 2)));
  const x0 = cx + 60, x1 = cx + cw - 40, yb = cy + chh - 60, yt = cy + 110, N = 24;
  const px = (k) => lerp(x0, x1, k / (N - 1)), py = (v) => lerp(yb, yt, (v - 20) / 80);
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 1.4, 2.2)); ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1.5;
  [20, 40, 60, 80, 100].forEach((v) => { ctx.beginPath(); ctx.moveTo(x0 - 10, py(v)); ctx.lineTo(x1 + 10, py(v)); ctx.stroke(); text(String(v), x0 - 16, py(v) + 7, { size: 20, color: DIM, align: 'right', font: MONO }); });
  ctx.restore();
  text('时间 →', x1 + 10, yb + 40, { size: 20, color: DIM, align: 'right', a: eOut(P(lt, 1.6, 2.2)) });
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
  header(lt, '02', '标签基数', RED, '序列数 = 实际出现的标签组合');
  const tA = cue('card', '方法名', d), tB = cue('card', '可要是', d), tC = cue('card', '所以标签', d);
  bullet(0, '序列数看标签组合，不看名字', eOut(P(lt, 0.9, 1.5)));
  bullet(1, '低基数：method 只有 2 个值', eOut(P(lt, tA, tA + 0.6)));
  bullet(2, '高基数：request_id 无上限', eOut(P(lt, tB, tB + 0.6)), { color: RED });
  statCard(110, 660, 640, '结论', '限制标签基数', { color: RED, a: eOut(P(lt, tC, tC + 0.7)) });
  // 面板 A
  const aa = eOut(P(lt, 0.7, 1.4));
  panel(820, 180, 1000, 250, 'LOW CARDINALITY', SC[0], aa);
  text('method = { GET, POST }', 850, 262, { size: 30, weight: 700, font: MONO, color: SC[0], a: aa });
  ['GET', 'POST'].forEach((m, i) => { const t0 = tA + 0.3 + i * 0.5, p = eBack(P(lt, t0, t0 + 0.5)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; const x = 850 + i * 250; glass(x, 300, 220, 80, { r: 18, accent: SC[0] }); text(`method=${m}`, x + 110, 349, { size: 26, weight: 700, font: MONO, align: 'center' }); ctx.restore(); });
  text('2 条序列', 1790, 349, { size: 40, weight: 800, font: MONO, color: SC[0], align: 'right', a: eOut(P(lt, tA + 1, tA + 1.6)) });
  // 面板 B
  const ba = eOut(P(lt, tB - 0.4, tB + 0.3));
  panel(820, 460, 1000, 440, 'HIGH CARDINALITY', RED, ba);
  text('request_id = 每个请求都不同', 850, 540, { size: 30, weight: 700, font: MONO, color: RED, a: ba });
  const cols = 25, rows = 6, cs = 38, gx = 850, gy = 580, total = cols * rows;
  const prog = P(lt, tB + 0.8, tB + 0.8 + 6.5), n = Math.floor(total * prog * prog) + (prog > 0 ? 1 : 0);
  for (let i = 0; i < Math.min(n, total); i++) {
    const age = (lt - (tB + 0.8)) , c = i % cols, r = Math.floor(i / cols), appear = eBack(P(prog * prog * total - i, 0, 1.5));
    const s = clamp(appear, 0, 1.2);
    ctx.save(); ctx.translate(gx + c * cs + 15, gy + r * cs + 15); ctx.scale(s, s); ctx.fillStyle = RED + (i % 3 ? '99' : 'dd'); rr(-15, -15, 30, 30, 8); ctx.fill(); ctx.restore(); void age;
  }
  const cnt = Math.round(10000000 * prog * prog / 10000);
  text(`每个方块 = 一条新序列（示意）`, 850, 882, { size: 22, color: DIM, a: ba });
  if (prog > 0) text(`≈ ${cnt} 万条`, 1800, 882, { size: 34, weight: 800, font: MONO, color: RED, align: 'right', a: ba });
}

// ───────── 场景 3：拉模型 ─────────
function scenePull(lt, d) {
  header(lt, '03', '拉模型', SC[0], '服务发现 + 定时拉取');
  const tD = cue('pull', '所以用', d), tList = cue('pull', '拿到名单', d), tPull = cue('pull', '访问每台', d), tMulti = cue('pull', '采集器有多个', d);
  bullet(0, '服务发现：etcd / ZooKeeper', eOut(P(lt, tD, tD + 0.6)));
  bullet(1, '按间隔访问 /metrics', eOut(P(lt, tPull, tPull + 0.6)));
  bullet(2, '哈希环：一个目标一个采集器', eOut(P(lt, tMulti, tMulti + 0.6)));
  const TY = (i) => 200 + i * 118, ownC = [0, 0, 1, 0, 1, 1];
  const split = eOut(P(lt, tMulti + 0.8, tMulti + 1.6)) > 0.5;
  const own = (i) => (split ? ownC[i] : 0);
  for (let i = 0; i < 6; i++) { const a = eOut(P(lt, 0.6 + i * 0.12, 1.2 + i * 0.12)); box(1590, TY(i), 230, 78, `web-${String(i + 1).padStart(2, '0')}`, { color: SC[own(i) === 0 ? 0 : 2], sub: ':9100/metrics', a, size: 24 }); }
  // 服务发现
  box(820, 400, 240, 150, '服务发现', { color: C_Q === 0 ? SC[3] : SC[3], sub: 'etcd / ZooKeeper', a: eOut(P(lt, tD - 0.3, tD + 0.4)), size: 28 });
  // 采集器
  const spP = eIO(P(lt, tMulti + 0.6, tMulti + 1.6)), c1y = lerp(400, 250, spP), c2y = 590;
  box(1190, c1y, 220, 120, '采集器 1', { color: SC[0], a: eOut(P(lt, tList - 1.2, tList - 0.5)), size: 26, sub: 'collector' });
  const c2p = eBack(P(lt, tMulti, tMulti + 0.8));
  if (c2p > 0.02) box(1190, c2y, 220, 120, '采集器 2', { color: SC[2], a: clamp(c2p * 2), s: clamp(c2p, 0.01, 1.1), size: 26, sub: 'collector' });
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
  if (split) text('一致性哈希分配', 1300, 760, { size: 24, color: MUTE, align: 'center', a: eOut(P(lt, tMulti + 1.4, tMulti + 2.2)) });
}

// ───────── 场景 4：推 vs 拉 ─────────
function scenePush(lt, d) {
  header(lt, '04', '推 vs 拉', SC[1], '服务突然没数据，怎么分？');
  const tA = cue('push', '每台机器', d), tQ = cue('push', '怎么选', d), tPullF = cue('push', '拉模型里', d), tPushF = cue('push', '推模型里', d);
  bullet(0, '推：Agent 本机采集后上报', eOut(P(lt, tA, tA + 0.6)));
  bullet(1, '拉：失败本身就是信号', eOut(P(lt, tPullF, tPullF + 0.6)));
  bullet(2, '推：没数据，原因不明', eOut(P(lt, tPushF, tPushF + 0.6)), { color: SC[3] });
  const fail = lt > tQ + 0.8;
  // 上：推
  const pa = eOut(P(lt, 0.5, 1.2));
  panel(810, 170, 1020, 360, 'PUSH 推', SC[1], pa);
  box(840, 250, 230, 160, '服务', { color: fail ? RED : SC[0], sub: '+ Agent', a: pa, hot: fail && lt < tPushF + 3 });
  box(1190, 275, 170, 110, '负载均衡', { color: SC[1], a: pa * eOut(P(lt, tA + 0.8, tA + 1.4)), size: 24 });
  box(1470, 250, 200, 160, '采集器', { color: SC[0], a: pa, size: 28 });
  arrow(1070, 330, 1190, 330, { color: MUTE, a: pa * eOut(P(lt, tA + 0.6, tA + 1.2)) }); arrow(1360, 330, 1470, 330, { color: MUTE, a: pa * eOut(P(lt, tA + 0.8, tA + 1.4)) });
  const tPk = tA + 0.5;
  if (lt > tPk && !fail) { for (let k = 0; k < 3; k++) { const u = fr(lt * 0.8 + k / 3); packet(1070, 330, 1470, 330, u, SC[0], { r: 8 }); } }
  const q = eOut(P(lt, tPushF, tPushF + 0.8));
  if (q > 0) {
    ctx.save(); ctx.globalAlpha *= q; ctx.setLineDash([8, 8]); ctx.strokeStyle = SC[3]; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(1090, 330); ctx.lineTo(1450, 330); ctx.stroke(); ctx.restore();
    text('?', 1270, 440, { size: 80, weight: 800, color: SC[3], align: 'center', a: q });
    badge(850, 450, '服务挂了？', SC[3], q); badge(1030, 450, '网络断了？', SC[3], q * eOut(P(lt, tPushF + 0.6, tPushF + 1.2)));
  }
  // 下：拉
  panel(810, 560, 1020, 350, 'PULL 拉', SC[0], pa);
  box(840, 640, 230, 160, '采集器', { color: SC[0], a: pa, size: 28 });
  box(1470, 640, 230 - 30, 160, '服务', { color: fail ? RED : SC[0], sub: '/metrics', a: pa, hot: fail && lt < tPullF + 4 });
  arrow(1070, 700, 1470, 700, { color: MUTE, a: pa * 0.6 }); arrow(1470, 745, 1070, 745, { color: MUTE, a: pa * 0.6 });
  if (!fail && lt > 1.5) { for (let k = 0; k < 2; k++) { const u = fr(lt * 0.7 + k / 2); packet(1070, 700, 1470, 700, u, SC[3], { r: 6, trail: 0.05 }); packet(1470, 745, 1070, 745, u, SC[0], { r: 8 }); } }
  if (fail) {
    const u = fr((lt - tQ) * 0.7); packet(1070, 700, 1470, 700, u, SC[3], { r: 6, trail: 0.05 });
    const ra = eOut(P(lt, tPullF, tPullF + 0.6));
    text('✕', 1585, 640 + 80 + 14, { size: 40, weight: 800, color: RED, align: 'center', a: 0 });
    if (ra > 0) { badge(850, 835, '拉取失败 = 明确的信号', RED, ra); text('up = 0', 1700, 700, { size: 30, weight: 800, color: RED, font: MONO, a: ra }); }
  }
}

// ───────── 场景 5：队列缓冲 ─────────
function sceneQueue(lt, d) {
  header(lt, '05', '队列缓冲', C_Q, 'Kafka 扛住下游故障');
  const tDie1 = cue('queue', '一宕机', d), tK = cue('queue', '所以中间', d), tDie2 = cue('queue', '数据库故障时', d) - 0.4, tRec = cue('queue', '恢复后', d), tCost = cue('queue', '代价', d);
  bullet(0, '直写：数据库宕机就丢数据', eOut(P(lt, 0.9, 1.5)), { color: RED });
  bullet(1, '采集器只管写队列', eOut(P(lt, tK + 0.3, tK + 0.9)));
  bullet(2, '数据库恢复后继续消费', eOut(P(lt, tRec - 0.2, tRec + 0.4)));
  bullet(3, '代价：多一套系统要运维', eOut(P(lt, tCost, tCost + 0.6)), { color: MUTE });
  const dbDown1 = lt > tDie1 && lt < tK - 0.2, dbDown2 = lt > tDie2 && lt < tRec;
  const hot = dbDown1 || dbDown2;
  const Y = 440;
  box(820, Y, 190, 120, '采集器', { color: C_COL, a: eOut(P(lt, 0.4, 1)), size: 26 });
  const ka = eOut(P(lt, tK, tK + 0.7)), kp = eBack(P(lt, tK, tK + 0.7));
  box(1100, Y, 190, 120, 'Kafka', { color: C_Q, sub: '队列', a: clamp(ka), s: clamp(kp, 0.01, 1.1), size: 28 });
  box(1380, Y, 180, 120, '消费者', { color: C_PROC, a: clamp(ka), s: clamp(kp, 0.01, 1.1), size: 26 });
  dbIcon(1670, Y - 20, 130, 150, '时序库', { color: hot ? RED : C_DB, a: eOut(P(lt, 0.4, 1)) });
  // 阶段 A：直写
  if (lt < tK + 0.6) {
    const fa = 1 - eOut(P(lt, tK, tK + 0.6));
    arrow(1010, Y + 60, 1670, Y + 60, { color: MUTE, a: fa * 0.7 });
    let lost = 0;
    for (let k = 0; k < 120; k++) { const t0 = 1.0 + k * 0.45; if (t0 > lt - 1.3) break; if (t0 > tDie1 - 0.55 && t0 < tK - 0.5) lost++; }
    for (let k = 0; k < 4; k++) { const t0 = 1.0 + k * 0.45, u = fr((lt - 1.0) * 0.5 + k / 4); if (lt < 1.0) break; const x = lerp(1010, 1670, u); const dead = lt > tDie1 && u > 0.97; if (dead) continue; dot(x, Y + 60, 8, C_COL, { g: 18, a: fa }); }
    if (dbDown1) { const t = lt - tDie1; for (let k = 0; k < 3; k++) { const u = fr(t * 0.9 + k / 3), a = 1 - u; text('✕', 1640, Y + 70 - u * 30, { size: 30, weight: 800, color: RED, align: 'center', a }); } }
    text('数据库宕机', 1735, Y + 200, { size: 24, weight: 700, color: RED, align: 'center', a: fa * eOut(P(lt, tDie1, tDie1 + 0.5)) });
    if (dbDown1) text(`丢失 ${Math.round((lt - tDie1) * 9)} 点`, 1340, Y - 40, { size: 40, weight: 800, color: RED, font: MONO, align: 'center', a: fa });
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
    text('积压', 1195, 660, { size: 22, color: MUTE, align: 'center', a: ka });
    text(`${Math.round(backlog * 1000)}`, 1195, 704, { size: 34, weight: 800, font: MONO, color: C_Q, align: 'center', a: ka });
    if (dbDown2) text('数据先堆在队列里', 1500, 640, { size: 26, weight: 700, color: C_Q, align: 'center', a: eOut(P(lt, tDie2 + 0.3, tDie2 + 1)) });
    if (lt > tRec) text('恢复，继续写入，不丢点', 1600, 700, { size: 26, weight: 700, color: C_OK, align: 'center', a: eOut(P(lt, tRec, tRec + 0.6)) });
    text('示意', 1195, 890 - 0, { size: 0.1, a: 0 });
  }
}

// ───────── 场景 6：时序数据库 ─────────
function sceneTsdb(lt, d) {
  header(lt, '06', '时序数据库', C_DB, '写多读少，近期最热');
  const tW = cue('tsdb', '访问模式', d), tR = cue('tsdb', '出事才', d), t85 = cue('tsdb', '书里说', d), tEnc = cue('tsdb', '时序库还会压缩', d), tDD = cue('tsdb', '差值的差值', d);
  bullet(0, '持续大量写入', eOut(P(lt, tW, tW + 0.6)));
  bullet(1, '平时少读，出事集中查', eOut(P(lt, tR, tR + 0.6)));
  bullet(2, '近期热数据放在快的地方', eOut(P(lt, t85 + 2, t85 + 2.6)));
  bullet(3, '时间差编码压缩', eOut(P(lt, tEnc, tEnc + 0.6)));
  statCard(110, 700, 640, '针对过去 26 小时的查询', '约 85%', { color: SC[3], a: eOut(P(lt, t85, t85 + 0.7)), h: 130 });
  // A：写读流
  const aa = eOut(P(lt, 0.4, 1.1));
  panel(820, 170, 1000, 230, 'WRITE / READ', C_DB, aa);
  const sx = 850, ex = 1790, cur = lerp(sx, ex, P(lt, tW - 0.3, tR + 5.5));
  for (let x = sx; x <= cur; x += 7) {
    const i = Math.round((x - sx) / 7), inc = x > 1480 && x < 1640;
    const hh = 22 + rnd(i + 11) * 40; ctx.fillStyle = C_DB + 'cc'; rr(x, 345 - hh * (inc ? 1.25 : 1), 4, hh * (inc ? 1.25 : 1), 2); ctx.fill();
    if (inc && x > 1480 && x < 1640 && rnd(i + 70) > 0.15) { const rh = 20 + rnd(i + 3) * 36; ctx.fillStyle = SC[3] + 'cc'; rr(x + 2, 214, 4, rh, 2); ctx.fill(); }
  }
  if (lt > tW) text('写：持续大量', 850, 244, { size: 24, weight: 700, color: C_DB, a: eOut(P(lt, tW, tW + 0.5)) });
  if (lt > tR) text('读：事故集中', 1655, 244, { size: 22, weight: 700, color: SC[3], a: eOut(P(lt, tR + 1, tR + 1.6)), align: 'left' });
  // B：85%
  const ba = eOut(P(lt, t85 - 0.3, t85 + 0.4));
  panel(820, 420, 1000, 190, 'QUERY RANGE', SC[3], ba);
  [['过去 26 小时', 0.85, SC[3], '85%'], ['更早', 0.15, DIM, '15%']].forEach(([l, v, c, vt], i) => {
    const y = 470 + i * 62, p = eOut(P(lt, t85 + 0.3 + i * 0.3, t85 + 1.6 + i * 0.3));
    text(l, 850, y + 33, { size: 26, weight: 700, color: c === DIM ? MUTE : c, a: ba });
    ctx.save(); ctx.globalAlpha *= ba; rr(1100, y + 8, 600, 30, 15); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.fillStyle = c; glow(c === DIM ? 'transparent' : c, 12); rr(1100, y + 8, Math.max(30, 600 * v * p), 30, 15); ctx.fill(); ctx.restore();
    text(vt, 1790, y + 33, { size: 26, weight: 800, font: MONO, align: 'right', a: ba * p });
  });
  // C：差值编码
  const ca = eOut(P(lt, tEnc - 0.3, tEnc + 0.4));
  panel(820, 630, 1000, 270, 'DELTA ENCODING', C_DB, ca);
  const rows = [['时间戳', ['1613707265', '1613707275', '1613707285', '1613707295'], MUTE, 0], ['差值', ['—', '+10', '+10', '+10'], SC[1], 0.6], ['差值的差值', ['—', '—', '0', '0'], C_OK, 0]];
  rows.forEach(([lab, cells, col, dl], r) => {
    const t0 = r === 0 ? tEnc : r === 1 ? tEnc + 1.2 : tDD - 0.2, a = eOut(P(lt, t0, t0 + 0.6)) * ca, y = 690 + r * 66;
    text(lab, 850, y + 36, { size: 24, weight: 700, color: col === MUTE ? INK : col, a });
    cells.forEach((c, i) => { const x = 1100 + i * 175; glass(x, y, 160, 54, { r: 12, a, accent: r === 2 && i > 1 ? C_OK : null, fill: 0.04 }); text(c, x + 80, y + 36, { size: r === 0 ? 22 : 28, weight: 700, font: MONO, align: 'center', color: i === 0 && r > 0 ? DIM : (r === 2 && i > 1 ? C_OK : INK), a }); });
  });
}

// ───────── 场景 7：降采样 ─────────
function sceneDown(lt, d) {
  header(lt, '07', '降采样', SC[3], '越旧的数据，精度越低');
  const tRet = cue('down', '七天内', d), tEx = cue('down', '例子里', d), tAvg = cue('down', '应是', d), tLoss = cue('down', '注意', d), tMax = cue('down', '必要时', d);
  // 保留策略
  const segs = [[820, 280, '0–7 天', '原样', SC[0]], [1110, 340, '7–30 天', '1 分钟精度', SC[1]], [1460, 360, '30 天–1 年', '1 小时精度', SC[3]]];
  segs.forEach(([x, w, a1, b1, c], i) => { const t0 = tRet + i * 1.8, a = eOut(P(lt, t0, t0 + 0.6)); glass(x, 180, w, 110, { a, accent: c, r: 20 }); text(a1, x + w / 2, 226, { size: 26, weight: 700, align: 'center', color: c, a }); text(b1, x + w / 2, 266, { size: 24, align: 'center', color: INK, a }); });
  text('示意：保留规则按数据年龄划分，不按比例绘制', 820, 322, { size: 20, color: DIM, a: eOut(P(lt, tRet + 3.6, tRet + 4.4)) });
  // 示例
  const vals = [10, 16, 20, 30, 20, 30], bx = (i) => 900 + i * 150, by = (v) => 860 - v * 9;
  const ea = eOut(P(lt, tEx, tEx + 0.7));
  glass(820, 350, 1000, 550, { a: ea, r: 24 });
  text('cpu · host-a · 每 10 秒一个点（原书示例）', 850, 392, { size: 22, weight: 700, color: MUTE, font: MONO, a: ea });
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
    if (q > 0) { const y = by(avg); ctx.save(); ctx.strokeStyle = SC[3]; ctx.lineWidth = 5; glow(SC[3], 14); ctx.beginPath(); ctx.moveTo(x0 + 12, y); ctx.lineTo(lerp(x0 + 12, x1 - 12, q), y); ctx.stroke(); ctx.restore(); text(`平均 ${avg.toFixed(2)}`, (x0 + x1) / 2, 484, { size: 28, weight: 800, color: SC[3], font: MONO, align: 'center', a: q }); }
    const m = eOut(P(lt, tMax + k * 0.5, tMax + 0.6 + k * 0.5)); if (m > 0) badge((x0 + x1) / 2 - 70, 506, `max ${k ? 30 : 20}`, SC[4], m);
  });
  // 左栏
  statCard(110, 430, 640, '窗口 [00, 30)', '15.33', { color: SC[0], a: eOut(P(lt, tAvg - 0.4, tAvg + 0.3)), note: '(10+16+20) / 3' });
  statCard(110, 570, 640, '窗口 [30, 60)', '26.67', { color: SC[1], a: eOut(P(lt, tAvg + 0.8, tAvg + 1.5)), note: '(30+20+30) / 3' });
  const na = eOut(P(lt, tAvg + 1.6, tAvg + 2.4));
  text('书中原表写为 19 与 25，算术有误；', 110, 740, { size: 24, color: MUTE, a: na });
  text('此处以纠正后的数值为准。', 110, 776, { size: 24, color: MUTE, a: na });
  const la = eOut(P(lt, tLoss, tLoss + 0.7));
  text('原始点丢弃后，尖峰无法恢复', 110, 840, { size: 28, weight: 700, color: RED, a: la });
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
  header(lt, '08', '告警规则', RED, '阈值 + 持续多久');
  const tRule = cue('alert', '这条规则', d), tDip1 = cue('alert', '曲线越线', d), tDip2 = cue('alert', '一直越线', d), tFire = cue('alert', '才触发', d);
  const tFast = cue('alert', '很快回落', d);
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
  statCard(110, 680, 640, '规则状态', st, { color: st === 'inactive' ? MUTE : stC[st], a: ya, h: 112 });
  text('for 用来过滤抖动，尖峰不报警', 110, 840, { size: 26, weight: 600, color: MUTE, a: eOut(P(lt, tDip2 + 2, tDip2 + 3)) });
  // 曲线
  const cx = 820, cy = 170, cw = 1000, chh = 400, x0 = 900, x1 = 1790, yU = 270, yD = 470, px = (m) => lerp(x0, x1, m / 15), py = (v) => lerp(yD, yU, v);
  panel(cx, cy, cw, chh, 'up · 示意：每个点代表一分钟', SC[0], ya);
  ctx.save(); ctx.globalAlpha *= ya;
  ctx.fillStyle = RED + '14'; rr(x0 - 20, yD - 40, x1 - x0 + 40, 86, 10); ctx.fill();
  ctx.setLineDash([8, 8]); ctx.strokeStyle = RED + 'aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0 - 20, yD - 40); ctx.lineTo(x1 + 20, yD - 40); ctx.stroke(); ctx.setLineDash([]);
  text('条件成立区：up == 0', x0 - 6, yD + 36, { size: 20, color: RED, font: MONO, weight: 700 });
  text('1', x0 - 40, yU + 8, { size: 22, color: DIM, font: MONO }); text('0', x0 - 40, yD + 8, { size: 22, color: DIM, font: MONO });
  for (let m = 0; m <= 15; m += 5) text(`${m}`, px(m), cy + chh - 22, { size: 20, color: DIM, font: MONO, align: 'center' });
  text('分钟', cx + 26, cy + chh - 22, { size: 20, color: DIM });
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
  text('规则状态随时间', 820, 618, { size: 22, color: MUTE, weight: 700 });
  rr(x0 - 20, 636, x1 - x0 + 40, 54, 12); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.restore();
  if (run) for (let m = 0; m < mCur; m += 0.05) { const [s] = stateAt(m + 0.025); if (s === 'inactive') continue; ctx.fillStyle = stC[s]; ctx.fillRect(px(m), 640, px(0.05) - px(0) + 0.8, 46); }
  [['inactive', 820], ['pending', 1010], ['firing', 1200]].forEach(([s, x]) => { dot(x + 12, 732, 8, stC[s], { g: 8 }); text(s, x + 30, 740, { size: 22, color: s === 'inactive' ? MUTE : stC[s], font: MONO, weight: 700 }); });
  // 计时器
  const tmA = eOut(P(lt, tRule, tRule + 0.6));
  glass(820, 770, 1000, 130, { a: tmA, r: 22, accent: SC[3] });
  text('持续计时（for: 5m）', 850, 812, { size: 22, weight: 700, color: MUTE, a: tmA });
  const prog = st === 'inactive' ? 0 : clamp(dur / 5);
  ctx.save(); ctx.globalAlpha *= tmA; rr(850, 836, 780, 32, 16); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  if (prog > 0) { ctx.fillStyle = st === 'firing' ? RED : SC[3]; glow(st === 'firing' ? RED : SC[3], 14); rr(850, 836, Math.max(32, 780 * prog), 32, 16); ctx.fill(); } ctx.restore();
  text(`${(prog * 5).toFixed(1)} / 5 min`, 1800, 812, { size: 28, weight: 800, font: MONO, color: st === 'firing' ? RED : st === 'pending' ? SC[3] : DIM, align: 'right', a: tmA });
  // 回落提示
  if (run && mCur >= 4 && mCur < 7) text('回落，计时清零，没有告警', 1335, 810 + 0, { size: 0.1, a: 0 });
  if (run && mCur >= 4 && mCur < 7.2) text('回落：计时清零，不报警', 1230, 812, { size: 26, weight: 700, color: C_OK, a: eOut(P(mCur, 4.1, 4.5)) * (1 - P(mCur, 6.4, 7.2)), align: 'left' });
  // 触发
  if (run && st === 'firing') {
    const fa = eBack(P(lt, tFire - 0.1, tFire + 0.6)), a = clamp(fa * 1.5);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(1600, 335); ctx.scale(clamp(fa, 0.01, 1.1), clamp(fa, 0.01, 1.1));
    glass(-170, -52, 340, 104, { r: 22, accent: RED, fill: 0.12 }); glow(RED, 20);
    text('FIRING · 告警事件', 0, 12, { size: 28, weight: 800, color: RED, align: 'center', font: MONO });
    ctx.restore();
  }
}

// ───────── 场景 9：告警管理器 ─────────
function sceneMgr(lt, d) {
  header(lt, '09', '告警管理器', SC[3], '去重、路由、重试');
  const tF = cue('mgr', '先过滤', d), tK = cue('mgr', '再写入', d), tCh = cue('mgr', '由消费者', d), tRetry = cue('mgr', '送不出', d), tNo = cue('mgr', '还有一条', d);
  bullet(0, '过滤 · 合并 · 去重', eOut(P(lt, tF, tF + 0.6)));
  bullet(1, '写入 Kafka，多渠道发送', eOut(P(lt, tK, tK + 0.6)));
  bullet(2, '失败重试：至少一次送达', eOut(P(lt, tRetry, tRetry + 0.6)));
  bullet(3, '通知端也要去重', eOut(P(lt, tRetry + 2, tRetry + 2.6)), { color: MUTE });
  // 事件进入
  const ma = eOut(P(lt, 0.4, 1));
  box(830, 330, 300, 200, '告警管理器', { color: SC[3], a: ma, size: 28, sub: '过滤 / 合并 / 去重' });
  let recv = 0; for (let k = 0; k < 5; k++) { const t0 = tF - 0.3 + k * 0.45, u = P(lt, t0, t0 + 0.7); if (u > 0) { recv++; if (u < 1) { const y = lerp(190, 360, eIO(u)); ctx.save(); glass(850, y, 260, 52, { r: 14, accent: RED, fill: 0.12 }); text('instance_down i631', 980, y + 34, { size: 20, font: MONO, weight: 700, align: 'center' }); ctx.restore(); } } }
  const tMerge = tF + 3.2;
  text(`收到 ${recv}  →  发出 ${lt > tMerge ? 1 : 0}`, 980, 570, { size: 28, weight: 800, font: MONO, color: SC[3], align: 'center', a: eOut(P(lt, tF + 0.2, tF + 0.8)) });
  // Kafka
  const kA = eOut(P(lt, tK, tK + 0.6));
  box(1250, 345, 170, 130, 'Kafka', { color: C_Q, sub: '告警队列', a: kA, size: 28 });
  if (lt > tMerge - 0.3) arrow(1130, 410, 1250, 410, { color: SC[3], a: eOut(P(lt, tMerge - 0.3, tMerge + 0.2)) });
  const pk = P(lt, tMerge, tMerge + 1.1); if (pk > 0 && pk < 1) packet(1130, 410, 1250, 410, pk, RED, { r: 10 });
  // 渠道
  const chs = [['邮件', SC[0]], ['电话', SC[2]], ['PagerDuty', SC[1]], ['Webhook', SC[3]]], chY = (i) => 200 + i * 130;
  chs.forEach(([n, c], i) => {
    const a = eOut(P(lt, tCh + i * 0.35, tCh + 0.6 + i * 0.35)), isF = i === 3, failing = isF && lt > tCh + 2.2 && lt < tRetry + 2.6;
    box(1600, chY(i), 230, 92, n, { color: c, a, hot: failing, size: 26 });
    if (a > 0.5) arrow(1420, 410, 1600, chY(i) + 46, { color: MUTE + '88', w: 2, head: 10 });
    const t0 = tCh + 1.0 + i * 0.15, u = P(lt, t0, t0 + 0.9);
    if (u > 0 && u < 1 && !isF) packet(1420, 410, 1600, chY(i) + 46, u, RED, { r: 8 });
    if (isF) {
      const tf = tCh + 1.0 + 0.45; const u1 = P(lt, tf, tf + 0.9); if (u1 > 0 && u1 < 1) packet(1420, 410, 1600, chY(i) + 46, u1, RED, { r: 8 });
      if (lt > tf + 0.9 && lt < tRetry + 1.2) text('✕ 失败', 1715, chY(i) + 130, { size: 26, weight: 800, color: RED, align: 'center', a: eOut(P(lt, tf + 0.9, tf + 1.3)) });
      const tr = tRetry + 0.6, u2 = P(lt, tr, tr + 0.9); if (u2 > 0 && u2 < 1) packet(1420, 410, 1600, chY(i) + 46, u2, SC[3], { r: 10 });
      if (lt > tr + 0.9) text('✓ 重试成功', 1715, chY(i) + 130, { size: 26, weight: 800, color: C_OK, align: 'center', a: eOut(P(lt, tr + 0.9, tr + 1.4)) });
    }
  });
  // 两张提示卡
  const a1 = eOut(P(lt, tRetry + 1.8, tRetry + 2.6));
  glass(820, 750, 480, 150, { a: a1, accent: SC[3], r: 22 });
  text('至少一次', 850, 798, { size: 22, color: MUTE, weight: 700, a: a1 });
  text('可能重复送达', 850, 842, { size: 32, weight: 800, a: a1 });
  text('通知端要能去重', 850, 880, { size: 24, color: SC[3], a: a1 });
  const a2 = eOut(P(lt, tNo, tNo + 0.7));
  glass(1330, 750, 500, 150, { a: a2, accent: RED, r: 22 });
  text('指标缺失', 1360, 798, { size: 22, color: MUTE, weight: 700, a: a2 });
  text('没有数据 ≠ 健康', 1360, 842, { size: 36, weight: 800, color: RED, a: a2 });
  text('要有明确的缺失规则', 1360, 880, { size: 24, color: MUTE, a: a2 });
}

// ───────── 场景 10：总结 ─────────
function sceneEnd(lt, d) {
  // 右上装饰：一条会越线的小曲线
  ctx.save(); ctx.globalAlpha *= 0.7 * eOut(P(lt, 0.2, 1));
  const x0 = 1380, x1 = 1810, y0 = 170, hh = 150, prog = P(lt, 0.4, 3);
  ctx.strokeStyle = SC[0]; ctx.lineWidth = 5; glow(SC[0], 14); ctx.lineJoin = 'round'; ctx.beginPath();
  for (let u = 0; u <= prog + 1e-6; u += 0.01) { const x = lerp(x0, x1, u), y = y0 + hh - (0.35 + 0.22 * Math.sin(u * 9) + 0.5 * u * u) * hh * 0.85; u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
  ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([8, 8]); ctx.strokeStyle = RED + 'aa'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, y0 + 40); ctx.lineTo(x1, y0 + 40); ctx.stroke(); ctx.restore();
  text('指标监控与告警系统', 110, 250, { size: 76, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Metrics Monitoring & Alerting', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  const tA = cue2(lt, d, 0.12), cards = [['时间序列', '名称 + 标签 + 时间戳的值\n标签基数要控制', SC[0]], ['推拉 + 队列', '拉靠服务发现，推靠 Agent\nKafka 跨过下游故障', SC[3]], ['阈值 + 持续', 'for 过滤抖动，去重重试\n没有数据不等于健康', RED]];
  void tA;
  cards.forEach(([w, s, c], k) => {
    const t0 = 1.4 + k * 4.2, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 300, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 56, weight: 800 });
    s.split('\n').forEach((l, i) => text(l, x + 36, 628 + i * 40, { size: 26, color: MUTE }));
    ctx.restore();
  });
  text('采集 → 传输 → 存储 → 告警 → 展示', 110, 810, { size: 30, weight: 700, color: INK, a: eOut(P(lt, 13, 13.8)) });
}
const cue2 = () => 0;

export const scenes = { title: undefined, model: sceneModel, card: sceneCard, pull: scenePull, push: scenePush, queue: sceneQueue, tsdb: sceneTsdb, down: sceneDown, alert: sceneAlert, mgr: sceneMgr, end: sceneEnd };
delete scenes.title;
