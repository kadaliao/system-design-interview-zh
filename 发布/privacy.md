# 隐私：营养标签答案、PrivacyInfo.xcprivacy、隐私政策草稿

> **不是法律意见。** 标【需用户核对】的是我无法从代码或仓库确定的事实（主要是 CDN 与云函数的日志保留期、部署位置）。App Store 隐私问卷的填写责任在开发者，答错可能导致审核问题或下架，请对照你**实际部署的服务**再填。
>
> 事实依据（2026-10-01 核对）：`iOS/` 全部 Swift 源码的网络与第三方 SDK 检索；`iOS/project.yml`（无任何 SPM/第三方依赖）；`服务端/README.md` 与 `服务端/src`、`wrangler.toml`。

## 1. 事实盘点：App 实际收集/传输了什么

| 数据流 | 内容 | 去向 | 谁处理 | 备注 |
|---|---|---|---|---|
| 学习记录、设置 | 答题记录、经验、连胜、错题、口述自评、每日提醒时间等 | **仅本机**：`Application Support/progress.json` + `UserDefaults` | 不离开设备 | 没有账号、没有云同步 |
| StoreKit 购买与恢复 | 购买请求、交易 | Apple | Apple（App Store） | 开发者拿不到付款信息，只能在 ASC 看到销售报告 |
| 视频下载/播放（第 2–28 章） | HTTPS 请求视频文件：路径含章节与语言（如 `/v1/zh/ch07.mp4`），付费章节带短时效 token | CDN（大陆：国内 CDN；其他：Cloudflare R2/Worker） | 开发者的 CDN/云服务商 | 服务器端 Web 访问日志通常含 IP、时间、URL、UA。**日志是否开启、保留多久【需用户核对】** |
| 签发服务 `POST /v1/auth` | StoreKit 交易的 JWS（含 `transactionId`、`productId`、`bundleId`、环境、购买日期等）+ 语言 | 签发服务（Worker 或国内云函数） | 开发者 | 按 `服务端/README.md` 与源码：只做验证，**不落库、不写应用日志**；`cf-connecting-ip` 仅作为速率限制的临时键；响应里的 token 只含过期时间、路径前缀和一个交易短指纹，不存储。平台自带日志是否开启【需用户核对】。**注意：App 侧尚未接入此服务**（`TokenVideoURLProvider` 只在测试中使用），接入后此行才成立 |
| 远程视频配置（可选） | 一次 GET，取两个 CDN 基础地址 | 你配置的 URL | 开发者 | 仅当 Info.plist 设置 `VideoRemoteConfigURL` 才发；当前**未配置** |
| 外链 | 设置页/指南页的「在线阅读版」「GitHub 仓库」「回看原文」 | 系统 Safari | GitHub Pages / GitHub | 离开 App，由对方隐私政策管辖 |
| 本地通知 | 每日学习提醒 | 仅本机调度 | 不离开设备 | 无推送、无 APNs 注册 |
| 实验页 | WKWebView 加载包内本地文件，无网络请求 | 本机 | — | 页面里的外链交给 Safari |
| 第三方 SDK / 广告 / 统计 | 无 | — | — | `grep` 无任何分析、广告、崩溃上报 SDK |

## 2. App Store 隐私「营养标签」建议答案

