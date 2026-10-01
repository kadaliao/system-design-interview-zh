# 发布手册：从「代码完成」到「提交审核」

> 沿用 TestFlight 阶段的做法（App ID 6816876606，Bundle ID `com.kadaliao.SystemDesignQuest`）。**所有命令都没有在本次编写中运行过**，首次执行请逐条核对。凭证只引用路径和环境变量名，不在文档里出现任何密钥内容。API 密钥文件位于 `~/.appstoreconnect/private_keys/`（文件名形如 `AuthKey_<KEY_ID>.p8`）。
>
> 约定的环境变量（放在你自己的 shell 配置或一个**不提交**的 `.env` 里）：
>
> | 变量 | 含义 |
> |---|---|
> | `TEAM_ID` | Apple 开发者团队 ID（`project.yml` 的 `DEVELOPMENT_TEAM` 故意留空，命令行传入） |
> | `ASC_KEY_ID` | App Store Connect API 密钥 ID |
> | `ASC_ISSUER_ID` | API 密钥的 Issuer ID |
> | `ASC_KEY_PATH` | `$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8` |

## 1. 版本号与构建号规则

- `MARKETING_VERSION`（用户看到的版本，`CFBundleShortVersionString`）：首个公开版本用 `1.0`。之后：修 bug 用 `1.0.1`；新增章节/功能用 `1.1`；破坏性大改用 `2.0`。**版本号一旦随某个已上架版本发布就不能回退。**
- `CURRENT_PROJECT_VERSION`（构建号，`CFBundleVersion`）：纯整数，**同一版本号下每次上传都必须比之前大**，建议全局单调递增（不随版本号重置），避免混淆。
- 两处都只改 `iOS/project.yml`（`settings.base`），然后 `xcodegen generate`，不要手改 `.xcodeproj` 或 `Info.plist`（`Info.plist` 里的 `CFBundleShortVersionString`/`CFBundleVersion` 由构建设置覆盖；检查归档产物里实际值）。
- 每次上传前先查 ASC 上已有的最大构建号（TestFlight 阶段上传过 `1.0 (1)`，之后是否又传过请查）：

```bash
# 生成 JWT 需要 ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH；上传前查已有构建，避免重复构建号
# 方式一：网页 ASC → TestFlight → iOS 构建版本
# 方式二：API（需要自己用 ES256 签 JWT）：GET https://api.appstoreconnect.apple.com/v1/apps/6816876606/buildUploads
```

## 2. 发版前的代码与内容检查（本地）

- [ ] 内容包与题库校验：`python3 工具/build_app_content.py --check`；改过章节正文/第 29 章/实验/题库则重新生成并提交：`python3 工具/build_app_content.py`（需要 `rsvg-convert`）。
- [ ] 单元测试：

```bash
cd /Users/liaoxingyi/workspace/system-design-interview-zh
xcodebuild -project iOS/SystemDesignQuest.xcodeproj -scheme SystemDesignQuest \
  -destination 'platform=iOS Simulator,name=iPhone 17' test
```

