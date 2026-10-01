// 第 25 章 实时游戏排行榜：场景定义
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 25, title: '实时游戏排行榜', en: 'Real-time Gaming Leaderboard' };

// ───────── 通用组件 ─────────
const withA = (a, f) => { if (a <= 0.001) return; ctx.save(); ctx.globalAlpha *= a; f(); ctx.restore(); };
const tw = (s, size, weight = 700, font = MONO) => { ctx.save(); ctx.font = `${weight} ${size}px ${font}`; const w = ctx.measureText(s).width; ctx.restore(); return w; };

/** 榜单行：lab 位置/名次，name 玩家，score 分数 */
function lbRow(x, y, w, h, { lab = '', name = '', score = '', color = SC[0], a = 1, hl = false, dim = 1, size = 26, labW = 78 } = {}) {
  withA(a * dim, () => {
    if (hl) glow(color, 22);
    rr(x, y, w, h, 14); ctx.fillStyle = hl ? color + '2a' : 'rgba(255,255,255,0.055)'; ctx.fill();
    ctx.lineWidth = hl ? 3 : 1.5; ctx.strokeStyle = hl ? color : 'rgba(255,255,255,0.12)'; ctx.stroke(); ctx.shadowBlur = 0;
    text(String(lab), x + 20, y + h / 2 + 9, { size, weight: 700, font: MONO, color: hl ? color : MUTE });
    text(name, x + labW + 20, y + h / 2 + 9, { size, weight: hl ? 800 : 600, font: MONO, color: hl ? INK : INK });
    text(String(score), x + w - 22, y + h / 2 + 9, { size, weight: 800, font: MONO, align: 'right', color: hl ? color : INK });
  });
}
/** 命令条 */
function cmd(x, y, s, a = 1, { color = SC[0], size = 26, h = 54 } = {}) {
  const w = tw(s, size) + 44;
  withA(a, () => {
    glass(x, y, w, h, { r: 16, accent: color });
    text(s, x + 22, y + h / 2 + size * 0.34, { size, weight: 700, font: MONO, color });
  });
  return w;
}
const pulse = (x, y, p, color, r0 = 20, r1 = 80) => {
  if (p <= 0 || p >= 1) return;
  ctx.save(); ctx.globalAlpha = 1 - p; ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, lerp(r0, r1, eOut(p)), 0, 7); ctx.stroke(); ctx.restore();
};

// ───────── 场景 1：关系数据库的全表排序 ─────────
const SQLR = [['u_7301', 320], ['mary1934', 870], ['u_1188', 510], ['u_9042', 990], ['u_2250', 150], ['u_6617', 730], ['u_3405', 620], ['u_8821', 260], ['u_5109', 940]];
const SQLS = [...SQLR].sort((a, b) => b[1] - a[1]);
function sceneSql(lt) {
  header(lt, '01', '关系数据库', SC[1], '用 ORDER BY 排榜');
  bullet(0, '无索引：全表扫描再排序', eOut(P(lt, 3.5, 4.2)));
  bullet(1, '有索引加 LIMIT：前十尚可', eOut(P(lt, 7.5, 8.2)));
  bullet(2, '中间名次：还得再数一遍', eOut(P(lt, 12.2, 12.9)), { color: RED });
  statCard(110, 680, 640, '全员上榜 · 月活', '2,500 万行', { color: SC[1], a: eOut(P(lt, 2.0, 2.7)) });
  const x = 840, w = 700, y0 = 250, pitch = 62, h = 52;
  const ta = eOut(P(lt, 0.5, 1.4));
  text('user_id', x + 98, 224, { size: 22, color: MUTE, font: MONO, a: ta });
  text('score', x + w - 22, 224, { size: 22, color: MUTE, font: MONO, align: 'right', a: ta });
  text('表 leaderboard', x, 188, { size: 24, weight: 700, color: SC[1], font: MONO, a: ta });
  // 阶段进度
  const s1 = P(lt, 5.6, 8.0), sortP = eIO(P(lt, 8.4, 10.4)), s2 = P(lt, 12.4, 16.2);
  const sortedIdx = (n) => SQLS.findIndex((r) => r[0] === n);
  let cntScan = 0;
  SQLR.forEach(([name, score], i) => {
    const a = eOut(P(lt, 0.7 + i * 0.1, 1.4 + i * 0.1));
    const yy = lerp(y0 + i * pitch, y0 + sortedIdx(name) * pitch, sortP);
    const isM = name === 'mary1934';
    const cur1 = lt > 5.6 && lt < 8.6 ? Math.floor(s1 * 8.99) : -1;
    const scanned1 = lt > 5.6 && lt < 8.4 && i <= cur1;
    const cur2 = lt > 12.4 ? Math.floor(s2 * 8.99) : -1;
    const si = sortedIdx(name); const hit2 = lt > 12.4 && si <= cur2 && score > 870;
    const rowLab = sortP >= 1 ? sortedIdx(name) + 1 : '';
    lbRow(x, yy, w, h, { lab: rowLab, name, score, a, color: isM ? SC[3] : hit2 ? RED : SC[1], hl: isM || scanned1 && i === cur1 || (lt > 12.4 && si === cur2 && s2 < 1), dim: lt > 12.4 && !isM && !hit2 ? 0.55 : 1, labW: 60 });
    if (hit2) cntScan++;
  });
  if (lt > 5.6 && lt < 8.6) { /* 扫描光标 */
    const i = Math.min(8, Math.floor(s1 * 8.99)); arrow(790, y0 + i * pitch + h / 2, 830, y0 + i * pitch + h / 2, { color: SC[0], w: 5 });
  }
  if (lt > 12.4 && lt < 16.9) { const i = Math.min(8, Math.floor(s2 * 8.99)); const yy = y0 + i * pitch; arrow(790, yy + h / 2, 830, yy + h / 2, { color: SC[0], w: 5 }); }
  // 排序提示
  withA(eOut(P(lt, 8.2, 8.8)) * (1 - eOut(P(lt, 11.4, 12.0))), () => text('ORDER BY score DESC', x, 850, { size: 28, weight: 700, font: MONO, color: SC[3] }));
  // 右侧计数卡
  const phase2 = lt > 11.8;
  const ca = eOut(P(lt, 5.4, 6.1));
  glass(1580, 250, 260, 170, { a: ca, accent: phase2 ? RED : SC[0] });
  text(phase2 ? '比她分高的人' : '已扫描行数', 1604, 296, { size: 22, color: MUTE, a: ca });
  const n1 = lt < 8.6 ? Math.min(9, Math.floor(s1 * 8.99) + 1) : 9;
  const val = phase2 ? cntScan : lt > 5.6 ? n1 : 0;
  text(String(val), 1604, 372, { size: 64, weight: 800, font: MONO, color: phase2 ? RED : SC[0], a: ca });
  const fa = eOut(P(lt, 16.0, 16.8));
  text(`名次 = ${cntScan} + 1 = ${cntScan + 1}`, 1580, 470, { size: 30, weight: 800, font: MONO, color: SC[3], a: fa });
  text('示意：9 行代表全表', x, 880, { size: 22, color: DIM, a: ta });
}

