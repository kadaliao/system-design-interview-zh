// 第 9 章 网络爬虫：场景定义（外壳与工具来自 ../lib/core.js）
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, bullet, statCard, hbar, dbIcon } from '../lib/core.js';

export const meta = { no: 9, title: '网络爬虫', en: 'Web Crawler' };

// 角色配色（全片统一）：待抓队列=靛 · 下载=青 · 解析/提取/过滤=琥珀 · 去重关卡=粉 · 存储/新增=青柠
const C_FR = SC[1], C_DL = SC[0], C_PA = SC[3], C_DD = SC[2], C_ST = SC[4];

const fd = (lt, a, b = 0.6) => eOut(P(lt, a, a + b));

// ───────── 通用小组件 ─────────
function node(n, a = 1, { s = 1, hot = false, plus = 0 } = {}) {
  if (a <= 0 || s <= 0) return;
  const cx = n.x + n.w / 2, cy = n.y + n.h / 2, col = hot ? RED : n.c;
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s); ctx.translate(-cx, -cy);
  glass(n.x, n.y, n.w, n.h, { accent: col });
  ctx.fillStyle = col; glow(col, 14); rr(n.x + 24, n.y, n.w - 48, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
  text(n.l, cx, n.sub ? cy - 2 : cy + 10, { size: n.size || 28, weight: 700, align: 'center' });
  if (n.sub) text(n.sub, cx, cy + 30, { size: 20, align: 'center', color: MUTE, font: MONO });
  if (plus > 0) text(`+${plus}`, n.x + n.w, n.y - 10, { size: 24, weight: 800, align: 'right', color: C_ST, font: MONO });
  ctx.restore();
}
function pill(cx, cy, label, color, { a = 1, s = 1, size = 20, fill = '30' } = {}) {
  if (a <= 0 || s <= 0) return 0;
  ctx.save(); ctx.font = `700 ${size}px ${MONO}`; const w = ctx.measureText(label).width + 28, h = size + 16; ctx.restore();
  ctx.save(); ctx.globalAlpha *= a; ctx.translate(cx, cy); ctx.scale(s, s);
  glow(color, 10); rr(-w / 2, -h / 2, w, h, 10); ctx.fillStyle = color + fill; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke(); ctx.shadowBlur = 0;
  text(label, 0, size * 0.35, { size, weight: 700, align: 'center', font: MONO });
  ctx.restore(); return w;
}
function along(pts, p) {
  const L = [], tot = pts.slice(1).reduce((s, q, i) => { const l = Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]); L.push(l); return s + l; }, 0);
  let d = clamp(p) * tot;
  for (let i = 0; i < L.length; i++) { if (d <= L[i] || i === L.length - 1) { const u = L[i] ? d / L[i] : 0; return [lerp(pts[i][0], pts[i + 1][0], u), lerp(pts[i][1], pts[i + 1][1], u)]; } d -= L[i]; }
}
function runner(pts, p, color, { a = 1, r = 10 } = {}) {
  if (p <= 0 || p >= 1) return;
  for (let k = 5; k >= 0; k--) { const [x, y] = along(pts, clamp(p - k * 0.012)); dot(x, y, r * (1 - k * 0.1), color, { g: k ? 0 : 20, a: a * (1 - k / 6) * 0.9 }); }
}
function link(x1, y1, x2, y2, p, color = '#8f98b0', a = 1) { arrow(x1, y1, x2, y2, { color, p, a, w: 3.5, head: 13 }); }
function stripe(x, y, w, color, a = 1) { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = color; glow(color, 14); rr(x, y, w, 5, 3); ctx.fill(); ctx.restore(); }
function ringProgress(cx, cy, r, p, color, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineCap = 'round'; glow(color, 10); ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke(); ctx.restore();
}

// ───────── 流水线节点布局（3×3 环形，中间 B2 放存储） ─────────
const NW = 230, NH = 96, CX = [830, 1180, 1530], RY = [230, 440, 700];
const N = {
  seed: { x: 850, y: 150, w: 190, h: 56, c: INK, l: '种子 URL', size: 24 },
  fr: { x: CX[0], y: RY[0], w: NW, h: NH, c: C_FR, l: 'URL Frontier', sub: '待抓队列', size: 27 },
  dl: { x: CX[1], y: RY[0], w: NW, h: NH, c: C_DL, l: '下载器', sub: 'HTML Downloader' },
  dns: { x: 1190, y: 150, w: 210, h: 56, c: C_DL, l: 'DNS 解析器', size: 24 },
  pa: { x: CX[2], y: RY[0], w: NW, h: NH, c: C_PA, l: '内容解析器', sub: 'Content Parser' },
  cs: { x: CX[2], y: RY[1], w: NW, h: NH, c: C_DD, l: '内容已见？', sub: 'Content Seen?' },
  st: { x: CX[1], y: RY[1], w: NW, h: NH, c: C_ST, l: '内容存储', sub: 'Storage' },
  ex: { x: CX[2], y: RY[2], w: NW, h: NH, c: C_PA, l: '链接提取器', sub: 'URL Extractor' },
  fl: { x: CX[1], y: RY[2], w: NW, h: NH, c: C_PA, l: 'URL 过滤器', sub: 'URL Filter' },
  us: { x: CX[0], y: RY[2], w: NW, h: NH, c: C_DD, l: 'URL 已见？', sub: 'URL Seen?' },
};
const mid = (n) => [n.x + n.w / 2, n.y + n.h / 2];
const FAINT = 0.22;

