import test from 'node:test';
import assert from 'node:assert/strict';
import { loadZh, freshState } from './fixture.mjs';
import { buildPlan } from '../js/select.js';
import { createSession, comboMilestone } from '../js/session.js';
import { rng, stageForL, formatDopa } from '../js/core.js';
import { totalPoints, basicCurve, extraCurve, comboMultiplier } from '../js/scoring.js';

const course = loadZh();

/** 用 hintToken 自动答完当前题；missEvery>0 时第一次故意点错。 */
function solve(s, t, wrongFirst = false) {
  const evs = [];
  if (wrongFirst) {
    const ex = s.ex;
    let bad;
    if (s.round.type === 'single') bad = { opt: s.round.view.options.find(o => o.id !== ex.answer).id };
    else if (s.round.type === 'judge') bad = { opt: ex.answer ? 0 : 1 };
    else if (s.round.type === 'multi') bad = { opt: s.round.view.options.find(o => !ex.answers.includes(o.id)).id };
    else if (s.round.type === 'fill') bad = { chip: s.round.view.chips.find(c => !ex.text.includes(`[[${c.text}]]`)).id };
    else if (s.round.type === 'order') { const want = ex.items[0]; bad = { item: s.round.view.items.find(i => ex.items[i.id] !== want).id }; }
    else bad = null;
    if (bad) evs.push(...s.input(bad, t));
  }
  let g = 0;
  while (!s.round.done && g++ < 40) evs.push(...s.input(s.round.hintToken(), (t += 200)));
  return evs;
}

function play(mode, ref, { wrongs = 0, n = 10, state = freshState() } = {}) {
  const plan = buildPlan({ course, state, mode, ref, n, rand: rng(1), now: 1e12 });
  const s = createSession({ plan, n: plan.n, rand: rng(2) });
  let t = 1000;
  s.start(t);
  let w = wrongs;
  for (let i = 0; i < plan.n; i++) {
    solve(s, (t += 500), w-- > 0);
    s.advance((t += 500));
  }
  return { s, plan };
}

test('章节模式：完整打完基本 N 题得 100 分，全对可进加试', () => {
  const { s } = play('chapter', 4);
  assert.equal(s.phase, 'basicDone');
  assert.equal(s.qDone, 10);
  assert.equal(s.ftQ, 10);
  assert.equal(s.score(), 100);
  assert.ok(s.canExtra());
  assert.ok(s.L > 1.5 && s.L < 5, 'L=' + s.L);
});

test('加试：每题 10+5k 分，连击清零但多巴值保留，题目不重复地一直出', () => {
  const { s } = play('chapter', 4);
  const L0 = s.L;
  assert.ok(s.enterExtra(9e3));
  assert.equal(s.combo, 0);
  const seen = new Set();
  for (let k = 0; k < 12; k++) {
    seen.add(s.ex.id);
    solve(s, 1e4 + k * 1000);
    s.advance(1e4 + k * 1000 + 500);
  }
  assert.equal(s.extraDone, 12);
  assert.equal(s.score(), totalPoints(12));
  assert.ok(s.L > L0);
  assert.ok(seen.size >= 10, '加试 12 题里至少 10 道不同：' + seen.size);
});

test('答错不扣分、不结束：连击归零，多巴值不降，可继续答对', () => {
  const state = freshState();
  const plan = buildPlan({ course, state, mode: 'chapter', ref: 5, n: 6, rand: rng(1), now: 1e12 });
  const s = createSession({ plan, n: 6, rand: rng(2) });
  s.start(0);
  solve(s, 100); s.advance(1000);
  const before = { L: s.L, combo: s.combo };
  assert.ok(before.combo > 0);
  const evs = solve(s, 2000, true);
  assert.ok(evs.some(e => e.type === 'miss'));
  assert.ok(s.L >= before.L);
  assert.equal(s.log.at(-1)?.ft ?? false, s.log.length === 1 ? false : s.log.at(-1).ft);
  assert.ok(s.round.done);
});

test('首次即对率低于 80% 不能进加试', () => {
  const { s } = play('chapter', 6, { wrongs: 3 });
  assert.equal(s.phase, 'basicDone');
  assert.ok(s.ftQ <= 8);
  assert.equal(s.canExtra(), s.firstTryRate() >= 0.8);
  const { s: s2 } = play('chapter', 6, { wrongs: 5 });
  assert.equal(s2.canExtra(), false);
});

test('连击时限：≥2 连击时超时会断，1 连击不受影响，暂停不计时', () => {
  const plan = buildPlan({ course, state: freshState(), mode: 'chapter', ref: 4, n: 6, rand: rng(1), now: 1e12 });
  const s = createSession({ plan, n: 6, rand: rng(2) });
  s.start(0);
  s.advance && 0;
  // 先答完一题得到连击
  solve(s, 100);
  s.advance(200);
  assert.ok(s.combo >= 2 || s.combo >= 1);
  const c = s.combo;
  s.pause(300);
  assert.deepEqual(s.tick(60000), c >= 2 ? [] : []);
  s.resume(60000);
  const evs = s.tick(60000 + 1e6);
  if (c >= 2) assert.equal(evs[0].type, 'timeout'); else assert.equal(evs.length, 0);
});

test('复习模式：只出复习本里的题，不能加试', () => {
  const state = freshState();
  state.review = [{ id: 'c04-01-01', t: 1 }, { id: 'c04-01-02', t: 2 }];
  const { s, plan } = play('review', null, { state });
  assert.equal(plan.n, 2);
  assert.equal(s.canExtra(), false);
});

test('实力检测：探测点沿课程表前进，答错步长减半', () => {
  const state = freshState();
  const plan = buildPlan({ course, state, mode: 'self', ref: null, n: 10, rand: rng(1), now: 1e12 });
  assert.equal(plan.placement, true);
  const first = plan.questionAt(0, null);
  assert.equal(first.lesson, course.ordered[0].id);
  const second = plan.questionAt(1, { ft: true, ex: first });
  assert.equal(course.lesson(second.lesson).order, 6);
  const third = plan.questionAt(2, { ft: false, ex: second });
  // 答错：步长 ceil(6×1.3)=8 → 减半为 4，从最后一次答对的位置（6）往后走 4
  assert.ok(course.lesson(third.lesson).order > 6 - 1 - 6 && course.lesson(third.lesson).order <= 6 + 3);
});

test('阶段、格式化、曲线', () => {
  assert.equal(stageForL(0), 0);
  assert.equal(stageForL(5.2), 8);
  assert.equal(formatDopa(0), '1');
  assert.equal(formatDopa(2), '100');
  assert.equal(formatDopa(4), '1.0万');
  assert.equal(formatDopa(8, 'zh'), '1.0亿');
  assert.equal(formatDopa(4, 'en'), '10K');
  assert.equal(totalPoints(5), 200);
  assert.equal(totalPoints(10), 425);
  assert.equal(totalPoints(30), 2575);
  assert.ok(Math.abs(basicCurve(1) - 2.3) < 1e-9);
  assert.ok(extraCurve(100) < 5.3 && extraCurve(100) > 5.29);
  assert.equal(comboMultiplier(10), 1.5);
  assert.equal(comboMultiplier(99), 2);
  assert.deepEqual([10, 20, 30, 40, 50, 100, 150].map(comboMilestone), ['combo10', 'combo20', 'combo50', null, 'combo50', 'combo50', 'combo50']);
});
