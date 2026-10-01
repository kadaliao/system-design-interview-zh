// 把一道题拆成若干「格」：每个被接受的输入算一格，决定连击和多巴值。
// 单选/判断 1 格；多选每个正确项 1 格；填空每个空 1 格；排序每一项 1 格；配对每一对 1 格。
// 输入错误只算「差一点」：不扣分、不结束，答对前可以继续点。

import { shuffle } from './core.js';

const BLANK = /\[\[(.+?)\]\]/g;

/** 把 "…[[答案]]…" 切成片段：{t:'文字'} 或 {blank:序号}，并取出答案列表。 */
export function parseFill(text) {
  const segs = [];
  const answers = [];
  let last = 0;
  for (const m of text.matchAll(BLANK)) {
    if (m.index > last) segs.push({ t: text.slice(last, m.index) });
    segs.push({ blank: answers.length });
    answers.push(m[1]);
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ t: text.slice(last) });
  return { segs, answers };
}

export function cellCount(ex) {
  switch (ex.type) {
    case 'multi': return ex.answers.length;
    case 'fill': return parseFill(ex.text).answers.length;
    case 'order': return ex.items.length;
    case 'match': return ex.pairs.length;
    default: return 1;
  }
}

/**
 * 创建一轮作答。返回对象：
 *   view      渲染用的数据（选项/词块/排序项/配对两列已打乱）
 *   input(tok)  → { result: 'ok'|'miss'|'select'|'noop', cell, done }
 *   hintToken() → 下一个应该点的 token（连错后提示用），无则 null
 * token 形如 {opt:id}（单选/多选/判断）、{chip:id}（填空）、{item:id}（排序）、{side:'L'|'R', id}（配对）。
 */
