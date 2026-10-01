// usage: node 动画讲解/lib/make.mjs chXX [--lang en] [--voice ...]   一键：旁白 → 时间轴 → 旁白混音 → 渲染成片
import { execFileSync } from 'node:child_process';
import { ROOT } from './serve.mjs';
import { takeLang } from './paths.mjs';
const [ch, ...rest] = process.argv.slice(2);
const lang = takeLang(rest), L = ['--lang', lang];
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', cwd: ROOT });
run('node', ['lib/tts.mjs', ch, ...L, ...rest]);
run('node', ['lib/dump.mjs', ch, ...L]);
run('.venv/bin/python', ['lib/audio.py', ch, lang]);
run('node', ['lib/render.mjs', ch, ...L]);
