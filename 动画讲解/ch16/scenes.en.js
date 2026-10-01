// Chapter 16 Proximity Service: English scenes (shell and helpers from ../lib/core.js)
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC, rnd, rr, glass, text, glow, dot, badge, header as header0, arrow, box, packet, statCard, bullet } from '../lib/core.js';

export const meta = { no: 16, title: 'Proximity Service', en: 'Proximity Service' };

// 英文标题更宽：自适应字号，保证不超过左栏 640px
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

const CY = SC[0], IN = SC[1], PK = SC[2], AM = SC[3], LM = SC[4];
const hex = (c, a) => c + Math.round(clamp(a) * 255).toString(16).padStart(2, '0');

// ───────── Geohash 工具（真实算法） ─────────
const B32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function ghBits(lat, lon, nb) {
  const lo = [-180, 180], la = [-90, 90]; let even = true; const out = [];
  for (let i = 0; i < nb; i++) {
    const r = even ? lo : la, v = even ? lon : lat, mid = (r[0] + r[1]) / 2, bit = v >= mid ? 1 : 0;
    out.push({ dim: even ? 'lon' : 'lat', lo: r[0], hi: r[1], mid, bit, v });
    if (bit) r[0] = mid; else r[1] = mid; even = !even;
  }
  return out;
}
function ghEnc(lat, lon, n) {
  const b = ghBits(lat, lon, n * 5); let s = '';
  for (let i = 0; i < n; i++) { let x = 0; for (let j = 0; j < 5; j++) x = x * 2 + b[i * 5 + j].bit; s += B32[x]; }
  return s;
}
function ghBox(code) {
  const lon = [-180, 180], lat = [-90, 90]; let even = true;
  for (const ch of code) { const v = B32.indexOf(ch); for (let j = 4; j >= 0; j--) { const r = even ? lon : lat, m = (r[0] + r[1]) / 2; if ((v >> j) & 1) r[0] = m; else r[1] = m; even = !even; } }
  return { lon0: lon[0], lon1: lon[1], lat0: lat[0], lat1: lat[1] };
}
const UL = 37.77672, UO = -122.41673;               // 书中例子：纬度 37.776720，经度 -122.416730
const M_LAT = 111200, M_LON = 111200 * Math.cos((UL * Math.PI) / 180);

// 通用：地图底框
function mapFrame(x, y, w, h, a = 1, step = 0) {
  glass(x, y, w, h, { a, r: 22 });
  if (step) {
    ctx.save(); ctx.globalAlpha *= a * 0.5; ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
    for (let gx = x + step; gx < x + w; gx += step) { ctx.beginPath(); ctx.moveTo(gx, y + 6); ctx.lineTo(gx, y + h - 6); ctx.stroke(); }
    for (let gy = y + step; gy < y + h; gy += step) { ctx.beginPath(); ctx.moveTo(x + 6, gy); ctx.lineTo(x + w - 6, gy); ctx.stroke(); }
    ctx.restore();
  }
}
function tag(s, x, y, a = 1, align = 'right') { text(s, x, y, { size: 20, color: DIM, align, a }); }
function sRect(x, y, w, h, { stroke = null, fill = null, lw = 2, a = 1, g = 0, dash = null } = {}) {
  ctx.save(); ctx.globalAlpha *= a;
  if (dash) ctx.setLineDash(dash);
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
  if (stroke) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; if (g) glow(stroke, g); ctx.strokeRect(x, y, w, h); }
  ctx.restore();
}

// ───────── 场景 1：二维查询为什么慢 ─────────
const SM = { x: 820, y: 170, w: 1000, h: 740 };
const SD = Array.from({ length: 620 }, (_, i) => [SM.x + 24 + rnd(i * 3 + 1) * (SM.w - 48), SM.y + 24 + rnd(i * 3 + 2) * (SM.h - 48)]);
const SQ = { cx: 1320, cy: 540, r: 64 };
const sInBand = ([, y]) => Math.abs(y - SQ.cy) <= SQ.r;
const sInBox = ([x, y]) => sInBand([x, y]) && Math.abs(x - SQ.cx) <= SQ.r;
const sInCircle = ([x, y]) => Math.hypot(x - SQ.cx, y - SQ.cy) <= SQ.r;
const S_BAND = SD.filter(sInBand).length, S_BOX = SD.filter(sInBox).length, S_CIR = SD.filter(sInCircle).length;
function sceneSlow(lt) {
  header(lt, '01', 'Why 2D Queries Are Slow', RED, 'A range on latitude and longitude');
  const ma = eOut(P(lt, 0.3, 1.0));
  mapFrame(SM.x, SM.y, SM.w, SM.h, ma, 100);
  const bandP = eIO(P(lt, 12.2, 15.4)), lonP = eIO(P(lt, 16.0, 17.6)), cirP = eOut(P(lt, 18.0, 18.8));
  const bandRight = SM.x + bandP * SM.w;
  // 纬度横带
  if (bandP > 0) { ctx.save(); ctx.globalAlpha *= 0.9; ctx.fillStyle = hex(AM, 0.13); ctx.fillRect(SM.x, SQ.cy - SQ.r, bandP * SM.w, SQ.r * 2); ctx.restore(); sRect(SM.x, SQ.cy - SQ.r, bandP * SM.w, SQ.r * 2, { stroke: AM, lw: 2, a: 0.8 }); }
  if (lonP > 0) { ctx.save(); ctx.fillStyle = hex(CY, 0.1); ctx.fillRect(SQ.cx - SQ.r, SM.y + 8, SQ.r * 2, SM.h - 16); ctx.restore(); sRect(SQ.cx - SQ.r, SM.y + 8, SQ.r * 2, SM.h - 16, { stroke: CY, lw: 2, a: 0.7 * lonP }); }
  let nb = 0;
  SD.forEach((p, i) => {
    const inB = sInBand(p) && p[0] <= bandRight && bandP > 0, inX = sInBox(p) && lonP > 0.95, inC = sInCircle(p) && cirP > 0.5;
    if (inB) nb++;
    let c = '#7f8bb0', r = 3.2, al = 0.55;
    if (inB) { c = AM; r = 4.2; al = 0.95; }
    if (inX) { c = CY; r = 5; al = 1; }
    if (inC) { c = LM; r = 6; al = 1; }
    else if (cirP > 0.5 && (inB || sInBand(p))) al *= 0.35;
    dot(p[0], p[1], r, c, { g: inB ? 8 : 0, a: ma * al });
  });
  // 搜索圆
  const ca = eOut(P(lt, 1.8, 2.6));
  if (ca > 0) {
    ctx.save(); ctx.globalAlpha *= ca; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; glow('#ffffff', 14); ctx.beginPath(); ctx.arc(SQ.cx, SQ.cy, SQ.r * ca, 0, 7); ctx.stroke(); ctx.restore();
    dot(SQ.cx, SQ.cy, 7, '#fff', { g: 20, a: ca });
    text('Search radius: 500 m', SQ.cx + 76, SQ.cy - 88, { size: 22, weight: 700, a: ca });
  }
  tag('Illustrative: each dot is a business', SM.x + SM.w - 20, SM.y + SM.h - 18, ma);
  // 左栏：SQL
  const sa = eOut(P(lt, 4.0, 4.8));
  glass(110, 400, 640, 150, { a: sa, accent: IN });
  text('WHERE latitude  BETWEEN lat−r AND lat+r', 134, 452, { size: 22, font: MONO, color: AM, a: sa });
  text('AND   longitude BETWEEN long−r AND long+r', 134, 496, { size: 22, font: MONO, color: CY, a: sa });
  text('The book\'s naive SQL (illustrative)', 134, 534, { size: 20, color: MUTE, a: sa });
  bullet(0, 'Latitude index: scan the whole band', eOut(P(lt, 12.0, 12.8)), { y0: 610, color: AM });
  bullet(1, 'Then check longitude, drop most rows', eOut(P(lt, 15.8, 16.6)), { y0: 610, color: CY });
  const ka = eOut(P(lt, 18.0, 18.8));
  if (ka > 0) {
    glass(110, 700, 640, 180, { a: ka, accent: RED });
    text('This query', 140, 742, { size: 22, color: MUTE, a: ka });
    text('Scanned', 140, 800, { size: 28, color: AM, a: ka }); text(`${S_BAND}`, 262, 800, { size: 44, weight: 800, font: MONO, color: AM, a: ka });
    text('Only', 380, 800, { size: 28, color: LM, a: ka }); text(`${S_CIR}`, 450, 800, { size: 44, weight: 800, font: MONO, color: LM, a: ka });
    text('are really inside the circle (illustrative)', 140, 856, { size: 24, color: MUTE, a: ka });
  }
  void nb;
}

