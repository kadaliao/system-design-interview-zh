// usage: node 动画讲解/lib/dump.mjs chXX [--lang en] → chXX/build/timeline.json（audio.py 读它）
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { ROOT } from './serve.mjs';
import { buildTimeline } from './timeline.js';
import { takeLang, chapterPaths } from './paths.mjs';
const a = process.argv.slice(2), lang = takeLang(a), ch = a[0], PA = chapterPaths(ch, lang);
const tl = buildTimeline(JSON.parse(readFileSync(PA.script, 'utf8')), JSON.parse(readFileSync(PA.durations, 'utf8')));
mkdirSync(PA.build, { recursive: true }); writeFileSync(`${PA.build}/timeline.json`, JSON.stringify(tl, null, 1));
console.log(tl.scenes.map((s) => `${s.id.padEnd(10)} ${s.start.toFixed(1).padStart(6)}s +${s.dur.toFixed(1)}`).join('\n'), `\n总长 ${tl.total.toFixed(1)}s`);
