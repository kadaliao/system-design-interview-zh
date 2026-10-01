// 收藏：音乐、吉祥物皮肤、界面配色。每类可固定一个，或「随机」（从已解锁的里选）。

import { h, clear, toast } from '../dom.js';
import { t } from '../i18n.js';
import { COLLECTION, bareId, progressOfItem } from '../unlocks.js';
import { applySettings } from '../app.js';
import { mascotIn, collectionName } from './common.js';
import { SKINS } from '../mascot.js';

export const THEME_COLORS = {
  night: ['#4cc9f0', '#a78bfa', '#14123a'],
  sakura: ['#ff7aa8', '#ffc2d6', '#2b1230'],
  forest: ['#3ddc97', '#b6f0c8', '#0f2a24'],
  sunset: ['#ffb02e', '#ff6b4a', '#2e1a2a'],
  ink: ['#e8e8f0', '#9aa0b4', '#101114'],
};

export function mount(root, app) {
  const body = h('div.collection');
  let previewing = null;
  const mascots = [];

  function render() {
    mascots.splice(0).forEach(m => m.destroy());
    clear(body);
    const { state, course } = app;
    for (const cat of ['music', 'skin', 'theme']) {
      const items = COLLECTION.filter(i => i.cat === cat);
      const cur = app.settings[cat === 'music' ? 'music' : cat === 'skin' ? 'skin' : 'theme'];
      body.append(h('section.col-sec',
        h('h3', t('col.cat.' + cat), h('span.muted.small', ` ${items.filter(i => state.unlocked[i.id]).length}/${items.length}`)),
        h('div.col-grid',
          h('button.col-item.auto' + (cur === 'auto' ? '.sel' : ''), { onclick: () => choose(cat, 'auto') }, h('span.col-prev', '🎲'), h('b', t('col.auto')), h('span.muted.small', t('col.autoHint'))),
          items.map(it => {
            const b = bareId(it.id);
            const got = !!state.unlocked[it.id];
            const prev = h('span.col-prev');
            if (got && cat === 'skin') mascots.push(mascotIn(prev, { ...app, mascotSkin: b }, { stage: 1, mood: 'idle' }));
            else if (cat === 'theme') prev.append(...THEME_COLORS[b].map(c => h('i', { style: { background: c } })));
            else prev.textContent = got ? '🎵' : '🔒';
            if (!got && cat === 'skin') prev.textContent = '🔒';
            const p = progressOfItem(state, course, it);
            return h('button.col-item' + (cur === b ? '.sel' : '') + (got ? '' : '.locked'), {
              disabled: !got, onclick: () => choose(cat, b), 'aria-pressed': cur === b ? 'true' : 'false',
            },
              prev,
              h('b', collectionName(it.id)),
              got ? (cat === 'music' ? h('span.btn.small', { role: 'button', onclick: e => { e.stopPropagation(); previewMusic(b); } }, '▶ ' + t('col.preview')) : null)
                : h('span.muted.small', t('col.cond.' + it.cond[0], { n: it.cond[1] }), ` (${p.value}/${p.target})`));
          }))));
    }
  }
  function previewMusic(id) {
    app.audio.stopMusic(100);
    app.audio.preview(id, 5, 4000);
    previewing = id;
  }
  function choose(cat, val) {
    app.settings[cat] = val;
    applySettings();
    app.store.save();
    toast(t('col.set', { name: val === 'auto' ? t('col.auto') : collectionName(cat + ':' + val) }));
    render();
  }
  root.append(
    h('header.top', h('button.icon-btn', { 'aria-label': t('common.back'), onclick: () => app.go('title'), 'data-autofocus': true }, '←'), h('h1.page-title', t('nav.collection'))),
    h('p.muted.center', t('col.intro')), body);
  app.bg.setStage(3);
  render();
  return () => { mascots.forEach(m => m.destroy()); if (previewing) app.audio.stopMusic(100); };
}
