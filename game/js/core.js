// 通用小工具：随机数、日期、演出阶段与数值格式化。全部是纯函数，浏览器和 Node 都能用。

export const DAY_MS = 86400000;
export const MAX_L = 9.08; // 多巴值的对数上限：10^9.08

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** 可复现的伪随机数发生器（mulberry32），返回 [0,1) 的函数。 */
export function rng(seed = Date.now()) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 32 位种子。 */
export function hashSeed(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const pick = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];

const pad = n => String(n).padStart(2, '0');

/** 本地日期键 YYYY-MM-DD。 */
export function dayKey(ts = Date.now()) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 日期键 → 当天本地正午的时间戳（避开夏令时边界）。 */
export function keyToTs(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

export const addDays = (key, n) => dayKey(keyToTs(key) + n * DAY_MS);
export const dayDiff = (a, b) => Math.round((keyToTs(a) - keyToTs(b)) / DAY_MS);

export function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// ---- 演出阶段 ----
// 阶段 0..8，由多巴值的对数 L 决定；音乐、背景、吉祥物都按这个整数分层叠加。
export const STAGE_AT = [0.15, 0.45, 0.85, 1.3, 1.9, 2.7, 3.7, 5.0];
export const MAX_STAGE = STAGE_AT.length;

export function stageForL(L) {
  let s = 0;
  while (s < STAGE_AT.length && L >= STAGE_AT[s]) s++;
  return s;
}

// ---- 多巴值显示 ----
const ZH_UNITS = [[1e8, '亿'], [1e4, '万']];
const EN_UNITS = [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];

/** 多巴值 10^L 的显示：小于 1 万取整，之后带单位；单位内不足 10 保留一位小数，否则向下取整。 */
export function formatDopa(L, lang = 'zh') {
  const v = Math.pow(10, L);
  if (lang === 'en') {
    if (v < 1000) return String(Math.round(v));
    for (const [base, unit] of EN_UNITS) {
      if (v >= base) {
        const x = v / base;
        return (x < 10 ? (Math.floor(x * 10) / 10).toFixed(1) : String(Math.floor(x))) + unit;
      }
    }
  }
  if (v < 1e4) return String(Math.round(v));
  for (const [base, unit] of ZH_UNITS) {
    if (v >= base) {
      const x = v / base;
      return (x < 10 ? (Math.floor(x * 10) / 10).toFixed(1) : String(Math.floor(x))) + unit;
    }
  }
  return String(Math.round(v));
}

/** 多巴值越过的里程碑（按 10 的幂）。返回 [prevL, newL) 间新越过的 key。 */
export const DOPA_MILESTONES = [[2, 'dopa100'], [3, 'dopa1000'], [4, 'dopa1e4'], [6, 'dopa1e6'], [8, 'dopa1e8']];
export function dopaMilestonesCrossed(prevL, newL) {
  return DOPA_MILESTONES.filter(([l]) => prevL < l && newL >= l).map(([, k]) => k);
}

/** 秒 → m:ss。 */
export function fmtTime(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}
