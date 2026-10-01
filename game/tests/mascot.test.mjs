import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SKINS, MOODS, DECORATIONS, MAX_STAGE,
  clampStage, decorationsForStage, validMood, skinColors, clampMotion,
  litLampsForStage, lookOffset, pointAngle, renderStaticSvg, createMascot,
} from '../js/mascot.js';

test('clampStage 限制在 0..8 并容错', () => {
  assert.equal(clampStage(-3), 0);
  assert.equal(clampStage(0), 0);
  assert.equal(clampStage(3.9), 3);
  assert.equal(clampStage(8), 8);
  assert.equal(clampStage(99), 8);
  assert.equal(clampStage('5'), 5);
  assert.equal(clampStage(NaN), 0);
  assert.equal(clampStage(undefined), 0);
  assert.equal(clampStage(Infinity), 0);
});

test('decorationsForStage 单调不减、逐级叠加', () => {
  assert.deepEqual(decorationsForStage(0), []);
  let prev = [];
  for (let s = 0; s <= MAX_STAGE; s++) {
    const d = decorationsForStage(s);
    assert.equal(d.length, s);
    for (const x of prev) assert.ok(d.includes(x), `stage ${s} 丢失 ${x}`);
    prev = d;
  }
  assert.deepEqual(decorationsForStage(8), DECORATIONS);
  assert.deepEqual(decorationsForStage(99), DECORATIONS);
  assert.deepEqual(decorationsForStage(1), ['antenna']);
  assert.ok(decorationsForStage(3).includes('headphones'));
  assert.ok(decorationsForStage(5).includes('shades'));
  assert.ok(decorationsForStage(7).includes('crown'));
  assert.ok(decorationsForStage(8).includes('aura'));
});

test('validMood 只接受 8 种情绪', () => {
  for (const m of ['idle', 'happy', 'cheer', 'wow', 'oops', 'think', 'sleep', 'dance']) assert.ok(validMood(m), m);
  assert.equal(MOODS.length, 8);
  for (const m of ['', 'sad', null, undefined, 3, 'Idle']) assert.equal(validMood(m), false);
});

test('skinColors / SKINS', () => {
  const ids = SKINS.map((s) => s.id);
  for (const id of ['default', 'sakura', 'matcha', 'sunset', 'violet', 'gold']) assert.ok(ids.includes(id), id);
  for (const s of SKINS) {
    assert.ok(s.nameZh && s.nameEn);
    const c = skinColors(s.id);
    for (const k of ['main', 'light', 'shade', 'screen', 'stroke']) assert.match(c[k], /^#[0-9a-f]{6}$/i, `${s.id}.${k}`);
    assert.equal(c.stroke, '#14123a');
    assert.equal(c.accents.length, 4);
  }
  assert.equal(skinColors('default').main, '#4cc9f0');
  assert.deepEqual(skinColors('nope'), skinColors('default'));
  assert.equal(new Set(ids.map((i) => skinColors(i).main)).size, ids.length);
});

test('clampMotion / litLampsForStage', () => {
  assert.equal(clampMotion(0), 0);
  assert.equal(clampMotion(1), 1);
  assert.equal(clampMotion(2), 2);
  assert.equal(clampMotion(7), 2);
  assert.equal(clampMotion(-1), 0);
  assert.equal(clampMotion('x'), 2);
  let prev = 0;
  for (let s = 0; s <= 8; s++) {
    const n = litLampsForStage(s);
    assert.ok(n >= prev && n <= 5);
    prev = n;
  }
  assert.ok(litLampsForStage(2) > litLampsForStage(1));
});

test('lookOffset 限幅且方向正确', () => {
  assert.deepEqual(lookOffset(0, 0), { x: 0, y: 0 });
  const far = lookOffset(5000, 0, 4.6, 160);
  assert.ok(Math.abs(far.x - 4.6) < 1e-9 && far.y === 0);
  const diag = lookOffset(-3000, -3000, 4, 160);
  assert.ok(Math.hypot(diag.x, diag.y) <= 4 + 1e-9);
  assert.ok(diag.x < 0 && diag.y < 0);
  const near = lookOffset(10, 0, 4, 160);
  assert.ok(near.x > 0 && near.x < 4);
});

test('pointAngle：朝下为 0，朝右 -90，朝左 +90，朝上 180', () => {
  assert.ok(Math.abs(pointAngle(0, 10)) < 1e-9);
  assert.ok(Math.abs(pointAngle(10, 0) + 90) < 1e-9);
  assert.ok(Math.abs(pointAngle(-10, 0) - 90) < 1e-9);
  assert.ok(Math.abs(Math.abs(pointAngle(0, -10)) - 180) < 1e-9);
});

test('renderStaticSvg 生成自包含 SVG', () => {
  const s = renderStaticSvg({ mood: 'happy', stage: 7, skin: 'sakura' });
  assert.match(s, /^<svg /);
  const cls = s.match(/<g class="(nd [^"]*)"/)[1];
  assert.ok(cls.includes('mood-happy') && cls.includes('has-crown') && !cls.includes('has-aura'));
  assert.ok(s.includes('#ff9ec4'));
  assert.ok(!/<script/i.test(s));
});

test('Node 下 import 不访问 document；createMascot 在无 DOM 时抛出明确错误', () => {
  assert.equal(typeof document, 'undefined');
  assert.throws(() => createMascot({}), /浏览器环境/);
});