// ───────── 场景 1：流水线 ─────────
function scenePipe(lt, d) {
  header(lt, '01', '循环流水线', C_DL, '从种子出发，抓、解析、存储');
  const base = fd(lt, 0.9, 0.8) * FAINT;
  const t = { seed: 4.0, fr: 4.3, dl: 7.4, dns: 9.9, pa: 14.7, cs: 15.9, st: 17.2 };
  const al = (k, extra = 1) => Math.max(base, fd(lt, t[k], 0.6)) * extra;
  ['seed', 'fr', 'dl', 'dns', 'pa', 'cs', 'st'].forEach((k) => node(N[k], al(k), { s: lerp(0.9, 1, fd(lt, t[k], 0.6)) }));
  ['ex', 'fl', 'us'].forEach((k) => node(N[k], base));
  // 余下回路的虚线暗示「这是一个环」
  const ha = base * 1.3;
  link(1645, 536, 1645, 700, 1, DIM, ha); link(1530, 748, 1410, 748, 1, DIM, ha); link(1180, 748, 1060, 748, 1, DIM, ha); link(945, 700, 945, 326, 1, DIM, ha);
  // 连线
  link(940, 206, 940, 230, fd(lt, 4.0, 0.4), INK, 0.8);
  link(1060, 278, 1180, 278, eOut(P(lt, 7.2, 7.8)), C_FR);
  link(1295, 206, 1295, 230, eOut(P(lt, 9.7, 10.2)), C_DL);
  link(1410, 278, 1530, 278, eOut(P(lt, 14.4, 14.9)), C_DL);
  link(1645, 326, 1645, 440, eOut(P(lt, 15.6, 16.1)), C_PA);
  link(1530, 488, 1410, 488, eOut(P(lt, 17.0, 17.5)), C_ST);
  text('新内容', 1470, 468, { size: 20, color: MUTE, align: 'center', a: fd(lt, 17.2, 0.4) });
  // 种子进队
  runner([[945, 178], [945, 270]], eIO(P(lt, 4.1, 5.0)), INK, { r: 9 });
  // 取出 → 下载器
  runner([[1060, 278], [1180, 278]], eIO(P(lt, 7.6, 8.4)), INK, { r: 9 });
  // DNS 往返
  const dnsP = P(lt, 9.9, 12.0);
  if (dnsP > 0) {
    const pu = Math.sin(clamp(dnsP * 2.4, 0, 1) * Math.PI);
    ctx.save(); ctx.globalAlpha *= 0.9; ctx.strokeStyle = C_DL; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.arc(1295, 178, 36 + pu * 22, 0, 7); ctx.globalAlpha *= 0.5 * (1 - clamp(dnsP * 2.4)); ctx.stroke(); ctx.restore();
    text('主机名 → IP', 1420, 190, { size: 22, color: C_DL, weight: 700, a: fd(lt, 10.4, 0.5) * (1 - fd(lt, 13.0, 0.6)) });
  }
  // 下载页面：页面卡片从下载器弹出，进入解析器
  const pg = P(lt, 13.2, 14.4);
  if (pg > 0) {
    const cx = lerp(1295, 1645, eIO(P(lt, 14.0, 14.9))), cy = 278;
    const gone = P(lt, 14.9, 15.4);
    if (gone < 1) {
      ctx.save(); ctx.globalAlpha *= (1 - gone); ctx.translate(cx, cy + (1 - eOut(pg)) * 10);
      rr(-22, -28, 44, 56, 8); ctx.fillStyle = '#eef1fa'; ctx.fill(); ctx.fillStyle = '#06080f';
      [-12, -2, 8].forEach((yy) => ctx.fillRect(-12, yy, 24, 4)); ctx.restore();
    }
  }
  // 解析后 → 内容已见 → 存储
  runner([[1645, 326], [1645, 440]], eIO(P(lt, 15.7, 16.4)), C_PA, { r: 9 });
  runner([[1530, 488], [1410, 488], [1295, 488]], eIO(P(lt, 17.1, 18.4)), C_ST, { r: 9 });
  if (lt > 18.4) { const k = eBack(P(lt, 18.3, 18.8)); ctx.save(); ctx.translate(1385, 488); ctx.scale(k * 0.6, k * 0.6); rr(-22, -28, 44, 56, 8); ctx.fillStyle = C_ST; glow(C_ST, 18); ctx.fill(); ctx.restore(); }
  // 左栏
  bullet(0, '种子：能走到更多链接的站点', fd(lt, 4.1), {});
  bullet(1, '下载器取 URL，DNS 找服务器', fd(lt, 9.9));
  bullet(2, '解析器丢弃无法处理的页面', fd(lt, 15.0));
  statCard(110, 690, 640, '目标规模（书中估算）', '10 亿页 / 月', { color: C_DL, a: fd(lt, 1.2, 0.8), note: '≈ 400 页/秒' });
}

