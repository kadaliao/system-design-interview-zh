// 出题：根据模式、进度和随机数，生成一次游玩的题目序列（基本 N 题 + 无限加试）。

import { DAY_MS, shuffle } from './core.js';
import { isMastered, isUnlocked, rustySkills } from './skills.js';

const CAPSULE_MIN_AGE = 2 * DAY_MS;

/** 从某课挑一道题：没做过的优先，其次没有一次答对过的，再其次最久没答对的；已用过的尽量不重复。 */
export function pickExercise(lesson, ctx) {
  const { state, used, rand } = ctx;
  const score = ex => {
    const q = state.q[ex.id];
    const base = !q ? 0 : q.lastFt ? 1 + q.lastFt / 1e14 : 0.5;
    return base + rand() * 0.3;
  };
  let pool = lesson.exercises.filter(e => !used.has(e.id));
  if (!pool.length) pool = lesson.exercises;
  let best = pool[0];
  let bs = Infinity;
  for (const e of pool) {
    const s = score(e);
    if (s < bs) { bs = s; best = e; }
  }
  used.add(best.id);
  return best;
}

/** 在若干课之间轮流出题，直到凑够 n 题（题目不够时允许重复）。 */
function roundRobin(lessons, n, ctx) {
  const out = [];
  if (!lessons.length) return out;
  for (let i = 0; out.length < n && i < n * 4; i++) out.push(pickExercise(lessons[i % lessons.length], ctx));
  return out;
}

