// usage: node 动画讲解/lib/tts.mjs chXX [--lang en] [--force] [--voice ...]
// 逐段合成旁白（edge-tts 女声）→ chXX/build/audio/vo-<id>.mp3，并写 chXX/durations.json
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT } from './serve.mjs';
import { takeLang, chapterPaths } from './paths.mjs';
const [ch, ...a] = process.argv.slice(2);
const lang = takeLang(a), PA = chapterPaths(ch, lang);
const voice = a.includes('--voice') ? a[a.indexOf('--voice') + 1] : PA.voice;
const script = JSON.parse(readFileSync(PA.script, 'utf8'));
mkdirSync(`${PA.build}/audio`, { recursive: true });
const dur = {};
for (const s of script) {
  const f = `${PA.build}/audio/vo-${s.id}.mp3`;
  // 文本变了要重合成：把文本存在旁边的 .txt 里比对
  const txt = f.replace('.mp3', '.txt'); const same = existsSync(txt) && readFileSync(txt, 'utf8') === s.text;
  if (a.includes('--force') || !existsSync(f) || !same) {
    for (let k = 0; k < 3; k++) { try { execFileSync(`${ROOT}/.venv/bin/edge-tts`, ['--voice', voice, '--rate=-4%', '--text', s.text, '--write-media', f], { stdio: 'inherit' }); break; } catch (e) { if (k === 2) throw e; } }
    writeFileSync(txt, s.text);
  }
  dur[s.id] = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim();
}
writeFileSync(PA.durations, JSON.stringify(dur, null, 1));
console.log(voice, `旁白合计 ${Object.values(dur).reduce((x, y) => x + y, 0).toFixed(1)}s`);