// ───────── 场景 2：回流 ─────────
const LCH = [['a.com/news', 'ok'], ['spam.xx/', 'bad'], ['a.com/home', 'seen'], ['c.org/post', 'ok']];
const LLANE = [566, 603, 640, 677];
const lpath = (k) => [[1645, 556], [1645, LLANE[k]], [945, LLANE[k]], [945, 336]];
const lseg = (k) => { const y = LLANE[k]; return [0, y - 556, y - 556 + 350, y - 556 + 700, y - 556 + 700 + (y - 336)]; };
const LT = [1.2, 1.9, 6.0, 9.2, 12.4];
const lt0 = (k, i) => LT[i] + 0.5 * k;
function chipP(lt, k) {
  const S = lseg(k); let s = 0;
  for (let i = 0; i < 4; i++) {
    const a = lt0(k, i), b = lt0(k, i + 1);
    if (lt >= b) s = S[i + 1]; else { if (lt >= a) s = lerp(S[i], S[i + 1], i <= 1 ? P(lt, a, b) : eIO(P(lt, a, b))); break; }
  }
  return s / S[4];
}
function sceneLoop(lt, d) {
  header(lt, '02', '新链接回流', C_PA, '一个循环，滚出一张网');
  const plus = (lt > 12.9) + (lt > 14.4);
  ['seed', 'fr', 'dl', 'dns', 'pa', 'cs', 'st', 'ex', 'fl', 'us'].forEach((k) => node(N[k], k === 'seed' || k === 'dns' || k === 'st' ? 0.3 : 1, { plus: k === 'fr' ? plus : 0 }));
  link(940, 206, 940, 230, 1, DIM, 0.3);
  link(1060, 278, 1180, 278, 1, C_FR, 0.8); link(1410, 278, 1530, 278, 1, C_DL, 0.8); link(1645, 326, 1645, 440, 1, C_PA, 0.8);
  link(1530, 488, 1410, 488, 1, C_ST, 0.35);
  link(1645, 536, 1645, 700, 1, C_PA, 0.8); link(1530, 748, 1410, 748, 1, C_PA, 0.8); link(1180, 748, 1060, 748, 1, C_DD, 0.8);
  link(945, 700, 945, 336, 1, C_FR, 0.8);
  text('回流', 962, 520, { size: 22, color: C_FR, weight: 700 });
  const pa = fd(lt, 0.7, 0.6) * (1 - fd(lt, 2.6, 0.6));
  if (pa > 0) text('页面里的链接 ×4', 1400, 586, { size: 22, color: MUTE, align: 'center', a: pa });
  LCH.forEach(([label, kind], k) => {
    const vis = fd(lt, lt0(k, 0) - 0.3, 0.3); if (vis <= 0) return;
    const p = chipP(lt, k), [x, y] = along(lpath(k), p);
    let death = 0;
    if (kind === 'bad') death = eOut(P(lt, lt0(k, 2) + 0.1, lt0(k, 2) + 0.9));
    if (kind === 'seen') death = eOut(P(lt, lt0(k, 3) + 0.1, lt0(k, 3) + 0.9));
    if (death > 0) {
      const col = kind === 'bad' ? RED : MUTE;
      pill(x, y - death * 20, label, col, { a: (1 - death) * vis });
      text(kind === 'bad' ? '丢弃' : '已见', x, y - 34 - death * 20, { size: 22, weight: 800, color: col, align: 'center', a: 1 - death });
    } else if (kind === 'ok' && p >= 1) {
      const sink = eOut(P(lt, lt0(k, 4) + 0.1, lt0(k, 4) + 0.6)); pill(x, y, label, C_ST, { a: 1 - sink });
    } else pill(x, y, label, '#cfd6f0', { a: vis });
  });
  const fl = P(lt, 5.6, 8.6), us = P(lt, 9.0, 11.6);
  if (fl > 0 && fl < 1) text('黑名单 / 错误地址', N.fl.x + NW / 2, N.fl.y + NH + 32, { size: 22, color: RED, align: 'center', weight: 700, a: Math.sin(fl * Math.PI) });
  if (us > 0 && us < 1) text('见过的不再入队', N.us.x + NW / 2, N.us.y + NH + 32, { size: 22, color: MUTE, align: 'center', weight: 700, a: Math.sin(us * Math.PI) });
  bullet(0, '过滤：黑名单、错误 URL', fd(lt, 6.0));
  bullet(1, 'URL 去重：见过的不入队', fd(lt, 9.2));
  bullet(2, '新 URL 回到待抓队列', fd(lt, 12.6));
  const n = Math.round(lerp(2, 1280, eIO(P(lt, 16.4, 19.0))));
  statCard(110, 690, 640, '待抓 URL 数（示意）', lt < 15.8 ? '2' : n.toLocaleString('en-US'), { color: C_FR, a: fd(lt, 15.6, 0.7), note: lt > 18.6 ? '越滚越多' : '' });
}

