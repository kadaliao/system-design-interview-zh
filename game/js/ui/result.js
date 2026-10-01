// 基本结果与最终结果。

import { h, put } from '../dom.js';
import { t } from '../i18n.js';
import { formatDopa, fmtTime } from '../core.js';
import { targetSeconds } from '../scoring.js';
import { EXTRA_RATE } from '../session.js';
import { stars, questText } from './common.js';

function countUp(el, to, app, ms = 900) {
  if (!Number(document.body.dataset.motion)) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const stat = (label, value, cls = '') => h('div.stat' + (cls ? '.' + cls : ''), h('span.stat-v', value), h('span.stat-l', label));

function skillLines(app, events) {
  const lines = [];
  const seen = new Set();
  for (const e of events) {
    const l = app.course.lesson(e.lesson);
    for (const p of e.placed || []) if (!seen.has('p' + p)) { seen.add('p' + p); }
    if (e.mastered) lines.push(h('li.sk', h('span', '🎉'), t('result.mastered', { name: l.title }), stars(1)));
    for (const s of e.starsGained.filter(x => x > 1)) lines.push(h('li.sk', h('span', '⭐'), t('result.star', { name: l.title, n: s })));
    if (e.polished) lines.push(h('li.sk', h('span', '✨'), t('result.polished', { name: l.title })));
  }
  const placed = [...seen].length;
  if (placed) lines.unshift(h('li.sk', h('span', '🧭'), t('result.placed', { n: placed })));
  return lines;
}

export function renderBasic(root, app, d) {
  const { session, plan, entry } = d;
  const rate = Math.round(session.firstTryRate() * 100);
  const target = targetSeconds(session.n);
  const scoreEl = h('b.big-score', '0');
  const canExtra = session.canExtra();
  const sk = skillLines(app, d.skillEvents);
  const growth = d.growth || [];

  put(root,
    h('div.result-head', h('h2', plan.placement ? t('result.placementDone') : t('result.basicDone')), h('div.score-line', scoreEl, h('span', t('result.points')))),
    h('div.stats',
      stat(t('result.time'), `${fmtTime(session.basicMs / 1000)} / ${fmtTime(target)}`),
      stat(t('result.firstTry'), `${session.ftQ}/${session.n} (${rate}%)`),
      stat(t('result.almost'), String(session.miss)),
      stat(t('result.maxCombo'), String(session.maxCombo)),
      stat(t('result.dopa'), formatDopa(session.L, app.lang), 'dopa')),
    sk.length ? h('ul.skill-lines', sk) : null,
    growth.length ? h('div.growth', h('h3', t('result.growth')), h('ul', growth.map(g => h('li', '📈 ', t('growth.' + g.key, { now: g.now, prev: g.prev }))))) : null,
    d.questsDone.length ? h('ul.skill-lines', d.questsDone.map(q => h('li.sk', h('span', '🎯'), t('result.questDone', { q: questText(app, q) })))) : null,
    d.reward ? h('p.reward-line', d.reward === 'hammer' ? t('result.hammer') : t('result.hammerFull')) : null,
    h('div.result-actions',
      canExtra ? h('button.btn.primary.hero', { id: 'btn-extra', 'data-autofocus': true, onclick: d.onExtra }, t('result.extra'), h('small', t('result.extraSub'))) : null,
      !canExtra && plan.canExtra ? h('p.muted.small', t('result.extraLocked', { rate: Math.round(EXTRA_RATE * 100), now: rate })) : null,
      h('div.row',
        plan.mode === 'review' && !app.state.review.length ? null : h('button.btn.secondary', { id: 'btn-again', onclick: d.onAgain }, t('result.again')),
        h('button.btn.secondary', { id: 'btn-home', onclick: d.onHome }, t('result.home')))));
  countUp(scoreEl, 100, app);
}

export function renderFinal(root, app, d) {
  const { session, entry } = d;
  const scoreEl = h('b.big-score', '0');
  put(root,
    h('div.result-head', h('h2', t('result.finalTitle')), h('div.score-line', scoreEl, h('span', t('result.points')))),
    h('div.stats',
      stat(t('result.extraQ'), String(session.extraDone)),
      stat(t('result.firstTry'), `${session.ftQ + session.extraFt}/${session.qDone + session.extraDone}`),
      stat(t('result.almost'), String(session.miss + session.extraMiss)),
      stat(t('result.maxCombo'), String(session.maxCombo)),
      stat(t('result.dopa'), formatDopa(session.L, app.lang), 'dopa')),
    h('div.result-actions',
      h('div.row',
        h('button.btn.primary', { id: 'btn-again', 'data-autofocus': true, onclick: d.onAgain }, t('result.again')),
        h('button.btn.secondary', { id: 'btn-home', onclick: d.onHome }, t('result.home')))));
  countUp(scoreEl, session.score(), app, 1400);
}
