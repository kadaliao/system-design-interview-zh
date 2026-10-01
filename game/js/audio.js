// 架构多巴胺 · 音频模块
// 纯 Web Audio 合成，零依赖、无音频文件。顶层不触碰 window/AudioContext，可在 Node 中 import。
// 公开：audio（引擎）与 theory（可测试的纯函数）。

/* ------------------------------------------------------------------ */
/* 乐理（纯函数）                                                      */
/* ------------------------------------------------------------------ */

const SCALES = {
  major: [0, 2, 4, 7, 9], // 大调五声
  minor: [0, 3, 5, 7, 10], // 小调五声
  yo: [0, 2, 5, 7, 9], // 和风（阳音阶）
};

const LAYERS = ['kick', 'pad', 'hat', 'bass', 'chords', 'arp', 'lead', 'fill', 'sparkle', 'boost'];
// 阶段 n 新增的层（0 起始）
const STAGE_ADDS = [['kick', 'pad'], ['hat'], ['bass'], ['chords'], ['arp'], ['lead'], ['fill'], ['sparkle'], ['boost']];
const STEPS_PER_BAR = 16;

const clampInt = (v, lo, hi, def = lo) => {
  v = Math.round(Number(v));
  if (!Number.isFinite(v)) return def;
  return Math.min(hi, Math.max(lo, v));
};
const clamp01 = (v, def = 0) => {
  v = Number(v);
  return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def;
};

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// combo≥1：按五声音阶上行，每 7 个音升一个八度（八度上限 tierCap）
const comboTier = (combo) => Math.floor((Math.max(1, Math.floor(Number(combo) || 1)) - 1) / 7);
const pentatonic = (combo, root = 62, scale = 'major', tierCap = 2) => {
  const sc = SCALES[scale] || SCALES.major;
  const idx = Math.max(1, Math.floor(Number(combo) || 1)) - 1;
  const tier = Math.min(Math.floor(idx / 7), tierCap);
  const k = idx % 7;
  return root + 12 * tier + sc[k % 5] + 12 * Math.floor(k / 5);
};

// 各风格的音乐数据。root 为主音 MIDI（第 3 八度），prog 为 4 小节和弦进行（相对主音的半音偏移 + 和弦音程）
const STYLE_DEFS = {
  chip: {
    id: 'chip', nameZh: '8-bit 电子', nameEn: '8-bit Chip', root: 48, bpm: 124, scale: 'major', seed: 11,
    prog: [
      { name: 'I', off: 0, q: [0, 4, 7] },
      { name: 'V', off: 7, q: [0, 4, 7] },
      { name: 'vi', off: 9, q: [0, 3, 7] },
      { name: 'IV', off: 5, q: [0, 4, 7] },
    ],
    kick: [0, 4, 8, 12],
    hat: [0.45, 0, 0.8, 0, 0.45, 0, 0.8, 0, 0.45, 0, 0.8, 0, 0.45, 0, 0.8, 0.5],
    bass: [[0, 2, 0], [2, 2, 2], [4, 2, 0], [6, 2, 2], [8, 2, 0], [10, 2, 2], [12, 2, 0], [14, 2, 2]],
    chords: [[2, 2], [6, 2], [10, 2], [14, 2]],
    arpSteps: 1,
    lead: [[[0, 2], [2, 2], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]], [[0, 3], [3, 1], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]]],
    backbeat: 'snare', pings: [3, 7, 11, 15],
  },
  lofi: {
    id: 'lofi', nameZh: '柔和 Lo-fi', nameEn: 'Soft Lo-fi', root: 48, bpm: 78, scale: 'major', seed: 23,
    prog: [
      { name: 'ii7', off: 2, q: [0, 3, 7, 10] },
      { name: 'V7', off: 7, q: [0, 4, 7, 10] },
      { name: 'Imaj7', off: 0, q: [0, 4, 7, 11] },
      { name: 'vi7', off: 9, q: [0, 3, 7, 10] },
    ],
    kick: [0, 10],
    hat: [0.3, 0, 0.5, 0.15, 0.3, 0, 0.5, 0.15, 0.3, 0, 0.5, 0.15, 0.3, 0, 0.5, 0.15],
    bass: [[0, 6, 0], [6, 2, 1], [8, 4, 0], [12, 4, 2]],
    chords: [[0, 6], [8, 8]],
    arpSteps: 2,
    lead: [[[0, 3], [4, 2], [8, 3], [12, 4]], [[2, 2], [4, 4], [10, 2], [12, 4]]],
    backbeat: 'clap', pings: [4, 12],
  },
  wa: {
    id: 'wa', nameZh: '和风五声', nameEn: 'Japanese Pentatonic', root: 50, bpm: 92, scale: 'yo', seed: 37,
    prog: [
      { name: 'I', off: 0, q: [0, 7, 12] },
      { name: 'IV', off: 5, q: [0, 7, 12] },
      { name: 'II', off: 2, q: [0, 5, 9] },
      { name: 'V', off: 7, q: [0, 5, 9] },
    ],
    kick: [0, 8, 12],
    hat: [0.3, 0, 0, 0, 0.3, 0, 0.2, 0, 0.3, 0, 0, 0, 0.3, 0, 0.2, 0],
    bass: [[0, 8, 0], [8, 4, 1], [12, 4, 0]],
    chords: [[0, 8]],
    arpSteps: 2,
    lead: [[[0, 4], [4, 2], [6, 2], [8, 6], [14, 2]], [[0, 2], [2, 2], [4, 4], [8, 4], [12, 4]]],
    backbeat: 'taiko', pings: [2, 6, 10, 14],
  },
  rock: {
    id: 'rock', nameZh: '摇滚驱动', nameEn: 'Driving Rock', root: 57, bpm: 138, scale: 'minor', seed: 51,
    prog: [
      { name: 'i', off: 0, q: [0, 7, 12] },
      { name: 'VI', off: 8, q: [0, 7, 12] },
      { name: 'III', off: 3, q: [0, 7, 12] },
      { name: 'VII', off: 10, q: [0, 7, 12] },
    ],
    kick: [0, 8, 10],
    hat: [0.6, 0, 0.45, 0, 0.6, 0, 0.45, 0, 0.6, 0, 0.45, 0, 0.6, 0, 0.45, 0.7],
    bass: [[0, 2, 0], [2, 2, 0], [4, 2, 0], [6, 2, 0], [8, 2, 0], [10, 2, 0], [12, 2, 0], [14, 2, 0]],
    chords: [[0, 4], [6, 2], [8, 4], [14, 2]],
    arpSteps: 2,
    lead: [[[0, 2], [2, 2], [4, 2], [8, 2], [10, 2], [12, 4]], [[0, 4], [4, 2], [6, 2], [8, 4], [12, 2], [14, 2]]],
    backbeat: 'snare', pings: [3, 7, 11, 15],
  },
};
const STYLE_IDS = Object.keys(STYLE_DEFS);
const styleDef = (id) => STYLE_DEFS[id] || STYLE_DEFS.chip;