// ───────── 场景 3：两道去重 ─────────
function sceneDedup(lt, d) {
  header(lt, '03', '为什么查两道', C_DD, '网址不同，内容可能相同');
  // 上：内容去重
  glass(800, 180, 1040, 330, { a: 1, accent: C_DD, fill: 0.03 });
  text('② 内容去重 · Content Seen?', 830, 218, { size: 24, weight: 700, color: C_DD, a: fd(lt, 0.8) });
  const rows = [{ y: 280, u: 'a.com/p?utm=1', tag: '跟踪参数', tt: 5.9 }, { y: 400, u: 'mirror.b.com/p', tag: '镜像站', tt: 7.9 }];
  rows.forEach((r, i) => {
    const t0 = 2.6 + i * 0.5;
    pill(955, r.y, r.u, '#cfd6f0', { a: fd(lt, t0), s: lerp(0.9, 1, fd(lt, t0)), size: 22 });
    if (lt > r.tt) {
      const hl = Math.sin(P(lt, r.tt, r.tt + 1.8) * Math.PI);
      pill(955, r.y, r.u, C_PA, { a: hl, size: 22 });
      text(r.tag, 955, r.y + 52, { size: 22, weight: 700, color: C_PA, align: 'center', a: hl });
    }
    // 页面哈希卡
    const pa = fd(lt, 4.0 + i * 0.4);
    glass(1180, r.y - 36, 240, 72, { a: pa, accent: C_DL }); text('页面', 1200, r.y + 8, { size: 22, color: MUTE, a: pa });
    text('9f3a', 1400, r.y + 10, { size: 32, weight: 800, font: MONO, color: C_DL, align: 'right', a: pa });
    link(1115, r.y, 1180, r.y, eOut(P(lt, 3.9 + i * 0.4, 4.4 + i * 0.4)), '#8f98b0', 1);
  });
  // 关卡
  const ga = fd(lt, 3.0);
  glass(1580, 230, 240, 220, { a: ga, accent: C_DD });
  stripe(1604, 230, 192, C_DD, ga);
  text('内容已见？', 1700, 300, { size: 26, weight: 700, align: 'center', a: ga });
  text('哈希表', 1700, 336, { size: 22, color: MUTE, align: 'center', a: ga });
  const rec = lt > 11.2;
  if (rec) { pill(1700, 380, '9f3a', C_ST, { s: eBack(P(lt, 11.2, 11.7)), size: 24 }); }
  // 数据包流向关卡
  [0, 1].forEach((i) => {
    const t0 = 9.8 + i * 1.6, p = P(lt, t0, t0 + 0.9);
    runner([[1420, rows[i].y], [1560, rows[i].y], [1580, 340]], eIO(p), C_DL);
  });
  if (lt > 11.2) {
    const k = fd(lt, 11.4, 0.5);
    pill(1700, 380, '9f3a', C_ST, { a: 0, size: 24 });
    ctx.save(); ctx.globalAlpha *= k; ctx.translate(1700, 425); ctx.rotate(-0.08);
    ctx.strokeStyle = RED; ctx.lineWidth = 3; rr(-80, -22, 160, 44, 8); ctx.stroke(); text('重复 · 丢弃', 0, 9, { size: 24, weight: 800, color: RED, align: 'center' }); ctx.restore();
  }
  if (lt > 10.7 && lt < 11.6) text('', 0, 0);
  // 下：URL 去重 + 时间
  const ba = fd(lt, 1.0);
  glass(800, 540, 1040, 340, { a: ba * (lt < 13 ? 0.45 : 1), accent: C_FR, fill: 0.03 });
  text('① URL 去重 · URL Seen?（已见网址记录）', 830, 578, { size: 24, weight: 700, color: C_FR, a: ba * (lt < 13 ? 0.55 : 1) });
  const hdr = fd(lt, 13.0, 0.6);
  text('网址 a.com/p', 830, 640, { size: 24, weight: 700, font: MONO, a: hdr });
  text('抓取时间', 1130, 640, { size: 22, color: MUTE, a: hdr }); text('内容哈希', 1400, 640, { size: 22, color: MUTE, a: hdr }); text('结果', 1620, 640, { size: 22, color: MUTE, a: hdr });
  const ln = (y, a) => { ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(830, y); ctx.lineTo(1810, y); ctx.stroke(); ctx.restore(); };
  ln(656, hdr);
  const r1 = fd(lt, 13.9), r2 = fd(lt, 15.4);
  text('第 1 次', 830, 716, { size: 24, color: INK, a: r1 }); text('10 月 1 日', 1130, 716, { size: 26, font: MONO, a: r1 }); text('9f3a', 1400, 716, { size: 28, font: MONO, weight: 800, color: C_DL, a: r1 }); text('入库', 1620, 716, { size: 26, color: C_ST, weight: 700, a: r1 });
  text('第 2 次', 830, 786, { size: 24, color: INK, a: r2 }); text('10 月 8 日', 1130, 786, { size: 26, font: MONO, a: r2 }); text('c71e', 1400, 786, { size: 28, font: MONO, weight: 800, color: C_PA, a: r2 }); text('内容变了，更新', 1620, 786, { size: 26, color: C_PA, weight: 700, a: r2 });
  const lk = fd(lt, 16.6, 0.6);
  if (lk > 0) { const ys = 640; ctx.save(); ctx.globalAlpha *= lk; ctx.strokeStyle = C_FR; ctx.lineWidth = 3; rr(1110, ys - 34, 200, 44, 10); ctx.stroke(); ctx.restore(); }
  text('日期为示意', 1810, 868, { size: 20, color: DIM, align: 'right', a: r1 });
  const bd = fd(lt, 19.6, 0.6);
  if (bd > 0) badge(830, 820, '已见 ≠ 永不再抓', C_FR, bd);
  // 左栏
  bullet(0, '网址不同 → 内容可能相同', fd(lt, 4.0));
  bullet(1, '内容去重：比对页面哈希', fd(lt, 11.0));
  bullet(2, '网址去重：记下抓取时间', fd(lt, 16.6));
  statCard(110, 690, 640, '网址去重省下载 · 内容去重省存储', '两道关', { color: C_DD, a: fd(lt, 12.0, 0.8), h: 112 }); // 文案较长，字号下面单独缩小
}

