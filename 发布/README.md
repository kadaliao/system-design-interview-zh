# 「系统设计闯关」上架与发布材料

编写日期 2026-10-01，基于分支 `feature/iap-i18n-video` 的工作区（含未提交改动）。**本目录只有文档，没有改动任何代码、没有访问或修改 App Store Connect、没有创建任何账号。** 文案里的数字都已从数据文件重新核对（见下表）。

| 文件 | 内容 |
|---|---|
| [appstore-zh-Hans.md](appstore-zh-Hans.md) | 中文 App Store 元数据（名称/副标题/推广文本/描述/关键词/新增内容）、字数核对、类别理由、年龄分级答案 |
| [appstore-en.md](appstore-en.md) | 英文元数据，同上；含「英文本地化启用条件」 |
| [iap-products.md](iap-products.md) | 内购「完整版 / Full Access」：本地化、审核备注、审核截图、价格与区域说明、上线前条件 |
| [review-notes.md](review-notes.md) | 给 App Review 的英文备注（含逐条代码核对表、风险与对策、内容授权风险项） |
| [privacy.md](privacy.md) | 隐私营养标签建议答案、`PrivacyInfo.xcprivacy`（API 类别与原因代码）、中英隐私政策草稿 |
| [compliance-cn.md](compliance-cn.md) | 中国大陆合规检查表（备案、许可、教育类审批、AI 标识、税务、版权），含来源链接与核实状态 |
| [screenshots.md](screenshots.md) | 截图尺寸、每种语言 8 张的场景与文案、可执行命令清单（未执行） |
| [release-runbook.md](release-runbook.md) | 从代码完成到提交审核、上线后监控的操作手册 |

## 核对过的规模数字

| 项 | 数值 | 来源 |
|---|---|---|
| 章 / 分段 | 28 章 / 7 个分段 | `course.json`、`course.en.json` |
| 课程 / 题目 | 111 节课 / **1039** 道题 | 同上（两种语言一致） |
| 口述卡 / 实验 | **58** 张 / **48** 个 | 同上 |
| 中文视频 | 28 支，103.1 分钟，134.6 MB（128.4 MiB），单支 3.07–5.92 MB，时长 2.2–4.6 分钟 | `动画讲解/dist/v1/zh/manifest.json` |
| 英文视频 | 28 支，109.3 分钟，148.2 MB（141.3 MiB），单支 3.28–6.07 MB，时长 2.3–4.5 分钟 | `动画讲解/dist/v1/en/manifest.json` |
| 内置视频 | 仅第 1 章：中文 4.96 MB / 224 秒，英文 5.56 MB / 244 秒 | `Resources/Content/videos/`、`videos.json` |
| 需联网视频（第 2–28 章） | 中文约 123.7 MiB，英文约 136.0 MiB | 两份 manifest 减去第 1 章 |

注：`动画讲解/APP-INTEGRATION.md` 里写的「英语视频还没有做」「只有中文」已过时，现在 `dist/v1/en/` 已有 28 支英文视频。

## 上架清单（按先后顺序）

标记：**【已完成】** 已在仓库或你的账号里；**【你做】** 需要你亲自操作；**【决定】** 需要你拍板；**【等】** 需要等外部结果；**【代码】** 需要代码改动（本次未做，需要你或其它任务处理）。

### A. 先拍板的决定（会影响后面所有步骤）

1. **【决定】内容授权**：课程整理自 `liquidslr/system-design-notes`（该仓库未声明许可证），而它又来源于 Alex Xu 的书。收费并翻译成英文全球发售前，需要你确认授权或调整范围。详见 [review-notes.md](review-notes.md) 第 4 节。**这是最大的非技术风险，建议在花时间做后面所有事之前先解决。**
2. **【决定】是否首发包含中国大陆**：我建议首发不含大陆，备案、经营许可、教育类审批都有不确定性（[compliance-cn.md](compliance-cn.md) 第 0 节）。
3. **【决定】价格**：以 ¥88 还是 $12.99 为基准、是否逐区调整、是否申请小型企业计划（[iap-products.md](iap-products.md) 第 3 节）。
4. **【决定】是否开启家庭共享**：一旦开启不能关闭（[iap-products.md](iap-products.md) 第 1 节）。
5. **【决定】英文版何时上线**：英文本地化要等界面本地化完成并验证；也可以先只上线中文本地化。
6. **【决定】主类别**：「教育」更贴切，但在中国大陆备案时可能被引导到教育类；可考虑「效率」或「参考」（[appstore-zh-Hans.md](appstore-zh-Hans.md)）。
7. **【决定】欧盟 DSA 交易商状态**：个人开发者是否声明为交易商（影响欧盟分发与公开展示的联系信息）。

### B. 代码与服务端（上架前必须完成，否则审核或体验会出问题）

