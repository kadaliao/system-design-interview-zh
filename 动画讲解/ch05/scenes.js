// 第 5 章 一致性哈希：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, eExpo, MONO, SANS, INK, MUTE, DIM, RED, SC, hash32, rnd, rr, glass, text, glow, dot, badge, header } from '../lib/core.js';

// ───────── 哈希环几何 ─────────
const RC = { x: 1250, y: 520, R: 300 };
const ang = (pos) => ((-90 + pos * 3.6) * Math.PI) / 180;
const rp = (pos, r = RC.R) => [RC.x + Math.cos(ang(pos)) * r, RC.y + Math.sin(ang(pos)) * r];
function ringBase(prog = 1, a = 1) {
  ctx.save(); ctx.globalAlpha *= a;
  const g = ctx.createConicGradient(ang(0), RC.x, RC.y);
  g.addColorStop(0, '#34d5c8'); g.addColorStop(0.5, '#8b8dfc'); g.addColorStop(1, '#f472b6');
  ctx.lineWidth = 10; ctx.strokeStyle = g; ctx.lineCap = 'round'; glow('rgba(139,141,252,0.55)', 26);
  ctx.beginPath(); ctx.arc(RC.x, RC.y, RC.R, ang(0), ang(100 * Math.max(prog, 0.0001))); ctx.stroke();
  ctx.shadowBlur = 0; ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.setLineDash([3, 9]);
  ctx.beginPath(); ctx.arc(RC.x, RC.y, RC.R - 62, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(RC.x, RC.y, RC.R + 34, 0, 7); ctx.stroke(); ctx.setLineDash([]);
  for (let p = 0; p < 100 * prog; p += 5) {
    const [x1, y1] = rp(p, RC.R - 22), [x2, y2] = rp(p, RC.R - (p % 25 === 0 ? 38 : 30));
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  }
  ctx.restore();
}
function arcBand(a, b, r, color, w, alpha = 1, g = 22) {
  let e = b; if (e < a) e += 100;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.lineWidth = w; ctx.strokeStyle = color; ctx.lineCap = 'butt'; glow(color, g);
  ctx.beginPath(); ctx.arc(RC.x, RC.y, r, ang(a), ang(e)); ctx.stroke(); ctx.restore();
}
function srvNode(pos, color, label, { s = 1, a = 1, hashLabel = true, dead = 0 } = {}) {
  if (s <= 0 || a <= 0) return;
  const [x, y] = rp(pos);
  ctx.save(); ctx.globalAlpha *= a;
  ctx.translate(x, y); ctx.scale(s, s);
  glow(dead ? RED : color, 30); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = dead ? RED : color; ctx.stroke(); ctx.shadowBlur = 0;
  text(label, 0, 8, { size: 24, weight: 800, align: 'center', font: MONO, color: dead ? RED : INK });
  ctx.restore();
  if (hashLabel) { const [hx, hy] = rp(pos, RC.R + 66); text(String(Math.round(pos)), hx, hy + 8, { size: 24, weight: 700, color: MUTE, align: 'center', font: MONO, a: a * 0.9 }); }
}
function keyDot(pos, color, { r = 10, a = 1, label = null, rad = RC.R, lab = 'out' } = {}) {
  const [x, y] = rp(pos, rad);
  dot(x, y, r, color, { g: 16, a });
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = '#06080f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.restore();
  if (label) { const [lx, ly] = rp(pos, RC.R + (lab === 'out' ? 52 : -92)); text(label, lx, ly + 8, { size: 22, weight: 700, color, align: 'center', font: MONO, a }); }
}
function sweep(a, b, color, prog) { // 顺时针扫描：从 a 走到 b，带亮头
  let e = b; if (e < a) e += 100;
  const cur = lerp(a, e, prog);
  ctx.save(); ctx.lineWidth = 8; ctx.strokeStyle = color; ctx.lineCap = 'round'; glow(color, 26);
  ctx.beginPath(); ctx.arc(RC.x, RC.y, RC.R + 20, ang(a), ang(cur)); ctx.stroke(); ctx.restore();
  const [x, y] = rp(cur, RC.R + 20); dot(x, y, 13, '#fff', { g: 30 });
}
const arrowHead = (x, y, dirx, diry, color, s = 14) => {
  ctx.save(); ctx.fillStyle = color; ctx.translate(x, y); ctx.rotate(Math.atan2(diry, dirx));
  ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.7); ctx.lineTo(-s * 0.7, -s * 0.7); ctx.closePath(); ctx.fill(); ctx.restore();
};
function owner(pos, servers) { // servers: [[pos, idx]]，顺时针第一个 >= pos
  const s = [...servers].sort((a, b) => a[0] - b[0]);
  return (s.find((v) => v[0] >= pos) || s[0])[1];
}

