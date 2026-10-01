# 动画讲解 · 制作规范（给负责单章的 agent）

目标：为《系统设计面试》一章做一支 **2–4 分钟、纯代码生成** 的动效讲解视频，帮读者看懂书里「看文字不够明白」的机制。样片是 `ch05/`（一致性哈希），**先看它的成片效果和 `ch05/scenes.js` 的写法，再动手**。成片：1920×1080、30fps、**只有女声旁白 + 烧录字幕，没有背景音乐**。

## 你的产出（只动你自己的目录 `chNN/`）

```
动画讲解/chNN/script.json   旁白脚本 [{id, text}]，每项 = 一个场景
动画讲解/chNN/scenes.js     export const meta = {no, title, en}; export const scenes = {id: (lt, d, sc) => 绘制}
动画讲解/chNN/out/chNN-标题.mp4   成片（out/ 与 build/ 已被 .gitignore，不进 git）
```

**不要修改** `lib/`、`ch05/`、别的章节目录；**不要 git commit**。需要的新组件写在你自己的 scenes.js 里。发现 `lib/` 有 bug：写进最终报告，别自己改（多个 agent 并行，改 lib 会互相踩）。

## 流程

1. **读章节**：`动画讲解/../NN. 章节名/Readme.md`（含「批注」）和 `images/` 里的原图（只用来理解，**不嵌入图片**，全部用代码重画）。再读 `../29. 自测题详解/README.md` 里本章对应的 `Q{NN}-*` 题，视频应能帮读者答对这些题。
2. **定范围**：一支视频讲透本章**最难懂、最适合用动画表达的那条主线**（机制、数据流、时序、权衡），不是把章节朗读一遍。8–12 个场景，总长 2–4 分钟（上限 4.5 分钟）。概念性强的章节（如第 1–3 章）可以用「演进过程 / 对比 / 估算流程」做动画。
3. **写脚本** `script.json`：第一项必须是 `{"id":"title",...}`（片头，一句话点题，如「第七章，唯一 ID 生成器。用两分钟，看懂它。」），最后一项是总结。每个场景旁白 60–160 个汉字，口语、一句一意。
   - 忠于原书：术语、数字、结论以章节正文为准，**不要编造书里没有的数据或事实**；你补充的例子/示意数字要在画面上标「示意」。
   - 旁白要适合朗读：不写 markdown、代码、`%`/`→`/`≥` 等符号（说成「百分之」「大于等于」）；英文缩写保持常见写法（QPS 写成「QPS」即可）；数字用口语（「每秒十万次」）。
4. **合成旁白并拿真实时长**：
   ```bash
   cd 动画讲解 && node lib/tts.mjs chNN && node lib/dump.mjs chNN   # 打印每个场景的 起点 +时长
   ```
   场景时长 d = 0.7（前导）+ 旁白时长 + 1.0（尾留白）；**旁白在场景局部时间 lt=0.7 开始**，汉字语速约 4.5–5 字/秒。**按真实时长编排动画节拍**，让画面动作落在旁白说到那一句的时候。改了旁白文本，重跑 tts 会自动重合成变化的段落。
5. **写 `scenes.js`**（见下面骨架与规范），用静帧迭代：
   ```bash
   node lib/still.mjs chNN --scene <场景id> 1 4 8 --sheet build/sheet.jpg   # 取场景内相对时刻，拼成 2 列总览图
   ```
   然后用 Read 工具**看图**，逐场景检查（见「质检清单」）。
6. **出片**：`node lib/make.mjs chNN`（旁白→时间轴→混音→逐帧渲染，全局最多 2 个渲染并行，会自动排队，约 1.5–4 分钟；不要同时手开多个渲染）。出片后用 `ffprobe` 确认时长/音轨，再抽 3–4 帧（`ffmpeg -ss T -i 成片 -frames:v 1 f.png`）复查最终画面。
7. **最终报告**（给主 agent，≤15 行）：成片路径与时长、场景列表（id + 一句话）、有意简化/示意之处、遇到的 `lib/` 问题、没做到的地方。如实写，别美化。

## scenes.js 骨架

