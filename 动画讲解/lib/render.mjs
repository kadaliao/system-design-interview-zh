// usage: node 动画讲解/lib/render.mjs chXX [--lang en] [--from 秒] [--to 秒] [--workers 4] [--encode-only]
// 逐帧渲染 + 混入旁白 → chXX/out/<标题>.mp4。全局最多 2 个渲染并行（目录锁），避免多 agent 同时渲染把机器压垮。
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync, unlinkSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { serve, ROOT } from './serve.mjs';
import { buildTimeline, FPS } from './timeline.js';
import { takeLang, chapterPaths, metaOf } from './paths.mjs';
const [ch, ...a] = process.argv.slice(2), opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const lang = takeLang(a), PA = chapterPaths(ch, lang);
const B = PA.build; mkdirSync(B, { recursive: true }); mkdirSync(PA.out, { recursive: true });
const script = JSON.parse(readFileSync(PA.script, 'utf8')), dur = JSON.parse(readFileSync(PA.durations, 'utf8'));
const TL = buildTimeline(script, dur); writeFileSync(`${B}/timeline.json`, JSON.stringify(TL, null, 1));
const from = +opt('--from', 0), to = Math.min(TL.total, +opt('--to', TL.total)), workers = +opt('--workers', 4);
const partial = from > 0 || to < TL.total;
const title = metaOf(PA.scenes, readFileSync).title || ch;
const out = `${PA.out}/${partial ? `preview-${from}-${to}` : `${ch}-${title}`}.mp4`;
const dir = `${B}/frames`; mkdirSync(dir, { recursive: true });
const f0 = Math.round(from * FPS), f1 = Math.round(to * FPS);
if (!a.includes('--encode-only')) {
  if (!partial) for (const f of readdirSync(dir)) if (f.endsWith('.jpg')) unlinkSync(`${dir}/${f}`);
  // 取锁（最多 2 个槽位）
  let slot = null; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  while (slot === null) { for (const k of [0, 1]) { try { mkdirSync(`${tmpdir()}/sd-anim-render-${k}.lock`); slot = k; break; } catch {} } if (slot === null) await sleep(2000 + Math.random() * 2000); }
  const release = () => rmSync(`${tmpdir()}/sd-anim-render-${slot}.lock`, { recursive: true, force: true });
  process.on('exit', release); process.on('SIGINT', () => process.exit(1)); process.on('SIGTERM', () => process.exit(1));
  try {
    const srv = await serve(), br = await chromium.launch(), t0 = Date.now(); let done = 0;
    const worker = async (k) => {
      const pg = await br.newPage({ viewport: { width: 1920, height: 1080 } });
      pg.on('pageerror', (e) => console.error('[pageerror]', e.message));
      await pg.goto(`http://127.0.0.1:${srv.address().port}/lib/index.html?ch=${ch}&lang=${lang}`); await pg.waitForFunction(() => window.__ready === true, null, { timeout: 400000 });
      for (let i = f0 + k; i < f1; i += workers) {
        await pg.evaluate((n) => window.renderFrame(n), i);
        writeFileSync(`${dir}/${String(i).padStart(5, '0')}.jpg`, await pg.screenshot({ type: 'jpeg', quality: 94 }));
        if (++done % 600 === 0) console.log(`${done}/${f1 - f0}  ${(done / ((Date.now() - t0) / 1000)).toFixed(1)} fps`);
      }
    };
    await Promise.all(Array.from({ length: workers }, (_, k) => worker(k))); await br.close(); srv.close();
  } finally { release(); }
}
const args = ['-v', 'error', '-y', '-framerate', String(FPS), '-start_number', String(f0), '-i', `${dir}/%05d.jpg`];
if (existsSync(`${B}/audio/mix.wav`)) args.push('-ss', String(from), '-t', String(to - from), '-i', `${B}/audio/mix.wav`, '-c:a', 'aac', '-b:a', '256k');
args.push('-vf', 'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
  '-profile:v', 'high', '-r', String(FPS), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-shortest', '-movflags', '+faststart', out);
execFileSync('ffmpeg', args, { stdio: 'inherit' }); console.log('video:', out);