- [ ] **占位符与配置**（这是最容易漏的）：
  - `iOS/SystemDesignQuest/Store/VideoConfig.swift` 里 `video-cn.example.com` / `video.example.com` 是占位；真实域名要么写进 Info.plist（`VideoBaseURLCN`、`VideoBaseURLGlobal`，可选 `VideoRemoteConfigURL`），要么改常量。**Release 构建里全局搜索 `example.com` 不应再命中真实请求路径**：`grep -rn "example.com" iOS/SystemDesignQuest --include='*.swift' | grep -v Tests`。
  - **签发服务尚未接入 App**：`TokenVideoURLProvider` 目前只在测试中使用，`VideoPlayback.swift` 默认走 `DirectVideoURLProvider`（直接拼 URL，不带 token）。如果希望第 2–28 章视频只对付费用户开放，必须先把签发逻辑接入（`服务端/README.md` §6 的调用约定），并部署服务；否则视频地址只靠不可猜测来保护（`APP-INTEGRATION.md` §3 最后一段）。
  - `RootView.swift` 里 `-videoUnlockAll` 启动参数**没有被 `#if DEBUG` 包住**，Release 构建里也会绕过视频权限检查（需要有人能给 App 传启动参数，普通用户做不到，但建议包进 `#if DEBUG`）。`-unlockAll` 已确认只在 DEBUG 生效。
  - `PrivacyInfo.xcprivacy` 存在并声明 UserDefaults `CA92.1`（见 [privacy.md](privacy.md)）。
  - 设置页有隐私政策链接（Guideline 5.1.1(i)，见 [privacy.md](privacy.md) 第 4 节）。
  - 界面本地化覆盖：用 `-AppleLanguages (en)` 全屏走一遍（路径、答题、实验、口述卡、付费墙、设置、通知文案、`InfoPlist` 显示名）。
- [ ] 视频：`动画讲解/dist/v1/{zh,en}/` 已上传到 CDN 并可访问；`videos.json` 与 `manifest.json` 的 sha256 一致；第 1 章已打包进 `Resources/Content/videos/{zh,en}/ch01.mp4`。
- [ ] 签发服务（若启用）：在测试域名上用一张**沙盒交易 JWS** 跑通 `POST /v1/auth`（`服务端/README.md` §3 第 7 步），`ALLOWED_ENVIRONMENTS` 含 `Sandbox`（审核和 TestFlight 都是沙盒）。

## 3. 生成工程、归档、导出、上传

```bash
cd /Users/liaoxingyi/workspace/system-design-interview-zh/iOS

# 1) 提高 project.yml 里的 CURRENT_PROJECT_VERSION（和/或 MARKETING_VERSION），然后生成工程
xcodegen generate

# 2) 归档（Release，自动签名，用 API 密钥让 Xcode 代为创建/更新证书与描述文件）
OUT=/tmp/sdq-release; rm -rf "$OUT"; mkdir -p "$OUT"
xcodebuild archive \
  -project SystemDesignQuest.xcodeproj -scheme SystemDesignQuest \
  -configuration Release -destination 'generic/platform=iOS' \
  -archivePath "$OUT/SystemDesignQuest.xcarchive" \
  DEVELOPMENT_TEAM="$TEAM_ID" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

# 3) 导出配置（不含密钥；teamID 用变量展开写入）
cat > "$OUT/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${TEAM_ID}</string>
  <key>signingStyle</key><string>automatic</string>
  <key>uploadSymbols</key><true/>
</dict></plist>
EOF

xcodebuild -exportArchive \
  -archivePath "$OUT/SystemDesignQuest.xcarchive" \
  -exportOptionsPlist "$OUT/ExportOptions.plist" \
  -exportPath "$OUT/export" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$ASC_KEY_PATH" \
  -authenticationKeyID "$ASC_KEY_ID" \
  -authenticationKeyIssuerID "$ASC_ISSUER_ID"

# 4) 上传到 App Store Connect（altool 会按 ASC_KEY_ID 到 ~/.appstoreconnect/private_keys/ 找密钥文件）
xcrun altool --upload-app -f "$OUT/export/SystemDesignQuest.ipa" -t ios \
  --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID"
```

注意：

- 开着代理/VPN（`utun`）时，`altool` 可能报 TLS `-9816`，但内部重试后常常仍会成功。**重传前先查 ASC 的构建列表**，避免重复构建号（TestFlight 阶段的经验）。
- ASC 的 App 记录只能在网页创建（API 做不到）；这次是**修改现有记录**，不需要新建。
- 上传后 ASC 处理构建需要几分钟到几十分钟，期间邮件会提示「处理完成」或缺少合规信息（如 ITMS-91053 缺隐私清单）。
- 导出合规：`ITSAppUsesNonExemptEncryption = NO` 已写入 `project.yml`（只用系统 HTTPS）。

