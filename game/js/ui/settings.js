// 设置：语言、题数、声音、动效、连击计时、备份、演示、清空。

import { h, clear, toast, confirmDialog, modal } from '../dom.js';
import { t } from '../i18n.js';
import { applySettings } from '../app.js';

export function mount(root, app) {
  const s = app.settings;
  const save = () => { applySettings(); app.store.save(); };

  const seg = (key, options, onChange) => {
    const wrap = h('div.seg', { role: 'radiogroup' });
    const draw = () => {
      clear(wrap);
      const cur = key === 'lang' ? (s.lang || app.lang) : s[key];
      for (const [val, label] of options) {
        wrap.append(h('button.seg-btn' + (cur === val ? '.on' : ''), { role: 'radio', 'aria-checked': cur === val ? 'true' : 'false', onclick: async () => {
          s[key] = val;
          if (onChange) await onChange(val);
          save(); draw();
        } }, label));
      }
    };
    draw();
    return wrap;
  };
  const row = (label, hint, control) => h('div.set-row', h('div.set-label', h('b', label), hint ? h('span.muted.small', hint) : null), control);

  const vol = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s.volume, 'aria-label': t('set.volume'), oninput: e => { s.volume = Number(e.target.value); app.audio.setVolume(s.volume); }, onchange: () => { app.store.save(); app.sfx('correct', 3); } });
  const fileIn = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: onImport });
  const soundBtn = h('button.seg-btn', { role: 'switch' });
  const drawSound = () => { soundBtn.textContent = s.sound ? t('set.on') : t('set.off'); soundBtn.classList.toggle('on', s.sound); soundBtn.setAttribute('aria-checked', String(s.sound)); };
  soundBtn.onclick = () => { s.sound = !s.sound; save(); drawSound(); if (s.sound) app.sfx('tap'); };
  drawSound();
  const autoBtn = h('button.seg-btn', { role: 'switch' });
  const drawAuto = () => { autoBtn.textContent = s.autoNext ? t('set.on') : t('set.off'); autoBtn.classList.toggle('on', s.autoNext); autoBtn.setAttribute('aria-checked', String(s.autoNext)); };
  autoBtn.onclick = () => { s.autoNext = !s.autoNext; save(); drawAuto(); };
  drawAuto();

  function exportData() {
    const blob = new Blob([app.store.export()], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `arch-dopa-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  async function onImport(e) {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const ok = await confirmDialog({ title: t('set.import'), body: t('set.importBody'), ok: t('set.import'), cancel: t('common.cancel'), danger: true });
    if (!ok) return;
    try {
      app.store.import(await f.text());
      toast(t('set.importDone'), { kind: 'good' });
      applySettings();
      app.go('title');
    } catch {
      toast(t('set.importFail'), { kind: 'bad' });
    }
  }
  async function reset() {
    const ok = await confirmDialog({ title: t('set.reset'), body: t('set.resetBody'), ok: t('set.reset'), cancel: t('common.cancel'), danger: true });
    if (!ok) return;
    app.store.reset();
    applySettings();
    toast(t('set.resetDone'));
    app.go('title');
  }

  root.append(
    h('header.top', h('button.icon-btn', { 'aria-label': t('common.back'), onclick: () => app.go('title'), 'data-autofocus': true }, '←'), h('h1.page-title', t('nav.settings'))),
    h('div.settings',
      row(t('set.lang'), null, seg('lang', [['zh', '中文'], ['en', 'English']], async v => { await app.setLang(v); app.go('settings'); })),
      row(t('set.count'), t('set.countHint'), seg('count', [[6, '6'], [10, '10'], [14, '14']])),
      row(t('set.sound'), null, soundBtn),
      row(t('set.volume'), null, vol),
      row(t('set.motion'), t('set.motionHint'), seg('motion', [[0, t('set.motion0')], [1, t('set.motion1')], [2, t('set.motion2')]], () => { app.state.seen.motionChosen = true; })),
      row(t('set.pace'), t('set.paceHint'), seg('pace', [['normal', t('set.pace.normal')], ['relaxed', t('set.pace.relaxed')], ['off', t('set.pace.off')]])),
      row(t('set.autoNext'), t('set.autoNextHint'), autoBtn),
      row(t('set.demo'), t('set.demoHint'), h('button.btn.small', { onclick: () => app.go('play', { demo: true }) }, t('set.demoBtn'))),
      row(t('set.backup'), t('set.backupHint'), h('div.row', h('button.btn.small', { onclick: exportData }, t('set.export')), h('button.btn.small', { onclick: () => fileIn.click() }, t('set.import')), fileIn)),
      row(t('set.reset'), t('set.resetHint'), h('button.btn.small.danger', { onclick: reset }, t('set.reset')))),
    h('section.card.about',
      h('h3', t('about.title')),
      h('p', t('about.body')),
      h('p.muted.small', t('about.credit'), ' ', h('a', { href: 'https://github.com/grmchn/dopa-drill', target: '_blank', rel: 'noopener' }, 'grmchn/dopa-drill'), ' · MIT'),
      h('p.muted.small', t('about.privacy'))));
  app.bg.setStage(1);
}