// ───────── 场景 1：取余哈希（也用于重哈希） ─────────
const KH = [17, 42, 8, 63, 29, 91, 54, 35, 76, 12, 88, 23, 47, 70, 5, 66];
const CARD = { x0: 860, gap: 24, w: 170, y: 600, h: 262 };
const cardX = (i) => CARD.x0 + i * (CARD.w + CARD.gap);
function slotsFor(N) {
  const cnt = Array(N).fill(0); return KH.map((h) => { const s = h % N; return { s, k: cnt[s]++ }; });
}
const SA = slotsFor(4), SB = slotsFor(5);
const slotXY = (s, k) => [cardX(s) + 16 + (k % 2) * 72, CARD.y + 74 + Math.floor(k / 2) * 46];
const originXY = (i) => [860 + (i % 8) * 118 + 4, 300 + Math.floor(i / 8) * 62];
function serverCard(i, { a = 1, s = 1, ghost = false, hot = false } = {}) {
  if (a <= 0) return;
  const cx = cardX(i) + CARD.w / 2, cy = CARD.y + CARD.h / 2;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  if (ghost) {
    ctx.setLineDash([8, 8]); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; rr(cardX(i), CARD.y, CARD.w, CARD.h, 22); ctx.stroke(); ctx.setLineDash([]);
    text('?', cardX(i) + CARD.w / 2, CARD.y + 150, { size: 60, color: DIM, align: 'center', weight: 300 });
  } else {
    glass(cardX(i), CARD.y, CARD.w, CARD.h, { accent: SC[i] });
    ctx.fillStyle = SC[i]; glow(SC[i], 18); rr(cardX(i) + 28, CARD.y, CARD.w - 56, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`s${i}`, cardX(i) + 20, CARD.y + 44, { size: 30, weight: 800, color: SC[i], font: MONO });
    text(`index ${i}`, cardX(i) + CARD.w - 18, CARD.y + 44, { size: 17, color: MUTE, align: 'right', font: MONO });
  }
  ctx.restore();
}
function chip(x, y, label, color, { a = 1, s = 1, ring = null } = {}) {
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(x + 32, y + 17); ctx.scale(s, s);
  glow(ring || color, ring ? 22 : 8); rr(-32, -17, 64, 34, 10); ctx.fillStyle = color + '30'; ctx.fill();
  ctx.lineWidth = ring ? 3 : 1.8; ctx.strokeStyle = ring || color; ctx.stroke(); ctx.shadowBlur = 0;
  text(label, 0, 7, { size: 19, weight: 700, align: 'center', font: MONO });
  ctx.restore();
}
function formula(lt, N, a = 1, strike = false) {
  const x = 110, y = 410;
  glass(x, y, 640, 150, { a, accent: '#8b8dfc' });
  text('serverIndex =', x + 34, y + 62, { size: 30, color: MUTE, font: MONO, a });
  text('hash(key) % ', x + 34, y + 116, { size: 44, weight: 700, font: MONO, a });
  const nx = x + 34 + 6 * 44 * 0.6 * 2 + 28;
  ctx.save(); ctx.font = `700 44px ${MONO}`; const w0 = ctx.measureText('hash(key) % ').width; ctx.restore();
  if (strike) {
    text('4', x + 34 + w0, y + 116, { size: 44, weight: 700, font: MONO, color: DIM, a });
    ctx.fillStyle = RED; ctx.fillRect(x + 30 + w0, y + 100, 36, 4);
    text('5', x + 34 + w0 + 52, y + 116, { size: 44, weight: 800, font: MONO, color: SC[3], a });
  } else text(String(N), x + 34 + w0, y + 116, { size: 44, weight: 800, font: MONO, color: SC[3], a });
}
function sceneMod(lt, d) {
  header(lt, '01', '取余哈希', SC[1], '最朴素的分片办法');
  formula(lt, 4, eOut(P(lt, 0.4, 1.1)));
  for (let i = 0; i < 4; i++) serverCard(i, { a: eOut(P(lt, 0.5 + i * 0.12, 1.2 + i * 0.12)) });
  serverCard(4, { ghost: true, a: eOut(P(lt, 1.0, 1.6)) * 0.8 });
  let latest = -1;
  KH.forEach((h, i) => {
    const t0 = 3.2 + i * 0.27, p = eIO(P(lt, t0, t0 + 0.85));
    const [ox, oy] = originXY(i), [tx, ty] = slotXY(SA[i].s, SA[i].k);
    const x = lerp(ox, tx, p), y = lerp(oy, ty, p) - Math.sin(p * Math.PI) * 60;
    const born = eBack(P(lt, 0.9 + i * 0.07, 1.5 + i * 0.07));
    if (lt >= t0 && lt < t0 + 1.2) latest = i;
    const land = P(lt, t0 + 0.4, t0 + 0.85);
    const col = land > 0.5 ? SC[SA[i].s] : '#9aa6d6';
    chip(x, y, String(h), col, { s: born, a: born > 0 ? 1 : 0, ring: lt >= t0 && lt < t0 + 0.9 ? '#ffffff' : null });
  });
  text('每个方块 = 一个 key 的哈希值', 860, 262, { size: 22, color: DIM, a: eOut(P(lt, 1.2, 2)) });
  if (latest >= 0) {
    const h = KH[latest], a = eOut(P(lt, 3.2, 3.6));
    glass(110, 600, 640, 112, { a });
    text('当前 key', 140, 648, { size: 22, color: MUTE, a });
    text(`${h} % 4 = ${h % 4}  →  s${h % 4}`, 140, 696, { size: 40, weight: 700, font: MONO, color: SC[h % 4], a });
  }
  text('N 固定时：稳定、均匀、一次计算', 110, 790, { size: 26, color: MUTE, a: eOut(P(lt, 8.5, 9.3)) });
}