// ───────── 场景 2：Geohash 逐位二分 ─────────
const GB = ghBits(UL, UO, 30);
const GBOX = [{ lon0: -180, lon1: 180, lat0: -90, lat1: 90 }];
GB.forEach((s) => { const b = { ...GBOX[GBOX.length - 1] }; if (s.dim === 'lon') { s.bit ? (b.lon0 = s.mid) : (b.lon1 = s.mid); } else { s.bit ? (b.lat0 = s.mid) : (b.lat1 = s.mid); } GBOX.push(b); });
const GCODE = ghEnc(UL, UO, 6);
const GM = { x: 830, y: 190, w: 960, h: 480 };
const gx = (lon) => GM.x + ((lon + 180) / 360) * GM.w, gy = (lat) => GM.y + ((90 - lat) / 180) * GM.h;
const gbT = (i) => (i === 0 ? 4.6 : i === 1 ? 9.0 : i < 10 ? 12.0 + (i - 2) * 0.6 : 16.4 + (i - 10) * 0.05);
function sceneGeohash(lt) {
  header(lt, '02', 'Geohash: Bit by Bit', CY, 'Alternate cuts, one bit per cut');
  const ma = eOut(P(lt, 0.3, 1.0));
  mapFrame(GM.x - 10, GM.y - 10, GM.w + 20, GM.h + 20, ma);
  ctx.save(); ctx.globalAlpha *= ma;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.moveTo(gx(0), GM.y); ctx.lineTo(gx(0), GM.y + GM.h); ctx.moveTo(GM.x, gy(0)); ctx.lineTo(GM.x + GM.w, gy(0)); ctx.stroke(); ctx.setLineDash([]);
  ctx.restore();
  text('Prime meridian', gx(0) + 8, GM.y + 26, { size: 20, color: MUTE, a: ma }); text('Equator', GM.x + GM.w - 92, gy(0) - 10, { size: 20, color: MUTE, a: ma });
  let n = 0; for (let i = 0; i < 30; i++) if (lt >= gbT(i)) n = i + 1;
  const cur = Math.min(n - 1, 9);
  for (let j = 0; j < Math.min(cur, 10); j++) {
    const s = GB[j], b = GBOX[j]; ctx.save(); ctx.globalAlpha *= 0.5; ctx.strokeStyle = s.dim === 'lon' ? CY : PK; ctx.lineWidth = 2;
    ctx.beginPath(); if (s.dim === 'lon') { ctx.moveTo(gx(s.mid), gy(b.lat1)); ctx.lineTo(gx(s.mid), gy(b.lat0)); } else { ctx.moveTo(gx(b.lon0), gy(s.mid)); ctx.lineTo(gx(b.lon1), gy(s.mid)); } ctx.stroke(); ctx.restore();
  }
  if (cur >= 0) {
    const s = GB[cur], b = GBOX[cur], nb = GBOX[cur + 1], p = P(lt, gbT(cur), gbT(cur) + 0.9), col = s.dim === 'lon' ? CY : PK;
    sRect(gx(b.lon0), gy(b.lat1), gx(b.lon1) - gx(b.lon0), gy(b.lat0) - gy(b.lat1), { stroke: AM, lw: 2, a: 0.8 });
    const q = eIO(clamp(p * 1.6));
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 4; glow(col, 14); ctx.beginPath();
    if (s.dim === 'lon') { const yc = (gy(b.lat1) + gy(b.lat0)) / 2, hh = (gy(b.lat0) - gy(b.lat1)) / 2 * q; ctx.moveTo(gx(s.mid), yc - hh); ctx.lineTo(gx(s.mid), yc + hh); }
    else { const xc = (gx(b.lon0) + gx(b.lon1)) / 2, hw = (gx(b.lon1) - gx(b.lon0)) / 2 * q; ctx.moveTo(xc - hw, gy(s.mid)); ctx.lineTo(xc + hw, gy(s.mid)); }
    ctx.stroke(); ctx.restore();
    const fa = clamp((p - 0.5) * 2);
    sRect(gx(nb.lon0), gy(nb.lat1), gx(nb.lon1) - gx(nb.lon0), gy(nb.lat0) - gy(nb.lat1), { fill: hex(col, 0.2 * fa), stroke: col, lw: 3, a: fa, g: 12 });
  }
  const pa = eOut(P(lt, 3.0, 3.8));
  dot(gx(UO), gy(UL), 8, AM, { g: 20, a: pa });
  text('This shop  37.77672, −122.41673', gx(UO) + 16, gy(UL) - 16, { size: 22, weight: 600, color: AM, a: pa });
  // 左栏：当前这一位
  if (n > 0) {
    const s = GB[Math.min(n - 1, 9)], k = Math.min(n - 1, 9), col = s.dim === 'lon' ? CY : PK, a = eOut(P(lt, gbT(k), gbT(k) + 0.5));
    glass(110, 400, 640, 210, { accent: col });
    text(`Bit ${k + 1}`, 140, 450, { size: 26, weight: 800, font: MONO, color: col });
    text(s.dim === 'lon' ? 'Cut longitude (left/right)' : 'Cut latitude (top/bottom)', 290, 450, { size: 26, weight: 700, color: col });
    text(`Range [${s.lo.toFixed(1)}, ${s.hi.toFixed(1)}]  mid ${s.mid.toFixed(1)}`, 140, 500, { size: 24, font: MONO, color: MUTE });
    const v = s.v.toFixed(2);
    text(`${v} ${s.bit ? '≥' : '<'} ${s.mid.toFixed(1)}  →  bit `, 140, 566, { size: 30, weight: 700, font: MONO, a: 0.6 + 0.4 * a });
    text(String(s.bit), 724, 570, { size: 60, weight: 900, font: MONO, color: col, align: 'right', a: a });
  }
  // 位串
  const gw = 28, gap = 2, gg = 12, bx0 = 842, by0 = 724;
  const bxy = (i) => bx0 + Math.floor(i / 5) * (5 * (gw + gap) - gap + gg) + (i % 5) * (gw + gap);
  text('lon bits', bx0, by0 - 12, { size: 20, color: CY, weight: 700, a: ma }); text('lat bits', bx0 + 100, by0 - 12, { size: 20, color: PK, weight: 700, a: ma });
  for (let i = 0; i < 30; i++) {
    const on = lt >= gbT(i), col = GB[i].dim === 'lon' ? CY : PK, a = on ? eOut(P(lt, gbT(i), gbT(i) + 0.3)) : 0;
    ctx.save(); rr(bxy(i), by0, gw, 40, 6); ctx.fillStyle = on ? hex(col, 0.16 * a) : 'rgba(255,255,255,0.04)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = on ? hex(col, 0.9) : 'rgba(255,255,255,0.1)'; ctx.stroke(); ctx.restore();
    if (on) text(String(GB[i].bit), bxy(i) + gw / 2, by0 + 29, { size: 24, weight: 800, font: MONO, align: 'center', color: INK, a });
  }
  if (lt > 17.0) text('…keep cutting, 30 bits in all', bx0 + 960 - 6, by0 - 12, { size: 20, color: MUTE, align: 'right', a: eOut(P(lt, 17.0, 17.8)) });
  // 五位一字符
  for (let k = 0; k < 6; k++) {
    const t0 = 18.0 + k * 0.45, a = eOut(P(lt, t0, t0 + 0.5)); if (a <= 0) continue;
    const cx = bxy(k * 5) + (5 * (gw + gap) - gap) / 2;
    ctx.save(); ctx.globalAlpha *= a; ctx.strokeStyle = AM; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bxy(k * 5), by0 + 54); ctx.lineTo(bxy(k * 5) + 5 * (gw + gap) - gap, by0 + 54); ctx.stroke(); ctx.restore();
    text(GCODE[k], cx, by0 + 124, { size: 68, weight: 900, font: MONO, align: 'center', color: k < 5 ? INK : AM, a });
  }
  const fa = eOut(P(lt, 21.2, 22.0));
  text('every 5 bits → one base32 character', bx0 + 960 - 6, by0 + 168, { size: 22, color: MUTE, font: MONO, align: 'right', a: eOut(P(lt, 17.4, 18.2)) });
  if (fa > 0) { glass(110, 650, 640, 120, { a: fa, accent: AM }); text('This shop\'s Geohash', 140, 696, { size: 22, color: MUTE, a: fa }); text(GCODE, 140, 750, { size: 54, weight: 900, font: MONO, color: AM, a: fa }); }
}