## 4. TestFlight 内测检查表（提交审核前必须过一遍）

内部测试组「内部测试」（见你的 TestFlight 配置）。**真机**为主，模拟器不能代替。

购买与权益
- [ ] 全新安装：第 1 章全部免费可玩；点第 2 章弹付费墙，价格正常显示（沙盒/TestFlight 购买不真实扣款）
- [ ] 购买成功：付费墙关闭并出现「完整版已解锁」，第 2–28 章、口述卡、视频同时解锁
- [ ] 删除重装 → 恢复购买：付费墙与设置页的「恢复购买」都能恢复，且提示正确（含「没有可恢复的购买」分支）
- [ ] 换另一台设备同一 Apple ID：恢复购买有效
- [ ] **退款/撤销**：沙盒没有真实的退款流程；用 Xcode → Debug → StoreKit → Manage Transactions（本地 StoreKit 配置）模拟退款，确认 App 收到 `Transaction.updates` 后收回权限；服务端对 `revocationDate` 的处理见 `服务端/README.md` §7（不查在线吊销，已签发 token 要等过期）。真机沙盒的重置路径（设置 → 开发者 → Sandbox Apple Account → 管理）以实际 iOS 版本为准（我没有核实）
- [ ] 购买中途取消、等待批准（询问购买，`pending`）、断网时购买，各给出正确提示
- [ ] 离线启动：已购买用户离线也保持解锁（用本地镜像 + StoreKit 本地交易），第一次联网后再校验

视频
- [ ] 第 1 章视频离线可播（已内置）；第 2 章起联网播放，首次播放秒开
- [ ] **横屏**全屏、旋转、回到竖屏后其它页面仍为竖屏（`OrientationController`），含 iPad
- [ ] **弱网/断网**：用「设置 → 开发者 → Network Link Conditioner」（需先在 Xcode 的 Additional Tools 里装）或连接限速 Wi-Fi：缓冲、失败提示与重试、下载断点续传；蜂窝网络下的流量提示、「仅 Wi-Fi 缓存」开关
- [ ] 视频缓存：看完后离线再播；设置里清除缓存后占用归零
- [ ] 视频页上有 AI 合成语音的说明（若已实现，见 [compliance-cn.md](compliance-cn.md) 第 5 节）
- [ ] 签发服务：付费视频在购买后能播；`401 STALE`（交易凭证太旧）时，是否提示「恢复购买」并能恢复（`服务端/README.md` §6 第 3 条，**需在 TestFlight 里验证 `signedDate` 的实际新旧**）

语言与界面
- [ ] 系统语言设为英语：界面、课程、题目、实验、插图、视频全部是英文，没有中文残留
- [ ] 系统语言设为繁体中文：按设计走中文内容（`AppLanguage.resolve` 对任何 `zh*` 取中文）
- [ ] 系统语言设为日语等其它语言：回落英文
- [ ] iPhone 小屏（SE 级）、大屏、iPad 竖屏/横屏；深色模式；动态字体放大
- [ ] 读屏软件 VoiceOver 抽查主流程（README「已知缺口」里写明没做过实测）

存档与升级
- [ ] **旧存档升级**：先装旧 TestFlight 构建（例如 1.0 (1)）并产生进度（连胜、错题、口述自评、实验完成），再升级到新构建，所有进度保留（`ProgressStore` 新字段有默认值）
- [ ] 存档损坏（改坏 `progress.json`）：App 会另存 `progress-unreadable-*.json` 并提示，不覆盖
- [ ] 「重置学习进度」只清学习记录，不影响购买权益

其他
- [ ] 每日提醒：授权、关闭、当天已学不提醒、更改时间；无通知权限时的引导
- [ ] 红心、连胜、经验的边界（跨天、时区改变）
- [ ] 外链（在线阅读版、GitHub、回看原文）用 Safari 打开
- [ ] 电量/发热：看视频与跑实验各 10 分钟