// ───────── 场景 2：加一台，几乎全部搬家 ─────────
const MOVED = KH.map((h, i) => SA[i].s !== SB[i].s);
const nMoved = MOVED.filter(Boolean).length;
function sceneRehash(lt, d) {
  header(lt, '02', '重哈希灾难', RED, '机器一变，N 就变');
  formula(lt, 4, 1, lt > 1.2);
  for (let i = 0; i < 4; i++) serverCard(i);
  const born = eBack(P(lt, 1.5, 2.3));
  serverCard(4, { a: clamp(born * 1.5), s: lerp(0.8, 1, clamp(born)) });
  if (born > 0.2) text('+ 新机器', cardX(4) + CARD.w / 2, CARD.y - 18, { size: 22, color: SC[4], align: 'center', weight: 700, a: clamp(born) });
  KH.forEach((h, i) => {
    const moved = MOVED[i];
    const t0 = moved ? 2.9 + (i % 7) * 0.16 + Math.floor(i / 7) * 0.2 : 4.8;
    const p = eIO(P(lt, t0, t0 + (moved ? 0.95 : 0.6)));
    const [ax, ay] = slotXY(SA[i].s, SA[i].k), [bx, by] = slotXY(SB[i].s, SB[i].k);
    const x = lerp(ax, bx, p), y = lerp(ay, by, p) - (moved ? Math.sin(p * Math.PI) * 70 : 0);
    const flash = moved && lt > t0 - 0.35 && lt < t0 + 0.95;
    const col = p > 0.5 ? SC[SB[i].s] : SC[SA[i].s];
    chip(x, y, String(h), col, { ring: flash ? RED : null, a: moved || lt < 4.5 ? 1 : 1 });
  });
  const a = eOut(P(lt, 5.2, 6));
  glass(110, 588, 640, 112, { a, accent: RED });
  text('改变去向的 key', 140, 636, { size: 22, color: MUTE, a });
  const n = Math.round(nMoved * P(lt, 5.2, 6.4));
  text(`${n} / ${KH.length}`, 140, 684, { size: 44, weight: 800, font: MONO, color: RED, a });
  text('≈ 绝大多数', 330, 684, { size: 28, color: MUTE, a });
  // 示意曲线：缓存命中率 vs 数据库压力
  const ca = eOut(P(lt, 7.2, 8.2)), cx = 110, cy = 722, cw = 640, ch = 126;
  glass(cx, cy, cw, ch + 56, { a: ca, r: 20 });
  const prog = P(lt, 8, 14.5), t0x = 0.28;
  const hit = (u) => (u < t0x ? 0.96 : 0.18 + 0.7 * (1 - Math.exp(-(u - t0x) * 3)) * (u > 0.72 ? 1 : 0.35));
  const db = (u) => (u < t0x ? 0.08 : 0.08 + 0.85 * Math.exp(-(u - t0x) * 2.2));
  ctx.save(); ctx.globalAlpha *= ca;
  [[hit, SC[0], '缓存命中率'], [db, RED, '数据库压力']].forEach(([f, c, name], k) => {
    ctx.beginPath(); ctx.lineWidth = 4; ctx.strokeStyle = c; glow(c, 12); ctx.lineJoin = 'round';
    for (let u = 0; u <= prog; u += 0.01) { const x = cx + 28 + u * (cw - 56), y = cy + 24 + (1 - f(u)) * (ch - 36); u === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke(); ctx.shadowBlur = 0;
    text(name, cx + 30 + k * 150, cy + ch + 40, { size: 20, color: c, weight: 600 });
  });
  const lx = cx + 28 + t0x * (cw - 56);
  ctx.setLineDash([5, 6]); ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(lx, cy + 18); ctx.lineTo(lx, cy + ch - 10); ctx.stroke(); ctx.setLineDash([]);
  text('加机器', lx + 8, cy + 38, { size: 18, color: MUTE });
  text('示意', cx + cw - 22, cy + ch + 40, { size: 18, color: DIM, align: 'right' });
  ctx.restore();
}

// ───────── 场景 3：哈希环 ─────────
const SRV4 = [[12, 0], [37, 1], [61, 2], [84, 3]];
function sceneRing(lt, d) {
  header(lt, '03', '哈希环', SC[0], '把哈希空间首尾相连');
  const g = eOut(P(lt, 0.6, 3.0));
  ringBase(g);
  const [tx, ty] = rp(0, RC.R + 66);
  const la = eOut(P(lt, 2.4, 3.2));
  text('0', tx + 18, ty + 8, { size: 26, weight: 700, color: SC[0], font: MONO, a: la });
  text('2¹⁶⁰−1', tx - 18, ty + 8, { size: 26, weight: 700, color: SC[2], font: MONO, align: 'right', a: la });
  const [jx, jy] = rp(0);
  dot(jx, jy, 8 + Math.sin(lt * 4) * 2, '#fff', { g: 28, a: la });
  text('哈希环', RC.x, RC.y - 6, { size: 58, weight: 800, align: 'center', a: eOut(P(lt, 1.2, 2)) });
  text('示意：空间 0 – 99', RC.x, RC.y + 38, { size: 24, color: MUTE, align: 'center', a: eOut(P(lt, 1.2, 2)) });
  SRV4.forEach(([pos, i], k) => {
    const t0 = 4.0 + k * 1.1, p = P(lt, t0, t0 + 0.7);
    if (p > 0 && p < 0.5) { const rr_ = eOut(p * 2); const [x, y] = rp(pos); ctx.save(); ctx.strokeStyle = SC[i]; ctx.globalAlpha = 1 - rr_; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, 30 + rr_ * 70, 0, 7); ctx.stroke(); ctx.restore(); }
    srvNode(pos, SC[i], `s${i}`, { s: eBack(p), a: clamp(p * 3) });
  });
  const ba = eOut(P(lt, 1.0, 1.8));
  ctx.save(); ctx.globalAlpha *= ba;
  text('① 空间两端接在一起，就是一个环', 110, 430, { size: 30, weight: 600 });
  ctx.restore();
  const bb = eOut(P(lt, 3.6, 4.4));
  text('② 服务器：hash(IP 或名称) 决定落点', 110, 500, { size: 30, weight: 600, a: bb });
  const ta = eOut(P(lt, 9.2, 10));
  if (ta > 0) {
    text('实际实现：一张按哈希排序的表', 110, 600, { size: 24, color: MUTE, a: ta });
    SRV4.forEach(([pos, i], k) => {
      const x = 110 + k * 160; glass(x, 624, 140, 84, { a: ta, accent: SC[i], r: 16 });
      text(String(pos), x + 70, 664, { size: 30, weight: 800, align: 'center', font: MONO, a: ta });
      text(`s${i}`, x + 70, 696, { size: 22, color: SC[i], align: 'center', font: MONO, weight: 700, a: ta });
    });
    text('环只是一种「沿表往后找」的说法', 110, 750, { size: 22, color: DIM, a: ta });
  }
}

