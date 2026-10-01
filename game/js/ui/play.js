// 游玩页：出题、判定、连击、演出。流程和数值都在 session.js，这里只负责把事件画出来、播出来。

import { h, clear, confirmDialog, modal, toast, rich, vibrate, put, $, $$ } from '../dom.js';
import { t } from '../i18n.js';
import { buildPlan } from '../select.js';
import { createSession } from '../session.js';
import { applyQuestion, commitBasic, commitExtra, commitAbort, enterExtraBump } from '../progress.js';
import { claimReward, } from '../quests.js';
import { compareWithPast } from '../growth.js';
import { formatDopa, fmtTime, MAX_STAGE } from '../core.js';
import { targetSeconds } from '../scoring.js';
import { mascotIn, rewardsDialog, questText } from './common.js';
import { renderBasic, renderFinal } from './result.js';
import { PALETTE } from '../fx.js';

export function mount(root, app, params) {
  const demo = !!params.demo;
  // 演示用存档副本：玩的过程不写进真实记录
  let state = app.state;
  if (demo) {
    state = structuredClone(app.state);
    state.placementDone = true;
    state.review = [];
  }
  const { course } = app;
  const mode = demo ? 'chapter' : params.mode;
  const ref = demo ? 1 + Math.floor(Math.random() * 28) : params.ref;
  const plan = buildPlan({ course, state, mode, ref, n: app.settings.count });
  if (!plan.n || (mode === 'review' && !plan.list.length)) { app.go('title'); return () => {}; }
  const session = createSession({
    plan, n: plan.n, lang: app.lang, pace: app.settings.pace,
    labels: { judgeTrue: t('judge.true'), judgeFalse: t('judge.false') },
  });

  let disposed = false;
  let entry = null;           // 这次游玩的历史条目
  let lastEx = null;
  const skillEvents = [];
  const questsDone = [];
  let combo = 0;
  let idleTimer = null;
  let demoTimers = [];
  let hintTimer = null;
  const startedAt = performance.now();

  // ---- DOM ----
  const dopaEl = h('b.dopa-val', '1');
  const comboEl = h('div.combo');
  const comboBar = h('div.combo-bar', h('i'));
  const clockEl = h('span.clock', '0:00');
  const progEl = h('div.prog');
  const scoreEl = h('span.score');
  const cardEl = h('div.qcard');
  const mascotSlot = h('div.mascot-slot.small');
  const muteBtn = h('button.icon-btn', { 'aria-label': t('play.mute'), onclick: toggleMute }, app.settings.sound ? '🔊' : '🔇');
  const quitBtn = h('button.icon-btn', { 'aria-label': t('play.quit'), onclick: askQuit }, '✕');
  const finishBtn = h('button.btn.small', { onclick: () => finishExtra() }, t('play.finishExtra'));
  finishBtn.hidden = true;
  const title = h('span.play-title', modeTitle());

  root.append(
    h('div.play',
      h('div.hud',
        quitBtn, h('div.hud-mid', title, progEl), h('div.hud-right', clockEl, muteBtn)),
      h('div.dopa-row',
        h('div.dopa', h('span.dopa-label', t('play.dopa')), dopaEl),
        h('div.combo-wrap', comboEl, comboBar),
        scoreEl, finishBtn),
      h('div.stage-area', mascotSlot, cardEl)));

  const mascot = mascotIn(mascotSlot, app, { stage: 0, mood: 'idle' });

  function modeTitle() {
    if (demo) return t('play.demo');
    if (plan.placement) return t('play.placement');
    if (mode === 'self') return t('title.mylevel');
    if (mode === 'chapter') return `${t('chapter.n', { n: ref })} ${course.chapters.get(ref).title}`;
    if (mode === 'practice') return course.lesson(ref).title;
    return t('play.review');
  }

  // ---- 演出分级 ----
  function setStage(n) {
    app.audio.setStage(n);
    app.bg.setStage(n);
    app.fx.setStage(n);
    mascot.setStage(n);
    restMood();
  }
  const restMood = () => mascot.setMood(session.stage >= 6 ? 'dance' : 'idle');
  function mood(m, ms = 900) {
    mascot.setMood(m);
    clearTimeout(mood.t);
    mood.t = setTimeout(restMood, ms);
  }

  // ---- 进度显示 ----
  function renderProgress() {
    clear(progEl);
    if (session.phase === 'extra') {
      progEl.append(h('span.extra-tag', t('play.extraN', { n: session.extraDone + 1 })));
      return;
    }
    for (let i = 0; i < session.n; i++) {
      progEl.append(h('i' + (i < session.qDone ? '.done' : i === session.qIndex ? '.cur' : '')));
    }
  }
  function renderScore() {
    scoreEl.textContent = session.phase === 'extra' ? t('play.score', { n: session.score() + nextExtraPoints() }) : '';
  }
  const nextExtraPoints = () => 0;
  function renderDopa(bump) {
    dopaEl.textContent = formatDopa(session.L, app.lang);
    if (bump) { dopaEl.classList.remove('pop'); void dopaEl.offsetWidth; dopaEl.classList.add('pop'); }
  }
  function renderCombo() {
    comboEl.classList.toggle('on', session.combo >= 2);
    comboEl.textContent = session.combo >= 20 ? t('play.comboMax') : session.combo >= 2 ? t('play.combo', { n: session.combo }) : '';
    comboEl.classList.toggle('max', session.combo >= 20);
  }

  // ---- 题目渲染 ----
  let els = {};
  function showQuestion() {
    const r = session.round;
    const ex = session.ex;
    lastEx = ex;
    els = {};
    clear(cardEl);
    cardEl.className = 'qcard t-' + r.type;
    cardEl.append(
      h('div.q-meta',
        h('span.q-type', t('type.' + r.type)),
        ex.capsule ? h('span.q-capsule', t('play.capsule')) : null,
        r.type === 'multi' ? h('span.q-hint', t('play.multiHint', { n: r.cells })) : null),
      h('p.q-prompt', rich(ex.prompt)),
      renderBody(r),
      h('div.q-feedback', { hidden: true }));
    renderProgress();
    renderScore();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => mascot.setMood('think'), 9000);
    if (demo) scheduleDemo();
  }

  function renderBody(r) {
    const v = r.view;
    switch (r.type) {
      case 'single': case 'multi': case 'judge':
        return h('div.opts' + (r.type === 'judge' ? '.judge' : ''), v.options.map((o, i) => {
          const b = h('button.opt', { dataset: { opt: o.id }, onclick: () => input({ opt: o.id }) },
            r.type === 'judge' ? null : h('span.key', i + 1), h('span.txt', rich(o.text)));
          els['o' + o.id] = b;
          return b;
        }));
      case 'fill': {
        const text = h('p.fill-text', v.segs.map(sg => {
          if (sg.t !== undefined) return rich(sg.t);
          const b = h('span.blank', { dataset: { slot: sg.blank } });
          els['b' + sg.blank] = b;
          return b;
        }));
        const chips = h('div.chips-row', v.chips.map(c => {
          const b = h('button.chip-btn', { dataset: { chip: c.id }, onclick: () => input({ chip: c.id }) }, c.text);
          els['c' + c.id] = b;
          return b;
        }));
        return h('div', text, chips);
      }
      case 'order': {
        const slots = h('ol.order-slots', v.items.map((_, i) => { const s = h('li.slot', h('span.n', i + 1)); els['s' + i] = s; return s; }));
        const pool = h('div.order-pool', v.items.map(it => {
          const b = h('button.item-btn', { dataset: { item: it.id }, onclick: () => input({ item: it.id }) }, rich(it.text));
          els['i' + it.id] = b;
          return b;
        }));
        return h('div', h('p.muted.small', t('play.orderHint')), slots, pool);
      }
      case 'match': {
        const col = (side, list) => h('div.col', list.map(it => {
          const b = h('button.match-btn', { dataset: { side, id: it.id }, onclick: () => input({ side, id: it.id }) }, rich(it.text));
          els[side + it.id] = b;
          return b;
        }));
        return h('div.match', col('L', v.left), col('R', v.right));
      }
    }
    return null;
  }

  // ---- 输入 ----
  let busy = false;
  function input(tok) {
    if (disposed || !session.round || session.round.done || busy) return;
    clearTimeout(hintTimer);
    $$('.hint', cardEl).forEach(e => e.classList.remove('hint'));
    const events = session.input(tok, performance.now());
    for (const ev of events) handle(ev, tok);
    syncMatchSel();
  }

  function syncMatchSel() {
    const r = session.round;
    if (!r || r.type !== 'match') return;
    for (const k of Object.keys(els)) if (/^[LR]\d/.test(k)) els[k].classList.toggle('sel', !!(r.view.selected && r.view.selected.side + r.view.selected.id === k));
  }

  function centerOf(el) {
    const b = (el || cardEl).getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height / 2];
  }

  function handle(ev, tok) {
    switch (ev.type) {
      case 'select': app.sfx('tap'); break;
      case 'miss': onMiss(ev, tok); break;
      case 'correct': onCorrect(ev, tok); break;
      case 'questionDone': onQuestionDone(ev); break;
      case 'timeout': onTimeout(ev); break;
    }
  }

  function onMiss(ev, tok) {
    app.sfx('miss');
    app.audio.duck(500, 0.35);
    vibrate(30);
    mood('oops', 1100);
    renderCombo();
    if (ev.brokenFrom >= 5) comboLost(ev.brokenFrom);
    const r = session.round;
    let el;
    if (r.type === 'match') {
      const a = els['L' + ev.left], b = els['R' + ev.right];
      [a, b].forEach(x => x && x.classList.add('bad-flash'));
      setTimeout(() => [a, b].forEach(x => x && x.classList.remove('bad-flash')), 450);
      el = b;
    } else if (r.type === 'order') {
      el = els['i' + ev.id];
      el.classList.add('bad-flash');
      setTimeout(() => el.classList.remove('bad-flash'), 450);
    } else if (r.type === 'fill') {
      el = els['c' + ev.id];
      el.classList.add('bad');
      el.disabled = true;
    } else {
      el = els['o' + ev.id];
      el.classList.add('bad');
      el.disabled = true;
    }
    app.fx.shake(el, 0.5);
    if (ev.cellMisses >= 2) {
      hintTimer = setTimeout(showHint, 350);
    }
  }

  function showHint() {
    const r = session.round;
    if (!r || r.done) return;
    const tok = r.hintToken();
    if (!tok) return;
    const el = tok.opt !== undefined ? els['o' + tok.opt] : tok.chip !== undefined ? els['c' + tok.chip] : tok.item !== undefined ? els['i' + tok.item] : els[tok.side + tok.id];
    el && el.classList.add('hint');
  }

  function onCorrect(ev, tok) {
    const r = session.round;
    let el;
    if (r.type === 'match') {
      const a = els['L' + ev.id], b = els['R' + ev.id];
      const c = 'matched c' + (ev.cell % 5);
      [a, b].forEach(x => { x.classList.remove('sel'); x.classList.add(...c.split(' ')); x.disabled = true; });
      el = b;
    } else if (r.type === 'order') {
      el = els['i' + ev.id];
      el.classList.add('used');
      el.disabled = true;
      const slot = els['s' + (ev.cell - 1)];
      slot.classList.add('filled');
      slot.append(rich(r.ex.items[ev.cell - 1]));
    } else if (r.type === 'fill') {
      el = els['c' + ev.id];
      el.classList.add('used');
      el.disabled = true;
      const blank = els['b' + ev.slot];
      blank.textContent = r.view.blanks[ev.slot];
      blank.classList.add('filled');
    } else {
      el = els['o' + ev.id];
      el.classList.add('ok');
      el.disabled = true;
    }
    combo = ev.combo;
    app.sfx('correct', ev.combo);
    app.sfx('tap');
    const [x, y] = centerOf(el);
    app.fx.burst(x, y, { color: PALETTE[ev.combo % PALETTE.length], count: 10 + Math.min(30, ev.combo), power: 0.8 + Math.min(1, ev.combo / 30) });
    if (ev.combo >= 2) app.fx.floatText(x, y - 20, `×${ev.combo}`, { color: PALETTE[ev.combo % PALETTE.length] });
    app.bg.pulse(Math.min(1, 0.3 + ev.combo / 25));
    mood(ev.combo >= 10 ? 'cheer' : 'happy', 700);
    renderDopa(true);
    renderCombo();
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => mascot.setMood('think'), 9000);

    if (ev.stageUp) { setStage(ev.stage); app.sfx('milestone', 'stage'); app.fx.milestone('stage'); mood('wow', 1300); }
    if (ev.comboMilestone) { app.sfx('milestone', ev.comboMilestone); app.fx.milestone(ev.comboMilestone); mood('wow', 1300); }
    for (const k of ev.dopaMilestones) { app.sfx('milestone', k); app.fx.milestone(k); mood('wow', 1500); toast(t('play.dopaMilestone', { v: formatDopa(session.L, app.lang) }), { kind: 'good' }); }
  }

  function comboLost(n) {
    const [x, y] = centerOf(comboEl);
    app.fx.floatText(x, y + 10, t('play.comboLost', { n }), { color: '#a78bfa' });
  }

  function onTimeout(ev) {
    renderCombo();
    if (ev.brokenFrom >= 5) comboLost(ev.brokenFrom);
  }

  function onQuestionDone(ev) {
    app.sfx('questionDone');
    clearTimeout(idleTimer);
    const out = applyQuestion(state, course, ev, { mode, phase: ev.extra ? 'extra' : 'basic', placement: plan.placement, now: Date.now() });
    if (!demo) {
      skillEvents.push({ lesson: ev.lesson, ...out });
      for (const q of out.quests || []) { questsDone.push(q); app.sfx('unlock'); toast(t('play.questDone', { q: questText(app, q) }), { kind: 'good' }); }
      app.store.save();
    }
    renderProgress();
    renderScore();
    showFeedback(ev);
  }

  function showFeedback(ev) {
    const ex = ev.ex;
    const box = $('.q-feedback', cardEl);
    clear(box);
    const next = h('button.btn.primary', { id: 'btn-next', onclick: next_ }, session.phase === 'basic' && session.qIndex + 1 >= session.n ? t('play.toResult') : t('play.next'));
    put(box,
      h('div.fb-head' + (ev.ft ? '.perfect' : ''), ev.ft ? t('play.firstTry') : t('play.almost', { n: ev.misses })),
      ev.extra ? h('div.fb-points', t('play.plus', { n: ev.points })) : null,
      h('p.fb-text', rich(ex.explanation)),
      h('div.fb-actions',
        h('a.link', { href: course.readerLink(ex.ch, ex.refAnchor), target: '_blank', rel: 'noopener', onclick: () => { if (!demo) { app.state.stats.reads++; app.store.save(); } } }, t('play.source'), ' ↗'),
        next));
    box.hidden = false;
    box.scrollIntoView({ block: 'nearest', behavior: Number(document.body.dataset.motion) ? 'smooth' : 'auto' });
    next.focus({ preventScroll: true });
    if (app.settings.autoNext && ev.ft && !demo) {
      const id = lastEx.id;
      setTimeout(() => { if (!disposed && session.round && session.round.done && lastEx.id === id && !modalOpen()) next_(); }, 1600);
    }
    if (demo) demoTimers.push(setTimeout(next_, 1100));
  }

  const modalOpen = () => document.body.classList.contains('has-modal');

  function next_() {
    if (disposed || !session.round || !session.round.done) return;
    const res = session.advance(performance.now());
    if (!res) return;
    if (res.type === 'question') showQuestion();
    else if (res.type === 'basicDone') finishBasic();
    else if (res.type === 'ended') finishExtra();
  }

  // ---- 结果 ----
  function finishBasic() {
    clearInterval(tick);
    const out = commitBasic(state, course, session, plan, Date.now());
    entry = out.entry;
    for (const q of out.quests) { questsDone.push(q); }
    const reward = demo ? null : claimReward(state);
    const growth = demo ? [] : compareWithPast(state, entry);
    const rewards = demo ? { trophies: [], items: [] } : app.checkRewards();
    if (!demo) app.store.save();
    app.sfx('complete');
    app.fx.milestone('stage');
    mascot.setMood('cheer');
    app.bg.pulse(1);
    renderProgress();
    clear(cardEl);
    cardEl.className = 'qcard result';
    renderBasic(cardEl, app, {
      session, plan, entry, skillEvents, growth, questsDone, reward, demo,
      onExtra: () => {
        const ex = session.enterExtra(performance.now());
        if (!ex) return;
        enterExtraBump(state);
        app.store.save();
        finishBtn.hidden = false;
        title.textContent = t('play.extra');
        app.sfx('milestone', 'stage');
        combo = 0;
        renderCombo();
        startTick();
        showQuestion();
      },
      onAgain: () => app.go('play', { mode, ref }),
      onHome: () => app.go('title'),
    });
    if (demo) demoTimers.push(setTimeout(() => (session.canExtra() ? $('#btn-extra')?.click() : app.go('title')), 2600));
    else if (rewards.trophies.length || rewards.items.length) setTimeout(() => rewardsDialog(app, rewards), 1200);
  }

  function finishExtra() {
    if (session.phase === 'ended' && cardEl.classList.contains('final')) return;
    clearInterval(tick);
    session.finish();
    commitExtra(state, session, entry);
    const rewards = demo ? { trophies: [], items: [] } : app.checkRewards();
    if (!demo) app.store.save();
    app.sfx('finale');
    app.fx.milestone('dopa1000');
    finishBtn.hidden = true;
    mascot.setMood('cheer');
    renderScore();
    clear(cardEl);
    cardEl.className = 'qcard result final';
    renderFinal(cardEl, app, {
      session, plan, entry, demo,
      onAgain: () => app.go('play', { mode, ref }),
      onHome: () => app.go('title'),
    });
    if (demo) demoTimers.push(setTimeout(() => app.go('title'), 3000));
    else if (rewards.trophies.length || rewards.items.length) setTimeout(() => rewardsDialog(app, rewards), 1200);
  }

  // ---- 计时 ----
  let tick = null;
  function startTick() {
    clearInterval(tick);
    tick = setInterval(() => {
      if (disposed || document.hidden) return;
      const now = performance.now();
      for (const ev of session.tick(now)) handle(ev);
      if (session.phase === 'basic') {
        const sec = (now - session.startedAt - session.paused) / 1000;
        clockEl.textContent = fmtTime(sec);
        clockEl.classList.toggle('over', sec > targetSeconds(session.n));
      }
      const i = comboBar.firstChild;
      if (session.combo >= 2 && session.deadline !== Infinity && session.cellTotal) {
        const ratio = Math.max(0, Math.min(1, (session.deadline - now) / session.cellTotal));
        i.style.transform = `scaleX(${ratio})`;
        comboBar.classList.toggle('low', ratio < 0.3);
        comboBar.classList.add('on');
      } else {
        comboBar.classList.remove('on', 'low');
      }
    }, 100);
  }

  // ---- 暂停/退出 ----
  const onVis = () => { if (document.hidden) session.pause(performance.now()); else session.resume(performance.now()); };
  document.addEventListener('visibilitychange', onVis);

  async function askQuit() {
    if (demo) return endDemo();
    if (session.phase === 'basicDone' || session.phase === 'ended') return dispose(() => app.go('title'));
    session.pause(performance.now());
    const ok = await confirmDialog({ title: t('play.quitTitle'), body: t('play.quitBody'), ok: t('play.quitOk'), cancel: t('common.cancel'), danger: true });
    session.resume(performance.now());
    if (ok) { commitAbort(state, session); app.store.save(); app.go('title'); }
  }

  function toggleMute() {
    app.settings.sound = !app.settings.sound;
    app.audio.setMuted(!app.settings.sound);
    muteBtn.textContent = app.settings.sound ? '🔊' : '🔇';
    app.store.save();
  }

  function dispose(cb) { cb && cb(); }

  // ---- 键盘 ----
  const onKey = e => {
    if (modalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (demo) { if (performance.now() - startedAt > 600) endDemo(); return; }
    const r = session.round;
    if (e.key === 'Escape') { askQuit(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && r && r.done) {
      const btn = $('#btn-next');
      if (btn && document.activeElement !== btn) { e.preventDefault(); btn.click(); }
      return;
    }
    if (r && !r.done && /^[1-9]$/.test(e.key) && (r.type === 'single' || r.type === 'multi')) {
      const o = r.view.options[Number(e.key) - 1];
      if (o) input({ opt: o.id });
    }
    if (r && !r.done && r.type === 'judge' && (e.key === 'y' || e.key === 'n' || e.key === 't' || e.key === 'f')) input({ opt: e.key === 'y' || e.key === 't' ? 1 : 0 });
  };
  addEventListener('keydown', onKey);

  // ---- 演示（自动游玩）----
  let demoWrong = Math.floor(session.n * 0.2);
  function endDemo() { app.go('title'); }
  function wrongToken(r) {
    const ex = r.ex;
    if (r.type === 'single') return { opt: r.view.options.find(o => o.id !== ex.answer).id };
    if (r.type === 'judge') return { opt: ex.answer ? 0 : 1 };
    if (r.type === 'multi') return { opt: r.view.options.find(o => !ex.answers.includes(o.id)).id };
    if (r.type === 'fill') { const c = r.view.chips.find(c => !ex.text.includes(`[[${c.text}]]`)); return c ? { chip: c.id } : null; }
    if (r.type === 'order') { const w = ex.items[r.accepted]; const it = r.view.items.find(i => ex.items[i.id] !== w && !r.acceptedIds.has(i.id)); return it ? { item: it.id } : null; }
    return null;
  }
  function scheduleDemo() {
    const r = session.round;
    let wrong = session.phase === 'basic' && demoWrong > 0 && Math.random() < 0.3 && wrongToken(r);
    if (wrong) demoWrong--;
    let delay = 900;
    const step = () => {
      if (disposed || !session.round || session.round.done) return;
      if (wrong) { input(wrong); wrong = null; } else input(session.round.hintToken());
      if (!session.round.done) demoTimers.push(setTimeout(step, 650 + Math.random() * 350));
    };
    demoTimers.push(setTimeout(step, delay));
    if (session.phase === 'extra' && session.extraDone >= 7) demoTimers.push(setTimeout(finishExtra, 2200));
  }

  // ---- 启动 ----
  app.bg.setStage(0);
  app.fx.setStage(0);
  setStage(0);
  app.audio.startMusic();
  session.start(performance.now());
  renderDopa(false);
  renderCombo();
  startTick();
  showQuestion();
  if (demo) setTimeout(() => addEventListener('pointerdown', endDemo, { once: true }), 650);

  return () => {
    disposed = true;
    clearInterval(tick);
    clearTimeout(idleTimer);
    clearTimeout(hintTimer);
    demoTimers.forEach(clearTimeout);
    document.removeEventListener('visibilitychange', onVis);
    removeEventListener('keydown', onKey);
    removeEventListener('pointerdown', endDemo);
    mascot.destroy();
    app.audio.stopMusic(500);
    app.fx.clear();
  };
}