```js
import { ctx, W, H, clamp, lerp, P, eOut, eIO, eBack, MONO, SANS, INK, MUTE, DIM, RED, SC,
         rr, glass, text, glow, dot, badge, header, arrow, box, dbIcon, packet, statCard, bullet, hbar } from '../lib/core.js';

export const meta = { no: 7, title: '唯一 ID 生成器', en: 'Unique ID Generator' };

function sceneIntro(lt, d) {            // lt = 场景内秒数（纯函数：同一 lt 必画出同一画面！）
  header(lt, '01', '为什么不能用自增 ID', SC[2], '分库之后会撞号');   // 左栏大标题（STEP 编号、标题、强调色、副标题）
  const a = eOut(P(lt, 1.0, 1.6));      // P(t,a,b)=在[a,b]内 0→1；eOut/eIO/eBack 为缓动
  box(900, 400, 220, 120, 'DB-1', { color: SC[0], sub: 'auto_increment', a });
  arrow(1130, 460, 1330, 460, { color: SC[3], p: eOut(P(lt, 1.8, 2.6)) });
  bullet(0, '两台库各自自增 → 同一个 ID', eOut(P(lt, 2, 2.6)));
  statCard(110, 600, 640, '撞号概率', '100%', { color: RED, a: eOut(P(lt, 4, 4.6)) });
}
export const scenes = { /* title 可省略（用默认片头）；也可自定义 title: (lt)=>{...} */ intro: sceneIntro };
```

`lib/core.js` 导出的组件：`header`（左栏标题）、`bullet`（左栏要点）、`statCard`（数字卡）、`hbar`（条形）、`box`（服务方框，`hot` 红色告警）、`dbIcon`（数据库圆柱，`fill` 表示满度）、`arrow`（`p` 控制绘制进度）、`packet`（沿线移动的数据包）、`glass/badge/text/dot/rr/glow`（基础）、`defaultTitle`。场景函数签名是 `(lt, d, sc)`，`sc.id` 是场景 id。外壳（章节标签、进度点、**字幕**）由播放器自动画，你不用管。

## 设计语言（必须统一）

- **深色底 + 玻璃卡片 + 霓虹描边/发光**，已由背景和 `glass/box` 提供；颜色用 `SC`（青/靛/粉/琥珀/青柠）区分角色，`RED` 只表示失败/告警/热点/坏结果，青柠 `SC[4]` 表示新增/成功。同一角色（如「缓存」「数据库」）在全片保持同一种颜色。
- **版面**：左栏 x∈[110,750] 放 `header` + 要点 + 数字卡（要点从 y≈430 起）；舞台 x∈[800,1840]、y∈[150,920]；**y≥940 是字幕区，任何内容都不得进入**。字号：标题 70、正文 ≥26、标签 ≥20，小于 20 的字看不清。
- **用运动讲机制，不是做 PPT**：每个场景至少有一个「会动、有因果」的核心动画（数据包流动、元素迁移、计数变化、状态切换、时间轴推进、曲线绘制），文字只作标注。要点/卡片按旁白节奏**逐条出现**，不要一次全显示。
- 动效：入场用 `eOut`/`eBack`，位移用 `eIO`；不要闪烁、不要抖动；同屏同时运动的主体不超过 2–3 个，其余静止或变暗（降低 alpha）来突出重点。
- 数字/标识用 `MONO`；关键结论用一张 `statCard` 或 `badge` 点出；对比（前后、A/B 方案）并排或先后出现，并用相同刻度。
- 片尾场景：用 3 张玻璃卡总结本章 3 个关键词（参考 ch05 `sceneEnd`），不要放二维码/水印。
- 不嵌入位图/外链字体/外部库；只用 Canvas 2D + `lib/core.js`。随机效果必须用 `rnd(i)`/`hash32`（确定性），**绝不能用 Math.random() 或 Date.now()**，否则逐帧渲染会闪。

## 质检清单（出片前逐项过，用静帧看）

- [ ] 每个场景在 3 个时刻（刚入场 / 中段 / 结束前）的画面都看过：无文字重叠、无越界、无被字幕压住的内容、无空白大面积失衡。
- [ ] 动画节拍与旁白对得上（旁白说到「加一台服务器」时画面正在加；不是提前或落后很多）。
- [ ] 所有数字、术语、流程与章节正文一致；示意数据标了「示意」。
- [ ] 场景结束前画面保持稳定至少 0.8 秒（旁白讲完后有留白，别在最后一秒还在乱动）。
- [ ] `node lib/make.mjs chNN` 无 `[pageerror]` / `[scene missing]` 报错；成片时长、音轨正常。

## 已知小坑（先行 agent 反馈）

- `eBack(0)` 因浮点误差会返回略大于 0 的值：用 `p > 0` 判断「是否已入场」会在入场前露出一帧，请用 `p > 0.02`，或把缩放/透明度用 `clamp(...)` 包住。
- 旁白换了文本会自动重合成；`still.mjs --sheet` 只有一个时刻时也能出图。
- 自测题详解里并非每章都有对应的 `Q{NN}-*`，没有就跳过，在报告里说明即可。
- 机器高负载时渲染会排队很久，这是正常的：不要重复启动渲染，**不要 kill 任何渲染进程**（可能是别人的）。`still.mjs` 的 `--sheet` 路径相对 `chNN/` 目录。

