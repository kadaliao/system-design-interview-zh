// 日历：每天的最高得分和游玩次数，连续记录、登录贴纸、补签锤。

import { h, clear, modal } from '../dom.js';
import { t, fmtDate, getLang } from '../i18n.js';
import { dayKey, addDays, keyToTs } from '../core.js';
import { currentStreak, longestStreak, playDaysCount, HAMMER_MAX } from '../streak.js';
import { questList } from './common.js';
import { ensureToday } from '../quests.js';

const SEAL_ICON = { star: '⭐', heart: '💖', flower: '🌸', note: '🎵', clover: '🍀', check: '💮', crown: '👑' };

export function mount(root, app) {
  const today = dayKey();
  const [ty, tm] = today.split('-').map(Number);
  let y = ty, m = tm;
  const grid = h('div.cal-grid');
  const title = h('h2.cal-title');
  const prev = h('button.icon-btn', { 'aria-label': t('cal.prev'), onclick: () => { m--; if (m < 1) { m = 12; y--; } render(); } }, '‹');
  const next = h('button.icon-btn', { 'aria-label': t('cal.next'), onclick: () => { m++; if (m > 12) { m = 1; y++; } render(); } }, '›');

  function render() {
    const { state } = app;
    clear(grid);
    title.textContent = new Date(y, m - 1, 1).toLocaleDateString(getLang() === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long' });
    next.disabled = y === ty && m === tm;
    const first = new Date(y, m - 1, 1).getDay();
    const days = new Date(y, m, 0).getDate();
    for (const w of t('cal.weekdays').split(',')) grid.append(h('div.cal-wd', w));
    for (let i = 0; i < first; i++) grid.append(h('div.cal-cell.empty'));
    for (let d = 1; d <= days; d++) {
      const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const rec = state.days[key];
      const seal = state.login.seals[key];
      const nc = state.nocount.includes(key);
      const future = key > today;
      grid.append(h('button.cal-cell' + (rec && rec.plays ? '.played' : '') + (key === today ? '.today' : '') + (nc ? '.nocount' : ''), {
        disabled: future, onclick: () => dayDialog(app, key), 'aria-label': key,
      },
        h('span.d', d),
        rec && rec.plays ? h('b.best', rec.best) : nc ? h('span.stamp', '🔨') : null,
        seal ? h('span.seal-mini', SEAL_ICON[seal]) : null,
        rec && rec.q ? h('span.qmark', '🎯') : null));
    }
  }

  const { state } = app;
  ensureToday(state, app.course);
  root.append(
    h('header.top', h('button.icon-btn', { 'aria-label': t('common.back'), onclick: () => app.go('title'), 'data-autofocus': true }, '←'), h('h1.page-title', t('nav.calendar'))),
    h('div.stats.four',
      h('div.stat', h('span.stat-v', '🔥 ' + currentStreak(state, today)), h('span.stat-l', t('cal.streak'))),
      h('div.stat', h('span.stat-v', longestStreak(state)), h('span.stat-l', t('cal.longest'))),
      h('div.stat', h('span.stat-v', playDaysCount(state)), h('span.stat-l', t('cal.playDays'))),
      h('div.stat', h('span.stat-v', `🔨 ${state.hammers}/${HAMMER_MAX}`), h('span.stat-l', t('cal.hammers')))),
    h('p.muted.small.center', t('cal.hammerHelp')),
    h('div.cal-nav', prev, title, next),
    grid,
    h('section.card', h('h3', t('title.quests')), questList(app)),
    h('p.muted.small.center', t('cal.login', { n: state.login.total, c: state.login.crowns })));
  app.bg.setStage(1);
  render();
}

function dayDialog(app, key) {
  const { state } = app;
  const plays = state.history.filter(x => {
    const d = new Date(x.t);
    return dayKey(x.t) === key;
  });
  const rec = state.days[key];
  const nc = state.nocount.includes(key);
  const body = h('div',
    nc ? h('p', '🔨 ' + t('cal.nocount')) : null,
    !plays.length && !nc ? h('p.muted', t('cal.nothing')) : null,
    state.login.seals[key] ? h('p', t('cal.sealDay', { s: SEAL_ICON[state.login.seals[key]] })) : null,
    h('ul.day-plays', plays.map(p => h('li',
      h('b', p.score), ' ', t('cal.playLine', { mode: t('mode.' + p.mode), ft: p.ft, n: p.n, extra: p.extra, combo: p.maxCombo })))));
  modal(body, { title: fmtDate(keyToTs(key), { year: 'numeric', month: 'long', day: 'numeric' }), actions: [{ label: t('common.close'), primary: true }] });
}
