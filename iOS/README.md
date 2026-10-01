# 系统设计闯关（iOS）

把这套课程做成多邻国式的学习、练习 App：沿着学习路径一关关闯，每关 8～10 道短题，答错当场讲清为什么，错题按间隔复习，开放题合上书口述再自评。全部内容离线可用，学习记录只存在本机。

## 功能

| 模块 | 说明 |
|---|---|
| 学习路径 | 7 个分段、28 个单元（每章一个），蜿蜒排列的关卡：课程、交互实验、口述练习、单元测验。必修关卡按顺序解锁，实验和口述是选修，不挡路；设置里可开「自由模式」全部解锁。 |
| 闯关答题 | 单选、多选、判断、选词填空、排序、配对六种题型。选项每次重新打乱；答错的题在本轮末尾再出一次，直到答对。底部反馈给出正确答案、解析和「回看原文」（跳到在线阅读版对应小节）。 |
| 红心与经验 | 闯关答错扣一颗红心（上限 5 颗，每 30 分钟恢复一颗）；随机练习不扣红心，完成还能赚回一颗；可在设置里关闭红心限制。一课 10 XP，全对再加 5 XP。 |
| 连胜与目标 | 每天完成一次学习就续上连胜，每连续 7 天奖励一次连胜保护（最多 2 次，断一天自动消耗）。每日 XP 目标可选 10/20/30/50，可开每日提醒（当天学过就不提醒）。 |
| 错题本 | 答错或配对时配错过的题进入错题本，按 1、3、7、16 天的间隔复习（Leitner 盒子），连续答对 5 次即掌握。 |
| 口述练习 | 第 29 章的 58 道开放题：先出声讲，再看结论、完整解析和图解，按「没想起来 / 想起一部分 / 基本讲清 / 讲得很透」自评，简化 SM-2 决定下次复习时间。 |
| 交互实验 | 阅读页的 48 个实验在 App 里离线运行（WKWebView 加载 `交互实验/` 的同一份代码）。选中预设场景时参数由场景设定，手动控件收起；收起场景后可接着手动调整。播放控制条固定在屏幕底部，点开始后舞台自动滚进视野；导航栏右上角的「做完了」记录完成、获得经验并返回，已完成的实验在标题下标注「已完成」。 |
| 单元指南 | 每章导读、手绘插图（点按全屏查看，可双指缩放、双击放大）、4～6 条要点、实验列表和在线全文链接。口述卡里的图解同样可以放大。 |
| 我的 | 连胜、总经验、完成课程、一次答对率、口述与实验进度，最近 7 天经验图、学习日历、13 枚成就。 |

界面支持夜间模式和 iPad（内容限宽居中）。

## 构建与运行

需要 Xcode 16 以上（iOS 18 SDK）。在 Xcode 27 / iOS 27 模拟器上开发和测试。

```bash
open iOS/SystemDesignQuest.xcodeproj
```

选 `SystemDesignQuest` scheme 和一台模拟器运行即可。装到真机需要在 target 的 Signing & Capabilities 里选自己的 Team（仓库里 `DEVELOPMENT_TEAM` 留空）。

工程由 [XcodeGen](https://github.com/yonaskolb/XcodeGen) 从 `project.yml` 生成，改了文件结构或构建设置后重新生成：

```bash
cd iOS && xcodegen generate
```

单元测试（判分、答题状态机、红心/连胜/间隔复习、路径解锁、存档读写、内容包完整性）：

```bash
xcodebuild -project iOS/SystemDesignQuest.xcodeproj -scheme SystemDesignQuest -destination 'platform=iOS Simulator,name=iPhone 17' test
```

## 内容包

App 读取 `SystemDesignQuest/Resources/Content/`，它由仓库根目录的脚本生成，和源文件一起提交：

```bash
python3 工具/build_app_content.py --check    # 只校验题库
python3 工具/build_app_content.py            # 校验并重新生成内容包（需要 rsvg-convert）
```

脚本做这些事：

- 校验 `练习题库/*.json`（字段、编号、长度、题型搭配、`ref` 出处是否真实存在），规范见 [练习题库/README.md](../练习题库/README.md)；
- 从各章 Markdown 提取标题、导读和导读插图，从 `29. 自测题详解/` 提取 58 道开放题的结论、解析和图解（SVG 转成 PNG）；
- 解析 `交互实验/labs/*.js` 的实验清单，复制实验运行时和 `lab-host.html`；
- 写出 `course.json`，`version` 是内容哈希，设置页可以看到。

改了章节正文、第 29 章答案、交互实验或题库之后都要重新生成并提交内容包，否则 App 里还是旧内容。**题目编号是学习记录的主键**：改写题目时保留编号，删掉的编号不要复用。

## 调试启动参数

在 scheme 的 Arguments 里添加，或用 `xcrun simctl launch booted com.kadaliao.SystemDesignQuest <参数>`：

| 参数 | 作用 |
|---|---|
| `-demo` | 用内存里的示例进度启动（学完前 3 章、连胜 12 天、有错题），不读写真实存档 |
| `-tab practice` / `-tab profile` | 启动后切到练习 / 我的 |
| `-openLesson c04-02` | 直接打开某一课 |
| `-openExercises c04-01-01,c04-04-03` | 把指定题目组成一轮练习打开，检查题型渲染用 |
| `-openLab rate-limiter-race` | 直接打开某个交互实验 |
| `-unlockAll` | 仅 DEBUG 构建：视为已购买完整版（Release 里无效） |

## 代码结构

```
SystemDesignQuest/
  App/        入口、全屏页面路由、演示数据
  Model/      course.json 的结构、题目解码、只读课程索引
  Engine/     判分与出题顺序、答题状态机、学习路径解锁、红心/连胜/错题/口述卡调度
  Store/      学习进度（Application Support/progress.json）、成就、每日提醒
  UI/         学习路径、答题、练习、口述卡、实验、我的、设置
SystemDesignQuestTests/   Swift Testing 单元测试
lab-host.html             实验宿主页（复制为 Content/Labs/lab.html）
project.yml               XcodeGen 工程定义
```

学习记录是单个 JSON 文件，新字段都有默认值，旧存档可以直接读；读不出来时会另存一份 `progress-unreadable-*.json` 再从头开始，不会覆盖。

## 已知缺口

- 没有账号和云同步，换设备进度不跟随；没有排行榜。
- 只在模拟器上验证过，没有真机和读屏软件实测。
- 「回看原文」「阅读全文」打开的是在线阅读版，需要联网；题目、答案、实验都离线可用。
