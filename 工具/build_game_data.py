#!/usr/bin/env python3
"""把 iOS 内容包里的题库瘦身成网页游戏用的数据：game/data/course.{zh,en}.json。

    python3 工具/build_game_data.py          生成
    python3 工具/build_game_data.py --check  只校验现有产物是否与内容包同步（不写文件）

数据源是 工具/build_app_content.py 生成的 iOS/SystemDesignQuest/Resources/Content/course{,.en}.json，
所以题库有改动时先跑那个脚本，再跑本脚本。只保留游戏需要的字段（去掉导读图片、口述卡等）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'iOS' / 'SystemDesignQuest' / 'Resources' / 'Content'
OUT = ROOT / 'game' / 'data'
FILES = {'zh': 'course.json', 'en': 'course.en.json'}


def slim(course: dict) -> dict:
    chapters = []
    for ch in course['chapters']:
        chapters.append({
            'n': ch['number'],
            'doc': ch['docID'],
            'title': ch['title'],
            'fullTitle': ch['fullTitle'],
            'keyPoints': ch['keyPoints'],
            'labs': [{'id': l['id'], 'title': l['title']} for l in ch.get('labs', [])],
            'lessons': [{
                'id': l['id'], 'title': l['title'], 'summary': l['summary'],
                'exercises': l['exercises'],
            } for l in ch['lessons']],
        })
    return {
        'version': course['version'],
        'readerURL': course['readerURL'],
        'sections': [{'id': s['id'], 'title': s['title'], 'subtitle': s['subtitle'], 'chapters': s['chapters']}
                     for s in course['sections']],
        'chapters': chapters,
    }


def dump(obj: dict) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + '\n'


def main() -> int:
    check = '--check' in sys.argv[1:]
    bad = False
    for lang, name in FILES.items():
        src = SRC / name
        if not src.exists():
            print(f'找不到 {src}，先运行 工具/build_app_content.py', file=sys.stderr)
            return 1
        text = dump(slim(json.loads(src.read_text('utf-8'))))
        dst = OUT / f'course.{lang}.json'
        if check:
            if not dst.exists() or dst.read_text('utf-8') != text:
                print(f'{dst.relative_to(ROOT)} 已过期')
                bad = True
        else:
            OUT.mkdir(parents=True, exist_ok=True)
            dst.write_text(text, 'utf-8')
            print(f'{dst.relative_to(ROOT)}  {len(text) // 1024} KB')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