const layersForStage = (stage) => {
  const n = clampInt(stage, 0, 8, 0);
  const out = [];
  for (let i = 0; i <= n; i++) out.push(...STAGE_ADDS[i]);
  return out;
};
const tempoFor = (style, stage) => styleDef(style).bpm * (clampInt(stage, 0, 8, 0) >= 8 ? 1.08 : 1);
const transposeFor = (stage) => (clampInt(stage, 0, 8, 0) >= 8 ? 2 : 0);

// 第 bar 小节的和弦：bass 为低音，notes 为中音区和弦音（MIDI，未升调）
const chordFor = (style, bar) => {
  const d = styleDef(style);
  const b = ((Math.floor(Number(bar) || 0) % d.prog.length) + d.prog.length) % d.prog.length;
  const c = d.prog[b];
  let base = d.root + c.off + 12;
  if (base >= 67) base -= 12;
  return { name: c.name, bass: d.root + c.off - 12, root: d.root + c.off, notes: c.q.map((i) => base + i) };
};

// 确定性伪随机
const rng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// 旋律音池：主音上方两个八度内的所有音阶音
const scalePool = (style, low = 12, octaves = 2) => {
  const d = styleDef(style);
  const sc = SCALES[d.scale];
  const pool = [];
  for (let o = 0; o < octaves; o++) for (const s of sc) pool.push(d.root + low + 12 * o + s);
  pool.push(d.root + low + 12 * octaves);
  return pool;
};
const nearest = (pool, target) => {
  let bi = 0;
  for (let i = 1; i < pool.length; i++) if (Math.abs(pool[i] - target) < Math.abs(pool[bi] - target)) bi = i;
  return bi;
};

const emptySteps = () => new Array(STEPS_PER_BAR).fill(null);

// 返回某风格某层某小节的 16 步数据（null 表示无事件），音高为未升调的 MIDI
const stepsFor = (style, layer, bar) => {
  const d = styleDef(style);
  const barN = Math.max(0, Math.floor(Number(bar) || 0));
  const ch = chordFor(d.id, barN);
  const out = emptySteps();
  const phrase = barN % 4;
  switch (layer) {
    case 'kick':
      for (const s of d.kick) out[s] = { vel: s === 0 ? 1 : 0.8 };
      break;
    case 'pad':
      out[0] = { notes: [ch.notes[0], ...ch.notes.slice(1)], vel: 0.5, dur: 16 };
      break;
    case 'hat':
      d.hat.forEach((v, i) => { if (v > 0) out[i] = { vel: v, open: i === 14 && d.id === 'rock' }; });
      break;
    case 'bass':
      for (const [s, dur, k] of d.bass) {
        const note = k === 0 ? ch.bass : k === 1 ? ch.bass + 7 : ch.bass + 12;
        out[s] = { note, vel: s === 0 ? 0.95 : 0.75, dur };
      }
      break;
    case 'chords':
      for (const [s, dur] of d.chords) out[s] = { notes: ch.notes.slice(), vel: s === 0 ? 0.8 : 0.65, dur };
      break;
    case 'arp': {
      const pat = [0, 1, 2, 1, 2, 3, 2, 1];
      const n = ch.notes.length;
      for (let s = 0, i = 0; s < STEPS_PER_BAR; s += d.arpSteps, i++) {
        const idx = pat[i % pat.length] % n;
        out[s] = { note: ch.notes[idx] + 12, vel: 0.6, dur: d.arpSteps };
      }
      break;
    }
    case 'lead': {
      const pool = scalePool(d.id);
      const rhythm = d.lead[barN % 2];
      const r = rng(d.seed * 1009 + barN * 31);
      let idx = nearest(pool, ch.notes[0] + 12);
      rhythm.forEach(([s, dur], n) => {
        if (n > 0) idx = Math.min(pool.length - 1, Math.max(0, idx + Math.floor(r() * 5) - 2));
        if (n === rhythm.length - 1 && phrase === 3) idx = nearest(pool, d.root + 12);
        out[s] = { note: pool[idx], vel: s === 0 ? 0.9 : 0.75, dur };
      });
      break;
    }
    case 'fill': {
      out[4] = { drum: d.backbeat, vel: 0.85 };
      out[12] = { drum: d.backbeat, vel: 0.9 };
      if (phrase === 3) {
        out[10] = { drum: 'kick', vel: 0.7 };
        [13, 14, 15].forEach((s, i) => { out[s] = { drum: d.id === 'wa' ? 'taiko' : 'tom', vel: 0.55 + 0.1 * i }; });
      } else if (d.id === 'rock' || d.id === 'chip') {
        out[7] = { drum: 'kick', vel: 0.6 };
      }
      break;
    }
    case 'sparkle': {
      const pool = scalePool(d.id, 24, 1);
      const r = rng(d.seed * 773 + barN * 17);
      out[0] = { kind: 'choir', notes: ch.notes.map((n) => n + 12), vel: 0.5, dur: 16 };
      for (const s of d.pings) out[s] = { kind: 'ping', note: pool[Math.floor(r() * pool.length)], vel: 0.55, dur: 2 };
      break;
    }
    case 'boost':
      for (let s = 0; s < STEPS_PER_BAR; s++) if (s % 2 === 1) out[s] = { kind: 'shaker', vel: 0.3 };
      if (phrase === 0) out[0] = { kind: 'crash', vel: 0.5 };
      break;
    default:
      break;
  }
  return out;
};