// ───────── 场景 3：前缀越长，格子越小 ─────────
function childGrid(parent, cols, rows) { // 在 parent 码下，点所在的子格 (col,row) 及每个子格的末位字符
  const b = ghBox(parent), nxt = ghEnc(UL, UO, parent.length + 1), pb = ghBox(nxt);
  const col = Math.floor((UO - b.lon0) / ((b.lon1 - b.lon0) / cols)), row = Math.floor((b.lat1 - UL) / ((b.lat1 - b.lat0) / rows));
  const chars = []; for (let r = 0; r < rows; r++) { chars.push([]); for (let c = 0; c < cols; c++) chars[r].push(ghEnc(b.lat1 - (r + 0.5) * ((b.lat1 - b.lat0) / rows), b.lon0 + (c + 0.5) * ((b.lon1 - b.lon0) / cols), parent.length + 1).slice(-1)); }
  void pb; return { col, row, chars };
}
const G4 = GCODE.slice(0, 4), G5 = GCODE.slice(0, 5);
const CG1 = childGrid(G4, 8, 4), CG2 = childGrid(G5, 4, 8);
const PXS = [820, 1170, 1520];
const RADIUS_TABLE = [['0.5 km', 6], ['1 km', 5], ['2 km', 5], ['5 km', 4], ['20 km', 4]];
function scenePrefix(lt) {
  header(lt, '03', 'Longer Prefix, Smaller Cell', IN, 'Shared prefix = same bigger cell');
  const pw = 320, ph = 320, py = 300;
  [[0, 1.0, `Length 4`, G4, 8, 4, CG1], [1, 3.2, `Length 5`, G5, 4, 8, CG2], [2, 5.4, `Length 6`, GCODE, 1, 1, null]].forEach(([k, t0, title, code, cols, rows, cg]) => {
    const a = eOut(P(lt, t0, t0 + 0.8)); if (a <= 0) return;
    const x = PXS[k]; ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - a) * 24);
    glass(x - 8, py - 8, pw + 16, ph + 16, { r: 18, accent: k === 2 ? AM : null });
    text(title, x, py - 22, { size: 26, weight: 800, color: k === 2 ? AM : IN });
    if (cg) {
      const cw = pw / cols, chh = ph / rows;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const hit = r === cg.row && c === cg.col; sRect(x + c * cw, py + r * chh, cw, chh, { stroke: hit ? AM : 'rgba(255,255,255,0.14)', fill: hit ? hex(AM, 0.22) : null, lw: hit ? 3 : 1 });
        text(cg.chars[r][c], x + c * cw + cw / 2, py + r * chh + chh / 2 + 8, { size: 22, font: MONO, weight: hit ? 800 : 500, color: hit ? AM : DIM, align: 'center' });
      }
    } else { sRect(x, py, pw, ph, { stroke: AM, fill: hex(AM, 0.14), lw: 3, g: 14 }); dot(x + pw * 0.55, py + ph * 0.45, 8, '#fff', { g: 18 }); text('This shop', x + pw * 0.55 + 14, py + ph * 0.45 - 14, { size: 22, weight: 600 }); }
    ctx.restore();
    // 前缀串
    const sa = a; ctx.save(); ctx.font = `800 40px ${MONO}`; const w0 = ctx.measureText(code.slice(0, 4)).width; ctx.restore();
    text(code.slice(0, 4), x + 20, py + ph + 70, { size: 40, weight: 800, font: MONO, color: IN, a: sa });
    if (code.length > 4) text(code.slice(4), x + 20 + w0, py + ph + 70, { size: 40, weight: 800, font: MONO, color: AM, a: sa });
  });
  const za = eOut(P(lt, 3.2, 4.0)), zb = eOut(P(lt, 5.4, 6.2));
  [[0, za], [1, zb]].forEach(([k, a]) => { if (a <= 0) return; const x = PXS[k] + pw + 8, cg = k === 0 ? CG1 : CG2; void cg; arrow(x + 2, py + ph / 2, PXS[k + 1] - 14, py + ph / 2, { color: AM, a, w: 3, head: 10 }); });
  text('Illustrative: cell proportions stretched', 1840, 900, { size: 20, color: DIM, align: 'right', a: eOut(P(lt, 5, 6)) });
  bullet(0, 'Same prefix → same big cell', eOut(P(lt, 4.6, 5.4)), { color: IN });
  bullet(1, 'Longer prefix → smaller area', eOut(P(lt, 8.4, 9.2)), { color: AM });
  const ta = eOut(P(lt, 11.8, 12.6));
  text('Length by radius (book\'s table)', 110, 600, { size: 24, color: MUTE, a: ta });
  RADIUS_TABLE.forEach(([r, n], i) => {
    const t0 = [14.4, 16.2, 17.2, 18.4, 19.4][i], a = eOut(P(lt, t0, t0 + 0.6)), y = 620 + i * 58;
    glass(110, y, 640, 50, { a, r: 14, accent: n === 6 ? AM : n === 5 ? IN : CY });
    text(`Radius ${r}`, 138, y + 34, { size: 26, weight: 600, a });
    text(`→  length ${n}`, 400, y + 34, { size: 28, weight: 800, font: MONO, color: n === 6 ? AM : n === 5 ? IN : CY, a });
  });
}

