// 把一次游玩的结果结算进存档：技能掌握、统计、历史、复习本、每日任务。

import { dayDiff, dayKey } from './core.js';
import { placeMaster, recordAnswer, isMastered, statusOf } from './skills.js';
import { markPlayed } from './streak.js';
import { bump } from './quests.js';
import { HISTORY_MAX, REVIEW_MAX } from './store.js';

const bumpMap = (obj, key, n = 1) => { obj[key] = (obj[key] || 0) + n; };

/** 一题完成：写技能历史、题目记录、复习本，并推进任务。返回技能事件。 */
export function applyQuestion(state, course, entry, ctx) {
  const { mode, phase, now = Date.now() } = ctx;
  const st = state.stats;
  const lesson = entry.lesson;
  const before = statusOf(course, state, lesson);
  const out = { mastered: false, starsGained: [], polished: false, placed: [] };

  st.answered++;
  if (entry.ft) st.ft++;
  st.cells += entry.cells;
  st.miss += entry.misses;
  bumpMap(st, 'byType_' + entry.qtype);
  const today = state.days[dayKey(now)] || (state.days[dayKey(now)] = { plays: 0, best: 0, answered: 0 });
  today.answered++;

  if (ctx.placement) {
    // 实力检测：答对就整条前提链一起算掌握；题目本身仍记录
    const q = state.q[entry.id] || (state.q[entry.id] = { n: 0, ft: 0, last: 0, lastFt: 0 });
    q.n++; q.last = now;
    if (entry.ft) { q.ft++; q.lastFt = now; out.placed = placeMaster(course, state, lesson, now); }
  } else {
    Object.assign(out, recordAnswer(state, lesson, { exId: entry.id, ft: entry.ft, ratio: entry.ratio, ms: entry.ms, now }));
  }

  // 复习本：没有一次答对的题进去；在复习模式里一次答对则移除
  const i = state.review.findIndex(r => r.id === entry.id);
  if (!entry.ft) {
    if (i >= 0) state.review.splice(i, 1);
    state.review.push({ id: entry.id, t: now });
    if (state.review.length > REVIEW_MAX) state.review.splice(0, state.review.length - REVIEW_MAX);
  } else if (mode === 'review' && i >= 0) {
    state.review.splice(i, 1);
    st.reviewSolved++;
  }
  if (entry.capsule) st.capsules++;

  // 任务
  const done = [];
  if (entry.ft) done.push(...bump(state, 'ft'));
  if (mode === 'review') done.push(...bump(state, 'review'));
  if (before === 'new') done.push(...bump(state, 'newq'));
  if (before === 'new' || before === 'practice') done.push(...bump(state, 'learnq'));
  if (entry.ft) done.push(...bump(state, 'skillFt', 1, { lesson }));
  if (phase === 'extra') done.push(...bump(state, 'extraQ'));
  if (out.polished) { st.polished++; }
  out.quests = done;
  return out;
}

/** 基本问题完成：写一条历史，更新游玩统计与每日任务。返回历史条目。 */
export function commitBasic(state, course, session, plan, now = Date.now()) {
  const st = state.stats;
  const today = dayKey(now);
  const entry = {
    t: now, mode: plan.mode, ref: plan.ref ?? null, n: session.n, ft: session.ftQ, miss: session.miss,
    ms: session.basicMs, score: session.score(), extra: 0, L: +session.L.toFixed(3), maxCombo: session.maxCombo,
  };
  state.history.push(entry);
  if (state.history.length > HISTORY_MAX) state.history.splice(0, state.history.length - HISTORY_MAX);
  st.plays++;
  st.seconds += Math.round(session.basicMs / 1000);
  bumpMap(st.modes, plan.mode);
  if (plan.mode === 'chapter' && plan.ref) bumpMap(st.chapterPlays, plan.ref);
  if (plan.placement) state.placementDone = true;
  if (session.ftQ === session.n) st.perfect++;
  if (session.n >= 14 && session.ftQ === session.n) st.perfect14 = (st.perfect14 || 0) + 1;
  // 隐藏成就用的标记
  const d = new Date(now);
  if (d.getMonth() === 0 && d.getDate() === 1) st.newYear = 1;
  if (d.getHours() < 5) st.lateNight = 1;
  const prevDays = Object.keys(state.days).filter(k => state.days[k].plays > 0 && k < today).sort();
  if (prevDays.length && dayDiff(today, prevDays[prevDays.length - 1]) >= 7) st.comeback = 1;
  if (session.n >= 10 && session.ftQ === session.n && session.basicMs <= 90000) st.fast = 1;
  markPlayed(state, today, entry.score);
  const done = [...bump(state, 'plays')];
  if (plan.mode === 'chapter') done.push(...bump(state, 'chapterPlay'));
  syncBest(state, session);
  return { entry, quests: done };
}

/** 加试结束：把加试成绩并回同一条历史。 */
export function commitExtra(state, session, entry) {
  const st = state.stats;
  entry.extra = session.extraDone;
  entry.score = session.score();
  entry.miss += session.extraMiss;
  entry.L = +session.L.toFixed(3);
  entry.maxCombo = session.maxCombo;
  if (session.extraDone > 0) {
    st.extraPlays++;
    st.extraQ += session.extraDone;
    st.maxExtraQ = Math.max(st.maxExtraQ, session.extraDone);
  }
  if (session.extraDone >= 5 && session.extraFt === session.extraDone) st.perfectExtra5 = (st.perfectExtra5 || 0) + 1;
  syncBest(state, session);
}

export function enterExtraBump(state) {
  return bump(state, 'extraEnter');
}

function syncBest(state, session) {
  const st = state.stats;
  st.bestCombo = Math.max(st.bestCombo, session.maxCombo);
  st.bestScore = Math.max(st.bestScore, session.score());
  st.bestL = Math.max(st.bestL, +session.L.toFixed(3));
  st.comboBreaks += session.comboBreaks || 0;
  session.comboBreaks = 0;
  bump(state, 'combo', session.maxCombo);
}

/** 中途退出：把已打出的最高连击和多巴值记下，不写历史。 */
export function commitAbort(state, session) {
  if (session.basicComplete()) return;
  syncBest(state, { ...session, score: () => 0 });
}
