# 英语版（en）翻译与构建约定

本文是「系统设计闯关」英语内容的唯一约定。你只翻译**自己负责的那一章**，且**只改下面列出的、以你章号命名的文件**，这样 27 位译者并行也不会冲突。第 1 章已完整译好，是所有文件的范例，动手前先通读：

- `练习题库/en/01.json`、`29. 自测题详解/en/01.md`、`交互实验/labs/en/01-scaling.js`
- `练习题库/en/intro-01.svg`、`29. 自测题详解/images/en/a01-*.svg`
- 术语表：[`工具/glossary-en.md`](./glossary-en.md)（必须遵守）

## 1. 文件布局：第 N 章（NN 为两位章号）你负责哪些文件

| 内容 | 中文源（只读，不要改） | 你要新建的英文文件 |
|---|---|---|
| 题库 + 章元信息 | `练习题库/NN.json` | `练习题库/en/NN.json` |
| 章节手绘导图（若中文章节有） | `NN. xxx/images/入门手绘-*.svg`（`intro_of` 取导读附近第一张 SVG） | `练习题库/en/intro-NN.svg` |
| 口述卡（该章全部 Q/P 条目） | `29. 自测题详解/README.md` 里对应的块 | `29. 自测题详解/en/NN.md` |
| 口述卡引用的插图 | `29. 自测题详解/images/<同名>.svg` | `29. 自测题详解/images/en/<同名>.svg` |
| 交互实验 | `交互实验/labs/<文件名>.js` | `交互实验/labs/en/<同名>.js`（该章有几个文件译几个） |

不要修改：`练习题库/en/meta.json`、`交互实验/runtime.js|css`、`工具/` 下任何文件、中文源文件。需要改它们请在报告里说明，由统筹的人处理。通用复盘卡（R-01…R-05）放 `29. 自测题详解/en/general.md`，由单独的译者负责，章节译者不碰。第 27、28 章的 P27-xx、P28-xx 追问卡放在各自章的 `27.md`、`28.md` 里；没有 Q/P 条目的章节没有 `NN.md`。

### 1.1 `练习题库/en/NN.json`

结构与中文 `NN.json` **完全一致**，另加四个章元信息字段：

```json
{
  "chapter": 1,
  "title": "Scaling from Zero to Millions of Users",
  "fullTitle": "Chapter 1: Scaling from Zero to Millions of Users",
  "intro": ["**How to read this chapter**: …"],
  "keyPoints": ["…"],
  "refs": { "Introduction": "引言（Introduction）", "Section 6: Caching": "第 6 节：缓存（Caching）" },
  "lessons": [ … ]
}
```

- `title`：章名短语（App 里的章标题）；`fullTitle`：`Chapter N: ` + 标题。章名取自术语表第 8 节。
- `intro`：对应中文章首「学习导读」（脚本从中文正文 Readme 里取的那几段；先运行下面的小命令看原文）。逐段翻译，保留 `**怎么读这章**：` 这类开头加粗，译成 `**How to read this chapter**: …`。
  ```bash
  python3 -c "import sys;sys.path.insert(0,'工具');import build_app_content as b;d=b.chapter_dirs()[N];print(b.intro_of(b.chapter_md(d).read_text()))"
  ```
- `refs`：题目 `ref` 字段是学习者看到的「回看原文」小节标题。英文题里 `ref` 写**英文小节标题**，并在 `refs` 里登记 `英文标题 → 中文题库里 ref 的原文`（一字不差，用来算出原文锚点）。`ref` 是自测编号（如 `Q01-01`）时英文**原样照抄**，不用登记。同一英文标题不能对应两个中文标题（中文有 `标题#2` 的，英文也写成 `Title#2`，展示时会自动去掉 `#2`）。
- 所有 `id` 与中文**逐一一致、顺序一致**，一个不多一个不少；`type`、`answer`/`answers`（下标）、`[[填空]]` 个数、`options`/`items`/`pairs`/`distractors` 的**个数和位置**与中文一致。选项位置不能因为译文好看而调整。
- 课标题 `title`、`summary` 也要译。
- 允许的行内标记只有 `**粗体**` 和 `` `代码` ``；不要出现链接、图片、HTML。

### 1.2 `29. 自测题详解/en/NN.md`

把中文 README 里本章的每个答案块译过来，格式不变：

```markdown
## Chapter 1: Scaling from Zero to Millions of Users      <- 可选的章标题，会被忽略

<a id="q01-01"></a>
### Q01-01 | English question title

**Conclusion: …** rest of the first paragraph.

Second paragraph …

![English alt text](../images/en/a01-read-your-writes.svg)

**Memory hook: …**
```