// ───────── 场景 4：顺时针找负责人 ─────────
const LK = [[25, 'k1'], [50, 'k2'], [72, 'k3'], [95, 'k4']];
function sceneLookup(lt, d) {
  header(lt, '04', '顺时针找服务器', SC[2], '第一台遇到的，就是负责人');
  ringBase(1);
  SRV4.forEach(([pos, i]) => srvNode(pos, SC[i], `s${i}`));
  const lines = [];
  LK.forEach(([pos, name], k) => {
    const t0 = 1.0 + k * 2.15, oi = owner(pos, SRV4), spos = SRV4.find((s) => s[1] === oi)[0];
    const drop = eOut(P(lt, t0, t0 + 0.5)), sw = eIO(P(lt, t0 + 0.6, t0 + 1.7));
    if (drop <= 0) return;
    const done = lt > t0 + 1.7;
    if (!done) {
      keyDot(pos, '#ffffff', { r: 11, a: drop, rad: lerp(RC.R + 120, RC.R, drop), label: `${name}·${pos}` });
      if (sw > 0) sweep(pos, spos, SC[oi], sw);
    } else {
      const [kx, ky] = rp(pos, RC.R - 46), [sx, sy] = rp(spos, RC.R - 30);
      ctx.save(); ctx.strokeStyle = SC[oi] + '77'; ctx.lineWidth = 2; ctx.setLineDash([6, 7]);
      ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(sx, sy); ctx.stroke(); ctx.restore();
      keyDot(pos, SC[oi], { r: 11, rad: RC.R - 46, label: `${name}·${pos}`, lab: 'in' });
      const pulse = P(lt, t0 + 1.7, t0 + 2.3);
      if (pulse < 1) { const [x, y] = rp(spos); ctx.save(); ctx.strokeStyle = SC[oi]; ctx.globalAlpha = 1 - pulse; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 34 + pulse * 50, 0, 7); ctx.stroke(); ctx.restore(); }
    }
    const la = eOut(P(lt, t0 + 1.5, t0 + 2.1));
    lines.push([name, pos, oi, la, k === 3]);
  });
  lines.forEach(([name, pos, oi, la, wrap], k) => {
    const y = 420 + k * 84;
    glass(110, y, 640, 66, { a: la, accent: SC[oi], r: 18 });
    text(`${name}  hash=${pos}`, 138, y + 43, { size: 28, font: MONO, weight: 700, a: la });
    text(wrap ? '越过 0 绕回 → ' : '→ ', 372, y + 43, { size: 26, color: MUTE, a: la });
    text(`s${oi}`, wrap ? 610 : 440, y + 43, { size: 30, color: SC[oi], font: MONO, weight: 800, a: la });
  });
  const na = eOut(P(lt, 9.2, 10));
  text('实现：二分查找第一个 ≥ hash 的节点', 110, 790, { size: 24, color: MUTE, a: na });
}