// ───────── 场景 2：哈希表 + 跳表 ─────────
const colX = (i) => 850 + i * 60;
const lvY = [700, 600, 500, 400];
const hOf = (i) => (i === 0 ? 4 : Math.min(4, 1 + (Math.log2(i & -i))));
const SKPATH = [[0, 3], [8, 3], [8, 2], [12, 2], [12, 1], [12, 0], [13, 0]];
function sceneSkip(lt) {
  header(lt, '02', 'Redis 有序集合', SC[0], '哈希表 + 跳表');
  bullet(0, '哈希表：成员 → 分数', eOut(P(lt, 1.8, 2.5)));
  bullet(1, '跳表：按分数排好顺序', eOut(P(lt, 4.0, 4.7)));
  bullet(2, '稀疏索引：先大步，再小步', eOut(P(lt, 11.0, 11.7)));
  const la = [1, eOut(P(lt, 9.6, 10.6)), eOut(P(lt, 10.4, 11.4)), eOut(P(lt, 11.2, 12.2))];
  const base = eOut(P(lt, 0.8, 2.0));
  // 链接线
  for (let k = 0; k < 4; k++) {
    const nodes = []; for (let i = 0; i <= 16; i++) if (hOf(i) > k) nodes.push(i);
    withA(la[k] * base, () => {
      ctx.strokeStyle = k === 0 ? 'rgba(255,255,255,0.22)' : SC[0] + '88'; ctx.lineWidth = k === 0 ? 3 : 3;
      ctx.beginPath(); ctx.moveTo(colX(nodes[0]), lvY[k]); ctx.lineTo(colX(nodes[nodes.length - 1]), lvY[k]); ctx.stroke();
      text(`L${k}`, 800, lvY[k] + 8, { size: 20, color: MUTE, font: MONO });
    });
  }
  // 塔
  for (let i = 1; i <= 16; i++) {
    const top = hOf(i) - 1; if (top < 1) continue;
    const a = la[Math.min(top, 3)] * base;
    withA(a, () => { ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.setLineDash([4, 6]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(colX(i), lvY[top]); ctx.lineTo(colX(i), lvY[0]); ctx.stroke(); ctx.setLineDash([]); });
  }
  for (let i = 0; i <= 16; i++) {
    for (let k = 0; k < hOf(i); k++) {
      const a = la[k] * base * (k === 0 ? eOut(P(lt, 1.0 + i * 0.04, 1.6 + i * 0.04)) : 1);
      withA(a, () => {
        rr(colX(i) - 22, lvY[k] - 22, 44, 44, 10); ctx.fillStyle = '#0b0f1c'; ctx.fill();
        ctx.lineWidth = 2.5; ctx.strokeStyle = k === 0 ? 'rgba(255,255,255,0.4)' : SC[0]; ctx.stroke();
        if (k === 0) text(i === 0 ? 'H' : String(i), colX(i), lvY[0] + 8, { size: 22, weight: 700, font: MONO, align: 'center', color: i === 13 && lt > 4 ? SC[3] : INK });
        else if (k >= 1) { ctx.fillStyle = SC[0]; ctx.globalAlpha *= 0.55; rr(colX(i) - 8, lvY[k] - 8, 16, 16, 4); ctx.fill(); }
      });
    }
  }
  // 目标
  const ta = eOut(P(lt, 3.6, 4.4));
  withA(ta, () => { glow(SC[3], 18); ctx.strokeStyle = SC[3]; ctx.lineWidth = 4; rr(colX(13) - 28, lvY[0] - 28, 56, 56, 12); ctx.stroke(); ctx.shadowBlur = 0; text('目标 13', colX(13), lvY[0] + 66, { size: 24, weight: 700, color: SC[3], font: MONO, align: 'center' }); });
  // 普通链表走法
  const s = P(lt, 4.6, 8.8) * 13;
  if (lt > 4.5 && lt < 9.4) {
    const f = Math.floor(s), fr = s - f, a = clamp(1 - P(lt, 8.9, 9.4));
    withA(a, () => {
      ctx.strokeStyle = SC[3]; ctx.lineWidth = 6; glow(SC[3], 12); ctx.beginPath(); ctx.moveTo(colX(0), lvY[0]); ctx.lineTo(lerp(colX(f), colX(Math.min(13, f + 1)), fr), lvY[0]); ctx.stroke(); ctx.shadowBlur = 0;
      dot(lerp(colX(f), colX(Math.min(13, f + 1)), fr), lvY[0], 12, SC[3], { g: 22 });
    });
  }
  // 跳表走法
  const segLen = []; let tot = 0;
  for (let i = 0; i < SKPATH.length - 1; i++) { const [a, b] = [SKPATH[i], SKPATH[i + 1]]; const l = Math.hypot(colX(b[0]) - colX(a[0]), lvY[b[1]] - lvY[a[1]]); segLen.push(l); tot += l; }
  const u = eIO(P(lt, 12.8, 17.2));
  let hops = 0;
  if (lt > 12.7) {
    let rem = u * tot, px = colX(0), py = lvY[3];
    const pts = [[colX(0), lvY[3]]];
    for (let i = 0; i < segLen.length; i++) {
      const [a, b] = [SKPATH[i], SKPATH[i + 1]]; const frac = clamp(rem / segLen[i]);
      const ex = lerp(colX(a[0]), colX(b[0]), frac), ey = lerp(lvY[a[1]], lvY[b[1]], frac);
      pts.push([ex, ey]); px = ex; py = ey;
      if (frac >= 0.999 && b[0] !== a[0]) hops++;
      rem -= segLen[i]; if (rem <= 0) break;
    }
    ctx.save(); ctx.strokeStyle = SC[4]; ctx.lineWidth = 6; ctx.lineJoin = 'round'; glow(SC[4], 12); ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
    dot(px, py, 12, SC[4], { g: 24 });
  }
  const aA = 1 - eOut(P(lt, 18.2, 18.8));
  statCard(110, 580, 640, '普通链表（示意）', `${Math.min(13, Math.floor(s))} 步`, { color: SC[3], a: eOut(P(lt, 4.4, 5.0)) * aA });
  statCard(110, 710, 640, '跳表（示意）', `${hops} 跳`, { color: SC[4], a: eOut(P(lt, 12.6, 13.2)) * aA });
  const bA = eOut(P(lt, 18.8, 19.6));
  statCard(110, 580, 640, '普通链表 · 64 个节点', '62 步', { color: RED, a: bA });
  statCard(110, 710, 640, '跳表 · 64 个节点', '约 11 步', { color: SC[4], a: bA });
  text('示意：16 个节点；书中以 64 节点为例', 840, 880, { size: 22, color: DIM, a: base });
}

// ───────── 场景 3：四个命令 ─────────
const CMDS = [
  ['ZADD', '插入成员，或设置分数', '每项 O(log N)', SC[0], 2.2],
  ['ZINCRBY', '加分；不存在则从 0 开始', 'O(log N)', SC[3], 5.8],
  ['ZREVRANGE', '按名次区间读取（从高到低）', 'O(log N + M)', SC[2], 9.6],
  ['ZREVRANK', '查某成员的位置（从 0 起）', 'O(log N)', SC[1], 14.0],
];
function sceneCmds(lt) {
  header(lt, '03', '四个命令', SC[2], '够用一整张榜');
  bullet(0, '更新、定位：对数级', eOut(P(lt, 16.4, 17.1)));
  bullet(1, '区间读取：对数 + 读出个数', eOut(P(lt, 18.2, 18.9)));
  text('N = 成员数 · M = 读出条数', 110, 580, { size: 24, color: MUTE, font: MONO, a: eOut(P(lt, 18.2, 18.9)) });
  CMDS.forEach(([c, d, cx, col, t0], i) => {
    const y = 190 + i * 180, a = eOut(P(lt, t0, t0 + 0.7));
    withA(a, () => {
      ctx.translate(40 * (1 - a), 0);
      glass(830, y, 1010, 150, { accent: col });
      ctx.fillStyle = col; glow(col, 16); rr(858, y + 28, 6, 94, 3); ctx.fill(); ctx.shadowBlur = 0;
      text(c, 890, y + 74, { size: 44, weight: 800, font: MONO, color: col });
      text(d, 890, y + 120, { size: 26, color: MUTE });
    });
    const pa = eOut(P(lt, i === 2 ? 17.8 : 16.2 + i * 0.25, (i === 2 ? 17.8 : 16.2 + i * 0.25) + 0.6));
    withA(pa, () => { glass(1470, y + 44, 330, 62, { r: 18, accent: i === 2 ? SC[3] : SC[4], fill: 0.1 }); text(cx, 1635, y + 87, { size: 30, weight: 800, font: MONO, align: 'center', color: i === 2 ? SC[3] : SC[4] }); });
  });
}

// ───────── 场景 4：分数变化，条目上下移动（核心） ─────────
const ORDERS = [
  ['alice', 'bob', 'carol', 'dave', 'eric', 'mary1934', 'frank'],
  ['alice', 'bob', 'carol', 'dave', 'mary1934', 'eric', 'frank'],
  ['alice', 'bob', 'carol', 'mary1934', 'dave', 'eric', 'frank'],
  ['alice', 'bob', 'mary1934', 'carol', 'dave', 'eric', 'frank'],
];
const BASE = { alice: 105, bob: 103, carol: 102, dave: 101, eric: 100, mary1934: 99, frank: 97 };
const WINS = [2.6, 7.0, 11.0];
function sceneMove(lt) {
  header(lt, '04', '名次跟着分数动', SC[3], 'ZINCRBY 加一分');
  bullet(0, 'ZINCRBY：加分，无则从 0 起', eOut(P(lt, 1.6, 2.3)));
  bullet(1, '条目沿索引找到新位置', eOut(P(lt, 5.4, 6.1)));
  bullet(2, '其余人自动顺延', eOut(P(lt, 8.4, 9.1)));
  bullet(3, '不用重新排序整张榜', eOut(P(lt, 13.0, 13.7)), { color: SC[4] });
  const y0 = 260, pitch = 74, h = 62, x = 900, w = 900;
  const posOf = (name) => {
    let pos = ORDERS[0].indexOf(name);
    for (let s = 0; s < 3; s++) if (lt >= WINS[s] + 0.9) pos = lerp(ORDERS[s].indexOf(name), ORDERS[s + 1].indexOf(name), eIO(P(lt, WINS[s] + 0.9, WINS[s] + 1.9)));
    return pos;
  };
  const wins = WINS.filter((t) => lt >= t + 0.5).length;
  const ca = eOut(P(lt, 0.8, 1.5));
  text('leaderboard_feb_2021', 840, 182, { size: 24, weight: 700, color: SC[0], font: MONO, a: ca });
  // 命令条
  const cs = eOut(P(lt, 1.2, 1.9));
  withA(cs, () => { const cw = cmd(840, 196, "ZINCRBY leaderboard_feb_2021 1 'mary1934'", 1, { color: SC[3], size: 26, h: 52 }); WINS.forEach((t) => pulse(840 + cw / 2, 222, P(lt, t, t + 0.8), SC[3], 40, 130)); });
  for (let i = 0; i < 7; i++) text(String(i + 1), 862, y0 + 8 + i * pitch + h / 2 + 9, { size: 26, weight: 700, font: MONO, color: DIM, a: ca, align: 'center' });
  const names = Object.keys(BASE).filter((n) => n !== 'mary1934'); names.push('mary1934');
  names.forEach((n, k) => {
    const isM = n === 'mary1934';
    const yy = y0 + 8 + posOf(n) * pitch;
    const sc = BASE[n] + (isM ? wins : 0);
    const a = eOut(P(lt, 0.8 + k * 0.1, 1.5 + k * 0.1));
    const moving = isM ? 1 : 0;
    lbRow(x, yy, w, h, { lab: '', name: n, score: sc, color: SC[3], a, hl: isM, dim: 1, labW: 0 });
    void moving;
  });
  WINS.forEach((t) => {
    const p = P(lt, t + 0.2, t + 1.1); if (p <= 0 || p >= 1) return;
    const yy = y0 + 8 + posOf('mary1934') * pitch;
    text('+1', x + w - 130, yy + h / 2 + 9 - 36 * eOut(p), { size: 30, weight: 800, font: MONO, color: SC[4], a: Math.sin(p * Math.PI) });
  });
  const posM = posOf('mary1934');
  statCard(110, 700, 640, 'mary1934 当前名次', `第 ${Math.round(posM) + 1} 名`, { color: SC[3], a: eOut(P(lt, 2.0, 2.7)) });
  text('示意数据 · 同分时按成员名排序', 840, 850, { size: 22, color: DIM, a: ca });
}

// ───────── 场景 5：取前十 ─────────
const TOP = [['alice', 12543], ['bob', 11500], ['carol', 10870], ['dave', 10420], ['erin', 9980], ['frank', 9650], ['grace', 9310], ['heidi', 8905], ['ivan', 8640], ['judy', 8420], ['kate', 8105], ['leo', 7890]];
function sceneTop10(lt) {
  header(lt, '05', '取前十名', SC[2], 'ZREVRANGE 0 9');
  bullet(0, '位置 0 到 9 = 前十名', eOut(P(lt, 3.0, 3.7)));
  bullet(1, '本来就有序：直接读出', eOut(P(lt, 7.0, 7.7)));
  statCard(110, 590, 640, '复杂度', 'O(log N + 10)', { color: SC[4], a: eOut(P(lt, 8.6, 9.3)) });
  cmd(840, 160, 'ZREVRANGE leaderboard_feb_2021 0 9 WITHSCORES', eOut(P(lt, 0.8, 1.5)), { color: SC[2], size: 24, h: 50 });
  const x = 840, w = 880, y0 = 240, pitch = 54, h = 44;
  TOP.forEach(([n, s], i) => {
    const a = eOut(P(lt, 1.2 + i * 0.08, 1.9 + i * 0.08));
    const hl = lt > 3.0 + i * 0.35;
    const inTop = i < 10;
    lbRow(x, y0 + i * pitch, w, h, { lab: i, name: n, score: s, color: SC[2], a, hl: inTop && hl, dim: inTop ? 1 : 0.35, size: 24, labW: 40 });
  });
  const ba = eOut(P(lt, 6.4, 7.2));
  withA(ba, () => {
    ctx.strokeStyle = SC[2]; ctx.lineWidth = 4; glow(SC[2], 14); ctx.beginPath(); ctx.moveTo(1738, y0); ctx.lineTo(1752, y0); ctx.lineTo(1752, y0 + 9 * pitch + h); ctx.lineTo(1738, y0 + 9 * pitch + h); ctx.stroke(); ctx.shadowBlur = 0;
    text('前十', 1768, y0 + 4.5 * pitch + 28, { size: 30, weight: 800, color: SC[2] });
  });
}

// ───────── 场景 6：附近玩家 ─────────
const NEAR = [['nova', 1040], ['orion', 1030], ['pax', 1022], ['quinn', 1015], ['rhea', 1007], ['mary1934', 1000], ['sage', 993], ['tara', 985], ['ula', 978], ['vera', 970], ['wren', 962]];
function sceneNear(lt) {
  header(lt, '06', '查附近的人', SC[1], '位置 → 前后各四个');
  bullet(0, '先问位置：ZREVRANK', eOut(P(lt, 1.6, 2.3)));
  bullet(1, '再取前后各四个', eOut(P(lt, 10.0, 10.7)));
  bullet(2, '两端都包含；榜首截到 0', eOut(P(lt, 16.6, 17.3)));
  statCard(110, 640, 640, '显示名次 = 位置 + 1', '361 + 1 = 362', { color: SC[3], a: eOut(P(lt, 6.4, 7.1)) });
  text('ZREVRANK 返回位置，不是并列名次', 110, 810, { size: 22, color: MUTE, a: eOut(P(lt, 18.0, 18.8)) });
  cmd(840, 156, 'ZREVRANK leaderboard_feb_2021 mary1934', eOut(P(lt, 1.0, 1.7)), { color: SC[1], size: 24, h: 50 });
  const ans = eBack(P(lt, 4.6, 5.3));
  if (ans > 0.02) { withA(clamp(ans), () => { ctx.translate(0, 0); text('→ 361', 1560, 192, { size: 40, weight: 800, font: MONO, color: SC[3] }); }); }
  cmd(840, 222, 'ZREVRANGE leaderboard_feb_2021 357 365', eOut(P(lt, 10.0, 10.7)), { color: SC[2], size: 24, h: 50 });
  const x = 840, w = 880, y0 = 296, pitch = 50, h = 42;
  const rad = Math.floor(P(lt, 11.4, 14.4) * 4.99);
  NEAR.forEach(([n, s], i) => {
    const pos = 356 + i, a = eOut(P(lt, 1.6 + i * 0.07, 2.3 + i * 0.07));
    const isM = n === 'mary1934';
    const d = Math.abs(i - 5);
    const inWin = d <= 4;
    const found = lt > 5.2;
    const hl = isM && found || (lt > 11.4 && inWin && d <= rad);
    const dimV = lt > 11.4 ? (inWin && d <= rad ? 1 : 0.4) : (found && !isM ? 0.6 : 1);
    lbRow(x, y0 + i * pitch, w, h, { lab: pos, name: n, score: s, color: isM ? SC[3] : SC[2], a, hl, dim: dimV, size: 24, labW: 60 });
  });
  const ma = eOut(P(lt, 5.4, 6.1));
  if (ma > 0) arrow(1770, y0 + 5 * pitch + h / 2, 1735, y0 + 5 * pitch + h / 2, { color: SC[3], w: 5, a: ma });
  const la = eOut(P(lt, 12.0, 12.8));
  text('361 − 4 = 357', 1700, y0 + 1 * pitch + 29, { size: 24, weight: 700, font: MONO, color: SC[2], align: 'left', a: la * 0 });
  withA(la, () => {
    text('357', 1732, y0 + 1 * pitch + 30, { size: 24, weight: 800, font: MONO, color: SC[2] });
    text('365', 1732, y0 + 9 * pitch + 30, { size: 24, weight: 800, font: MONO, color: SC[2] });
    text('361−4', 1776, y0 + 1 * pitch + 30, { size: 20, color: MUTE, font: MONO });
    text('361+4', 1776, y0 + 9 * pitch + 30, { size: 20, color: MUTE, font: MONO });
  });
}

// ───────── 场景 7：按月 key ─────────
function sceneKey(lt) {
  header(lt, '07', '按月赛季', SC[0], '一个月，一张榜，一个 key');
  bullet(0, '每月一个 sorted set', eOut(P(lt, 1.6, 2.3)));
  bullet(1, '加分、查榜都用当月 key', eOut(P(lt, 6.0, 6.7)));
  bullet(2, '月底：旧榜归档', eOut(P(lt, 11.8, 12.5)));
  bullet(3, '新月：空榜起步', eOut(P(lt, 15.0, 15.7)));
  bullet(4, '接口要带上赛季', eOut(P(lt, 16.6, 17.3)), { color: SC[3] });
  // 来源
  const sa = eOut(P(lt, 0.6, 1.3));
  box(840, 170, 1000, 70, '排行榜服务', { color: SC[1], a: sa, size: 26 });
  // Feb
  const fa = eOut(P(lt, 1.0, 1.8)), arch = eIO(P(lt, 12.2, 13.2));
  const fcol = SC[0];
  withA(fa * lerp(1, 0.45, arch), () => {
    glass(840, 330, 440, 300, { accent: fcol });
    text('二月', 870, 384, { size: 34, weight: 800 });
    text('leaderboard_feb_2021', 870, 424, { size: 22, weight: 700, font: MONO, color: fcol });
    const bars = [330, 270, 235, 190, 150];
    bars.forEach((b, i) => {
      let add = 0; for (let k = 0; k < 4; k++) if (lt > 3.4 + k * 1.5 + 0.7 && i === [3, 2, 1, 4][k] % 5) add += 14;
      rr(870, 448 + i * 34, 28, 22, 6); ctx.fillStyle = SC[2] + '99'; ctx.fill();
      rr(906, 450 + i * 34, b + add, 18, 8); ctx.fillStyle = fcol; ctx.fill();
    });
  });
  withA(arch, () => text('已归档', 1262, 618, { size: 22, weight: 700, color: MUTE, align: 'right' }));
  // 加分包
  for (let k = 0; k < 4; k++) {
    const t0 = 3.4 + k * 1.5;
    const p = P(lt, t0, t0 + 0.7); if (p <= 0 || p >= 1) continue;
    packet(1060, 240, 1060, 330, eIO(p), SC[3], { r: 9 });
    if (k === 0) text('ZINCRBY', 1090, 296, { size: 20, font: MONO, color: SC[3], weight: 700, a: 1 - p });
  }
  arrow(1060, 240, 1060, 328, { color: SC[0] + '88', w: 3, a: fa * (1 - arch) });
  // 归档库
  const da = eOut(P(lt, 10.4, 11.2));
  dbIcon(950, 700, 220, 170, '历史存储', { color: SC[1], a: da, fill: arch * 0.8 });
  const ap = eIO(P(lt, 11.8, 12.8));
  if (ap > 0) arrow(1060, 632, 1060, 700, { color: SC[1], w: 5, p: ap });
  if (lt > 12.4 && lt < 13.6) packet(1060, 632, 1060, 700, P(lt, 12.4, 13.6), SC[1], { r: 10 });
  // Mar
  const ma = eBack(P(lt, 14.4, 15.2));
  if (ma > 0.02) {
    withA(clamp(ma), () => {
      ctx.translate(1620, 480); ctx.scale(lerp(0.9, 1, clamp(ma)), lerp(0.9, 1, clamp(ma))); ctx.translate(-1620, -480);
      glass(1400, 330, 440, 300, { accent: SC[4] });
      text('三月', 1430, 384, { size: 34, weight: 800 });
      text('leaderboard_mar_2021', 1430, 424, { size: 22, weight: 700, font: MONO, color: SC[4] });
      text('空榜 · 新赛季', 1620, 540, { size: 32, weight: 700, color: SC[4], align: 'center' });
    });
    arrow(1620, 240, 1620, 328, { color: SC[4], w: 4, p: eOut(P(lt, 15.2, 15.9)) });
  }
}

// ───────── 场景 8：规模放大 ─────────
function sceneScale(lt) {
  header(lt, '08', '增长一百倍', RED, '单个 Redis 放不下了');
  bullet(0, '650 MB × 100 = 65 GB', eOut(P(lt, 11.6, 12.3)));
  bullet(1, '2,500 × 100 = 25 万 QPS', eOut(P(lt, 13.6, 14.3)));
  bullet(2, '必须分片', eOut(P(lt, 16.0, 16.7)), { color: RED });
  const pa = eOut(P(lt, 1.0, 1.8)), pb = eOut(P(lt, 10.8, 11.8));
  const cnt = (v, a, b) => lerp(0, v, eOut(P(lt, a, b)));
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  // 左面板
  withA(pa, () => {
    glass(830, 230, 420, 520, { accent: SC[0] });
    text('日活 DAU', 860, 284, { size: 24, color: MUTE });
    text(`${fmt(cnt(500, 1.6, 2.6))} 万`, 860, 358, { size: 64, weight: 800, font: MONO });
    text('存储（原书估算）', 860, 428, { size: 22, color: MUTE });
    text(`≈ ${fmt(cnt(650, 3.0, 4.6))} MB`, 860, 482, { size: 44, weight: 800, font: MONO, color: SC[0] });
    text('峰值每秒更新', 860, 548, { size: 22, color: MUTE });
    text(`${fmt(cnt(2500, 5.4, 7.0))} QPS`, 860, 602, { size: 44, weight: 800, font: MONO, color: SC[0] });
    box(900, 650, 280, 76, '单个 Redis', { color: SC[0], size: 26 });
  });
  // 箭头
  const aa = eOut(P(lt, 9.6, 10.6));
  arrow(1262, 490, 1408, 490, { color: RED, w: 6, p: aa });
  withA(aa, () => text('×100', 1335, 450, { size: 40, weight: 800, font: MONO, color: RED, align: 'center' }));
  // 右面板
  withA(pb, () => {
    glass(1420, 230, 420, 520, { accent: RED });
    text('日活 DAU', 1450, 284, { size: 24, color: MUTE });
    text(`${fmt(cnt(5, 11.4, 12.2))} 亿`, 1450, 358, { size: 64, weight: 800, font: MONO });
    text('存储', 1450, 428, { size: 22, color: MUTE });
    text(`≈ ${fmt(cnt(65, 12.0, 13.6))} GB`, 1450, 482, { size: 44, weight: 800, font: MONO, color: RED });
    text('峰值每秒更新', 1450, 548, { size: 22, color: MUTE });
    text(`${fmt(cnt(250000, 14.0, 15.6))} QPS`, 1450, 602, { size: 44, weight: 800, font: MONO, color: RED });
  });
  const sh = P(lt, 16.0, 17.0);
  for (let i = 0; i < 4; i++) {
    const a = eOut(P(lt, 16.0 + i * 0.15, 16.7 + i * 0.15));
    if (a > 0.02) box(1446 + i * 98, 650, 86, 76, `S${i + 1}`, { color: SC[i], size: 22, a, s: 1 });
  }
  void sh;
  const ra = eOut(P(lt, 17.8, 18.6));
  text('原书写「增长 10 倍」，按 500 万 → 5 亿，实为 100 倍', 830, 830, { size: 26, weight: 700, color: RED, a: ra });
  text('存储与 QPS 均为原书的简化估算，未含 Redis 真实内存开销', 830, 880, { size: 22, color: DIM, a: ra });
}

// ───────── 场景 9：按分数范围分片 ─────────
const RSH = [
  { x: 840, rng: '[900, 1000]', col: SC[0], sc: [986, 962, 951, 934, 917], tot: 120 },
  { x: 1190, rng: '[800, 900)', col: SC[1], sc: [890, 876, 861, 843, 822], tot: 200 },
  { x: 1540, rng: '[700, 800)', col: SC[2], sc: [788, 774, 761, 742, 725], tot: 340 },
];
function chipRow(x, y, w, h, label, color, { a = 1, hl = false, dim = 1 } = {}) {
  lbRow(x, y, w, h, { lab: '', name: '', score: label, color, a, hl, dim, size: 26, labW: 0 });
}
function sceneRange(lt) {
  header(lt, '09', '按分数范围分片', SC[0], '固定分区');
  bullet(0, '前十：先查最高分片', eOut(P(lt, 8.4, 9.1)));
  bullet(1, '名次 = 片内位置 + 更高片人数', eOut(P(lt, 13.0, 13.7)));
  bullet(2, '代价：跨段要迁移、改路由', eOut(P(lt, 18.4, 19.1)), { color: RED });
  const mig = eIO(P(lt, 18.6, 20.2));
  RSH.forEach((s, k) => {
    const a = eOut(P(lt, 0.8 + k * 0.25, 1.6 + k * 0.25));
    const topHl = lt > 8.4 && lt < 12.4 && k === 0;
    const cntHl = lt > 12.4 && lt < 18.0 && k < 2;
    withA(a, () => {
      glass(s.x, 230, 290, 520, { accent: s.col });
      text(`片 ${k + 1}`, s.x + 24, 280, { size: 28, weight: 800, color: s.col });
      text(s.rng, s.x + 266, 280, { size: 24, weight: 700, font: MONO, align: 'right', color: MUTE });
    });
    s.sc.forEach((v, i) => {
      const isM = k === 2 && i === 2;
      const ca = eOut(P(lt, 1.4 + k * 0.25 + i * 0.1, 2.0 + k * 0.25 + i * 0.1));
      if (isM && mig > 0) return;
      lbRow(s.x + 24, 306 + i * 56, 242, 46, { lab: '', name: '', score: v, color: isM ? SC[3] : topHl || cntHl ? SC[4] : s.col, a: ca, hl: isM || topHl || cntHl, dim: lt > 8 && !topHl && !cntHl && !isM ? 0.55 : 1, size: 26, labW: 0 });
      if (isM) text('mary', s.x + 38, 306 + i * 56 + 32, { size: 20, color: SC[3], font: MONO, weight: 700, a: ca });
    });
    text('⋮', s.x + 145, 612, { size: 36, color: MUTE, align: 'center', a });
    text(`共 ${s.tot} 人（示意）`, s.x + 145, 700, { size: 22, color: MUTE, align: 'center', a });
  });
  // 第二片收到 mary
  if (mig > 0) {
    const fx = RSH[2].x + 24, fy = 306 + 2 * 56, tx = RSH[1].x + 24, ty = 306 + 5 * 56 + 4;
    const x = lerp(fx, tx, mig), y = lerp(fy, ty, mig) - Math.sin(mig * Math.PI) * 50;
    lbRow(x, y, 242, 46, { lab: '', name: '', score: mig > 0.5 ? 802 : 761, color: SC[3], hl: true, size: 26, labW: 0 });
    text('mary', x + 14, y + 32, { size: 20, color: SC[3], font: MONO, weight: 700 });
    pulse(x + 121, y + 23, P(lt, 18.6, 19.4), RED, 20, 90);
  }
  // 查前十箭头
  const qa = eOut(P(lt, 8.4, 9.0)) * (1 - eOut(P(lt, 12.0, 12.6)));
  withA(qa, () => { text('GET 前十', 985, 200, { size: 26, weight: 800, color: SC[4], align: 'center' }); arrow(985, 206, 985, 228, { color: SC[4], w: 4 }); });
  // 公式
  const fa = eOut(P(lt, 13.2, 14.0)) * (1 - eOut(P(lt, 17.6, 18.2)));
  const n1 = lt > 14.4 ? 1 : 0;
  withA(fa, () => {
    text('mary 的全局位置（示意）', 840, 800, { size: 22, color: MUTE });
    text('2 + 120 + 200 = 322', 840, 850, { size: 42, weight: 800, font: MONO, color: SC[3] });
    text('片内位置', 840, 884, { size: 20, color: MUTE }); text('更高片 人数', 1010, 884, { size: 20, color: MUTE });
  });
  void n1;
  const ra = eOut(P(lt, 18.6, 19.4));
  text('mary 涨到 802 分：片 3 → 片 2，路由表也要改', 840, 830, { size: 26, weight: 700, color: RED, a: ra });
}

// ───────── 场景 10：哈希分片与 Top K 合并 ─────────
const HS = [
  { x: 830, name: 'A', col: SC[0], v: [100, 90, 80, 60] },
  { x: 1026, name: 'B', col: SC[1], v: [95, 85, 75, 55] },
  { x: 1222, name: 'C', col: SC[2], v: [93, 92, 70, 50] },
];
const MERGED = [[100, 0], [95, 1], [93, 2], [92, 2], [90, 0], [85, 1], [80, 0], [75, 1], [70, 2]];
function sceneHash(lt) {
  header(lt, '10', '哈希分片', SC[2], '各片取前 K，再合并');
  bullet(0, '每片各取前 K 名', eOut(P(lt, 3.2, 3.9)));
  bullet(1, '合并后再取前 K 名', eOut(P(lt, 8.0, 8.7)));
  bullet(2, '代价：片越多，扇出越大', eOut(P(lt, 17.2, 17.9)), { color: RED });
  bullet(3, '个人名次要问遍各片', eOut(P(lt, 19.0, 19.7)), { color: RED });
  text('hash(user_id) → 分片', 830, 200, { size: 24, weight: 700, color: MUTE, font: MONO, a: eOut(P(lt, 0.6, 1.3)) });
  const cutA = eOut(P(lt, 4.6, 5.4));
  const fly = (i) => eIO(P(lt, 6.4 + i * 0.25, 8.2 + i * 0.25));
  const idxMerged = (s, r) => MERGED.findIndex((m, k) => m[1] === s && m[0] === HS[s].v[r]);
  HS.forEach((s, k) => {
    const a = eOut(P(lt, 0.8 + k * 0.2, 1.6 + k * 0.2));
    withA(a, () => { glass(s.x, 250, 176, 440, { accent: s.col }); text(`片 ${s.name}`, s.x + 88, 292, { size: 28, weight: 800, color: s.col, align: 'center' }); });
    s.v.forEach((v, r) => {
      const ca = eOut(P(lt, 1.6 + k * 0.2 + r * 0.12, 2.2 + k * 0.2 + r * 0.12));
      const home = [s.x + 16, 316 + r * 80];
      const mi = idxMerged(k, r);
      if (r < 3) {
        const f = fly(k * 3 + r > 8 ? 8 : mi);
        const tgt = [1500, 276 + mi * 58];
        const fp = lt > 6.4 ? f : 0;
        const x = lerp(home[0], tgt[0], fp), y = lerp(home[1], tgt[1], fp);
        if (fp > 0) lbRow(home[0], home[1], 144, 60, { lab: '', name: '', score: v, color: s.col, a: ca, dim: 0.22, size: 26, labW: 0 });
        const top3 = MERGED.findIndex((m) => m[0] === v) < 3;
        const final = lt > 9.4 && top3;
        lbRow(x, y, fp > 0 ? lerp(144, 320, fp) : 144, fp > 0 ? lerp(60, 46, fp) : 60, { lab: '', name: '', score: v, color: final ? SC[4] : s.col, a: ca, hl: (lt > 4.6 && lt < 6.4) || final, dim: lt > 9.4 && !top3 ? 0.4 : 1, size: 26, labW: 0 });
      } else {
        const red = lt > 11.6 && lt < 17.0;
        lbRow(home[0], home[1], 144, 60, { lab: '', name: '', score: v, color: red ? RED : s.col, a: ca * (lt > 4.6 ? 1 : 1), hl: false, dim: lt > 4.6 ? 0.4 : 1, size: 26, labW: 0 });
        if (red) text('✕', home[0] + 160, home[1] + 40, { size: 28, color: RED, weight: 800, a: eOut(P(lt, 11.8 + k * 0.2, 12.4 + k * 0.2)) * 0 });
      }
    });
  });
  // 截断线
  withA(cutA, () => { ctx.strokeStyle = SC[3]; ctx.setLineDash([8, 7]); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(822, 543); ctx.lineTo(1404, 543); ctx.stroke(); ctx.setLineDash([]); text('K = 3', 1404, 549, { size: 20, color: SC[3], weight: 700 }); });
  const na = eOut(P(lt, 11.8, 12.6)) * (1 - eOut(P(lt, 16.6, 17.2)));
  withA(na, () => { text('本片第 4 名：已有 3 人压在上面', 830, 740, { size: 26, weight: 700, color: RED }); text('→ 进不了全局前 3', 830, 780, { size: 26, weight: 700, color: RED }); });
  // 合并面板
  const ma = eOut(P(lt, 5.4, 6.2));
  withA(ma, () => { glass(1480, 232, 360, 600, { accent: SC[4] }); text('合并 · 全局排序', 1504, 264, { size: 22, weight: 700, color: MUTE }); });
  const ga = eOut(P(lt, 9.4, 10.2));
  withA(ga, () => text('全局前 3', 1660, 822, { size: 26, weight: 800, color: SC[4], align: 'center' }));
  text('示意：K = 3（书中 K = 10）', 830, 880, { size: 22, color: DIM, a: eOut(P(lt, 1.0, 1.8)) });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  const ra = eOut(P(lt, 0.6, 1.4));
  [['alice', 12543, 0], ['mary1934', 11980, 1], ['bob', 11500, 2]].forEach(([n, s, i]) => lbRow(1380, 160 + i * 66, 400, 54, { lab: i + 1, name: n, score: s, color: i === 1 ? SC[3] : SC[0], a: ra * 0.6, hl: i === 1, size: 22, labW: 40 }));
  text('实时游戏排行榜', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Real-time Gaming Leaderboard', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['有序集合', '名次随分数自动移动', SC[0]], ['月度 key', '一个赛季一张榜', SC[3]], ['分片', '前十合并 vs 个人名次', SC[2]]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.8, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 66, weight: 800 });
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  text('同分如何排名、跨片如何统计，要先和产品对齐规则', 110, 750, { size: 24, color: MUTE, a: eOut(P(lt, 7.0, 7.8)) });
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  const names = ['alice', 'bob', 'carol', 'dave', 'mary1934', 'frank'];
  const sc = [105, 103, 102, 101, 99, 97];
  const rise = eIO(P(lt, 3.0, 5.0));
  names.forEach((n, i) => {
    let pos = i; const isM = n === 'mary1934';
    if (isM) pos = lerp(4, 2, rise); else if (i === 2 || i === 3) pos = i + eIO(P(lt, 3.0, 5.0)) * (i === 2 ? 1 : 1) ;
    const ra = eOut(P(lt, 0.6 + i * 0.15, 1.4 + i * 0.15));
    lbRow(1260, 230 + pos * 80, 540, 64, { lab: '', name: n, score: sc[i] + (isM && rise > 0.5 ? 3 : 0), color: SC[3], a: ra, hl: isM, labW: 0 });
  });
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 0.4, 1.4)); ctx.translate(0, (1 - eOut(P(lt, 0.4, 1.4))) * 30);
  ctx.font = `900 118px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('实时游戏排行榜', 104, 520); ctx.restore();
  text('Real-time Gaming Leaderboard', 112, 590, { size: 38, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 25 章', 112, 680, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

export const scenes = { title: sceneTitle, sql: sceneSql, skip: sceneSkip, cmds: sceneCmds, move: sceneMove, top10: sceneTop10, near: sceneNear, key: sceneKey, scale: sceneScale, range: sceneRange, hash: sceneHash, end: sceneEnd };
