// usage: node 动画讲解/lib/still.mjs chXX [--lang en] <秒> [<秒>...] [--sheet out.jpg]   导出静帧（build/stills/），--sheet 拼成总览图（2 列）
// 另：--scene <id> 取该场景内的若干相对时刻：node still.mjs chXX --scene ring 2 5 8
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { serve, ROOT } from './serve.mjs';
import { buildTimeline } from './timeline.js';
import { takeLang, chapterPaths } from './paths.mjs';
const a = process.argv.slice(2), ch = a.shift();
const lang = takeLang(a), PA = chapterPaths(ch, lang);
const take = (k) => { const i = a.indexOf(k); return i >= 0 ? a.splice(i, 2)[1] : null; };
const sheet = take('--sheet'), sceneId = take('--scene');
let ts = a.map(Number);
const TL = buildTimeline(JSON.parse(readFileSync(PA.script, 'utf8')), JSON.parse(readFileSync(PA.durations, 'utf8')));
if (sceneId) { const sc = TL.scenes.find((s) => s.id === sceneId); ts = ts.map((t) => +(sc.start + t).toFixed(2)); }
const D = `${PA.build}/stills`; mkdirSync(D, { recursive: true });
const srv = await serve(), br = await chromium.launch(), pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
pg.on('pageerror', (e) => console.error('[pageerror]', e.message)); pg.on('console', (m) => m.type() === 'error' && console.error(m.text()));
await pg.goto(`http://127.0.0.1:${srv.address().port}/lib/index.html?ch=${ch}&lang=${lang}`);
await pg.waitForFunction(() => window.__ready === true, null, { timeout: 400000 });
const files = [];
for (const t of ts) { await pg.evaluate((n) => window.renderFrame(n), Math.round(t * 30)); const f = `${D}/s${t}.png`; await pg.screenshot({ path: f }); files.push(f); }
await br.close(); srv.close();
if (sheet && files.length === 1) execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', files[0], '-vf', 'scale=1280:720', '-frames:v', '1', `${ROOT}/${ch}/${sheet}`]);
else if (sheet) {
  const cols = 2;
  execFileSync('ffmpeg', ['-v', 'error', '-y', ...files.flatMap((f) => ['-i', f]), '-filter_complex',
    files.map((_, i) => `[${i}:v]scale=960:540[v${i}]`).join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) * 960}_${Math.floor(i / cols) * 540}`).join('|')}`, '-frames:v', '1', `${ROOT}/${ch}/${sheet}`]);
}
console.log(files.join('\n')); if (sheet) console.log('sheet:', `${ROOT}/${ch}/${sheet}`);
