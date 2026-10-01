import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PALETTE, clampStage, clampLevel, scaleCount, poolLimit, burstParams, milestoneSpec, MILESTONE_KINDS,
  shakeKeyframes, createRateLimiter, createPool, createFx, stepPool, spawnSpark,
} from '../js/fx.js';
import { stageParams, motionParams, createBackground, MAX_STROBE_HZ } from '../js/bg.js';

// 最小可用的 canvas / ctx 桩，让 createFx 能在 Node 里跑
function fakeCanvas() {
  const ctx = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : k === 'measureText' ? () => ({ width: 50 }) : () => ({ addColorStop() {} })),
    set: (t, k, v) => ((t[k] = v), true),
  });
  return { width: 300, height: 150, clientWidth: 300, clientHeight: 150, getContext: () => ctx };
}

test('clampStage / clampLevel 越界与非法输入', () => {
  assert.equal(clampStage(-5), 0);
  assert.equal(clampStage(99), 8);
  assert.equal(clampStage(3.6), 4);
  assert.equal(clampStage(NaN), 0);
  assert.equal(clampStage('5'), 5);
  assert.equal(clampLevel(-1), 0);
  assert.equal(clampLevel(7), 2);
  assert.equal(clampLevel(undefined), 2);
});

test('stageParams：越界 clamp，各层强度随 stage 单调不减，逐级点亮', () => {
  assert.equal(stageParams(-3).stage, 0);
  assert.equal(stageParams(42).stage, 8);
  const order = ['twinkle', 'links', 'bars', 'beams', 'bubbles', 'aurora', 'fireworks', 'celebration'];
  for (let s = 0; s <= 8; s++) {
    const p = stageParams(s);
    order.forEach((k, i) => assert.equal(p.layers[k], s >= i + 1, `stage ${s} layer ${k}`));
    if (s > 0) {
      const q = stageParams(s - 1);
      for (const k of Object.keys(p.intensity)) {
        assert.ok(p.intensity[k] >= q.intensity[k], `${k} 单调 @${s}`);
        assert.ok(p.intensity[k] >= 0 && p.intensity[k] <= 1);
      }
      assert.ok(p.energy >= q.energy);
      assert.ok(p.strobeHz >= q.strobeHz);
    }
  }
  assert.equal(stageParams(0).layers.twinkle, false);
  assert.equal(stageParams(0).layers.grid, true);
  assert.ok(stageParams(8).strobeHz > 0 && stageParams(8).strobeHz <= MAX_STROBE_HZ);
  assert.equal(stageParams(7).strobeHz, 0);
});

test('motionParams：level 0 静态、1 无彩带雨无频闪、2 全开', () => {
  assert.equal(motionParams(0).animated, false);
  assert.equal(motionParams(1).strobe, false);
  assert.equal(motionParams(1).confetti, false);
  assert.equal(motionParams(2).strobe, true);
  assert.equal(motionParams(2).particleLimit, 260);
});

test('scaleCount：0 关闭、1 ×0.4、2 原样；非法输入为 0', () => {
  assert.equal(scaleCount(50, 0), 0);
  assert.equal(scaleCount(50, 1), 20);
  assert.equal(scaleCount(50, 2), 50);
  assert.equal(scaleCount(1, 1), 1);
  assert.equal(scaleCount(0, 2), 0);
  assert.equal(scaleCount(-4, 2), 0);
  assert.equal(scaleCount(NaN, 2), 0);
  assert.equal(scaleCount(50, 9), 50);
  assert.equal(poolLimit(2), 600);
  assert.equal(poolLimit(0), 0);
});

test('burstParams 随 stage 增强（粒子数/速度/颜色混合单调不减）', () => {
  for (let s = 1; s <= 8; s++) {
    const a = burstParams(s - 1, { power: 1 });
    const b = burstParams(s, { power: 1 });
    assert.ok(b.count >= a.count && b.speed >= a.speed && b.mix >= a.mix);
  }
  assert.ok(burstParams(5, { count: 30 }).count > burstParams(5, {}).count);
  assert.ok(burstParams(5, { power: 2 }).speed > burstParams(5, { power: 1 }).speed);
  assert.equal(burstParams(0, {}).mix, 0);
  assert.equal(burstParams(99).count, burstParams(8).count);
});

test('milestoneSpec：全部 kind 存在；dopa 系列递增；level 缩放', () => {
  for (const k of ['combo10', 'combo20', 'combo50', 'dopa100', 'dopa1000', 'dopa1e4', 'dopa1e6', 'dopa1e8', 'stage']) {
    assert.ok(MILESTONE_KINDS.includes(k));
    const z = milestoneSpec(k, 0);
    assert.deepEqual(z, { confetti: 0, fireworks: 0, rings: 0, flash: 0 });
    const w = milestoneSpec(k, 1);
    assert.equal(w.confetti, 0);
    assert.equal(w.flash, 0);
  }
  const seq = ['dopa100', 'dopa1000', 'dopa1e4', 'dopa1e6', 'dopa1e8'].map((k) => milestoneSpec(k, 2));
  for (let i = 1; i < seq.length; i++) {
    assert.ok(seq[i].confetti >= seq[i - 1].confetti && seq[i].fireworks >= seq[i - 1].fireworks);
  }
  assert.deepEqual(milestoneSpec('nope', 2), milestoneSpec('stage', 2));
});

