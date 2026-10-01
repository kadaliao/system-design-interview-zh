import test from 'node:test';
import assert from 'node:assert/strict';
import { loadZh, freshState } from './fixture.mjs';
import { recordAnswer, isMastered, statusOf, rustySkills, placeMaster, resetSkill, rec } from '../js/skills.js';
import { DAY_MS } from '../js/core.js';

const course = loadZh();
const T0 = Date.UTC(2026, 0, 1);
const ans = (st, id, ft, t, ratio = 0.5) => recordAnswer(st, id, { exId: id + '-x', ft, ratio, ms: 3000, now: t });

test('掌握：至少 6 题历史且最近 6 题中 5 题首次即对', () => {
  const st = freshState();
  for (let i = 0; i < 5; i++) assert.equal(ans(st, 'c01-01', true, T0 + i).mastered, false);
  assert.equal(ans(st, 'c01-01', true, T0 + 5).mastered, true);
  assert.ok(isMastered(st, 'c01-01'));
  const st2 = freshState();
  for (let i = 0; i < 6; i++) ans(st2, 'c01-01', i < 2 ? false : i === 5, T0 + i);
  assert.equal(isMastered(st2, 'c01-01'), false);
});

test('解锁：下一课要前一课掌握，章首要前提章末课掌握', () => {
  const st = freshState();
  assert.equal(statusOf(course, st, 'c01-01'), 'new');
  assert.equal(statusOf(course, st, 'c01-02'), 'locked');
  placeMaster(course, st, 'c01-04');
  assert.equal(statusOf(course, st, 'c02-01'), 'new');
  assert.equal(statusOf(course, st, 'c02-02'), 'locked');
  assert.equal(statusOf(course, st, 'c01-02'), 'mastered');
});

test('星级：快速全对升到 ☆3；☆4 要 ☆3 之后 7 天；之后高精度高速度才 ☆5', () => {
  const st = freshState();
  let t = T0;
  for (let i = 0; i < 20; i++) ans(st, 'c01-01', true, (t += 1000), 0.5);
  const r = rec(st, 'c01-01');
  assert.equal(r.stars, 3);                       // 同一天内到不了 ☆4
  for (let i = 0; i < 3; i++) ans(st, 'c01-01', true, (t += 1000), 0.5);
  assert.equal(r.stars, 3);
  t += 8 * DAY_MS;
  let gained;
  for (let i = 0; i < 3; i++) gained = ans(st, 'c01-01', true, (t += 1000), 0.5);
  assert.equal(r.stars, 5, '☆4 条件满足后同一次判定连升到 ☆5：' + JSON.stringify(gained));
});

test('生锈：掌握后 21 天没有首次即对就生锈，答对一次擦亮且保留星级', () => {
  const st = freshState();
  for (let i = 0; i < 6; i++) ans(st, 'c01-01', true, T0 + i);
  assert.deepEqual(rustySkills(st, T0 + 20 * DAY_MS), []);
  assert.deepEqual(rustySkills(st, T0 + 22 * DAY_MS), ['c01-01']);
  const out = recordAnswer(st, 'c01-01', { exId: 'e', ft: true, ratio: 1, ms: 1, now: T0 + 22 * DAY_MS });
  assert.equal(out.polished, true);
  assert.deepEqual(rustySkills(st, T0 + 22 * DAY_MS), []);
  assert.ok(rec(st, 'c01-01').stars >= 1);
});

test('记录删除：同时清掉后代课', () => {
  const st = freshState();
  placeMaster(course, st, 'c03-04');
  resetSkill(course, st, 'c02-01');
  assert.equal(isMastered(st, 'c01-04'), true);
  assert.equal(isMastered(st, 'c02-01'), false);
  assert.equal(isMastered(st, 'c03-04'), false);
  assert.equal(statusOf(course, st, 'c02-01'), 'new');
  assert.equal(statusOf(course, st, 'c02-02'), 'locked');
});