// ───────── 场景 4：九格半径查询（书中例子） ─────────
const NC = ghBox(GCODE), CW = NC.lon1 - NC.lon0, CHT = NC.lat1 - NC.lat0;
const NS = 0.33, NCX = 1320, NCY = 520;
const nxp = (lon) => NCX + (lon - (NC.lon0 + CW / 2)) * M_LON * NS, nyp = (lat) => NCY - (lat - (NC.lat0 + CHT / 2)) * M_LAT * NS;
const NCELL = []; for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) { const clon = NC.lon0 + CW * (c + 0.5), clat = NC.lat0 + CHT * (1 - r - 0.5) + 0 * r; NCELL.push({ r, c, code: ghEnc(NC.lat1 - CHT * (r + 0.5), NC.lon0 + CW * (c + 0.5), 6), x: nxp(NC.lon0 + CW * c), y: nyp(NC.lat1 - CHT * r), w: CW * M_LON * NS, h: CHT * M_LAT * NS, center: r === 0 && c === 0 }); void clon; void clat; }
const NB = Array.from({ length: 110 }, (_, i) => { const near = i % 5 < 2; const x = near ? NCX + (rnd(i * 5 + 1) - 0.5) * 520 : NCX + (rnd(i * 5 + 1) - 0.5) * 940, y = near ? NCY + (rnd(i * 5 + 2) - 0.5) * 340 : NCY + (rnd(i * 5 + 2) - 0.5) * 590; return { x, y, id: 100 + Math.floor(rnd(i * 7 + 3) * 900) }; });
const NUX = nxp(UO), NUY = nyp(UL), NRP = 500 * NS;
const nInC = (b) => Math.hypot(b.x - NUX, b.y - NUY) <= NRP;
const N_IN = NB.filter(nInC).length;
const nCellOf = (b) => NCELL.find((c) => b.x >= c.x && b.x < c.x + c.w && b.y >= c.y && b.y < c.y + c.h);
function sceneNine(lt) {
  header(lt, '04', 'The Nine-Cell Query', LM, 'The book\'s example: 500 m');
  const ma = eOut(P(lt, 0.3, 1.0));
  const gw = NCELL[0].w * 3, gh = NCELL[0].h * 3, gx0 = NCELL[0].x, gy0 = NCELL[0].y;
  mapFrame(gx0 - 28, gy0 - 28, gw + 56, gh + 56, ma);
  const own = eOut(P(lt, 14.0, 14.8));
  NCELL.forEach((c, i) => {
    const t0 = c.center ? 16.4 : 17.4 + (i > 4 ? i - 1 : i) * 0.3, a = eOut(P(lt, t0, t0 + 0.5)), pulse = P(lt, 19.8, 20.6);
    sRect(c.x, c.y, c.w, c.h, { stroke: 'rgba(255,255,255,0.1)', lw: 1, a: ma });
    if (a > 0) {
      const col = c.center ? AM : IN, fc = lt > 19.8 ? AM : col;
      sRect(c.x, c.y, c.w, c.h, { stroke: fc, fill: hex(fc, lt > 19.8 ? 0.1 + 0.1 * Math.sin(pulse * Math.PI) : c.center ? 0.12 : 0.07), lw: c.center ? 3 : 2, a, g: c.center ? 14 : 0 });
      text(c.code, c.x + c.w / 2, c.y + 30, { size: 22, weight: 700, font: MONO, align: 'center', color: fc, a });
    }
    void own;
  });
  // 商家
  const fa = P(lt, 19.8, 21.6), flt = P(lt, 23.0, 24.0);
  NB.forEach((b, i) => {
    const inC = nInC(b); let c = '#7f8bb0', al = 0.5, r = 3.6;
    if (fa > 0) { c = AM; al = 0.9; r = 4.6; }
    if (flt > 0.2) { if (inC) { c = LM; al = 1; r = 6; } else al = 0.22; }
    dot(b.x, b.y, r, c, { g: inC && flt > 0.2 ? 10 : 0, a: ma * al * clamp(P(lt, 0.8 + i * 0.008, 1.4 + i * 0.008)) });
  });
  // 用户与圆
  const ua = eOut(P(lt, 2.4, 3.0)), ca = eOut(P(lt, 11.4, 12.4));
  dot(NUX, NUY, 8, '#fff', { g: 22, a: ua });
  if (ca > 0) { ctx.save(); ctx.globalAlpha *= ca; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; glow('#fff', 12); ctx.beginPath(); ctx.arc(NUX, NUY, NRP * ca, 0, 7); ctx.stroke(); ctx.restore(); text('r = 500 m', NUX + NRP * 0.72, NUY - NRP * 0.72 - 10, { size: 24, weight: 700, a: ca }); }
  // 每格商家数（取回后）
  if (fa > 0.4) NCELL.forEach((c) => { const n = NB.filter((b) => nCellOf(b) === c).length; text(`${n} shops`, c.x + c.w - 12, c.y + c.h - 12, { size: 20, weight: 700, font: MONO, align: 'right', color: AM, a: eOut(P(lt, 20.2, 21.0)) }); });
  tag('Illustrative: random business locations', gx0 + gw + 24, gy0 + gh + 52, ma);
  // 左栏
  const ka = eOut(P(lt, 2.4, 3.2));
  glass(110, 380, 640, 134, { a: ka, accent: IN });
  text('latitude    37.776720', 140, 428, { size: 26, font: MONO, a: ka }); text('longitude -122.416730', 140, 470, { size: 26, font: MONO, a: ka }); text('radius      500 m', 140, 504, { size: 20, color: MUTE, font: MONO, a: ka });
  bullet(0, '① 500 m radius → length 6', eOut(P(lt, 13.8, 14.6)), { y0: 570, step: 56, size: 28, color: INK });
  bullet(1, '② Own cell + 8 neighbors', eOut(P(lt, 16.4, 17.2)), { y0: 570, step: 56, size: 28, color: AM });
  bullet(2, '③ Fetch business IDs in parallel', eOut(P(lt, 19.8, 20.6)), { y0: 570, step: 56, size: 28, color: AM });
  bullet(3, '④ Filter by real distance', eOut(P(lt, 23.0, 23.8)), { y0: 570, step: 56, size: 28, color: LM });
  const sa = eOut(P(lt, 21.8, 22.6));
  if (sa > 0) {
    glass(110, 780, 640, 110, { a: sa, accent: LM });
    text('Candidates', 140, 846, { size: 26, color: AM, a: sa }); text(String(NB.length), 290, 846, { size: 48, weight: 800, font: MONO, color: AM, a: sa });
    const k = eOut(P(lt, 23.2, 24.0)); text('→', 410, 846, { size: 36, color: MUTE, a: k }); text('Inside', 470, 846, { size: 26, color: LM, a: k }); text(String(Math.round(N_IN * k)), 570, 846, { size: 48, weight: 800, font: MONO, color: LM, a: k });
  }
}

// ───────── 场景 5：边界问题 ─────────
const BC = ghBox(GCODE), BE = ghBox(ghEnc(UL, BC.lon1 + 0.0001, 6)), BCODE_E = ghEnc(UL, BC.lon1 + 0.0001, 6);
function sceneBoundary(lt) {
  header(lt, '05', 'Boundary Problem', RED, 'Close does not mean same prefix');
  const fadeA = 1 - eOut(P(lt, 13.4, 14.4)), fadeB = eOut(P(lt, 14.2, 15.2));
  const BS = 0.5, bxA = 840, byA = 400, cw = CW * M_LON * BS, chh = CHT * M_LAT * BS, bxm = bxA + cw;
  if (fadeA > 0) {
    ctx.save(); ctx.globalAlpha *= fadeA;
    const ma = eOut(P(lt, 0.4, 1.2));
    mapFrame(bxA - 24, byA - 60, cw * 2 + 48, chh + 110, ma);
    const hotA = lt > 11.4, pa = 0.5 + 0.5 * Math.sin(lt * 5);
    [[bxA, GCODE, IN], [bxm, BCODE_E, PK]].forEach(([x, code, col], k) => {
      const a = eOut(P(lt, 2.2 + k * 0.5, 3.0 + k * 0.5)), cc = hotA ? AM : col;
      sRect(x, byA, cw, chh, { stroke: cc, fill: hex(cc, hotA ? 0.1 + 0.08 * pa : 0.08), lw: 3, a, g: hotA ? 12 : 0 });
      text(code, x + cw / 2, byA + chh + 38, { size: 30, weight: 800, font: MONO, color: cc, align: 'center', a });
    });
    const da = eBack(P(lt, 3.6, 4.4));
    if (da > 0.02) {
      const ax = bxm - 22, bx2 = bxm + 22, yy = byA + chh * 0.45;
      dot(ax, yy, 11, IN, { g: 18, a: clamp(da) }); dot(bx2, yy, 11, PK, { g: 18, a: clamp(da) });
      text('A', ax - 8, yy - 28, { size: 26, weight: 800, color: IN, align: 'right', a: clamp(da) }); text('B', bx2 + 8, yy - 28, { size: 26, weight: 800, color: PK, a: clamp(da) });
      const la = eOut(P(lt, 4.8, 5.6)); if (la > 0) { arrow(ax + 14, yy + 30, bx2 - 14, yy + 30, { color: '#fff', a: la, w: 2, head: 8 }); text('A and B are tens of meters apart (illustrative)', bxm, byA + chh + 90, { size: 22, color: MUTE, align: 'center', a: la }); }
    }
    const ea = eOut(P(lt, 5.8, 6.6));
    text('Across the line: last character differs', bxA + cw, byA - 76 + 0, { size: 24, weight: 700, color: RED, align: 'center', a: ea });
    ctx.restore();
  }
  // 左栏
  const ga = eOut(P(lt, 6.8, 7.6)) * fadeA;
  glass(110, 400, 640, 210, { a: ga, accent: RED });
  text('Across the equator (illustrative)', 140, 446, { size: 22, color: MUTE, a: ga });
  text('Lat  0.001', 140, 504, { size: 26, font: MONO, a: ga }); text(ghEnc(0.001, 10, 6), 440, 504, { size: 36, font: MONO, weight: 800, color: IN, a: ga });
  text('Lat −0.001', 140, 560, { size: 26, font: MONO, a: ga }); text(ghEnc(-0.001, 10, 6), 440, 560, { size: 36, font: MONO, weight: 800, color: PK, a: ga });
  const na = eOut(P(lt, 11.4, 12.2));
  bullet(0, 'So: query the neighbor cells too', na, { y0: 670, color: AM });
  // B：精度太细
  if (fadeB > 0) {
    ctx.save(); ctx.globalAlpha *= fadeB;
    const b7 = ghBox(ghEnc(UL, UO, 7)), w7 = (b7.lon1 - b7.lon0), h7 = (b7.lat1 - b7.lat0), S = 0.5;
    const X0 = 1320, Y0 = 520, px = (lon) => X0 + (lon - UO) * M_LON * S, py = (lat) => Y0 - (lat - UL) * M_LAT * S;
    const cwp = w7 * M_LON * S, chp = h7 * M_LAT * S;
    mapFrame(830, 190, 980, 700, 1);
    ctx.save(); ctx.beginPath(); ctx.rect(842, 202, 956, 676); ctx.clip();
    const c0 = Math.floor((UO - 700 / M_LON / 1 * 0 - b7.lon0) / w7);
    for (let r = -6; r <= 6; r++) for (let c = -9; c <= 9; c++) {
      const x = px(b7.lon0 + c * w7), y = py(b7.lat1 - r * h7);
      const near = Math.hypot(Math.max(0, Math.abs(x + cwp / 2 - X0) - cwp / 2), Math.max(0, Math.abs(y + chp / 2 - Y0) - chp / 2)) <= 250;
      const in9 = Math.abs(c) <= 1 && Math.abs(r) <= 1, expand = eOut(P(lt, 20.0, 21.2));
      let stroke = 'rgba(255,255,255,0.08)', fill = null;
      if (in9) { stroke = AM; fill = hex(AM, 0.22); } else if (near && expand > 0) { stroke = LM; fill = hex(LM, 0.16 * expand); }
      sRect(x, y, cwp, chp, { stroke, fill, lw: in9 || (near && expand > 0) ? 1.5 : 1 });
    }
    void c0;
    ctx.restore();
    const ca = eOut(P(lt, 15.6, 16.4));
    ctx.save(); ctx.globalAlpha *= ca; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; glow('#fff', 10); ctx.beginPath(); ctx.arc(X0, Y0, 250, 0, 7); ctx.stroke(); ctx.restore();
    dot(X0, Y0, 7, '#fff', { g: 16, a: ca });
    const ta = eOut(P(lt, 17.0, 17.8));
    text('The nine cells, length 7', X0 - 4, Y0 - 100, { size: 24, weight: 700, color: AM, align: 'center', a: ta });
    text('Can\'t cover the 500 m circle', X0, Y0 + 330, { size: 28, weight: 800, color: RED, align: 'center', a: eOut(P(lt, 19.4, 20.2)) });
    ctx.restore();
    text('Length 7: cells ~100 m wide', 110, 400, { size: 28, weight: 700, color: AM, a: fadeB });
    text('Nine cells aren\'t enough → expand', 110, 450, { size: 28, weight: 700, color: LM, a: eOut(P(lt, 20.0, 20.8)) });
  }
  void BE;
}

