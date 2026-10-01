import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { zh } from '../js/strings.zh.js';
import { en } from '../js/strings.en.js';
import { TROPHIES, CATEGORIES } from '../js/trophies.js';
import { COLLECTION } from '../js/unlocks.js';

const src = [...readdirSync(new URL('../js/ui', import.meta.url)).map(f => 'ui/' + f), 'app.js']
  .map(f => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8')).join('\n');

const dynamic = () => {
  const keys = [];
  for (const k of ['single', 'multi', 'judge', 'fill', 'order', 'match']) keys.push('type.' + k);
  for (const k of ['self', 'chapter', 'practice', 'review']) keys.push('mode.' + k);
  for (const k of ['play1', 'play2', 'combo5', 'combo20', 'ft5', 'review1', 'new1', 'extra1', 'extra5', 'chapter1', 'learn10', 'skill3', 'polish3']) keys.push('quest.' + k);
  for (const d of TROPHIES) keys.push(d.secret ? 'tr.secret.' + d.series : 'tr.' + d.series);
  for (const c of ['all', ...CATEGORIES]) keys.push('trcat.' + c);
  for (const k of ['all', 'got', 'todo']) keys.push('trf.' + k);
  for (const k of ['new', 'practice', 'mastered', 'locked']) keys.push('tree.s.' + k);
  for (const it of COLLECTION) { keys.push('col.' + it.id.replace(':', '.')); keys.push('col.cat.' + it.cat); if (it.cond) keys.push('col.cond.' + it.cond[0]); }
  for (const k of ['intro', 'play', 'mylevel', 'chapters', 'tree', 'daily', 'start']) keys.push(`guide.${k}.title`, `guide.${k}.body`);
  for (const k of ['ftRate', 'time', 'speed', 'combo', 'score', 'answered']) keys.push('growth.' + k);
  for (const n of [2, 3, 4, 5]) keys.push('sheet.star' + n);
  for (let i = 0; i < 3; i++) keys.push('greet.default' + i);
  return keys;
};

test('界面里用到的每个文字 key，中英文都有', () => {
  const staticKeys = [...src.matchAll(/\bt\('([^']+)'[,)]/g)].map(m => m[1]).filter(k => !k.endsWith('.'));
  for (const k of [...staticKeys, ...dynamic()]) {
    assert.ok(k in zh, '缺中文：' + k);
    assert.ok(k in en, '缺英文：' + k);
  }
});

test('中英文 key 完全一致，占位符一致', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort());
  const ph = s => (s.match(/\{\w+\}/g) || []).sort().join();
  for (const k of Object.keys(zh)) assert.equal(ph(zh[k]), ph(en[k]), '占位符不同：' + k);
});