8. **【代码】视频地址与签发服务**：`VideoConfig.swift` 里还是 `example.com` 占位；签发服务只有代码（`服务端/`），**未部署，App 侧也未接入**（`TokenVideoURLProvider` 只在测试里）。在此之前，付费视频没有真正的门控，审核员也看不到真实视频。**【你做】** 部署 CDN、域名、签发服务并用沙盒交易 JWS 联调（`服务端/README.md`）。
9. **【代码】`PrivacyInfo.xcprivacy`**：当前不存在，必须新增并声明 UserDefaults `CA92.1`（[privacy.md](privacy.md) 第 3 节）。
10. **【代码】设置页加隐私政策链接**：Guideline 5.1.1(i) 要求 App 内可访问。
11. **【代码】界面英文本地化完成**（`Localizable.xcstrings`/`InfoPlist.xcstrings` 目前是未提交文件，覆盖率未验证；`INFOPLIST_KEY_CFBundleDisplayName` 目前只有中文「系统设计闯关」，英文显示名需在 `InfoPlist.xcstrings` 提供）。
12. **【代码】`-videoUnlockAll` 建议包进 `#if DEBUG`**（`RootView.swift`，Release 里也会绕过视频权限）。
13. **【代码】视频页的 AI 合成语音标识**（中文文案建议见 [compliance-cn.md](compliance-cn.md) 第 5 节）。
14. **【代码】英文版的外链**：英文下「在线阅读版」「GitHub 仓库」当前指向上游 `liquidslr/system-design-notes`（`ReadingLinks.swift`），是否合适请决定（涉及授权与产品意图）。

### C. 你需要在页面/账号里完成的事

15. **【你做】托管网页**：支持页、隐私政策页（中英），拿到真实 URL 替换文档里的占位（`https://<你的域名>/…`）。营销 URL 可用现有在线阅读版（中文站）。
16. **【你做】App Store Connect → 业务 → 协议、税务和银行业务**：确认付费 App 协议有效、银行与税务信息；中国开发者完成国务院令第 810 号信息（[compliance-cn.md](compliance-cn.md) 第 6 节）。
17. **【你做】价格与销售范围**：把 App 价格由「先付费」改为免费；设定销售国家/地区（先不含大陆则取消勾选）。
18. **【你做】创建内购商品**「完整版 / Full Access」，产品 ID `com.kadaliao.SystemDesignQuest.full`，填本地化、价格、审核截图（[iap-products.md](iap-products.md)）。
19. **【你做】App 信息**：名称、副标题、类别、内容版权声明、**年龄分级问卷**（预期 4+）、**App 隐私问卷**与隐私政策 URL（[privacy.md](privacy.md)）。先核对 CDN 与云函数的日志保留，**答案取决于它**。
20. **【你做】版本页**：中文本地化的截图/描述/关键词/推广文本/支持与营销 URL/版权；英文本地化等条件满足后再启用；选构建、附加内购；填 App 审核信息与备注（[review-notes.md](review-notes.md) 中【提交前复核】的句子必须改成最终版）。
21. **【你做】截图**：界面定稿后按 [screenshots.md](screenshots.md) 生成（iPhone 6.9"、iPad 13" 各一套，每种语言 8 张）。
22. **【你做】DSA、出口合规等页面**（出口合规已在 Info.plist 声明为不使用需豁免的加密，ASC 通常不再追问，以页面为准）。

### D. 构建与测试

23. **【你做】** 按 [release-runbook.md](release-runbook.md) 第 2–3 节检查、归档、上传新构建（构建号必须大于已有构建）。
24. **【你做】** 完成 TestFlight 内测检查表（真机购买/恢复/退款、横屏视频、弱网、英文系统语言、旧存档升级，[release-runbook.md](release-runbook.md) 第 4 节）。**【等】** 构建处理完成与内测反馈。

### E. 提交与上线

25. **【你做】** 提交审核前最后检查（[release-runbook.md](release-runbook.md) 第 5 节），选择「手动发布」，提交。
26. **【等】** 审核结果（通常数天，不保证）；被拒按 Resolution Center 的说明处理。
27. **【你做】** 审核通过后确认 CDN/签发服务正常，手动发布；上线后监控（[release-runbook.md](release-runbook.md) 第 6 节）。
28. **【等 / 并行】** 中国大陆合规（如要上架）：通管局咨询、备案、域名备案、AI 标识实现；拿到备案号后在 ASC 填写并追加中国大陆销售范围。

## 我没有核实、需要你留意的点

- 全部命令（xcodebuild、altool、simctl、sips）和 ASC 页面路径都是依据文档和你之前的 TestFlight 经验写的，**没有运行**；ASC 界面文案可能与我写的略有差异。
- 年龄分级问卷的题目措辞以 ASC 实际页面为准；隐私标签的最终答案取决于你实际部署的服务（[privacy.md](privacy.md)）。
- 中国大陆的部分政策（经营许可、视听许可、教育类审批）没有权威结论，已标注「未定论/未核实」。
- 这些文档**不是法律意见**。