---

# 英语版（`--lang en`）制作规范

任务：为已有的中文视频 `chNN` 做**英语版**。中文版是定稿，不要改动它的任何文件（`script.json`、`scenes.js`、`durations.json`、`out/*.mp4`、`build/` 下除 `en/` 外的内容）。

## 文件与命令

```
chNN/script.en.json     英语旁白（场景 id 与中文版完全一致，顺序一致）
chNN/scenes.en.js       英语场景（从 scenes.js 复制后翻译画面文字、调整版面）；meta.title 改成英文章名，meta.en 同英文章名
chNN/build/en/          英语版构建产物（已被 .gitignore）
chNN/out/en/chNN-<English Title>.mp4   成片
```

所有命令都在 `动画讲解/` 目录下运行，加 `--lang en`：

```bash
node lib/tts.mjs chNN --lang en && node lib/dump.mjs chNN --lang en   # 英语旁白（默认音色 en-US-AvaNeural）并打印每个场景的时长
node lib/still.mjs chNN --lang en --scene <场景id> 1 4 8 --sheet build/en/sheet.jpg
node lib/make.mjs chNN --lang en                                       # 一键出片（会排队渲染）
```

## 旁白怎么写（最重要）

- **不是逐字直译**。按中文版每个场景要表达的意思，重新写成自然、口语化、适合朗读的英语：一句一意，短句，主动语态，像一位清晰的老师在讲解。
- 术语用业内标准说法（rate limiter、token bucket、consistent hashing、quorum、idempotency key……）。首次出现缩写时可说全称，之后用缩写。
- 数字要念得出来：写 "ten million" 而不是 "10,000,000"，"about three and a half thousand per second"，百分比写 "percent"；不要写代码、`%`、`→`、`≥` 等符号。
- **事实与数字必须与中文版和章节正文一致**，不要新增事实。画面上标「示意」的地方，英文标 "illustrative"。
- 时长：英语朗读约 2.5 词/秒，一个场景旁白大约 55–110 词；总长不要超过 4.5 分钟。英语通常比中文啰嗦，**主动精简**，保留最关键的因果。
- 第一项 `{"id":"title",...}`：一句话点题，如 "Chapter 4, the rate limiter. Let's see how it works in a few minutes."；最后一项是总结。

## 画面文字与版面

- `scenes.en.js` 里**所有给人看的中文都要翻译**（标题、要点、标签、卡片、徽标、注释、「示意」）。代码标识（`s0`、`k1`、`GET`、函数名）保持原样。出片前用 `grep -nP '[\x{4e00}-\x{9fff}]' chNN/scenes.en.js` 检查，除了代码注释，不应再有汉字。
- **英语文字更宽**：同样的位置放英文会溢出。逐个场景检查：左栏宽 640px，标题 70px 的英文章名/步骤标题最好 ≤ 22 个字符，太长就缩短措辞或用 `ctx.measureText` 自适应字号；标签 ≥ 20px；卡片内文字不得越界；仍然不得进入 y≥940 的字幕区。英文字幕由播放器自动拆成单行短句，你不用管。
- 字体已由播放器按语言切换为系统无衬线体（`SANS` 是实时绑定的，写 `font: SANS` 即可）。`MONO` 不变。
- 动画节拍按**英语**旁白的真实时长重新对齐（`dump.mjs --lang en` 给出每个场景的起点和时长，旁白在 lt=0.7 开始）。中文版的时间点直接复制过来多半是错的。

## 质检清单（在中文版清单基础上）

- [ ] `script.en.json` 与中文版场景 id、顺序、数量完全一致；旁白听起来自然，无翻译腔。
- [ ] `scenes.en.js` 无残留中文文字；每个场景 3 个时刻（入场/中段/结束前）的静帧都看过，无溢出、重叠、字幕区侵占。
- [ ] 数字、术语、结论与中文版一致；示意数据标了 "illustrative"。
- [ ] `make.mjs --lang en` 无 `[pageerror]` / `[scene missing]`；成片在 `chNN/out/en/`，时长 ≤ 4.5 分钟，有音轨。
- [ ] 没有改动中文版任何文件。

最终报告（≤12 行）：成片路径与时长、与中文版有意不同之处（精简了什么）、发现的术语或事实疑点（若中文版可能有误，请指出但不要擅自改中文版）、遗留问题。
