// 技能（每一课）的掌握、星级、生锈与解锁。状态都放在 state.skills 里，这里只有读写它们的纯函数。

import { DAY_MS, median } from './core.js';

export const MASTER_WINDOW = 6;       // 看最近 6 题
export const MASTER_NEED = 5;         // 其中至少 5 题首次即对
export const HIST_MAX = 40;
export const RUST_MS = 21 * DAY_MS;
export const MAX_STARS = 5;
export const STAR_GAP_MS = 7 * DAY_MS;

export function rec(state, id) {
  return state.skills[id] || (state.skills[id] = { hist: [], mastered: null, stars: 0, starAt: {}, lastFt: null, placed: null, solved: 0, fastest: null });
}

const ftRate = xs => (xs.length ? xs.filter(h => h.ft).length / xs.length : 0);
const ratioMedian = xs => median(xs.filter(h => h.ft && h.r != null).map(h => h.r));

export function meetsMastery(hist) {
  const last = hist.slice(-MASTER_WINDOW);
  return hist.length >= MASTER_WINDOW && last.filter(h => h.ft).length >= MASTER_NEED;
}

/** 下一颗星的条件是否满足。返回星的序号（2..5），不满足为 0。 */
function nextStarMet(r) {
  const next = r.stars + 1;
  const h = r.hist;
  switch (next) {
    case 2: return h.length >= 20 && ftRate(h.slice(-20)) >= 0.9;
    case 3: {
      const l = h.slice(-10);
      const m = ratioMedian(l);
      return l.length >= 10 && l.filter(x => x.ft).length >= 5 && m != null && m <= 1;
    }
    case 4: {
      const l = h.slice(-3);
      const at3 = r.starAt[3];
      return l.length >= 3 && l.every(x => x.ft) && at3 != null && l.every(x => x.t - at3 >= STAR_GAP_MS);
    }
    case 5: {
      const l = h.slice(-20);
      const m = ratioMedian(l);
      return l.length >= 20 && ftRate(l) >= 0.95 && m != null && m <= 0.6;
    }
    default: return false;
  }
}

/** 掌握状态：locked / new / practice / mastered。 */
export function statusOf(course, state, id) {
  const r = state.skills[id];
  if (r && r.mastered) return 'mastered';
  if (!isUnlocked(course, state, id)) return 'locked';
  return r && r.hist.length ? 'practice' : 'new';
}

export const isMastered = (state, id) => !!(state.skills[id] && state.skills[id].mastered);

export function isUnlocked(course, state, id) {
  return course.lesson(id).prereqs.every(p => isMastered(state, p));
}

/** 生锈的课：已掌握、最后一次首次即对距今 ≥21 天，最旧的至多 3 个。 */
export function rustySkills(state, now = Date.now()) {
  const out = [];
  for (const [id, r] of Object.entries(state.skills)) {
    if (!r.mastered) continue;
    const t = r.lastFt || r.placed || r.mastered;
    if (now - t >= RUST_MS) out.push([t, id]);
  }
  return out.sort((a, b) => a[0] - b[0]).slice(0, 3).map(x => x[1]);
}

/**
 * 记录一次作答结果。ft：这题是否一次就对；ratio：用时 / 基准用时；ms：用时。
 * 返回 { mastered, starsGained:[…], polished }。
 */
export function recordAnswer(state, lessonId, { exId, ft, ratio = null, ms = 0, now = Date.now() }) {
  const out = { mastered: false, starsGained: [], polished: false };
  const r = rec(state, lessonId);
  const wasRusty = r.mastered ? rustySkills(state, now).includes(lessonId) : false;

  r.hist.push({ t: now, ft: ft ? 1 : 0, r: ft && ratio != null ? Math.round(ratio * 100) / 100 : null });
  if (r.hist.length > HIST_MAX) r.hist.splice(0, r.hist.length - HIST_MAX);
  r.solved++;
  if (ft) {
    r.lastFt = now;
    if (ms > 0 && (r.fastest == null || ms < r.fastest)) r.fastest = ms;
  }
  if (wasRusty && ft) out.polished = true;

  const q = state.q[exId] || (state.q[exId] = { n: 0, ft: 0, last: 0, lastFt: 0 });
  q.n++;
  q.last = now;
  if (ft) { q.ft++; q.lastFt = now; }

  if (!r.mastered && meetsMastery(r.hist)) {
    r.mastered = now;
    r.stars = Math.max(r.stars, 1);
    out.mastered = true;
    out.starsGained.push(1);
  }
  if (r.mastered) {
    // 一次满足多个条件时连升
    for (let guard = 0; guard < MAX_STARS && r.stars < MAX_STARS && nextStarMet(r); guard++) {
      r.stars++;
      r.starAt[r.stars] = now;
      out.starsGained.push(r.stars);
    }
  }
  return out;
}

/** 实力检测：把某课和它的全部前提一并标为掌握 ☆1。返回新掌握的课 id。 */
export function placeMaster(course, state, id, now = Date.now()) {
  const gained = [];
  for (const x of [id, ...course.ancestors(id)]) {
    const r = rec(state, x);
    if (!r.mastered) {
      r.mastered = now; r.placed = now; r.stars = Math.max(r.stars, 1);
      gained.push(x);
    }
  }
  return gained;
}

/** 清除某课及其所有后代的记录（长按删除用）。 */
export function resetSkill(course, state, id) {
  for (const x of [id, ...course.descendants(id)]) delete state.skills[x];
}

export function nextStarInfo(r) {
  return r.mastered && r.stars < MAX_STARS ? r.stars + 1 : null;
}

export function totalStars(state) {
  return Object.values(state.skills).reduce((s, r) => s + (r.stars || 0), 0);
}
export const MAX_TOTAL_STARS = (n) => n * MAX_STARS;

/** 某章是否通关：整章的课全部掌握。 */
export function chapterCleared(course, state, ch) {
  return course.chapters.get(ch).lessonIds.every(id => isMastered(state, id));
}
