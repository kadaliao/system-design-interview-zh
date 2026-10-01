// 第 7 章 唯一 ID 生成器：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, statCard, bullet, hbar } from '../lib/core.js';

export const meta = { no: 7, title: '唯一 ID 生成器', en: 'Unique ID Generator' };

// ───────── 公共小工具 ─────────
const GREEN = SC[4];
const comma = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const A = (lt, t0, d = 0.6) => eOut(P(lt, t0, t0 + d));       // 从 t0 起淡入
const hex = (seed, n) => { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'[Math.floor(rnd(seed * 31 + i * 7 + 3) * 16)]; return s; };

/** 手绘符号：ok=✓ no=✗ mid=△，(x,y) 为中心 */
function mark(kind, x, y, size = 40, a = 1) {
  if (a <= 0) return;
  const s = size / 2, c = kind === 'ok' ? GREEN : kind === 'no' ? RED : SC[3];
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = c; ctx.lineWidth = Math.max(4, size / 8); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; glow(c, 12);
  ctx.beginPath();
  if (kind === 'ok') { ctx.moveTo(x - s * 0.8, y); ctx.lineTo(x - s * 0.2, y + s * 0.6); ctx.lineTo(x + s * 0.85, y - s * 0.65); }
  else if (kind === 'no') { ctx.moveTo(x - s * 0.7, y - s * 0.7); ctx.lineTo(x + s * 0.7, y + s * 0.7); ctx.moveTo(x + s * 0.7, y - s * 0.7); ctx.lineTo(x - s * 0.7, y + s * 0.7); }
  else { ctx.moveTo(x, y - s * 0.8); ctx.lineTo(x + s * 0.85, y + s * 0.65); ctx.lineTo(x - s * 0.85, y + s * 0.65); ctx.closePath(); }
  ctx.stroke(); ctx.restore();
}

/** 以 (cx,cy) 为中心的数字小方块 */
function chip(cx, cy, label, color, { a = 1, s = 1, ring = null, w = 70, h = 38, size = 22 } = {}) {
  if (a <= 0 || s <= 0) return;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s);
  glow(ring || color, ring ? 22 : 8); rr(-w / 2, -h / 2, w, h, 10); ctx.fillStyle = color + '30'; ctx.fill();
  ctx.lineWidth = ring ? 3 : 1.8; ctx.strokeStyle = ring || color; ctx.stroke(); ctx.shadowBlur = 0;
  text(label, 0, size * 0.36, { size, weight: 700, align: 'center', font: MONO });
  ctx.restore();
}

// ───────── 64 位字段条（雪花算法专用） ─────────
const FK = ['sign', 'time', 'dc', 'mach', 'seq'];
const FC = { sign: '#7c869f', time: SC[0], dc: SC[1], mach: SC[2], seq: SC[3] };
const FN = { sign: '符号位', time: '时间戳', dc: '数据中心', mach: '机器', seq: '序列号' };
const SNOW = [1, 41, 5, 5, 12];
const bnd = (counts) => { let c = 0; return counts.map((n) => Math.round((c += n))); };
function fieldAt(i, counts) { const b = bnd(counts); for (let k = 0; k < 5; k++) if (i < b[k]) return FK[k]; return 'seq'; }
function segX(counts, k, x, w) { const b = bnd(counts); return [x + ((k ? b[k - 1] : 0) / 64) * w, x + (b[k] / 64) * w]; }
/** 64 个小格；lit = 已点亮的格数（可为小数）；hl = 只高亮某字段 */
function cells(x, y, w, h, { counts = SNOW, lit = 64, a = 1, hl = null, ghost = 0.12, only = null } = {}) {
  const cw = w / 64;
  for (let i = 0; i < 64; i++) {
    const f = fieldAt(i, counts);
    const q = clamp(lit - i);
    ctx.save(); ctx.globalAlpha *= a;
    ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.globalAlpha *= ghost; rr(x + i * cw + 1, y, cw - 2, h, 4); ctx.fill(); ctx.restore();
    if (q <= 0) continue;
    const dim = hl ? (f === hl ? 1 : 0.22) : 1;
    ctx.save(); ctx.globalAlpha *= a * q * dim; ctx.fillStyle = FC[f]; rr(x + i * cw + 1, y + (1 - q) * 8, cw - 2, h, 4); ctx.fill(); ctx.restore();
  }
}
function segGlow(counts, k, x, y, w, h, a, pulse = 1) {
  const [x0, x1] = segX(counts, k, x, w);
  ctx.save(); ctx.globalAlpha *= a * pulse; ctx.strokeStyle = FC[FK[k]]; ctx.lineWidth = 3; glow(FC[FK[k]], 22); rr(x0 - 3, y - 5, x1 - x0 + 6, h + 10, 8); ctx.stroke(); ctx.restore();
}