// ───────── 场景 5、6：新增 / 移除 ─────────
const KR = [5, 18, 25, 31, 36, 41, 46, 49, 55, 58, 66, 72, 79, 88, 93];
const modMoved = KR.filter((h) => h % 4 !== h % 5).length;
function ringKeys(srvs, { fade = null, color = null } = {}) {
  KR.forEach((p) => {
    const o = owner(p, srvs);
    const f = fade ? fade(p) : { a: 1, c: SC[o] };
    keyDot(p, f.c || SC[o], { r: 10, a: f.a, rad: RC.R });
  });
}
function sceneAdd(lt, d) {
  header(lt, '05', '新增一台服务器', SC[4], '只搬一小段');
  ringBase(1);
  SRV4.forEach(([pos, i]) => srvNode(pos, SC[i], `s${i}`, { a: 1 }));
  const affected = (p) => p > 37 && p <= 50;
  const tNew = 1.6, pn = P(lt, tNew, tNew + 0.8);
  const band = eOut(P(lt, 3.0, 3.8));
  const mv = (p) => eIO(P(lt, 4.6 + (p - 41) * 0.05, 5.4 + (p - 41) * 0.05));
  const srvs = SRV4.concat(pn > 0 ? [[50, 4]] : []);
  ringKeysAdd(lt, srvs, affected, band, mv);
  if (band > 0) {
    arcBand(37, 50, RC.R + 20, SC[4], 14, band * 0.9);
    const [lx, ly] = rp(43.5, RC.R + 96);
    text('(s1, s4]', lx, ly + 8, { size: 28, weight: 800, color: SC[4], font: MONO, align: 'center', a: band });
  }
  if (pn > 0) {
    const pop = eBack(pn); const [x, y] = rp(50);
    if (pn < 0.6) { ctx.save(); ctx.strokeStyle = SC[4]; ctx.globalAlpha = 1 - pn / 0.6; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 30 + pn * 150, 0, 7); ctx.stroke(); ctx.restore(); }
    srvNode(50, SC[4], 's4', { s: pop, a: clamp(pn * 3) });
  }
  const a1 = eOut(P(lt, 1.8, 2.5));
  text('s4 落在 s1 与 s2 之间', 110, 430, { size: 30, weight: 600, a: a1 });
  const a2 = eOut(P(lt, 3.4, 4.2));
  text('只有 s4 与前驱之间的 key 转给 s4', 110, 490, { size: 30, weight: 600, a: a2 });
  const n = Math.round(3 * P(lt, 5.0, 6.0));
  const a3 = eOut(P(lt, 5.0, 5.8));
  if (a3 > 0) {
    glass(110, 560, 640, 220, { a: a3, r: 24 });
    text('搬家的 key（共 15 个）', 140, 606, { size: 22, color: MUTE, a: a3 });
    const full = 560, wC = (n / 15) * full, wM = (modMoved / 15) * full * eOut(P(lt, 6.0, 7.2));
    text('一致性哈希', 140, 660, { size: 24, weight: 600, a: a3 }); text(`${n}`, 722, 660, { size: 28, weight: 800, font: MONO, color: SC[4], align: 'right', a: a3 });
    ctx.fillStyle = SC[4]; glow(SC[4], 14); rr(140, 674, Math.max(wC, 8), 16, 8); ctx.fill(); ctx.shadowBlur = 0;
    const ma = eOut(P(lt, 6.0, 6.8));
    text('hash % N', 140, 738, { size: 24, weight: 600, a: ma }); text(`${Math.round(modMoved * P(lt, 6.0, 7.2))}`, 722, 738, { size: 28, weight: 800, font: MONO, color: RED, align: 'right', a: ma });
    ctx.fillStyle = RED; glow(RED, 14); rr(140, 752, Math.max(wM, 8) * (ma > 0 ? 1 : 0), 16, 8); ctx.fill(); ctx.shadowBlur = 0;
  }
}
function ringKeysAdd(lt, srvs, affected, band, mv) {
  KR.forEach((p) => {
    const o = owner(p, srvs), old = owner(p, SRV4);
    let a = 1, col = SC[old];
    if (affected(p)) {
      const m = mv(p); col = m > 0.5 ? SC[4] : SC[old];
      const [x, y] = rp(p, RC.R); const fl = P(lt, 4.3, 4.6 + (p - 41) * 0.05);
      if (m > 0 && m < 1) { ctx.save(); ctx.strokeStyle = SC[4]; ctx.lineWidth = 3; ctx.globalAlpha = 1 - m; ctx.beginPath(); ctx.arc(x, y, 14 + m * 30, 0, 7); ctx.stroke(); ctx.restore(); }
      keyDot(p, col, { r: 10 + Math.sin(m * Math.PI) * 5 });
    } else keyDot(p, col, { a: 1 - band * 0.62 });
    void o;
  });
}
function sceneRemove(lt, d) {
  header(lt, '06', '移除一台服务器', RED, '交给顺时针的下一台');
  ringBase(1);
  const tD = 1.8, pd = P(lt, tD, tD + 1.0), dead = lt > tD;
  const band = eOut(P(lt, 2.6, 3.4));
  if (band > 0) { arcBand(12, 37, RC.R + 20, RED, 14, band * 0.85); const [lx, ly] = rp(24.5, RC.R + 96); text('(s0, s1]', lx, ly + 8, { size: 28, weight: 800, color: RED, font: MONO, align: 'center', a: band }); }
  SRV4.forEach(([pos, i]) => {
    if (i === 1) { if (pd < 1) srvNode(pos, SC[1], 's1', { s: 1 - eIO(pd) * 0.35, a: 1 - eIO(P(lt, tD + 0.3, tD + 1.2)), dead: lt > tD - 0.2 && lt < tD + 0.4 ? 1 : 0 }); }
    else srvNode(pos, SC[i], `s${i}`);
  });
  const rest = SRV4.filter((s) => s[1] !== 1);
  KR.forEach((p) => {
    const old = owner(p, SRV4);
    if (old === 1) {
      const t0 = 4.2 + (p - 18) * 0.045, m = eIO(P(lt, t0, t0 + 1.6));
      const pos = lerp(p, 61, m);
      if (m > 0 && m < 1) { const [x, y] = rp(pos); const bx = rp(p)[0]; }
      keyDot(pos, m > 0.7 ? SC[2] : SC[1], { r: 10 + Math.sin(m * Math.PI) * 4, a: 1 - 0.35 * 0 });
    } else keyDot(p, SC[old], { a: 1 - band * 0.62 });
  });
  const a1 = eOut(P(lt, 1.8, 2.6)); text('s1 下线', 110, 430, { size: 30, weight: 600, a: a1 });
  const a2 = eOut(P(lt, 3.8, 4.6)); text('它的 key 顺时针交给 s2', 110, 490, { size: 30, weight: 600, a: a2 });
  const a3 = eOut(P(lt, 6.0, 6.8));
  glass(110, 560, 640, 120, { a: a3, accent: SC[2] });
  text('搬家的 key', 140, 606, { size: 22, color: MUTE, a: a3 });
  text('4 / 15', 140, 656, { size: 44, weight: 800, font: MONO, color: SC[2], a: a3 });
  text('其余原地不动', 330, 656, { size: 28, color: MUTE, a: a3 });
  const a4 = eOut(P(lt, 7.4, 8.2));
  glass(110, 720, 640, 120, { a: a4, accent: '#8b8dfc' });
  text('记忆口诀', 140, 766, { size: 22, color: MUTE, a: a4 });
  text('找负责人看顺时针 · 找区间看前驱', 140, 812, { size: 28, weight: 700, a: a4 });
}