export const theory = {
  SCALES, LAYERS, STEPS_PER_BAR, STYLE_IDS, STYLE_DEFS,
  midiToFreq, pentatonic, comboTier, chordFor, layersForStage, stepsFor, tempoFor, transposeFor, scalePool,
};

/* ------------------------------------------------------------------ */
/* 引擎                                                                */
/* ------------------------------------------------------------------ */

const LOOKAHEAD = 0.1;
const POLL_MS = 25;
const MAX_SFX_VOICES = 24;
const SOFT_SFX_VOICES = 14;
const MAX_MUSIC_VOICES = 64;

const LAYER_LEVEL = { kick: 0.9, pad: 0.55, hat: 0.5, bass: 0.8, chords: 0.5, arp: 0.42, lead: 0.55, fill: 0.7, sparkle: 0.5, boost: 0.5 };
const LAYER_SEND = { pad: 0.35, chords: 0.25, arp: 0.25, lead: 0.3, sparkle: 0.5 };

// 各风格音色（仅音色，与乐理数据分离）
const INST = {
  chip: {
    lead: { type: 'square', cut: 3200, a: 0.004, r: 0.05, sus: 0.6, dec: 0.12, gain: 0.5 },
    bass: { type: 'square', cut: 520, a: 0.004, r: 0.04, sus: 0.8, dec: 0.1, gain: 0.55 },
    chord: { type: 'square', cut: 2200, a: 0.004, r: 0.05, sus: 0.3, dec: 0.1, gain: 0.22 },
    arp: { type: 'square', cut: 3400, a: 0.003, r: 0.03, sus: 0.3, dec: 0.06, gain: 0.3 },
    pad: { type: 'triangle', cut: 1600, gain: 0.35 },
    kick: { f0: 150, f1: 48, len: 0.12, dur: 0.24 }, hatCut: 7500, snareCut: 2200,
  },
  lofi: {
    lead: { type: 'triangle', cut: 2200, a: 0.015, r: 0.18, sus: 0.5, dec: 0.3, gain: 0.7, detune: 6 },
    bass: { type: 'sine', cut: 700, a: 0.01, r: 0.12, sus: 0.85, dec: 0.4, gain: 1.0 },
    chord: { type: 'triangle', cut: 1300, a: 0.01, r: 0.25, sus: 0.35, dec: 0.4, gain: 0.35, detune: 7 },
    arp: { type: 'sine', cut: 2500, a: 0.005, r: 0.15, sus: 0.2, dec: 0.18, gain: 0.7 },
    pad: { type: 'sine', cut: 1200, gain: 0.55, detune: 5 },
    kick: { f0: 120, f1: 45, len: 0.1, dur: 0.22 }, hatCut: 5500, snareCut: 1400,
  },
  wa: {
    lead: { type: 'triangle', cut: 3000, a: 0.003, r: 0.25, sus: 0.0, dec: 0.28, gain: 0.85 },
    bass: { type: 'sine', cut: 600, a: 0.01, r: 0.15, sus: 0.8, dec: 0.5, gain: 1.0 },
    chord: { type: 'triangle', cut: 2400, a: 0.003, r: 0.3, sus: 0.0, dec: 0.4, gain: 0.45 },
    arp: { type: 'triangle', cut: 3200, a: 0.002, r: 0.2, sus: 0.0, dec: 0.2, gain: 0.65 },
    pad: { type: 'sine', cut: 1400, gain: 0.5 },
    kick: { f0: 105, f1: 52, len: 0.22, dur: 0.45 }, hatCut: 6000, snareCut: 1500,
  },
  rock: {
    lead: { type: 'sawtooth', cut: 2800, a: 0.006, r: 0.08, sus: 0.7, dec: 0.2, gain: 0.32, detune: 8 },
    bass: { type: 'sawtooth', cut: 480, a: 0.004, r: 0.06, sus: 0.8, dec: 0.2, gain: 0.5 },
    chord: { type: 'sawtooth', cut: 1700, a: 0.004, r: 0.08, sus: 0.7, dec: 0.2, gain: 0.16, detune: 7 },
    arp: { type: 'triangle', cut: 3000, a: 0.003, r: 0.06, sus: 0.3, dec: 0.1, gain: 0.5 },
    pad: { type: 'sawtooth', cut: 900, gain: 0.14, detune: 9 },
    kick: { f0: 165, f1: 50, len: 0.09, dur: 0.22 }, hatCut: 8500, snareCut: 2600,
  },
};

const STYLES = STYLE_IDS.map((id) => ({ id, nameZh: STYLE_DEFS[id].nameZh, nameEn: STYLE_DEFS[id].nameEn }));

