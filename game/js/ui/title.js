// 首页：我的水平、复习、章节、今日任务、连续记录。

import { h, clear, modal, toast, put } from '../dom.js';
import { t } from '../i18n.js';
import { mascotIn, questList, rewardsDialog, chapterProgress, collectionName } from './common.js';
import { chapterSheet } from './sheets.js';
import { chapterCleared, isMastered, isUnlocked, totalStars, rustySkills } from '../skills.js';
import { currentStreak, loginBonus, hammerOffer, useHammers, declineHammer, SEAL_CYCLE } from '../streak.js';
import { ensureToday, claimReward } from '../quests.js';
import { dayKey, dayDiff } from '../core.js';
import { startGuide } from './guide.js';
import { weeklyGrowth } from '../growth.js';

const SEAL_ICON = { star: '⭐', heart: '💖', flower: '🌸', note: '🎵', clover: '🍀', check: '💮', crown: '👑' };

export function mount(root, app) {
  const { state, course } = app;
  const today = dayKey();
  ensureToday(state, course);
  app.bg.setStage(2);
  app.audio.stopMusic(400);

  const mascotSlot = h('div.mascot-slot');
  const bubble = h('div.bubble');
  const streak = currentStreak(state, today);
  const rusty = rustySkills(state).length;
  const learn = course.ordered.find(l => !isMastered(state, l.id) && isUnlocked(course, state, l.id));
  const done = state.placementDone && !learn;

  const mylevelSub = !state.placementDone ? t('title.placementSub') : done ? t('title.allDone') : t('title.nextUp', { name: learn.title });
  const chips = h('div.chips',
    chip('🔥', t('title.streak', { n: streak }), () => app.go('calendar')),
    chip('⭐', String(totalStars(state)), () => app.go('tree')),
    chip('🔨', String(state.hammers), () => app.go('calendar')),
    chip('🏆', String(Object.keys(state.trophies).length), () => app.go('trophies')));

  const chapterGrid = h('div.sections', course.sections.map(sec => h('section.sec',
    h('h3.sec-title', sec.title, h('span.muted.small', ' ' + sec.subtitle)),
    h('div.ch-grid', sec.chapters.map(n => {
      const ch = course.chapters.get(n);
      const p = chapterProgress(app, n);
      const full = p.mastered === p.total;
      return h('button.ch-tile' + (full ? '.full' : ''), { onclick: () => chapterSheet(app, n), 'aria-label': `${t('chapter.n', { n })} ${ch.title}` },
        h('span.ch-n', n),
        h('span.ch-name', ch.title),
        h('span.ch-dots', Array.from({ length: p.total }, (_, i) => h('i' + (i < p.mastered ? '.on' : '')))));
    })))));

  const questCard = h('section.card.quest-card',
    h('h3', t('title.quests'), h('span.muted.small', ' ' + t('title.questsHint'))),
    questList(app));

  const reviewBtn = state.review.length
    ? h('button.btn.secondary.wide', { onclick: () => app.go('play', { mode: 'review' }) }, t('title.review', { n: state.review.length }))
    : null;

  const nav = h('nav.bottom-nav', { 'aria-label': t('nav.label') },
    navBtn('🌳', t('nav.tree'), () => app.go('tree')),
    navBtn('🏆', t('nav.trophies'), () => app.go('trophies')),
    navBtn('🎁', t('nav.collection'), () => app.go('collection')),
    navBtn('📅', t('nav.calendar'), () => app.go('calendar')),
    navBtn('⚙️', t('nav.settings'), () => app.go('settings')));

  const mylevel = h('button.btn.primary.hero', { id: 'btn-mylevel', 'data-autofocus': true, onclick: () => app.go('play', { mode: 'self' }) },
    h('span.hero-title', t('title.mylevel')), h('span.hero-sub', mylevelSub));

  put(root,
    h('header.top',
      h('h1.logo', t('app.name'), h('small', t('app.tagline'))),
      h('div.top-actions',
        h('button.icon-btn', { id: 'btn-help', 'aria-label': t('title.help'), onclick: () => startGuide(app, true) }, '?'),
        h('button.icon-btn', { 'aria-label': t('nav.settings'), onclick: () => app.go('settings') }, '⚙'))),
    h('div.hero-area', mascotSlot, bubble),
    chips,
    mylevel,
    reviewBtn,
    rusty ? h('p.rust-note', t('title.rusty', { n: rusty })) : null,
    questCard,
    h('h2.section-h', t('title.byChapter')),
    chapterGrid,
    h('footer.foot', h('p', t('title.footer')), h('a', { href: '../', target: '_blank', rel: 'noopener' }, t('title.reader'))),
    nav);

  const mascot = mascotIn(mascotSlot, app, { stage: 2, mood: 'idle' });
  const lines = greeting(app, streak);
  bubble.textContent = lines;
  mascot.setMood(streak >= 3 ? 'happy' : 'idle');
  mascotSlot.addEventListener('click', () => { mascot.bounce(); app.sfx('tap'); mascot.setMood('happy'); setTimeout(() => mascot.setMood('idle'), 900); });

  // 首次进入：引导；其余：登录贴纸、补签锤、新奖励
  setTimeout(() => runStartupFlow(app, mascot), 250);
  return () => { mascot.destroy(); };
}