## 5. 提交审核前的最后检查（ASC 上逐项）

按先后顺序，位置均在 App Store Connect → 我的 App → 系统设计闯关。

1. **价格与销售范围**：App 价格改为「免费」；销售范围（是否含中国大陆，见 [compliance-cn.md](compliance-cn.md) 第 0 节）。
2. **协议、税务与银行**（业务 → 协议）：付费 App 协议有效；中国开发者的 810 号信息已完成。
3. **内购商品**：按 [iap-products.md](iap-products.md) 创建并填好本地化、价格、审核截图，状态「准备提交」。
4. **App 信息**：名称、副标题、类别、内容版权声明、年龄分级问卷（见 [appstore-zh-Hans.md](appstore-zh-Hans.md)）。
5. **App 隐私**：按 [privacy.md](privacy.md) 填写，隐私政策 URL 已上线可访问。
6. **欧盟 DSA 交易商状态**（ASC → 业务 → 合规信息，[官方说明](https://developer.apple.com/help/app-store-connect/manage-compliance-information/manage-european-union-digital-services-act-trader-requirements/)，可访问）：需你声明自己是否为「交易商」；如是，联系信息会显示在欧盟地区商品页上，不完成无法在欧盟分发——**这是你的决定**。
7. **版本页**：截图（[screenshots.md](screenshots.md)）、描述、关键词、推广文本、支持 URL、营销 URL、版权；选择已处理完的构建；**把内购商品附加到该版本**。
8. **App 审核信息**：联系人、备注（[review-notes.md](review-notes.md)，把【提交前复核】的句子改成最终版）；无需登录。
9. **版本发布方式**：建议选「手动发布」，等 CDN、签发服务、官网/隐私页都确认正常后再点发布；分阶段发布（Phased Release）对**新 App 首发**没有意义。
10. **本地确认**：用 Release 构建在真机上走一遍「全新安装 → 付费墙 → 沙盒购买 → 看第 2 章视频」；检查归档里没有 `Products.storekit`（已在 `project.yml` 的 `excludes` 排除）、没有 `-unlockAll` 路径。
11. **授权风险**：确认 [README.md](README.md) 里「内容授权」一项已有结论。
12. 点「添加以供审核」→「提交以供审核」。

## 6. 提交之后

- 状态：等待审核 → 审核中 → 正在处理/可销售，或「被拒」。被拒则按 Resolution Center 的指引在同一版本上补充说明或换构建，常见原因见 [review-notes.md](review-notes.md) 第 3 节。
- 审核通过后，**先别急着收紧服务端**：`ALLOWED_ENVIRONMENTS` 里的 `Sandbox` 要等审核结束、且 TestFlight 不再需要时再去掉。
- 上线当天：
  - [ ] 用一台真机从 App Store 下载（免费）、购买、恢复购买，各走一遍（真实扣款后可在 ASC 里申请退款或留着）
  - [ ] 各地区商品页检查：名称、截图、价格显示、语言
  - [ ] CDN 带宽、签发服务请求量、`401/403` 比例（尤其 `STALE`、`REVOKED`）、大陆源与海外源的可用性
  - [ ] ASC → 分析（App Analytics）、销售和趋势、评分与评论；Xcode Organizer 的崩溃与能耗报告
  - [ ] 隐私/备案页面是否仍可访问
- 一周内：整理评论与支持邮件里的高频问题，规划 `1.0.1`（构建号加 1，`MARKETING_VERSION` 改为 `1.0.1`，走本手册第 3–5 节；更新说明用 [appstore-zh-Hans.md](appstore-zh-Hans.md) 的格式）。
- 内容更新：改章节正文、题库、实验后先 `build_app_content.py`，**题目编号是学习记录的主键**，改写保留编号、删除的不复用（`iOS/README.md`）。视频换版要发布 `v2` 目录而不是覆盖 `v1`（`APP-INTEGRATION.md` §2）。
