// 每日任务：每天固定 3 个（2 个简单 + 1 个费功夫），当天内不会重抽，全部完成奖励一把补签锤。

import { dayKey, hashSeed, rng, shuffle } from './core.js';
import { grantHammer } from './streak.js';
import { isMastered, isUnlocked, rustySkills } from './skills.js';

const EASY = ['play1', 'combo5', 'ft5', 'review1', 'new1'];
const HARD = ['extra1', 'extra5', 'combo20', 'play2', 'chapter1', 'learn10', 'skill3'];

// 去重用：同一个指标当天只出现一次
const METRIC = {
  play1: 'plays', play2: 'plays', combo5: 'combo', combo20: 'combo', ft5: 'ft', review1: 'review', new1: 'newq',
  extra1: 'extraEnter', extra5: 'extraQ', chapter1: 'chapterPlay', learn10: 'learnq', skill3: 'skillFt', polish3: 'skillFt',
};
const TARGET = { play1: 1, play2: 2, combo5: 5, combo20: 20, ft5: 5, review1: 1, new1: 1, extra1: 1, extra5: 5, chapter1: 1, learn10: 10, skill3: 3, polish3: 3 };

function eligible(id, ctx) {
  const { state, course, now } = ctx;
  const hasLearn = state.placementDone && course.lessons.some(l => !isMastered(state, l.id) && isUnlocked(course, state, l.id));
  switch (id) {
    case 'review1': return state.review.length > 0;
    case 'new1': return course.lessons.some(l => isUnlocked(course, state, l.id) && !state.skills[l.id]);
    case 'extra1': case 'extra5': return state.history.slice(-5).some(h => h.extra > 0);
    case 'combo20': return true;
    case 'learn10': return hasLearn;
    case 'skill3': return hasLearn || rustySkills(state, now).length > 0;
    default: return true;
  }
}

function pickLesson(ctx, rand) {
  const { state, course, now } = ctx;
  const rusty = rustySkills(state, now);
  if (rusty.length && rand() < 0.5) return { id: rusty[0], polish: true };
  const learn = course.lessons.filter(l => !isMastered(state, l.id) && isUnlocked(course, state, l.id));
  return learn.length ? { id: learn[Math.floor(rand() * Math.min(4, learn.length))].id, polish: false } : { id: rusty[0], polish: true };
}

export function ensureToday(state, course, now = Date.now()) {
  const today = dayKey(now);
  if (state.quests && state.quests.day === today) return state.quests;
  const rand = rng(hashSeed(today + ':' + state.stats.plays));
  const ctx = { state, course, now };
  const used = new Set();
  const take = (pool, n) => {
    const out = [];
    for (const id of shuffle(pool, rand)) {
      if (out.length >= n) break;
      if (!eligible(id, ctx) || used.has(METRIC[id])) continue;
      used.add(METRIC[id]);
      out.push(id);
    }
    return out;
  };
  const list = [...take(EASY, 2).map(id => ({ id, tier: 'easy' })), ...take(HARD, 1).map(id => ({ id, tier: 'hard' }))];
  for (const q of list) {
    q.metric = METRIC[q.id];
    q.target = TARGET[q.id];
    q.progress = 0;
    q.done = false;
    if (q.id === 'skill3') {
      const { id, polish } = pickLesson(ctx, rand);
      q.lesson = id;
      if (polish) q.id = 'polish3';
    }
  }
  state.quests = { day: today, list, rewarded: false };
  return state.quests;
}

/** 进度加一。metric 对应上面的指标；value 是数量，对 combo 取最大值。返回刚完成的任务。 */
export function bump(state, metric, value = 1, extra = {}) {
  const qs = state.quests;
  if (!qs) return [];
  const done = [];
  for (const q of qs.list) {
    if (q.done || q.metric !== metric) continue;
    if (metric === 'skillFt' && q.lesson !== extra.lesson) continue;
    q.progress = metric === 'combo' ? Math.max(q.progress, value) : q.progress + value;
    if (q.progress >= q.target) {
      q.progress = q.target;
      q.done = true;
      done.push(q);
      state.questLog.done++;
      if (q.tier === 'hard') state.questLog.hard++;
    }
  }
  return done;
}

/** 三个都完成时发放奖励（每天一次）。返回 'hammer' | 'full' | null。 */
export function claimReward(state) {
  const qs = state.quests;
  if (!qs || qs.rewarded || !qs.list.length || !qs.list.every(q => q.done)) return null;
  qs.rewarded = true;
  state.questLog.days++;
  return grantHammer(state) ? 'hammer' : 'full';
}
