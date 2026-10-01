import test from 'node:test';
import assert from 'node:assert/strict';
import { loadZh, freshState } from './fixture.mjs';
import { currentStreak, longestStreak, loginBonus, hammerOffer, useHammers, markPlayed, SEAL_CYCLE } from '../js/streak.js';
import { ensureToday, bump, claimReward } from '../js/quests.js';
import { checkTrophies, TROPHIES, almostThere } from '../js/trophies.js';
import { checkUnlocks, resolveChoice } from '../js/unlocks.js';
import { buildPlan } from '../js/select.js';
import { createSession } from '../js/session.js';
import { applyQuestion, commitBasic, commitExtra } from '../js/progress.js';
import { weeklyGrowth, compareWithPast } from '../js/growth.js';
import { rng, dayKey, addDays, DAY_MS } from '../js/core.js';

const course = loadZh();
const NOON = new Date(2026, 5, 15, 12).getTime();
const day = n => addDays('2026-06-15', n);

test('连续天数：今天没玩从昨天数；补签日连着但不加天数', () => {
  const st = freshState();
  for (const d of [-3, -2, -1]) markPlayed(st, day(d), 100);
  assert.equal(currentStreak(st, day(0)), 3);
  markPlayed(st, day(0), 100);
  assert.equal(currentStreak(st, day(0)), 4);
  const s2 = freshState();
  markPlayed(s2, day(-3), 100); markPlayed(s2, day(-2), 100);
  s2.nocount.push(day(-1));
  markPlayed(s2, day(0), 100);
  assert.equal(currentStreak(s2, day(0)), 3);
  assert.equal(longestStreak(s2), 3);
});

test('登录贴纸：每天一次，连续周期 1..7，断档重来，补签不断', () => {
  const st = freshState();
  const seals = [];
  for (let i = 0; i < 8; i++) seals.push(loginBonus(st, day(i)).seal);
  assert.deepEqual(seals.slice(0, 7), SEAL_CYCLE);
  assert.equal(seals[7], SEAL_CYCLE[0]);
  assert.equal(st.login.crowns, 1);
  assert.equal(loginBonus(st, day(7)).granted, false);
  const r = loginBonus(st, day(10));
  assert.equal(r.cycle, 1);
  st.nocount.push(day(11), day(12));
  assert.equal(loginBonus(st, day(13)).cycle, 2);
});

test('补签锤：空档能被锤子补齐且能保住 ≥2 天连续时才建议', () => {
  const st = freshState();
  markPlayed(st, day(-4), 100); markPlayed(st, day(-3), 100);
  assert.deepEqual(hammerOffer(st, day(0)), [day(-2), day(-1)].filter(() => true).slice(0, 0).length ? [] : null);
  st.hammers = 2;
  const offer = hammerOffer(st, day(0));
  assert.deepEqual(offer, [day(-2), day(-1)]);
  useHammers(st, offer);
  assert.equal(st.hammers, 0);
  markPlayed(st, day(0), 100);
  assert.equal(currentStreak(st, day(0)), 3);
  const s2 = freshState();
  markPlayed(s2, day(-4), 100);
  assert.equal(hammerOffer(s2, day(0)), null); // 只有 1 天连续，不值得
});

test('每日任务：固定 3 个、当天不重抽、满完成发锤子一次', () => {
  const st = freshState();
  const q1 = ensureToday(st, course, NOON);
  assert.equal(q1.list.length, 3);
  assert.equal(q1.list.filter(q => q.tier === 'easy').length, 2);
  assert.equal(new Set(q1.list.map(q => q.metric)).size, 3);
  const q2 = ensureToday(st, course, NOON + 3600e3);
  assert.equal(q1, q2);
  st.hammers = 1;
  for (const q of q1.list) bump(st, q.metric, 99, { lesson: q.lesson });
  assert.ok(q1.list.every(q => q.done));
  assert.equal(claimReward(st), 'hammer');
  assert.equal(st.hammers, 2);
  assert.equal(claimReward(st), null);
  const q3 = ensureToday(st, course, NOON + DAY_MS);
  assert.notEqual(q3.day, q1.day);
});