const S = {
  ctx: null, manual: false,
  muted: false, vol: 0.8, musicVol: 0.7, sfxVol: 0.8,
  style: 'chip', stage: 0,
  playing: false, timer: null,
  nextTime: 0, step: 0, bar: 0, barCtx: null,
  layerState: {}, // 'off' | 'on' | 'fading'
  voices: { sfx: [], music: [] },
  preview: null, previewTimer: null,
  n: null, // 节点集合
  noiseBuf: null,
};

const AC = () => (typeof globalThis !== 'undefined' ? globalThis.AudioContext || globalThis.webkitAudioContext : undefined);

const makeImpulse = (ctx, seconds, decay) => {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
};

const softClipCurve = () => {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = Math.tanh(1.2 * ((i / (n - 1)) * 2 - 1));
  return c;
};

const build = (ctx) => {
  const n = {};
  n.master = ctx.createGain();
  n.comp = ctx.createDynamicsCompressor();
  n.comp.threshold.value = -14; n.comp.knee.value = 10; n.comp.ratio.value = 4;
  n.comp.attack.value = 0.004; n.comp.release.value = 0.2;
  n.clip = ctx.createWaveShaper();
  n.clip.curve = softClipCurve();
  n.clip.oversample = '2x';
  n.master.connect(n.comp); n.comp.connect(n.clip); n.clip.connect(ctx.destination);

  const impulse = makeImpulse(ctx, 1.2, 2.5);

  // 音乐：层 -> musicMix -> fade -> duck -> musicVol -> master
  n.musicVol = ctx.createGain(); n.musicVol.connect(n.master);
  n.duck = ctx.createGain(); n.duck.connect(n.musicVol);
  n.fade = ctx.createGain(); n.fade.connect(n.duck);
  n.musicMix = ctx.createGain(); n.musicMix.connect(n.fade);
  n.musicVerb = ctx.createConvolver(); n.musicVerb.buffer = impulse;
  n.musicVerb.connect(n.musicMix);
  n.layer = {}; n.send = {};
  for (const l of LAYERS) {
    const g = ctx.createGain(); g.gain.value = 0; g.connect(n.musicMix);
    n.layer[l] = g;
    if (LAYER_SEND[l]) {
      const s = ctx.createGain(); s.gain.value = LAYER_SEND[l];
      g.connect(s); s.connect(n.musicVerb); n.send[l] = s;
    }
    S.layerState[l] = 'off';
  }

  // 音效：sfx -> sfxLP -> sfxVol -> master，另有小混响
  n.sfxVol = ctx.createGain(); n.sfxVol.connect(n.master);
  n.sfxLP = ctx.createBiquadFilter(); n.sfxLP.type = 'lowpass'; n.sfxLP.frequency.value = 9500;
  n.sfxLP.connect(n.sfxVol);
  n.sfx = ctx.createGain(); n.sfx.connect(n.sfxLP);
  n.sfxVerb = ctx.createConvolver(); n.sfxVerb.buffer = impulse;
  n.sfxSend = ctx.createGain(); n.sfxSend.gain.value = 0.18;
  n.sfx.connect(n.sfxSend); n.sfxSend.connect(n.sfxVerb); n.sfxVerb.connect(n.sfxLP);

  // 共享噪声
  const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = nb.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  S.noiseBuf = nb;
  S.n = n;
  applyVolumes(true);
};

const applyVolumes = (immediate = false) => {
  const ctx = S.ctx; if (!ctx || !S.n) return;
  const t = ctx.currentTime;
  const set = (p, v) => {
    if (immediate) p.setValueAtTime(v, t); else p.setTargetAtTime(v, t, 0.02);
  };
  set(S.n.master.gain, S.muted ? 0 : S.vol * 0.9);
  set(S.n.musicVol.gain, S.musicVol * 0.32);
  set(S.n.sfxVol.gain, S.sfxVol * 1.15);
};

/* ---- 发声原语 ---- */

// 按时间重叠数限制同时发声数（离线渲染下同样有效）
const reserve = (cat, start, end, soft) => {
  const list = S.voices[cat];
  const now = S.ctx.currentTime;
  for (let i = list.length - 1; i >= 0; i--) if (list[i][1] < now - 0.05) list.splice(i, 1);
  let cnt = 0;
  for (const [s, e] of list) if (s <= start && e > start) cnt++;
  const max = cat === 'sfx' ? (soft ? SOFT_SFX_VOICES : MAX_SFX_VOICES) : MAX_MUSIC_VOICES;
  if (cnt >= max) return false;
  list.push([start, end]);
  return true;
};

const cleanup = (src, nodes) => {
  src.onended = () => {
    for (const n of nodes) { try { n.disconnect(); } catch (e) { /* ignore */ } }
  };
};

const tone = (o) => {
  const ctx = S.ctx; if (!ctx) return;
  const t = o.time, a = o.a ?? 0.005, r = o.r ?? 0.08;
  const dur = Math.max(o.dur ?? 0.2, a + 0.01);
  const end = t + dur + r + 0.05;
  if (!reserve(o.cat || 'sfx', t, end, o.soft)) return;
  const g = ctx.createGain();
  const nodes = [g];
  let head = g;
  if (o.cut) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.Q.value = o.q ?? 0.7;
    f.frequency.setValueAtTime(o.cutFrom ?? o.cut, t);
    if (o.cutFrom) f.frequency.exponentialRampToValueAtTime(o.cut, t + (o.cutT ?? 0.12));
    f.connect(g); nodes.push(f); head = f;
  }
  const oscs = [];
  const dets = o.detune ? [-o.detune, o.detune] : [0];
  for (const dt of dets) {
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(o.glideTo, t + (o.glideT ?? 0.1));
    osc.detune.value = dt;
    osc.connect(head); oscs.push(osc); nodes.push(osc);
  }
  const vel = (o.vel ?? 0.2) / dets.length;
  const sus = o.sus ?? 1;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel, t + a);
  if (sus < 1) g.gain.setTargetAtTime(vel * sus, t + a, (o.dec ?? 0.1) / 3);
  g.gain.setTargetAtTime(0, t + dur, r / 4);
  g.connect(o.dest || S.n.sfx);
  if (o.send && S.n.sfxSend) { /* sfx 的混响在总线上已有 */ }
  for (const osc of oscs) { osc.start(t); osc.stop(end); }
  cleanup(oscs[0], nodes);
};

