#!/usr/bin/env python3
"""从各章 Markdown 的实验占位块生成 交互实验/README.md 中的实验清单，并检查每个占位块都有对应的实验定义。"""
from pathlib import Path
from urllib.parse import quote
import re, sys

root = Path(__file__).resolve().parents[1]
readme = root / '交互实验' / 'README.md'
block = re.compile(r'<div class="sd-lab" id="lab-([^"]+)" data-lab="([^"]+)">\s*<p><strong>交互实验：(.+?)</strong>。(.*?)<a href', re.S)
defined = set()
for js in (root / '交互实验' / 'labs').glob('*.js'):
    defined |= set(re.findall(r"""SDLab\.define\(\{\s*id:\s*['"]([^'"]+)['"]""", js.read_text()))

rows, errors, seen = [], [], set()
for d in sorted(p for p in root.iterdir() if p.is_dir() and re.match(r'^\d{2}\. ', p.name)):
    md = next(d.glob('*.md'))
    n = int(d.name[:2])
    title = re.search(r'^# (.+)$', md.read_text(), re.M).group(1)
    short = re.sub(r'^第 \d+ 章：', '', title).split('（')[0]
    for anchor, lab, name, desc in block.findall(md.read_text()):
        if anchor != lab: errors.append(f'{md.relative_to(root)}: id 与 data-lab 不一致 {anchor} / {lab}')
        if lab in seen: errors.append(f'重复的实验 ID：{lab}')
        if lab not in defined: errors.append(f'{md.relative_to(root)}: 没有找到实验定义 {lab}')
        seen.add(lab)
        link = '../' + quote(d.name) + '/' + quote(md.name) + '#lab-' + lab
        rows.append(f'| {n} · {short} | [{name}]({link}) | {desc.strip()} |')
for lab in sorted(defined - seen):
    errors.append(f'实验已定义但正文没有占位块：{lab}')

table = '| 章节 | 实验 | 你会看到 |\n|---|---|---|\n' + '\n'.join(rows)
text = readme.read_text()
start, end = '<!-- 实验清单：由 工具/build_lab_index.py 生成 -->', '<!-- 实验清单结束 -->'
new = re.sub(re.escape(start) + r'.*?' + re.escape(end), start + '\n\n' + table + '\n\n' + end, text, flags=re.S)
if new == text and start not in text:
    errors.append('README 缺少实验清单标记')
elif '--write' in sys.argv:
    readme.write_text(new)
print(f'{len(rows)} 个实验，覆盖 {len({r.split(" |")[0] for r in rows})} 章')
for e in errors: print('错误：', e)
raise SystemExit(bool(errors))
