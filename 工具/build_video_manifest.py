#!/usr/bin/env python3
"""生成 App 内置的视频清单 Content/videos.json，并把免费章节（第 1 章）的视频拷进包里。

    python3 工具/build_video_manifest.py

读取 动画讲解/dist/v1/{zh,en}/manifest.json（由 `node 动画讲解/lib/pack.mjs <lang>` 生成），
语言目录不存在就跳过。输出：
  iOS/SystemDesignQuest/Resources/Content/videos.json
  iOS/SystemDesignQuest/Resources/Content/videos/{lang}/chNN.mp4   （只含 free 章节）

注意：工具/build_app_content.py 会整个删掉并重建 Content/，跑完它之后要重新跑本脚本。
"""
from __future__ import annotations

import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / '动画讲解' / 'dist'
OUT = ROOT / 'iOS' / 'SystemDesignQuest' / 'Resources' / 'Content'
LANGS = ['zh', 'en']          # zh 为基准语言，必须存在
FREE_CHAPTERS = {1}           # 免费章节：视频随 App 打包


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    versions = sorted(p.name for p in DIST.iterdir() if p.is_dir()) if DIST.exists() else []
    if not versions:
        print('找不到 动画讲解/dist/<version>/', file=sys.stderr)
        return 1
    version = versions[-1]
    manifests: dict[str, dict] = {}
    for lang in LANGS:
        path = DIST / version / lang / 'manifest.json'
        if path.exists():
            manifests[lang] = json.loads(path.read_text())
        else:
            print(f'跳过 {lang}：{path.relative_to(ROOT)} 不存在')
    if 'zh' not in manifests:
        print('缺少 zh 清单', file=sys.stderr)
        return 1

    chapters: dict[int, dict] = {}
    bundled_dir = OUT / 'videos'
    if bundled_dir.exists():
        shutil.rmtree(bundled_dir)
    for lang, manifest in manifests.items():
        for v in manifest['videos']:
            n = v['chapter']
            src = DIST / version / lang / v['file']
            if not src.exists():
                print(f'警告：{src.relative_to(ROOT)} 缺失，跳过', file=sys.stderr)
                continue
            if src.stat().st_size != v['bytes'] or sha256(src) != v['sha256']:
                print(f'错误：{src.relative_to(ROOT)} 与清单的字节数或 sha256 不符，请重新打包', file=sys.stderr)
                return 1
            entry = chapters.setdefault(n, {'chapter': n, 'free': n in FREE_CHAPTERS, 'titles': {}, 'files': {}})
            title = v['title'] if lang == 'zh' else v.get('en') or v['title']
            entry['titles'][lang] = title
            bundled = entry['free']
            entry['files'][lang] = {
                'file': v['file'],
                'bytes': v['bytes'],
                'sha256': v['sha256'],
                'durationSec': round(v['durationSec'], 1),
                'bundled': bundled,
            }
            if bundled:
                dst = bundled_dir / lang / v['file']
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)

    OUT.mkdir(parents=True, exist_ok=True)
    doc = {'version': version, 'chapters': [chapters[n] for n in sorted(chapters)]}
    (OUT / 'videos.json').write_text(json.dumps(doc, ensure_ascii=False, indent=1, sort_keys=True) + '\n')
    langs = ','.join(manifests)
    free = sum(1 for c in chapters.values() if c['free'])
    print(f'已生成 videos.json：版本 {version}，{len(chapters)} 章，语言 {langs}，打包 {free} 章')
    return 0


if __name__ == '__main__':
    sys.exit(main())