// ───────── 场景 7、8：不均匀 → 虚拟节点 ─────────
const SALT = 'n8-';
function vnodes(v) {
  const pts = []; for (let s = 0; s < 3; s++) for (let j = 0; j < v; j++) pts.push([hash32(SALT + s + '#' + j), s]);
  pts.sort((a, b) => a[0] - b[0]);
  const share = [0, 0, 0], segs = [];
  pts.forEach((p, i) => { const prev = pts[(i + pts.length - 1) % pts.length][0]; let len = p[0] - prev; if (len <= 0) len += 100; share[p[1]] += len; segs.push([prev, p[0], p[1]]); });
  const m = 100 / 3, sd = Math.sqrt(share.reduce((a, b) => a + (b - m) ** 2, 0) / 3);
  return { pts, segs, share, sd };
}
const VN = { 1: vnodes(1), 4: vnodes(4), 16: vnodes(16), 64: vnodes(64) };
function bars(x, y, shares, a, { max = 100, w = 440, label = true } = {}) {
  shares.forEach((s, i) => {
    const yy = y + i * 62;
    text(`s${i}`, x, yy + 30, { size: 26, weight: 800, color: SC[i], font: MONO, a });
    ctx.save(); ctx.globalAlpha *= a; rr(x + 56, yy + 8, w, 30, 15); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.fillStyle = SC[i]; glow(SC[i], 14); rr(x + 56, yy + 8, Math.max(30, (s / max) * w), 30, 15); ctx.fill(); ctx.restore();
    text(`${s.toFixed(0)}%`, x + 56 + w + 22, yy + 33, { size: 26, weight: 700, font: MONO, a });
  });
}
function ringSegs(segs, a, thick = 18) { segs.forEach(([p, q, s]) => arcBand(p, q, RC.R, SC[s], thick, a * 0.95, 10)); }
function sceneSkew(lt, d) {
  header(lt, '07', '位置不均的问题', SC[3], '随机落点，地盘有大有小');
  ringBase(1, 0.5);
  const v1 = VN[1], ea = eOut(P(lt, 2.6, 4.0));
  ringSegs(v1.segs, ea, 20);
  v1.pts.forEach(([pos, s], k) => { const p = P(lt, 0.8 + k * 0.5, 1.5 + k * 0.5); srvNode(pos, SC[s], `s${s}`, { s: eBack(p), a: clamp(p * 3) }); });
  for (let i = 0; i < 160; i++) { const kp = rnd(i + 200) * 100; const o = owner(kp, v1.pts.map((p) => [p[0], p[1]])); const a = eOut(P(lt, 4.0 + i * 0.012, 4.6 + i * 0.012)); keyDot(kp, SC[o], { r: 3.5, a: a * 0.9, rad: RC.R - 34 - rnd(i) * 40 }); }
  const bs = v1.share.map((s) => s * eOut(P(lt, 4.6, 6.4)));
  const ba = eOut(P(lt, 4.4, 5.2));
  text('每台机器负责的 key 占比', 110, 430, { size: 24, color: MUTE, a: ba });
  bars(110, 450, bs, ba);
  const mx = Math.max(...v1.share), mn = Math.min(...v1.share);
  const ra = eOut(P(lt, 7.0, 7.8));
  glass(110, 680, 640, 130, { a: ra, accent: RED });
  text('最忙 ÷ 最闲', 140, 726, { size: 22, color: MUTE, a: ra });
  text(`${(mx / mn).toFixed(1)} 倍`, 140, 782, { size: 52, weight: 800, font: MONO, color: RED, a: ra });
}
function sceneVnode(lt, d) {
  header(lt, '08', '虚拟节点', SC[0], '一台机器，多个位置');
  ringBase(1, 0.35);
  const steps = [[1, 0.7], [4, 3.2], [16, 5.6], [64, 8.0]];
  let cur = steps[0][0], prevV = 1, tS = 0.7;
  steps.forEach(([v, t0]) => { if (lt >= t0) { prevV = cur; cur = v; tS = t0; } });
  const tr = eIO(P(lt, tS, tS + 0.9));
  const draw = (v, a) => { if (a <= 0) return; ringSegs(VN[v].segs, a, v >= 64 ? 22 : 20);
    VN[v].pts.forEach(([pos, s]) => { const [x, y] = rp(pos); const rad = v >= 64 ? 4.5 : v >= 16 ? 6.5 : v >= 4 ? 9 : 15; ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = '#0a0d18'; ctx.strokeStyle = SC[s]; ctx.lineWidth = v >= 16 ? 2 : 4; ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore(); }); };
  if (tr < 1 && prevV !== cur) draw(prevV, 1 - tr);
  draw(cur, prevV !== cur ? tr : 1);
  const sh = VN[cur].share.map((s, i) => lerp(VN[prevV].share[i], s, prevV !== cur ? tr : 1));
  const sd = lerp(VN[prevV].sd, VN[cur].sd, prevV !== cur ? tr : 1);
  text('每台服务器的虚拟节点数', 110, 392, { size: 24, color: MUTE, a: eOut(P(lt, 0.4, 1)) });
  steps.forEach(([v, t0], k) => {
    const on = cur === v, x = 110 + k * 128;
    glass(x, 410, 112, 70, { r: 18, accent: on ? '#34d5c8' : null, fill: on ? 0.14 : 0.04, a: eOut(P(lt, 0.4, 1)) });
    text(`×${v}`, x + 56, 456, { size: 32, weight: 800, align: 'center', font: MONO, color: on ? INK : DIM, a: eOut(P(lt, 0.4, 1)) });
  });
  bars(110, 520, sh, eOut(P(lt, 0.6, 1.4)));
  const sa = eOut(P(lt, 0.8, 1.6));
  glass(110, 770, 640, 110, { a: sa, accent: SC[0] });
  text('偏离平均值（标准差）', 140, 814, { size: 22, color: MUTE, a: sa });
  text(`σ = ${sd.toFixed(1)}`, 140, 862, { size: 44, weight: 800, font: MONO, color: sd < 3 ? SC[4] : sd < 8 ? SC[3] : RED, a: sa });
  if (lt > 9.6) text('容量大的机器 → 分更多虚拟节点', RC.x, RC.y + 12, { size: 28, color: MUTE, align: 'center', weight: 600, a: eOut(P(lt, 9.6, 10.4)) });
}

