#!/usr/bin/env python3
"""对照独立原题清单检查答案覆盖、来源、锚点与图引用；不代替语义审阅。"""
from pathlib import Path
import json,re,sys,xml.etree.ElementTree as ET
from urllib.parse import unquote
z=Path(__file__).resolve().parents[1]; d=z/'29. 自测题详解'
manifest=json.loads((d/'题目清单.json').read_text());p=d/'README.md'
if not p.exists():raise SystemExit('缺少第29章README.md')
s=p.read_text(); marks=list(re.finditer(r'<a id="((?:q\d{2}|p\d{2}|r)-\d{2})"></a>',s));errors=[];rows=[]
byid={}
for i,m in enumerate(marks):
 key=m.group(1)
 if key in byid:errors.append(f'重复答案锚点: {key}')
 byid[key]=s[m.end():marks[i+1].start() if i+1<len(marks) else len(s)]
norm=lambda t:re.sub(r'[\s`*]','',t)
for q in manifest['questions']:
 src=z/q['source']; source=src.read_text()
 if q['source_excerpt'] not in source:errors.append(f"原题来源已变化: {q['id']}")
 body=byid.get(q['answer_anchor'],'')
 if not body:errors.append(f"缺少答案: {q['id']}")
 heading=re.search(r'^### (.+)$',body,re.M)
 if not heading or norm(q['question']) not in norm(heading.group(1)):errors.append(f"原题未完整复述: {q['id']}")
 prose=re.sub(r'```.*?```','',body,flags=re.S)
 chars=len(re.findall(r'[\u4e00-\u9fff]',prose))
 if chars<180:errors.append(f"答案可能只是占位或过短: {q['id']} ({chars}汉字)")
 rows.append({'id':q['id'],'answer_anchor':q['answer_anchor'],'chinese_characters':chars})
expected={q['answer_anchor'] for q in manifest['questions']}
if set(byid)!=expected:errors.append(f'锚点集合不符: extra={sorted(set(byid)-expected)}, missing={sorted(expected-set(byid))}')
images=re.findall(r'!\[[^\]]*\]\(([^)]+)\)',s)
for image in images:
 path=d/unquote(image)
 if not path.exists():errors.append(f'图片不存在: {image}')
for image in (d/'images').glob('*.svg'):
 try:ET.parse(image)
 except ET.ParseError as e:errors.append(f'SVG语法: {image.name}: {e}')
report={'expected_answers':manifest['total'],'actual_answers':len(byid),'counts':manifest['counts'],'illustration_references':len(images),'unique_illustrations':len(set(images)),'answers':rows,'errors':errors}
if '--write' in sys.argv:(z/'校验/答案覆盖检查.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2));raise SystemExit(bool(errors))