test('shakeKeyframes：power clamp，幅度随 power 增大，首尾归零', () => {
  const kf = shakeKeyframes(1);
  assert.equal(kf[0].transform, kf[kf.length - 1].transform);
  assert.deepEqual(shakeKeyframes(5), shakeKeyframes(1));
  assert.deepEqual(shakeKeyframes(-1), shakeKeyframes(0));
  const amp = (f) => Math.max(...f.map((x) => Math.abs(parseFloat(x.transform.slice(10)))));
  assert.ok(amp(shakeKeyframes(1)) > amp(shakeKeyframes(0)));
});

test('createRateLimiter：任意 1 秒窗口内 ≤ 3 次（WCAG）', () => {
  const l = createRateLimiter(3, 1000);
  assert.deepEqual([0, 100, 200, 300, 999].map((t) => l.take(t)), [true, true, true, false, false]);
  assert.equal(l.take(1000), true); // 第一次已滑出窗口
  // 暴力扫描：任何 1s 窗口内放行数不超过 3
  const l2 = createRateLimiter(3, 1000);
  const ok = [];
  for (let t = 0; t < 10000; t += 37) if (l2.take(t)) ok.push(t);
  for (let i = 0; i + 3 < ok.length; i++) assert.ok(ok[i + 3] - ok[i] >= 1000);
});

test('createPool：不超限、回收复用、limit 生效', () => {
  const p = createPool(5);
  const ids = [];
  for (let i = 0; i < 8; i++) ids.push(p.alloc());
  assert.deepEqual(ids.slice(0, 5).sort(), [0, 1, 2, 3, 4]);
  assert.deepEqual(ids.slice(5), [-1, -1, -1]);
  assert.equal(p.count, 5);
  p.free(2);
  p.free(2); // 重复释放无副作用
  assert.equal(p.count, 4);
  assert.equal(p.alloc(), 2); // 复用
  assert.equal(p.alloc(), -1);
  p.clear();
  assert.equal(p.count, 0);
  p.limit = 2;
  assert.ok(p.alloc() >= 0 && p.alloc() >= 0);
  assert.equal(p.alloc(), -1);
  assert.equal(createPool(0).alloc(), -1);
});

test('stepPool：寿命结束回收，反复发射不泄漏', () => {
  const p = createPool(50);
  for (let round = 0; round < 20; round++) {
    for (let i = 0; i < 50; i++) spawnSpark(p, 0, 0, 0, 10, '#fff', 2, 0.1, 0, 0);
    assert.ok(p.count <= 50);
    for (let f = 0; f < 10; f++) stepPool(p, 0.02, 100, null);
    assert.equal(p.count, 0);
  }
});

test('createFx：level 0 不产生粒子；level 2 有上限；level 1 缩放', () => {
  const fx = createFx(fakeCanvas());
  fx.start();
  fx.setMotion(0);
  fx.burst(10, 10, { count: 50 });
  fx.confetti({ count: 100 });
  fx.fireworks(50, 50, { shells: 3 });
  fx.milestone('dopa1e8');
  fx.ring(1, 1);
  assert.equal(fx.stats().active, 0);
  assert.equal(fx.shake({ animate: () => assert.fail('level 0 不应抖动') }, 1), null);

  fx.setMotion(2);
  fx.setStage(8);
  for (let i = 0; i < 50; i++) fx.burst(10, 10, { count: 100 });
  assert.ok(fx.stats().active > 0 && fx.stats().active <= 600);
  fx.clear();
  assert.equal(fx.stats().active, 0);

  fx.setMotion(1);
  fx.confetti({ count: 100 }); // 1 档无彩带雨
  assert.equal(fx.stats().active, 0);
  fx.burst(10, 10, { count: 50 });
  const n1 = fx.stats().active;
  fx.clear();
  fx.setMotion(2);
  fx.burst(10, 10, { count: 50 });
  assert.ok(n1 > 0 && n1 < fx.stats().active);
  let called = 0;
  fx.shake({ animate: () => (called++, {}) }, 0.5);
  assert.equal(called, 1);
  fx.destroy();
  fx.burst(1, 1); // 销毁后无操作且不抛错
});

test('createBackground 可在桩 canvas 上构造并调用全部 API', () => {
  const bg = createBackground(fakeCanvas());
  for (const lv of [0, 1, 2]) {
    bg.setMotion(lv);
    for (let s = 0; s <= 8; s++) bg.setStage(s);
    bg.pulse(1);
    bg.resize();
  }
  bg.start();
  bg.stop();
  bg.destroy();
  assert.ok(PALETTE.length === 5);
});
