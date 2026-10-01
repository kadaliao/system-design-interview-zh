// 一次游玩的状态机：输入 → 事件。不碰 DOM，也不读时钟（时间由调用方传入），所以可以完整单测。
// 流程：基本 N 题（完成得 100 分）→（首次即对率 ≥ 80% 可选）加试，题目无限，直到玩家收手。

import { createRound } from './cells.js';
import { advanceL, baseIncrement, cellTimeMs, extraQuestionPoints, refTimeMs, BASIC_POINTS } from './scoring.js';
import { dopaMilestonesCrossed, stageForL } from './core.js';

export const EXTRA_RATE = 0.8;

/** 连击里程碑：10、20、30、50、75，之后每 50。返回事件名或 null。 */
export function comboMilestone(c) {
  if (c === 10) return 'combo10';
  if (c === 20) return 'combo20';
  if (c === 30 || c === 50 || c === 75 || (c >= 100 && c % 50 === 0)) return 'combo50';
  return null;
}

export function createSession({ plan, n, lang = 'zh', pace = 'normal', rand = Math.random, labels }) {
  const s = {
    plan, n, lang, pace,
    phase: 'idle',            // idle → basic → basicDone → extra → ended
    qIndex: 0, round: null, ex: null,
    combo: 0, maxCombo: 0, L: 0, stage: 0,
    qDone: 0, ftQ: 0, cells: 0, miss: 0,
    extraDone: 0, extraFt: 0, extraCells: 0, extraMiss: 0,
    startedAt: 0, basicMs: 0, paused: 0, pausedAt: null,
    qStart: 0, deadline: Infinity, cellTotal: 0, lastResult: null,
    log: [], extraLog: [],
  };

  const total = () => (s.phase === 'extra' ? 0 : s.n);
  const clock = now => now - s.paused;

  function load(ex, now) {
    s.ex = ex;
    s.round = createRound(ex, rand, labels);
    s.qStart = clock(now);
    setDeadline(now);
  }
  function setDeadline(now) {
    const t = cellTimeMs(s.ex, s.round.accepted, s.lang, s.pace);
    s.cellTotal = t;
    s.deadline = t === Infinity ? Infinity : now + t;
  }

  /** 开始游玩。 */
  s.start = now => {
    s.startedAt = clock(now);
    s.phase = 'basic';
    s.qIndex = 0;
    const ex = plan.questionAt(0, null);
    if (!ex) { s.phase = 'ended'; return null; }
    load(ex, now);
    return ex;
  };

  const evBase = () => ({ combo: s.combo, L: s.L, stage: s.stage });

  /** 玩家输入。返回按顺序发生的事件。 */
  s.input = (tok, now) => {
    if (!s.round || s.round.done || (s.phase !== 'basic' && s.phase !== 'extra')) return [];
    const events = [];
    expire(now, events);
    const r = s.round.input(tok);
    if (r.result === 'noop') return events;
    if (r.result === 'select') { events.push({ type: 'select', ...evBase() }); return events; }
    const extra = s.phase === 'extra';
    if (r.result === 'miss') {
      const broken = s.combo;
      if (broken) s.comboBreaks = (s.comboBreaks || 0) + 1;
      s.combo = 0;
      if (extra) s.extraMiss++; else s.miss++;
      events.push({ type: 'miss', brokenFrom: broken, cellMisses: s.round.cellMisses, ...r, ...evBase() });
      return events;
    }
    // 正确的一格
    s.combo++;
    s.maxCombo = Math.max(s.maxCombo, s.combo);
    const prevL = s.L;
    const inc = baseIncrement({
      phase: s.phase, N: s.n, q: s.qIndex, m: s.round.cells, s: r.cell, k: s.extraDone,
    });
    s.L = advanceL(s.L, inc, s.combo);
    const prevStage = s.stage;
    s.stage = stageForL(s.L);
    if (extra) s.extraCells++; else s.cells++;
    events.push({
      type: 'correct', ...r, cells: s.round.cells, prevL, ...evBase(),
      stageUp: s.stage > prevStage, comboMilestone: comboMilestone(s.combo),
      dopaMilestones: dopaMilestonesCrossed(prevL, s.L),
    });
    if (r.done) {
      const ms = Math.max(0, clock(now) - s.qStart);
      const ft = s.round.misses === 0;
      const ref = refTimeMs(s.ex, s.round.cells, s.lang);
      const points = extra ? extraQuestionPoints(s.extraDone) : 0;
      const entry = { id: s.ex.id, qtype: s.ex.type, lesson: s.ex.lesson, ft, misses: s.round.misses, ms, ratio: ms / ref, capsule: !!s.ex.capsule, cells: s.round.cells };
      (extra ? s.extraLog : s.log).push(entry);
      if (extra) { s.extraDone++; if (ft) s.extraFt++; } else { s.qDone++; if (ft) s.ftQ++; }
      s.lastResult = { ex: s.ex, ft };
      s.deadline = Infinity;
      events.push({ type: 'questionDone', ...entry, ex: s.ex, points, extra });
    } else {
      setDeadline(now);
    }
    return events;
  };

  /** 到时间的连击会断，不扣分。定时调用即可。 */
  function expire(now, events) {
    if (s.combo >= 2 && now > s.deadline) {
      events.push({ type: 'timeout', brokenFrom: s.combo, ...evBase() });
      s.combo = 0;
      s.comboBreaks = (s.comboBreaks || 0) + 1;
      s.deadline = Infinity;
    }
  }
  s.tick = now => {
    const events = [];
    if (s.round && !s.round.done && (s.phase === 'basic' || s.phase === 'extra')) expire(now, events);
    return events;
  };

  /** 暂停/继续：暂停期间不计入用时和时限。 */
  s.pause = now => { if (s.pausedAt == null) s.pausedAt = now; };
  s.resume = now => {
    if (s.pausedAt == null) return;
    const d = now - s.pausedAt;
    s.paused += d;
    if (s.deadline !== Infinity) s.deadline += d;
    s.pausedAt = null;
  };

  /** 当前题已完成，进入下一题。基本最后一题之后返回 {type:'basicDone'}。 */
  s.advance = now => {
    if (!s.round || !s.round.done) return null;
    if (s.phase === 'extra') {
      const ex = plan.extraAt(s.extraDone);
      if (!ex) return s.finish(now);
      load(ex, now);
      return { type: 'question', ex };
    }
    s.qIndex++;
    const nextEx = s.qIndex < s.n ? plan.questionAt(s.qIndex, s.lastResult) : null;
    if (!nextEx) {
      s.basicMs = Math.max(0, clock(now) - s.startedAt);
      s.phase = 'basicDone';
      s.basicFinished = true;
      s.round = null;
      return { type: 'basicDone', rate: s.firstTryRate(), canExtra: s.canExtra() };
    }
    load(nextEx, now);
    return { type: 'question', ex: nextEx };
  };

  s.firstTryRate = () => (s.qDone ? s.ftQ / s.qDone : 0);
  s.canExtra = () => plan.canExtra && s.firstTryRate() >= EXTRA_RATE;

  /** 从基本结果进入加试：连击清零，多巴值继续。 */
  s.enterExtra = now => {
    if (s.phase !== 'basicDone' || !s.canExtra()) return null;
    s.phase = 'extra';
    s.combo = 0;
    const ex = plan.extraAt(0);
    load(ex, now);
    return ex;
  };

  s.finish = () => {
    s.phase = 'ended';
    s.round = null;
    return { type: 'ended' };
  };

  /** 得分：基本完成 100，加试每题 10+5k。 */
  s.score = () => {
    let sc = s.basicFinished ? BASIC_POINTS : 0;
    for (let k = 0; k < s.extraDone; k++) sc += extraQuestionPoints(k);
    return sc;
  };
  s.basicComplete = () => !!s.basicFinished;
  s.total = total;
  return s;
}