// ───────── 场景 4：Frontier 两层结构 ─────────
const FP = { top: [800, 180, 1040, 250], bot: [800, 490, 1040, 310] };
const fLane = (i) => 236 + i * 66, bLane = (i) => 570 + i * 72;
function sceneFrontier(lt, d) {
  header(lt, '04', 'URL Frontier', C_FR, '先抓谁 · 何时能抓');
  const split = fd(lt, 7.8, 0.8), one = 1 - split;
  // 阶段 1：整块
  if (one > 0) {
    const a = fd(lt, 1.0, 0.7) * one;
    node({ x: 1040, y: 380, w: 600, h: 190, c: C_FR, l: 'URL Frontier', sub: '待抓队列', size: 44 }, a);
    text('决定：先抓谁？什么时候能抓？', 1340, 620, { size: 28, color: MUTE, align: 'center', a: fd(lt, 4.6, 0.7) * one });
  }
  const topA = split * (lt < 13.0 ? 1 : lt < 17.0 ? 0.4 : 1) , botA = fd(lt, 8.4, 0.8) * (lt < 9.0 ? 1 : lt < 13.0 ? 0.4 : 1);
  const tA = split * (lt >= 9.3 && lt < 13.0 ? 1 : lt < 9.3 ? 0.8 : lt < 17.0 ? 0.4 : 1);
  const bA = split * (lt >= 13.0 && lt < 17.0 ? 1 : lt < 13.0 ? (lt < 9.3 ? 0.8 : 0.4) : 1);
  // 上层
  ctx.save(); ctx.globalAlpha *= tA;
  glass(FP.top[0], FP.top[1], FP.top[2], FP.top[3], { accent: C_PA, fill: 0.03 });
  text('前置队列 · 优先级', 830, 218, { size: 24, weight: 700, color: C_PA });
  node({ x: 820, y: 262, w: 190, h: 126, c: C_PA, l: 'Prioritizer', sub: '打分', size: 24 });
  [['f1', '高', 5], ['f2', '中', 3], ['f3', '低', 2]].forEach(([n, lv, cnt], i) => {
    const y = fLane(i) + 10;
    glass(1060, y, 440, 54, { r: 14, accent: C_PA, fill: 0.04 });
    text(`${n} ${lv}`, 1076, y + 36, { size: 22, weight: 700, font: MONO, color: C_PA });
    for (let k = 0; k < cnt; k++) { ctx.fillStyle = C_PA + (i === 0 ? 'ee' : i === 1 ? '99' : '55'); rr(1170 + k * 56, y + 12, 44, 30, 8); ctx.fill(); }
    link(1010, 325, 1058, y + 27, 1, DIM, 1);
    link(1500, y + 27, 1556, 300 + i * 25, 1, DIM, 1);
  });
  node({ x: 1560, y: 262, w: 240, h: 126, c: C_PA, l: '选择器', sub: '带权随机', size: 28 });
  ctx.restore();
  // 下层
  ctx.save(); ctx.globalAlpha *= bA;
  glass(FP.bot[0], FP.bot[1], FP.bot[2], FP.bot[3], { accent: C_FR, fill: 0.03 });
  text('后置队列 · 主机', 830, 528, { size: 24, weight: 700, color: C_FR });
  node({ x: 1580, y: 570, w: 220, h: 126, c: C_FR, l: 'Queue router', sub: '映射表', size: 24 });
  [['b1', 'a.com'], ['b2', 'b.com'], ['b3', 'c.org']].forEach(([n, host], i) => {
    const y = bLane(i);
    glass(1060, y, 440, 54, { r: 14, accent: C_FR, fill: 0.04 });
    text(`${n} ${host}`, 1076, y + 36, { size: 22, weight: 700, font: MONO, color: C_FR });
    for (let k = 0; k < 2 - (i === 1 ? 1 : 0) + (i === 2 ? 1 : 0); k++) { ctx.fillStyle = C_FR + '99'; rr(1250 + k * 56, y + 12, 44, 30, 8); ctx.fill(); }
    glass(830, y, 170, 54, { r: 14, accent: C_DL });
    text(`Worker ${i + 1}`, 915, y + 36, { size: 22, weight: 700, align: 'center', color: C_DL });
    link(1060, y + 27, 1004, y + 27, 1, DIM, 1);
    link(1580, 633, 1504, y + 27, 1, DIM, 1);
  });
  ctx.restore();
  link(1690, 388, 1690, 568, split, DIM, 0.8 * Math.min(tA, bA) * 2);
  // 一个网址穿过两层
  const path = [[905, 325], [1280, 273], [1680, 325], [1690, 633], [1280, 597], [915, 597]];
  const p = eIO(P(lt, 17.0, 20.6));
  if (p > 0 && p < 1) { const [x, y] = along(path, p); pill(x, y, 'a.com/x', INK, { size: 20, s: 1 }); }
  if (p >= 1) pill(915, 597, 'a.com/x', C_DL, { a: 1, size: 20 });
  bullet(0, '前置队列：谁更重要', fd(lt, 9.3));
  bullet(1, '后置队列：每主机一条', fd(lt, 13.2));
  bullet(2, '每个 URL 依次穿过两层', fd(lt, 18.4));
}

