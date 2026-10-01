export const COLS = 48, ROWS = 30, TS = 6, CT = 12;
export const HR = [12, 24], HC = [12, 24, 36];
const rnd = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const id = (c, r) => r * COLS + c;
export const SP = { c: 4, r: 5 }, DP = { c: 43, r: 24 };
function cost(a, b, hw) { // a,b: ids
  const lo = Math.min(a, b), hi = Math.max(a, b), horiz = hi - lo === 1;
  const c0 = lo % COLS, r0 = (lo / COLS) | 0, c1 = hi % COLS, r1 = (hi / COLS) | 0;
  if (hw) {
    if (horiz && HR.includes(r0)) return 0.4 * (1 + 0.1 * rnd(lo * 2));
    if (!horiz && HC.includes(c0)) return 0.4 * (1 + 0.1 * rnd(lo * 2 + 1));
  }
  return rnd(lo * 2 + (horiz ? 0 : 1)) < 0.12 ? 1.5 : 1;
}
export function search({ hw = false, useH = true, allowed = null, hmul = 1 }) {
  const s = id(SP.c, SP.r), g = id(DP.c, DP.r), N = COLS * ROWS;
  const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const hmin = hw ? 0.4 : 1;
  const hf = (n) => (useH ? (Math.abs((n % COLS) - DP.c) + Math.abs(((n / COLS) | 0) - DP.r)) * hmin * hmul : 0);
  const open = [s]; dist[s] = 0; const order = [];
  while (open.length) {
    let bi = 0, bf = Infinity;
    for (let i = 0; i < open.length; i++) { const f = dist[open[i]] + hf(open[i]); if (f < bf - 1e-9 || (Math.abs(f - bf) < 1e-9 && hf(open[i]) < hf(open[bi]))) { bf = f; bi = i; } }
    const n = open.splice(bi, 1)[0]; if (done[n]) continue; done[n] = 1; order.push(n);
    if (n === g) break;
    const c = n % COLS, r = (n / COLS) | 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cc = c + dc, rr = r + dr; if (cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS) continue;
      const m = id(cc, rr); if (done[m] || (allowed && !allowed(m))) continue;
      const nd = dist[n] + cost(n, m, hw);
      if (nd < dist[m]) { dist[m] = nd; prev[m] = n; open.push(m); }
    }
  }
  const path = []; for (let n = g; n !== -1; n = prev[n]) path.push(n); path.reverse();
  return { order, path, cost: dist[g] };
}
const near = (n, p, k) => Math.max(Math.abs((n % COLS) - p.c), Math.abs(((n / COLS) | 0) - p.r)) <= k;
export const hwAllowed = (n) => near(n, SP, 9) || near(n, DP, 9) || onHw(n);
export const tileKey = (n) => ((n / COLS / TS) | 0) * 100 + (((n % COLS) / TS) | 0);
export const R = { dij: search({ useH: false }), astar: search({}) };
const cheb = (n, p) => Math.max(Math.abs((n % COLS) - p.c), Math.abs(((n / COLS) | 0) - p.r));
// 分层示意：离端点 ≤6 / ≤11，更远用顶层(24)
export const lvlOf = (n) => { const d = Math.min(cheb(n, SP), cheb(n, DP)); return d <= 6 ? 6 : d <= 11 ? 12 : 24; };
export const tkey = (n, sz) => sz * 10000 + ((n / COLS / sz) | 0) * 100 + (((n % COLS) / sz) | 0);
export const hierPath = R.astar.path.map((n) => tkey(n, lvlOf(n)));
export const hierCount = new Set(hierPath).size;