const noise = (o) => {
  const ctx = S.ctx; if (!ctx) return;
  const t = o.time, a = o.a ?? 0.002, dur = o.dur ?? 0.05;
  const end = t + dur + 0.05;
  if (!reserve(o.cat || 'sfx', t, end, o.soft)) return;
  const src = ctx.createBufferSource();
  src.buffer = S.noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'highpass'; f.frequency.value = o.freq ?? 6000; f.Q.value = o.q ?? 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(o.vel ?? 0.1, t + a);
  g.gain.setTargetAtTime(0, t + a, dur / 4);
  src.connect(f); f.connect(g); g.connect(o.dest || S.n.sfx);
  src.start(t, Math.random() * 0.5); src.stop(end);
  cleanup(src, [src, f, g]);
};

/* ---- 鼓 ---- */

const drum = (kind, t, vel, style, dest, cat) => {
  const ins = INST[style] || INST.chip;
  switch (kind) {
    case 'kick':
      tone({ time: t, freq: ins.kick.f0, glideTo: ins.kick.f1, glideT: ins.kick.len, dur: ins.kick.dur * 0.5, r: ins.kick.dur * 0.6, a: 0.002, vel: 0.9 * vel, dest, cat });
      break;
    case 'snare':
      noise({ time: t, dur: 0.16, type: 'bandpass', freq: ins.snareCut, q: 0.8, vel: 0.35 * vel, dest, cat });
      tone({ time: t, freq: 200, glideTo: 150, glideT: 0.08, type: 'triangle', dur: 0.05, r: 0.08, a: 0.002, vel: 0.3 * vel, dest, cat });
      break;
    case 'clap':
      for (let i = 0; i < 3; i++) noise({ time: t + i * 0.012, dur: i === 2 ? 0.14 : 0.03, type: 'bandpass', freq: 1300, q: 1, vel: 0.22 * vel, dest, cat });
      break;
    case 'tom':
      tone({ time: t, freq: 210, glideTo: 120, glideT: 0.12, dur: 0.1, r: 0.15, a: 0.002, vel: 0.55 * vel, dest, cat });
      break;
    case 'taiko':
      tone({ time: t, freq: 118, glideTo: 58, glideT: 0.2, dur: 0.18, r: 0.35, a: 0.002, vel: 0.8 * vel, dest, cat });
      noise({ time: t, dur: 0.07, type: 'lowpass', freq: 500, vel: 0.25 * vel, dest, cat });
      break;
    default:
      break;
  }
};

/* ---- 音乐事件渲染 ---- */

const midiT = (m, tr) => midiToFreq(m + tr);

const renderEvent = (layer, ev, t, bc) => {
  const sd = bc.sd, tr = bc.trans, style = bc.def.id;
  const ins = INST[style];
  const dest = S.n.layer[layer];
  const note = (inst, m, vel, durSteps) => tone({
    time: t, freq: midiT(m, tr), dur: Math.max(0.05, durSteps * sd - 0.01), type: inst.type, vel: vel * inst.gain * 0.5,
    a: inst.a, r: inst.r, cut: inst.cut, sus: inst.sus, dec: inst.dec, detune: inst.detune, dest, cat: 'music',
  });
  switch (layer) {
    case 'kick': drum('kick', t, ev.vel, style, dest, 'music'); break;
    case 'pad':
      for (const m of ev.notes) {
        tone({
          time: t, freq: midiT(m, tr), dur: ev.dur * sd - 0.3, a: sd * 3, r: 0.45, type: ins.pad.type, cut: ins.pad.cut,
          vel: (ev.vel * ins.pad.gain) / ev.notes.length * 0.9, detune: ins.pad.detune, dest, cat: 'music',
        });
      }
      break;
    case 'hat':
      noise({ time: t, dur: ev.open ? 0.12 : 0.035, type: 'highpass', freq: ins.hatCut, vel: 0.14 * ev.vel, dest, cat: 'music' });
      break;
    case 'bass': note(ins.bass, ev.note, ev.vel, ev.dur); break;
    case 'chords': for (const m of ev.notes) note(ins.chord, m, ev.vel / ev.notes.length * 1.6, ev.dur); break;
    case 'arp': note(ins.arp, ev.note, ev.vel, ev.dur); break;
    case 'lead': note(ins.lead, ev.note + 12, ev.vel, ev.dur); break;
    case 'fill': drum(ev.drum, t, ev.vel, style, dest, 'music'); break;
    case 'sparkle':
      if (ev.kind === 'choir') {
        for (const m of ev.notes) {
          tone({ time: t, freq: midiT(m, tr), dur: ev.dur * sd - 0.4, a: sd * 4, r: 0.5, type: 'sine', detune: 9, cut: 3500, vel: 0.05, dest, cat: 'music' });
        }
      } else {
        tone({ time: t, freq: midiT(ev.note, tr), dur: 0.05, r: 0.35, a: 0.002, type: 'sine', vel: 0.1 * ev.vel, dest, cat: 'music' });
        tone({ time: t, freq: midiT(ev.note, tr) * 2.76, dur: 0.02, r: 0.12, a: 0.002, type: 'sine', vel: 0.025 * ev.vel, dest, cat: 'music' });
      }
      break;
    case 'boost':
      if (ev.kind === 'crash') noise({ time: t, dur: 1.1, a: 0.004, type: 'highpass', freq: 5500, vel: 0.14, dest, cat: 'music' });
      else noise({ time: t, dur: 0.03, type: 'highpass', freq: 7500, vel: 0.07, dest, cat: 'music' });
      break;
    default: break;
  }
};