// ───────── 场景 6：完整查询链路 ─────────
function sceneFlow(lt) {
  header(lt, '06', 'A Query, End to End', AM, 'Find cells, fetch, then filter');
  const A = (t, d = 0.6) => eOut(P(lt, t, t + d));
  const bx = { cl: [830, 300, 170, 92], lb: [1070, 300, 170, 92], lbs: [1310, 300, 200, 92], geo: [1130, 580, 270, 104], biz: [1510, 580, 290, 104] };
  box(...bx.cl, 'Client', { color: IN, sub: 'lat·lon·radius', a: A(0.5), size: 26 });
  box(...bx.lb, 'Load Balancer', { color: SC[3], a: A(3.0), size: 22 });
  if (lt > 9.0) { const k = A(9.0); ctx.save(); ctx.globalAlpha *= k * 0.6; for (let i = 2; i >= 1; i--) { glass(bx.lbs[0] + i * 14, bx.lbs[1] - i * 14, bx.lbs[2], bx.lbs[3], { r: 18, accent: CY }); } ctx.restore(); }
  box(...bx.lbs, 'LBS', { color: CY, sub: 'stateless', a: A(5.0), size: 26 });
  box(...bx.geo, 'Geohash Redis', { color: PK, sub: 'cell → business IDs', a: A(13.4), size: 26 });
  box(...bx.biz, 'Business Redis', { color: LM, sub: 'ID → name·address', a: A(17.4), size: 26 });
  const p1 = eOut(P(lt, 3.0, 4.0)), p2 = eOut(P(lt, 5.2, 6.2));
  arrow(1000, 346, 1068, 346, { color: MUTE, p: p1, w: 3, head: 11 }); arrow(1240, 346, 1308, 346, { color: MUTE, p: p2, w: 3, head: 11 });
  [[3.4, 830 + 170, 1070], [5.6, 1240, 1310]].forEach(([t0, xa, xb]) => { const p = P(lt, t0, t0 + 1.4); if (p > 0 && p < 1) packet(xa, 346, xb, 346, eIO(p), AM, { r: 9 }); });
  // LBS -> Geohash Redis：9 个格子并行
  const par = P(lt, 14.0, 15.6);
  const ga = A(13.4); arrow(1410, 396, 1300, 578, { color: MUTE, p: ga, w: 3, head: 11 });
  for (let i = 0; i < 9; i++) { const p = P(lt, 14.2 + i * 0.05, 15.4 + i * 0.05); if (p > 0 && p < 1) { const e = eIO(p); dot(lerp(1380 + (i % 3) * 14 - 14, 1250 + (i % 3) * 14 - 14, e), lerp(400 + Math.floor(i / 3) * 12, 580 + Math.floor(i / 3) * 12, e), 6, PK, { g: 10 }); } }
  if (par > 0) text('×9 parallel', 1250, 548, { size: 22, weight: 700, color: PK, align: 'center', a: A(14.2) });
  const ba = A(17.4); arrow(1400, 632, 1508, 632, { color: MUTE, p: ba, w: 3, head: 11 });
  const q = P(lt, 18.2, 19.4); if (q > 0 && q < 1) packet(1400, 632, 1508, 632, eIO(q), LM, { r: 9 });
  // 结果返回
  const rt = P(lt, 20.2, 22.2);
  if (rt > 0) {
    const pts = [[1655, 580], [1655, 440], [1410, 396]]; void pts;
    arrow(1655, 578, 1655, 470, { color: LM, p: clamp(rt * 3), w: 3, head: 11, a: 0.8 });
    if (rt > 0.34) arrow(1655, 470, 1512, 380, { color: LM, p: clamp((rt - 0.34) * 3), w: 3, head: 11, a: 0.8 });
    text('By distance', 1670, 520, { size: 24, weight: 700, color: LM, a: A(20.6) });
  }
  // 左栏：缓存键
  const ca = A(13.4);
  text('Two kinds of cache entries (book\'s table)', 110, 410, { size: 24, color: MUTE, a: ca });
  glass(110, 424, 640, 70, { a: ca, r: 16, accent: PK }); text('geohash', 134, 470, { size: 28, font: MONO, weight: 800, color: PK, a: ca }); text('→ business IDs in the cell', 300, 470, { size: 26, a: ca });
  const cb = A(17.4);
  glass(110, 508, 640, 70, { a: cb, r: 16, accent: LM }); text('business_id', 134, 554, { size: 28, font: MONO, weight: 800, color: LM, a: cb }); text('→ name · address · reviews', 372, 554, { size: 26, a: cb });
  const ka = A(22.0), kb = A(24.8);
  text('What should the cache key be?', 110, 650, { size: 26, weight: 700, a: ka });
  glass(110, 672, 640, 84, { a: ka, r: 18, accent: RED }); text('GPS', 134, 724, { size: 30, weight: 700, color: RED, a: ka }); text('changes as you move: misses', 290, 724, { size: 26, color: MUTE, a: ka });
  glass(110, 776, 640, 84, { a: kb, r: 18, accent: LM }); text('Geohash', 134, 828, { size: 30, weight: 700, color: LM, font: MONO, a: kb }); text('one key per cell, reusable', 290, 828, { size: 26, color: MUTE, a: kb });
}