// ───────── 场景 9：热点 key ─────────
function sceneHot(lt, d) {
  header(lt, '09', '热门 key 仍是难题', RED, '数据均匀 ≠ 访问均匀');
  const bx = 860, by = 420, bw = 150, bh = 190, gap = 48;
  for (let i = 0; i < 4; i++) {
    const x = bx + i * (bw + gap), a = eOut(P(lt, 0.5 + i * 0.1, 1.2 + i * 0.1));
    glass(x, by + 120, bw, bh, { accent: SC[i], a });
    text(`s${i}`, x + bw / 2, by + 168, { size: 30, weight: 800, color: SC[i], align: 'center', font: MONO, a });
    text('25% key', x + bw / 2, by + 214, { size: 22, color: MUTE, align: 'center', a: a * eOut(P(lt, 1.6, 2.2)) });
  }
  const load = (i) => (i === 2 ? 0.62 : 0.127), lp = eOut(P(lt, 5.4, 7));
  const flame = eOut(P(lt, 3.8, 4.6));
  if (flame > 0) {
    const hx = bx + 2 * (bw + gap) + bw / 2, hy = by - 70;
    text('🔥', hx, hy + 12, { size: 64, align: 'center', a: flame });
    text('热门 key', hx, hy + 62, { size: 24, weight: 700, color: RED, align: 'center', a: flame });
    for (let k = 0; k < 40; k++) {
      const u = ((lt * 0.9 + k / 40) % 1), x = hx + Math.sin(k * 1.7) * 26 * (1 - u * 0.4), y = lerp(hy + 70, by + 120, u);
      dot(x, y, 4, RED, { g: 12, a: flame * Math.sin(u * Math.PI) * 0.9 });
    }
    for (let i of [0, 1, 3]) { const x = bx + i * (bw + gap) + bw / 2; for (let k = 0; k < 4; k++) { const u = ((lt * 0.5 + k / 4 + i * 0.13) % 1); dot(x, lerp(by + 60, by + 120, u), 3, DIM, { g: 0, a: flame * Math.sin(u * Math.PI) * 0.7 }); } }
  }
  if (lp > 0) for (let i = 0; i < 4; i++) {
    const x = bx + i * (bw + gap), hgt = (bh - 120) * load(i) / 0.62 * lp, c = i === 2 ? RED : DIM;
    ctx.save(); ctx.fillStyle = c; glow(i === 2 ? RED : 'transparent', 20); rr(x + 20, by + 120 + bh - 16 - hgt, bw - 40, hgt, 8); ctx.fill(); ctx.restore();
    text(`${Math.round(load(i) * 100 * lp)}% 请求`, x + bw / 2, by + 120 + bh + 38, { size: 22, color: i === 2 ? RED : MUTE, align: 'center', weight: 700, a: lp });
  }
  const sa = eOut(P(lt, 8.0, 8.8));
  text('解决办法在业务层', 110, 430, { size: 30, weight: 700, a: sa });
  ['缓存多副本', '请求合并', '拆分热 key'].forEach((s, k) => badge(110, 470 + k * 74, s, [SC[0], SC[3], SC[2]][k], eOut(P(lt, 8.4 + k * 0.4, 9.2 + k * 0.4))));
}