export function createRound(ex, rand = Math.random, labels = { judgeTrue: '正确', judgeFalse: '错误' }) {
  const r = {
    ex, type: ex.type, cells: cellCount(ex),
    accepted: 0, misses: 0, cellMisses: 0, done: false,
    acceptedIds: new Set(), missedIds: new Set(), view: {},
  };
  const finish = () => { r.done = r.accepted >= r.cells; return r.done; };
  const ok = (extra = {}) => {
    r.accepted++;
    r.cellMisses = 0;
    return { result: 'ok', cell: r.accepted, done: finish(), ...extra };
  };
  const miss = (id, extra = {}) => {
    r.misses++;
    r.cellMisses++;
    if (id !== undefined) r.missedIds.add(id);
    return { result: 'miss', cell: r.accepted + 1, done: false, ...extra };
  };

  switch (ex.type) {
    case 'single':
    case 'multi': {
      const correct = new Set(ex.type === 'single' ? [ex.answer] : ex.answers);
      r.view.options = shuffle(ex.options.map((text, id) => ({ id, text })), rand);
      r.view.multi = ex.type === 'multi';
      r.input = tok => {
        if (r.done || tok.opt === undefined) return { result: 'noop' };
        const id = tok.opt;
        if (r.acceptedIds.has(id) || r.missedIds.has(id)) return { result: 'noop' };
        if (correct.has(id)) { r.acceptedIds.add(id); return ok({ id }); }
        return miss(id, { id });
      };
      r.hintToken = () => {
        const id = [...correct].find(i => !r.acceptedIds.has(i));
        return id === undefined ? null : { opt: id };
      };
      break;
    }
    case 'judge': {
      const correctId = ex.answer ? 1 : 0;
      r.view.options = [{ id: 1, text: labels.judgeTrue }, { id: 0, text: labels.judgeFalse }];
      r.view.multi = false;
      r.input = tok => {
        if (r.done || tok.opt === undefined) return { result: 'noop' };
        const id = tok.opt;
        if (r.acceptedIds.has(id) || r.missedIds.has(id)) return { result: 'noop' };
        if (id === correctId) { r.acceptedIds.add(id); return ok({ id }); }
        return miss(id, { id });
      };
      r.hintToken = () => (r.done ? null : { opt: correctId });
      break;
    }
    case 'fill': {
      const { segs, answers } = parseFill(ex.text);
      const chipTexts = [...answers, ...(ex.distractors || [])];
      r.view.segs = segs;
      r.view.blanks = answers.map(() => null); // 已填入的词块文字
      r.view.chips = shuffle(chipTexts.map((text, id) => ({ id, text })), rand);
      const filled = answers.map(() => false);
      r.input = tok => {
        if (r.done || tok.chip === undefined) return { result: 'noop' };
        const id = tok.chip;
        const chip = r.view.chips.find(c => c.id === id);
        if (!chip || r.acceptedIds.has(id) || r.missedIds.has(id)) return { result: 'noop' };
        const slot = answers.findIndex((a, i) => !filled[i] && a === chip.text);
        if (slot < 0) return miss(id, { id });
        filled[slot] = true;
        r.view.blanks[slot] = chip.text;
        r.acceptedIds.add(id);
        return ok({ id, slot });
      };
      r.hintToken = () => {
        const slot = filled.findIndex(f => !f);
        if (slot < 0) return null;
        const chip = r.view.chips.find(c => c.text === answers[slot] && !r.acceptedIds.has(c.id));
        return chip ? { chip: chip.id } : null;
      };
      break;
    }
    case 'order': {
      r.view.items = shuffle(ex.items.map((text, id) => ({ id, text })), rand);
      r.view.sequence = []; // 已按顺序点中的项目 id
      r.input = tok => {
        if (r.done || tok.item === undefined) return { result: 'noop' };
        const id = tok.item;
        if (r.acceptedIds.has(id)) return { result: 'noop' };
        const want = ex.items[r.accepted];
        if (ex.items[id] === want) {
          r.acceptedIds.add(id);
          r.view.sequence.push(id);
          // 清除这一格上已累计的错点标记，避免错点项永远灰着
          r.missedIds.clear();
          return ok({ id, position: r.accepted });
        }
        return miss(id, { id });
      };
      r.hintToken = () => {
        const want = ex.items[r.accepted];
        const it = r.view.items.find(i => ex.items[i.id] === want && !r.acceptedIds.has(i.id));
        return it ? { item: it.id } : null;
      };
      // 排序题错点后允许再点：错点只记次数，不锁定该项
      const base = r.input;
      r.input = tok => {
        if (tok.item !== undefined) r.missedIds.delete(tok.item);
        return base(tok);
      };
      break;
    }
    case 'match': {
      r.view.left = shuffle(ex.pairs.map((p, id) => ({ id, text: p[0] })), rand);
      r.view.right = shuffle(ex.pairs.map((p, id) => ({ id, text: p[1] })), rand);
      r.view.selected = null; // {side, id}
      r.input = tok => {
        if (r.done || !tok.side) return { result: 'noop' };
        const key = tok.side + tok.id;
        if (r.acceptedIds.has('L' + tok.id) && tok.side === 'L') return { result: 'noop' };
        if (r.acceptedIds.has('R' + tok.id) && tok.side === 'R') return { result: 'noop' };
        const sel = r.view.selected;
        if (!sel || sel.side === tok.side) {
          r.view.selected = { side: tok.side, id: tok.id };
          return { result: 'select', cell: r.accepted, done: false };
        }
        r.view.selected = null;
        const a = sel.side === 'L' ? sel : tok;
        const b = sel.side === 'R' ? sel : tok;
        if (a.id === b.id) {
          r.acceptedIds.add('L' + a.id).add('R' + b.id);
          return ok({ id: a.id });
        }
        return miss(undefined, { left: a.id, right: b.id, key });
      };
      r.hintToken = () => {
        const id = ex.pairs.findIndex((_, i) => !r.acceptedIds.has('L' + i));
        if (id < 0) return null;
        const sel = r.view.selected;
        return sel && sel.side === 'L' && sel.id === id ? { side: 'R', id } : { side: 'L', id };
      };
      break;
    }
    default:
      throw new Error('未知题型 ' + ex.type);
  }
  return r;
}