/* ---- 调度器 ---- */

const beginBar = (t) => {
  const style = S.style;
  const def = styleDef(style);
  const stage = S.stage;
  const set = new Set(layersForStage(stage));
  const bpm = tempoFor(style, stage);
  const sd = 60 / bpm / 4;
  const barDur = sd * STEPS_PER_BAR;
  const steps = {};
  for (const l of LAYERS) {
    const g = S.n.layer[l].gain;
    const st = S.layerState[l];
    if (set.has(l)) {
      if (st !== 'on') {
        g.cancelScheduledValues(t);
        g.setValueAtTime(st === 'off' ? 0 : g.value, t);
        g.linearRampToValueAtTime(LAYER_LEVEL[l], t + sd * 3);
        S.layerState[l] = 'on';
      }
    } else if (st === 'on') {
      // 降阶段：本小节内线性淡出，然后停止调度
      g.cancelScheduledValues(t);
      g.setValueAtTime(LAYER_LEVEL[l], t);
      g.linearRampToValueAtTime(0, t + barDur);
      S.layerState[l] = 'fading';
    } else if (st === 'fading') {
      S.layerState[l] = 'off';
    }
    if (S.layerState[l] !== 'off') steps[l] = stepsFor(style, l, S.bar);
  }
  S.barCtx = { def, sd, trans: transposeFor(stage), steps };
};

const scheduleStep = () => {
  if (S.step === 0) beginBar(S.nextTime);
  const bc = S.barCtx;
  for (const l of LAYERS) {
    const arr = bc.steps[l];
    const ev = arr && arr[S.step];
    if (ev) renderEvent(l, ev, S.nextTime, bc);
  }
  S.nextTime += bc.sd;
  S.step++;
  if (S.step >= STEPS_PER_BAR) { S.step = 0; S.bar++; }
};

const pump = (horizon) => {
  let guard = 0;
  while (S.nextTime < horizon && guard++ < 256) scheduleStep();
};

const tick = () => {
  const ctx = S.ctx; if (!ctx) return;
  const now = ctx.currentTime;
  if (S.nextTime < now - 0.25) { // 页面被挂起后恢复：从下一小节重新对齐，避免补发一堆音符
    S.nextTime = now + 0.05; S.step = 0;
  }
  pump(now + LOOKAHEAD);
};

const restartBar = () => {
  if (!S.ctx) return;
  S.nextTime = S.ctx.currentTime + 0.05; S.step = 0; S.bar = 0;
};

const ready = () => (S.ctx && S.n ? S.ctx : null);

/* ---- 音效 ---- */

const T0 = (when) => (typeof when === 'number' ? when : S.ctx.currentTime) + 0.005;

const brass = (t, midi, dur, vel, detune = 8) => tone({
  time: t, freq: midiToFreq(midi), type: 'sawtooth', dur, a: 0.02, r: 0.18, cut: 2600, cutFrom: 700, cutT: 0.1, q: 0.9, vel, detune,
});
const bell = (t, midi, dur, vel, soft) => {
  tone({ time: t, freq: midiToFreq(midi), type: 'sine', dur: 0.02, a: 0.002, r: dur, vel, soft });
  tone({ time: t, freq: midiToFreq(midi) * 2.76, type: 'sine', dur: 0.01, a: 0.002, r: dur * 0.4, vel: vel * 0.25, soft: true });
};

const MILESTONES = {
  combo10: { root: 72, iv: [0, 4, 7], gap: 0.08, chord: false },
  combo20: { root: 74, iv: [0, 4, 7, 12], gap: 0.075, chord: false },
  combo50: { root: 76, iv: [0, 4, 7, 12, 16], gap: 0.07, chord: true },
  dopa100: { root: 72, iv: [0, 7, 12], gap: 0.09, chord: false },
  dopa1000: { root: 72, iv: [0, 4, 7, 12, 16], gap: 0.07, chord: true },
  dopa1e4: { root: 74, iv: [0, 4, 7, 12, 16, 19], gap: 0.065, chord: true },
  dopa1e6: { root: 74, iv: [0, 4, 7, 12, 16, 19, 24], gap: 0.06, chord: true },
  dopa1e8: { root: 76, iv: [0, 4, 7, 12, 16, 19, 24, 28], gap: 0.055, chord: true },
  stage: { root: 67, iv: [0, 7, 12], gap: 0.07, chord: false },
};