- `<a id="…"></a>` 锚点与 `### Q01-01 | …` 编号必须与中文一致（分隔符用 ASCII `|` 或全角 `｜` 均可）。
- **块结构与中文逐段对应**：段落数、列表项数、图、表格的先后顺序、表格行列数都与中文一致（脚本会逐块比较类型序列）。不要合并或拆分段落。
- 首段以 `**Conclusion: …**` 开头（对应 `**结论：…**`）；固定小标签：`**Boundaries**`（边界）、`**Example**`（例子）、`**Memory hook: …**`（记忆提示）、`**The troubleshooting order**`（排查顺序）等，参照第 1 章。
- 图片引用写 `../images/en/<同名>.svg`，文件名与中文版相同；图的 alt 文字也要译。
- 中文里的 `[出处：…]` 行脚本会跳过，可省略；外链保留 URL，链接文字译成英文。

### 1.3 插图 SVG

- 在 `29. 自测题详解/images/en/`（口述卡插图）和 `练习题库/en/intro-NN.svg`（章节导图）里放**同名、同几何**的英文版：复制中文 SVG，只改文字（含 `<title>`、`<desc>`），不动图形与箭头语义。
- 字体：中文版用楷体；英文版把 `font-family:"Kaiti SC","STKaiti","KaiTi","PingFang SC",sans-serif` 换成 `"Avenir Next","Helvetica Neue",Arial,sans-serif`（手绘导图用 `"Chalkboard SE","Comic Sans MS","Marker Felt",cursive`），代码字体保持 Menlo。
- **英文比中文占宽**：中文一字约 1 em，英文一字符约 0.5 em，但一句话字符数是中文的 2–3 倍，框很容易溢出。缩短措辞（标签用名词短语）、必要时微调 `font-size`，不要拉大框改版面。箭头上的标签只有几十像素宽的，用 1–2 个词。
- 必须自己渲染看一遍：`rsvg-convert -w 1200 -b white -o /tmp/x.png file.svg`，检查无文字出框、无重叠。不得残留汉字（包括注释）。

### 1.4 交互实验 `交互实验/labs/en/<同名>.js`

- 复制中文 lab，**只翻译可见文字和注释，逻辑、数字、变量名、CSS、几何一概不动**。可见文字包括：`title`、`summary`、`caveat`、控件 `label`/`hint`、按钮、选项、统计项标签、日志与诊断文案、SVG `text`、预设场景的 `label`/`ask`/`insight`、`ctx.announce`、表头等。
- 固定外框文字（「播放」「下一步」「预设场景」「先猜」「观察」…）由 `runtime.js` 的 i18n 字典负责，**不要**在 lab 里重复写。若你发现外框还有未译的固定文字，报告给统筹。
- 单位与数字格式：`util.fmt`、`util.duration`、`util.bytes` 在英文下已自动用 `en-US` 与英文单位；自己拼接的单位要译（`' 毫秒'` → `' ms'`，`' 次/秒'` → `' req/s'`）。拼接出来的中文量词（`' 台'`、`' 个'`）改成数字本身或带单数/复数的英文。
- **`id:`、`chapter:`、`title:`、`summary:` 必须是不含转义的单引号字符串**（构建脚本用正则读取它们）：英文撇号用 `’`（U+2019），不要用 `\'`。其余位置的字符串里需要撇号时，用模板字符串或 `\'`。
- 英文更长：SVG 节点框里的文字要缩短到不超出框（看 `check-labs.cjs --lang en` 的 "SVG 文字超出框" 报告）；用到 `if(宽度>=N)` 这类按宽度决定显示什么的分支，必要时微调阈值。
- 拼接句子时注意语法：不要照搬中文的 `主语+动词+名词` 拼接顺序，英文要整句重写（第 1 章 lab 里 `Waited 300 ms, then read the primary` 就是整句拼出来的）。
- 不得残留汉字（含代码注释）。

## 2. 翻译风格指南

读者是全球的英语工程师（含非母语者），写成**母语写作的教材**：自然、清楚、有教学口吻，不是逐字翻译。

