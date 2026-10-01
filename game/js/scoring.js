// 得分、多巴值（对数）与连击计时。与具体界面无关，全部可单测。

import { clamp, MAX_L } from './core.js';

/** 基本问题完成即 100 分。 */
export const BASIC_POINTS = 100;

/** 加试第 k 题（0 起）的加点。 */
export const extraQuestionPoints = k => 10 + 5 * k;

/** 加试完成 n 题的合计得分（含基本 100）。 */
export const totalPoints = n => BASIC_POINTS + 10 * n + (5 * n * (n - 1)) / 2;

/** 基本问题的目标用时（秒）：ceil(N × 18 ÷ 10) × 10。超过也不扣分。 */
export const targetSeconds = n => Math.ceil((n * 18) / 10) * 10;

/** 基本问题的基准曲线 B(f)：f 是完成比例，终点 2.3（约 200 倍）。 */
export const basicCurve = f => 2.3 * Math.pow(clamp(f, 0, 1), 1.15);

/** 加试的基准曲线 X(n)：从 2.3 起，向 5.3 渐近。 */
export const extraCurve = n => 2.3 + 3.0 * (1 - Math.exp(-n / 10));

/** 连击倍率：1 倍起，20 连击封顶 2 倍。 */
export const comboMultiplier = c => 1 + Math.min(1, Math.max(0, c) / 20);

/**
 * 一格答对后的多巴增量基准。
 * 基本：N 道题，已完成 q 题，当前题共 m 格，这是第 s 格（1 起）。
 * 加试：已完成 k 题，当前题共 m 格。
 */
export function baseIncrement({ phase, N, q, m, s, k }) {
  if (phase === 'extra') return (extraCurve(k + 1) - extraCurve(k)) / m;
  return basicCurve((q + s / m) / N) - basicCurve((q + (s - 1) / m) / N);
}

/** 正确时（已把连击加 1 之后）更新对数多巴值 L。 */
export function advanceL(L, inc, combo) {
  return Math.min(MAX_L, L + Math.max(0.003, inc) * comboMultiplier(combo));
}

// ---- 连击计时（每格的时限）----
// 读题需要时间，所以首格时限含按字数估算的阅读时间。时限用完只会让连击归零，不扣分。
const READ_MS = { zh: 110, en: 60 };

export function readMs(ex, lang) {
  let chars = (ex.prompt || '').length;
  for (const o of ex.options || []) chars += o.length;
  for (const p of ex.pairs || []) chars += p[0].length + p[1].length;
  for (const it of ex.items || []) chars += it.length;
  if (ex.text) chars += ex.text.length;
  return Math.min(30000, chars * (READ_MS[lang] || READ_MS.zh) * 0.6);
}

/** 第 i 格（0 起）的连击时限（毫秒）。pace: 'normal' | 'relaxed'；'off' 返回 Infinity。 */
export function cellTimeMs(ex, i, lang = 'zh', pace = 'normal') {
  if (pace === 'off') return Infinity;
  const per = ex.type === 'match' || ex.type === 'order' ? 5000 : 6000;
  const t = i === 0 ? 5000 + readMs(ex, lang) + per * 0.5 : per;
  return Math.round(pace === 'relaxed' ? t * 2 : t);
}

/** 整题的基准用时（毫秒），用来算速度星。 */
export function refTimeMs(ex, cells, lang = 'zh') {
  return 5000 + readMs(ex, lang) + Math.max(0, cells - 1) * 4000;
}