const sfx = {
  correct(combo = 1, when) {
    if (!ready() || S.muted) return;
    const c = Math.max(1, Math.floor(Number(combo) || 1));
    const t = T0(when);
    const tier = comboTier(c);
    const m = pentatonic(c, 62);
    const dur = 0.2 + Math.min(c, 30) * 0.008;
    const kind = tier % 4;
    const main = [
      { type: 'triangle', cut: 4000, vel: 0.22 },
      { type: 'square', cut: 2600, vel: 0.11 },
      { type: 'sine', cut: 0, vel: 0.24 },
      { type: 'sawtooth', cut: 3200, vel: 0.1 },
    ][kind];
    tone({ time: t, freq: midiToFreq(m), type: main.type, cut: main.cut, vel: main.vel, dur, a: 0.004, r: 0.12, sus: 0.5, dec: 0.12 });
    if (kind === 2) tone({ time: t, freq: midiToFreq(m) * 2.76, type: 'sine', dur: 0.02, r: 0.2, vel: 0.04, soft: true });
    if (c >= 3) tone({ time: t, freq: midiToFreq(m + 12), type: 'sine', dur: dur * 0.8, a: 0.004, r: 0.12, vel: 0.07, soft: true });
    if (c >= 6) tone({ time: t + 0.012, freq: midiToFreq(pentatonic(Math.max(1, c - 2), 62)), type: 'triangle', cut: 3000, dur, r: 0.12, vel: 0.1, soft: true });
    if (c >= 10) {
      for (let i = 0; i < 3; i++) {
        tone({ time: t + 0.05 * (i + 1), freq: midiToFreq(pentatonic(c + 2 + i, 62) + 12), type: 'sine', dur: 0.03, r: 0.15, a: 0.002, vel: 0.06, soft: true });
      }
    }
    if (c >= 20) {
      for (let i = 0; i < 3; i++) {
        tone({ time: t, freq: midiToFreq(pentatonic(c + 2 * i, 62)), type: 'sine', dur: 0.4, a: 0.05, r: 0.3, vel: 0.05, soft: true });
      }
      noise({ time: t, dur: 0.12, type: 'highpass', freq: 8500, vel: 0.03, soft: true });
    }
  },

  miss(when) {
    if (!ready() || S.muted) return;
    const t = T0(when);
    // 可爱的“嘣”：音高快速下滑再轻轻弹回
    tone({ time: t, freq: 340, glideTo: 170, glideT: 0.09, type: 'sine', cut: 1500, dur: 0.07, r: 0.1, a: 0.003, vel: 0.16 });
    tone({ time: t + 0.1, freq: 190, glideTo: 260, glideT: 0.08, type: 'sine', cut: 1500, dur: 0.05, r: 0.12, a: 0.004, vel: 0.09 });
    tone({ time: t, freq: 90, glideTo: 60, glideT: 0.1, type: 'sine', dur: 0.05, r: 0.12, a: 0.002, vel: 0.12, soft: true });
  },

  tap(when) {
    if (!ready() || S.muted) return;
    const t = T0(when);
    tone({ time: t, freq: 1250, glideTo: 900, glideT: 0.03, type: 'triangle', cut: 4000, dur: 0.008, r: 0.04, a: 0.001, vel: 0.2 });
    noise({ time: t, dur: 0.012, type: 'bandpass', freq: 3000, vel: 0.04, soft: true });
  },

  ui(when) {
    if (!ready() || S.muted) return;
    const t = T0(when);
    tone({ time: t, freq: 660, type: 'triangle', cut: 3500, dur: 0.02, r: 0.05, a: 0.002, vel: 0.16 });
    tone({ time: t + 0.045, freq: 990, type: 'triangle', cut: 3500, dur: 0.02, r: 0.07, a: 0.002, vel: 0.14 });
  },

  tick(when) {
    if (!ready() || S.muted) return;
    tone({ time: T0(when), freq: 1100, type: 'sine', dur: 0.01, r: 0.04, a: 0.001, vel: 0.1 });
  },

  questionDone(when) {
    if (!ready() || S.muted) return;
    const t = T0(when);
    tone({ time: t, freq: midiToFreq(76), type: 'triangle', cut: 4000, dur: 0.07, r: 0.12, vel: 0.15 });
    tone({ time: t + 0.08, freq: midiToFreq(83), type: 'triangle', cut: 4500, dur: 0.1, r: 0.2, vel: 0.15 });
    bell(t + 0.08, 95, 0.3, 0.03, true);
  },

  milestone(kind = 'stage', when) {
    if (!ready() || S.muted) return;
    const m = MILESTONES[kind] || MILESTONES.stage;
    const t = T0(when);
    m.iv.forEach((iv, i) => brass(t + i * m.gap, m.root + iv, 0.1 + (i === m.iv.length - 1 ? 0.2 : 0), 0.2));
    const end = t + m.iv.length * m.gap;
    if (m.chord) {
      for (const iv of [0, 4, 7, 12]) brass(end, m.root + 12 + iv, 0.45, 0.1, 6);
    }
    bell(end, m.root + 24, 0.7, 0.08, true);
  },

  complete(when) {
    if (!ready() || S.muted) return;
    const t = T0(when);
    const run = [60, 64, 67, 72, 76, 79];
    run.forEach((n, i) => brass(t + i * 0.085, n + 12, 0.12, 0.1));
    const c = t + run.length * 0.085 + 0.05;
    for (const n of [72, 76, 79, 84]) brass(c, n, 0.75, 0.07, 7);
    tone({ time: c, freq: midiToFreq(48), type: 'triangle', cut: 600, dur: 0.7, r: 0.3, vel: 0.2 });
    [96, 100, 103, 108].forEach((n, i) => bell(c + 0.05 + i * 0.1, n, 0.5, 0.045, true));
    noise({ time: c, dur: 0.6, a: 0.01, type: 'highpass', freq: 6500, vel: 0.05, soft: true });
  },

  finale(when) {
    if (!ready() || S.muted) return;
    const t = T0(when);
    // 号角：G G G C(长) → E G C(长) → 终止大和弦
    const mel = [[67, 0, 0.13], [67, 0.16, 0.13], [67, 0.32, 0.13], [72, 0.48, 0.5], [76, 1.0, 0.2], [79, 1.2, 0.2], [84, 1.4, 0.55]];
    for (const [n, off, d] of mel) {
      brass(t + off, n + 12, d, 0.1);
      brass(t + off, n, d, 0.05, 6);
    }
    for (let i = 0; i < 6; i++) tone({ time: t + i * 0.08, freq: 130, glideTo: 70, glideT: 0.08, type: 'sine', dur: 0.04, r: 0.12, vel: 0.18 + i * 0.02, soft: true });
    const c = t + 2.0;
    for (const n of [72, 76, 79, 84, 88]) brass(c, n, 0.9, 0.06, 7);
    tone({ time: c, freq: midiToFreq(48), type: 'sawtooth', cut: 500, dur: 0.9, r: 0.4, vel: 0.16 });
    noise({ time: c, dur: 1.0, a: 0.01, type: 'highpass', freq: 5000, vel: 0.07, soft: true });
    [96, 100, 103, 107, 108, 112].forEach((n, i) => bell(c + 0.05 + i * 0.11, n, 0.8, 0.04, true));
  },

  unlock(when) {
    if (!ready() || S.muted) return;
    const t = T0(when);
    bell(t, 88, 0.9, 0.2); // 叮
    bell(t + 0.17, 81, 1.0, 0.2); // 咚
    tone({ time: t + 0.17, freq: midiToFreq(69), type: 'sine', dur: 0.1, r: 0.5, vel: 0.06, soft: true });
  },
};

