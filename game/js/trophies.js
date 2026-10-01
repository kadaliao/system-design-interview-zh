// 成就：按系列分级，达到阈值即获得，获得后永久保留。标题和条件文字在 i18n 里按系列 id 查。

import { metricsOf, CHAPTER_COUNT, TYPES } from './metrics.js';

// [系列 id, 分类, 指标, 阈值们]
const SERIES = [
  // 坚持
  ['streak', 'keep', 'streak', [3, 5, 7, 10, 14, 21, 30, 50, 75, 100, 150, 200, 365]],
  ['playDays', 'keep', 'playDays', [1, 3, 5, 7, 10, 15, 20, 30, 40, 50, 75, 100, 150, 200, 300, 365]],
  ['login', 'keep', 'login', [1, 7, 14, 30, 50, 100, 200, 365]],
  ['crowns', 'keep', 'crowns', [1, 3, 5, 10, 20, 52]],
  ['quests', 'keep', 'questDays', [1, 3, 5, 10, 20, 50]],
  ['questDone', 'keep', 'questDone', [3, 10, 30, 100, 300]],
  ['hammers', 'keep', 'hammers', [1, 3, 10]],
  // 数量
  ['answered', 'volume', 'answered', [10, 30, 50, 100, 200, 300, 500, 750, 1000, 1500, 2000, 3000, 5000, 10000]],
  ['cells', 'volume', 'cells', [30, 100, 300, 500, 1000, 2000, 3000, 5000, 10000, 30000]],
  ['plays', 'volume', 'plays', [1, 3, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000]],
  ['minutes', 'volume', 'minutes', [5, 15, 30, 60, 120, 300, 600, 1200]],
  ['reads', 'volume', 'reads', [1, 5, 15, 40]],
  // 技能
  ['mastered', 'skill', 'mastered', [1, 3, 5, 10, 15, 20, 30, 40, 60, 80, 111]],
  ['stars', 'skill', 'stars', [3, 10, 25, 50, 100, 150, 200, 300, 400, 555]],
  ['cleared', 'skill', 'cleared', [1, 3, 5, 10, 15, 20, 28]],
  // 加试
  ['extraQ', 'extra', 'extraQ', [1, 5, 10, 25, 50, 100, 250, 500, 1000]],
  ['maxExtraQ', 'extra', 'maxExtraQ', [3, 5, 10, 15, 20, 30, 50]],
  ['bestScore', 'extra', 'bestScore', [100, 150, 200, 300, 500, 1000, 1500, 2500, 5000]],
  // 连击
  ['bestCombo', 'combo', 'bestCombo', [5, 10, 20, 30, 50, 75, 100, 150, 200, 300]],
  // 精准
  ['perfect', 'accuracy', 'perfect', [1, 3, 5, 10, 25, 50, 100]],
  ['ftRate', 'accuracy', 'ftRate', [60, 70, 80, 90, 95]],
  ...TYPES.map(t => ['type_' + t, 'accuracy', 'type_' + t, [20, 100, 300]]),
  // 多巴
  ['dopa', 'dopa', 'dopa', [1, 2, 3, 4, 5, 6, 7, 8, 9]],
  // 复习
  ['reviewSolved', 'review', 'reviewSolved', [1, 5, 10, 25, 50, 100, 250]],
  ['polished', 'review', 'polished', [1, 3, 5, 10, 25, 50]],
  // 收藏
  ['unlocked', 'collection', 'unlocked', [3, 6, 9, 12, 15]],
];

// 单次条件的系列：每章玩过、每章通关
const CHAPTER_ONES = [];
for (let n = 1; n <= CHAPTER_COUNT; n++) {
  CHAPTER_ONES.push({ id: `chPlay:${n}`, series: 'chPlay', cat: 'chapter', n, metric: s => (s.stats.chapterPlays[n] || 0) });
  CHAPTER_ONES.push({ id: `chClear:${n}`, series: 'chClear', cat: 'chapter', n, metric: (s, m, c) => (c.chapters.get(n).lessonIds.every(id => s.skills[id] && s.skills[id].mastered) ? 1 : 0) });
}

// 隐藏成就：条件各自独立
const SECRETS = [
  ['newYear', s => s.stats.newYear],
  ['comeback', s => s.stats.comeback],
  ['allModes', s => ['self', 'chapter', 'practice', 'review'].every(k => s.stats.modes[k] > 0)],
  ['lateNight', s => s.stats.lateNight],
  ['perfect14', s => s.stats.perfect14],
  ['perfectExtra5', s => s.stats.perfectExtra5],
  ['oops100', s => s.stats.miss >= 100],
  ['fast', s => s.stats.fast],
  ['dopaMax', s => s.stats.bestL >= 8],
];

const rankOf = (i, len) => (len === 1 ? 'gold' : i === len - 1 ? 'rainbow' : i < len / 3 ? 'bronze' : i < (2 * len) / 3 ? 'silver' : 'gold');

export const CATEGORIES = ['keep', 'volume', 'skill', 'extra', 'combo', 'accuracy', 'dopa', 'review', 'chapter', 'collection', 'secret'];

/** 全部成就定义。 */
export const TROPHIES = (() => {
  const out = [];
  for (const [series, cat, metric, ths] of SERIES) {
    ths.forEach((n, i) => out.push({ id: `${series}:${n}`, series, cat, n, rank: rankOf(i, ths.length), level: i + 1, levels: ths.length, metric }));
  }
  for (const c of CHAPTER_ONES) out.push({ ...c, rank: 'gold', level: 1, levels: 1 });
  for (const [id, test] of SECRETS) out.push({ id: `secret:${id}`, series: id, cat: 'secret', secret: true, rank: 'secret', level: 1, levels: 1, test });
  return out;
})();

export const trophyById = new Map(TROPHIES.map(t => [t.id, t]));

/** 当前指标值（用于进度条）。 */
export function valueOf(def, state, course, m) {
  if (def.secret) return def.test(state) ? 1 : 0;
  if (typeof def.metric === 'function') return def.metric(state, m, course);
  return m[def.metric] || 0;
}

export function targetOf(def) {
  return def.secret || typeof def.metric === 'function' ? 1 : def.n;
}

/** 检查新获得的成就，写入存档，返回新获得的定义数组。 */
export function checkTrophies(state, course, now = Date.now()) {
  const m = metricsOf(state, course, now);
  const gained = [];
  for (const def of TROPHIES) {
    if (state.trophies[def.id]) continue;
    if (valueOf(def, state, course, m) >= targetOf(def)) {
      state.trophies[def.id] = now;
      gained.push(def);
      m.trophies++;
    }
  }
  return gained;
}

/** 离下一级最近的若干系列（不含隐藏）。 */
export function almostThere(state, course, limit = 12, now = Date.now()) {
  const m = metricsOf(state, course, now);
  const best = new Map();
  for (const def of TROPHIES) {
    if (def.secret || state.trophies[def.id] || def.cat === 'chapter') continue;
    const v = valueOf(def, state, course, m);
    const t = targetOf(def);
    const ratio = v / t;
    const cur = best.get(def.series);
    if (!cur || def.n < cur.def.n) best.set(def.series, { def, v, t, ratio });
  }
  return [...best.values()].sort((a, b) => b.ratio - a.ratio).slice(0, limit);
}
