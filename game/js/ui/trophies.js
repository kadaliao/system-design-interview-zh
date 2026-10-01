// 成就页：按分类浏览，显示进度和「快要获得」。

import { h, clear, modal } from '../dom.js';
import { t, fmtDate } from '../i18n.js';
import { TROPHIES, CATEGORIES, valueOf, targetOf, almostThere } from '../trophies.js';
import { metricsOf } from '../metrics.js';
import { trophyTitle, RANK_ICON } from './common.js';

export function mount(root, app) {
  let cat = 'all';
  let filter = 'all';
  const list = h('div.tr-list');
  const tabs = h('div.tabs');
  const filters = h('div.tabs.small');

  function render() {
    const { state, course } = app;
    const m = metricsOf(state, course);
    const earned = Object.keys(state.trophies).length;
    clear(tabs); clear(filters); clear(list);
    for (const c of ['all', ...CATEGORIES]) tabs.append(h('button.tab' + (cat === c ? '.on' : ''), { onclick: () => { cat = c; render(); } }, t('trcat.' + c)));
    for (const f of ['all', 'got', 'todo']) filters.append(h('button.tab' + (filter === f ? '.on' : ''), { onclick: () => { filter = f; render(); } }, t('trf.' + f)));

    if (cat === 'all' && filter !== 'got') {
      const soon = almostThere(state, course, 12);
      if (soon.length) list.append(h('section.card', h('h3', t('tr.soon')), soon.map(s => progressRow(trophyTitle(s.def), s.v, s.t, s.def.rank))));
    }
    const visible = TROPHIES.filter(d => (cat === 'all' || d.cat === cat) && (filter === 'all' || (filter === 'got') === !!state.trophies[d.id]));
    // 同系列合并成一张卡
    const groups = new Map();
    for (const d of visible) (groups.get(d.series) || groups.set(d.series, []).get(d.series)).push(d);
    if (cat === 'chapter') {
      list.append(h('div.chapter-badges', visible.map(d => h('div.badge' + (state.trophies[d.id] ? '.got' : ''), { title: trophyTitle(d) }, h('span', d.series === 'chClear' ? '🏁' : '▶'), h('b', d.n)))));
    } else {
      for (const [series, defs] of groups) {
        const all = TROPHIES.filter(d => d.series === series);
        const gotN = all.filter(d => state.trophies[d.id]).length;
        const next = all.find(d => !state.trophies[d.id]);
        const head = next || all[all.length - 1];
        const secret = head.secret && !state.trophies[head.id];
        list.append(h('button.tr-card' + (gotN === all.length ? '.full' : ''), { onclick: () => seriesDialog(app, all, m) },
          h('span.tr-ico', secret ? RANK_ICON.secret : RANK_ICON[gotN ? all[Math.max(0, gotN - 1)].rank : head.rank]),
          h('span.tr-main',
            h('strong', secret ? t('tr.secretName') : trophyTitle(head)),
            next && !next.secret ? h('span.bar', h('i', { style: { width: Math.min(100, (valueOf(next, state, course, m) / targetOf(next)) * 100) + '%' } })) : null),
          h('span.tr-count', `${gotN}/${all.length}`)));
      }
      if (!visible.length) list.append(h('p.muted', t('tr.empty')));
    }
    head.textContent = t('tr.total', { n: earned, total: TROPHIES.length });
  }
  const head = h('p.muted.center');
  root.append(
    h('header.top', h('button.icon-btn', { 'aria-label': t('common.back'), onclick: () => app.go('title'), 'data-autofocus': true }, '←'), h('h1.page-title', t('nav.trophies'))),
    head, tabs, filters, list);
  app.bg.setStage(1);
  render();
}

function progressRow(title, v, target, rank) {
  return h('div.prow', h('span', RANK_ICON[rank], ' ', title), h('span.bar', h('i', { style: { width: Math.min(100, (v / target) * 100) + '%' } })), h('span.muted.small', `${Math.min(v, target)}/${target}`));
}

function seriesDialog(app, defs, m) {
  const { state, course } = app;
  modal(h('ul.series-levels', defs.map(d => {
    const got = state.trophies[d.id];
    const secret = d.secret && !got;
    return h('li' + (got ? '.got' : ''),
      h('span', got ? RANK_ICON[d.rank] : '○'),
      h('span.grow', secret ? t('tr.secretName') : trophyTitle(d)),
      got ? h('span.muted.small', fmtDate(got)) : (!d.secret ? h('span.muted.small', `${Math.min(valueOf(d, state, course, m), targetOf(d))}/${targetOf(d)}`) : null));
  })), { title: trophyTitle(defs.find(d => !state.trophies[d.id]) || defs[defs.length - 1]), actions: [{ label: t('common.close'), primary: true }] });
}