// ───────── 四叉树数据（场景 7、8 共用） ─────────
const QP = [];
{
  let i = 0;
  const add = (cx, cy, sg, n) => { for (let k = 0; k < n; k++, i++) { const u1 = Math.max(rnd(i * 2 + 11), 0.003), u2 = rnd(i * 2 + 12), r = Math.sqrt(-2 * Math.log(u1)); const x = cx + sg * r * Math.cos(6.2832 * u2), y = cy + sg * r * Math.sin(6.2832 * u2); if (x > 0.015 && x < 0.985 && y > 0.015 && y < 0.985) QP.push([x, y]); } };
  add(0.27, 0.30, 0.07, 95); add(0.68, 0.63, 0.06, 85); add(0.30, 0.79, 0.05, 40);
  for (let k = 0; k < 34; k++) QP.push([0.04 + rnd(900 + k * 2) * 0.92, 0.04 + rnd(901 + k * 2) * 0.92]);
}
const QT = 8, QMAXD = 6;
function qBuild(x, y, s, d, idx) {
  const node = { x, y, s, d, n: idx.length, kids: null, idx };
  if (idx.length > QT && d < QMAXD) { node.kids = []; const h = s / 2; for (let k = 0; k < 4; k++) { const qx = x + (k % 2) * h, qy = y + Math.floor(k / 2) * h; node.kids.push(qBuild(qx, qy, h, d + 1, idx.filter((i) => QP[i][0] >= qx && QP[i][0] < qx + h && QP[i][1] >= qy && QP[i][1] < qy + h))); } }
  return node;
}
const QROOT = qBuild(0, 0, 1, 0, QP.map((_, i) => i));
const QALL = []; (function w(n) { QALL.push(n); n.kids && n.kids.forEach(w); })(QROOT);
const QLEAF = QALL.filter((n) => !n.kids), QDEPTH = Math.max(...QLEAF.map((n) => n.d));
const QPATH = QP.map((p, i) => { const path = []; let n = QROOT; while (n) { path.push(n); n = n.kids && n.kids.find((k) => p[0] >= k.x && p[0] < k.x + k.s && p[1] >= k.y && p[1] < k.y + k.s); } return path; });
const QM = { x: 960, y: 190, s: 720 };
const qpx = (v) => QM.x + v * QM.s, qpy = (v) => QM.y + v * QM.s;
const QLV = [8.6, 11.2, 12.8, 14.4, 15.8, 17.0, 18.2];

function sceneQuad(lt) {
  header(lt, '07', 'Quadtree by Density', IN, 'Dense areas split finer');
  const ma = eOut(P(lt, 0.3, 1.0));
  mapFrame(QM.x - 14, QM.y - 14, QM.s + 28, QM.s + 28, ma);
  const gridA = eOut(P(lt, 2.0, 3.0)) * (1 - eOut(P(lt, 6.2, 7.2)));
  const treeOn = lt >= QLV[0];
  let L = -1; QLV.forEach((t, d) => { if (lt >= t) L = d; });
  // 固定 4×4 网格
  if (gridA > 0) {
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
      const n = QP.filter((p) => p[0] >= c / 4 && p[0] < (c + 1) / 4 && p[1] >= r / 4 && p[1] < (r + 1) / 4).length;
      sRect(qpx(c / 4), qpy(r / 4), QM.s / 4, QM.s / 4, { stroke: IN, fill: n > 40 ? hex(RED, 0.14) : null, lw: 2, a: gridA * 0.9 });
      text(String(n), qpx(c / 4) + QM.s / 8, qpy(r / 4) + QM.s / 8 + 12, { size: 34, weight: 800, font: MONO, align: 'center', color: n > 40 ? RED : n < 4 ? DIM : INK, a: gridA });
    }
  }
  // 四叉树
  QALL.forEach((nd) => {
    const t0 = QLV[nd.d]; if (lt < t0) return; const a = eOut(P(lt, t0, t0 + 0.7));
    const split = nd.kids && lt >= QLV[nd.d + 1];
    const wait = nd.kids && !split;
    sRect(qpx(nd.x), qpy(nd.y), nd.s * QM.s, nd.s * QM.s, { stroke: nd.d === 0 ? IN : hex(IN, 0.9), fill: wait ? hex(AM, 0.16) : nd.kids ? null : hex(CY, 0.04), lw: nd.d <= 1 ? 3 : 2, a });
  });
  // 商家点
  QP.forEach((p, i) => {
    let c = '#9aa6d6', al = 0.7;
    if (treeOn) { const path = QPATH[i]; const cur = path[Math.min(L, path.length - 1)]; const over = cur.kids && lt < QLV[cur.d + 1]; c = over ? AM : CY; al = 0.95; }
    else if (gridA > 0) { al = 0.7; }
    dot(qpx(p[0]), qpy(p[1]), 3.6, c, { g: 0, a: ma * al * clamp(P(lt, 0.6 + i * 0.005, 1.2 + i * 0.005)) });
  });
  const aa = eOut(P(lt, 2.6, 3.4));
  // 左栏
  if (gridA > 0.3) { text('Fixed cells: counts vary wildly', 110, 430, { size: 28, weight: 600, a: aa }); text('Dense cells overflow, sparse ones sit empty', 110, 484, { size: 26, color: MUTE, a: aa }); }
  const ta = eOut(P(lt, 8.4, 9.2));
  if (ta > 0) {
    text('Rule', 110, 410, { size: 24, color: MUTE, a: ta });
    glass(110, 424, 640, 100, { a: ta, accent: IN }); text('Cell count > threshold → split in 4', 134, 484, { size: 26, weight: 600, a: ta });
    const th = eOut(P(lt, 16.8, 17.6));
    glass(110, 548, 640, 90, { a: th, accent: AM }); text('Book threshold: 100', 134, 604, { size: 28, weight: 700, color: AM, a: th }); text('Here: 8 (illustrative)', 440, 604, { size: 26, color: MUTE, a: th });
    const cells = QALL.filter((n) => lt >= QLV[n.d] && (!n.kids || lt < QLV[n.d + 1])).length;
    glass(110, 662, 300, 112, { a: ta, accent: CY }); text('Cells', 134, 700, { size: 22, color: MUTE, a: ta }); text(String(cells), 134, 756, { size: 48, weight: 800, font: MONO, color: CY, a: ta });
    glass(450, 662, 300, 112, { a: ta, accent: PK }); text('Depth', 474, 700, { size: 22, color: MUTE, a: ta }); text(String(Math.max(L, 0)), 474, 756, { size: 48, weight: 800, font: MONO, color: PK, a: ta });
  }
  const da = eOut(P(lt, 21.6, 22.4));
  if (da > 0) { text('Dense: split to the deepest level', 110, 830, { size: 26, weight: 700, color: AM, a: da }); text('Sparse: the root is enough', 110, 874, { size: 26, weight: 700, color: CY, a: eOut(P(lt, 23.2, 24.0)) }); }
  tag('Illustrative: random businesses', QM.x + QM.s, QM.y + QM.s + 44, ma);
}

