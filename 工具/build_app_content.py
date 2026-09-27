#!/usr/bin/env python3
"""校验 练习题库/，并把章节、题库、自测答案和交互实验打包成 iOS App 的内容包。

    python3 工具/build_app_content.py --check [章号 ...]   只校验题库
    python3 工具/build_app_content.py                      校验并生成 iOS/SystemDesignQuest/Resources/Content
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / '练习题库'
OUT = ROOT / 'iOS' / 'SystemDesignQuest' / 'Resources' / 'Content'
LABS_SRC = ROOT / '交互实验'
ANSWERS = ROOT / '29. 自测题详解'
READER_URL = 'https://kadaliao.github.io/system-design-interview-zh/'

# 学习路径的分段：章节必须连续且覆盖 1–28。
SECTIONS = [
    ('起步', '扩展、估算与面试框架', range(1, 4)),
    ('基础积木', '限流、分片、存储与发号', range(4, 8)),
    ('经典系统', '短链、爬虫、通知、Feed、聊天、搜索、视频与网盘', range(8, 16)),
    ('位置与地图', '附近地点、附近好友与地图导航', range(16, 19)),
    ('数据与消息', '消息队列、监控告警与流式聚合', range(19, 22)),
    ('预订与存储', '酒店预订、邮件、对象存储与排行榜', range(22, 26)),
    ('支付与交易', '支付、钱包与交易所', range(26, 29)),
]

LIMITS = {
    'prompt': 120, 'prompt_single': 160, 'option': 40, 'fill_text': 90, 'chip': 12,
    'order_item': 26, 'match_left': 12, 'match_right': 22, 'explanation': 150,
    'keypoint': 70, 'lesson_title': 8, 'lesson_summary': 24,
}
TYPES = {'single', 'multi', 'judge', 'fill', 'order', 'match'}
BLANK = re.compile(r'\[\[(.+?)\]\]')


# ---------------------------------------------------------------- 章节正文

def chapter_dirs() -> dict[int, Path]:
    dirs = {}
    for d in ROOT.iterdir():
        m = re.match(r'^(\d{2})\. ', d.name)
        if d.is_dir() and m and int(m.group(1)) <= 28:
            dirs[int(m.group(1))] = d
    return dict(sorted(dirs.items()))


def chapter_md(d: Path) -> Path:
    return next(p for p in sorted(d.iterdir()) if p.suffix.lower() == '.md')


def plain_inline(md: str) -> str:
    """近似 marked 渲染后去标签的文本，用于生成与阅读页一致的标题锚点。"""
    s = re.sub(r'!\[[^\]]*\]\([^)]*\)', '', md)
    s = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', s)
    s = re.sub(r'<[^>]*>', '', s)
    s = s.replace('**', '').replace('`', '')
    return s.strip()


def slug(text: str) -> str:
    s = text.lower()
    s = re.sub(r'[^\w\s-]', '', s).replace('_', '_')
    return re.sub(r'\s+', '-', s.strip())


def headings(md: str) -> dict[str, str]:
    """标题原文 → 阅读页锚点（与 工具/build-reader.mjs 的 slug 规则一致，重名依次加 -1、-2）。"""
    seen: Counter = Counter()
    result: dict[str, str] = {}
    in_code = False
    for line in md.splitlines():
        if line.startswith('```'):
            in_code = not in_code
        if in_code:
            continue
        m = re.match(r'^(#{1,6})\s+(.+?)\s*#*\s*$', line)
        if not m:
            continue
        text = plain_inline(m.group(2))
        base = slug(text)
        n = seen[base]
        seen[base] += 1
        anchor = base + (f'-{n}' if n else '')
        # 重名标题：第一处用原文，第二处起写成「标题#2」「标题#3」
        k = 1
        while (key := text if k == 1 else f'{text}#{k}') in result:
            k += 1
        result[key] = anchor
    return result


def chapter_titles() -> dict[int, str]:
    titles = {}
    for m in re.finditer(r'^- \[第 (\d+) 章：(.+?)\]\(', (ROOT / 'Readme.md').read_text(), re.M):
        titles[int(m.group(1))] = m.group(2)
    return titles


def inline_md(s: str) -> str:
    """保留粗体、行内代码和链接，去掉 HTML。"""
    s = re.sub(r'<a id="[^"]*"></a>', '', s)
    s = re.sub(r'<br\s*/?>', ' ', s)
    return s.strip()


def intro_of(md: str) -> tuple[list[str], str | None]:
    """章首导读段落，以及导读附近的第一张手绘 SVG。"""
    lines = md.splitlines()
    paras: list[str] = []
    m = re.search(r'^## (中文)?学习导读\s*$', md, re.M)
    if m:
        body = md[m.end():].split('\n## ', 1)[0]
        block: list[str] = []
        for line in body.splitlines() + ['']:
            if line.strip() and not line.startswith('!['):
                block.append(line.lstrip('> ').strip())
            elif block:
                paras.append(' '.join(block))
                block = []
        region = body
    else:
        # 没有导读小节的章：取标题后第一段引用块
        quote: list[list[str]] = [[]]
        started = False
        for line in lines[1:]:
            if line.startswith('>'):
                started = True
                text = line[1:].strip()
                if text:
                    quote[-1].append(text)
                elif quote[-1]:
                    quote.append([])
            elif started:
                break
        paras = [' '.join(p) for p in quote if p]
        second_h2 = [i for i, l in enumerate(lines) if l.startswith('## ')]
        region = '\n'.join(lines[: second_h2[0] if second_h2 else len(lines)])
    skip = ('**原版边界**', '本文按原版', '本文逐节翻译', '本目录是原版')
    paras = [re.sub(r'^\*\*学习导读\*\*：', '', inline_md(p))
             for p in paras if p and not p.startswith(skip) and not p.startswith('<')]
    img = re.search(r'!\[[^\]]*\]\(\./images/([^)]+\.svg)\)', region)
    return paras, (img.group(1) if img else None)


# ---------------------------------------------------------------- 题库校验

class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def err(self, where: str, msg: str) -> None:
        self.errors.append(f'{where}: {msg}')

    def warn(self, where: str, msg: str) -> None:
        self.warnings.append(f'{where}: {msg}')


def visible_len(s: str) -> int:
    return len(s.replace('**', '').replace('`', ''))


def check_text(r: Report, where: str, field: str, value, limit: int | None) -> bool:
    if not isinstance(value, str) or not value.strip():
        r.err(where, f'{field} 必须是非空字符串')
        return False
    if value != value.strip():
        r.err(where, f'{field} 首尾有空白')
    if limit and visible_len(value) > limit:
        r.err(where, f'{field} 长 {visible_len(value)} 字，超过 {limit}：{value[:30]}…')
    if value.count('**') % 2 or value.count('`') % 2:
        r.err(where, f'{field} 的 ** 或 ` 没有成对')
    if re.search(r'!\[|\]\(|^#|<[a-z/]', value):
        r.err(where, f'{field} 含不支持的 Markdown/HTML（只允许 ** 和 `）')
    return True


def check_exercise(r: Report, ex: dict, lesson_id: str, n: int, heads: dict[str, str], card_ids: set[str]) -> None:
    where = ex.get('id', f'{lesson_id}-?') if isinstance(ex, dict) else f'{lesson_id}-?'
    if not isinstance(ex, dict):
        r.err(where, '题目必须是对象')
        return
    if ex.get('id') != f'{lesson_id}-{n:02}' and not re.fullmatch(rf'{lesson_id}-\d{{2}}', str(ex.get('id'))):
        r.err(where, f'编号应形如 {lesson_id}-NN')
    t = ex.get('type')
    if t not in TYPES:
        r.err(where, f'未知题型 {t!r}')
        return
    common = {'id', 'type', 'prompt', 'explanation', 'ref'}
    own = {
        'single': {'options', 'answer'}, 'multi': {'options', 'answers'}, 'judge': {'answer'},
        'fill': {'text', 'distractors'}, 'order': {'items'}, 'match': {'pairs'},
    }[t]
    extra = set(ex) - common - own
    missing = (own | {'prompt', 'explanation'}) - set(ex)
    if extra:
        r.err(where, f'多余字段 {sorted(extra)}')
    if missing:
        r.err(where, f'缺少字段 {sorted(missing)}')
        return
    limit = LIMITS['prompt_single'] if t == 'single' else LIMITS['prompt']
    check_text(r, where, 'prompt', ex['prompt'], limit)
    # 单元测验和练习会跨课抽题，题目不能依赖前后题
    for field in ('prompt', 'text'):
        if isinstance(ex.get(field), str) and re.search(r'接上题|上一题|上题|前一题|下一题', ex[field]):
            r.err(where, f'{field} 引用了其他题目，每题必须单独读得懂')
    check_text(r, where, 'explanation', ex['explanation'], LIMITS['explanation'])
    ref = ex.get('ref')
    if ref is not None:
        if not isinstance(ref, str) or not (ref in heads or ref in card_ids):
            r.err(where, f'ref 不是本章的小节标题或自测编号：{ref!r}')
    else:
        r.warn(where, '缺少 ref')

    def distinct(items, what):
        if len(set(items)) != len(items):
            r.err(where, f'{what} 有重复')

    if t in ('single', 'multi'):
        opts = ex['options']
        lo, hi = (3, 4) if t == 'single' else (4, 5)
        if not isinstance(opts, list) or not lo <= len(opts) <= hi:
            r.err(where, f'options 需要 {lo}～{hi} 项')
            return
        for o in opts:
            check_text(r, where, '选项', o, LIMITS['option'])
        distinct(opts, 'options')
        if any(re.search(r'以上(都|均|皆)', o) for o in opts if isinstance(o, str)):
            r.err(where, '不要用“以上都对/都不对”')
        if t == 'single':
            a = ex['answer']
            if not isinstance(a, int) or isinstance(a, bool) or not 0 <= a < len(opts):
                r.err(where, 'answer 必须是有效下标')
            elif all(isinstance(o, str) for o in opts):
                # 正确项明显最长时，学习者会学会“挑最长的”
                right = visible_len(opts[a])
                longest_other = max(visible_len(o) for i, o in enumerate(opts) if i != a)
                if right >= 1.5 * longest_other and right - longest_other >= 6:
                    r.warn(where, f'正确项（{right} 字）明显长于其他选项（最长 {longest_other} 字）')
        else:
            a = ex['answers']
            if (not isinstance(a, list) or not 2 <= len(a) <= 3 or len(set(a)) != len(a)
                    or any(not isinstance(i, int) or isinstance(i, bool) or not 0 <= i < len(opts) for i in a)):
                r.err(where, 'answers 需要 2～3 个不重复的有效下标')
            elif len(a) == len(opts):
                r.err(where, '多选题不能全选')
    elif t == 'judge':
        if not isinstance(ex['answer'], bool):
            r.err(where, 'answer 必须是 true/false')
    elif t == 'fill':
        text, ds = ex['text'], ex['distractors']
        if check_text(r, where, 'text', text, LIMITS['fill_text'] + 20):
            answers = BLANK.findall(text)
            shown = BLANK.sub('＿＿', text)
            if visible_len(shown) > LIMITS['fill_text']:
                r.err(where, f'text 去掉答案后仍长 {visible_len(shown)} 字，超过 {LIMITS["fill_text"]}')
            if not 1 <= len(answers) <= 3:
                r.err(where, 'text 需要 1～3 个 [[答案]]')
            if '[' in BLANK.sub('', text) or ']' in BLANK.sub('', text):
                r.err(where, 'text 中有未配对的 [[ ]]')
            if not isinstance(ds, list) or not 2 <= len(ds) <= 4:
                r.err(where, 'distractors 需要 2～4 个')
                ds = []
            chips = answers + list(ds)
            for c in chips:
                check_text(r, where, '词块', c, LIMITS['chip'])
            distinct(chips, '答案与干扰词')
    elif t == 'order':
        items = ex['items']
        if not isinstance(items, list) or not 3 <= len(items) <= 6:
            r.err(where, 'items 需要 3～6 项')
            return
        for i in items:
            check_text(r, where, '排序项', i, LIMITS['order_item'])
        distinct(items, 'items')
    elif t == 'match':
        pairs = ex['pairs']
        if not isinstance(pairs, list) or not 4 <= len(pairs) <= 5 or any(
                not isinstance(p, list) or len(p) != 2 for p in pairs):
            r.err(where, 'pairs 需要 4～5 组 [左, 右]')
            return
        for left, right in pairs:
            check_text(r, where, '配对左侧', left, LIMITS['match_left'])
            check_text(r, where, '配对右侧', right, LIMITS['match_right'])
        distinct([p[0] for p in pairs], '配对左侧')
        distinct([p[1] for p in pairs], '配对右侧')


def check_bank(num: int, data, heads: dict[str, str], card_ids: set[str], r: Report) -> None:
    where = f'{num:02}.json'
    if not isinstance(data, dict):
        r.err(where, '顶层必须是对象')
        return
    if data.get('chapter') != num:
        r.err(where, f'chapter 应为 {num}')
    extra = set(data) - {'chapter', 'keyPoints', 'lessons'}
    if extra:
        r.err(where, f'多余字段 {sorted(extra)}')
    kps = data.get('keyPoints')
    if not isinstance(kps, list) or not 4 <= len(kps) <= 6:
        r.err(where, 'keyPoints 需要 4～6 条')
    else:
        for k in kps:
            check_text(r, where, 'keyPoints', k, LIMITS['keypoint'])
    lessons = data.get('lessons')
    if not isinstance(lessons, list) or not 3 <= len(lessons) <= 4:
        r.err(where, 'lessons 需要 3～4 课')
        return
    types: Counter = Counter()
    judges: Counter = Counter()
    ids: set[str] = set()
    prompts: set[str] = set()
    for i, lesson in enumerate(lessons, 1):
        lid = f'c{num:02}-{i:02}'
        if not isinstance(lesson, dict):
            r.err(where, f'第 {i} 课必须是对象')
            continue
        if lesson.get('id') != lid:
            r.err(where, f'第 {i} 课 id 应为 {lid}')
        extra = set(lesson) - {'id', 'title', 'summary', 'exercises'}
        if extra:
            r.err(lid, f'多余字段 {sorted(extra)}')
        check_text(r, lid, 'title', lesson.get('title'), LIMITS['lesson_title'])
        check_text(r, lid, 'summary', lesson.get('summary'), LIMITS['lesson_summary'])
        exs = lesson.get('exercises')
        if not isinstance(exs, list) or not 8 <= len(exs) <= 10:
            r.err(lid, 'exercises 需要 8～10 题')
            continue
        lesson_types = set()
        for n, ex in enumerate(exs, 1):
            check_exercise(r, ex, lid, n, heads, card_ids)
            if not isinstance(ex, dict):
                continue
            if ex.get('id') in ids:
                r.err(ex.get('id'), '编号重复')
            ids.add(ex.get('id'))
            if ex.get('prompt') in prompts and ex.get('type') not in ('fill',):
                r.warn(ex.get('id'), '题干与本章另一题相同')
            prompts.add(ex.get('prompt'))
            types[ex.get('type')] += 1
            lesson_types.add(ex.get('type'))
            if ex.get('type') == 'judge':
                judges[ex.get('answer')] += 1
        if len(lesson_types) < 3:
            r.err(lid, f'每课至少 3 种题型，现在只有 {sorted(lesson_types)}')
    for t, least in (('match', 1), ('order', 1), ('fill', 2), ('judge', 3)):
        if types[t] < least:
            r.err(where, f'{t} 至少 {least} 道，现在 {types[t]} 道')
    # 题库文件也可能被网页等不打乱选项的地方复用，正确项不能总在同一位置
    positions = Counter(ex['answer'] for l in lessons if isinstance(l, dict) for ex in l.get('exercises', [])
                        if isinstance(ex, dict) and ex.get('type') == 'single' and isinstance(ex.get('answer'), int))
    singles = sum(positions.values())
    if singles >= 10 and max(positions.values()) > 0.5 * singles:
        pos, n = positions.most_common(1)[0]
        r.warn(where, f'单选正确项有 {n}/{singles} 道都在第 {pos + 1} 个位置')
    total = sum(judges.values())
    if total >= 4 and not 0.3 <= judges[True] / total <= 0.7:
        r.warn(where, f'判断题对错比例失衡：对 {judges[True]} / 错 {judges[False]}')
    if types['single'] > 0.65 * sum(types.values()):
        r.warn(where, f'单选占比过高：{types["single"]}/{sum(types.values())}')


# ---------------------------------------------------------------- 自测答案卡

def parse_cards() -> list[dict]:
    catalog = json.loads((ANSWERS / '题目清单.json').read_text())['questions']
    md = (ANSWERS / 'README.md').read_text()
    parts = re.split(r'^<a id="([a-z0-9-]+)"></a>\s*$', md, flags=re.M)
    bodies = {parts[i]: parts[i + 1] for i in range(1, len(parts), 2)}
    cards = []
    for q in catalog:
        raw = bodies.get(q['answer_anchor'])
        if raw is None:
            raise SystemExit(f'找不到答案 {q["id"]}')
        raw = re.split(r'^## ', raw, maxsplit=1, flags=re.M)[0]
        lines = raw.strip().splitlines()
        title = lines[0]
        assert title.startswith('### '), title
        blocks: list[dict] = []
        para: list[str] = []

        def flush():
            if para:
                blocks.append({'kind': 'text', 'text': inline_md(' '.join(para))})
                para.clear()

        table: list[str] = []
        for line in lines[1:] + ['']:
            s = line.strip()
            if s.startswith('|'):
                flush()
                table.append(s)
                continue
            if table:
                rows = [[c.strip() for c in row.strip('|').split('|')] for row in table
                        if not re.fullmatch(r'\|[\s:|-]+\|', row)]
                blocks.append({'kind': 'table', 'rows': rows})
                table = []
            img = re.fullmatch(r'!\[([^\]]*)\]\(\./images/([^)]+)\)', s)
            if img:
                flush()
                blocks.append({'kind': 'image', 'text': img.group(1), 'image': img.group(2)})
            elif not s:
                flush()
            elif re.match(r'^\[出处：', s):
                continue
            elif re.match(r'^([-*]|\d+\.) ', s):
                flush()
                blocks.append({'kind': 'bullet', 'text': inline_md(re.sub(r'^([-*]|\d+\.) ', '', s))})
            else:
                para.append(s)
        flush()
        chapter = int(q['id'][1:3]) if q['id'][0] in 'QP' else 0
        first = next((b['text'] for b in blocks if b['kind'] == 'text'), '')
        conclusion = re.match(r'^\*\*(.+?)\*\*', first)
        cards.append({
            'id': q['id'], 'chapter': chapter, 'category': q['category'],
            'question': q['question'].replace('`', ''),
            'conclusion': conclusion.group(1).removeprefix('结论：') if conclusion else '',
            'anchor': q['answer_anchor'], 'blocks': blocks,
        })
    return cards


# ---------------------------------------------------------------- 交互实验

def parse_labs() -> list[dict]:
    labs = []
    for f in sorted((LABS_SRC / 'labs').glob('*.js')):
        src = f.read_text()
        for m in re.finditer(r'SDLab\.define\(\{(.*?)\bmount\(', src, re.S):
            head = m.group(1)
            field = lambda k: re.search(rf"\b{k}:'([^']*)'", head)
            labs.append({'id': field('id').group(1), 'chapter': int(re.search(r'\bchapter:(\d+)', head).group(1)),
                         'title': field('title').group(1), 'summary': field('summary').group(1), 'file': f.name})
    count = sum(src.count('SDLab.define(') for src in (f.read_text() for f in (LABS_SRC / 'labs').glob('*.js')))
    assert len(labs) == count, f'解析到 {len(labs)} 个实验，文件里有 {count} 个 SDLab.define'
    return labs


def svg_to_png(src: Path, dst: Path, width: int = 1200) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(['rsvg-convert', '-w', str(width), '-b', 'white', '-o', str(dst), str(src)], check=True)


# ---------------------------------------------------------------- 主流程

def load_banks(nums: list[int], heads_by: dict[int, dict[str, str]], cards: list[dict], r: Report) -> dict[int, dict]:
    banks = {}
    for num in nums:
        p = BANK / f'{num:02}.json'
        if not p.exists():
            r.warn(f'{num:02}.json', '题库文件不存在')
            continue
        try:
            data = json.loads(p.read_text())
        except json.JSONDecodeError as e:
            r.err(p.name, f'JSON 解析失败：{e}')
            continue
        card_ids = {c['id'] for c in cards if c['chapter'] == num}
        check_bank(num, data, heads_by[num], card_ids, r)
        banks[num] = data
    return banks


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='只校验题库，不生成内容包')
    ap.add_argument('chapters', nargs='*', type=int)
    args = ap.parse_args()

    dirs = chapter_dirs()
    assert list(dirs) == list(range(1, 29)), list(dirs)
    assert [n for _, _, rg in SECTIONS for n in rg] == list(range(1, 29))
    mds = {n: chapter_md(d).read_text() for n, d in dirs.items()}
    heads_by = {n: headings(md) for n, md in mds.items()}
    cards = parse_cards()
    nums = args.chapters or list(dirs)
    r = Report()
    banks = load_banks(nums, heads_by, cards, r)

    for w in r.warnings:
        print('警告', w)
    for e in r.errors:
        print('错误', e)
    counts = Counter(ex['type'] for b in banks.values() for l in b.get('lessons', []) if isinstance(l, dict)
                     for ex in l.get('exercises', []) if isinstance(ex, dict))
    print(f'题库 {len(banks)} 章，{sum(counts.values())} 题 {dict(counts)}；{len(r.errors)} 个错误，{len(r.warnings)} 个警告')
    if r.errors:
        return 1
    if args.check:
        return 0
    if args.chapters:
        print('生成内容包需要全部章节，请去掉章号参数')
        return 1

    # 生成内容包
    titles = chapter_titles()
    labs = parse_labs()
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / 'images').mkdir(parents=True)
    chapters = []
    for n, md in mds.items():
        intro, intro_svg = intro_of(md)
        image = None
        if intro_svg:
            image = f'intro-{n:02}.png'
            svg_to_png(dirs[n] / 'images' / intro_svg, OUT / 'images' / image)
        heads = heads_by[n]
        bank = banks.get(n, {'keyPoints': [], 'lessons': []})
        lessons = []
        for lesson in bank['lessons']:
            exs = []
            for ex in lesson['exercises']:
                ex = dict(ex)
                ref = ex.pop('ref', None)
                if ref in heads:
                    ex['refTitle'] = ref.split('#')[0]
                    ex['refAnchor'] = f'd{n}/{heads[ref]}'
                elif ref:
                    ex['refTitle'] = ref
                    ex['refAnchor'] = f'd29/{ref.lower()}'
                exs.append(ex)
            lessons.append({**lesson, 'exercises': exs})
        h1 = plain_inline(md.splitlines()[0].lstrip('# '))
        chapters.append({
            'number': n, 'title': titles[n], 'fullTitle': h1, 'docID': f'd{n}',
            'intro': intro, 'introImage': image, 'keyPoints': bank['keyPoints'], 'lessons': lessons,
            'labs': [{k: v for k, v in lab.items() if k != 'chapter'} for lab in labs if lab['chapter'] == n],
        })
    for c in cards:
        for b in c['blocks']:
            if b['kind'] == 'image':
                src = ANSWERS / 'images' / b['image']
                png = Path(b['image']).with_suffix('.png').name
                if src.suffix == '.svg':
                    svg_to_png(src, OUT / 'images' / png)
                else:
                    shutil.copy(src, OUT / 'images' / png)
                b['image'] = png
    sections = [{'id': f's{i + 1}', 'title': t, 'subtitle': sub, 'chapters': list(rg)}
                for i, (t, sub, rg) in enumerate(SECTIONS)]
    course = {'readerURL': READER_URL, 'sections': sections, 'chapters': chapters, 'cards': cards}
    body = json.dumps(course, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    course['version'] = hashlib.sha256(body.encode()).hexdigest()[:12]
    (OUT / 'course.json').write_text(json.dumps(course, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n')

    labs_out = OUT / 'Labs'
    (labs_out / 'labs').mkdir(parents=True)
    for name in ('runtime.js', 'runtime.css'):
        shutil.copy(LABS_SRC / name, labs_out / name)
    for f in (LABS_SRC / 'labs').glob('*.js'):
        shutil.copy(f, labs_out / 'labs' / f.name)
    shutil.copy(ROOT / 'iOS' / 'lab-host.html', labs_out / 'lab.html')
    total = sum(len(l['exercises']) for c in chapters for l in c['lessons'])
    print(f'已生成 {OUT.relative_to(ROOT)}：{len(chapters)} 章、{total} 题、{len(cards)} 张自测卡、{len(labs)} 个实验，版本 {course["version"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