function chip(icon, text, onClick) {
  return h('button.chip', { onclick: onClick }, h('span', icon), h('b', text));
}
function navBtn(icon, label, onClick) {
  return h('button.nav-btn', { onclick: onClick }, h('span.nav-ico', icon), h('span', label));
}

function greeting(app, streak) {
  const { state } = app;
  if (!state.stats.plays) return t('greet.first');
  if (streak >= 7) return t('greet.streak', { n: streak });
  if (state.review.length >= 5) return t('greet.review');
  const gap = Object.keys(state.days).sort().pop();
  if (gap && dayDiff(dayKey(), gap) >= 3) return t('greet.back');
  const g = weeklyGrowth(state);
  if (g.length) return t('greet.growth');
  return t('greet.default' + (Date.now() % 3));
}

async function runStartupFlow(app, mascot) {
  const { state, course } = app;
  const here = () => app.current && app.current.name === 'title';
  if (!here()) return;
  if (!state.seen.guide) {
    await startGuide(app, false);
    state.seen.guide = true;
    app.store.save();
  }
  const today = dayKey();
  if (!here()) return;
  // 登录贴纸（每天一次；在显示时就算领取）
  const login = loginBonus(state, today);
  if (login.granted) {
    app.store.save();
    await new Promise(res => {
      const row = h('div.seals', SEAL_CYCLE.map((s, i) => h('span.seal' + (i + 1 < login.cycle ? '.had' : i + 1 === login.cycle ? '.now' : ''), SEAL_ICON[s])));
      app.sfx('unlock');
      modal(h('div.login', h('p', t('login.body', { n: login.cycle })), row, login.crown ? h('p.strong', t('login.crown')) : null),
        { title: t('login.title'), onClose: res, actions: [{ label: t('common.ok'), primary: true }] });
    });
  }
  if (!here()) return;
  // 补签锤
  const offer = hammerOffer(state, today);
  if (offer) {
    await new Promise(res => {
      modal(h('p', t('hammer.body', { n: offer.length, have: state.hammers })), {
        title: t('hammer.title'), onClose: res, dismissable: false,
        actions: [
          { label: t('hammer.no'), onClick: () => { declineHammer(state, today); app.store.save(); } },
          { label: t('hammer.use'), primary: true, onClick: () => { useHammers(state, offer); app.store.save(); toast(t('hammer.done')); } },
        ],
      });
    });
  }
  if (!here()) return;
  // 积压的新奖励（例如旧存档第一次判定）
  const r = app.checkRewards();
  await rewardsDialog(app, r);
  app.current?.name === 'title' && app.bg.pulse && app.bg.pulse(0.5);
}