/** 让相邻两题尽量不同题型，题目顺序其余保持不变。 */
export function spreadTypes(list) {
  const a = list.slice();
  for (let i = 1; i < a.length; i++) {
    if (a[i].type !== a[i - 1].type) continue;
    const j = a.findIndex((e, k) => k > i && e.type !== a[i - 1].type && (k + 1 >= a.length || e.type !== a[k + 1].type));
    if (j > 0) [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 无限的加试序列：先走给定课程，用完后放宽到全部已解锁，再到所有课。 */
function makeExtra(course, state, lessonGroups, rand) {
  const used = new Set();
  const ctx = { state, used, rand };
  const seq = [];
  return k => {
    while (seq.length <= k) {
      let progress = false;
      for (const group of lessonGroups) {
        const fresh = group.filter(l => l.exercises.some(e => !used.has(e.id)));
        if (fresh.length) { seq.push(pickExercise(fresh[seq.length % fresh.length], ctx)); progress = true; break; }
      }
      if (!progress) { used.clear(); }
    }
    return seq[k];
  };
}

/** 把「回访题」（以前没一次答对、已过两天以上的题）替换进一道题。 */
function injectCapsule(list, state, now, rand) {
  if (list.length < 4) return { list, capsule: false };
  const ids = new Set(list.map(e => e.id));
  const due = state.review.filter(r => now - r.t >= CAPSULE_MIN_AGE && !ids.has(r.id));
  if (!due.length) return { list, capsule: false };
  return { list, capsule: due[Math.floor(rand() * due.length)].id };
}

/** 实力检测：沿前提深度排好的课程表大步探测，答对就整条前提链一起算掌握。 */
class Placement {
  constructor(course, state, rand) {
    this.course = course; this.rand = rand; this.state = state;
    this.pos = 0; this.stride = 6; this.lastGood = -1; this.visited = new Set();
    this.lesson = null;
  }
  next(prev) {
    const order = this.course.ordered;
    if (prev) {
      if (prev.ft) {
        this.lastGood = this.lesson.order;
        this.pos = this.lesson.order + this.stride;
        this.stride = Math.min(12, Math.ceil(this.stride * 1.3));
      } else {
        this.stride = Math.max(1, Math.floor(this.stride / 2));
        this.pos = this.lastGood + this.stride;
      }
    }
    let p = Math.min(order.length - 1, Math.max(0, this.pos));
    while (p < order.length && this.visited.has(p)) p++;
    if (p >= order.length) { p = order.length - 1; while (p >= 0 && this.visited.has(p)) p--; }
    if (p < 0) p = Math.floor(this.rand() * order.length); // 全部探测过，随便挑
    this.visited.add(p);
    this.lesson = order[p];
    const ctx = { state: this.state, used: new Set(), rand: this.rand };
    return pickExercise(this.lesson, ctx);
  }
}

/**
 * 生成游玩计划。
 * mode: 'self' | 'chapter' | 'practice' | 'review'；ref: 章号 / 课 id。
 * 返回 { mode, ref, n, placement, canExtra, questionAt(i, prev), extraAt(k), capsule }
 */
export function buildPlan({ course, state, mode, ref, n, rand = Math.random, now = Date.now() }) {
  const ctx = { state, used: new Set(), rand };
  const plan = { mode, ref, n, placement: false, canExtra: true, capsule: false };
  const lessons = course.lessons;
  const fixed = list => {
    const { list: l, capsule } = injectCapsule(spreadTypes(list), state, now, rand);
    const arr = l.slice();
    if (capsule) {
      const cap = course.ex(capsule);
      if (cap) { arr[Math.min(2, arr.length - 1)] = { ...cap, capsule: true }; plan.capsule = true; }
    }
    plan.questionAt = i => arr[i] || null;
    plan.list = arr;
  };

  if (mode === 'self') {
    if (!state.placementDone) {
      plan.placement = true;
      const pl = new Placement(course, state, rand);
      plan.questionAt = (i, prev) => (i < n ? pl.next(prev) : null);
      // 检测后第一次加试：从解锁的、未掌握的课开始
      const unl = lessons.filter(l => !isMastered(state, l.id) && isUnlocked(course, state, l.id)).slice(0, 3);
      plan.extraAt = makeExtra(course, state, [unl.length ? unl : lessons.slice(0, 3), lessons], rand);
    } else {
      const mastered = course.ordered.filter(l => isMastered(state, l.id));
      const learn = course.ordered.filter(l => !isMastered(state, l.id) && isUnlocked(course, state, l.id));
      const rusty = new Set(rustySkills(state, now));
      const pool = mastered.slice(-6);
      const reviewN = pool.length ? Math.min(pool.length, Math.max(1, Math.round(n * 0.3))) : 0;
      const cands = [...pool.filter(l => rusty.has(l.id)), ...shuffle(pool.filter(l => !rusty.has(l.id)), rand)];
      const reviewLessons = cands.slice(0, reviewN);
      const learnLessons = learn.length ? learn.slice(0, 4) : mastered;
      const reviewQs = reviewLessons.map(l => pickExercise(l, ctx));
      const learnQs = roundRobin(learnLessons, n - reviewQs.length, ctx);
      // 复习题均匀穿插进新课题之间
      const list = learnQs.slice();
      reviewQs.forEach((q, i) => list.splice(Math.min(list.length, Math.floor(((i + 1) * (list.length + 1)) / (reviewQs.length + 1))), 0, q));
      fixed(list);
      const tail = (learn.length ? learn : mastered).slice(-3);
      plan.extraAt = makeExtra(course, state, [tail, learnLessons, lessons], rand);
    }
  } else if (mode === 'chapter') {
    const ch = course.chapters.get(ref);
    const ls = ch.lessonIds.map(id => course.lesson(id));
    fixed(roundRobin(ls, n, ctx));
    const late = ls.slice(Math.floor(ls.length * 0.55) - 1 < 0 ? 0 : Math.floor(ls.length * 0.55) - 1);
    const next = course.chapters.get(ref + 1);
    const nextLs = next ? next.lessonIds.slice(0, 3).map(id => course.lesson(id)) : late;
    // 前 6 题：本章后半；之后换到下一章的开头
    const first = makeExtra(course, state, [late, ls], rand);
    const second = makeExtra(course, state, [nextLs, ls], rand);
    plan.extraAt = k => (k < 6 ? first(k) : second(k - 6));
  } else if (mode === 'practice') {
    const lesson = course.lesson(ref);
    const chLs = course.chapters.get(lesson.ch).lessonIds.map(id => course.lesson(id));
    const own = lesson.exercises.length >= n ? [lesson] : [lesson, ...chLs.filter(l => l.id !== ref)];
    const list = [];
    const used = ctx.used;
    for (const l of own) {
      while (list.length < n && l.exercises.some(e => !used.has(e.id))) list.push(pickExercise(l, ctx));
      if (list.length >= n) break;
    }
    if (list.length < n) list.push(...roundRobin([lesson], n - list.length, ctx));
    fixed(list);
    const deps = course.dependents.get(ref).map(id => course.lesson(id)).filter(l => isUnlocked(course, state, l.id));
    plan.extraAt = makeExtra(course, state, [deps.length ? deps : [lesson], [lesson], chLs], rand);
  } else if (mode === 'review') {
    plan.canExtra = false;
    const items = state.review.map(r => course.ex(r.id)).filter(Boolean).slice(-Math.min(n, 10)).reverse();
    plan.n = items.length;
    plan.questionAt = i => items[i] || null;
    plan.list = items;
    plan.extraAt = () => null;
  } else {
    throw new Error('未知模式 ' + mode);
  }
  if (!plan.list && !plan.placement) plan.list = [];
  return plan;
}