const ID_T = 1000000n, ID_DC = 3n, ID_M = 7n, ID_SEQ = 0n;
const ID_VAL = ((ID_T << 22n) | (ID_DC << 17n) | (ID_M << 12n) | ID_SEQ).toString();

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  const x0 = 930, y0 = 330, cs = 48, gp = 8;
  for (let i = 0; i < 64; i++) {
    const f = fieldAt(i, SNOW), r = Math.floor(i / 16), c = i % 16;
    const q = eBack(P(lt, 0.5 + i * 0.03, 1.0 + i * 0.03));
    const x = x0 + c * (cs + gp), y = y0 + r * (cs + gp);
    ctx.save(); ctx.globalAlpha *= clamp(q * 2); ctx.translate(x + cs / 2, y + cs / 2); ctx.scale(Math.max(q, 0), Math.max(q, 0));
    glow(FC[f], 10); rr(-cs / 2, -cs / 2, cs, cs, 10); ctx.fillStyle = FC[f] + 'cc'; ctx.fill(); ctx.restore();
  }
  const la = A(lt, 3.0, 0.8);
  [['时间 41', 'time'], ['机房 5', 'dc'], ['机器 5', 'mach'], ['序列 12', 'seq']].forEach(([s, k], i) => {
    const x = x0 + i * 220; dot(x + 8, 640, 8, FC[k], { g: 10, a: la });
    text(s, x + 26, 650, { size: 26, weight: 700, color: INK, a: la });
  });
  text('64 位 = 1 位符号 + 41 + 5 + 5 + 12', x0, 710, { size: 26, color: MUTE, font: MONO, a: A(lt, 3.4, 0.8) });
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = eOut(P(lt, 0.4, 1.4)); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 100px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('唯一 ID 生成器', 104, 510); ctx.restore();
  text('Unique ID Generator', 112, 580, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 7 章', 112, 670, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

// ───────── 01 先把要求说清楚 ─────────
function sceneNeed(lt) {
  header(lt, '01', '先把要求说清楚', SC[1], '唯一、连续、有序，是三件事');
  bullet(0, 'ID 唯一，不重复', A(lt, 7.0));
  bullet(1, '按时间大致排序', A(lt, 8.3));
  bullet(2, '放得进 64 位', A(lt, 10.5));
  bullet(3, '每秒 1 万个以上', A(lt, 12.4));
  // 多台机器同时发号
  const out = 1 - A(lt, 6.4, 0.8) * 0.0;
  const ms = [['机器 A', 840], ['机器 B', 1120], ['机器 C', 1400]];
  ms.forEach(([n, x], i) => box(x, 190, 240, 96, n, { color: SC[1], a: A(lt, 0.4 + i * 0.2) }));
  const fadeAll = 1 - A(lt, 14.0, 0.8);
  glass(830, 420, 1000, 76, { a: A(lt, 0.9) * (0.4 + 0.6 * fadeAll), accent: SC[0] });
  text('同一个系统里的 ID', 830, 402, { size: 24, color: MUTE, a: A(lt, 0.9) * fadeAll });
  const drops = [[0, 1.4, '17', 880], [1, 1.9, '23', 980], [2, 2.4, '31', 1080], [0, 2.9, '38', 1180], [0, 3.6, '42', 1280], [2, 3.6, '42', 1380], [1, 8.0, '56', 1480], [2, 9.4, '61', 1580], [0, 10.8, '77', 1680], [1, 12.2, '85', 1780]];
  drops.forEach(([m, t0, v, tx]) => {
    const p = eIO(P(lt, t0, t0 + 0.9)), cx = ms[m][1] + 120;
    const bad = v === '42' && lt > t0 + 0.8;
    const a = A(lt, t0, 0.15) * fadeAll;
    chip(lerp(cx, tx, p), lerp(300, 458, p), v, bad ? RED : SC[1], { a, ring: bad ? RED : null });
  });
  const ba = A(lt, 4.6) * fadeAll;
  text('撞号 ✗', 1330, 395, { size: 30, weight: 800, color: RED, align: 'center', a: ba });
  // 三个概念
  const cards = [
    [800, '唯一', SC[0], '范围内没有重复', ['ok', '10, 12, 15'], ['no', '10, 10, 11'], 15.0],
    [1150, '连续', SC[3], '中间没有空洞', ['ok', '10, 11, 12'], ['mid', '10, 12, 15'], 15.8],
    [1500, '有序', SC[1], '大小能反映先后', ['ok', '10, 12, 15'], ['no', '30, 10, 20'], 16.4],
  ];
  cards.forEach(([x, t, c, s, e1, e2, t0], k) => {
    const a = A(lt, t0, 0.7), y = 560 + (1 - a) * 24;
    glass(x, y, 330, 330, { a, accent: c, r: 24 });
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = c; glow(c, 16); rr(x + 28, y, 80, 5, 3); ctx.fill(); ctx.restore();
    text(t, x + 28, y + 70, { size: 46, weight: 800, a });
    text(s, x + 28, y + 112, { size: 24, color: MUTE, a });
    [e1, e2].forEach(([kind, v], j) => { const yy = y + 176 + j * 66; mark(kind, x + 46, yy - 8, 30, a); text(v, x + 84, yy, { size: 30, weight: 700, font: MONO, a, color: kind === 'no' ? RED : INK }); });
    if (k === 1) {
      const na = A(lt, 18.2, 0.6);
      ctx.save(); ctx.globalAlpha *= na; glow(SC[3], 14); rr(x + 28, y + 276, 190, 40, 20); ctx.fillStyle = SC[3] + '30'; ctx.fill(); ctx.strokeStyle = SC[3]; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      text('本题不要求', x + 123, y + 304, { size: 24, weight: 700, color: SC[3], align: 'center', a: na });
    }
  });
}

// ───────── 02 多主自增 ─────────
function sceneMulti(lt) {
  header(lt, '02', '多主自增', SC[1], '错开起点，按步长递增');
  const rows = [
    { y: 200, name: 'DB-A', sub: '起点 1 · 步长 2', ids: [1, 3, 5, 7], ts: [4.1, 5.2, 5.5, 5.9], tail: 101, tt: 11.0, t0: 2.7 },
    { y: 380, name: 'DB-B', sub: '起点 2 · 步长 2', ids: [2, 4, 6, 8], ts: [5.9, 7.2, 7.5, 7.9], tail: 20, tt: 14.0, t0: 3.0 },
  ];
  rows.forEach((r, ri) => {
    const a = A(lt, r.t0);
    dbIcon(800, r.y, 84, 100, null, { color: SC[1], a });
    text(r.name, 912, r.y + 44, { size: 30, weight: 800, a, font: MONO });
    text(r.sub, 912, r.y + 80, { size: 20, color: MUTE, font: MONO, a });
    r.ids.forEach((v, k) => chip(1210 + k * 86, r.y + 50, String(v), SC[1], { a: A(lt, r.ts[k], 0.3), s: eBack(P(lt, r.ts[k], r.ts[k] + 0.4)), w: 66 }));
    const sa = A(lt, 7.8, 0.6);
    for (let k = 0; k < 3; k++) text('+2', 1210 + k * 86 + 43, r.y + 20, { size: 20, color: MUTE, font: MONO, align: 'center', a: sa });
    text('…', 1590, r.y + 60, { size: 30, color: MUTE, align: 'center', a: A(lt, r.ts[3], 0.3) });
    const ta = A(lt, r.tt, 0.5);
    chip(1700, r.y + 50, String(r.tail), ri === 0 ? SC[3] : SC[0], { a: ta, s: eBack(P(lt, r.tt, r.tt + 0.5)), w: 96, size: 26, ring: lt > 15.7 ? RED : null });
    text(ri === 0 ? '先发' : '后发', 1700, r.y + 108, { size: 22, weight: 700, color: ri === 0 ? SC[3] : SC[0], align: 'center', a: ta });
  });
  const pa = A(lt, 15.7, 0.7);
  glass(800, 560, 1040, 130, { a: pa, accent: RED });
  text('真实先后：101（A）→ 20（B）', 830, 612, { size: 30, weight: 700, a: pa, font: MONO });
  text('后发的 20 比先发的 101 还小：数字大小对不上先后', 830, 660, { size: 26, color: RED, weight: 600, a: pa });
  const ca = A(lt, 18.2, 0.7);
  glass(800, 720, 1040, 180, { a: ca, accent: SC[3] });
  box(830, 746, 190, 128, 'DB-C', { color: SC[4], sub: '新增', a: ca, size: 30 });
  text('想扩成三台，步长 2 → 3？', 1060, 790, { size: 30, weight: 700, a: ca });
  text('新机 3, 6, 9… 会撞上 A 已发过的 3、9', 1060, 838, { size: 26, color: RED, font: MONO, a: A(lt, 19.2, 0.6) });
  text('示意', 1810, 880, { size: 20, color: DIM, align: 'right', a: ca });
  bullet(0, '不会撞号', A(lt, 9.2), { color: GREEN });
  bullet(1, '数字不反映先后', A(lt, 15.7), { color: RED });
  bullet(2, '加机器要重排步长', A(lt, 19.6), { color: RED });
}

// ───────── 03 UUID ─────────
function sceneUuid(lt) {
  header(lt, '03', 'UUID', SC[2], '各自生成，无需协调');
  const sv = [['Web 1', 830], ['Web 2', 1120], ['Web 3', 1410]];
  sv.forEach(([n, x], i) => {
    box(x, 190, 240, 96, n, { color: SC[1], a: A(lt, 0.4 + i * 0.2) });
    const ta = A(lt, 3.0 + i * 0.6, 0.6);
    text(`${hex(i + 1, 8)}-…`, x + 120, 330 + (1 - ta) * 14, { size: 24, font: MONO, color: SC[2], align: 'center', a: ta, weight: 700 });
  });
  text('互不通信，各自生成', 1120, 380, { size: 24, color: MUTE, align: 'center', a: A(lt, 5.4, 0.6) });
  // 128 位
  const bx = 800, by = 450, bw = 1040, bh = 60, v7 = lt >= 14.7;
  const grow = eOut(P(lt, 6.8, 8.6)), t7 = A(lt, 14.7, 0.6);
  const cw = bw / 128, over = A(lt, 8.9, 0.6);
  for (let i = 0; i < 128; i++) {
    const q = clamp(grow * 128 - i); if (q <= 0) continue;
    let c = SC[2];
    if (v7) c = i < 48 ? SC[0] : i < 54 ? '#7c869f' : SC[2];
    if (!v7 && i >= 64) c = over > 0 ? RED : SC[2];
    ctx.save(); ctx.globalAlpha *= q * (i >= 64 && !v7 ? lerp(0.9, 0.9, over) : 0.9); ctx.fillStyle = c; rr(bx + i * cw + 1, by, cw - 2, bh, 3); ctx.fill(); ctx.restore();
  }
  text('128 位', bx + bw / 2, by - 14, { size: 26, weight: 800, font: MONO, align: 'center', a: grow, color: v7 ? MUTE : INK });
  const lx = bx + bw / 2;
  ctx.save(); ctx.globalAlpha *= over; ctx.setLineDash([6, 6]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(lx, by - 8); ctx.lineTo(lx, by + bh + 24); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  text('题目限制：64 位', lx - 10, by + bh + 52, { size: 24, weight: 700, align: 'right', a: over });
  text('超出 64 位 ✗', lx + 14, by + bh + 52, { size: 24, weight: 700, color: RED, a: over * (1 - t7) });
  if (t7 > 0) {
    text('时间 48 位', bx + (48 / 128) * bw / 2, by + bh + 52, { size: 22, color: SC[0], weight: 700, align: 'center', a: t7 });
    text('随机 / 计数 74 位', bx + (54 + 74 / 2) / 128 * bw + 40, by + bh + 52, { size: 22, color: SC[2], weight: 700, align: 'center', a: t7 });
    text('版本 6', bx + (48 + 3) / 128 * bw, by - 14, { size: 20, color: MUTE, align: 'center', a: t7 });
    text('UUIDv7 · 示意', bx + bw, by - 14, { size: 22, color: SC[0], align: 'right', weight: 700, a: t7 });
  }
  // 顺序对比
  const pa = A(lt, 10.7, 0.7);
  glass(800, 640, 1040, 260, { a: pa, accent: v7 ? SC[0] : SC[2] });
  text(v7 ? 'UUIDv7：按生成顺序看（示意）' : '随机 UUID：按生成顺序看（示意）', 830, 690, { size: 24, color: MUTE, a: pa });
  const v4 = ['7c1e9a4b', '1b44d0f3', 'e90a52c8'], v7s = ['018f2a4e', '018f2a4f', '018f2a50'];
  for (let i = 0; i < 3; i++) {
    const y = 750 + i * 54;
    text(`第 ${i + 1} 个`, 830, y, { size: 26, color: MUTE, a: pa });
    text(v7 ? v7s[i] : v4[i], 990, y, { size: 30, weight: 700, font: MONO, color: v7 ? SC[0] : SC[2], a: pa });
  }
  if (!v7) { mark('no', 1360, 800, 34, A(lt, 12.4)); text('大小与先后无关', 1400, 810, { size: 28, color: RED, weight: 700, a: A(lt, 12.4) }); }
  else { mark('ok', 1360, 800, 34, t7); text('前缀随时间增长', 1400, 810, { size: 28, color: GREEN, weight: 700, a: t7 });
    mark('no', 1360, 862, 34, A(lt, 18.7)); text('但仍是 128 位', 1400, 872, { size: 28, color: RED, weight: 700, a: A(lt, 18.7) }); }
  bullet(0, '无需互相协调', A(lt, 5.7), { color: GREEN });
  bullet(1, '128 位 > 64 位', A(lt, 8.9), { color: RED });
  bullet(2, '随机版本不按时间排序', A(lt, 11.4), { color: RED });
  bullet(3, 'v7 有序，仍然 128 位', A(lt, 14.7), { color: SC[3] });
}

// ───────── 04 票据服务器 ─────────
function sceneTicket(lt) {
  header(lt, '04', '票据服务器', SC[3], '像一台统一的排号机');
  const cl = [['客户端 1', 280], ['客户端 2', 430], ['客户端 3', 580]];
  const SX = 1340, SY = 330, SW = 330, SH = 290;
  cl.forEach(([n, y], i) => box(820, y, 220, 96, n, { color: SC[1], a: A(lt, 0.4 + i * 0.2), size: 26 }));
  const dead = P(lt, 10.2, 11.0) > 0, deadP = A(lt, 10.2, 0.6);
  const reqs = []; for (let k = 0; k < 9; k++) reqs.push([k % 3, 5.2 + k * 0.6]);
  let n = 0; reqs.forEach(([, t0]) => { if (lt >= t0 + 0.5) n++; });
  box(SX, SY, SW, SH, '票据服务器', { color: SC[3], a: A(lt, 1.2), size: 32, hot: dead });
  text('下一个号', SX + SW / 2, SY + 150, { size: 22, color: MUTE, align: 'center', a: A(lt, 1.2) });
  text(String(1000 + n), SX + SW / 2, SY + 220, { size: 70, weight: 800, font: MONO, align: 'center', color: dead ? RED : SC[3], a: A(lt, 1.2) });
  reqs.forEach(([ci, t0], k) => {
    const y = cl[ci][1] + 48;
    const p1 = P(lt, t0, t0 + 0.5), p2 = P(lt, t0 + 0.5, t0 + 1.0);
    if (p1 > 0 && p1 < 1) { dot(lerp(1040, SX, eIO(p1)), lerp(y, SY + 145, eIO(p1)), 8, SC[1], { g: 16 }); }
    if (p2 > 0 && p2 < 1) { chip(lerp(SX, 1075, eIO(p2)), lerp(SY + 145, y, eIO(p2)), String(1000 + k + 1), SC[3], { w: 84, size: 22 }); }
  });
  cl.forEach(([, y], ci) => {
    let last = -1; reqs.forEach(([c2, t0], k) => { if (c2 === ci && lt >= t0 + 1.0) last = k; });
    if (last >= 0) chip(1075, y + 48, String(1000 + last + 1), SC[3], { w: 84, size: 22, a: lt < 10.2 ? 1 : 0.35 });
  });
  // 宕机
  if (deadP > 0) {
    text('✗ 宕机', SX + SW / 2, SY - 20, { size: 34, weight: 800, color: RED, align: 'center', a: deadP });
    cl.forEach(([, y], i) => { const a = A(lt, 11.2 + i * 0.3, 0.5); text('拿不到号', 1215, y + 56, { size: 24, weight: 700, color: RED, align: 'center', a }); });
  }
  const ga = A(lt, 14.9, 0.7);
  if (ga > 0) {
    ctx.save(); ctx.globalAlpha *= ga; ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; rr(SX, 700, SW, 130, 22); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
    text('票据服务器 2', SX + SW / 2, 774, { size: 28, color: MUTE, align: 'center', weight: 700, a: ga });
    arrow(SX + SW / 2 - 60, SY + SH + 4, SX + SW / 2 - 60, 690, { color: RED, a: ga, p: eOut(P(lt, 15.4, 16.2)), dash: [8, 8] });
    arrow(SX + SW / 2 + 60, 690, SX + SW / 2 + 60, SY + SH + 4, { color: RED, a: ga, p: eOut(P(lt, 15.8, 16.6)), dash: [8, 8] });
    text('同步？冲突？', SX + SW / 2 + 90, 668, { size: 26, color: RED, weight: 700, a: A(lt, 16.4, 0.6) });
  }
  bullet(0, '实现简单', A(lt, 7.3), { color: GREEN });
  bullet(1, '直接拿到数字 ID', A(lt, 8.3), { color: GREEN });
  bullet(2, '单点故障', A(lt, 10.2), { color: RED });
  bullet(3, '多台要同步，易冲突', A(lt, 14.9), { color: RED });
}

// ───────── 05 雪花算法：64 位逐位拆解 ─────────
const BX = 800, BW = 1040, BY = 250, BH = 64;
function sceneBits(lt) {
  header(lt, '05', '雪花算法：64 位', SC[0], 'Twitter Snowflake');
  statCard(110, 430, 640, '总位数', '64', { color: SC[0], a: A(lt, 4.7), note: '1 + 41 + 5 + 5 + 12' });
  // 括号
  const ba = A(lt, 1.6, 0.8);
  ctx.save(); ctx.globalAlpha *= ba; ctx.strokeStyle = MUTE; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(BX, 226); ctx.lineTo(BX, 214); ctx.lineTo(BX + BW, 214); ctx.lineTo(BX + BW, 226); ctx.stroke(); ctx.restore();
  text('64 位（8 字节）', BX + BW / 2, 200, { size: 26, weight: 700, align: 'center', color: INK, a: ba });
  const lit = lt < 6.8 ? 0 : lt < 9.0 ? lerp(0, 1, P(lt, 6.8, 7.2)) : lt < 11.3 ? lerp(1, 42, P(lt, 9.0, 10.8)) : lt < 12.8 ? lerp(42, 47, P(lt, 11.3, 12.0)) : lt < 13.9 ? lerp(47, 52, P(lt, 12.8, 13.5)) : lerp(52, 64, P(lt, 13.9, 14.9));
  cells(BX, BY, BW, BH, { lit, a: ba * 0 + A(lt, 1.4, 0.8) });
  const info = [
    ['1 位', '固定为 0', 6.8], ['41 位', '毫秒，自 epoch 起', 9.0], ['5 位', '2⁵ = 32', 11.3], ['5 位', '2⁵ = 32', 12.8], ['12 位', '2¹² = 4096', 13.9],
  ];
  info.forEach(([bits, desc, t0], k) => {
    const a = A(lt, t0, 0.6), cx = BX + k * 211, cy = 420 + (1 - a) * 18, f = FK[k], c = FC[f];
    const [s0, s1] = segX(SNOW, k, BX, BW);
    ctx.save(); ctx.globalAlpha *= a * 0.55; ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo((s0 + s1) / 2, BY + BH + 8); ctx.lineTo(cx + 98, cy); ctx.stroke(); ctx.restore();
    glass(cx, cy, 196, 150, { a, accent: c, r: 20 });
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = c; glow(c, 14); rr(cx + 20, cy, 56, 4, 2); ctx.fill(); ctx.restore();
    text(FN[f], cx + 20, cy + 50, { size: 28, weight: 800, a });
    text(bits, cx + 20, cy + 92, { size: 30, weight: 800, font: MONO, color: c, a });
    text(desc, cx + 20, cy + 128, { size: 20, color: MUTE, a });
    if (lt > t0 && lt < t0 + 1.8) segGlow(SNOW, k, BX, BY, BW, BH, a, 1 - P(lt, t0 + 1.0, t0 + 1.8));
  });
  // 排序示意
  const sa = A(lt, 15.5, 0.7);
  text('时间放在高位：数字越大，时间越晚', BX, 640, { size: 30, weight: 700, a: sa });
  [[800, 'ID₁', 't = 1000 ms', SC[0]], [1230, 'ID₂', 't = 1001 ms', SC[0]]].forEach(([x, n, s, c], i) => {
    const a = A(lt, 16.0 + i * 0.6, 0.6);
    glass(x, 680, 330, 120, { a, accent: c });
    text(n, x + 28, 724, { size: 24, color: MUTE, a });
    text(s, x + 28, 772, { size: 36, weight: 800, font: MONO, color: c, a });
  });
  text('<', 1180, 764, { size: 64, weight: 800, color: GREEN, align: 'center', a: A(lt, 17.2, 0.5) });
  text('按数字排序，就是大致按时间排序（示意）', BX, 850, { size: 24, color: MUTE, a: A(lt, 18.0, 0.6) });
}

// ───────── 06 拼出一个 ID ─────────
function sceneCompose(lt) {
  header(lt, '06', '拼出一个 ID', SC[2], '四个字段各归各位');
  const BXc = 800, BYc = 370, BWc = 1040, BHc = 60;
  const fields = [['time', '时间 t', comma(Number(ID_T)), 3.7], ['dc', '机房', String(ID_DC), 4.2], ['mach', '机器', String(ID_M), 4.7], ['seq', '序列', String(ID_SEQ), 5.2]];
  const segIdx = { time: 1, dc: 2, mach: 3, seq: 4 };
  // 高亮窗口（对应旁白依次点名）
  const hlWin = [['dc', 8.8, 9.3], ['mach', 9.3, 9.8], ['time', 9.8, 10.3], ['seq', 10.3, 10.8]];
  let hl = null; hlWin.forEach(([f, a0, a1]) => { if (lt >= a0 && lt < a1 + 0.1) hl = f; });
  const lit = 64 * eIO(P(lt, 6.0, 7.4));
  cells(BXc, BYc, BWc, BHc, { lit, a: A(lt, 3.0, 0.8), hl });
  if (hl) segGlow(SNOW, segIdx[hl], BXc, BYc, BWc, BHc, 1);
  fields.forEach(([f, label, val, t0], i) => {
    const x = 800 + i * 262, a = A(lt, t0, 0.5), y = 190 + (1 - a) * 16;
    glass(x, y, 230, 104, { a, accent: FC[f] });
    text(label, x + 22, y + 38, { size: 22, color: MUTE, a });
    text(val, x + 22, y + 86, { size: 38, weight: 800, font: MONO, color: FC[f], a });
    const [s0, s1] = segX(SNOW, segIdx[f], BXc, BWc), sx = (s0 + s1) / 2, cx = x + 115;
    const p = eIO(P(lt, 5.8 + i * 0.15, 6.9 + i * 0.15));
    if (p > 0 && p < 1) dot(lerp(cx, sx, p), lerp(y + 104, BYc, p), 10, FC[f], { g: 20 });
    ctx.save(); ctx.globalAlpha *= a * 0.35; ctx.strokeStyle = FC[f]; ctx.lineWidth = 2; ctx.setLineDash([5, 6]); ctx.beginPath(); ctx.moveTo(cx, y + 104); ctx.lineTo(sx, BYc - 4); ctx.stroke(); ctx.restore();
  });
  const fa = A(lt, 6.8, 0.8);
  text('ID = (t << 22) | (机房 << 17) | (机器 << 12) | 序列', 800, 490, { size: 24, font: MONO, color: MUTE, a: fa });
  const ia = A(lt, 7.6, 0.8), dim = 1 - 0.5 * A(lt, 14.2, 0.5);
  text('ID =', 800, 560, { size: 36, color: MUTE, font: MONO, a: ia * dim });
  text(comma(ID_VAL), 910, 560, { size: 52, weight: 800, font: MONO, a: ia * dim });
  text('示意', 1830, 560, { size: 20, color: DIM, align: 'right', a: ia });
  bullet(0, '机房不同 → 机房字段不同', A(lt, 8.8), { color: FC.dc });
  bullet(1, '机器不同 → 机器字段不同', A(lt, 9.3), { color: FC.mach });
  bullet(2, '毫秒不同 → 时间字段不同', A(lt, 9.8), { color: FC.time });
  bullet(3, '同毫秒 → 序列不同', A(lt, 10.3), { color: FC.seq });
  const g1 = A(lt, 10.8, 0.6) * (1 - A(lt, 14.1, 0.5)), g2 = A(lt, 14.3, 0.6);
  statCard(110, 690, 640, '只要有一项不同', 'ID 就不同', { color: GREEN, a: g1 });
  statCard(110, 690, 640, '共用机房号 + 机器号', '必然撞号', { color: RED, a: g2 });
  // 两台克隆实例
  const ca = A(lt, 14.1, 0.7);
  [[800, '实例 A'], [1190, '实例 B']].forEach(([x, n], i) => {
    const a = A(lt, 14.1 + i * 0.3, 0.6);
    glass(x, 620, 350, 110, { a, accent: RED });
    text(n, x + 24, 664, { size: 26, weight: 800, a });
    text('机房 3 · 机器 7', x + 24, 708, { size: 28, font: MONO, color: MUTE, a });
    arrow(x + 175, 734, x + 175, 784, { color: RED, a, p: eOut(P(lt, 16.0 + i * 0.3, 16.9 + i * 0.3)) });
  });
  const ra = A(lt, 17.2, 0.7);
  glass(800, 790, 1040, 110, { a: ra, accent: RED });
  text('同一毫秒、序列都是 0：', 826, 836, { size: 24, color: MUTE, a: ra });
  text(comma(ID_VAL), 826, 880, { size: 38, weight: 800, font: MONO, color: RED, a: ra });
  text('= 一模一样', 1420, 880, { size: 38, weight: 800, color: RED, a: ra });
}

// ───────── 07 同一毫秒内的序列号 ─────────
function sceneSeq(lt) {
  header(lt, '07', '同一毫秒内', SC[3], '序列号：本毫秒的小票号');
  const cols = [[800, 1000], [1150, 1001], [1500, 1002]];
  const ptr = lt < 9.5 ? 0 : lt < 10.5 ? eIO(P(lt, 9.5, 10.5)) : lt < 17.8 ? 1 : 1 + eIO(P(lt, 17.8, 18.8));
  cols.forEach(([x, ms], i) => {
    const act = clamp(1 - Math.abs(ptr - i) * 1.6);
    glass(x, 300, 330, 250, { a: A(lt, 0.3 + i * 0.15), accent: act > 0.5 ? SC[0] : null, fill: 0.03 + act * 0.06 });
    text(`第 ${ms} 毫秒`, x + 26, 346, { size: 26, weight: 700, font: MONO, color: act > 0.5 ? INK : MUTE, a: A(lt, 0.3 + i * 0.15) });
  });
  const px = lerp(965, 1665, ptr / 2);
  ctx.save(); ctx.globalAlpha *= A(lt, 0.8); glow(SC[0], 18); ctx.fillStyle = SC[0]; ctx.beginPath(); ctx.moveTo(px - 16, 246); ctx.lineTo(px + 16, 246); ctx.lineTo(px, 276); ctx.closePath(); ctx.fill(); ctx.restore();
  text('现在', px, 232, { size: 22, weight: 700, color: SC[0], align: 'center', a: A(lt, 0.8) });
  text('示意：时间以毫秒推进', 800, 200, { size: 22, color: DIM, a: A(lt, 0.8) });
  // 请求
  const rq = [
    { col: 0, row: 0, t: 4.8, st: 7.3, seq: 0 }, { col: 0, row: 1, t: 5.4, st: 8.8, seq: 1 }, { col: 0, row: 2, t: 6.0, st: 9.3, seq: 2 },
    { col: 1, row: 0, t: 10.8, st: 11.3, seq: 0 },
  ];
  const chipAt = (col, row) => [cols[col][0] + 165, 300 + 100 + row * 56];
  rq.forEach((r) => {
    const [cx, cy] = chipAt(r.col, r.row), a = A(lt, r.t, 0.3), d = (1 - eOut(P(lt, r.t, r.t + 0.6))) * -60;
    const stamped = lt >= r.st;
    chip(cx, cy + d, stamped ? `t=${cols[r.col][1]} · seq=${r.seq}` : `请求`, stamped ? SC[3] : MUTE, { a, w: 282, h: 44, size: 24, ring: stamped && lt < r.st + 0.5 ? '#fff' : null });
  });
  // 序列计数器
  const used = lt < 10.5 ? [0, 0, 0, 0].filter((_, i) => lt >= rq[i].st && i < 3).length : lt < 11.3 ? 0 : lt < 12.3 ? 1 : lt < 15.6 ? 1 + Math.round(4095 * eIO(P(lt, 12.3, 15.6))) : lt < 17.8 ? 4096 : Math.round(4096 * (1 - eIO(P(lt, 17.8, 18.6))));
  const full = used >= 4096, ga = A(lt, 0.8);
  text('序列号计数器（当前毫秒）', 800, 620, { size: 24, color: MUTE, a: ga });
  rr(800, 640, 1040, 38, 19); ctx.save(); ctx.globalAlpha *= ga; ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill(); ctx.restore();
  ctx.save(); ctx.globalAlpha *= ga; ctx.fillStyle = full ? RED : SC[3]; glow(full ? RED : SC[3], 14); rr(800, 640, Math.max(14, (used / 4096) * 1040), 38, 19); ctx.fill(); ctx.restore();
  text('0', 800, 716, { size: 22, color: MUTE, font: MONO, a: ga });
  text('4095', 1840, 716, { size: 22, color: MUTE, font: MONO, align: 'right', a: ga });
  text(`${comma(used)} / 4,096`, 1320, 716, { size: 28, weight: 800, font: MONO, align: 'center', color: full ? RED : SC[3], a: ga });
  // 第 4097 个
  const wa = A(lt, 15.8, 0.5);
  if (wa > 0) {
    const mv = eIO(P(lt, 17.8, 18.8)), [x1, y1] = [1315, 480], [x2, y2] = [1665, 400];
    const ok = lt > 18.8;
    chip(lerp(x1, x2, mv), lerp(y1, y2, mv), mv > 0.5 ? 't=1002 · seq=0' : '第 4097 个 · 等待', mv > 0.5 ? GREEN : RED, { a: wa, w: 282, h: 44, size: 24, ring: mv < 0.5 ? RED : null });
    if (lt < 17.8) text('不能绕回 0 ✗', 800, 780, { size: 32, weight: 800, color: RED, a: wa });
    if (lt >= 17.8) text('等下一毫秒，序列重新从 0 开始 ✓', 800, 780, { size: 32, weight: 800, color: GREEN, a: A(lt, 18.0, 0.5) });
  }
  bullet(0, '同毫秒：序列 +1', A(lt, 7.0), { y0: 430 });
  bullet(1, '新毫秒：序列归零', A(lt, 10.4), { y0: 430, step: 64 });
  bullet(2, '用完：只能等，不绕回', A(lt, 15.6), { y0: 430, step: 64, color: RED });
  statCard(110, 640, 640, '单机单毫秒最多', '4096 个', { color: SC[3], a: A(lt, 12.3), note: '0 … 4095' });
}

// ───────── 08 时钟回拨 ─────────
function sceneClock(lt) {
  header(lt, '08', '时钟回拨', RED, '时间倒退，必须先刹车');
  const AX = 830, TX = (ms) => AX + (ms - 996) * 120, AY = 330;
  const dim = 1 - 0.65 * A(lt, 8.6, 0.6);
  ctx.save(); ctx.globalAlpha *= dim;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(AX - 20, AY); ctx.lineTo(TX(1004) + 20, AY); ctx.stroke();
  for (let m = 996; m <= 1004; m++) { ctx.beginPath(); ctx.moveTo(TX(m), AY - 8); ctx.lineTo(TX(m), AY + 8); ctx.stroke(); text(String(m), TX(m), AY + 44, { size: 22, color: MUTE, font: MONO, align: 'center' }); }
  text('ms', TX(1004) + 20, AY + 44, { size: 20, color: DIM, font: MONO });
  [[998, 2.2], [999, 2.9], [1000, 3.6]].forEach(([m, t0]) => { const a = A(lt, t0, 0.4); chip(TX(m), 240 + (1 - eOut(P(lt, t0, t0 + 0.4))) * -20, `${m}·0`, SC[0], { a, w: 84, size: 20 }); });
  // 时钟指针
  const pos = lt < 4.0 ? lerp(996.5, 1000, eIO(P(lt, 0.7, 4.0))) : lt < 4.7 ? 1000 : lt < 5.6 ? lerp(1000, 998, eIO(P(lt, 4.7, 5.6))) : 998;
  dot(TX(pos), AY, 11, '#fff', { g: 26, a: A(lt, 0.6) });
  text('现在', TX(pos), 306, { size: 22, weight: 700, align: 'center', a: A(lt, 0.6) });
  const ra = A(lt, 4.7, 0.5);
  if (ra > 0) {
    const p = eIO(P(lt, 4.7, 5.6));
    ctx.save(); ctx.globalAlpha *= ra; ctx.strokeStyle = RED; ctx.fillStyle = RED; ctx.lineWidth = 4; ctx.lineCap = 'round'; glow(RED, 12);
    ctx.beginPath(); const x0 = TX(1000), x1 = TX(998); const steps = 24;
    for (let i = 0; i <= steps * p; i++) { const u = i / steps, x = lerp(x0, x1, u), y = 410 + Math.sin(u * Math.PI) * 38; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke(); ctx.restore();
    text('时钟回拨 −2 ms', (x0 + x1) / 2, 484, { size: 26, weight: 800, color: RED, align: 'center', a: ra });
  }
  const da = A(lt, 6.5, 0.5);
  if (da > 0) {
    const m = eOut(P(lt, 6.5, 7.1));
    chip(TX(998), 240 - (1 - m) * 80, '998·0', RED, { a: da, w: 84, size: 20, ring: RED });
    text('重复 ID ✗', TX(998), 190, { size: 28, weight: 800, color: RED, align: 'center', a: A(lt, 7.0, 0.5) });
  }
  ctx.restore();
  // 比较
  const ca = A(lt, 8.6, 0.7);
  glass(800, 520, 300, 110, { a: ca, accent: SC[0] });
  text('上次发号 last', 826, 562, { size: 22, color: MUTE, a: ca });
  text('1000 ms', 826, 608, { size: 40, weight: 800, font: MONO, color: SC[0], a: ca });
  glass(1130, 520, 300, 110, { a: ca, accent: RED });
  text('当前 now', 1156, 562, { size: 22, color: MUTE, a: ca });
  text('998 ms', 1156, 608, { size: 40, weight: 800, font: MONO, color: RED, a: ca });
  text('now < last ?', 1470, 590, { size: 40, weight: 800, font: MONO, color: SC[3], a: A(lt, 9.6, 0.6) });
  const cards = [[800, '回拨很小', '等待追平', SC[3], 12.9, false], [1155, '回拨太大', '拒绝发号 + 报警', RED, 15.2, false], [1510, '悄悄清零继续发', '绝对不行', RED, 17.4, true]];
  cards.forEach(([x, t, s, c, t0, bad]) => {
    const a = A(lt, t0, 0.6), y = 690 + (1 - a) * 20;
    glass(x, y, 330, 200, { a, accent: c });
    text(t, x + 26, y + 70, { size: bad ? 30 : 36, weight: 800, a, color: bad ? MUTE : INK });
    text(s, x + 26, y + 124, { size: 28, weight: 700, color: c, a });
    if (bad) { ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = RED; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x + 22, y + 58); ctx.lineTo(x + 22 + 214, y + 58); ctx.stroke(); ctx.restore(); mark('no', x + 290, y + 160, 36, a); }
    else mark('ok', x + 290, y + 160, 36, a);
  });
  bullet(0, '照常发号 → 重复 ID', A(lt, 6.5), { color: RED });
  bullet(1, '每次先比较 now 与 last', A(lt, 8.6));
  bullet(2, '小：等；大：拒绝并报警', A(lt, 12.9), { color: SC[3] });
  bullet(3, '不能清零继续发', A(lt, 17.4), { color: RED });
}

// ───────── 09 容量与位预算 ─────────
function sceneBudget(lt) {
  header(lt, '09', '容量与位预算', SC[4], '算一次，心里有数');
  statCard(110, 430, 640, '单机理论上限', '≈ 409.6 万/秒', { color: SC[3], a: A(lt, 5.8) });
  statCard(110, 560, 640, '41 位毫秒的跨度', '≈ 69.7 年', { color: SC[0], a: A(lt, 10.9) });
  statCard(110, 690, 640, '位预算固定', '1+41+5+5+12=64', { color: SC[4], a: A(lt, 15.3) });
  // 面板 1：吞吐
  const a1 = A(lt, 2.0);
  glass(800, 190, 1040, 200, { a: a1, accent: SC[3] });
  text('4096 个/毫秒', 830, 245, { size: 30, weight: 800, font: MONO, color: SC[3], a: a1 });
  text('× 1000 毫秒', 1110, 245, { size: 30, weight: 800, font: MONO, a: A(lt, 3.6) });
  text(`= ${comma(4096000)} /秒`, 1380, 245, { size: 30, weight: 800, font: MONO, color: SC[3], a: A(lt, 5.8) });
  const g1 = eOut(P(lt, 5.8, 7.4));
  text('理论', 830, 300, { size: 22, color: MUTE, a: A(lt, 5.8) });
  ctx.save(); ctx.fillStyle = SC[3]; glow(SC[3], 12); rr(910, 280, 900 * g1, 28, 14); ctx.fill(); ctx.restore();
  const g2 = A(lt, 9.1);
  text('要求', 830, 352, { size: 22, color: MUTE, a: g2 });
  ctx.save(); ctx.globalAlpha *= g2; ctx.fillStyle = GREEN; glow(GREEN, 12); rr(910, 332, Math.max(6, 900 * 10000 / 4096000), 28, 6); ctx.fill(); ctx.restore();
  text('1 万/秒  ≈ 1/410', 970, 353, { size: 22, color: GREEN, weight: 700, a: g2 });
  // 面板 2：年限
  const a2 = A(lt, 10.9);
  glass(800, 410, 1040, 200, { a: a2, accent: SC[0] });
  text('2⁴¹ 毫秒 ÷ 1000 ÷ 86400 ÷ 365 ≈ 69.7 年', 830, 462, { size: 28, weight: 800, font: MONO, a: a2 });
  const tx0 = 850, tw = 940, tg = eOut(P(lt, 12.0, 14.6));
  ctx.save(); ctx.globalAlpha *= a2; rr(tx0, 500, tw, 24, 12); ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
  ctx.fillStyle = SC[0]; glow(SC[0], 12); rr(tx0, 500, Math.max(24, tw * tg), 24, 12); ctx.fill(); ctx.restore();
  for (let y = 0; y <= 70; y += 10) text(y === 70 ? '70 年' : String(y), tx0 + (y / 70) * tw - (y === 70 ? 14 : 0), 562, { size: 20, color: MUTE, font: MONO, align: 'center', a: a2 });
  text('起始时间（epoch）', tx0, 592, { size: 22, color: MUTE, a: a2 });
  text('用完 → 需迁移 epoch / 位布局', tx0 + tw, 592, { size: 22, color: RED, align: 'right', a: A(lt, 14.0) });
  // 面板 3：位预算
  const a3 = A(lt, 15.3);
  glass(800, 640, 1040, 260, { a: a3, accent: SC[4] });
  const m = eIO(P(lt, 18.2, 19.4));
  const cnt = [1, 41, 5, lerp(5, 7, m), lerp(12, 10, m)];
  cells(830, 680, 980, 56, { counts: cnt, a: a3 });
  const b = bnd(cnt);
  FK.forEach((f, k) => {
    const s0 = k ? b[k - 1] : 0, mid = 830 + ((s0 + b[k]) / 2 / 64) * 980, n = b[k] - s0;
    if (k === 0) return;
    text(String(n), mid, 780, { size: 28, weight: 800, font: MONO, color: FC[f], align: 'center', a: a3 });
    text({ time: '时间', dc: '机房', mach: '机器', seq: '序列' }[f], mid, 818, { size: 22, color: MUTE, align: 'center', a: a3 });
  });
  text('总是 64 位：机器、寿命、吞吐此消彼长', 830, 868, { size: 24, weight: 600, a: a3 });
  text('示意：机器 +2 位，序列 −2 位', 1810, 868, { size: 22, color: DIM, align: 'right', a: A(lt, 18.2, 0.6) });
}

// ───────── 10 四种方案对比 ─────────
function sceneCompare(lt) {
  header(lt, '10', '四种方案对比', SC[1], '取舍');
  const cx = [1140, 1300, 1460];
  const ha = A(lt, 1.0);
  ['64 位数字', '按时间排序', '可扩展·无单点'].forEach((s, i) => text(s, cx[i], 226, { size: 22, color: MUTE, align: 'center', weight: 600, a: ha }));
  text('主要代价', 1560, 226, { size: 22, color: MUTE, weight: 600, a: ha });
  const rows = [
    ['多主自增', SC[1], 'auto_increment', [['ok', '自增数字'], ['no', '不一定随时间'], ['no', '难跨机房']], '改步长、加机器麻烦', 3.2],
    ['UUID', SC[2], '128 位', [['no', '128 位'], ['mid', 'v7 才有序'], ['ok', '无需协调']], '装不进 64 位', 7.3],
    ['票据服务器', SC[3], '集中递增', [['ok', '数字 ID'], ['mid', '集中递增'], ['no', '单点故障']], '单点，多台要同步', 10.7],
    ['雪花算法', GREEN, 'Snowflake', [['ok', '1+41+5+5+12'], ['ok', '大致有序'], ['ok', '去中心化']], '机器号 · 时钟', 14.3],
  ];
  rows.forEach(([name, c, sub, cs, cost, t0], r) => {
    const a = A(lt, t0, 0.6), y = 250 + r * 148 + (1 - a) * 18, win = r === 3;
    glass(800, y, 1040, 130, { a, accent: c, fill: win ? 0.1 : 0.055 });
    if (win) { ctx.save(); ctx.globalAlpha *= a * 0.6; ctx.strokeStyle = GREEN; ctx.lineWidth = 2; glow(GREEN, 20); rr(800, y, 1040, 130, 22); ctx.stroke(); ctx.restore(); }
    ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = c; glow(c, 14); rr(826, y, 60, 5, 3); ctx.fill(); ctx.restore();
    text(name, 826, y + 62, { size: 32, weight: 800, a });
    text(sub, 826, y + 100, { size: 20, color: MUTE, font: MONO, a });
    cs.forEach(([k, cap], i) => {
      const ia = A(lt, t0 + 0.3 + i * 0.4 + (win ? 0.2 + i * 0.5 : 0), 0.4);
      mark(k, cx[i], y + 52, 44, a * ia);
      text(cap, cx[i], y + 106, { size: 20, color: k === 'no' ? RED : k === 'mid' ? SC[3] : MUTE, align: 'center', a: a * ia, weight: 600 });
    });
    text(cost, 1560, y + 76, { size: 24, color: win ? SC[3] : MUTE, weight: win ? 800 : 500, a: a * A(lt, t0 + (win ? 4.7 : 1.4), 0.5) });
  });
  bullet(0, '雪花：三项都满足', A(lt, 18.1), { color: GREEN });
  statCard(110, 530, 640, '代价', '机器号 + 时钟', { color: SC[3], a: A(lt, 19.0) });
  statCard(110, 660, 640, '它不保证', '全局严格递增', { color: RED, a: A(lt, 20.0) });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  ctx.save(); ctx.globalAlpha *= 0.7 * A(lt, 0.4, 0.8);
  cells(1060, 200, 780, 36, { lit: 64, a: 1 }); ctx.restore();
  text('雪花算法', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Snowflake · 64 位 ID', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['时间', '41 位 · 高位，负责排序', SC[0], 2.2], ['机器', '机房 5 + 机器 5 · 负责区分', SC[2], 2.8], ['序列', '12 位 · 同毫秒内不重复', SC[3], 3.5]].forEach(([w, s, c, t0], k) => {
    const p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 380, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 380, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 440, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 526, { size: 70, weight: 800 });
    text(s, x + 36, 580, { size: 26, color: MUTE });
    ctx.restore();
  });
  text('上线前还要记住', 110, 710, { size: 24, color: MUTE, a: eOut(P(lt, 6.0, 6.8)) });
  let bx = 110;
  ['机器号互斥分配', '序列用尽等下一毫秒', '时钟回拨先刹车'].forEach((s, k) => { bx += badge(bx, 740, s, '#8b8dfc', eOut(P(lt, 6.2 + k * 0.4, 7 + k * 0.4))) + 16; });
  text('大致按时间有序，不保证全局严格递增', 110, 860, { size: 22, color: DIM, a: eOut(P(lt, 8.4, 9.2)) });
}

export const scenes = { title: sceneTitle, need: sceneNeed, multi: sceneMulti, uuid: sceneUuid, ticket: sceneTicket, bits: sceneBits, compose: sceneCompose, seq: sceneSeq, clock: sceneClock, budget: sceneBudget, compare: sceneCompare, end: sceneEnd };