function playOnce(st, now, { extra = 0 } = {}) {
  const plan = buildPlan({ course, state: st, mode: 'chapter', ref: 4, n: 10, rand: rng(now), now });
  const s = createSession({ plan, n: 10, rand: rng(1) });
  let t = 0;
  s.start(t);
  for (let i = 0; i < 10; i++) {
    while (!s.round.done) {
      const evs = s.input(s.round.hintToken(), (t += 400));
      for (const e of evs) if (e.type === 'questionDone') applyQuestion(st, course, e, { mode: 'chapter', phase: 'basic', now });
    }
    s.advance(t += 300);
  }
  const { entry } = commitBasic(st, course, s, plan, now);
  if (extra && s.enterExtra(t)) {
    for (let k = 0; k < extra; k++) {
      while (!s.round.done) for (const e of s.input(s.round.hintToken(), (t += 400))) if (e.type === 'questionDone') applyQuestion(st, course, e, { mode: 'chapter', phase: 'extra', now });
      s.advance(t += 300);
    }
    s.finish();
    commitExtra(st, s, entry);
  }
  return { s, entry };
}

test('结算：玩一局后统计、历史、技能、成就、收藏都更新', () => {
  const st = freshState();
  const { s, entry } = playOnce(st, NOON, { extra: 6 });
  assert.equal(st.stats.plays, 1);
  assert.equal(st.stats.answered, 16);
  assert.equal(st.history.length, 1);
  assert.equal(entry.extra, 6);
  assert.equal(entry.score, 100 + 10 * 6 + 5 * 15);
  assert.equal(st.stats.perfect, 1);
  assert.equal(st.days[dayKey(NOON)].plays, 1);
  assert.ok(st.stats.bestCombo >= 10);
  const got = checkTrophies(st, course, NOON);
  const ids = got.map(t => t.id);
  assert.ok(ids.includes('plays:1') && ids.includes('answered:10') && ids.includes('perfect:1') && ids.includes('chPlay:4'));
  assert.equal(checkTrophies(st, course, NOON).length, 0, '已获得的不重复发');
  assert.ok(checkUnlocks(st, course, NOON).length >= 3);
  assert.ok(['chip'].includes(resolveChoice(st, 'music', 'chip')));
  assert.ok(almostThere(st, course, 12, NOON).length > 0);
});

test('答错的题进复习本，复习模式一次答对后移除', () => {
  const st = freshState();
  const entry = { id: 'c04-01-01', qtype: 'single', lesson: 'c04-01', ft: false, misses: 1, ms: 5000, ratio: 1, cells: 1 };
  applyQuestion(st, course, entry, { mode: 'chapter', phase: 'basic', now: NOON });
  assert.equal(st.review.length, 1);
  applyQuestion(st, course, { ...entry, ft: true, misses: 0 }, { mode: 'review', phase: 'basic', now: NOON + 1 });
  assert.equal(st.review.length, 0);
  assert.equal(st.stats.reviewSolved, 1);
});

test('实力检测：答对的探测题让前提链整体掌握', () => {
  const st = freshState();
  const entry = { id: 'c05-01-01', qtype: 'single', lesson: 'c05-03', ft: true, misses: 0, ms: 3000, ratio: 0.5, cells: 1 };
  const out = applyQuestion(st, course, entry, { mode: 'self', phase: 'basic', placement: true, now: NOON });
  assert.ok(out.placed.includes('c01-01') && out.placed.includes('c05-03'));
});

test('成长对比：只返回变好的项目', () => {
  const st = freshState();
  const mk = (t, ft, ms, combo, score) => ({ t, mode: 'chapter', n: 10, ft, miss: 10 - ft, ms, score, extra: 0, maxCombo: combo, L: 2 });
  st.history.push(mk(NOON - 10 * DAY_MS, 6, 200000, 8, 100), mk(NOON - 9 * DAY_MS, 6, 200000, 8, 100));
  st.history.push(mk(NOON - DAY_MS, 9, 120000, 20, 100), mk(NOON - 100, 9, 120000, 20, 100));
  const keys = weeklyGrowth(st, NOON).map(g => g.key);
  assert.deepEqual(keys.sort(), ['combo', 'ftRate', 'speed']);
  const e = mk(NOON, 10, 90000, 25, 100);
  st.history.push(e);
  assert.ok(compareWithPast(st, e).length >= 3);
});

test('成就定义：id 唯一，数量充足', () => {
  const ids = TROPHIES.map(t => t.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length > 250);
});