1. **先理解再重写。** 按英文习惯重组句子；中文里并列的短句常可合成一个主动句。不要保留「的」字结构和长定语堆叠。
2. **口吻**：对学习者讲话，直接、平实，用主动语态和一般现在时；题干对读者用 you（`What should you do first?`）或中性主语；不用 `we`，不写客套话。结论先行：口述卡首段是答案，之后才展开。
3. **术语统一**，照 `glossary-en.md`；同一概念全章同一词，不要为了避免重复而换同义词（`replica` 不要时而 `slave`、时而 `follower`）。术语第一次出现的解释性括号只在中文有时才保留。
4. **保留原样**：代码、标识符、SQL/HTTP 片段、变量名（`min_version=42`）、文件名、产品与协议专名（Redis、Kafka、RabbitMQ、Snowflake、Geohash…）、示例里的名字（E7、A→B）。反引号内容一个字符都不要改。
5. **数字、单位、结论一个都不能变。** 数字一律用阿拉伯数字，不要写成 `ten`、`two`（中文「十倍」「两个」没有数字时除外，英文可写 `10 times`、`two`；但中文有数字时英文必须保留这个数字）。千分位用逗号：`10,000`。**中文的「万/亿」用自然英语写**：`50 万`→ `500,000`，`1,600 万`→ `16 million`，`10 亿`→ `1 billion`（检查脚本会把 万/亿 与 thousand/million/billion、`N × 10,000`、`N × 10^k` 统一换算成同一个数值再比较，所以写 `16 million` 即可，不要写成 `1,600 × ten thousand` 这种生硬形式；注意 10 亿 = 1 billion，不是 10 billion）。百分号、乘号、等号保持中文里的写法（`10,000×2%=200`）。单位译成通用缩写：毫秒 `ms`、秒 `s`、次/秒 `req/s` 或 `per second`。量级结论（「是 10 倍，不是多 18%」）按原意译，不得弱化或加强。
6. **「示意」译作 illustrative**（`illustrative values`），「教学模型」译作 teaching model；不要译成 sample / schematic。「经验值」译 rule of thumb。
7. **不要引用中文版独有的东西**：不说「中文版批注」「准确性批注」「本章中文版」；题库每题必须独立读得懂，不写 `the previous question`（脚本会拦）。需要说明纠正原书时，直接陈述正确事实。
8. **标点**：英文标点，直引号用弯引号 “ ” ’（题库 JSON 里用弯引号可免去转义）；不用全角标点、不用 `「」`、不用破折号连缀长句（`—` 最多每段一次）。列表选项首字母大写，**不以句号结尾**；题干以问号或句号结尾；解析写完整句子。
9. **选项要等长、同风格**：不能因为译文让正确项明显更长（脚本会警告）；干扰项保持中文原有的诱惑力。
10. **大小写**：句首大写，其余小写（术语表另有规定的除外）；课标题、章标题用 Title Case；`fill` 题的词块（答案和干扰词）用小写，嵌入句子里读起来要通顺（`[[replication lag]]`）。
11. **fill 题**：英文语序可以不同，但 `[[ ]]` 个数不变，且答案词块放进句子后要语法正确；干扰词数量与中文一致。
12. **order / match 题**：每一项独立读得懂，不靠上下文代词；match 左列很窄，用 1–3 个词的名词短语。

### 长度上限（英语）

`LIMITS` 里的汉字上限在英语下按字符数校验：中文一字约占 1 em，英文平均一字符约 0.5 em，再留约 10% 给按词换行损失的空间，所以长文本字段 ×2.2；会在窄栏里单行显示的药丸词块和配对左列按 ×2 略收紧。

| 字段 | 中文（字） | 英文（字符） | 字段 | 中文（字） | 英文（字符） |
|---|---|---|---|---|---|
| `prompt` | 120 | 264 | `option` | 40 | 88 |
| `prompt`（单选） | 160 | 352 | `fill.text`（答案换成 `_____` 后） | 90 | 198 |
| `explanation` | 150 | 330 | 词块 chip | 12 | 24 |
| `keyPoints` 每条 | 70 | 154 | `order` 每项 | 26 | 57 |
| 课 `title` | 8 | 18 | `match` 左 / 右 | 12 / 22 | 22 / 48 |
| 课 `summary` | 24 | 53 | | | |

超限时缩短措辞，不要删掉解析里的关键判断。口述卡和 lab 文本没有长度上限，但保持与中文相当的信息量。

## 3. 构建与校验命令

```bash
# 校验第 N 章英语交付（题库、口述卡、实验、插图提示）；0 = 通用复盘卡
python3 工具/build_app_content.py --check --lang en N

# 校验所有已开始翻译的章节；未开始的章节列为“未翻译”，不算错误
python3 工具/build_app_content.py --check --lang en

# 生成英语内容包（只含已翻译章节）；有错误则不生成
python3 工具/build_app_content.py --lang en

# 中文内容包（行为不变；现在只清理自己的产物，保留英语产物和 videos）
python3 工具/build_app_content.py

# 在浏览器里预览英文 lab（file 以 en/ 开头自动切英文；或加 &lang=en）
open "交互实验/preview.html?file=en/01-scaling.js"

# 用 Playwright 跑英文 lab：挂载、跑完全部预设场景和逐步模式、查报错/残留汉字/SVG 文字超框/横向溢出，并截图
cd 动画讲解 && PLAYWRIGHT_MODULE="$PWD/node_modules/playwright" node ../工具/check-labs.cjs --lang en --file 01-scaling.js
```

