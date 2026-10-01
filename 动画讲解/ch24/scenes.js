// 第 24 章 S3 类对象存储：场景定义
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet, hbar } from '../lib/core.js';

export const meta = { no: 24, title: 'S3 类对象存储', en: 'S3-like Object Storage' };

// 角色配色：API 青、元数据 靛、数据 粉、IAM 琥珀、成功/新增 青柠
const C_API = SC[0], C_META = SC[1], C_DATA = SC[2], C_IAM = SC[3], C_OK = SC[4];
const T = (lt, a, b) => eOut(P(lt, a, b));
const mono = (s, x, y, o = {}) => text(s, x, y, { font: MONO, ...o });

function chipRect(x, y, w, h, color, label, { a = 1, fill = 0.2, size = 26, ring = null, dashed = false, textColor = INK } = {}) {
  if (a <= 0) return;
  ctx.save(); ctx.globalAlpha *= a;
  if (ring) glow(ring, 20);
  rr(x, y, w, h, Math.min(14, h / 2.5)); ctx.fillStyle = color + Math.round(fill * 255).toString(16).padStart(2, '0'); ctx.fill();
  ctx.lineWidth = ring ? 3.5 : 2; ctx.strokeStyle = ring || color; if (dashed) ctx.setLineDash([7, 6]); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  if (label) text(label, x + w / 2, y + h / 2 + size * 0.36, { size, weight: 700, align: 'center', font: MONO, color: textColor });
  ctx.restore();
}
function cross(cx, cy, r, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = RED; ctx.lineWidth = 6; ctx.lineCap = 'round'; glow(RED, 14);
  ctx.beginPath(); ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r); ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r); ctx.stroke(); ctx.restore();
}
function tick(cx, cy, s, color = C_OK, a = 1) {
  ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; glow(color, 12);
  ctx.beginPath(); ctx.moveTo(cx - s, cy); ctx.lineTo(cx - s * 0.3, cy + s * 0.7); ctx.lineTo(cx + s, cy - s * 0.7); ctx.stroke(); ctx.restore();
}

// ───────── 场景 1：桶与对象 ─────────
function sceneBucket(lt) {
  header(lt, '01', '桶与对象', C_API, '对象存储的基本单位');
  bullet(0, '桶：全局唯一的名字', T(lt, 2.5, 3.1));
  bullet(1, '对象 = 数据 + 元数据', T(lt, 6.5, 7.1));
  bullet(2, '键里的 / 只是前缀', T(lt, 11.5, 12.1));
  bullet(3, '整体写入，不原地修改', T(lt, 16.0, 16.6));
  const ba = T(lt, 0.8, 1.6);
  glass(830, 200, 1000, 700, { a: ba });
  ctx.save(); ctx.globalAlpha *= ba;
  text('桶 bucket', 870, 260, { size: 22, color: MUTE });
  mono('bucket-to-share', 870, 312, { size: 40, weight: 800 });
  ctx.restore();
  badge(1470, 262, '名字全局唯一', C_API, T(lt, 3.0, 3.8));
  // 对象卡
  const oa = eBack(P(lt, 5.0, 5.9));
  if (oa > 0.02) {
    ctx.save(); ctx.globalAlpha *= clamp(oa); ctx.translate(0, (1 - clamp(oa)) * 30);
    glass(870, 350, 920, 340, { accent: C_API });
    text('对象 object · 键 key', 900, 400, { size: 22, color: MUTE });
    mono('photos/2021/', 900, 468, { size: 46, weight: 800, color: C_IAM });
    mono('cat.jpg', 900 + 46 * 0.6 * 12 + 4, 468, { size: 46, weight: 800 });
    ctx.restore();
  }
  const sa = T(lt, 7.0, 8.0);
  chipRect(900, 545, 420, 120, C_DATA, '', { a: sa, fill: 0.14 });
  text('数据', 924, 584, { size: 26, weight: 700, color: C_DATA, a: sa });
  mono('字节  4567 bytes', 924, 636, { size: 28, a: sa });
  chipRect(1350, 545, 410, 120, C_META, '', { a: sa, fill: 0.14 });
  text('元数据', 1374, 584, { size: 26, weight: 700, color: C_META, a: sa });
  mono('author: Alex · text/plain', 1374, 636, { size: 24, a: sa });
  // 前缀括号
  const pa = T(lt, 10.5, 11.5);
  if (pa > 0) {
    ctx.save(); ctx.globalAlpha *= pa; ctx.strokeStyle = C_IAM; ctx.lineWidth = 4; glow(C_IAM, 10);
    ctx.beginPath(); ctx.moveTo(900, 486); ctx.lineTo(900, 496); ctx.lineTo(900 + 12 * 27.6, 496); ctx.lineTo(900 + 12 * 27.6, 486); ctx.stroke(); ctx.restore();
    text('前缀（不是真目录）', 1260, 504, { size: 24, weight: 700, color: C_IAM, a: pa, align: 'left' });
  }
  // 整体替换
  const ra = T(lt, 15.0, 15.8), rb = T(lt, 17.5, 18.3);
  if (ra > 0) {
    ctx.save(); ctx.globalAlpha *= ra;
    tick(900, 765, 14); text('PUT 同一个键：整体写入 / 整体替换', 940, 777, { size: 28, weight: 600 }); ctx.restore();
  }
  if (rb > 0) {
    ctx.save(); ctx.globalAlpha *= rb;
    cross(900, 835, 12); text('只改其中一段字节：本题不支持', 940, 847, { size: 28, weight: 600, color: MUTE }); ctx.restore();
  }
}

