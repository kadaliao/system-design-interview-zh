// 技能树：每一章一行，每一课一个节点；前提章通关后下一章解锁。

import { h, clear, put } from '../dom.js';
import { t } from '../i18n.js';
import { statusOf, rec, totalStars, MAX_STARS, chapterCleared } from '../skills.js';
import { stars, statusIcon, rustBadge } from './common.js';
import { lessonSheet } from './sheets.js';
import { CHAPTER_PREREQ } from '../course.js';

export function mount(root, app) {
  const body = h('div.tree');
  function render() {
    const { course, state } = app;
    const mastered = course.lessons.filter(l => state.skills[l.id] && state.skills[l.id].mastered).length;
    clear(body);
    put(body,
      h('div.tree-stats',
        h('span', t('tree.mastered', { n: mastered, total: course.lessons.length })),
        h('span', '★ ' + totalStars(state) + ' / ' + course.lessons.length * MAX_STARS)),
      h('div.legend', ['new', 'practice', 'mastered', 'locked'].map(s => h('span', statusIcon(s), ' ', t('tree.s.' + s))), h('span', '🟠 ', t('tree.rust'))),
      course.sections.map(sec => h('section.sec',
        h('h3.sec-title', sec.title, h('span.muted.small', ' ' + sec.subtitle)),
        sec.chapters.map(n => chapterRow(app, n)))));
  }
  root.append(
    h('header.top', h('button.icon-btn', { 'aria-label': t('common.back'), onclick: () => app.go('title'), 'data-autofocus': true }, '←'), h('h1.page-title', t('nav.tree'))),
    body);
  app.bg.setStage(1);
  render();
  return { unmount() {}, refresh: render };
}

function chapterRow(app, n) {
  const { course, state } = app;
  const ch = course.chapters.get(n);
  const pre = CHAPTER_PREREQ[n] || [];
  return h('div.tree-chapter', { id: 'tc' + n },
    h('div.tc-head',
      h('span.ch-n', n), h('strong', ch.title),
      pre.length ? h('span.prereq', '← ', pre.map(p => h('button.mini' + (chapterCleared(course, state, p) ? '.ok' : ''), { onclick: () => document.getElementById('tc' + p)?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, t('chapter.n', { n: p })))) : null),
    h('div.node-row', ch.lessonIds.map((id, i) => {
      const l = course.lesson(id);
      const s = statusOf(course, state, id);
      const r = state.skills[id];
      return h('button.node.' + s, { onclick: () => lessonSheet(app, id), 'aria-label': `${l.title} ${t('tree.s.' + s)}` },
        h('span.node-ico', statusIcon(s)),
        h('span.node-name', l.title),
        s === 'mastered' ? stars(r.stars) : h('span.node-sub', s === 'practice' ? `${r.hist.slice(-6).filter(x => x.ft).length}/${Math.min(6, r.hist.length)}` : ''),
        rustBadge(app, id));
    })));
}
