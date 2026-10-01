// 章节面板与课程面板：从首页和技能树都能打开。

import { h, modal, confirmDialog, toast } from '../dom.js';
import { t } from '../i18n.js';
import { stars, chapterProgress, statusIcon, rustBadge } from './common.js';
import { nextStarInfo, statusOf, rec, resetSkill, MAX_STARS, STAR_GAP_MS } from '../skills.js';
import { fmtTime } from '../core.js';

function readLink(app, label, href, cls = 'link') {
  return h('a.' + cls, { href, target: '_blank', rel: 'noopener', onclick: () => { app.state.stats.reads++; app.store.save(); } }, label, ' ↗');
}

export function chapterSheet(app, chNum) {
  const { course, state } = app;
  const ch = course.chapters.get(chNum);
  const { mastered, total } = chapterProgress(app, chNum);
  const lessons = ch.lessonIds.map(id => course.lesson(id));
  const body = h('div.sheet',
    h('p.muted', ch.fullTitle),
    h('ul.keypoints', ch.keyPoints.map(k => h('li', k))),
    h('h3', t('sheet.lessons'), h('span.muted.small', ` ${mastered}/${total}`)),
    h('ul.lesson-list', lessons.map(l => {
      const s = statusOf(course, state, l.id);
      return h('li.lesson-row.' + s,
        h('span.l-ico', statusIcon(s)),
        h('span.l-main', h('strong', l.title), h('span.muted.small', l.summary)),
        s === 'mastered' ? stars(rec(state, l.id).stars) : null,
        rustBadge(app, l.id),
        h('button.btn.small', { onclick: () => { dlg.close(); lessonSheet(app, l.id); } }, t('sheet.detail')));
    })),
    ch.labs.length ? h('div.labs', h('h3', t('sheet.labs')), ch.labs.map(lab => h('div', readLink(app, lab.title, course.labLink(chNum, lab.id))))) : null,
    h('div.sheet-links', readLink(app, t('sheet.read'), course.readerLink(chNum))));
  const dlg = modal(body, {
    title: `${t('chapter.n', { n: chNum })} · ${ch.title}`, wide: true,
    actions: [
      { label: t('common.close') },
      { label: t('sheet.playChapter'), primary: true, onClick: () => { app.go('play', { mode: 'chapter', ref: chNum }); } },
    ],
  });
  return dlg;
}

/** 课程详情：星级条件、练习、阅读、清除记录。 */
export function lessonSheet(app, id) {
  const { course, state } = app;
  const l = course.lesson(id);
  const s = statusOf(course, state, id);
  const r = state.skills[id];
  const next = r ? nextStarInfo(r) : null;
  const lines = [];
  if (s === 'locked') {
    lines.push(h('p', t('sheet.lockedHint')));
    lines.push(h('ul', l.prereqs.map(p => h('li', course.lesson(p).title + ' (' + t('chapter.n', { n: course.lesson(p).ch }) + ')'))));
  } else {
    lines.push(h('p.muted', l.summary));
    if (r && r.hist.length) {
      const recent = r.hist.slice(-6);
      lines.push(h('p', t('sheet.recent', { ft: recent.filter(x => x.ft).length, n: recent.length }), ' · ', t('sheet.solved', { n: r.solved })));
      if (r.fastest) lines.push(h('p.muted.small', t('sheet.fastest', { s: fmtTime(r.fastest / 1000) })));
    } else {
      lines.push(h('p.muted', t('sheet.noRecord')));
    }
    if (r && r.mastered) {
      lines.push(h('div', stars(r.stars), next ? h('p.muted.small', t('sheet.nextStar', { n: next }) + ' ' + t('sheet.star' + next, { days: STAR_GAP_MS / 864e5 })) : h('p.muted.small', t('sheet.allStars'))));
    } else if (s !== 'locked') {
      lines.push(h('p.muted.small', t('sheet.masteryRule')));
    }
  }
  const actions = [{ label: t('common.close') }];
  if (r && (r.hist.length || r.mastered)) {
    actions.unshift({
      label: t('sheet.reset'), danger: true,
      onClick: () => {
        confirmDialog({ title: t('sheet.reset'), body: t('sheet.resetBody', { n: course.descendants(id).length }), ok: t('sheet.reset'), cancel: t('common.cancel'), danger: true })
          .then(ok => { if (ok) { resetSkill(course, state, id); app.store.save(); toast(t('sheet.resetDone')); app.current?.refresh?.(); } });
        return false;
      },
    });
  }
  if (s !== 'locked') actions.push({ label: t('sheet.practice'), primary: true, onClick: () => { app.go('play', { mode: 'practice', ref: id }); } });
  else actions.push({ label: t('sheet.playChapter'), primary: true, onClick: () => { app.go('play', { mode: 'chapter', ref: l.ch }); } });
  return modal(h('div.sheet', lines, h('div.sheet-links', readLink(app, t('sheet.read'), course.readerLink(l.ch, l.exercises[0]?.refAnchor)))),
    { title: `${statusIcon(s)} ${l.title}`, actions });
}
