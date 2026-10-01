// 从存档里算出各项累计指标。成就、收藏解锁、成长对比共用这一份。

import { currentStreak, longestStreak, playDaysCount } from './streak.js';
import { chapterCleared, totalStars } from './skills.js';
import { dayKey } from './core.js';

export const CHAPTER_COUNT = 28;
export const TYPES = ['single', 'multi', 'judge', 'fill', 'order', 'match'];

export function metricsOf(state, course, now = Date.now()) {
  const st = state.stats;
  const mastered = Object.values(state.skills).filter(r => r.mastered).length;
  let cleared = 0;
  for (const n of course.chapters.keys()) if (chapterCleared(course, state, n)) cleared++;
  const m = {
    streak: Math.max(currentStreak(state, dayKey(now)), longestStreak(state)),
    playDays: playDaysCount(state),
    login: state.login.total,
    crowns: state.login.crowns,
    answered: st.answered,
    cells: st.cells,
    plays: st.plays,
    mastered,
    stars: totalStars(state),
    cleared,
    bestCombo: st.bestCombo,
    bestScore: st.bestScore,
    extraQ: st.extraQ,
    maxExtraQ: st.maxExtraQ,
    perfect: st.perfect,
    ftRate: st.answered >= 100 ? Math.floor((st.ft / st.answered) * 100) : 0,
    reviewSolved: st.reviewSolved,
    polished: st.polished,
    questDays: state.questLog.days,
    questDone: state.questLog.done,
    unlocked: Object.keys(state.unlocked).length,
    minutes: Math.floor(st.seconds / 60),
    dopa: Math.floor(st.bestL),
    hammers: st.hammersUsed || 0,
    reads: st.reads || 0,
    trophies: Object.keys(state.trophies).length,
    miss: st.miss,
  };
  for (const t of TYPES) m['type_' + t] = st['byType_' + t] || 0;
  return m;
}