校验脚本检查的内容（`--check --lang en N`）：

- **题库**：JSON 结构、必填字段、各字段英语长度上限、`id` 与中文一一对应且顺序一致、`type`/`answer`/`answers` 一致、`[[ ]]` 个数、选项/排序项/配对/干扰词个数一致、`ref` 能映射回中文小节或自测编号、中文里出现的数字和反引号代码片段在英文中必须保留（缺失即**错误**；英文多出数字是警告）、不得残留汉字（`refs` 的值除外）、选项里不得有 "all of the above"、题干不得引用其他题。
- **口述卡**：锚点与编号齐全且无多余、块结构与中文一致、首段有 Conclusion、无汉字；数字、代码片段缺失为警告。
- **实验**：英文文件齐全、`id`/`chapter` 与中文一致、可被解析、无汉字。
- **插图**：缺少英文版时**回退到中文 SVG 并给出警告**（构建继续），有英文版时检查无汉字。**交付时不应留有警告。**

英语产物（路径写死，供 Swift 接入）：

| 产物 | 路径（相对 `iOS/SystemDesignQuest/Resources/Content/`） |
|---|---|
| 课程数据 | `course.en.json`（只含已翻译章节；字段与 `course.json` 相同，另有 `lang:"en"`、`untranslatedChapters:[…]`） |
| 插图 PNG | `images/en/…`（JSON 里 `introImage`、卡片 `image` 的值已带 `en/` 前缀，App 仍按 `images/` + 值 取） |
| 实验脚本 | `Labs/labs/en/<文件>.js`（JSON 里 `labs[].file` 为 `en/<文件>.js`）；`Labs/runtime.js|css`、`Labs/lab.html` 与中文共用 |

## 4. 译者自检清单（交付前逐条过）

1. `python3 工具/build_app_content.py --check --lang en N` 输出 **0 个错误、0 个警告**。有警告的数字/代码差异必须逐条确认是有意为之。
2. 题库：随机抽 5 题对着中文看，答案、数字、因果结论没变；单选正确项的位置没变；没有“以上都对”。
3. 通读一遍英文，朗读不拗口，没有中式英语（`Add a cache to relief pressure`）、没有漏译、没有半句中文。题干单独拿出来也读得懂。
4. 术语对照 `glossary-en.md` 逐个核对；同一词全章一致。表里没有、你新定的译法记在最终报告里。
5. 口述卡：每个答案先给结论，步骤、数字、反例、边界都在；链接可点，URL 没丢；图 alt 已译。
6. 插图：用 `rsvg-convert` 渲染成 PNG 亲眼看过，无出框、无重叠、无汉字；文件名与中文版相同。
7. lab：`node 工具/check-labs.cjs --lang en --file <你的文件>` 全绿（场景 N/N、逐步全部完成、错误 0、残留汉字 0、SVG 文字超框 0、溢出 无）；并在 `preview.html` 里亲自点一遍，手机宽度（390px）也看一眼。逻辑没改：同一场景英文版与中文版得到的数字一致（`insight` 里的数字对照原文）。
8. `git status` 里只有你章号的文件（`en/NN.json`、`en/NN.md`、`labs/en/…`、`intro-NN.svg`、`images/en/…`）；没有改动中文源文件和共享文件。
9. 最终报告写：翻译规模（题数、卡数、实验数）、校验结果、术语表之外你新定的译法、你认为原中文有疑点或自己做了取舍的地方。

## 5. 已知限制

- 阅读页（`index.html` / 网页版）和 `runtime.js` 里的「自测练习」面板（读第 29 章 DOM）没有做英文化；英文版只面向 App。
- 英文章节正文（`NN. xxx/Readme.md`）不在本流水线范围内；题目的 `refAnchor`（`d1/…`、`d29/…`）仍指向中文阅读页的锚点，英文阅读页上线后再定。
- 通用复盘卡（`29. 自测题详解/en/general.md`、其插图）和 `meta.json` 以外的全局文案暂未译；`general.md` 缺失时构建只会列为“通用复盘卡未翻译”。
