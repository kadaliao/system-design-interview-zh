import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound, parseFill, cellCount } from '../js/cells.js';
import { rng } from '../js/core.js';

const R = () => rng(7);

test('单选：错点不结束，答对才完成，错项不能重复点', () => {
  const r = createRound({ type: 'single', options: ['a', 'b', 'c'], answer: 1 }, R());
  assert.equal(r.cells, 1);
  assert.equal(r.input({ opt: 0 }).result, 'miss');
  assert.equal(r.input({ opt: 0 }).result, 'noop');
  assert.equal(r.misses, 1);
  const o = r.input({ opt: 1 });
  assert.deepEqual([o.result, o.done], ['ok', true]);
  assert.equal(r.input({ opt: 2 }).result, 'noop');
});

test('判断：true/false 对应 id 1/0', () => {
  const r = createRound({ type: 'judge', answer: false }, R());
  assert.equal(r.input({ opt: 1 }).result, 'miss');
  assert.equal(r.input({ opt: 0 }).done, true);
});

test('多选：每个正确项 1 格，错项算差一点，全部选中才完成', () => {
  const r = createRound({ type: 'multi', options: ['a', 'b', 'c', 'd'], answers: [0, 2] }, R());
  assert.equal(r.cells, 2);
  assert.equal(r.input({ opt: 1 }).result, 'miss');
  assert.equal(r.input({ opt: 0 }).done, false);
  assert.equal(r.input({ opt: 2 }).done, true);
  assert.equal(r.misses, 1);
});

test('填空：词块可填入任一未填空位，错词块算 miss', () => {
  const ex = { type: 'fill', text: '甲[[X]]乙[[Y]]丙', distractors: ['Z'] };
  assert.deepEqual(parseFill(ex.text).answers, ['X', 'Y']);
  assert.equal(cellCount(ex), 2);
  const r = createRound(ex, R());
  const chip = t => ({ chip: r.view.chips.find(c => c.text === t).id });
  assert.equal(r.input(chip('Z')).result, 'miss');
  assert.equal(r.input(chip('Y')).slot, 1);
  assert.deepEqual(r.view.blanks, [null, 'Y']);
  assert.equal(r.input(chip('X')).done, true);
});

test('排序：按顺序点，点错只记次数，仍可继续点', () => {
  const r = createRound({ type: 'order', items: ['一', '二', '三'] }, R());
  const it = t => ({ item: r.view.items.find(i => i.text === t).id });
  assert.equal(r.input(it('二')).result, 'miss');
  assert.equal(r.input(it('二')).result, 'miss'); // 排序项不被锁死
  assert.equal(r.input(it('一')).result, 'ok');
  assert.equal(r.input(it('二')).result, 'ok');
  assert.equal(r.input(it('三')).done, true);
  assert.equal(r.misses, 2);
});

test('配对：先后点左右两列，同列重选只换选择，配错算 miss', () => {
  const r = createRound({ type: 'match', pairs: [['a', 'A'], ['b', 'B'], ['c', 'C']] }, R());
  assert.equal(r.input({ side: 'L', id: 0 }).result, 'select');
  assert.equal(r.input({ side: 'L', id: 1 }).result, 'select');
  assert.equal(r.input({ side: 'R', id: 0 }).result, 'miss');
  assert.equal(r.view.selected, null);
  assert.equal(r.input({ side: 'R', id: 1 }).result, 'select'); // 先点右再点左也行
  assert.equal(r.input({ side: 'L', id: 1 }).result, 'ok');
  assert.equal(r.input({ side: 'L', id: 1 }).result, 'noop');
  r.input({ side: 'L', id: 0 }); r.input({ side: 'R', id: 0 });
  r.input({ side: 'L', id: 2 });
  assert.equal(r.input({ side: 'R', id: 2 }).done, true);
});

test('hintToken 指向下一步正确输入', () => {
  const r = createRound({ type: 'order', items: ['一', '二', '三'] }, R());
  const tok = r.hintToken();
  assert.equal(r.input(tok).result, 'ok');
  const m = createRound({ type: 'match', pairs: [['a', 'A'], ['b', 'B']] }, R());
  assert.equal(m.input(m.hintToken()).result, 'select');
  assert.equal(m.input(m.hintToken()).result, 'ok');
});
