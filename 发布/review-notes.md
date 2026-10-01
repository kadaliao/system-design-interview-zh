# 给 App Review 的备注

> 填写位置：App Store Connect → App 版本页 → **App 审核信息（App Review Information）** → 备注（≤4000 字节，[官方说明](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)）。该 App **没有账号登录**，「登录信息」栏留空并**取消勾选「需要登录」**。联系人姓名、邮箱、电话需你填写。
>
> 本文的事实陈述核对自 2026-10-01 工作区的代码（`iOS/`、`服务端/`）。**标【提交前复核】的句子**依赖尚未落地的部分（视频域名、签发服务、授权），提交前必须按实际情况改，不能原样复制。备注用英文写（审核员读英文最快）。

## 1. 可直接复制的英文备注

```text
SUMMARY
System Design Quest is a study app for engineers preparing for system design interviews: a learning path of 28 chapters, 1,039 practice questions, 58 speak-aloud cards and 48 interactive labs. The interface and content are available in Simplified Chinese and English and follow the device language.

NO ACCOUNT, NO LOGIN
There are no accounts, sign-in, social features or user-generated content. No demo account is needed. Study progress is stored only on the device (a local file in Application Support, plus UserDefaults for a few settings).

FREE VS. PAID
- Free: chapter 1 (lessons, quiz, labs, speak-aloud cards and the chapter 1 video, which is bundled in the app).
- Paid: one non-consumable in-app purchase, "Full Access" (com.kadaliao.SystemDesignQuest.full), unlocks chapters 2-28, the general review cards and the videos of chapters 2-28. No subscription. Restore Purchases is available on the paywall and in Settings > Full Version.

HOW TO TEST THE PURCHASE
1. Sign in with a Sandbox Apple Account (Settings > Developer > Sandbox Apple Account on the test device).
2. Open the app, go to the Path tab and tap any chapter after chapter 1 (for example chapter 2). The paywall appears with the price and a Buy button.
3. Buy. The sheet closes with "Full Version unlocked" and chapters 2-28 open.
4. To test restore: delete and reinstall the app, open the paywall and tap Restore Purchases.

VIDEOS NEED A NETWORK CONNECTION
Each chapter has a short narrated animation. Only the chapter 1 video is bundled (it works offline). Videos for chapters 2-28 are streamed from our CDN over HTTPS and can be cached on the device (Settings > Video Cache has a Wi-Fi-only switch and a clear-cache button). Without a connection the player shows an offline message; lessons, questions, labs and speak-aloud cards all work offline. [PRE-SUBMISSION CHECK: the production CDN domain and the token service must be live and must accept sandbox transactions, otherwise the reviewer cannot play paid videos. Remove this bracket when done.]

AI-GENERATED NARRATION
The narration in the videos is synthesized speech (text-to-speech), not a recording of a person. The video descriptions state this. The explanations are based on the written course text, which was written by the developer.

DATA AND PRIVACY
- No analytics, no advertising, no third-party SDKs, no tracking, no data sold or shared.
- The app itself does not collect personal data. Network requests are limited to: (a) StoreKit (handled by Apple); (b) downloading video files from our CDN, which, like any web server, may log IP address and request metadata; [PRE-SUBMISSION CHECK: (c) a request to our token-issuing service that sends the StoreKit signed transaction (JWS) so we can verify the purchase; it stores nothing but short-lived signed tokens - confirm against the deployed service]; (d) links that open in Safari (online reading edition, GitHub).
- Local notifications (optional daily study reminder) are scheduled on the device; no push notifications and no remote notification server.
- Encryption: the app uses only standard HTTPS provided by the OS (ITSAppUsesNonExemptEncryption = NO).

CONTENT SOURCES
The course is a study edition prepared from the open-source notes at github.com/liquidslr/system-design-notes, which themselves summarize the books "System Design Interview" vols. 1 and 2 by Alex Xu. [PRE-SUBMISSION CHECK: state only what is true - which exercises, labs, illustrations and videos are the developer's own work.] The Settings screen states this attribution. [PRE-SUBMISSION CHECK: do not claim permission here unless you actually have it - see the README risk item. Replace this paragraph with the confirmed licensing statement.]

CONTACT
<your name>, <your email>, <your phone>
```

## 2. 逐条核对（为什么这样写）