// ───────── 场景 8：k 近邻 ─────────
const KQ = [0.62, 0.18], KK = 3;
const kd = (p) => Math.hypot(p[0] - KQ[0], p[1] - KQ[1]);
const KNEAR = QP.map((p, i) => [kd(p), i]).sort((a, b) => a[0] - b[0]).slice(0, KK);
const KR = KNEAR[KK - 1][0];
const rectDist = (n) => { const dx = Math.max(n.x - KQ[0], 0, KQ[0] - (n.x + n.s)), dy = Math.max(n.y - KQ[1], 0, KQ[1] - (n.y + n.s)); return Math.hypot(dx, dy); };
const KPATH = []; { let n = QROOT; while (n) { KPATH.push(n); n = n.kids && n.kids.find((k) => KQ[0] >= k.x && KQ[0] < k.x + k.s && KQ[1] >= k.y && KQ[1] < k.y + k.s); } }
const K_VISIT_TOTAL = QLEAF.filter((n) => rectDist(n) <= KR).length;
function sceneKnn(lt) {
  header(lt, '08', 'Nearest k', PK, 'Quadtrees are good at k-NN');
  const ma = eOut(P(lt, 0.3, 1.0));
  mapFrame(QM.x - 14, QM.y - 14, QM.s + 28, QM.s + 28, ma);
  const r = KR * eIO(P(lt, 8.6, 13.6));
  QLEAF.forEach((n) => { const vis = r > 0 && rectDist(n) <= r; sRect(qpx(n.x), qpy(n.y), n.s * QM.s, n.s * QM.s, { stroke: vis ? AM : hex(IN, 0.5), fill: vis ? hex(AM, 0.16) : null, lw: vis ? 2.5 : 1.5, a: ma }); });
  QP.forEach((p, i) => { const inR = kd(p) <= r; const isK = KNEAR.some((k) => k[1] === i) && r >= KR - 1e-6 && P(lt, 13.8, 14.6) > 0; dot(qpx(p[0]), qpy(p[1]), isK ? 7.5 : 3.6, isK ? LM : inR ? '#fff' : '#9aa6d6', { g: isK ? 14 : 0, a: ma * (isK ? 1 : 0.75) }); });
  // 下降路径
  KPATH.forEach((n, d) => { const t0 = 5.8 + d * 0.5, a = eOut(P(lt, t0, t0 + 0.5)); if (a <= 0 || lt > 8.4) return; sRect(qpx(n.x), qpy(n.y), n.s * QM.s, n.s * QM.s, { stroke: PK, lw: 4, a: a * 0.9, g: 12, fill: d === KPATH.length - 1 ? hex(PK, 0.2) : null }); });
  const ua = eBack(P(lt, 3.4, 4.2));
  if (ua > 0.02) { dot(qpx(KQ[0]), qpy(KQ[1]), 9, '#fff', { g: 24, a: clamp(ua) }); text('User', qpx(KQ[0]) + 14, qpy(KQ[1]) - 14, { size: 24, weight: 700, a: clamp(ua) }); }
  if (r > 0) { ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; glow('#fff', 10); ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(qpx(KQ[0]), qpy(KQ[1]), r * QM.s, 0, 7); ctx.stroke(); ctx.restore(); }
  tag('Illustrative: k = 3', QM.x + QM.s, QM.y + QM.s + 44, ma);
  // 左栏
  bullet(0, '① Walk down to the user\'s leaf', eOut(P(lt, 5.8, 6.6)), { y0: 420, step: 58, size: 27, color: PK });
  bullet(1, '② Widen, visit intersecting leaves', eOut(P(lt, 8.6, 9.4)), { y0: 420, step: 58, size: 27, color: AM });
  bullet(2, '③ Stop once we have k', eOut(P(lt, 13.6, 14.4)), { y0: 420, step: 58, size: 27, color: LM });
  const oa = eOut(P(lt, 14.8, 15.6));
  text('Cost', 110, 640, { size: 24, color: MUTE, a: oa });
  bullet(0, 'Built in memory at startup', oa, { y0: 690, step: 56, size: 27, color: RED });
  bullet(1, '~200M businesses: minutes', eOut(P(lt, 19.0, 19.8)), { y0: 690, step: 56, size: 27, color: RED });
  bullet(2, 'No traffic until it is built', eOut(P(lt, 21.8, 22.6)), { y0: 690, step: 56, size: 27, color: RED });
  bullet(3, 'Updates often need a rebuild', eOut(P(lt, 24.2, 25.0)), { y0: 690, step: 56, size: 27, color: RED });
  const vis = QLEAF.filter((n) => rectDist(n) <= r && r > 0).length;
  if (r > 0) { const sa = eOut(P(lt, 10.6, 11.2)); text(`Leaves visited ${vis} / ${QLEAF.length}`, 1670, 880, { size: 22, font: MONO, color: AM, align: 'right', a: 0 }); void sa; }
  void K_VISIT_TOTAL;
}

// ───────── 场景 9：S2 与 Hilbert 曲线 ─────────
const HN = 8, HD = {}; // 8×8 Hilbert
function hd2xy(n, d) { let x = 0, y = 0, t = d; for (let s = 1; s < n; s *= 2) { const rx = 1 & (t >> 1), ry = 1 & (t ^ rx); if (ry === 0) { if (rx === 1) { x = s - 1 - x; y = s - 1 - y; } [x, y] = [y, x]; } x += s * rx; y += s * ry; t >>= 2; } return [x, y]; }
const HPATH = Array.from({ length: HN * HN }, (_, d) => hd2xy(HN, d)); HPATH.forEach(([x, y], d) => { HD[x + ',' + y] = d; });
const HPAIR = (() => { let best = [0, 0, 0]; for (let y = 0; y < HN; y++) { const a = HD[`${HN / 2 - 1},${y}`], b = HD[`${HN / 2},${y}`]; if (Math.abs(a - b) > best[0]) best = [Math.abs(a - b), y, 0]; } return best; })();
const HPY = HPAIR[1], HPA = HD[`${HN / 2 - 1},${HPY}`], HPB = HD[`${HN / 2},${HPY}`];
const HNEAR = 20; // 编号相邻的一对：HNEAR 与 HNEAR+1
const insideRegion = (x, y) => { const a = 0.52, ex = (x - 0.45) * Math.cos(a) + (y - 0.5) * Math.sin(a), ey = -(x - 0.45) * Math.sin(a) + (y - 0.5) * Math.cos(a); return (ex / 0.36) ** 2 + (ey / 0.22) ** 2 <= 1 || (x - 0.74) ** 2 + (y - 0.66) ** 2 <= 0.12 ** 2; };
const COVER = []; (function cov(x, y, s, d) {
  const pts = []; for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) pts.push(insideRegion(x + (s * i) / 4, y + (s * j) / 4));
  const all = pts.every(Boolean), any = pts.some(Boolean); if (!any) return;
  if (all || d === 4) { COVER.push({ x, y, s, d }); return; }
  const h = s / 2; cov(x, y, h, d + 1); cov(x + h, y, h, d + 1); cov(x, y + h, h, d + 1); cov(x + h, y + h, h, d + 1);
})(0, 0, 1, 0);
COVER.sort((a, b) => a.d - b.d);
function sceneS2(lt) {
  header(lt, '09', 'Google S2', SC[3], 'Hilbert curve + multi-level cells');
  const SZ = 480, AX = 830, BX = 1360, AY = 270;
  const ma = eOut(P(lt, 0.4, 1.2)), cs = SZ / HN;
  mapFrame(AX - 14, AY - 14, SZ + 28, SZ + 28, ma);
  text('Hilbert numbering (illustrative 8×8)', AX, AY - 36, { size: 24, weight: 700, color: SC[3], a: ma });
  const cp = eIO(P(lt, 3.6, 10.0)), nd = cp * (HN * HN - 1);
  for (let d = 0; d < HN * HN; d++) { if (d > nd) break; const [x, y] = HPATH[d]; sRect(AX + x * cs, AY + y * cs, cs, cs, { fill: hex(SC[3], 0.05 + 0.12 * (d / 63)), stroke: 'rgba(255,255,255,0.08)', lw: 1, a: ma }); }
  ctx.save(); ctx.globalAlpha *= ma; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = SC[3]; glow(SC[3], 12); ctx.beginPath();
  for (let d = 0; d <= Math.floor(nd); d++) { const [x, y] = HPATH[d]; const px = AX + (x + 0.5) * cs, py = AY + (y + 0.5) * cs; d === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py); }
  if (nd < HN * HN - 1) { const d0 = Math.floor(nd), f = nd - d0, [x0, y0] = HPATH[d0], [x1, y1] = HPATH[d0 + 1]; ctx.lineTo(AX + (lerp(x0, x1, f) + 0.5) * cs, AY + (lerp(y0, y1, f) + 0.5) * cs); }
  ctx.stroke(); ctx.restore();
  if (cp > 0) { const d0 = Math.min(Math.floor(nd), 62), f = nd - d0, [x0, y0] = HPATH[d0], [x1, y1] = HPATH[d0 + 1]; dot(AX + (lerp(x0, x1, f) + 0.5) * cs, AY + (lerp(y0, y1, f) + 0.5) * cs, 9, '#fff', { g: 22 }); }
  const lab = (d, col, a, big = false) => { const [x, y] = HPATH[d]; sRect(AX + x * cs, AY + y * cs, cs, cs, { stroke: col, fill: hex(col, 0.3), lw: 3, a, g: 12 }); text(String(d), AX + (x + 0.5) * cs, AY + (y + 0.5) * cs + 9, { size: 26, weight: 800, font: MONO, align: 'center', a }); void big; };
  text('0', AX + cs * 0.5, AY + cs * 0.5 + 8, { size: 22, font: MONO, color: INK, align: 'center', a: ma * eOut(P(lt, 3.6, 4.2)) });
  const na = eOut(P(lt, 10.8, 11.6));
  if (na > 0 && lt < 15.2) { lab(HNEAR, LM, na); lab(HNEAR + 1, LM, na); }
  const fa = eOut(P(lt, 15.4, 16.2));
  if (fa > 0) { const xa = HN / 2 - 1, xb = HN / 2; [[xa, HPA], [xb, HPB]].forEach(([x, d]) => { sRect(AX + x * cs, AY + HPY * cs, cs, cs, { stroke: RED, fill: hex(RED, 0.3), lw: 3, a: fa, g: 12 }); text(String(d), AX + (x + 0.5) * cs, AY + (HPY + 0.5) * cs + 9, { size: 26, weight: 800, font: MONO, align: 'center', a: fa }); }); }
  // 围栏
  const ba = eOut(P(lt, 18.4, 19.2));
  mapFrame(BX - 14, AY - 14, SZ + 28, SZ + 28, ba);
  text('Geofence: cells of different levels', BX - 14, AY - 36, { size: 24, weight: 700, color: PK, a: ba });
  COVER.forEach((c, i) => { const t0 = 19.8 + (i / COVER.length) * 3.8, a = eOut(P(lt, t0, t0 + 0.4)); if (a <= 0) return; const col = [IN, CY, LM, AM, PK][c.d]; sRect(BX + c.x * SZ + 1, AY + c.y * SZ + 1, c.s * SZ - 2, c.s * SZ - 2, { fill: hex(col, 0.3), stroke: col, lw: 1.5, a }); });
  ctx.save(); ctx.globalAlpha *= ba; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.setLineDash([9, 7]); ctx.beginPath();
  for (let a = 0; a <= 360; a += 3) { const t = (a * Math.PI) / 180, ex = Math.cos(t) * 0.36, ey = Math.sin(t) * 0.22, k = 0.52; const x = 0.45 + ex * Math.cos(k) - ey * Math.sin(k), y = 0.5 + ex * Math.sin(k) + ey * Math.cos(k); a === 0 ? ctx.moveTo(BX + x * SZ, AY + y * SZ) : ctx.lineTo(BX + x * SZ, AY + y * SZ); } ctx.stroke(); ctx.restore();
  tag('Illustrative: random geofence shape', BX + SZ, AY + SZ + 50, ba);
  // 左栏
  bullet(0, 'Sphere → cells, Hilbert-numbered', eOut(P(lt, 3.6, 4.4)), { y0: 420, step: 62, size: 27, color: SC[3] });
  bullet(1, `Adjacent numbers ≈ nearby`, eOut(P(lt, 10.8, 11.6)), { y0: 420, step: 62, size: 27, color: LM });
  bullet(2, `The reverse is not true`, eOut(P(lt, 13.8, 14.6)), { y0: 420, step: 62, size: 27, color: RED });
  const ra = eOut(P(lt, 15.6, 16.4));
  if (ra > 0) { glass(110, 750, 640, 96, { a: ra, accent: RED }); text('Adjacent cells, numbers', 134, 806, { size: 26, color: MUTE, a: ra }); text(`${HPA} and ${HPB}`, 450, 806, { size: 40, weight: 800, font: MONO, color: RED, a: ra }); }
  bullet(3, 'Mixed levels cover any region', eOut(P(lt, 18.8, 19.6)), { y0: 420, step: 62, size: 27, color: PK });
  bullet(4, 'Good for geofences · harder', eOut(P(lt, 22.8, 23.6)), { y0: 420, step: 62, size: 27, color: AM });
}

