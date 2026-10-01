# App Store 元数据：英语（en-US，建议同时用作 en-GB / en-AU / en-CA 的回落）

> 每段文字在代码块里，可直接复制到 App Store Connect「App Store → 版本 → 本地化信息」。字数用 Python `len()` 统计（字符数），已逐项核对。数字（28 章 / 1039 题 / 58 卡 / 48 实验 / 111 课）取自 `course.json` 与 `course.en.json`，视频规模取自 `动画讲解/dist/v1/{zh,en}/manifest.json`。

## 字数核对

| 字段 | 上限 | 实际 | 备注 |
|---|---|---|---|
| 名称 | 30 | 19 | |
| 副标题 | 30 | 28 | |
| 推广文本 | 170 | 161 | 可随时改，无需审核 |
| 描述 | 4000 | 3300 | UTF-8 3316 字节 |
| 关键词 | 100 | 95 字符 / 95 字节 | Apple 帮助页现写「100 bytes」；中文按字节算只能放约 30 个汉字，本组已按字节 ≤100 控制，两种算法都不超 |
| 此版本新增内容 | 4000 | 325 | 首个版本 ASC 可能不显示此栏 |

## 名称 Name（19）

```text
System Design Quest
```

## 副标题 Subtitle（28）

```text
Drill interview-ready design
```

## 推广文本 Promotional Text（161）

```text
1,039 questions, 58 speak-aloud cards and 48 hands-on labs across 28 chapters. Chapter 1 is free; one purchase unlocks the rest. No subscription, ads or account.
```

## 关键词 Keywords（95）

```text
distributed,architecture,backend,scalability,caching,database,sharding,quiz,flashcards,engineer
```

**关键词说明**：名称、副标题里已有 System / Design / Quest / Drill / interview-ready / design，关键词里没有重复这些词；用逗号分隔且不加空格（空格浪费字符）。不放第三方书名或竞品名。

## 描述 Description（3300）

```text
Reading about system design is easy. Explaining it out loud in an interview is the hard part. System Design Quest turns a system design course into short, level-by-level practice: answer a few questions a day, get the reason right when you miss one, review mistakes on a spaced schedule, then close the book and talk through an open question to see whether you can actually explain it.

Who it is for
Engineers who can build CRUD apps but lack a mental model of distributed systems, capacity estimation and failure handling, and who are preparing for backend or system design interviews.

What is inside
• Learning path: 7 sections and 28 units (one per chapter), 111 lessons in total. Lessons and quizzes unlock in order; labs and speak-aloud practice are optional and never block you. Turn on Free Mode in Settings to jump to any chapter.
• 1,039 practice questions: single choice, multiple choice, true/false, fill in the blank, ordering and matching. Options are reshuffled every time. A missed question comes back at the end of the round until you get it right, and the feedback shows the correct answer with an explanation.
• Mistake notebook: missed questions are reviewed after 1, 3, 7 and 16 days; five correct answers in a row count as mastered.
• Speak-aloud practice: 58 open-ended cards. Say your answer out loud first, then compare it with the conclusion, the full explanation and a diagram, and rate yourself from "couldn't recall" to "explained it well". The app schedules your next review from that rating.
• 48 interactive labs: drag the parameters and run preset scenarios to see a rate limiter let through double the traffic at a window boundary, which keys move when a consistent-hash ring gains or loses a node, and how caching and sharding shift the bottleneck. Everything runs offline inside the app.
• Video walkthroughs: one animated explainer of 2 to 5 minutes for each of the 28 chapters, with landscape full screen, caching on your device, and an optional setting to cache automatically only on Wi-Fi. The narration is AI-generated speech.
• Unit guides: an overview, hand-drawn illustrations, key points and related labs for every chapter. Illustrations can be zoomed.
• Study rhythm: XP, streaks, a daily goal and an optional daily reminder. Wrong answers in a lesson cost a heart; you can turn the heart limit off in Settings. Dark mode and iPad are supported.

Free and full version
Chapter 1, including its video, speak-aloud cards and labs, is free to complete. Chapters 2 to 28, the general review cards and their videos unlock with a single one-time in-app purchase, Full Access: pay once, keep it forever, no subscription, and future content updates are included. Your purchase follows your Apple Account and can be restored on a new device.

Privacy and connectivity
No account, no ads, no third-party analytics. Your progress is stored only on your device. Lessons, questions and labs work offline. Videos from chapter 2 onward need a connection to stream or download, and the "read the full text" links open the online reading edition in your browser.

Good to know
There is no cloud sync, so progress does not move between devices. Questions are written from the course text. The app is for study and interview preparation and does not guarantee any outcome.
```

## 此版本新增内容 What's New（325）

```text
First release.

• 28 chapters on a step-by-step learning path
• 1,039 practice questions with explanations
• 58 speak-aloud cards for interview recall
• 48 interactive labs that run offline
• Video walkthroughs for every chapter (English and Simplified Chinese)
• Chapter 1 is free; one-time purchase unlocks the full version
```

## 其它字段

| 字段 | 建议值 |
|---|---|
| 支持 URL（必填） | `https://<your-domain>/support`（占位）。需要一个真实页面，写明联系邮箱和常见问题。过渡方案：`https://github.com/kadaliao/system-design-interview-zh/issues` |
| 营销 URL（可选） | `https://kadaliao.github.io/system-design-interview-zh/`（现有在线阅读版；该站目前是中文内容，英文用户点进去会是中文，需你决定是否填写；不填也可以） |
| 隐私政策 URL（必填） | `https://<your-domain>/privacy`（占位），英文正文见 [privacy.md](privacy.md) |
| 版权 | `© 2026 Kada Liao` |
| 类别 | 与中文区一致：Education（主），Productivity 或 Reference（次，可选）。类别在 ASC 里是全 App 唯一设置，不分语言 |

**英文版前置条件（务必先确认）**：App Store 英文页面承诺「英语」版本，必须保证 App 的界面、课程、题目、实验、视频都有英语版。本文撰写时（2026-10-01），工作区里界面本地化仍在进行：`iOS/` 已出现未提交的 `Localizable.xcstrings`、`InfoPlist.xcstrings` 和 `CFBundleLocalizations: [zh-Hans, en]`，但我没有验证覆盖率（付费墙、设置、答题反馈等是否全部有英文），课程（`course.en.json`）、题库、实验、视频 en 版已具备。**在界面英文化完成并验证前，不要在 ASC 里启用英文本地化，否则英文用户进入 App 会看到中文界面，会被拒绝或收到差评。**

## Age Rating（建议答案，英文界面名称）

Same answers as the Chinese listing; the rating is per app, not per language: all content categories "None", Unrestricted Web Access "No", User-Generated Content "No", Advertising "No", Gambling / Contests / Loot Boxes "None". Expected result: **4+**.


## 提交前核对

- [ ] 名称占用：App 名称在 App Store 全局唯一；若 System Design Quest 被提示已占用，备选 `System Design Quest Prep`（24 字符）或 `Quest: System Design Prep`（25 字符）
- [ ] 描述里没有出现价格数字（各地区价格不同，且价格变动后文案过期）
- [ ] 描述里的「讲解动画」「AI 合成语音」与实际一致
- [ ] 没有提到「Alex Xu」「System Design Interview」书名（见 README 风险项）
