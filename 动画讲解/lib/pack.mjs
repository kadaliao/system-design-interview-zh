// usage: node lib/pack.mjs <lang> [ch01 ch05 ...] [--crf 28] [--jobs 3]   不给章节则处理全部；源片读不了（还在渲染）的会被跳过
// 把各章成片压成 App 内播放版：H.264 720p、mono AAC 64k、faststart → dist/v1/<lang>/chNN.mp4，并写 manifest.json（时长、字节数、sha256）。
// 已存在且比源片新的文件会跳过；换了 CRF 请先删 dist 对应目录。
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync, mkdirSync, createReadStream } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT } from './serve.mjs';
import { chapterPaths, metaOf } from './paths.mjs';
const [lang = 'zh', ...a] = process.argv.slice(2);
const opt = (k, d) => (a.includes(k) ? a[a.indexOf(k) + 1] : d);
const crf = opt('--crf', '28'), jobs = +opt('--jobs', 3), VERSION = 'v1';
const dir = `${ROOT}/dist/${VERSION}/${lang}`; mkdirSync(dir, { recursive: true });
const only = a.filter((x) => /^ch\d\d$/.test(x));
const chs = readdirSync(ROOT).filter((d) => /^ch\d\d$/.test(d) && (!only.length || only.includes(d))).sort();
const readable = (f) => { try { execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f], { stdio: 'pipe' }); return true; } catch { return false; } };
const srcOf = (ch) => { const o = chapterPaths(ch, lang).out; const f = existsSync(o) && readdirSync(o).find((x) => x.endsWith('.mp4') && !x.startsWith('preview')); return f ? `${o}/${f}` : null; };
const enc = (src, dst) => new Promise((res, rej) => {
  const p = spawn('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', crf, '-profile:v', 'high',
    '-pix_fmt', 'yuv420p', '-tune', 'animation', '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', '-f', 'mp4', dst + '.part'], { stdio: 'inherit' });
  p.on('exit', (c) => (c === 0 ? res() : rej(new Error(`ffmpeg ${c}`))));
}).then(() => execFileSync('mv', [dst + '.part', dst]));
const sha = (f) => new Promise((res) => { const h = createHash('sha256'); createReadStream(f).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))); });
const queue = chs.filter((ch) => { const f = srcOf(ch); if (f && !readable(f)) { console.log(`跳过 ${ch}：源片还没写完`); return false; } return !!f; }); let done = 0;
async function worker() {
  while (queue.length) {
    const ch = queue.shift(), src = srcOf(ch), dst = `${dir}/${ch}.mp4`;
    if (!existsSync(dst) || statSync(dst).mtimeMs < statSync(src).mtimeMs) await enc(src, dst);
    console.log(`${++done}/${chs.length} ${ch} ${(statSync(dst).size / 1048576).toFixed(2)} MB`);
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
const videos = [];
for (const ch of chs) {
  const f = `${dir}/${ch}.mp4`; if (!existsSync(f)) continue;
  const mt = metaOf(chapterPaths(ch, lang).scenes, readFileSync);
  videos.push({
    chapter: +ch.slice(2), title: mt.title, en: mt.en,
    file: `${ch}.mp4`, durationSec: +(+execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString()).toFixed(1),
    bytes: statSync(f).size, sha256: await sha(f),
  });
}
writeFileSync(`${dir}/manifest.json`, JSON.stringify({ version: VERSION, lang, crf: +crf, videos }, null, 1));
const tot = videos.reduce((s, v) => s + v.bytes, 0), mins = videos.reduce((s, v) => s + v.durationSec, 0) / 60;
console.log(`完成：${videos.length} 支，${mins.toFixed(1)} 分钟，${(tot / 1048576).toFixed(1)} MB，manifest → ${dir}/manifest.json`);