// ───────── 场景 10：总结 ─────────
function sceneEnd(lt) {
  text('Spatial Indexes', 110, 250, { size: 84, weight: 900, a: eOut(P(lt, 0.2, 0.9)) });
  text('Proximity Service', 112, 304, { size: 32, color: MUTE, font: MONO, a: eOut(P(lt, 0.4, 1.1)) });
  [['Geohash', 'Prefix = cell, then filter', CY, 'Fixed-radius search'], ['Quadtree', 'Splits by density, nearest k', IN, 'Often needs a rebuild'], ['S2', 'Hilbert IDs, multi-level cover', PK, 'Geofencing']].forEach(([w, s, c, n], k) => {
    const t0 = [2.0, 8.4, 14.8][k], p = eBack(P(lt, t0, t0 + 0.7)), a = clamp(p * 2);
    ctx.save(); ctx.globalAlpha *= a; ctx.translate(0, (1 - clamp(p)) * 30);
    const x = 110 + k * 560;
    glass(x, 420, 520, 270, { accent: c, r: 28 });
    ctx.fillStyle = c; glow(c, 20); rr(x + 36, 420, 80, 5, 3); ctx.fill(); ctx.shadowBlur = 0;
    text(`0${k + 1}`, x + 36, 480, { size: 22, color: c, font: MONO, weight: 700, ls: 3 });
    text(w, x + 36, 566, { size: 70, weight: 800 });
    text(s, x + 36, 616, { size: 26, color: MUTE });
    text(n, x + 36, 660, { size: 24, weight: 700, color: c });
    ctx.restore();
  });
  const aa = eOut(P(lt, 19.6, 20.4));
  glass(110, 740, 1480, 100, { a: aa, accent: AM, r: 26 });
  text('Find the cells, fetch the businesses, filter by distance', 150, 804, { size: 40, weight: 800, a: aa });
}

// ───────── 片头 ─────────
function sceneTitle(lt) {
  const a = eOut(P(lt, 0.2, 1.2));
  const X = 1060, Y = 250, WW = 760, HH = 560, cols = 8, rows = 6;
  glass(X - 14, Y - 14, WW + 28, HH + 28, { a: a * 0.9, r: 24 });
  const gp = eOut(P(lt, 0.8, 3.0));
  ctx.save(); ctx.globalAlpha *= 0.9;
  for (let c = 0; c <= cols; c++) { ctx.strokeStyle = 'rgba(139,141,252,0.45)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X + (c * WW) / cols, Y); ctx.lineTo(X + (c * WW) / cols, Y + HH * gp); ctx.stroke(); }
  for (let r = 0; r <= rows; r++) { ctx.beginPath(); ctx.moveTo(X, Y + (r * HH) / rows); ctx.lineTo(X + WW * gp, Y + (r * HH) / rows); ctx.stroke(); }
  ctx.restore();
  const cx = X + WW * 0.47, cy = Y + HH * 0.5, R = 118;
  for (let i = 0; i < 70; i++) { const x = X + 20 + rnd(i * 3 + 5) * (WW - 40), y = Y + 20 + rnd(i * 3 + 6) * (HH - 40), inC = Math.hypot(x - cx, y - cy) <= R, hit = Math.abs(Math.floor((x - X) / (WW / cols)) - Math.floor((cx - X) / (WW / cols))) <= 1 && Math.abs(Math.floor((y - Y) / (HH / rows)) - Math.floor((cy - Y) / (HH / rows))) <= 1; dot(x, y, 5, inC ? LM : hit && lt > 4.5 ? AM : '#7f8bb0', { g: inC ? 12 : 0, a: eOut(P(lt, 2.4 + i * 0.02, 3 + i * 0.02)) * 0.9 }); }
  const ca = eOut(P(lt, 3.6, 4.4));
  ctx.save(); ctx.globalAlpha *= ca; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; glow('#fff', 12); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke(); ctx.restore();
  const hc = Math.floor((cx - X) / (WW / cols)), hr = Math.floor((cy - Y) / (HH / rows)), ha = eOut(P(lt, 4.6, 5.6));
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) sRect(X + (hc + dc) * (WW / cols), Y + (hr + dr) * (HH / rows), WW / cols, HH / rows, { stroke: AM, fill: hex(AM, 0.1), lw: 2, a: ha });
  text('SYSTEM DESIGN INTERVIEW · ANIMATED GUIDE', 110, 360, { size: 24, weight: 600, color: SC[0], ls: 4, a });
  const g = ctx.createLinearGradient(110, 0, 900, 0); g.addColorStop(0, '#fff'); g.addColorStop(1, '#b4b7ff');
  ctx.save(); ctx.globalAlpha *= eOut(P(lt, 0.4, 1.4)); ctx.translate(0, (1 - eOut(P(lt, 0.4, 1.4))) * 30);
  ctx.font = `900 120px ${SANS}`; let tw = ctx.measureText('Proximity Service').width; const fs = Math.min(120, Math.floor(120 * 900 / tw)); ctx.font = `900 ${fs}px ${SANS}`; ctx.fillStyle = g; ctx.fillText('Proximity Service', 104, 510); ctx.restore();
    text('Chapter 16', 112, 600, { size: 34, weight: 700, color: INK, a: eOut(P(lt, 1.2, 2)) });
}

export const scenes = { title: sceneTitle, slow: sceneSlow, geohash: sceneGeohash, prefix: scenePrefix, nine: sceneNine, boundary: sceneBoundary, flow: sceneFlow, quad: sceneQuad, knn: sceneKnn, s2: sceneS2, end: sceneEnd };
