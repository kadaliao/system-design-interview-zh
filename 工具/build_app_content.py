#!/usr/bin/env python3
"""校验 练习题库/，并把章节、题库、自测答案和交互实验打包成 iOS App 的内容包。

    python3 工具/build_app_content.py --check [章号 ...]   只校验题库
    python3 工具/build_app_content.py                      校验并生成 iOS/SystemDesignQuest/Resources/Content
    python3 工具/build_app_content.py --lang en            生成英语内容包 course.en.json（只含已翻译章节）
    python3 工具/build_app_content.py --check --lang en 1  只校验英语第 1 章（0 表示通用复盘卡）

英语约定见 工具/README-i18n.md。
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
BANK_EN = BANK / 'en'
ANSWERS_EN = ROOT / '29. 自测题详解' / 'en'
LABS_EN = ROOT / '交互实验' / 'labs' / 'en'
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

# 英语上限：中文一字约占一个 em，英文平均一字符约 0.5 em，再留约 10% 给按词换行浪费的空间，
# 因此长文本字段按 ×2.2 换算（120 汉字 → 264 字符）。药丸式词块和配对左列在窄栏里单行显示，
# 按 ×2 略收紧；排序项/配对右列可换行，仍按 ×2.2。
LIMITS_EN = {
    'prompt': 264, 'prompt_single': 352, 'option': 88, 'fill_text': 198, 'chip': 24,
    'order_item': 57, 'match_left': 22, 'match_right': 48, 'explanation': 330,
    'keypoint': 154, 'lesson_title': 18, 'lesson_summary': 53,
}
HAN = re.compile(r'[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uff00-\uffef]')


class Mode:
    """当前语言的校验参数；默认中文，英语构建时由 main 切换。"""
    en = False
    lim = LIMITS
    unit = '字'
    blank = '＿＿'          # fill 题去掉答案后用来估算显示长度的占位
    longer_by = 6          # 「正确项明显更长」的绝对差阈值
    banned = re.compile(r'以上(都|均|皆)')
    xref = re.compile(r'接上题|上一题|上题|前一题|下一题')


MODE = Mode()


def use_english() -> None:
    MODE.en, MODE.lim, MODE.unit, MODE.blank, MODE.longer_by = True, LIMITS_EN, 'chars', '_____', 13
    MODE.banned = re.compile(r'\b(all|none|both) of the above\b', re.I)
    MODE.xref = re.compile(r'\b(previous|last|preceding|next|following|above) (question|problem)\b|\bquestion above\b', re.I)


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
        r.err(where, f'{field} 长 {visible_len(value)} {MODE.unit}，超过 {limit}：{value[:30]}…')
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
    limit = MODE.lim['prompt_single'] if t == 'single' else MODE.lim['prompt']
    check_text(r, where, 'prompt', ex['prompt'], limit)
    # 单元测验和练习会跨课抽题，题目不能依赖前后题
    for field in ('prompt', 'text'):
        if isinstance(ex.get(field), str) and MODE.xref.search(ex[field]):
            r.err(where, f'{field} 引用了其他题目，每题必须单独读得懂')
    check_text(r, where, 'explanation', ex['explanation'], MODE.lim['explanation'])
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
            check_text(r, where, '选项', o, MODE.lim['option'])
        distinct(opts, 'options')
        if any(MODE.banned.search(o) for o in opts if isinstance(o, str)):
            r.err(where, '不要用“以上都对/都不对”')
        if t == 'single':
            a = ex['answer']
            if not isinstance(a, int) or isinstance(a, bool) or not 0 <= a < len(opts):
                r.err(where, 'answer 必须是有效下标')
            elif all(isinstance(o, str) for o in opts):
                # 正确项明显最长时，学习者会学会“挑最长的”
                right = visible_len(opts[a])
                longest_other = max(visible_len(o) for i, o in enumerate(opts) if i != a)
                if right >= 1.5 * longest_other and right - longest_other >= MODE.longer_by:
                    r.warn(where, f'正确项（{right} {MODE.unit}）明显长于其他选项（最长 {longest_other} {MODE.unit}）')
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
        if check_text(r, where, 'text', text, MODE.lim['fill_text'] + 20):
            answers = BLANK.findall(text)
            shown = BLANK.sub(MODE.blank, text)
            if visible_len(shown) > MODE.lim['fill_text']:
                r.err(where, f'text 去掉答案后仍长 {visible_len(shown)} {MODE.unit}，超过 {MODE.lim["fill_text"]}')
            if not 1 <= len(answers) <= 3:
                r.err(where, 'text 需要 1～3 个 [[答案]]')
            if '[' in BLANK.sub('', text) or ']' in BLANK.sub('', text):
                r.err(where, 'text 中有未配对的 [[ ]]')
            if not isinstance(ds, list) or not 2 <= len(ds) <= 4:
                r.err(where, 'distractors 需要 2～4 个')
                ds = []
            chips = answers + list(ds)
            for c in chips:
                check_text(r, where, '词块', c, MODE.lim['chip'])
            distinct(chips, '答案与干扰词')
    elif t == 'order':
        items = ex['items']
        if not isinstance(items, list) or not 3 <= len(items) <= 6:
            r.err(where, 'items 需要 3～6 项')
            return
        for i in items:
            check_text(r, where, '排序项', i, MODE.lim['order_item'])
        distinct(items, 'items')
    elif t == 'match':
        pairs = ex['pairs']
        if not isinstance(pairs, list) or not 4 <= len(pairs) <= 5 or any(
                not isinstance(p, list) or len(p) != 2 for p in pairs):
            r.err(where, 'pairs 需要 4～5 组 [左, 右]')
            return
        for left, right in pairs:
            check_text(r, where, '配对左侧', left, MODE.lim['match_left'])
            check_text(r, where, '配对右侧', right, MODE.lim['match_right'])
        distinct([p[0] for p in pairs], '配对左侧')
        distinct([p[1] for p in pairs], '配对右侧')


def check_bank(num: int, data, heads: dict[str, str], card_ids: set[str], r: Report) -> None:
    where = f'{num:02}.json'
    if not isinstance(data, dict):
        r.err(where, '顶层必须是对象')
        return
    if data.get('chapter') != num:
        r.err(where, f'chapter 应为 {num}')
    extra = set(data) - ({'chapter', 'keyPoints', 'lessons', 'title', 'fullTitle', 'intro', 'refs'} if MODE.en
                         else {'chapter', 'keyPoints', 'lessons'})
    if extra:
        r.err(where, f'多余字段 {sorted(extra)}')
    kps = data.get('keyPoints')
    if not isinstance(kps, list) or not 4 <= len(kps) <= 6:
        r.err(where, 'keyPoints 需要 4～6 条')
    else:
        for k in kps:
            check_text(r, where, 'keyPoints', k, MODE.lim['keypoint'])
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
        check_text(r, lid, 'title', lesson.get('title'), MODE.lim['lesson_title'])
        check_text(r, lid, 'summary', lesson.get('summary'), MODE.lim['lesson_summary'])
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

def card_blocks(lines: list[str]) -> list[dict]:
    """答案卡正文（标题行之后的各行）→ text / bullet / image / table 块。中英文共用。"""
    blocks: list[dict] = []
    para: list[str] = []

    def flush():
        if para:
            blocks.append({'kind': 'text', 'text': inline_md(' '.join(para))})
            para.clear()

    table: list[str] = []
    for line in lines + ['']:
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
        img = re.fullmatch(r'!\[([^\]]*)\]\((?:\./|\.\./)?images/(?:en/)?([^)/]+)\)', s)
        if img:
            flush()
            blocks.append({'kind': 'image', 'text': img.group(1), 'image': img.group(2)})
        elif not s:
            flush()
        elif re.match(r'^\[(出处|Source)[：:]', s):
            continue
        elif re.match(r'^([-*]|\d+\.) ', s):
            flush()
            blocks.append({'kind': 'bullet', 'text': inline_md(re.sub(r'^([-*]|\d+\.) ', '', s))})
        else:
            para.append(s)
    flush()
    return blocks


def split_answers(md: str) -> dict[str, str]:
    parts = re.split(r'^<a id="([a-z0-9-]+)"></a>\s*$', md, flags=re.M)
    return {parts[i]: parts[i + 1] for i in range(1, len(parts), 2)}


def card_body(raw: str) -> tuple[str, list[str]]:
    raw = re.split(r'^## ', raw, maxsplit=1, flags=re.M)[0]
    lines = raw.strip().splitlines()
    return lines[0], lines[1:]


def card_chapter(qid: str) -> int:
    return int(qid[1:3]) if qid[0] in 'QP' else 0


def parse_cards() -> list[dict]:
    catalog = json.loads((ANSWERS / '题目清单.json').read_text())['questions']
    bodies = split_answers((ANSWERS / 'README.md').read_text())
    cards = []
    for q in catalog:
        raw = bodies.get(q['answer_anchor'])
        if raw is None:
            raise SystemExit(f'找不到答案 {q["id"]}')
        title, rest = card_body(raw)
        assert title.startswith('### '), title
        blocks = card_blocks(rest)
        chapter = card_chapter(q['id'])
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

def parse_labs(src_dir: Path | None = None, prefix: str = '') -> list[dict]:
    src_dir = src_dir or LABS_SRC / 'labs'
    labs = []
    for f in sorted(src_dir.glob('*.js')):
        src = f.read_text()
        for m in re.finditer(r'SDLab\.define\(\{(.*?)\bmount\(', src, re.S):
            head = m.group(1)
            field = lambda k: re.search(rf"\b{k}:'([^']*)'", head)
            labs.append({'id': field('id').group(1), 'chapter': int(re.search(r'\bchapter:(\d+)', head).group(1)),
                         'title': field('title').group(1), 'summary': field('summary').group(1), 'file': prefix + f.name})
    count = sum(src.count('SDLab.define(') for src in (f.read_text() for f in src_dir.glob('*.js')))
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


def rm(p: Path) -> None:
    if p.is_dir() and not p.is_symlink():
        shutil.rmtree(p)
    elif p.exists() or p.is_symlink():
        p.unlink()


def clean_zh() -> None:
    """清掉上次的中文产物，但保留英语产物（course.en.json、images/en、Labs/labs/en）和 videos 等其他来源的文件。"""
    rm(OUT / 'course.json')
    for d, keep in ((OUT / 'images', {'en'}), (OUT / 'Labs', {'labs'}), (OUT / 'Labs' / 'labs', {'en'})):
        if d.is_dir():
            for f in d.iterdir():
                if f.name not in keep:
                    rm(f)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='只校验题库，不生成内容包')
    ap.add_argument('--lang', choices=['zh', 'en'], default='zh', help='内容语言（默认 zh）')
    ap.add_argument('chapters', nargs='*', type=int)
    args = ap.parse_args()
    if args.lang == 'en':
        return main_en(args)

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
    clean_zh()
    (OUT / 'images').mkdir(parents=True, exist_ok=True)
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
    (labs_out / 'labs').mkdir(parents=True, exist_ok=True)
    for name in ('runtime.js', 'runtime.css'):
        shutil.copy(LABS_SRC / name, labs_out / name)
    for f in (LABS_SRC / 'labs').glob('*.js'):
        shutil.copy(f, labs_out / 'labs' / f.name)
    shutil.copy(ROOT / 'iOS' / 'lab-host.html', labs_out / 'lab.html')
    total = sum(len(l['exercises']) for c in chapters for l in c['lessons'])
    print(f'已生成 {OUT.relative_to(ROOT)}：{len(chapters)} 章、{total} 题、{len(cards)} 张自测卡、{len(labs)} 个实验，版本 {course["version"]}')
    return 0


# ---------------------------------------------------------------- 英语内容包

def han_lines(text: str) -> list[str]:
    return [f'{i}: {l.strip()[:60]}' for i, l in enumerate(text.splitlines(), 1) if HAN.search(l)]


def han_strings(obj, skip: frozenset = frozenset(), path: str = '') -> list[str]:
    if isinstance(obj, str):
        return [f'{path}: {obj[:40]}'] if HAN.search(obj) else []
    if isinstance(obj, dict):
        return [h for k, v in obj.items() if k not in skip for h in han_strings(v, skip, f'{path}.{k}')]
    if isinstance(obj, list):
        return [h for i, v in enumerate(obj) for h in han_strings(v, skip, f'{path}[{i}]')]
    return []


NUM = re.compile(r'\d+(?:\.\d+)?')
CODE = re.compile(r'`([^`]+)`')


_ZH_UNITS = {'万亿': 1e12, '千万': 1e7, '百万': 1e6, '万': 1e4, '亿': 1e8, '千': 1e3}
_EN_UNITS = {'thousand': 1e3, 'million': 1e6, 'billion': 1e9, 'trillion': 1e12, 'k': 1e3, 'm': 1e6, 'b': 1e9}


def _fmt_num(v: float) -> str:
    return str(int(round(v))) if abs(v - round(v)) < 1e-6 else repr(round(v, 6))


def numbers(s: str) -> Counter:
    """抽出文本里的数值，并把「万/亿」「million/billion」「N × 10^k」「N × 10,000」统一换算成同一个整数，
    这样「1,600 万」与 "16 million" 或 "1,600 × 10,000" 都得到 16000000，中英文才能对上。"""
    s = s.replace(',', '')
    out: list[str] = []

    def take(pattern: str, fn, flags: int = 0) -> None:
        nonlocal s

        def repl(m):
            out.append(_fmt_num(fn(m)))
            return ' '
        s = re.sub(pattern, repl, s, flags=flags)

    take(r'(\d+(?:\.\d+)?)\s*[×xX*]\s*10\^(\d+)', lambda m: float(m.group(1)) * 10 ** int(m.group(2)))
    take(r'(\d+(?:\.\d+)?)\s*[×xX*]\s*(10{3,})(?!\d)', lambda m: float(m.group(1)) * float(m.group(2)))
    take(r'(\d+(?:\.\d+)?)\s*[×xX*]\s*(ten thousand|thousand|million|billion)\b',
         lambda m: float(m.group(1)) * {'ten thousand': 1e4}.get(m.group(2).lower(), _EN_UNITS.get(m.group(2).lower(), 1)), re.I)
    take(r'(?<![\d.])10\^(\d+)', lambda m: 10 ** int(m.group(1)))
    take(r'(?<![\d.^])(\d+(?:\.\d+)?)\s*(万亿|千万|百万|万|亿|千)', lambda m: float(m.group(1)) * _ZH_UNITS[m.group(2)])
    take(r'(?<![\d.^])(\d+(?:\.\d+)?)\s*(thousand|million|billion|trillion)\b', lambda m: float(m.group(1)) * _EN_UNITS[m.group(2).lower()], re.I)
    take(r'(?<![\w.])(\d+(?:\.\d+)?)([kKmMbB])(?![\w])', lambda m: float(m.group(1)) * _EN_UNITS[m.group(2).lower()])
    out += [_fmt_num(float(x)) for x in NUM.findall(s)]
    return Counter(out)


def code_spans(s: str) -> Counter:
    # 带汉字的片段（如 `1亿×365×10=3650亿`）无法原样放进英文，其中的数字已由 numbers() 比较，这里跳过
    return Counter(re.sub(r'\s+', '', c) for c in CODE.findall(s) if not re.search(r'[\u4e00-\u9fff]', c))


def ex_parts(ex: dict) -> list[str]:
    """一道题里所有会显示给学习者的文本，顺序与题型字段对应。"""
    out = [ex.get('prompt', ''), ex.get('explanation', '')]
    for k in ('text',):
        if isinstance(ex.get(k), str):
            out.append(ex[k])
    for k in ('options', 'items', 'distractors'):
        out += [x for x in ex.get(k, []) if isinstance(x, str)]
    for p in ex.get('pairs', []):
        out += [x for x in p if isinstance(x, str)]
    return out


def compare_exercise(r: Report, z: dict, e: dict, refs: dict, heads: dict[str, str]) -> None:
    where = e.get('id', '?')
    if z.get('type') != e.get('type'):
        r.err(where, f'题型应为 {z.get("type")}，现在是 {e.get("type")}')
        return
    t = z['type']
    for key in ('answer', 'answers'):
        if z.get(key) != e.get(key):
            r.err(where, f'{key} 必须与中文一致：{z.get(key)!r} ≠ {e.get(key)!r}')
    for key in ('options', 'items', 'distractors', 'pairs'):
        if key in z and len(z[key]) != len(e.get(key, [])):
            r.err(where, f'{key} 数量应为 {len(z[key])}，现在 {len(e.get(key, []))}')
    if t == 'fill' and len(BLANK.findall(z['text'])) != len(BLANK.findall(e.get('text', ''))):
        r.err(where, f'[[填空]] 个数应为 {len(BLANK.findall(z["text"]))}')
    # 数字与代码：中文里出现的数字、代码片段，英文必须原样保留（可以多，不能少或改）
    zs, es = ex_parts(z), ex_parts(e)
    if len(zs) == len(es):
        pairs = [('合计', ' '.join(zs), ' '.join(es))]
        # 选项、排序项、配对项按位置逐项比较，译错顺序时能发现
        pairs += [(f'第 {i + 1} 段', a, b) for i, (a, b) in enumerate(zip(zs, es)) if i >= 2]
    else:
        pairs = [('合计', ' '.join(zs), ' '.join(es))]
    for label, a, b in pairs:
        miss = numbers(a) - numbers(b)
        if miss:
            r.err(where, f'{label}数字与中文不一致，英文缺少 {sorted(miss.elements())}（数字请保持阿拉伯数字原样）：{b[:40]}')
            break
    extra = numbers(' '.join(es)) - numbers(' '.join(zs))
    if extra:
        r.warn(where, f'英文多出中文里没有的数字 {sorted(extra.elements())}，确认没有改变事实')
    miss = code_spans(' '.join(zs)) - code_spans(' '.join(es))
    if miss:
        r.err(where, f'中文里的代码片段 `{"`、`".join(sorted(miss.elements()))}` 在英文里缺失或被改动')
    zr, er = z.get('ref'), e.get('ref')
    if zr is None or er is None:
        if (zr is None) != (er is None):
            r.err(where, 'ref 有无必须与中文一致')
    elif zr in heads:
        if refs.get(er) != zr:
            r.err(where, f'ref {er!r} 必须在 refs 里映射到中文标题 {zr!r}')
    elif er != zr:
        r.err(where, f'ref 引用自测编号时必须与中文一致：{zr!r}')


def check_en_bank(num: int, zh: dict, en, heads: dict[str, str], card_ids: set[str], r: Report) -> dict | None:
    where = f'en/{num:02}.json'
    if not isinstance(en, dict):
        r.err(where, '顶层必须是对象')
        return None
    refs = en.get('refs')
    if not isinstance(refs, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in refs.items()):
        r.err(where, 'refs 必须是 {英文小节标题: 中文小节标题原文} 的对象')
        refs = {}
    for k, v in refs.items():
        if v not in heads:
            r.err(where, f'refs[{k!r}] 的中文标题 {v!r} 不在第 {num} 章正文里（照抄中文题库 ref 的原文）')
    en_heads = {k: heads[v] for k, v in refs.items() if v in heads}
    check_bank(num, en, en_heads, card_ids, r)
    for field in ('title', 'fullTitle'):
        check_text(r, where, field, en.get(field), None)
    intro = en.get('intro')
    if not isinstance(intro, list) or not intro:
        r.err(where, 'intro 需要至少 1 段（字符串数组，对应中文「学习导读」）')
    else:
        for para in intro:
            check_text(r, where, 'intro', para, None)
    for h in han_strings(en, frozenset({'refs'}), where):
        r.err(where, f'残留汉字 {h}')
    # 与中文题库逐题对照
    if not isinstance(en.get('lessons'), list) or len(en['lessons']) != len(zh['lessons']):
        r.err(where, f'课数应为 {len(zh["lessons"])}')
        return None
    if isinstance(en.get('keyPoints'), list) and len(en['keyPoints']) != len(zh['keyPoints']):
        r.warn(where, f'keyPoints 条数与中文不同（中文 {len(zh["keyPoints"])}，英文 {len(en["keyPoints"])}）')
    for zl, el in zip(zh['lessons'], en['lessons']):
        if not isinstance(el, dict) or not isinstance(el.get('exercises'), list):
            continue
        zid = [x['id'] for x in zl['exercises']]
        eid = [x.get('id') if isinstance(x, dict) else None for x in el['exercises']]
        if zid != eid:
            r.err(zl['id'], f'题目 id 必须与中文逐一对应、顺序一致：缺少 {sorted(set(zid) - set(eid))}，'
                            f'多出 {sorted(map(str, set(eid) - set(zid)))}' + ('' if set(zid) != set(eid) else '，仅顺序不同'))
            continue
        for z, e in zip(zl['exercises'], el['exercises']):
            compare_exercise(r, z, e, refs, heads)
    return en


def check_en_labs(num: int, zh_labs: list[dict], en_labs: dict[str, dict], r: Report) -> list[dict]:
    got = []
    for zl in (l for l in zh_labs if l['chapter'] == num):
        path = LABS_EN / zl['file']
        where = f'labs/en/{zl["file"]}'
        if not path.exists():
            r.err(where, '缺少英文实验文件（文件名与中文版相同）')
            continue
        lab = en_labs.get(zl['id'])
        if lab is None or lab['file'] != 'en/' + zl['file']:
            r.err(where, f'没有解析到 id 为 {zl["id"]} 的 SDLab.define（id、chapter 必须与中文版一致）')
            continue
        if lab['chapter'] != num:
            r.err(where, f'chapter 应为 {num}')
        for k in ('title', 'summary'):
            if '\\' in lab[k] or not lab[k].strip():
                r.err(where, f'{k} 必须是不含转义的单引号字符串；英文撇号请用 ’（U+2019）')
        for h in han_lines(path.read_text()):
            r.err(where, f'残留汉字（代码注释也要翻译或删掉）{h}')
        got.append(lab)
    return got


def check_en_cards(num: int, catalog: list[dict], zh_cards: dict[str, dict], meta: dict, r: Report) -> list[dict]:
    name = 'general.md' if num == 0 else f'{num:02}.md'
    path = ANSWERS_EN / name
    where = f'en/{name}'
    want = [q for q in catalog if card_chapter(q['id']) == num]
    if not path.exists():
        r.err(where, f'缺少口述卡文件（应含 {want[0]["id"]}…{want[-1]["id"]} 共 {len(want)} 张）')
        return []
    text = path.read_text()
    for h in han_lines(text):
        r.err(where, f'残留汉字 {h}')
    bodies = split_answers(text)
    anchors = {q['answer_anchor'] for q in want}
    for a in bodies:
        if a not in anchors:
            r.err(where, f'多余或错放的答案锚点 {a}（本文件只放 {sorted(anchors)[0]} 等本章条目）')
    cards = []
    for q in want:
        raw = bodies.get(q['answer_anchor'])
        if raw is None:
            r.err(where, f'缺少 <a id="{q["answer_anchor"]}"></a> 答案块（{q["id"]}）')
            continue
        title, rest = card_body(raw)
        m = re.match(r'^### (\S+?)\s*[｜|]\s*(.+)$', title)
        if not m or m.group(1) != q['id']:
            r.err(q['id'], f'标题行应为「### {q["id"]} | English title」，现在是 {title[:50]!r}')
            continue
        blocks = card_blocks(rest)
        z = zh_cards[q['id']]
        zk, ek = [b['kind'] for b in z['blocks']], [b['kind'] for b in blocks]
        if zk != ek:
            r.err(q['id'], f'段落结构应与中文一致（块类型序列 {"/".join(k[0] for k in zk)}，现在 {"/".join(k[0] for k in ek)}；'
                           'text=t bullet=b image=i table=t）：段落、列表项、图、表格的个数和先后都要对应')
            continue
        for zb, eb in zip(z['blocks'], blocks):
            if zb['kind'] == 'image' and zb['image'] != eb['image']:
                r.err(q['id'], f'图片文件名应为 {zb["image"]}')
            if zb['kind'] == 'table' and [len(x) for x in zb['rows']] != [len(x) for x in eb['rows']]:
                r.err(q['id'], '表格行列数应与中文一致')
        zt = ' '.join(b.get('text', '') + ' '.join(c for row in b.get('rows', []) for c in row) for b in z['blocks'])
        et = ' '.join(b.get('text', '') + ' '.join(c for row in b.get('rows', []) for c in row) for b in blocks)
        miss = numbers(zt) - numbers(et)
        if miss:
            r.warn(q['id'], f'中文里的数字 {sorted(miss.elements())} 在英文里没找到，确认没有改动数字')
        miss = code_spans(zt) - code_spans(et)
        if miss:
            r.warn(q['id'], f'中文里的代码片段 {sorted(miss.elements())} 在英文里缺失或被改动')
        first = next((b['text'] for b in blocks if b['kind'] == 'text'), '')
        concl = re.match(r'^\*\*(.+?)\*\*', first)
        if z['conclusion'] and not concl:
            r.err(q['id'], '第一段必须以 **Conclusion: …** 开头（对应中文的 **结论：…**）')
        cat = meta['categories'].get(z['category'])
        if not cat:
            r.err('meta.json', f'categories 缺少 {z["category"]!r} 的英文名')
            continue
        cards.append({
            'id': q['id'], 'chapter': num, 'category': cat,
            'question': m.group(2).replace('`', '').strip(),
            'conclusion': re.sub(r'^Conclusion[:：]\s*', '', concl.group(1)) if concl else '',
            'anchor': q['answer_anchor'], 'blocks': blocks,
        })
    return cards


def svg_problems(path: Path) -> list[str]:
    return [f'残留汉字 {h}' for h in han_lines(path.read_text())]


def clean_en() -> None:
    rm(OUT / 'course.en.json')
    rm(OUT / 'images' / 'en')
    rm(OUT / 'Labs' / 'labs' / 'en')


def ranges(nums: list[int]) -> str:
    out, i = [], 0
    nums = sorted(nums)
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        out.append(str(nums[i]) if i == j else f'{nums[i]}–{nums[j]}')
        i = j + 1
    return ', '.join(out) or '无'


def main_en(args) -> int:
    use_english()
    dirs = chapter_dirs()
    mds = {n: chapter_md(d).read_text() for n, d in dirs.items()}
    heads_by = {n: headings(md) for n, md in mds.items()}
    zh_cards_list = parse_cards()
    zh_cards = {c['id']: c for c in zh_cards_list}
    catalog = json.loads((ANSWERS / '题目清单.json').read_text())['questions']
    zh_labs = parse_labs()
    r = Report()

    # 全局元信息
    meta: dict = {}
    try:
        meta = json.loads((BANK_EN / 'meta.json').read_text())
        secs = meta.get('sections')
        if not (isinstance(secs, list) and len(secs) == len(SECTIONS)
                and all(isinstance(x, dict) and set(x) == {'title', 'subtitle'} for x in secs)):
            r.err('en/meta.json', f'sections 需要 {len(SECTIONS)} 项，每项只有 title、subtitle（顺序同 build_app_content.py 的 SECTIONS）')
        else:
            for x in secs:
                check_text(r, 'en/meta.json', 'section', x['title'], 40)
                check_text(r, 'en/meta.json', 'section', x['subtitle'], 120)
        if not isinstance(meta.get('categories'), dict):
            r.err('en/meta.json', 'categories 需要 {中文类别: 英文类别}')
        for h in han_strings({k: v for k, v in meta.items() if k != 'categories'}, path='meta'):
            r.err('en/meta.json', f'残留汉字 {h}')
        for h in han_strings(list(meta.get('categories', {}).values()), path='categories'):
            r.err('en/meta.json', f'残留汉字 {h}')
    except FileNotFoundError:
        r.err('en/meta.json', '文件不存在')
        meta = {'categories': {}}
    except json.JSONDecodeError as e:
        r.err('en/meta.json', f'JSON 解析失败：{e}')
        meta = {'categories': {}}

    try:
        en_labs = {l['id']: l for l in parse_labs(LABS_EN, 'en/')}
    except (AttributeError, AssertionError) as e:
        r.err('labs/en', f'解析 SDLab.define 失败（id/chapter/title/summary 必须是单引号字符串）：{e}')
        en_labs = {}

    targets = args.chapters or list(range(1, 29)) + [0]
    done: dict[int, dict] = {}
    untranslated: list[int] = []
    for n in targets:
        if n not in range(0, 29):
            r.err('参数', f'章号 {n} 不存在（1–28；0 是通用复盘卡）')
            continue
        bank_p = BANK_EN / f'{n:02}.json'
        card_p = ANSWERS_EN / ('general.md' if n == 0 else f'{n:02}.md')
        lab_files = [l['file'] for l in zh_labs if l['chapter'] == n]
        started = bank_p.exists() or card_p.exists() or any((LABS_EN / f).exists() for f in lab_files)
        if not started:
            untranslated.append(n)
            continue
        item: dict = {}
        if n:
            zh_bank = json.loads((BANK / f'{n:02}.json').read_text())
            if bank_p.exists():
                try:
                    en_bank = json.loads(bank_p.read_text())
                except json.JSONDecodeError as e:
                    r.err(bank_p.name, f'JSON 解析失败：{e}')
                    en_bank = None
                if en_bank is not None:
                    card_ids = {c['id'] for c in zh_cards_list if c['chapter'] == n}
                    item['bank'] = check_en_bank(n, zh_bank, en_bank, heads_by[n], card_ids, r)
            else:
                r.err(f'en/{n:02}.json', '缺少英文题库')
            item['labs'] = check_en_labs(n, zh_labs, en_labs, r)
            _, zsvg = intro_of(mds[n])
            if zsvg:
                p = BANK_EN / f'intro-{n:02}.svg'
                if p.exists():
                    for h in svg_problems(p):
                        r.err(p.name, h)
                else:
                    r.warn(p.name, f'没有英文章节导图，回退到中文版 {zsvg}（图里是中文文字）')
        if any(card_chapter(q['id']) == n for q in catalog):
            item['cards'] = check_en_cards(n, catalog, zh_cards, meta, r)
            for c in item['cards']:
                for b in c['blocks']:
                    if b['kind'] == 'image':
                        p = ANSWERS / 'images' / 'en' / b['image']
                        if p.exists():
                            for h in svg_problems(p):
                                r.err(f'images/en/{b["image"]}', h)
                        else:
                            r.warn(c['id'], f'没有英文插图 images/en/{b["image"]}，回退到中文版（图里是中文文字）')
        done[n] = item

    for w in r.warnings:
        print('警告', w)
    for e in r.errors:
        print('错误', e)
    counts = Counter(ex['type'] for it in done.values() if it.get('bank') for l in it['bank']['lessons']
                     if isinstance(l, dict) for ex in l.get('exercises', []) if isinstance(ex, dict))
    n_cards = sum(len(it.get('cards', [])) for it in done.values())
    n_labs = sum(len(it.get('labs', [])) for it in done.values())
    transl = sorted(n for n in done if n)
    print(f'英语题库 {len([n for n in transl if done[n].get("bank")])} 章，{sum(counts.values())} 题 {dict(counts)}，'
          f'{n_cards} 张口述卡，{n_labs} 个实验；{len(r.errors)} 个错误，{len(r.warnings)} 个警告')
    print(f'已翻译章节：{ranges(transl)}；未翻译章节：{ranges([n for n in untranslated if n])}'
          + ('；通用复盘卡未翻译' if 0 in untranslated else ''))
    if r.errors:
        return 1
    if args.check:
        return 0
    if args.chapters:
        print('生成内容包需要全部章节参数，请去掉章号参数（未翻译的章节会被自动跳过）')
        return 1
    if not transl:
        print('没有任何已翻译章节，不生成')
        return 1

    clean_en()
    img_out = OUT / 'images' / 'en'
    img_out.mkdir(parents=True, exist_ok=True)
    lab_out = OUT / 'Labs' / 'labs' / 'en'
    lab_out.mkdir(parents=True, exist_ok=True)
    chapters = []
    for n in transl:
        bank = done[n]['bank']
        heads = heads_by[n]
        refs = bank['refs']
        _, zsvg = intro_of(mds[n])
        image = None
        if zsvg:
            image = f'en/intro-{n:02}.png'
            src = BANK_EN / f'intro-{n:02}.svg'
            svg_to_png(src if src.exists() else dirs[n] / 'images' / zsvg, OUT / 'images' / image)
        lessons = []
        for lesson in bank['lessons']:
            exs = []
            for ex in lesson['exercises']:
                ex = dict(ex)
                ref = ex.pop('ref', None)
                if ref in refs:
                    ex['refTitle'] = ref.split('#')[0]
                    ex['refAnchor'] = f'd{n}/{heads[refs[ref]]}'
                elif ref:
                    ex['refTitle'] = ref
                    ex['refAnchor'] = f'd29/{ref.lower()}'
                exs.append(ex)
            lessons.append({**lesson, 'exercises': exs})
        labs = [{k: v for k, v in lab.items() if k != 'chapter'} for lab in done[n]['labs']]
        for lab in labs:
            shutil.copy(LABS_EN / lab['file'].removeprefix('en/'), lab_out / lab['file'].removeprefix('en/'))
        chapters.append({
            'number': n, 'title': bank['title'], 'fullTitle': bank['fullTitle'], 'docID': f'd{n}',
            'intro': bank['intro'], 'introImage': image, 'keyPoints': bank['keyPoints'], 'lessons': lessons, 'labs': labs,
        })
    cards = [c for n in sorted(done) for c in done[n].get('cards', [])]
    for c in cards:
        for b in c['blocks']:
            if b['kind'] == 'image':
                src = ANSWERS / 'images' / 'en' / b['image']
                if not src.exists():
                    src = ANSWERS / 'images' / b['image']
                png = Path(b['image']).with_suffix('.png').name
                svg_to_png(src, img_out / png) if src.suffix == '.svg' else shutil.copy(src, img_out / png)
                b['image'] = 'en/' + png
    have = set(transl)
    sections = []
    for i, ((_, _, rg), sec) in enumerate(zip(SECTIONS, meta['sections'])):
        ch = [n for n in rg if n in have]
        if ch:
            sections.append({'id': f's{i + 1}', 'title': sec['title'], 'subtitle': sec['subtitle'], 'chapters': ch})
    course = {'lang': 'en', 'readerURL': meta.get('readerURL', READER_URL), 'sections': sections, 'chapters': chapters,
              'cards': cards, 'untranslatedChapters': [n for n in range(1, 29) if n not in have]}
    body = json.dumps(course, ensure_ascii=False, separators=(',', ':'), sort_keys=True)
    course['version'] = hashlib.sha256(body.encode()).hexdigest()[:12]
    (OUT / 'course.en.json').write_text(json.dumps(course, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + '\n')
    total = sum(len(l['exercises']) for c in chapters for l in c['lessons'])
    print(f'已生成 {(OUT / "course.en.json").relative_to(ROOT)}：{len(chapters)} 章、{total} 题、{len(cards)} 张口述卡、'
          f'{sum(len(c["labs"]) for c in chapters)} 个实验，版本 {course["version"]}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
