// 播放器：?ch=ch05[&lang=en] → 读 ../ch05/{script,durations}.json 和 scenes.js，暴露 window.renderFrame(n)（纯函数）。
import { buildTimeline, FPS } from './timeline.js';
import { ctx, W, H, P, background, chrome, subtitle, defaultTitle, setLang } from './core.js';
const qs = new URLSearchParams(location.search), ch = qs.get('ch'), lang = qs.get('lang') || 'zh', sfx = lang === 'zh' ? '' : `.${lang}`;
setLang(lang);
const [script, dur, mod] = await Promise.all([
  fetch(`../${ch}/script${sfx}.json`).then((r) => r.json()), fetch(`../${ch}/durations${sfx}.json`).then((r) => r.json()), import(`../${ch}/scenes${sfx}.js`),
]);
const TL = buildTimeline(script, dur);
const { meta, scenes } = mod;
for (const s of TL.scenes) if (!scenes[s.id] && s.id !== 'title') console.error(`[scene missing] ${s.id}`);
window.renderFrame = (n) => {
  const t = n / FPS;
  let si = TL.scenes.findIndex((s) => t >= s.start && t < s.start + s.dur);
  if (si < 0) si = TL.scenes.length - 1;
  const sc = TL.scenes[si], lt = t - sc.start, last = si === TL.scenes.length - 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  background(t);
  if (si > 0) chrome(si, TL.scenes.length, meta);
  ctx.save();
  ctx.globalAlpha = last ? P(lt, 0, 0.45) * (1 - P(lt, sc.dur - 1.2, sc.dur)) : Math.min(P(lt, 0, 0.45), 1 - P(lt, sc.dur - 0.4, sc.dur));
  (scenes[sc.id] || (si === 0 ? (l) => defaultTitle(l, meta) : () => {}))(lt, sc.dur, sc);
  ctx.restore();
  ctx.save(); subtitle(sc, lt); ctx.restore();
};
window.__ready = true;