填写位置：ASC → 我的 App → **App 隐私（App Privacy）** → 「开始」。官方说明：[管理 App 隐私](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)；各数据类型定义见 [App 隐私详情](https://developer.apple.com/app-store/app-privacy-details/)（页面未逐字核对，请以页面为准）。

按 Apple 的口径：「收集」指数据被传出设备，且开发者**或其第三方合作伙伴**能保存超过实时处理该请求所需的时间。仅在设备上处理的数据不算收集。

**问卷 1「是否从该 App 收集数据」**

- **方案 A（推荐前提：下面三项都为「是」时选）→ 不收集数据（Data Not Collected）**
  1. CDN/云函数**不开启或不长期保留**包含 IP 的访问日志，或保留仅用于运维排障且很短期（保留多久才算「实时处理所需」Apple 没有给明确天数，**需你自行判断**）；
  2. 签发服务如前所述不持久化交易信息；
  3. 没有任何第三方 SDK。
- **方案 B（任一项为「否」时）→ 收集数据**，则按实际勾选，最可能涉及：
  - **标识符 → 设备 ID**（如果 IP/日志被视为设备标识；Apple 没有单列「IP 地址」，请对照 App 隐私详情页的数据类型定义选择最接近的项）【需用户核对】；
  - **购买 → 购买记录**（如果签发服务或日志留存了交易 ID）。
  - 用途选「App 功能」；**不与用户身份关联**（无账号）；**不用于跟踪**。

**问卷 2「是否用于跟踪」**：**否**。无广告、无数据经纪人、无跨 App 关联。`NSPrivacyTracking = false`。

**我的建议**：先按方案 A 落地——关闭或缩短日志保留，使事实与「不收集」一致；把「实际保留期」写进隐私政策。万一你要保留日志，改选方案 B，不要为了省事硬选 A。

## 3. `PrivacyInfo.xcprivacy`（硬性要求）

现状：`iOS/` 里**还没有** `PrivacyInfo.xcprivacy`（`find` 无结果）。自 2024-05-01 起，上传到 App Store Connect 的 App 使用「必要原因 API（Required Reason API）」却没有在隐私清单里声明原因，会收到 ITMS-91053 之类的邮件并可能被拒。官方说明：[隐私清单](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)、[必要原因 API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)（页面是动态渲染，我没能抓到原文；下面的原因代码来自我对规范的了解与二手资料交叉，**请以 Xcode 归档后的「隐私报告」为准**）。

### 3.1 代码里实际用到的 API 与是否需要声明

| API 类别 | 代码里的使用 | 需要声明？ | 原因代码 |
|---|---|---|---|
| **UserDefaults**（`NSPrivacyAccessedAPICategoryUserDefaults`） | `Entitlements.swift`（购买状态镜像，键 `entitlements.fullAccess.mirror`）、`VideoCache.swift`（`@AppStorage` 的 `videoWifiOnly`）、`VideoConfig.swift`（远程配置缓存）、`VideoCacheSection.swift` | **是** | **`CA92.1`**：读写只供 App 自己使用的信息（不读其他 App/系统写入的数据，也不写给其他 App 读）。已通过检索资料确认该含义（[参考](https://tanaschita.com/ios-privacy-manifests/)） |
| 文件时间戳（`NSPrivacyAccessedAPICategoryFileTimestamp`：`creationDate`、`modificationDate`、`stat` 等） | 检索 `creationDate/modificationDate/contentModificationDate/attributesOfItem/stat` **均无命中** | 否 | 无需 |
| 磁盘空间（`NSPrivacyAccessedAPICategoryDiskSpace`：`volumeAvailableCapacity*`、`systemFreeSize` 等） | 无命中。`VideoCache` 只读了单个文件的 `.fileSizeKey` 用于校验与统计缓存占用 | 否（见下注） | 无需 |
| 系统启动时间（`SystemBootTime`：`systemUptime`、`mach_absolute_time`） | 无命中 | 否 | 无需 |
| 活跃键盘（`ActiveKeyboards`） | 无命中 | 否 | 无需 |

注：`URLResourceKey.fileSizeKey`（单个文件大小）**不属于**我所知的「文件时间戳」或「磁盘空间」类别（那两类只列了日期类与卷容量类 API）。这一点我没能在 Apple 页面原文上核实，**请以 Xcode 的「Generate Privacy Report」/ 上传后 ASC 的邮件为准**；若报告要求，可补 `DiskSpace` 的 `E174.1` 或 `FileTimestamp` 的 `C617.1`，不要预先乱填。
同样需要警惕：**WKWebView 里的 JS** 不属于原生 Required Reason API 范围；包内**没有第三方框架**（`project.yml` 无 `packages`/`dependencies`），所以没有第三方 SDK 的隐私清单要核对。

### 3.2 建议的文件内容

路径建议：`iOS/SystemDesignQuest/PrivacyInfo.xcprivacy`（需要你或负责 iOS 的人加入工程并确认它被打进 App 资源；本次只写文档，**没有改动 iOS 目录**）。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array/>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array>
				<string>CA92.1</string>
			</array>
		</dict>
	</array>
</dict>
</plist>
```

- `NSPrivacyCollectedDataTypes` 为空数组，对应上面的**方案 A**；若选方案 B，要按实际增加条目（`NSPrivacyCollectedDataType`、`NSPrivacyCollectedDataTypeLinked`=false、`NSPrivacyCollectedDataTypeTracking`=false、`NSPrivacyCollectedDataTypePurposes` 含 `NSPrivacyCollectedDataTypePurposeAppFunctionality`）。
- XcodeGen：把文件放在 `SystemDesignQuest/` 源目录下即可被 `sources` 自动收入资源；`xcodegen generate` 后在 Xcode 里确认「Target Membership」。
- **验证**：Archive 后在 Organizer 中右键 → **Generate Privacy Report**，确认汇总里没有未声明项。

## 4. 隐私政策 URL

- 需要一个**公网可访问、非 PDF 的网页**，同时填在 ASC「App 隐私」页的**隐私政策 URL**，并应在 App 内可访问（Guideline 5.1.1(i)；**当前 App 内没有此入口**，建议在「设置」里加一个链接，属代码改动，本次未做）。
- 占位：`https://<你的域名>/privacy`（中文）、`https://<你的域名>/privacy/en`（英文）。过渡方案：放在 GitHub Pages 同站（如 `https://kadaliao.github.io/system-design-interview-zh/privacy.html`），**需要你决定是否使用**，并确认站点真实提供该页面后再填。
- 若上架中国大陆，隐私政策还会在 ICP/App 备案和 Apple 审核里被检查，中文版必须完整（见 [compliance-cn.md](compliance-cn.md)）。

## 5. 隐私政策正文草稿（中文）

> 方括号 `[…]` 是需要你填写或核对的内容；删除不适用的段落。发布前建议由律师审阅，尤其是中国《个人信息保护法》与欧盟 GDPR 的适用性。

```markdown
# 《系统设计闯关》隐私政策

生效日期：[YYYY-MM-DD]　　最近更新：[YYYY-MM-DD]
开发者：[姓名或公司名称]　　联系邮箱：[support@你的域名]

「系统设计闯关」（以下简称「本 App」）是一款系统设计面试学习应用。我们尽量少碰你的数据：本 App 没有账号，不含广告，不含第三方统计或崩溃分析工具，不会跟踪你。

## 一、我们收集什么

**本 App 本身不收集你的个人信息。**

1. 学习记录只保存在你的设备上。答题记录、经验值、连胜、错题本、口述自评、每日提醒时间等，保存在本 App 的本地存储中，我们无法访问，也不会上传。卸载 App 或在「设置」里重置学习进度后，这些数据会被删除。换设备不会同步这些数据。
2. 每日提醒是本地通知，由你的设备按设置的时间触发，不经过我们的服务器。通知权限由你在系统设置中控制。

## 二、联网时会发生什么

本 App 的课程、题目和交互实验可离线使用。只有以下情况会联网：

1. **观看讲解视频（第 2–28 章）。** 播放或缓存视频时，本 App 会向视频服务器请求视频文件。服务器和 CDN 提供商可能按行业惯例记录常规访问日志（如 IP 地址、请求时间、请求的视频文件地址、设备和系统类型），用于保障服务稳定与防止滥用。日志[不保留 / 保留不超过 [N] 天后自动删除]，不用于识别你个人，也不会提供给第三方用于广告。[大陆地区用户的请求由境内 CDN 处理，其他地区用户的请求由境外 CDN 处理。]
2. **验证购买以播放付费视频。** 播放付费视频时，本 App 会把 App Store 为你的购买出具的签名交易凭证发送到我们的验证服务，用来确认你已购买完整版并换取短时间有效的播放凭证。验证服务只做校验，不保存凭证内容、不建立用户档案；[如平台日志保留，补充说明]。
3. **购买与恢复购买。** 由 Apple 通过 App Store 处理。我们不会收到你的付款信息、姓名或 Apple ID，只能在 App Store Connect 中看到汇总的销售数据。请参阅 [Apple 隐私政策](https://www.apple.com/legal/privacy/)。
4. **外部链接。** 「在线阅读版」「回看原文」「GitHub 仓库」等链接会在系统浏览器中打开，由对应网站（如 GitHub）按其自己的隐私政策处理你的访问数据。

## 三、我们不做什么

不要求注册或登录；不展示广告；不使用第三方分析、崩溃上报或广告 SDK；不跟踪你跨 App 或网站的行为；不出售、出租或共享你的个人信息。

## 四、未成年人

本 App 面向准备系统设计面试的工程师，并不专门面向 14 周岁以下儿童，我们也不会有意收集儿童的个人信息。

## 五、你的权利

因为我们不持有你的个人账号数据，通常无需更正或删除。如果你认为我们在日志中保留了与你有关的信息，可以通过上面的邮箱联系我们，我们会在 [15] 个工作日内回复。[如适用：按《个人信息保护法》/GDPR 说明你的查阅、更正、删除、撤回同意等权利及行使方式。]

## 六、政策变更

如有变更，我们会更新本页面的「最近更新」日期，重大变更会在 App 更新说明中提示。

## 七、联系我们

[姓名或公司名称]　[邮箱]　[通讯地址（如适用）]
```

## 6. Privacy Policy draft (English)

> Same placeholders and review caveats as above. This is a draft, not legal advice.

```markdown
# System Design Quest Privacy Policy

Effective date: [YYYY-MM-DD]    Last updated: [YYYY-MM-DD]
Developer: [name or company]    Contact: [support@your-domain]

System Design Quest ("the App") is a study app for system design interviews. We keep data handling to a minimum: there are no accounts, no ads, no third-party analytics or crash-reporting SDKs, and no tracking.

## 1. What we collect

**The App itself does not collect personal information.**

1. Your study progress stays on your device. Answers, XP, streaks, the mistake notebook, speak-aloud self-ratings and reminder settings are stored locally; we cannot access them and they are never uploaded. Deleting the App or resetting progress in Settings removes them. They do not sync between devices.
2. The daily reminder is a local notification scheduled by your device. You control notification permission in iOS Settings.

## 2. When the App uses the network

Lessons, questions and labs work offline. The App connects only when you:

1. **Watch videos (chapters 2-28).** The App requests video files from our video servers. Like most web servers and CDNs, they may keep standard access logs (for example IP address, request time, the requested video URL, device and OS type) to keep the service running and to prevent abuse. Logs are [not retained / deleted after [N] days], are not used to identify you, and are not shared with third parties for advertising. [Requests from mainland China are served by a CDN in mainland China; other requests by a CDN outside mainland China.]
2. **Verify your purchase to play paid videos.** The App sends the signed transaction receipt that the App Store issued for your purchase to our verification service, which confirms that you own Full Access and returns a short-lived playback token. The service only verifies; it does not store the receipt contents or build user profiles. [Add a note if platform logs are retained.]
3. **Buy or restore a purchase.** Handled by Apple through the App Store. We do not receive your payment details, name or Apple Account; we only see aggregate sales data in App Store Connect. See [Apple's Privacy Policy](https://www.apple.com/legal/privacy/).
4. **Open external links.** Links such as the online reading edition and the GitHub repository open in your browser and are governed by those sites' own privacy policies.

## 3. What we do not do

We do not require sign-up, show ads, use third-party analytics/crash/advertising SDKs, track you across apps or websites, or sell, rent or share your personal information.

## 4. Children

The App is intended for engineers preparing for interviews and is not directed to children under 13 (or under 16 where applicable). We do not knowingly collect children's personal information.

## 5. Your rights

Because we do not hold account data about you, there is normally nothing to correct or delete. If you believe we hold log data about you, contact us at the address above and we will respond within [30] days. [If applicable: describe GDPR/CCPA rights and how to exercise them.]

## 6. Changes

We will update the "Last updated" date on this page and mention material changes in the App's release notes.

## 7. Contact

[Name or company]  [email]  [postal address if required]
```

## 7. 上线前要核对的事实（会改变上面答案）

- [ ] CDN（国内与 Cloudflare）是否开启访问日志、保留期多久、是否导出给第三方分析 →【需用户核对】决定方案 A/B 与政策里的 `[N] 天`；
- [ ] 签发服务实际部署的平台是否保留请求日志（Cloudflare Workers Logs/Logpush、阿里云 FC / 腾讯云 SCF 的日志服务默认保留期）→【需用户核对】；
- [ ] 是否把大陆用户与海外用户的请求严格分开处理（`APP-INTEGRATION.md` 第 1 节的设计），政策里「境内/境外」措辞要与之一致；
- [ ] App 侧确实接入了签发服务后，再回头确认第 2 节「签发服务」那一行；
- [ ] 隐私政策网页已上线并可打开，App 内有入口，ASC 里填的 URL 一致。
