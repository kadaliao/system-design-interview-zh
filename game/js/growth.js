// 成长对比：只展示变好的项目，不提示变差的。

import { DAY_MS, median } from './core.js';

const win = (hist, from, to) => hist.filter(h => h.t >= from && h.t < to);
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0);

function summarize(plays) {
  if (!plays.length) return null;
  const n = sum(plays, h => h.n);
  return {
    plays: plays.length,
    ftRate: Math.round((sum(plays, h => h.ft) / n) * 100),
    secPerQ: Math.round(sum(plays, h => h.ms) / 1000 / n * 10) / 10,
    combo: Math.max(...plays.map(h => h.maxCombo)),
    score: Math.round(sum(plays, h => h.score) / plays.length),
    answered: n + sum(plays, h => h.extra || 0),
  };
}

/** 本周（最近 7 天）对比上周：只返回变好的项。 */
export function weeklyGrowth(state, now = Date.now()) {
  const cur = summarize(win(state.history, now - 7 * DAY_MS, now + 1));
  const prev = summarize(win(state.history, now - 14 * DAY_MS, now - 7 * DAY_MS));
  if (!cur || !prev) return [];
  const out = [];
  if (cur.ftRate > prev.ftRate) out.push({ key: 'ftRate', now: cur.ftRate, prev: prev.ftRate, unit: '%' });
  if (cur.secPerQ < prev.secPerQ) out.push({ key: 'speed', now: cur.secPerQ, prev: prev.secPerQ, unit: 's' });
  if (cur.combo > prev.combo) out.push({ key: 'combo', now: cur.combo, prev: prev.combo, unit: '' });
  if (cur.score > prev.score) out.push({ key: 'score', now: cur.score, prev: prev.score, unit: '' });
  if (cur.answered > prev.answered) out.push({ key: 'answered', now: cur.answered, prev: prev.answered, unit: '' });
  return out;
}

/** 本次对比最近 10 次同题数的游玩（不含这一次）。只返回变好的项。 */
export function compareWithPast(state, entry) {
  const past = state.history.filter(h => h !== entry && h.n === entry.n && h.mode !== 'review').slice(-10);
  if (past.length < 2) return [];
  const avg = f => sum(past, f) / past.length;
  const out = [];
  const ft = (entry.ft / entry.n) * 100;
  const pastFt = avg(h => (h.ft / h.n) * 100);
  if (ft > pastFt + 1) out.push({ key: 'ftRate', now: Math.round(ft), prev: Math.round(pastFt), unit: '%' });
  const sec = entry.ms / 1000;
  const pastSec = avg(h => h.ms / 1000);
  if (sec < pastSec - 1) out.push({ key: 'time', now: Math.round(sec), prev: Math.round(pastSec), unit: 's' });
  const bestCombo = Math.max(...past.map(h => h.maxCombo));
  if (entry.maxCombo > bestCombo) out.push({ key: 'combo', now: entry.maxCombo, prev: bestCombo, unit: '' });
  const pastScore = Math.max(...past.map(h => h.score));
  if (entry.score > pastScore) out.push({ key: 'score', now: entry.score, prev: pastScore, unit: '' });
  return out;
}

export { median };
