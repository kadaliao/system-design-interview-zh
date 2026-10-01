import test from 'node:test';
import assert from 'node:assert/strict';
import { audio, theory } from '../js/audio.js';

const { SCALES, LAYERS, STYLE_IDS } = theory;

test('midiToFreq', () => {
  assert.equal(theory.midiToFreq(69), 440);
  assert.ok(Math.abs(theory.midiToFreq(81) - 880) < 1e-9);
  assert.ok(Math.abs(theory.midiToFreq(60) - 261.6256) < 1e-3);
});

test('layersForStage: 0..8 合法、单调不减、越界被 clamp', () => {
  let prev = [];
  for (let s = 0; s <= 8; s++) {
    const l = theory.layersForStage(s);
    assert.ok(l.every((x) => LAYERS.includes(x)));
    assert.equal(new Set(l).size, l.length);
    assert.ok(l.length >= prev.length);
    assert.ok(prev.every((x) => l.includes(x)));
    prev = l;
  }
  assert.deepEqual(theory.layersForStage(0), ['kick', 'pad']);
  assert.ok(theory.layersForStage(1).includes('hat'));
  assert.ok(theory.layersForStage(5).includes('lead'));
  assert.deepEqual(theory.layersForStage(8).slice().sort(), LAYERS.slice().sort());
  assert.deepEqual(theory.layersForStage(-3), theory.layersForStage(0));
  assert.deepEqual(theory.layersForStage(99), theory.layersForStage(8));
  assert.deepEqual(theory.layersForStage(NaN), theory.layersForStage(0));
  assert.deepEqual(theory.layersForStage(4.4), theory.layersForStage(4));
});

test('pentatonic 音高始终属于音阶，且随 combo 上行', () => {
  for (const [name, sc] of Object.entries(SCALES)) {
    for (const root of [55, 60, 62]) {
      for (let c = 1; c <= 100; c++) {
        const m = theory.pentatonic(c, root, name);
        assert.ok(sc.includes((((m - root) % 12) + 12) % 12), `${name} c=${c} m=${m}`);
        if (c % 7 !== 0 && c < 100) assert.ok(theory.pentatonic(c + 1, root, name) > m, '同一轮内严格上行');
        if (c <= 14) assert.equal(theory.pentatonic(c + 7, root, name), m + 12, '每 7 个升一个八度');
      }
    }
  }
  assert.ok(theory.pentatonic(8, 60) - theory.pentatonic(1, 60) === 12);
  assert.ok(theory.pentatonic(0, 60) === theory.pentatonic(1, 60));
  assert.ok(theory.pentatonic(2, 60) > theory.pentatonic(1, 60));
});

test('chordFor 循环且音高合法', () => {
  for (const id of STYLE_IDS) {
    for (let b = 0; b < 12; b++) {
      const c = theory.chordFor(id, b);
      assert.deepEqual(c, theory.chordFor(id, b + 4));
      assert.ok(c.bass >= 30 && c.bass < 70);
      assert.ok(c.notes.length >= 3 && c.notes.every(Number.isInteger));
    }
  }
});

test('stepsFor：每风格每层每小节长度 16、字段合法', () => {
  assert.ok(STYLE_IDS.length >= 4);
  for (const id of STYLE_IDS) {
    const sc = SCALES[theory.STYLE_DEFS[id].scale];
    const root = theory.STYLE_DEFS[id].root;
    for (const layer of LAYERS) {
      let any = false;
      for (let bar = 0; bar < 8; bar++) {
        const st = theory.stepsFor(id, layer, bar);
        assert.equal(st.length, 16, `${id}/${layer}`);
        st.forEach((ev) => {
          if (!ev) return;
          any = true;
          assert.ok(ev.vel > 0 && ev.vel <= 1, 'vel');
          const notes = ev.notes || (ev.note != null ? [ev.note] : []);
          for (const n of notes) assert.ok(Number.isInteger(n) && n >= 24 && n <= 120, `${id}/${layer} note ${n}`);
          if (ev.dur != null) assert.ok(ev.dur >= 1 && ev.dur <= 16);
          if (layer === 'lead' || (layer === 'sparkle' && ev.kind === 'ping')) {
            assert.ok(sc.includes((((ev.note - root) % 12) + 12) % 12), `${id}/${layer} 音阶外 ${ev.note}`);
          }
        });
        assert.deepEqual(st, theory.stepsFor(id, layer, bar), '确定性');
      }
      assert.ok(any, `${id}/${layer} 不应全空`);
    }
  }
  assert.equal(theory.stepsFor('nope', 'kick', 0).length, 16);
  assert.equal(theory.stepsFor('chip', 'nope', 0).length, 16);
});

test('tempo / transpose：阶段 8 才加快升调', () => {
  for (const id of STYLE_IDS) {
    assert.equal(theory.tempoFor(id, 7), theory.STYLE_DEFS[id].bpm);
    assert.ok(theory.tempoFor(id, 8) > theory.tempoFor(id, 7));
  }
  assert.equal(theory.transposeFor(7), 0);
  assert.ok(theory.transposeFor(8) > 0);
});

test('Node 无 AudioContext：所有公开方法静默 no-op', () => {
  assert.equal(audio.init(), false);
  audio.setMuted(true); assert.equal(audio.isMuted(), true); audio.setMuted(false);
  audio.setVolume(0.5); audio.setVolume(NaN); audio.setMusicVolume(2); audio.setSfxVolume(-1);
  audio.setStyle('lofi'); audio.setStyle('bogus'); audio.setStage(5); audio.setStage(99);
  audio.startMusic(); audio.setStage(3); audio.duck(); audio.duck(100, 0.2); audio.stopMusic(); audio.stopMusic(0);
  audio.preview('wa'); audio.preview('wa', 8, 100);
  for (const k of Object.keys(audio.sfx)) {
    assert.doesNotThrow(() => audio.sfx[k](5), k);
    assert.doesNotThrow(() => audio.sfx[k](), k);
  }
  for (const k of ['combo10', 'combo20', 'combo50', 'dopa100', 'dopa1000', 'dopa1e4', 'dopa1e6', 'dopa1e8', 'stage', 'zzz']) {
    assert.doesNotThrow(() => audio.sfx.milestone(k), k);
  }
  assert.deepEqual(audio.STYLES.map((s) => s.id).sort(), ['chip', 'lofi', 'rock', 'wa']);
  assert.ok(audio.STYLES.every((s) => s.nameZh && s.nameEn));
});