// ───────── 场景 5：礼貌 ─────────
const HOSTS = [['shop.com', 'b1'], ['news.org', 'b2'], ['blog.io', 'b3']];
const HY = [290, 400, 510];
function workerState(lt, i) { // 周期 3.0s：发送 0.8s，其余冷却
  const t = lt - 18.0 - i * 0.9;
  if (t < 0) return { phase: 'idle', u: 0 };
  const c = t % 3.0;
  return c < 0.8 ? { phase: 'send', u: c / 0.8, n: Math.floor(t / 3.0) } : { phase: 'cool', u: (c - 0.8) / 2.2, n: Math.floor(t / 3.0) };
}
function scenePolite(lt, d) {
  header(lt, '05', '礼貌', RED, '别把同一个站点压垮');
  const p1 = 1 - fd(lt, 11.4, 0.8), p2 = fd(lt, 11.8, 0.7);
  // ---- 方案一：FIFO
  if (p1 > 0) {
    ctx.save(); ctx.globalAlpha *= p1;
    text('先进先出队列', 830, 218, { size: 24, weight: 700, color: MUTE, a: fd(lt, 1.6) });
    for (let i = 0; i < 5; i++) pill(930, 275 + i * 58, `shop.com/${i + 1}`, C_FR, { a: fd(lt, 4.6 + i * 0.25), size: 20 });
    link(1020, 400, 1075, 400, fd(lt, 7.2, 0.4), RED);
    for (let i = 0; i < 4; i++) {
      const y = 300 + i * 78;
      glass(1080, y, 150, 56, { r: 14, accent: C_DL, a: fd(lt, 7.0 + i * 0.1) });
      text(`线程 ${i + 1}`, 1155, y + 37, { size: 22, weight: 700, color: C_DL, align: 'center', a: fd(lt, 7.0 + i * 0.1) });
      const pa = fd(lt, 7.4);
      link(1236, y + 28, 1488, 345 + i * 38, fd(lt, 7.4, 0.3), RED, 0.6);
      if (lt > 7.6 && lt < 11.8) { const q = (((lt - 7.6) * 1.1 + i * 0.1) % 1); runner([[1236, y + 28], [1488, 345 + i * 38]], q, RED, { r: 9 }); }
    }
    const load = eOut(P(lt, 7.8, 10.4)), hot = lt > 10.2;
    text('shop.com', 1650, 350, { size: 32, weight: 700, align: 'center', a: fd(lt, 6.4) });
    node({ x: 1500, y: 300, w: 300, h: 250, c: C_ST, l: '', size: 32 }, fd(lt, 6.4), { hot });
    // 负载条
    ctx.save(); ctx.globalAlpha *= fd(lt, 7.6); rr(1530, 470, 240, 22, 11); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill();
    ctx.fillStyle = hot ? RED : C_PA; glow(hot ? RED : C_PA, 12); rr(1530, 470, Math.max(22, 240 * load), 22, 11); ctx.fill(); ctx.restore();
    text('同时 4 个请求（示意）', 1650, 590, { size: 22, color: MUTE, align: 'center', a: fd(lt, 8.0) });
    text(hot ? '被压垮' : '负载', 1650, 436, { size: 26, weight: 800, color: hot ? RED : MUTE, align: 'center', a: fd(lt, 7.8) });
    ctx.restore();
  }
  // ---- 方案二：按主机分队列
  if (p2 > 0) {
    ctx.save(); ctx.globalAlpha *= p2;
    HOSTS.forEach(([host, qn], i) => {
      const y = HY[i], qa = fd(lt, 11.9 + i * 0.3, 0.5), wa = fd(lt, 14.5 + i * 0.25, 0.5);
      text(`队列 ${qn} · ${host}`, 830, y - 38, { size: 22, color: C_FR, weight: 700, font: MONO, a: qa });
      glass(830, y - 26, 350, 52, { r: 14, accent: C_FR, a: qa });
      const remain = Math.max(0, 4 - (lt > 18.0 + i * 0.9 ? 1 + Math.floor((lt - 18.0 - i * 0.9) / 3.0) : 0));
      for (let k = 0; k < remain; k++) { ctx.save(); ctx.globalAlpha *= qa; ctx.fillStyle = C_FR + '99'; rr(850 + k * 62, y - 14, 50, 28, 8); ctx.fill(); ctx.restore(); }
      const ws = workerState(lt, i);
      const wc = ws.phase === 'cool' ? C_PA : C_DL;
      glass(1260, y - 30, 170, 60, { r: 14, accent: wc, a: wa });
      text(`Worker ${i + 1}`, 1345, y + 8, { size: 22, weight: 700, align: 'center', a: wa, color: wc });
      link(1184, y, 1256, y, 1, DIM, qa);
      link(1434, y, 1596, y, 1, DIM, wa);
      glass(1600, y - 34, 210, 68, { r: 16, accent: C_ST, a: wa });
      text(host, 1705, y + 9, { size: 24, weight: 700, align: 'center', font: MONO, a: wa });
      if (ws.phase === 'send') runner([[1434, y], [1596, y]], ws.u, C_DL, { r: 9 });
      if (ws.phase === 'cool') { ringProgress(1448 + 0, y - 0, 0, 0, wc, 0); text(`冷却中`, 1345, y + 28 + 24, { size: 20, color: C_PA, align: 'center', a: 0 }); ctx.fillStyle = C_PA; ctx.fillRect(1272, y + 22, 146 * (1 - ws.u), 4); }
    });
    const ma = fd(lt, 12.8, 0.6);
    glass(830, 590, 980, 74, { r: 18, accent: '#8b8dfc', a: ma });
    text('映射表', 856, 636, { size: 22, color: MUTE, a: ma });
    text('shop.com→b1   news.org→b2   blog.io→b3', 980, 636, { size: 26, weight: 700, font: MONO, a: ma });
    ctx.restore();
  }
  // 时间线（间隔）
  const tl = fd(lt, 21.0, 0.7);
  if (tl > 0) {
    text('shop.com 的请求时间线（示意）', 830, 750, { size: 22, color: MUTE, a: tl });
    ctx.save(); ctx.globalAlpha *= tl; ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(830, 840); ctx.lineTo(1810, 840); ctx.stroke();
    [[880, 120], [1320, 120]].forEach(([x, w]) => { ctx.fillStyle = C_DL; glow(C_DL, 10); rr(x, 790, w, 40, 8); ctx.fill(); });
    ctx.shadowBlur = 0; ctx.strokeStyle = C_PA; ctx.lineWidth = 3; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(1000, 810); ctx.lineTo(1320, 810); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    text('间隔', 1160, 800, { size: 26, weight: 800, color: C_PA, align: 'center', a: tl });
    text('请求', 940, 818, { size: 22, color: '#06080f', weight: 800, align: 'center', a: tl }); text('请求', 1380, 818, { size: 22, color: '#06080f', weight: 800, align: 'center', a: tl });
  }
  bullet(0, 'FIFO：同站网址扎堆', fd(lt, 4.6));
  bullet(1, '线程一拥而上 → 压垮', fd(lt, 7.4), { color: RED });
  bullet(2, '按主机分队列', fd(lt, 11.9));
  bullet(3, '一队一 worker，一次一个请求', fd(lt, 14.5));
  bullet(4, '两次下载之间留间隔', fd(lt, 21.2));
}

