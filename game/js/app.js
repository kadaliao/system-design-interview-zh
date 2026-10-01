// 应用骨架：存档、题库、音频/特效服务、页面路由。各页面通过 app 访问它们。

import { createStore } from './store.js';
import { loadCourse } from './course.js';
import { setLang, getLang, detectLang, t } from './i18n.js';
import { audio } from './audio.js';
import { createFx } from './fx.js';
import { createBackground } from './bg.js';
import { resolveChoice, checkUnlocks } from './unlocks.js';
import { checkTrophies } from './trophies.js';
import { toast } from './dom.js';
import { clear, $ } from './dom.js';

const SCREENS = {
  title: () => import('./ui/title.js'),
  play: () => import('./ui/play.js'),
  tree: () => import('./ui/tree.js'),
  trophies: () => import('./ui/trophies.js'),
  collection: () => import('./ui/collection.js'),
  calendar: () => import('./ui/calendar.js'),
  settings: () => import('./ui/settings.js'),
};

export const app = {
  store: null,
  course: null,
  lang: 'zh',
  fx: null,
  bg: null,
  audio,
  current: null,
  get state() { return this.store.state; },
  get settings() { return this.store.state.settings; },
};

const motionLevel = () => {
  const m = app.settings.motion;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches && !app.store.state.seen.motionChosen) return 0;
  return m;
};

/** 把设置同步到音频、特效、主题。 */
export function applySettings() {
  const s = app.settings;
  audio.setMuted(!s.sound);
  audio.setVolume(s.volume);
  const lvl = motionLevel();
  app.fx.setMotion(lvl);
  app.bg.setMotion(lvl);
  document.body.dataset.motion = String(lvl);
  const theme = resolveChoice(app.state, 'theme', s.theme, () => 0);
  document.body.dataset.theme = theme;
  app.mascotSkin = resolveChoice(app.state, 'skin', s.skin);
  audio.setStyle(resolveChoice(app.state, 'music', s.music));
}

/** 切页。 */
export async function go(name, params = {}) {
  const root = $('#app');
  if (app.current && app.current.unmount) app.current.unmount();
  app.current = null;
  clear(root);
  window.scrollTo(0, 0);
  const mod = await SCREENS[name]();
  const view = h2(root);
  const mounted = mod.mount(view, app, params);
  app.current = { name, unmount: typeof mounted === 'function' ? mounted : mounted && mounted.unmount, refresh: mounted && mounted.refresh };
  document.body.dataset.screen = name;
  const focus = root.querySelector('[data-autofocus]') || root.querySelector('h1');
  if (focus) { focus.setAttribute('tabindex', '-1'); focus.focus({ preventScroll: true }); }
  location.hash = name === 'title' ? '' : name;
}
const h2 = root => { const d = document.createElement('div'); d.className = 'screen'; root.append(d); return d; };
app.go = go;

/** 检查成就和收藏解锁，并保存。返回 {trophies, items}。 */
app.checkRewards = () => {
  const trophies = checkTrophies(app.state, app.course);
  const items = checkUnlocks(app.state, app.course);
  if (trophies.length || items.length) { app.store.save(); }
  // 解锁项可能影响成就数（收藏类成就），再检一遍
  if (items.length) trophies.push(...checkTrophies(app.state, app.course));
  return { trophies, items };
};

app.sfx = (name, ...args) => { try { audio.sfx[name] && audio.sfx[name](...args); } catch { /* 音频失败不影响游戏 */ } };

app.setLang = async lang => {
  app.settings.lang = lang;
  app.lang = lang;
  setLang(lang);
  document.title = t('app.name');
  app.course = await loadCourse(lang);
  app.store.save();
};

export async function boot() {
  app.store = createStore();
  const st = app.store.state;
  app.lang = st.settings.lang || detectLang();
  setLang(app.lang);
  document.title = t('app.name');

  const fxCanvas = $('#fx');
  const bgCanvas = $('#bg');
  app.fx = createFx(fxCanvas);
  app.bg = createBackground(bgCanvas);
  app.fx.start();
  app.bg.start();
  const onResize = () => { app.fx.resize(); app.bg.resize(); };
  addEventListener('resize', onResize);
  onResize();

  // 浏览器要求音频在手势后才能启动
  const unlockAudio = () => { audio.init(); removeEventListener('pointerdown', unlockAudio, true); removeEventListener('keydown', unlockAudio, true); };
  addEventListener('pointerdown', unlockAudio, true);
  addEventListener('keydown', unlockAudio, true);
  addEventListener('pagehide', () => app.store.flush());
  document.addEventListener('visibilitychange', () => { if (document.hidden) app.store.flush(); });

  try {
    app.course = await loadCourse(app.lang);
  } catch (e) {
    $('#app').textContent = t('app.loadFail') + ' ' + e.message;
    return;
  }
  checkUnlocks(st, app.course);
  applySettings();
  app.bg.setStage(2);
  const hash = location.hash.slice(1);
  await go(['tree', 'trophies', 'collection', 'calendar', 'settings'].includes(hash) ? hash : 'title');
}

export { toast };
