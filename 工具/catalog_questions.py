#!/usr/bin/env python3
"""从答案之外的中文正文提取自测/复盘/追问，生成独立题目清单。"""
from pathlib import Path
import re,json,hashlib
Z=Path(__file__).resolve().parents[1]
items=[]
def chapter(n):
 return next(next(d for d in Z.iterdir() if d.is_dir() and d.name.startswith(f'{n:02}.')).glob('*.md'))
def add(id,p,text,category,excerpt=None):
 lines=p.read_text().splitlines();needle=excerpt or text
 line=next(i+1 for i,l in enumerate(lines) if needle in l)
 items.append({'id':id,'category':category,'source':str(p.relative_to(Z)),'line':line,'question':text,'source_excerpt':needle,'answer_anchor':id.lower()})
for n in range(1,4):
 p=chapter(n); tail=p.read_text().split('自测题',1)[1]
 questions=re.findall(r'^\d+\. (.+)$',tail,re.M)
 for j,q in enumerate(questions,1):add(f'Q{n:02}-{j:02}',p,q,'章末自测')
for n in [4,5,6,7,22,23,24,25]:
 p=chapter(n);s=p.read_text()
 prefix='合上文档，尝试解释：' if n==4 else '合上文档，尝试' if n==5 else '自测：'
 raw=next(l for l in s.splitlines() if l.startswith(prefix));body=raw[len(prefix):]
 if n==5:questions=[x.strip().rstrip('。') for x in body.split('；')]
 else:questions=[re.sub(r'^[①②③④\s]+','',x)+'？' for x in body.split('？') if x.strip()]
 for j,q in enumerate(questions,1):add(f'Q{n:02}-{j:02}',p,q,'章末自测',raw)
p=Z/'术语速查.md';tail=p.read_text().split('## 一分钟复盘法',1)[1]
for j,q in enumerate(re.findall(r'^\d+\. (.+)$',tail,re.M),1):add(f'R-{j:02}',p,q,'通用复盘')
for n,heading,lead in [(27,'### 事件溯源','实际钱包被审计时，需要回答：'),(28,'### 容错','需要回答：')]:
 p=chapter(n);section=p.read_text().split(heading,1)[1].split(lead,1)[1]
 question_lines=[]
 for line in section.strip().splitlines():
  if line.startswith('- ') and '？' in line:question_lines.append(line[2:])
  elif line.strip() and question_lines:break
 for j,q in enumerate(question_lines,1):add(f'P{n}-{j:02}',p,q,'正文追问')
counts={cat:sum(i['category']==cat for i in items) for cat in ['章末自测','通用复盘','正文追问']}
assert counts=={'章末自测':46,'通用复盘':5,'正文追问':7},counts
result={'scope':'28章中文学习版明确标记的章末自测；附通用复盘与钱包/交易所正文追问。第5章三项绘图/解释任务拆为三个条目；不重复计入已作答的C/I需求访谈。','counts':counts,'total':len(items),'questions':items}
p=Z/'29. 自测题详解/题目清单.json';p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'counts':counts,'total':len(items)},ensure_ascii=False))