// ───────── 场景 6：优先级 ─────────
const PICKS = [0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 1, 0];
const PW = [6, 3, 1], PN = [6, 4, 3];
const pLane = (i) => 240 + i * 80;
function scenePrio(lt, d) {
  header(lt, '06', '优先级', C_PA, '概率偏向重要的，不是绝对');
  const T0 = 9.5, DT = 0.42;
  const done = PICKS.map((_, k) => lt >= T0 + k * DT + 0.3);
  const cnt = [0, 0, 0]; PICKS.forEach((q, k) => { if (done[k]) cnt[q]++; });
  const lanes = ['高', '中', '低'];
  // 信号 → 队列
  const sig = fd(lt, 2.0, 0.6);
  text('PageRank · 更新频率 …', 830, 205, { size: 22, color: C_PA, weight: 700, a: sig });
  lanes.forEach((lv, i) => {
    const y = pLane(i), a = fd(lt, 3.0 + i * 0.4, 0.5);
    glass(900, y, 440, 56, { r: 14, accent: C_PA, fill: 0.04, a });
    text(`f${i + 1}`, 836, y + 38, { size: 26, weight: 800, font: MONO, color: C_PA, a }); text(lv, 874, y + 38, { size: 22, color: MUTE, align: 'center', a });
    const remain = PN[i] - cnt[i];
    for (let k = 0; k < remain; k++) { ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = C_PA + (i === 0 ? 'ee' : i === 1 ? '99' : '55'); rr(912 + k * 54, y + 12, 44, 32, 8); ctx.fill(); ctx.restore(); }
    const wa = fd(lt, 7.8 + i * 0.3, 0.5);
    text(`权重 ${PW[i]}`, 1360, y + 26, { size: 22, color: MUTE, a: wa, font: MONO });
    text(`已选 ${cnt[i]}`, 1360, y + 52, { size: 22, color: C_PA, weight: 700, a: wa, font: MONO });
    link(1342 + 120, y + 28, 1600, 330 + (i - 1) * 24, 1, DIM, a * 0.0);
  });
  // 选择器
  const sa = fd(lt, 8.0);
  ctx.save(); ctx.globalAlpha *= sa; glow(C_PA, 22); ctx.fillStyle = '#0a0d18'; ctx.beginPath(); ctx.arc(1700, 320, 60, 0, 7); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = C_PA; ctx.stroke(); ctx.shadowBlur = 0; ctx.restore();
  text('选择器', 1700, 316, { size: 24, weight: 700, align: 'center', a: sa }); text('带权随机', 1700, 346, { size: 20, color: MUTE, align: 'center', a: sa });
  text('示意：权重 6 : 3 : 1', 1700, 410, { size: 22, color: DIM, align: 'center', a: sa });
  // 每次抽取
  PICKS.forEach((q, k) => {
    const t = T0 + k * DT, p = P(lt, t, t + 0.3);
    if (p <= 0 || p >= 1) return;
    const y = pLane(q) + 28;
    const [x, yy] = along([[1100, y], [1640, 320]], eIO(p));
    dot(x, yy, 11, q === 2 ? RED : C_PA, { g: 20 });
  });
  const lastLow = PICKS.indexOf(2), tl = T0 + lastLow * DT;
  const hint = fd(lt, tl + 0.2, 0.5) * (1 - fd(lt, tl + 2.6, 0.5));
  if (hint > 0) text('低优先级也有机会，不会饿死', 1120, 495, { size: 26, weight: 700, color: RED, align: 'center', a: hint });
  // 后置队列：高优先级也要等间隔
  const ba = fd(lt, 15.0, 0.7);
  if (ba > 0) {
    text('后置队列 b1 · a.com', 830, 590, { size: 24, weight: 700, color: C_FR, a: ba, font: MONO });
    glass(830, 614, 500, 66, { r: 16, accent: C_FR, a: ba });
    [0, 1].forEach((k) => { ctx.save(); ctx.globalAlpha *= ba; ctx.fillStyle = C_FR + '99'; rr(850 + k * 62, 632, 50, 30, 8); ctx.fill(); ctx.restore(); });
    const tr = eIO(P(lt, 15.4, 17.0));
    const [cx, cy] = along([[1700, 380], [1700, 560], [1260, 647]], tr);
    if (lt < 22.0) pill(lt < 17.0 ? cx : 1260, lt < 17.0 ? cy : 647, 'P1 · a.com/hot', C_PA, { size: 20, a: 1 });
    // 主机冷却
    const g = P(lt, 17.9, 22.0);
    glass(1440, 600, 370, 100, { r: 18, accent: RED, a: ba });
    text('a.com 冷却中', 1470, 640, { size: 24, weight: 700, color: RED, a: ba });
    ctx.save(); ctx.globalAlpha *= ba; rr(1470, 660, 310, 16, 8); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.fillStyle = RED; rr(1470, 660, Math.max(16, 310 * g), 16, 8); ctx.fill(); ctx.restore();
    if (lt >= 22.0) { runner([[1260, 647], [1100, 647], [915, 647]].slice(0, 2), P(lt, 22.0, 22.6), C_DL); }
    const nb = fd(lt, 20.6, 0.6);
    if (nb > 0) badge(830, 730, '高优先级也不能插队', RED, nb);
  }
  bullet(0, '信号：PageRank、更新频率', fd(lt, 2.0));
  bullet(1, '高优先级：被选中概率更大', fd(lt, 7.8));
  bullet(2, '不是绝对优先', fd(lt, 12.2));
  bullet(3, '仍受后置队列限速', fd(lt, 17.9));
}