| 备注里的说法 | 依据 | 状态 |
|---|---|---|
| 没有账号、没有登录 | `grep` 全部 Swift 源码：没有登录、没有 OAuth、没有 Firebase/Sentry/Amplitude 等 SDK；`import` 只有 SwiftUI、StoreKit、UserNotifications、WebKit、Network、AVKit 等系统框架 | 已核对 |
| 学习记录只在本机 | `ProgressStore.swift` 写 `Application Support/progress.json`；设置项少量写 `UserDefaults`（`Entitlements` 的购买镜像、视频「仅 Wi-Fi」开关、远程视频配置缓存） | 已核对 |
| 联网只有视频下载、StoreKit、外链 | 全部 `URLSession` 使用点：`VideoCache.swift`（下载视频）、`VideoConfig.updateFromRemote`（可选远程小配置，仅当 Info.plist 配了 `VideoRemoteConfigURL` 才发请求，**当前没有配置**）；`Link(destination:)` 在设置页/指南页，实验页 WKWebView 加载包内本地文件，页面里的 http(s) 外链交给系统 Safari。实验与运行时 JS 里没有 `fetch`/`XMLHttpRequest` | 已核对 |
| 签发服务请求（c） | `服务端/README.md` 设计了 `POST /v1/auth`，但 **App 侧目前没有接入**：`TokenVideoURLProvider` 只在测试里使用，`VideoPlayback.swift` 默认用 `DirectVideoURLProvider`（直接拼地址、不带 token） | **未接入，提交前核对** |
| CDN 域名 | `VideoConfig.swift` 里是 `video-cn.example.com` / `video.example.com` 占位，Info.plist 没有 `VideoBaseURLCN/Global` | **占位，提交前必须替换** |
| 本地通知 | `ReminderScheduler.swift` 仅 `UNUserNotificationCenter` 本地调度 | 已核对 |
| 仅 HTTPS 标准加密 | `project.yml`：`ITSAppUsesNonExemptEncryption: NO` | 已核对 |
| 备注里的购买路径 | `PaywallSheet.swift`、`SettingsScreen.swift`（`FullVersionSection`） | 已核对 |
| Settings > Video Cache 的 Wi-Fi 开关 | `VideoCacheSection.swift`（`@AppStorage` 键 `videoWifiOnly`） | 已核对 |
| 视频需联网 | 第 1 章在 `Resources/Content/videos/{zh,en}/ch01.mp4`；其余远程 | 已核对 |

## 3. 审核时的实际风险与对策

1. **审核员买不到/看不到付费视频**：Apple 审核走 Sandbox。`服务端` 的 `ALLOWED_ENVIRONMENTS` 必须包含 `Sandbox`（见 `服务端/README.md` §3 第 6 步）；且审核员所在网络能访问 CDN。**上线后再把 Sandbox 收紧**要先确认审核已通过。如果服务端没准备好，宁可先提交「内容完整但视频入口暂不开放」的版本，而不是让审核员遇到无法播放的锁定视频（Guideline 2.1 App Completeness 常见拒因）。
2. **付费内容在中国大陆无法访问**：若上架中国大陆，大陆审核员/用户必须能访问备案域名的 CDN，见 [compliance-cn.md](compliance-cn.md)。
3. **App 内隐私政策入口**：Guideline 5.1.1(i) 要求在 App Store Connect 与 App 内都能访问隐私政策。**目前 App 的设置页没有隐私政策链接**（只有「在线阅读版」「GitHub 仓库」）。这是代码改动，不在本次文档范围，但建议发版前加上，见 [README](README.md)。
4. **英文用户看到中文界面**：见 [appstore-en.md](appstore-en.md) 的前置条件。
5. **外链指向第三方仓库**：英文版的「在线阅读版」「GitHub 仓库」当前都指向 `liquidslr/system-design-notes`（`ReadingLinks.swift`：`readerHome`/`repo` 在 `.en` 时返回上游仓库）。这会把英文用户导向别人的仓库；是否合适取决于授权和产品意图，**需你决定**。
6. **AI 合成语音**：Apple 目前没有针对「配音为 TTS」的强制标注要求；如实写在备注与描述里即可。中国大陆有强制标识要求，见 [compliance-cn.md](compliance-cn.md)。

## 4. 内容来源与授权声明：需要你确认（风险项）

事实：

- 仓库 `README.md` 写明：课程是基于 `liquidslr/system-design-notes` 英文笔记整理的中文学习版，对应 Alex Xu《System Design Interview》卷 1、卷 2；「原图按字节复制自原仓库，版权归原作者。**原仓库未声明开源许可证**，如原作者对转载有异议，请提 issue 联系」。
- App 设置页脚注同样写明这一来源。
- 即把「整理自他人笔记、笔记又来自受版权保护的书」的内容，翻译成英文并全球**收费**销售。

**我不能替你断言已获授权。** 在没有许可证的仓库里，默认保留所有权利，GitHub 的服务条款只允许在 GitHub 内查看和 fork，不授权商业再发布；原笔记又是对商业书籍的整理，**版权风险在两层**（上游笔记作者、书籍作者及出版方）。App Review 可能因第三方内容（Guideline 5.2 知识产权）接到投诉后下架。需要你做的决定：

1. 联系 liquidslr 和（如适用）《System Design Interview》的作者或出版方取得**书面**授权或确认；
2. 或把付费内容改为你完全原创的部分（题库、实验、视频脚本中哪些完全原创，我没有逐项核实；课程正文与原图明确来自上游）；
3. 或接受风险（不推荐把它写进审核备注里当作「已授权」）。

在你确认之前：上面备注里的 CONTENT SOURCES 段只陈述事实与出处，没有声称授权；ASC 的「内容版权」问卷选「包含第三方内容」，如被问到权利证明，需要你提供文件。
