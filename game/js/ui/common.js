// 各页面共用的小部件：吉祥物、星星、任务列表、奖励弹窗。

import { h, modal } from '../dom.js';
import { t } from '../i18n.js';
import { createMascot } from '../mascot.js';
import { MAX_STARS, rustySkills, statusOf } from '../skills.js';
import { TROPHIES } from '../trophies.js';
import { itemById, bareId } from '../unlocks.js';

export function mascotIn(container, app, { stage = 0, mood = 'idle' } = {}) {
  const m = createMascot(container, { skin: app.mascotSkin });
  m.setMotion(Number(document.body.dataset.motion ?? 2));
  m.setStage(stage);
  m.setMood(mood);
  return m;
}

export const stars = (n, max = MAX_STARS) => h('span.stars', { 'aria-label': t('tree.stars', { n }) },
  Array.from({ length: max }, (_, i) => h('span.star' + (i < n ? '.on' : ''), '★')));

export function chapterProgress(app, ch) {
  const ids = app.course.chapters.get(ch).lessonIds;
  const mastered = ids.filter(id => statusOf(app.course, app.state, id) === 'mastered').length;
  return { mastered, total: ids.length };
}

export function trophyTitle(def) {
  if (def.cat === 'chapter') return t('tr.' + def.series, { n: def.n });
  if (def.secret) return t('tr.secret.' + def.series);
  return t('tr.' + def.series, { n: def.n });
}

export const RANK_ICON = { bronze: '🥉', silver: '🥈', gold: '🥇', rainbow: '🌈', secret: '🗝️' };

/** 今日任务列表。 */
export function questList(app) {
  const qs = app.state.quests;
  if (!qs) return h('div');
  return h('ul.quests', qs.list.map(q => h('li.quest' + (q.done ? '.done' : ''),
    h('span.q-mark', q.done ? '✓' : q.tier === 'hard' ? '★' : '·'),
    h('span.q-text', questText(app, q)),
    h('span.q-prog', `${Math.min(q.progress, q.target)}/${q.target}`))));
}

export function questText(app, q) {
  const lesson = q.lesson ? app.course.lesson(q.lesson) : null;
  return t('quest.' + q.id, { n: q.target, lesson: lesson ? lesson.title : '' });
}

/** 一批新成就/新收藏的庆祝弹窗；一次最多列 6 个，其余写“还有 N 个”。 */
export function rewardsDialog(app, { trophies = [], items = [] }) {
  return new Promise(resolve => {
    if (!trophies.length && !items.length) return resolve();
    const shown = trophies.slice(0, 6);
    const body = h('div.rewards',
      shown.length ? h('h3', t('rewards.trophies')) : null,
      shown.map(d => h('div.reward', h('span.reward-ico', RANK_ICON[d.rank]), h('span.reward-name', trophyTitle(d)))),
      trophies.length > 6 ? h('p.muted', t('rewards.more', { n: trophies.length - 6 })) : null,
      items.length ? h('h3', t('rewards.items')) : null,
      items.map(it => h('div.reward', h('span.reward-ico', '🎁'), h('span.reward-name', collectionName(it.id)))));
    app.sfx('unlock');
    modal(body, { title: t('rewards.title'), onClose: resolve, actions: [{ label: t('common.ok'), primary: true }] });
  });
}

export function collectionName(id) {
  const [cat, b] = id.split(':');
  return t(`col.${cat}.${b}`);
}

export const statusIcon = s => ({ locked: '🔒', new: '✨', practice: '🔸', mastered: '✅' }[s] || '');

export function rustBadge(app, id) {
  return rustySkills(app.state).includes(id) ? h('span.rust', { title: t('tree.rust') }, t('tree.rustShort')) : null;
}