// ───────── 场景 7：蜘蛛陷阱 ─────────
const CAL = ['2026/10', '2026/11', '2026/12', '2027/01', '2027/02'];
function sceneTrap(lt, d) {
  header(lt, '07', '蜘蛛陷阱', RED, '去重拦不住的无限循环');
  const cut = fd(lt, 18.2, 0.6);
  text('每页都有「下一个月」链接', 810, 196, { size: 24, color: MUTE, weight: 600, a: fd(lt, 4.4, 0.6) });
  CAL.forEach((m, k) => {
    const x = 810 + k * 205, t0 = 2.6 + k * 0.45, a = fd(lt, t0, 0.5), dead = k >= 3 ? cut : 0;
    pill(x + 87, 250, `cal/${m}`, dead > 0.5 ? DIM : RED, { a: a * (1 - dead * 0.65), s: lerp(0.85, 1, a), size: 21 });
    if (k > 0) link(x - 26, 250, x + 8, 250, fd(lt, t0, 0.4), RED, a * 0.9 * (1 - dead * 0.7));
    const ck = fd(lt, 9.4 + k * 0.4, 0.4);
    if (ck > 0) text(dead > 0.5 ? '✕ 超过深度' : '未见过 ✓', x + 87, 322, { size: 20, weight: 700, color: dead > 0.5 ? DIM : C_ST, align: 'center', a: ck });
  });
  text('…', 1840, 262, { size: 30, color: RED, align: 'right', a: fd(lt, 5.4, 0.5) * (1 - cut) });
  // 深度上限线
  if (cut > 0) {
    ctx.save(); ctx.globalAlpha *= cut; ctx.strokeStyle = C_ST; ctx.lineWidth = 3; ctx.setLineDash([8, 7]); ctx.beginPath(); ctx.moveTo(1425, 215); ctx.lineTo(1425, 345); ctx.stroke(); ctx.restore();
    text('深度上限', 1425, 380, { size: 22, weight: 700, color: C_ST, align: 'center', a: cut });
  }
  // 队列增长
  const grow = lt < 18.2 ? eIO(P(lt, 11.7, 13.5)) : eIO(P(lt, 11.7, 13.5));
  const frozen = cut > 0.5;
  dbIcon(830, 440, 130, 170, '待抓队列', { color: C_FR, a: fd(lt, 11.4, 0.5), fill: grow * 0.92 });
  if (lt > 11.4) {
    const num = Math.round(lerp(12, 48213, grow));
    text(num.toLocaleString('en-US'), 990, 536, { size: 52, weight: 800, font: MONO, color: frozen ? C_ST : RED, a: fd(lt, 11.6, 0.4) });
    text(frozen ? '不再增长' : '队列越滚越长（示意）', 990, 580, { size: 24, color: frozen ? C_ST : MUTE, a: fd(lt, 11.8, 0.4) });
  }
  // 长度限制
  const la = fd(lt, 13.3, 0.6);
  glass(1330, 440, 480, 190, { a: la, accent: C_PA });
  text('URL 长度限制', 1362, 482, { size: 24, weight: 700, color: C_PA, a: la });
  pill(1480, 540, 'a.com/c/1/2/3', '#cfd6f0', { a: la, size: 22 });
  text('长度没超限 → 放行', 1362, 596, { size: 24, color: INK, a: la });
  const sh = fd(lt, 15.6, 0.5);
  if (sh > 0) text('短网址也能无限延伸', 1570, 622 + 0, { size: 0.1, a: 0 });
  if (sh > 0) badge(1362, 646, '短网址也能无限延伸', RED, sh);
  // 预算
  const bd = fd(lt, 19.6, 0.6);
  if (bd > 0) {
    glass(830, 700, 980, 150, { a: bd, accent: C_ST });
    text('站点抓取预算（示意）', 862, 746, { size: 24, weight: 700, color: C_ST, a: bd });
    const f = eOut(P(lt, 19.8, 21.4));
    ctx.save(); ctx.globalAlpha *= bd; rr(862, 774, 880, 30, 15); ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fill(); ctx.fillStyle = C_ST; glow(C_ST, 12); rr(862, 774, Math.max(30, 880 * f), 30, 15); ctx.fill(); ctx.restore();
    text(f > 0.98 ? '用满即停，不再抓这个站点' : '每个站点抓多少页，设上限', 862, 836, { size: 24, color: MUTE, a: bd });
  }
  bullet(0, '网址每次都新 → 去重放行', fd(lt, 9.4));
  bullet(1, '光限制长度不够', fd(lt, 13.3));
  bullet(2, '深度限制', fd(lt, 18.6));
  bullet(3, '站点抓取预算', fd(lt, 19.8));
  bullet(4, '参数归一化要谨慎', fd(lt, 21.0), { color: MUTE });
}

// ───────── 片头 / 片尾 ─────────
function miniLoop(cx, cy, R, lt, a = 1, t0 = 0) {
  const labs = ['种子', '队列', '下载', '解析', '去重', '新链接'];
  ctx.save(); ctx.globalAlpha *= a;
  ctx.strokeStyle = 'rgba(139,141,252,0.35)'; ctx.lineWidth = 6; glow('rgba(139,141,252,0.5)', 22); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); ctx.shadowBlur = 0;
  const cols = [INK, C_FR, C_DL, C_PA, C_DD, C_ST];
  labs.forEach((l, i) => {
    const an = -Math.PI / 2 + (i / 6) * Math.PI * 2, x = cx + Math.cos(an) * R, y = cy + Math.sin(an) * R, k = eBack(P(lt, t0 + i * 0.25, t0 + 0.6 + i * 0.25));
    pill(x, y, l, cols[i], { s: k, a: clamp(k * 2), size: 22 });
  });
  const an = -Math.PI / 2 + (((lt * 0.12) % 1)) * Math.PI * 2; dot(cx + Math.cos(an) * R, cy + Math.sin(an) * R, 11, '#fff', { g: 28 });
  ctx.restore();
}
function sceneTitle(lt, d) {
  const a = eOut(P(lt, 0.2, 1.2));
  miniLoop(1400, 540, 260, lt, eOut(P(lt, 0.3, 1.2)), 1.0);
  text('系统设计面试 · 动画讲解', 110, 400, { size: 30, weight: 600, color: SC[0], ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = eOut(P(lt, 0.4, 1.4)); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 150px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '4px'; ctx.fillText('网络爬虫', 104, 560); ctx.restore();
  text('Web Crawler', 112, 630, { size: 40, color: MUTE, font: MONO, a: eOut(P(lt, 0.8, 1.6)) });
  text('第 9 章', 112, 720, { size: 34, weight: 700, a: eOut(P(lt, 1.2, 2)) });
}
function sceneEnd(lt, d) {
  miniLoop(1640, 250, 100, lt, 0.7, 0.4);
  text('网络爬虫', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Web Crawler', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['循环', '种子 → 下载 → 解析 → 新链接 → 再入队', C_FR], ['礼貌', '按主机分队列，一队一 worker', C_PA], ['去重', '网址一道，内容一道', C_DD]].forEach(([w, s, c], k) => {
    const t0 = 1.0 + k * 1.2, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 230, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 70, weight: 800 });
    text(s, x + 36, 620, { size: 24, color: MUTE });
    ctx.restore();
  });
  const aa = eOut(P(lt, 5.0, 5.8));
  text('判断爬虫好不好，看', 110, 750, { size: 26, color: MUTE, a: aa });
  let bx = 110;
  ['有效新内容吞吐', '错误率', '站点压力'].forEach((s, k) => { bx += badge(bx, 780, s, '#8b8dfc', eOut(P(lt, 5.4 + k * 0.3, 6.2 + k * 0.3))) + 16; });
  text('而不只是线程数', 110, 880, { size: 24, color: DIM, a: eOut(P(lt, 7.4, 8.2)) });
}

export const scenes = { title: sceneTitle, pipe: scenePipe, loop: sceneLoop, dedup: sceneDedup, frontier: sceneFrontier, polite: scenePolite, prio: scenePrio, trap: sceneTrap, end: sceneEnd };