// ───────── 场景 2：元数据与数据分离 ─────────
function sceneSplit(lt) {
  header(lt, '02', '元数据与数据分离', C_META, '先问「在哪」，再取「是什么」');
  bullet(0, '元数据：桶名、对象名、ID', T(lt, 2.0, 2.6));
  bullet(1, '数据：字节，凭对象 ID 取', T(lt, 9.0, 9.6));
  bullet(2, '类比 UNIX：inode → 数据块', T(lt, 13.0, 13.6));
  bullet(3, '分开后，两边独立扩展', T(lt, 18.5, 19.1));
  ctx.save(); ctx.translate(0, 60);
  // key chip
  const ka = T(lt, 1.2, 2.0);
  chipRect(820, 320, 250, 70, C_API, 'bucket/key', { a: ka, fill: 0.16, size: 26 });
  // 元数据存储
  const ma = T(lt, 2.2, 3.2);
  ctx.save(); ctx.globalAlpha *= ma; glass(1140, 240, 330, 250, { accent: C_META });
  ctx.fillStyle = C_META; glow(C_META, 16); rr(1164, 240, 282, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
  text('元数据存储', 1170, 292, { size: 28, weight: 700, color: C_META });
  mono('key → object_id', 1170, 342, { size: 22, color: MUTE });
  mono('script.txt', 1170, 392, { size: 24 }); mono('→ 7f3a…', 1360, 392, { size: 24, color: C_IAM });
  mono('cat.jpg', 1170, 436, { size: 24 }); mono('→ c91b…', 1360, 436, { size: 24, color: C_IAM });
  ctx.restore();
  arrow(1070, 355, 1140, 355, { color: C_API, p: T(lt, 3.0, 3.6), a: ma });
  // 数据存储
  const da = T(lt, 6.5, 7.5);
  ctx.save(); ctx.globalAlpha *= da; glass(1560, 240, 270, 250, { accent: C_DATA });
  ctx.fillStyle = C_DATA; glow(C_DATA, 16); rr(1584, 240, 222, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
  text('数据存储', 1590, 292, { size: 28, weight: 700, color: C_DATA });
  mono('id → 字节', 1590, 342, { size: 22, color: MUTE });
  for (let k = 0; k < 8; k++) chipRect(1590 + (k % 4) * 56, 372 + Math.floor(k / 4) * 48, 48, 38, C_DATA, '', { fill: 0.3 });
  ctx.restore();
  // object id 流动
  const f1 = P(lt, 4.2, 6.2);
  arrow(1470, 355, 1560, 355, { color: C_IAM, p: eOut(P(lt, 4.0, 5.2)), a: ma });
  if (f1 > 0 && f1 < 1) chipRect(1470 + f1 * 40, 330, 100, 44, C_IAM, '7f3a', { fill: 0.35, size: 22, a: Math.sin(f1 * Math.PI) * 1.2 });
  const fa = T(lt, 7.6, 8.4);
  text('对象 ID 是两边的桥梁', 1560, 540, { size: 24, color: MUTE, a: fa, align: 'left' });
  ctx.restore();
  // UNIX 类比 / 扩展
  const ua = T(lt, 12.6, 13.6) * (1 - T(lt, 17.8, 18.6));
  if (ua > 0) {
    ctx.save(); ctx.globalAlpha *= ua;
    text('类比：UNIX 文件系统', 820, 640, { size: 24, color: MUTE });
    [['文件名', C_API], ['inode', C_META], ['数据块', C_DATA]].forEach(([s, c], k) => {
      const x = 820 + k * 330; chipRect(x, 670, 230, 90, c, s, { fill: 0.14, size: 30, textColor: INK });
      if (k < 2) arrow(x + 240, 715, x + 320, 715, { color: DIM, w: 3, head: 11 });
    });
    ctx.restore();
  }
  const sa = T(lt, 18.8, 19.8);
  if (sa > 0) {
    ctx.save(); ctx.globalAlpha *= sa;
    text('元数据：按需分片', 820, 640, { size: 24, color: C_META });
    text('数据节点：按容量加机器', 1230, 640, { size: 24, color: C_DATA });
    for (let k = 0; k < 3; k++) { const p = eBack(P(lt, 19.2 + k * 0.4, 20 + k * 0.4)); if (p > 0.02) dbIcon(830 + k * 120, 670, 90, 130, '', { color: C_META, a: clamp(p) }); }
    for (let k = 0; k < 6; k++) { const p = eBack(P(lt, 20.2 + k * 0.25, 21 + k * 0.25)); if (p > 0.02) chipRect(1230 + (k % 3) * 200, 670 + Math.floor(k / 3) * 100, 180, 80, C_DATA, `节点${k + 1}`, { fill: 0.16, size: 24, a: clamp(p) }); }
    ctx.restore();
  }
}

// ───────── 场景 3：上传与下载 ─────────
const N = { cl: [810, 520, 130, 90], lb: [990, 520, 120, 90], api: [1160, 520, 140, 90], iam: [1160, 290, 140, 90], meta: [1500, 450, 210, 100], data: [1500, 680, 210, 100] };
const ctr = (n) => [n[0] + n[2] / 2, n[1] + n[3] / 2];
function sceneUpload(lt) {
  header(lt, '03', '上传与下载', C_API, '先写字节，再记元数据');
  bullet(0, '① 验证身份与写权限', T(lt, 5.0, 5.6));
  bullet(1, '② 字节落盘，拿回对象 ID', T(lt, 8.6, 9.2));
  bullet(2, '③ 元数据记 键 → ID', T(lt, 12.0, 12.6));
  bullet(3, '④ 下载：先查 ID，再取字节', T(lt, 16.0, 16.6));
  const ba = T(lt, 0.6, 1.4);
  box(...N.cl, '客户端', { color: INK, a: ba, size: 26 });
  box(...N.lb, '负载均衡', { color: C_API, a: ba, size: 24 });
  box(...N.api, 'API 服务', { color: C_API, a: ba, size: 24, sub: '无状态' });
  box(...N.iam, 'IAM', { color: C_IAM, a: T(lt, 0.8, 1.6) });
  box(...N.meta, '元数据存储', { color: C_META, a: T(lt, 1.0, 1.8), size: 26 });
  box(...N.data, '数据存储', { color: C_DATA, a: T(lt, 1.2, 2.0), size: 26 });
  const L = (a, b, o) => { const [x1, y1] = ctr(N[a]), [x2, y2] = ctr(N[b]); return [x1, y1, x2, y2]; };
  // 静态连线
  const edge = (a, b, dx1, dy1, dx2, dy2) => { const [x1, y1] = ctr(N[a]), [x2, y2] = ctr(N[b]); arrow(x1 + dx1, y1 + dy1, x2 + dx2, y2 + dy2, { color: DIM, w: 2.5, head: 0.1, a: 0.7 }); };
  edge('cl', 'lb', 65, 0, -60, 0); edge('lb', 'api', 60, 0, -70, 0); edge('api', 'iam', 0, -45, 0, 45); edge('api', 'meta', 70, -10, -105, 0); edge('api', 'data', 70, 10, -105, 0);
  const up = lt < 15.0;
  text(up ? '上传  PUT /bucket-to-share/script.txt' : '下载  GET /bucket-to-share/script.txt', 830, 225, { size: 28, weight: 700, font: MONO, color: up ? C_OK : C_API, a: T(lt, 0.8, 1.4) });
  const pk = (a, b, t0, t1, color, off = [0, 0, 0, 0]) => { const [x1, y1] = ctr(N[a]), [x2, y2] = ctr(N[b]); const p = eIO(P(lt, t0, t1)); packet(x1 + off[0], y1 + off[1], x2 + off[2], y2 + off[3], p, color); };
  // 上传
  pk('cl', 'lb', 1.0, 1.8, C_OK); pk('lb', 'api', 1.7, 2.5, C_OK);
  pk('api', 'iam', 4.8, 5.6, C_IAM); pk('iam', 'api', 5.8, 6.6, C_OK);
  if (lt > 5.6 && lt < 8.3) { tick(ctr(N.iam)[0] + 100, ctr(N.iam)[1], 14, C_OK, T(lt, 6.6, 7.0) * (1 - T(lt, 7.6, 8.2))); }
  pk('api', 'data', 8.0, 9.6, C_DATA, [0, 12, 0, 0]);
  const idp = eIO(P(lt, 10.0, 10.9)); if (idp > 0 && idp < 1) { const [x1, y1] = ctr(N.data), [x2, y2] = ctr(N.api); chipRect(lerp(x1, x2, idp) - 40, lerp(y1, y2, idp) - 20, 80, 40, C_IAM, '7f3a', { size: 20, fill: 0.4 }); }
  pk('api', 'meta', 11.6, 12.6, C_META); pk('meta', 'api', 12.9, 13.6, C_OK);
  pk('api', 'lb', 13.8, 14.4, C_OK, [0, 0, 0, 0]);
  // 下载
  pk('cl', 'lb', 15.6, 16.2, C_API); pk('lb', 'api', 16.1, 16.7, C_API);
  pk('api', 'meta', 17.4, 18.4, C_META); const idq = eIO(P(lt, 18.7, 19.5)); if (idq > 0 && idq < 1) { const [x1, y1] = ctr(N.meta), [x2, y2] = ctr(N.api); chipRect(lerp(x1, x2, idq) - 40, lerp(y1, y2, idq) - 20, 80, 40, C_IAM, '7f3a', { size: 20, fill: 0.4 }); }
  pk('api', 'data', 19.9, 21.0, C_IAM, [0, 12, 0, 0]); pk('data', 'api', 21.3, 22.4, C_DATA, [0, 0, 0, 12]);
  pk('api', 'lb', 22.6, 23.2, C_DATA); pk('lb', 'cl', 23.1, 23.7, C_DATA);
  // 孤儿提示
  const oa = T(lt, 14.2, 15.0) * (1 - T(lt, 15.4, 15.9));
  glass(830, 830, 1000, 80, { a: T(lt, 14.0, 14.8) * (lt < 15.2 ? 1 : 1 - T(lt, 15.2, 15.8)), accent: C_IAM });
  const ga = T(lt, 14.0, 14.8) * (lt < 15.2 ? 1 : 1 - T(lt, 15.2, 15.8));
  text('字节写成、元数据没提交 → 孤儿对象，由 GC 回收', 860, 880, { size: 26, weight: 600, a: ga });
}

// ───────── 场景 4：数据节点内部 ─────────
const OBJS = [['o1', 70], ['o2', 160], ['o3', 50], ['o4', 210], ['o5', 90]];
const OFFS = (() => { let s = 0; return OBJS.map(([, w]) => { const o = s; s += w; return o; }); })();
const BAR = { x: 850, y: 408, w: 960, h: 70, tot: 580 };
function sceneStore(lt) {
  header(lt, '04', '数据节点内部', C_DATA, '追加写 + 本地索引');
  bullet(0, '放置服务选定节点', T(lt, 2.5, 3.1));
  bullet(1, '小对象追加进大文件', T(lt, 6.8, 7.4));
  bullet(2, '本地索引：ID → 文件+偏移', T(lt, 12.3, 12.9));
  bullet(3, '读取：查索引，直接定位', T(lt, 18.0, 18.6));
  const a0 = T(lt, 0.6, 1.4);
  box(820, 200, 150, 80, '路由服务', { color: C_API, a: a0, size: 24 });
  box(1030, 200, 150, 80, '放置服务', { color: C_IAM, a: a0, size: 24 });
  for (let k = 0; k < 3; k++) box(1250 + k * 190, 200, 170, 80, `节点 ${k + 1}`, { color: C_DATA, a: a0, size: 24, hot: false });
  arrow(970, 240, 1030, 240, { color: DIM, w: 2.5, p: a0, head: 10 });
  const q = eIO(P(lt, 1.8, 2.8)); packet(970, 225, 1030, 225, q, C_API);
  const q2 = eIO(P(lt, 3.2, 4.4)); packet(1180, 255, 1420 + 85, 255, q2, C_IAM);
  const sel = T(lt, 4.4, 5.0);
  if (sel > 0) { ctx.save(); ctx.globalAlpha *= sel; ctx.strokeStyle = C_OK; ctx.lineWidth = 4; glow(C_OK, 18); rr(1440 - 6, 194, 182, 92, 24); ctx.stroke(); ctx.restore(); }
  text('选中 节点 2', 1440, 318, { size: 22, weight: 700, color: C_OK, a: sel });
  glass(820, 340, 1010, 560, { a: T(lt, 4.6, 5.4) });
  mono('节点 2 · /data/c', 850, 388, { size: 26, weight: 700, color: C_DATA, a: T(lt, 4.8, 5.6) });
  text('追加 →', 1700, 388, { size: 22, color: MUTE, a: T(lt, 5.6, 6.2), align: 'right' });
  rr(BAR.x, BAR.y, BAR.w, BAR.h, 12); ctx.save(); ctx.globalAlpha *= T(lt, 4.8, 5.6); ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  const sc = BAR.w / 640;
  const selRow = lt > 18.4 ? 2 : -1;
  OBJS.forEach(([id, w], k) => {
    const t0 = 6.5 + k * 1.1, p = eOut(P(lt, t0, t0 + 0.7));
    if (p <= 0) return;
    const x = BAR.x + OFFS[k] * sc, ww = w * sc;
    const hit = selRow === k && P(lt, 19.4, 20) > 0;
    chipRect(x + 3 + (1 - p) * 120, BAR.y + 5, ww - 6, BAR.h - 10, C_DATA, id, { a: p, fill: hit ? 0.55 : 0.22, size: 22, ring: hit ? C_OK : null });
  });
  // 索引表
  const cols = [850, 1030, 1260, 1500];
  const ia = T(lt, 11.8, 12.6);
  text('本地索引', 850, 548, { size: 24, weight: 700, color: C_META, a: ia });
  text('示意，单位 KB', 1810, 548, { size: 20, color: DIM, a: ia, align: 'right' });
  ['object_id', 'filename', 'offset', 'size'].forEach((s, i) => mono(s, cols[i], 594, { size: 22, color: MUTE, a: ia }));
  OBJS.forEach(([id, w], k) => {
    const y = 604 + k * 52, a = T(lt, 12.2 + k * 0.4, 12.8 + k * 0.4);
    const hit = selRow === k;
    if (hit) { ctx.save(); ctx.globalAlpha *= T(lt, 18.4, 19.0); rr(840, y + 4, 970, 44, 10); ctx.fillStyle = C_OK + '28'; ctx.fill(); ctx.strokeStyle = C_OK; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore(); }
    mono(id, cols[0], y + 36, { size: 26, a, color: C_DATA, weight: 700 }); mono('/data/c', cols[1], y + 36, { size: 26, a }); mono(String(OFFS[k]), cols[2], y + 36, { size: 26, a }); mono(String(w), cols[3], y + 36, { size: 26, a });
  });
  const rp = P(lt, 19.6, 20.8);
  if (rp > 0) {
    const sx = BAR.x + (OFFS[2] + OBJS[2][1] / 2) * sc;
    text('offset 230 → 读 50 KB', sx, 520, { size: 24, weight: 700, color: C_OK, a: eOut(P(lt, 19.8, 20.6)), align: 'center', font: MONO });
  }
}

// ───────── 纠删码公共：12 块 → 3 机架 × 4 盘 ─────────
const RK = { x0: 830, gap: 20, w: 322, y: 560, h: 300 };
const rackX = (r) => RK.x0 + r * (RK.w + RK.gap);
const slotRect = (k) => { const r = k % 3, s = Math.floor(k / 3); return [rackX(r) + 20 + (s % 2) * 142, RK.y + 68 + Math.floor(s / 2) * 112, 130, 100]; };
const blkName = (k) => (k < 8 ? `D${k + 1}` : `P${k - 7}`);
const blkColor = (k) => (k < 8 ? C_API : C_IAM);
const U = 980 / 12;
const rowRect = (k, yy = 330) => [830 + k * U, yy, U - 8, 64];
function racks(a = 1, { dark = [] } = {}) {
  for (let r = 0; r < 3; r++) {
    glass(rackX(r), RK.y, RK.w, RK.h, { a, r: 24, accent: dark.includes(r) ? RED : null });
    text(`机架 ${'ABC'[r]}`, rackX(r) + 20, RK.y + 44, { size: 24, weight: 700, color: dark.includes(r) ? RED : MUTE, a });
    for (let s = 0; s < 4; s++) { const [x, y, w, h] = slotRect(s * 3 + r); ctx.save(); ctx.globalAlpha *= a; rr(x, y, w, h, 14); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore(); }
  }
}
function blk(k, [x, y, w, h], { a = 1, dead = false, ring = null, size = 28 } = {}) {
  if (a <= 0) return;
  const col = dead ? RED : blkColor(k);
  chipRect(x, y, w, h, col, blkName(k), { a, fill: dead ? 0.1 : 0.28, ring, size, dashed: dead, textColor: dead ? RED : INK });
  if (dead) cross(x + w / 2, y + h / 2, Math.min(w, h) * 0.25, a);
}
const mix = (r1, r2, p) => r1.map((v, i) => lerp(v, r2[i], p));

// ───────── 场景 5：切块 + 校验 + 散落 ─────────
function sceneEC(lt) {
  header(lt, '05', '纠删码：切块与校验', C_IAM, '8 个数据块 + 4 个校验块');
  bullet(0, '数据块 8：切开原对象', T(lt, 2.0, 2.6));
  bullet(1, '校验块 4：算出来的冗余', T(lt, 6.2, 6.8));
  bullet(2, '12 块分放不同磁盘', T(lt, 9.8, 10.4));
  statCard(110, 740, 640, '一个对象共存', '12 块', { color: C_IAM, a: T(lt, 8.0, 8.8), note: '= 8 + 4' });
  racks(T(lt, 9.0, 10.0));
  // 原对象条
  const oa = T(lt, 0.6, 1.4);
  const split = eIO(P(lt, 2.2, 3.4));
  if (split < 0.02) chipRect(830, 330, 8 * U - 8, 64, C_API, '对象  800 MB（示意）', { a: oa, fill: 0.2, size: 24 });
  text('原对象（示意 800 MB）', 830, 300, { size: 22, color: MUTE, a: oa * (1 - T(lt, 9.5, 10)) });
  for (let k = 0; k < 12; k++) {
    let a = 1, r = rowRect(k);
    if (k < 8) { if (split < 0.02) continue; const whole = [830, 330, 8 * U - 8, 64]; r = split < 1 ? mix([830 + k * (8 * U) / 8, 330, (8 * U) / 8 - 0, 64], r, split) : r; a = 1; }
    else { const p = eBack(P(lt, 6.2 + (k - 8) * 0.3, 7.0 + (k - 8) * 0.3)); if (p <= 0.02) continue; a = clamp(p); r = [r[0], r[1] + (1 - clamp(p)) * -26, r[2], r[3]]; }
    const fly = eIO(P(lt, 10.0 + (k % 3) * 0.25 + Math.floor(k / 3) * 0.2, 11.6 + (k % 3) * 0.25 + Math.floor(k / 3) * 0.2));
    blk(k, mix(r, slotRect(k), fly), { a, size: fly > 0.5 ? 28 : 24 });
  }
  const la = T(lt, 3.6, 4.4) * (1 - T(lt, 9.6, 10.0));
  text('8 × 100 MB', 830, 440, { size: 24, weight: 700, font: MONO, color: C_API, a: la });
  const pa = T(lt, 7.4, 8.2) * (1 - T(lt, 9.6, 10.0));
  text('+ 4 个校验块（同样大小）', 1330, 440, { size: 24, weight: 700, color: C_IAM, a: pa });
  text('不同故障域', 1514, 520, { size: 22, color: MUTE, a: T(lt, 12.2, 13), align: 'left' });
}

// ───────── 场景 6：丢块与重建 ─────────
const DEAD_A = [1, 3, 6, 8];
function sceneRebuild(lt) {
  header(lt, '06', '丢了几块，照样重建', C_OK, '任意 8 块就够');
  bullet(0, '同时坏 4 块：还剩 8', T(lt, 4.0, 4.6));
  bullet(1, '剩下任意 8 块 → 重建', T(lt, 7.0, 7.6));
  bullet(2, '再坏 1 块：只剩 7，失败', T(lt, 13.0, 13.6));
  bullet(3, '块要分散到不同故障域', T(lt, 17.2, 17.8));
  const phC = lt >= 18.0;
  // 死亡集合
  let dead = [];
  if (!phC) { DEAD_A.forEach((k, i) => { if (lt >= 3.0 + i * 0.5) dead.push(k); }); if (lt >= 13.0) dead.push(10); }
  else [2, 5, 8, 11].forEach((k) => { if (lt >= 19.0) dead.push(k); });
  const deadRack = phC && lt >= 19.0 ? [2] : [];
  const alive = 12 - dead.length;
  racks(1, { dark: deadRack });
  for (let k = 0; k < 12; k++) {
    const isDead = dead.includes(k);
    const rb = !phC && lt > 7.4 && lt < 12.4 && !isDead;
    blk(k, slotRect(k), { dead: isDead, ring: rb ? C_OK : null });
  }
  // 顶部对象
  const ok = (!phC && lt >= 11.0 && lt < 13.0) || (phC && lt >= 21.5);
  const fail = !phC && lt >= 13.8;
  const prog = !phC ? eIO(P(lt, 8.0, 11.0)) : eIO(P(lt, 20.2, 21.6));
  text('原对象', 830, 230, { size: 22, color: MUTE });
  const bx = 830, by = 250, bw = 980, bh = 80;
  ctx.save();
  rr(bx, by, bw, bh, 14); ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = fail ? RED : 'rgba(255,255,255,0.2)'; ctx.setLineDash(fail || prog < 1 ? [9, 7] : []); ctx.stroke(); ctx.setLineDash([]);
  if (prog > 0 && !fail) { rr(bx + 4, by + 4, (bw - 8) * prog, bh - 8, 11); ctx.fillStyle = C_OK + '55'; glow(C_OK, 14); ctx.fill(); }
  ctx.restore();
  const label = fail ? '无法恢复' : prog >= 1 ? '重建完成 ✓' : prog > 0 ? '重建中…' : phC && lt < 19 ? '' : '原对象完好';
  text(label, bx + bw / 2, by + 52, { size: 32, weight: 800, align: 'center', color: fail ? RED : prog >= 1 ? C_OK : INK });
  // 重建流：存活块向上流
  if (!phC && lt > 7.8 && lt < 11.3) {
    let i = 0; for (let k = 0; k < 12; k++) { if (dead.includes(k) || k === 10) continue; const [x, y, w, h] = slotRect(k); const p = P(lt, 7.8 + i * 0.12, 9.6 + i * 0.12); packet(x + w / 2, y, 830 + 100 + i * 110, by + bh, eIO(p), blkColor(k), { r: 8 }); i++; }
  }
  // 计数
  const good = alive >= 8;
  statCard(110, 740, 640, '可用块 / 至少需要 8', `${alive} / 12`, { color: good ? C_OK : RED, a: T(lt, 1.0, 1.8), note: good ? '可恢复' : '不可恢复' });
  if (lt > 2 && !phC && lt < 3.0) text('磁盘会坏…', 830, 520, { size: 28, weight: 700, color: RED, a: T(lt, 1.8, 2.4) });
  if (phC && lt >= 19.0) text('整个机架 C 断电：丢 4 块，仍剩 8 块', 830, 540, { size: 26, weight: 700, color: C_OK, a: T(lt, 19.0, 19.8) });
  if (!phC && lt >= 13.0 && lt < 17.5) text('第 5 块也坏了', 830, 520, { size: 28, weight: 700, color: RED, a: T(lt, 13.0, 13.6) });
  if (!phC && lt >= 15.0 && lt < 17.8) text('5 块在同一故障域 = 一次故障全丢', 1230, 520, { size: 24, weight: 600, color: MUTE, a: T(lt, 15.0, 15.8) });
}

// ───────── 场景 7：对比 ─────────
function bRow(x, y, n, color, a, {w = 56, h = 28, gap = 8, perRow = 8, labels = null} = {}) {
  for (let i = 0; i < n; i++) { const p = eOut(P(a, i / n * 0.6, i / n * 0.6 + 0.4)); const cx = x + (i % perRow) * (w + gap), cy = y + Math.floor(i / perRow) * (h + 8);
    chipRect(cx, cy, w, h, typeof color === 'function' ? color(i) : color, '', { a: p, fill: 0.35 }); }
}
function sceneCompare(lt) {
  header(lt, '07', '纠删码 vs 三副本', C_IAM, '省空间，但更复杂');
  bullet(0, '编码/解码要计算', T(lt, 22.5, 23.1), { size: 28 });
  bullet(1, '读取要跨多个节点', T(lt, 24.3, 24.9), { size: 28 });
  bullet(2, '实现更复杂', T(lt, 25.8, 26.4), { size: 28 });
  const v1 = T(lt, 28.5, 29.4), v2 = T(lt, 30.5, 31.4);
  badge(110, 740, '延迟敏感 → 倾向复制', C_API, v1);
  badge(110, 810, '成本敏感大规模 → 倾向纠删码', C_OK, v2);
  // 行：原数据 / 三副本 / 8+4
  const X = 1010, gx = 830;
  text('原数据', gx, 245, { size: 26, weight: 700, color: MUTE, a: T(lt, 0.8, 1.4) });
  bRow(X, 224, 8, C_API, P(lt, 1.0, 2.0));
  mono('1 ×', 1560, 250, { size: 32, weight: 800, a: T(lt, 1.6, 2.2) });
  text('三副本', gx, 370, { size: 26, weight: 700, color: C_DATA, a: T(lt, 2.0, 2.6) });
  bRow(X, 330, 24, (i) => [C_API, C_DATA, C_DATA][Math.floor(i / 8)], P(lt, 2.4, 6.0));
  mono('3 ×', 1560, 395, { size: 32, weight: 800, color: C_DATA, a: T(lt, 4.5, 5.2) });
  text('额外 200%', 1660, 395, { size: 26, weight: 700, color: RED, a: T(lt, 5.0, 5.8) });
  text('8 + 4', gx, 540, { size: 26, weight: 700, color: C_IAM, a: T(lt, 7.0, 7.6) });
  bRow(X, 500, 12, (i) => (i < 8 ? C_API : C_IAM), P(lt, 7.4, 10.0), { perRow: 8 });
  mono('1.5 ×', 1560, 525, { size: 32, weight: 800, color: C_OK, a: T(lt, 9.2, 9.8) });
  text('额外 50%', 1690, 525, { size: 26, weight: 700, color: C_OK, a: T(lt, 9.6, 10.4) });
  text('同样大小的块；少占一半空间', X, 612, { size: 22, color: MUTE, a: T(lt, 10.2, 11.0) });
  // 耐久性
  const da = T(lt, 13.0, 13.8);
  glass(830, 630, 1000, 270, { a: da });
  text('耐久性（书中假设与引用）', 860, 676, { size: 24, weight: 700, a: da });
  text('硬盘年故障率 0.81%', 1500, 676, { size: 24, font: MONO, color: MUTE, a: da, align: 'left' });
  const barW = 660;
  text('三副本', 860, 740, { size: 26, weight: 700, color: C_DATA, a: T(lt, 14.0, 14.6) });
  const b1 = eOut(P(lt, 14.2, 16.0)); ctx.save(); ctx.globalAlpha *= T(lt, 14.0, 14.6); rr(980, 716, barW, 34, 17); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.restore();
  if (b1 > 0) { ctx.save(); ctx.fillStyle = C_DATA; glow(C_DATA, 14); rr(980, 716, Math.max(34, barW * 6 / 11 * b1), 34, 17); ctx.fill(); ctx.restore(); }
  text('约 6 个九', 1660, 744, { size: 26, weight: 800, font: MONO, a: T(lt, 15.2, 16) });
  text('8 + 4', 860, 810, { size: 26, weight: 700, color: C_IAM, a: T(lt, 17.0, 17.6) });
  const b2 = eOut(P(lt, 17.2, 19.4)); ctx.save(); ctx.globalAlpha *= T(lt, 17.0, 17.6); rr(980, 786, barW, 34, 17); ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill(); ctx.restore();
  if (b2 > 0) { ctx.save(); ctx.fillStyle = C_IAM; glow(C_IAM, 14); rr(980, 786, Math.max(34, barW * b2), 34, 17); ctx.fill(); ctx.restore(); }
  text('可达 11 个九', 1660, 814, { size: 26, weight: 800, font: MONO, a: T(lt, 18.4, 19.2) });
  text('取自书中引用的 Backblaze 模型，不是算法的固定保证', 860, 872, { size: 20, color: DIM, a: T(lt, 19.4, 20.2) });
}

// ───────── 场景 8：分段上传 ─────────
const PT = (i) => [840 + i * 162, 390, 150, 72];
const SLOT = (i) => [850 + i * 160, 690, 140, 66];
function sceneMultipart(lt) {
  header(lt, '08', '分段上传', C_API, '大文件分块传，失败只重传一块');
  bullet(0, '① 初始化 → upload_id', T(lt, 2.0, 2.6));
  bullet(1, '② 各块独立上传，返回 ETag', T(lt, 8.0, 8.6));
  bullet(2, '③ 失败的块单独重传', T(lt, 14.2, 14.8));
  bullet(3, '④ 提交块号 + ETag 才组装', T(lt, 19.0, 19.6));
  const fa = T(lt, 0.6, 1.4) * (1 - 0.0);
  chipRect(840, 250, 972, 64, C_API, '', { a: fa, fill: 0.16 });
  text('大文件（示意）', 864, 291, { size: 26, weight: 700, a: fa });
  const ia = T(lt, 2.0, 3.0);
  badge(1450, 258, 'upload_id = u-7f3a', C_IAM, ia);
  const sp = eIO(P(lt, 7.6, 8.6));
  const done = [0, 1, 2, 4, 5], upT = (i) => 9.2 + done.indexOf(i) * 0.8;
  const etag = (i) => `e${i + 1}`;
  const asm = eIO(P(lt, 22.0, 24.0));
  glass(830, 630, 990, 250, { a: T(lt, 7.4, 8.2), accent: asm > 0.9 ? C_OK : null });
  text('对象存储服务', 860, 668, { size: 22, color: MUTE, a: T(lt, 7.4, 8.2) });
  for (let i = 0; i < 6; i++) {
    const a = T(lt, 7.4, 8.2);
    const [sx, sy, sw, sh] = SLOT(i);
    ctx.save(); ctx.globalAlpha *= a * (1 - asm); rr(sx, sy, sw, sh, 12); ctx.strokeStyle = 'rgba(255,255,255,0.14)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
  }
  for (let i = 0; i < 6; i++) {
    const [px, py, pw, ph] = PT(i), [sx, sy, sw, sh] = SLOT(i);
    // 状态
    let pos = [px, py, pw, ph], col = C_API, ring = null, dead = false, extra = null, vis = true;
    const split = sp;
    // 切块前位置：沿大文件条
    const base = [840 + i * 162, 250 + (390 - 250) * split, 150, 64 + 8 * split];
    pos = base;
    if (i === 3) {
      const t1 = 14.0;
      if (lt >= t1 && lt < t1 + 0.9) { const p = eIO(P(lt, t1, t1 + 0.9)); pos = mix(base, [sx, 520, sw, sh], p); }
      else if (lt >= t1 + 0.9 && lt < 16.2) { pos = [sx, 520, sw, sh]; dead = true; }
      else if (lt >= 16.2) { const p = eIO(P(lt, 16.2, 17.2)); pos = mix([sx, 520, sw, sh], [sx, sy, sw, sh], p); extra = p; }
    } else {
      const t0 = upT(i);
      if (lt >= t0) { const p = eIO(P(lt, t0, t0 + 0.9)); pos = mix(base, [sx, sy, sw, sh], p); extra = p; }
    }
    if (split < 0.02) vis = false;
    if (vis) {
      const ass = lt >= 22.0;
      const aa = ass ? 1 - eIO(P(lt, 23.4, 24.2)) : 1;
      if (!ass || aa > 0) {
        const mpos = ass ? [lerp(pos[0], 860, asm), pos[1], lerp(pos[2], 940, 0), pos[3]] : pos;
        blkBlock(i, ass ? mix(pos, [850 + i * 150, 700, 150, 56], asm) : pos, dead, ass ? aa : 1);
      }
    }
    // ETag
    const ok = i === 3 ? lt >= 17.2 : lt >= upT(i) + 0.9;
    if (ok) mono(etag(i), sx + sw / 2, sy + sh + 28, { size: 22, color: C_IAM, align: 'center', weight: 700, a: T(lt, (i === 3 ? 17.2 : upT(i) + 0.9), (i === 3 ? 17.7 : upT(i) + 1.4)) * (1 - asm) });
  }
  if (lt >= 14.8 && lt < 16.2) text('块 4 失败', 1150, 560, { size: 26, weight: 700, color: RED, a: T(lt, 14.8, 15.3) });
  if (lt >= 16.2 && lt < 18.5) text('只重传块 4', 1150, 560, { size: 26, weight: 700, color: C_OK, a: T(lt, 16.2, 16.7) });
  // 提交
  const ca = T(lt, 19.4, 20.2) * (1 - T(lt, 21.8, 22.4));
  if (ca > 0) {
    glass(840, 520, 970, 90, { a: ca, accent: C_IAM });
    mono('complete(u-7f3a, [(1,e1) (2,e2) (3,e3) (4,e4) (5,e5) (6,e6)])', 862, 575, { size: 24, a: ca });
  }
  if (asm > 0.4) {
    const oa = T(lt, 23.2, 24.2);
    chipRect(850, 700, 900, 56, C_OK, '完整对象  ✓', { a: oa, fill: 0.22, size: 28, ring: C_OK });
  }
  text('没用的临时块 → 垃圾回收', 830, 912, { size: 22, color: MUTE, a: T(lt, 25.4, 26.2) });
}
function blkBlock(i, [x, y, w, h], dead, a) {
  chipRect(x, y, w, h, dead ? RED : C_API, `块 ${i + 1}`, { a, fill: dead ? 0.1 : 0.22, size: 24, dashed: dead, textColor: dead ? RED : INK });
  if (dead) cross(x + w / 2, y + h / 2, 14, a);
}

// ───────── 场景 9：对象版本 ─────────
const VY = [724, 604, 484, 364];
function verCard(i, label, oid, color, { a = 1, dashed = false, ring = null, dim = 1 } = {}) {
  if (a <= 0) return;
  const x = 1000, y = VY[i], w = 470, h = 96;
  ctx.save(); ctx.globalAlpha *= a * dim;
  glass(x, y, w, h, { accent: ring || color });
  if (dashed) { ctx.setLineDash([8, 7]); ctx.strokeStyle = color; ctx.lineWidth = 2.5; rr(x, y, w, h, 22); ctx.stroke(); ctx.setLineDash([]); }
  if (ring) { glow(ring, 22); ctx.strokeStyle = ring; ctx.lineWidth = 3.5; rr(x, y, w, h, 22); ctx.stroke(); ctx.shadowBlur = 0; }
  text(label, x + 28, y + 42, { size: 28, weight: 800, font: MONO, color });
  text(oid, x + 28, y + 76, { size: 22, color: MUTE, font: MONO });
  ctx.restore();
}
function sceneVersion(lt) {
  header(lt, '09', '对象版本', C_META, '不覆盖，只新增');
  bullet(0, '同键上传 → 新版本', T(lt, 2.0, 2.6));
  bullet(1, '默认读最新版本', T(lt, 7.0, 7.6));
  bullet(2, '删除 = 插入删除标记', T(lt, 11.0, 11.6));
  bullet(3, '指定版本号仍可读旧版', T(lt, 18.0, 18.6));
  text('键 report.pdf', 1000, 215, { size: 28, weight: 700, font: MONO, a: T(lt, 0.6, 1.2) });
  text('版本号 TIMEUUID（示意）', 1480, 215, { size: 22, color: MUTE, a: T(lt, 0.6, 1.2), align: 'left' });
  const ps = [1.4, 3.6, 5.4, 11.4];
  const pA = ps.map((t) => eBack(P(lt, t, t + 0.7)));
  const markerOn = lt >= 11.4;
  const readLatest = lt >= 7.4 && lt < 10.6;
  const read404 = lt >= 14.0 && lt < 17.4;
  const readV2 = lt >= 19.0;
  const names = ['v1', 'v2', 'v3'], oids = ['obj-1', 'obj-2', 'obj-3'];
  for (let i = 0; i < 3; i++) {
    if (pA[i] > 0.02) { const ty = (1 - clamp(pA[i])) * 40; ctx.save(); ctx.translate(0, ty); verCard(i, names[i], oids[i], [C_API, C_META, C_DATA][i], { a: clamp(pA[i] * 1.5), ring: (readLatest && i === 2) || (readV2 && i === 1) ? C_OK : null, dim: markerOn && !readV2 ? 0.55 : 1 }); ctx.restore(); }
  }
  if (pA[3] > 0.02) { ctx.save(); ctx.translate(0, (1 - clamp(pA[3])) * 40); verCard(3, '删除标记', 'delete marker · 无字节', RED, { a: clamp(pA[3] * 1.5), dashed: true }); ctx.restore(); }
  // GET 客户端
  const ga = T(lt, 6.4, 7.0);
  const ga2 = T(lt, 13.4, 14.0);
  const gx = 1600;
  if (readLatest) {
    box(gx, 500, 190, 80, 'GET key', { color: C_API, a: ga, size: 24 });
    arrow(gx, 540, 1490, 540, { color: C_API, p: eOut(P(lt, 7.4, 8.4)), a: 1 });
    const ra = T(lt, 8.6, 9.4); text('→ obj-3  200', gx - 20, 640, { size: 28, weight: 800, font: MONO, color: C_OK, a: ra });
  } else if (read404) {
    box(gx, 330, 190, 80, 'GET key', { color: C_API, a: ga2, size: 24 });
    arrow(gx, 380, 1490, 400, { color: C_API, p: eOut(P(lt, 14.0, 14.8)) });
    const ra = T(lt, 15.0, 15.8); text('最新是删除标记', gx - 30, 470, { size: 24, color: MUTE, a: ra }); text('→ 404', gx - 20, 520, { size: 40, weight: 900, font: MONO, color: RED, a: ra });
  } else if (readV2) {
    box(gx, 560, 190, 100, 'GET key', { color: C_API, a: T(lt, 18.6, 19.2), size: 24, sub: '?version=v2' });
    arrow(gx, 610, 1490, 650, { color: C_API, p: eOut(P(lt, 19.4, 20.4)) });
    const ra = T(lt, 20.6, 21.4); text('→ obj-2  200', gx - 20, 730, { size: 28, weight: 800, font: MONO, color: C_OK, a: ra });
  }
  if (lt >= 17.4 && lt < 18.8) text('旧版本字节还在', 1520, 790, { size: 24, color: MUTE, a: T(lt, 17.4, 18.0) });
}

// ───────── 总结 ─────────
function sceneEnd(lt) {
  text('S3 类对象存储', 110, 250, { size: 84, weight: 900, a: T(lt, 0.2, 0.9) });
  text('S3-like Object Storage', 112, 304, { size: 32, color: MUTE, font: MONO, a: T(lt, 0.4, 1.1) });
  [['分离', '元数据找 ID，ID 查数据节点', C_META], ['纠删码', '8+4：1.5 倍空间，块跨故障域', C_IAM], ['分段与版本', '大文件分块传，删除只加标记', C_API]].forEach(([w, s, c], k) => {
    const t0 = 1.2 + k * 1.8, p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 250, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: k === 2 ? 60 : 70, weight: 800 });
    text(s, x + 36, 624, { size: 24, color: MUTE });
    ctx.restore();
  });
  text('持久性 · 可用性 · 成本，要一起权衡', 110, 770, { size: 26, color: MUTE, a: T(lt, 7.0, 7.8) });
  text('示意数字与书中模型一致；真实系统以其文档为准', 110, 880, { size: 20, color: DIM, a: T(lt, 8.0, 8.8) });
  for (let k = 0; k < 12; k++) { const x = 1100 + (k % 6) * 60, y = 190 + Math.floor(k / 6) * 44; chipRect(x, y, 48, 32, blkColor(k), '', { a: T(lt, 0.4 + k * 0.08, 1.0 + k * 0.08) * 0.8, fill: 0.35 }); }
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = T(lt, 0.2, 1.2);
  text('系统设计面试 · 动画讲解', 110, 360, { size: 30, weight: 600, color: C_API, ls: 6, a });
  const g = ctx.createLinearGradient(110, 0, 800, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); const k = T(lt, 0.4, 1.4); ctx.globalAlpha *= k; ctx.translate(0, (1 - k) * 30);
  ctx.font = `900 120px ${SANS}`; ctx.fillStyle = g; ctx.letterSpacing = '2px'; ctx.fillText('S3 类对象存储', 104, 520); ctx.restore();
  text('S3-like Object Storage', 112, 590, { size: 40, color: MUTE, font: MONO, a: T(lt, 0.8, 1.6) });
  text('第 24 章', 112, 680, { size: 34, weight: 700, a: T(lt, 1.2, 2) });
  // 右侧：12 块飞入三机架
  const fa = T(lt, 1.6, 2.4);
  ctx.save(); ctx.globalAlpha *= 0.9;
  for (let r = 0; r < 3; r++) glass(1020 + r * 258, 300, 240, 420, { a: fa, r: 22, accent: null });
  for (let k = 0; k < 12; k++) {
    const r = k % 3, s = Math.floor(k / 3);
    const tx = 1036 + r * 258, ty = 330 + s * 96;
    const p = eIO(P(lt, 2.2 + k * 0.1, 3.4 + k * 0.1));
    const sx = 1000 + k * 50, sy = 160;
    chipRect(lerp(sx, tx, p), lerp(sy, ty, p), lerp(44, 208, p), lerp(34, 72, p), blkColor(k), p > 0.8 ? blkName(k) : '', { fill: 0.3, size: 24, a: T(lt, 1.8 + k * 0.06, 2.3 + k * 0.06) });
  }
  ctx.restore();
}

export const scenes = { title: sceneTitle, bucket: sceneBucket, split: sceneSplit, upload: sceneUpload, store: sceneStore, ec: sceneEC, rebuild: sceneRebuild, compare: sceneCompare, multipart: sceneMultipart, version: sceneVersion, end: sceneEnd };
