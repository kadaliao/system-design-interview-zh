// usage: node lib/index-gen.mjs → 动画讲解/index.html（可搜索、点击即播的章节视频索引；视频用相对路径引用）
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT } from './serve.mjs';
const rows = [];
for (const ch of readdirSync(ROOT).filter((d) => /^ch\d\d$/.test(d)).sort()) {
  const out = `${ROOT}/${ch}/out`; if (!existsSync(out)) continue;
  const f = readdirSync(out).find((x) => x.endsWith('.mp4') && !x.startsWith('preview')); if (!f) continue;
  const m = readFileSync(`${ROOT}/${ch}/scenes.js`, 'utf8').match(/export const meta\s*=\s*\{([^}]*)\}/)[1];
  const title = (m.match(/title:\s*'([^']+)'/) || [])[1], en = (m.match(/en:\s*'([^']+)'/) || [])[1] || '';
  const script = JSON.parse(readFileSync(`${ROOT}/${ch}/script.json`, 'utf8'));
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${out}/${f}`]).toString();
  rows.push({ no: +ch.slice(2), title, en, dur, mb: statSync(`${out}/${f}`).size / 1048576, scenes: script.length, src: `${ch}/out/${encodeURIComponent(f)}`, text: script.map((s) => s.text).join(' ') });
}
const total = rows.reduce((a, r) => a + r.dur, 0);
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>系统设计 动画讲解</title>
<style>
:root{--bg:#07090f;--card:#0f1320;--line:#232a40;--ink:#eef1fa;--mute:#8f98b0;--acc:#8b8dfc;--acc2:#34d5c8}
@media (prefers-color-scheme:light){:root{--bg:#f6f7fb;--card:#fff;--line:#dfe3ee;--ink:#161a2a;--mute:#5d667e;--acc:#5b5ee8;--acc2:#0e9f94}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 "PingFang SC","Helvetica Neue",sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:32px 16px 80px}h1{font-size:30px;margin:0 0 4px}.sub{color:var(--mute);margin-bottom:20px}
input{width:100%;padding:12px 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);font-size:16px;outline:none}input:focus{border-color:var(--acc)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px;margin-top:18px}
.c{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px;cursor:pointer;transition:.15s}.c:hover{border-color:var(--acc);transform:translateY(-2px)}
.no{font:600 13px ui-monospace,Menlo,monospace;color:var(--acc2);letter-spacing:.1em}.t{font-size:20px;font-weight:700;margin:4px 0 2px}.en{color:var(--mute);font-size:13px}.meta{margin-top:10px;color:var(--mute);font-size:13px}
dialog{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:16px;padding:12px;width:min(1000px,96vw)}dialog::backdrop{background:#000a}video{width:100%;border-radius:10px;background:#000}
.bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}button{background:none;border:1px solid var(--line);color:var(--ink);border-radius:8px;padding:4px 12px;cursor:pointer}
.empty{color:var(--mute);margin-top:30px;text-align:center}
</style></head><body><div class="wrap"><h1>系统设计 · 动画讲解</h1>
<div class="sub">${rows.length} 支视频 · 合计 ${Math.round(total / 60)} 分钟 · 搜章节名或旁白里的词（如「幂等」「Raft」「令牌桶」）</div>
<input id="q" placeholder="搜索…" autofocus><div class="grid" id="g"></div><div class="empty" id="e" hidden>没有匹配的章节</div></div>
<dialog id="d"><div class="bar"><b id="dt"></b><button onclick="d.close()">关闭</button></div><video id="v" controls></video></dialog>
<script>
const R=${JSON.stringify(rows)};const g=document.getElementById('g'),q=document.getElementById('q'),d=document.getElementById('d'),v=document.getElementById('v');
const fmt=s=>Math.floor(s/60)+' 分 '+String(Math.round(s%60)).padStart(2,'0')+' 秒';
function draw(){const k=q.value.trim().toLowerCase();const L=R.filter(r=>!k||(r.title+r.en+r.no+r.text).toLowerCase().includes(k));
g.innerHTML=L.map(r=>'<div class="c" data-i="'+r.no+'"><div class="no">CH '+String(r.no).padStart(2,'0')+'</div><div class="t">'+r.title+'</div><div class="en">'+r.en+'</div><div class="meta">'+fmt(r.dur)+' · '+r.scenes+' 个场景 · '+r.mb.toFixed(0)+' MB</div></div>').join('');
document.getElementById('e').hidden=L.length>0}
g.onclick=e=>{const c=e.target.closest('.c');if(!c)return;const r=R.find(x=>x.no==c.dataset.i);dt.textContent='第 '+r.no+' 章 · '+r.title;v.src=r.src;d.showModal();v.play()};
d.onclose=()=>{v.pause();v.removeAttribute('src')};q.oninput=draw;draw();
</script></body></html>`;
writeFileSync(`${ROOT}/index.html`, html); console.log('index.html', rows.length, 'videos');
