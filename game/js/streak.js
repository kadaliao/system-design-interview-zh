// 连续记录、登录贴纸、补签锤。「玩过」和「登录」是两回事：只打开页面不算玩过。

import { addDays, dayDiff, dayKey } from './core.js';

export const HAMMER_MAX = 3;
export const SEAL_CYCLE = ['star', 'heart', 'flower', 'note', 'clover', 'check', 'crown'];

const played = (state, k) => (state.days[k] && state.days[k].plays > 0) || state.nocount.includes(k);

/** 当前连续天数：今天还没玩就从昨天往回数；补签的日子算连着，但不额外加天数。 */
export function currentStreak(state, today = dayKey()) {
  let k = played(state, today) ? today : addDays(today, -1);
  let n = 0;
  let guard = 0;
  while (played(state, k) && guard++ < 4000) {
    if (state.days[k] && state.days[k].plays > 0) n++;
    k = addDays(k, -1);
  }
  return n;
}

export function longestStreak(state) {
  const keys = Object.keys(state.days).filter(k => state.days[k].plays > 0).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  const allKeys = [...new Set([...keys, ...state.nocount])].sort();
  for (const k of allKeys) {
    const real = state.days[k] && state.days[k].plays > 0;
    run = prev && dayDiff(k, prev) === 1 ? run + (real ? 1 : 0) : real ? 1 : 0;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export const playDaysCount = state => Object.values(state.days).filter(d => d.plays > 0).length;

/** 把今天记为玩过一次（基本题完成时调用）。 */
export function markPlayed(state, today, score) {
  const d = state.days[today] || (state.days[today] = { plays: 0, best: 0, answered: 0 });
  d.plays++;
  d.best = Math.max(d.best, score);
  return d;
}

/**
 * 每个日历日一次的登录贴纸。昨天登录过（或中间的空档日都已补签）周期才接着数，否则从头。
 * 返回 { granted, seal, cycle, crown }；同一天重复调用 granted=false。
 */
export function loginBonus(state, today = dayKey()) {
  const lg = state.login;
  if (lg.last === today) return { granted: false, seal: lg.seals[today] || null, cycle: lg.cycle, crown: false };
  let cycle = 1;
  if (lg.last) {
    let continuous = true;
    for (let k = addDays(lg.last, 1); k < today; k = addDays(k, 1)) {
      if (!state.nocount.includes(k)) { continuous = false; break; }
    }
    if (continuous && dayDiff(today, lg.last) >= 1) cycle = lg.cycle >= SEAL_CYCLE.length ? 1 : lg.cycle + 1;
  }
  lg.last = today;
  lg.cycle = cycle;
  lg.total++;
  const seal = SEAL_CYCLE[cycle - 1];
  lg.seals[today] = seal;
  const crown = seal === 'crown';
  if (crown) lg.crowns++;
  return { granted: true, seal, cycle, crown };
}

/**
 * 是否建议使用补签锤：最后一次玩在 7 天内，昨天及以前的空档日全部能用锤子补上，
 * 并且能保住至少 2 天的连续。返回需要补的日期数组，不满足返回 null。
 */
export function hammerOffer(state, today = dayKey()) {
  if (state.hammers < 1) return null;
  if (state.hammerDeclined === today) return null;
  const keys = Object.keys(state.days).filter(k => state.days[k].plays > 0 && k < today).sort();
  if (!keys.length) return null;
  const last = keys[keys.length - 1];
  if (played(state, today) && state.days[today]?.plays) return null;
  const gap = dayDiff(addDays(today, -1), last);
  if (gap < 1 || gap > 7 || gap > state.hammers) return null;
  const fill = [];
  for (let k = addDays(last, 1); k <= addDays(today, -1); k = addDays(k, 1)) {
    if (!state.nocount.includes(k)) fill.push(k);
  }
  if (!fill.length || fill.length > state.hammers) return null;
  const streakBefore = currentStreak({ ...state, nocount: [...state.nocount, ...fill] }, addDays(today, -1));
  return streakBefore >= 2 ? fill : null;
}

export function useHammers(state, days, now = Date.now()) {
  for (const k of days) if (!state.nocount.includes(k)) state.nocount.push(k);
  state.hammers = Math.max(0, state.hammers - days.length);
  state.hammerLog.push({ t: now, days });
  if (state.hammerLog.length > 50) state.hammerLog.splice(0, state.hammerLog.length - 50);
  state.stats.hammersUsed = (state.stats.hammersUsed || 0) + days.length;
}

export function declineHammer(state, today = dayKey()) {
  state.hammerDeclined = today;
}

export function grantHammer(state) {
  if (state.hammers >= HAMMER_MAX) return false;
  state.hammers++;
  return true;
}
