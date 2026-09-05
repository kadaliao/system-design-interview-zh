#!/usr/bin/env python3
"""只读验证中文版：目录、源图字节、引用、SVG与原文未改动；可输出报告。"""
from pathlib import Path
from urllib.parse import unquote, urlsplit
import re,json,hashlib,subprocess,sys,xml.etree.ElementTree as ET

zh=Path(__file__).resolve().parents[1]; root=zh.parent
errors=[]; stats=[]
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def refs(text):
    return re.findall(r'!?\[[^\]\n]*\]\(([^\n]*?)\)',text)+re.findall(r'(?:src|href)=[\"\x27]([^\"\x27]+)',text)
def clean(link):
    return unquote(link.strip().strip('<>').split(' "',1)[0]).split('#')[0]
def exact(p):
    p=p.resolve()
    if not p.exists(): return False
    # macOS默认大小写不敏感，逐级检查拼写，以便在Linux/GitHub可用。
    for n in [p,*list(p.parents)[:-1]]:
        if n.name not in [x.name for x in n.parent.iterdir()]: return False
    return True
source_files={}
for src in sorted(root.iterdir()):
    if not src.is_dir() or not re.match(r'^\d{2}\. ',src.name):continue
    dst=zh/src.name
    original=next(src.glob('*.md'))
    docs=list(dst.glob('*.md')) if dst.exists() else []
    if len(docs)!=1:
        errors.append(f'{src.name}: 需要一个章节文档，实际{len(docs)}');continue
    p=docs[0]; s=p.read_text(); original_s=original.read_text()
    originals=list((src/'images').glob('*')) if (src/'images').exists() else []
    for f in originals:
        if not f.is_file():continue
        copy=dst/'images'/f.name
        if not copy.is_file() or sha(copy)!=sha(f):errors.append(f'原图复制不一致: {copy.relative_to(zh)}')
    orig_refs={Path(clean(r)).name for r in refs(original_s) if '/images/' in r or r.startswith('images/')}
    dst_refs={Path(clean(r)).name for r in refs(s) if '/images/' in r or r.startswith('images/')}
    missing=sorted(orig_refs-dst_refs)
    if missing:errors.append(f'{src.name}: 原图未引用 {missing}')
    new_svgs=[f for f in (dst/'images').glob('*.svg') if not (src/'images'/f.name).exists()]
    if not new_svgs:errors.append(f'{src.name}: 缺少新增SVG')
    if '批注' not in s:errors.append(f'{src.name}: 缺少批注标记')
    stats.append({'chapter':src.name,'markdown':p.name,'original_lines':len(original_s.splitlines()),'translated_lines':len(s.splitlines()),'original_figures':len(orig_refs),'copied_images':len(originals),'new_svg':len(new_svgs)})
    for f in src.rglob('*'):
        if f.is_file():source_files[str(f.relative_to(root))]=sha(f)
for p in zh.rglob('*.md'):
    for r in refs(p.read_text()):
        r=r.strip()
        if r.startswith(('#','http:','https:','mailto:','data:')): continue
        rel=clean(r)
        if not rel:continue
        target=p.parent/rel
        if not exact(target):errors.append(f'本地引用不存在或大小写不符: {p.relative_to(zh)} -> {r}')
for p in zh.rglob('*.svg'):
    try:ET.parse(p)
    except ET.ParseError as e:errors.append(f'SVG语法: {p.relative_to(zh)}: {e}')
# 逐个检查源目录和根README，避免依赖平台的路径排除规则。
paths=[s['chapter'] for s in stats]+[p.name for p in root.glob('*.md')]
r=subprocess.run(['git','diff','--exit-code','HEAD','--',*paths],cwd=root,capture_output=True,text=True)
if r.returncode:errors.append('原版追踪文件相对HEAD有改动，请检查git diff')
if len(stats)!=28:errors.append(f'章节数应为28，实际{len(stats)}')
supplementary=[]
source_names={x['chapter'] for x in stats}
for d in sorted(zh.iterdir()):
    if not d.is_dir() or not re.match(r'^\d{2}\. ',d.name) or d.name in source_names:continue
    docs=list(d.glob('*.md'));svgs=list((d/'images').glob('*.svg'))
    if len(docs)!=1:errors.append(f'{d.name}: 新增章节需一个正文文档')
    if not svgs:errors.append(f'{d.name}: 新增章节缺少SVG')
    supplementary.append({'chapter':d.name,'new_svg':len(svgs)})
fingerprint=zh/'校验/原版文件指纹.json'
if fingerprint.exists():
    baseline=json.loads(fingerprint.read_text())
    if baseline!=source_files:errors.append('原版文件与已有SHA-256基线不一致')
report={'chapter_count':len(stats)+len(supplementary),'source_chapter_count':len(stats),'supplementary_chapter_count':len(supplementary),'supplementary':supplementary,'original_references':sum(x['original_figures'] for x in stats),'copied_images':sum(x['copied_images'] for x in stats),'new_chapter_svg':sum(x['new_svg'] for x in stats+supplementary),'original_git_diff_empty':r.returncode==0,'chapters':stats,'errors':errors}
if '--write' in sys.argv:
    (zh/'校验').mkdir(exist_ok=True)
    (zh/'校验/结构校验.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    if not fingerprint.exists():(zh/'校验/原版文件指纹.json').write_text(json.dumps(source_files,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
raise SystemExit(bool(errors))