// ───────── 场景 10：总结 ─────────
function sceneEnd(lt, d) {
  ctx.save(); ctx.globalAlpha *= 0.55;
  const old = RC.x; RC.x = 1640; RC.y = 235; const oR = RC.R; RC.R = 118;
  ringBase(1, 0.8); RC.x = old; RC.R = oR; RC.y = 520; ctx.restore();
  text('一致性哈希', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Consistent Hashing', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['环', '哈希空间首尾相连', SC[0]], ['顺时针', '第一台遇到的服务器负责', SC[2]], ['虚拟节点', '一机多位，分布更匀', SC[3]]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.5, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 70, weight: 800 });
    text(s, x + 36, 620, { size: 26, color: MUTE });
    ctx.restore();
  });
  const aa = eOut(P(lt, 6.0, 6.8));
  text('用过类似思路的系统', 110, 750, { size: 24, color: MUTE, a: aa });
  let bx = 110;
  ['Amazon DynamoDB', 'Apache Cassandra', 'Discord', 'Akamai CDN'].forEach((s, k) => { bx += badge(bx, 780, s, '#8b8dfc', eOut(P(lt, 6.2 + k * 0.25, 7 + k * 0.25))) + 16; });
  text('相关系统示例，具体实现各有差异', 110, 880, { size: 20, color: DIM, a: eOut(P(lt, 7.2, 8)) });
}

// ───────── 片头 ─────────
function sceneTitle(lt, d) {
  const a = eOut(P(lt, 0.2, 1.2));
  ctx.save(); ctx.globalAlpha *= 0.9;
  RC.x = 1380; RC.y = 540; RC.R = 330; ringBase(eOut(P(lt, 0.3, 2.2)), 1);
  SRV4.forEach(([pos, i], k) => { const p = P(lt, 1.6 + k * 0.35, 2.2 + k * 0.35); srvNode(pos + lt * 1.2 - lt * 1.2, SC[i], `s${i}`, { s: eBack(p), a: clamp(p * 3), hashLabel: false }); });
  for (let i = 0; i < 18; i++) { const pos = (i * 5.7 + lt * 4) % 100; const o = owner(pos, SRV4); keyDot(pos, SC[o], { r: 5, a: eOut(P(lt, 2.5 + i * 0.05, 3 + i * 0.05)) * 0.9, rad: RC.R - 50 }); }
  ctx.restore(); RC.x = 1250; RC.y = 520; RC.R = 300;
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 0.4, 1.4)); ctx.translate(0, (1 - eOut(P(lt, 0.4, 1.4))) * 30);
  ctx.font = `900 150px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('一致性哈希', 104, 520); ctx.restore();
  text('Consistent Hashing', 112, 590, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 5 章', 112, 680, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}


export const meta = { no: 5, title: '一致性哈希', en: 'Consistent Hashing' };
export const scenes = { title: sceneTitle, mod: sceneMod, rehash: sceneRehash, ring: sceneRing, lookup: sceneLookup, add: sceneAdd, remove: sceneRemove, skew: sceneSkew, vnode: sceneVnode, hot: sceneHot, end: sceneEnd };
