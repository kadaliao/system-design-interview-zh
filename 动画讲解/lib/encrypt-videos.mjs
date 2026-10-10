// 把 dist/v1/{zh,en}/chNN.mp4（第 2–28 章）加密成 App 随包的 chNN.sdqv，第 1 章明文复制为 ch01.mp4。
// 用法：node lib/encrypt-videos.mjs   主密钥读自 ~/.sdq/content.key（base64 32 字节，不在仓库里，丢了就解不开已发布的 App）
// 格式：'SDQV' + nonce(12) + AES-256-GCM 密文 + tag(16)；每文件密钥 = HKDF-SHA256(master, salt 'sdq-video-v1', info '{lang}/chNN')，AAD = '{lang}/chNN'
import { createCipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, '..', 'iOS/SystemDesignQuest/Resources/Content/videos');
const master = Buffer.from(readFileSync(join(homedir(), '.sdq/content.key'), 'utf8').trim(), 'base64');
if (master.length !== 32) throw new Error('主密钥必须是 32 字节 base64');
let n = 0, bytes = 0;
for (const lang of ['zh', 'en']) {
  const dir = join(root, 'dist/v1', lang);
  mkdirSync(join(out, lang), { recursive: true });
  for (const old of readdirSync(join(out, lang))) if (old.endsWith('.sdqv')) rmSync(join(out, lang, old));
  for (const f of readdirSync(dir).filter((x) => /^ch\d{2}\.mp4$/.test(x)).sort()) {
    const ch = f.slice(2, 4);
    if (ch === '01') { copyFileSync(join(dir, f), join(out, lang, f)); continue; }
    const id = `${lang}/ch${ch}`;
    const key = Buffer.from(hkdfSync('sha256', master, Buffer.from('sdq-video-v1'), Buffer.from(id), 32));
    const nonce = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', key, nonce);
    c.setAAD(Buffer.from(id));
    const body = Buffer.concat([c.update(readFileSync(join(dir, f))), c.final()]);
    writeFileSync(join(out, lang, `ch${ch}.sdqv`), Buffer.concat([Buffer.from('SDQV'), nonce, body, c.getAuthTag()]));
    n++; bytes += body.length;
  }
}
console.log(`加密 ${n} 个文件，${(bytes / 1048576).toFixed(1)} MB`);
