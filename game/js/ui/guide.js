// 首次使用的引导：聚光灯 + 说明卡 + 吉祥物指路。首页的「?」可以随时重看。

import { h } from '../dom.js';
import { t } from '../i18n.js';
import { createMascot } from '../mascot.js';

const PAGES_FIRST = [
  { key: 'intro', target: null },
  { key: 'mylevel', target: '#btn-mylevel' },
  { key: 'chapters', target: '.sections' },
  { key: 'tree', target: '.bottom-nav' },
  { key: 'start', target: '#btn-mylevel' },
];
const PAGES_HELP = [
  { key: 'intro', target: null },
  { key: 'play', target: '.hero-area' },
  { key: 'mylevel', target: '#btn-mylevel' },
  { key: 'chapters', target: '.sections' },
  { key: 'tree', target: '.bottom-nav' },
  { key: 'daily', target: '.quest-card' },
  { key: 'start', target: '#btn-help' },
];

/** 返回在引导结束（完成或跳过）后 resolve 的 Promise。 */
export function startGuide(app, help) {
  const pages = help ? PAGES_HELP : PAGES_FIRST;
  return new Promise(resolve => {
    let i = 0;
    const spot = h('div.guide-spot');
    const mascotBox = h('div.guide-mascot');
    const card = h('div.guide-card', { role: 'dialog', 'aria-modal': 'true', 'aria-live': 'polite' });
    const layer = h('div.guide', spot, mascotBox, card);
    document.body.append(layer);
    document.body.classList.add('has-modal');
    const mascot = createMascot(mascotBox, { skin: app.mascotSkin });
    mascot.setMotion(Number(document.body.dataset.motion ?? 2));

    const finish = () => {
      removeEventListener('keydown', onKey, true);
      removeEventListener('resize', place);
      mascot.destroy();
      layer.remove();
      document.body.classList.remove('has-modal');
      resolve();
    };
    const onKey = e => {
      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); if (i > 0) { i--; render(); } }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(); }
      else if (e.key === 'Tab') {
        const f = [...card.querySelectorAll('button')];
        if (!f.length) return;
        const idx = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(idx + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    };
    const next = () => { if (i >= pages.length - 1) finish(); else { i++; render(); } };

    function place() {
      const p = pages[i];
      const el = p.target && document.querySelector(p.target);
      if (!el) {
        spot.style.cssText = 'left:50%;top:40%;width:0;height:0';
        mascot.pointAt(null);
        mascotBox.style.cssText = '';
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'auto' });
      const b = el.getBoundingClientRect();
      const pad = 8;
      spot.style.cssText = `left:${b.left - pad}px;top:${b.top - pad}px;width:${b.width + pad * 2}px;height:${b.height + pad * 2}px`;
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      mascot.pointAt(cx, cy);
    }

    function render() {
      const p = pages[i];
      card.replaceChildren(
        h('p.guide-step', `${i + 1} / ${pages.length}`),
        h('h2', t('guide.' + p.key + '.title')),
        h('p', t('guide.' + p.key + '.body')),
        h('div.guide-actions',
          h('button.btn.small', { onclick: finish }, t('guide.skip')),
          i > 0 ? h('button.btn.small', { onclick: () => { i--; render(); } }, t('guide.back')) : null,
          h('button.btn.primary.small', { onclick: next }, i === pages.length - 1 ? t('guide.go') : t('guide.next'))));
      mascot.setMood(i === 0 ? 'cheer' : 'happy');
      requestAnimationFrame(place);
      card.querySelector('.primary').focus({ preventScroll: true });
    }
    addEventListener('keydown', onKey, true);
    addEventListener('resize', place);
    render();
  });
}
