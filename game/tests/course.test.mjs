import test from 'node:test';
import assert from 'node:assert/strict';
import { loadZh } from './fixture.mjs';
import { cellCount, createRound } from '../js/cells.js';
import { rng } from '../js/core.js';

const course = loadZh();

test('课程结构：28 章、111 课、1039 题', () => {
  assert.equal(course.chapters.size, 28);
  assert.equal(course.lessons.length, 111);
  assert.equal(course.exById.size, 1039);
});

test('前提关系无环，深度随前提递增', () => {
  for (const l of course.lessons) {
    for (const p of l.prereqs) assert.ok(course.lesson(p).depth < l.depth, `${l.id} ← ${p}`);
  }
  const orders = course.ordered.map(l => l.order);
  assert.deepEqual(orders, orders.map((_, i) => i));
});

test('每道题都能拆成格并完整走通（用正确答案）', () => {
  for (const ex of course.exById.values()) {
    const r = createRound(ex, rng(3));
    assert.equal(r.cells, cellCount(ex), ex.id);
    assert.ok(r.cells >= 1 && r.cells <= 8, ex.id);
    let guard = 0;
    while (!r.done && guard++ < 50) {
      const tok = r.hintToken();
      assert.ok(tok, `${ex.id} 没有提示 token`);
      const res = r.input(tok);
      assert.ok(res.result === 'ok' || res.result === 'select', `${ex.id} 提示 token 被拒：${res.result}`);
    }
    assert.ok(r.done, `${ex.id} 没走完`);
    assert.equal(r.misses, 0);
  }
});