/* ---- 公开 API ---- */

export const audio = {
  STYLES,
  sfx,

  init() {
    if (S.ctx) {
      if (S.ctx.state === 'suspended' && S.ctx.resume) { try { S.ctx.resume().catch(() => {}); } catch (e) { /* ignore */ } }
      return true;
    }
    const Ctor = AC();
    if (!Ctor) return false;
    try {
      S.ctx = new Ctor({ latencyHint: 'interactive' });
      build(S.ctx);
      if (S.ctx.resume) S.ctx.resume().catch(() => {});
      // iOS Safari：用一个静音 buffer 解锁
      const b = S.ctx.createBuffer(1, 1, 22050), s = S.ctx.createBufferSource();
      s.buffer = b; s.connect(S.ctx.destination); s.start(0);
      return true;
    } catch (e) {
      S.ctx = null; S.n = null;
      return false;
    }
  },

  setMuted(b) { S.muted = !!b; applyVolumes(); },
  isMuted() { return S.muted; },
  setVolume(v) { S.vol = clamp01(v, S.vol); applyVolumes(); },
  setMusicVolume(v) { S.musicVol = clamp01(v, S.musicVol); applyVolumes(); },
  setSfxVolume(v) { S.sfxVol = clamp01(v, S.sfxVol); applyVolumes(); },

  setStyle(id) { if (STYLE_DEFS[id]) S.style = id; }, // 在下一小节边界生效
  getStyle() { return S.style; },
  setStage(n) { S.stage = clampInt(n, 0, 8, 0); },
  getStage() { return S.stage; },

  startMusic() {
    const ctx = ready();
    if (!ctx) return;
    if (S.playing) return;
    S.playing = true;
    const t = ctx.currentTime;
    S.n.fade.gain.cancelScheduledValues(t);
    S.n.fade.gain.setValueAtTime(S.n.fade.gain.value, t);
    S.n.fade.gain.linearRampToValueAtTime(1, t + 0.08);
    if (!S.timer) {
      S.nextTime = t + 0.06; S.step = 0; S.bar = 0;
      for (const l of LAYERS) S.layerState[l] = 'off';
      if (!S.manual) { S.timer = setInterval(tick, POLL_MS); tick(); } else S.timer = 'manual';
    }
  },

  stopMusic(fadeMs = 600) {
    const ctx = ready();
    if (!ctx || !S.playing) { S.playing = false; return; }
    S.playing = false;
    const t = ctx.currentTime, f = Math.max(0.02, (Number(fadeMs) || 0) / 1000);
    S.n.fade.gain.cancelScheduledValues(t);
    S.n.fade.gain.setValueAtTime(S.n.fade.gain.value, t);
    S.n.fade.gain.linearRampToValueAtTime(0, t + f);
    if (S.manual) return;
    setTimeout(() => {
      if (!S.playing && S.timer) { clearInterval(S.timer); S.timer = null; }
    }, f * 1000 + 120);
  },

  isPlaying() { return S.playing; },

  duck(ms = 500, amount = 0.35) {
    const ctx = ready();
    if (!ctx) return;
    const t = ctx.currentTime, a = clamp01(amount, 0.35), d = Math.max(0.05, (Number(ms) || 0) / 1000);
    const g = S.n.duck.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.setTargetAtTime(a, t, 0.02);
    g.setTargetAtTime(1, t + d, 0.15);
  },

  preview(styleId, stage = 5, ms = 4000) {
    const ctx = ready();
    if (!ctx || !STYLE_DEFS[styleId]) return;
    if (!S.preview) S.preview = { playing: S.playing, style: S.style, stage: S.stage };
    clearTimeout(S.previewTimer);
    S.style = styleId; S.stage = clampInt(stage, 0, 8, 5);
    if (S.playing) restartBar(); else audio.startMusic();
    S.previewTimer = setTimeout(() => {
      const p = S.preview; S.preview = null;
      if (!p) return;
      S.style = p.style; S.stage = p.stage;
      if (!p.playing) audio.stopMusic(400);
    }, Math.max(200, Number(ms) || 4000));
  },

  // 仅供测试：把引擎挂到给定（离线）上下文，由调用方手动推进调度
  __test: {
    attach(ctx) { S.ctx = ctx; S.manual = true; build(ctx); },
    pump(untilTime) { pump(untilTime); },
    state: S,
  },
};
