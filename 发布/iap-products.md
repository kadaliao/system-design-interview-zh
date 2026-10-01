# 内购商品：完整版 / Full Access

> 位置：App Store Connect → 我的 App → 系统设计闯关 → **App 内购买项目**（In-App Purchases，旧称「功能」）→ 创建。限制来源：[Apple 帮助：App 内购买项目信息](https://developer.apple.com/help/app-store-connect/reference/in-app-purchases-and-subscriptions/in-app-purchase-information)（显示名称 2–30 字符、描述 ≤45 字符、参考名称 ≤64、产品 ID ≤100 且保存后不可改、审核备注 ≤4000、审核截图必填）。创建步骤：[官方指引](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/create-consumable-or-non-consumable-in-app-purchases/)。

## 1. 基本信息

| 字段 | 值 | 备注 |
|---|---|---|
| 类型 | 非消耗型（Non-Consumable） | 与代码一致（`Entitlements.swift`，`Products.storekit` 的 `NonConsumable`） |
| 参考名称 | `Full Access` | 仅内部可见，≤64（现 11） |
| 产品 ID | `com.kadaliao.SystemDesignQuest.full` | **保存后不能改，删除后也不能复用**；与 `Entitlements.productID`、`服务端` 的 `APPLE_PRODUCT_IDS` 必须一致 |
| 家庭共享 | **需你决定**：本地配置里是关闭（`familyShareable: false`） | ASC 里开启后**不能再关闭**。一次性买断的课程类 App 开启家庭共享对用户更友好，但会让一份购买被最多 6 人使用；视频服务端按 JWS 验证交易，其对家庭共享交易的处理我没有核对（`服务端/README.md` 未提及），开启前需自行验证 |
| 销售范围 | 跟随 App | 若暂不上架中国大陆，在 App 层面去掉即可 |
| 在 App Store 上显示 | 默认开启即可 | 不做「App Store 推广内购」时无需促销图片（1024×1024），以后想在商品页推广再补 |

## 2. 本地化（字数已核）

| 语言 | 显示名称（≤30） | 描述（≤45） |
|---|---|---|
| 简体中文 | `完整版`（3） | `解锁第 2–28 章全部课程、口述卡与视频，一次购买，永久使用。`（32） |
| 英语（美国） | `Full Access`（11） | `Unlock chapters 2–28, cards and videos.`（39） |

说明：描述只写事实，不写价格；不写「终身」之外的承诺。英文本地化需要等界面英文化完成后再启用（见 [appstore-en.md](appstore-en.md)）。注意：本地化文本的修改也要走审核。

`Products.storekit` 里目前只有 `zh_Hans` 一条本地化、描述是「解锁第 2–28 章全部课程、口述卡与视频，一次购买永久使用。」，与上表中文只差标点；这个文件只用于 Xcode 本地测试，不上传，保持一致更好，可后续补英文条目。

## 3. 价格与销售区域

- **参考价**：¥88（中国大陆）/ $12.99（美国）。TestFlight 阶段已按「以中国为基准价 ¥88，其它地区由 Apple 按汇率自动折算」设定，美国折算为 $12.99（来自你之前的设置记录，**请在 ASC 重新核对**）。
- **以 ASC 价格点为准**：Apple 只允许选用其价格点列表里的价格，并按基准地区自动换算其它地区的价格（含当地税）；不要在文案或截图里写死某个地区的数字，让付费墙显示 `Product.displayPrice`（代码已这样做）。
- 价格设置位置：内购商品页 → **价格计划（Price Schedule）** → 选择基准国家/地区和价格点 → 查看「所有国家/地区的价格」。逐个地区的税后收入由 ASC 在价格表里显示，**本文不预估任何税后收入**。
- **要决定的点**：
  1. 基准地区：用 ¥88 还是 $12.99 作基准。以美元为基准时中国区会得到相近的 CNY 价格点；以人民币为基准时美国区是自动折算值。哪个更合适，取决于你想先保证哪个市场的价格。
  2. 是否对价格敏感地区手动调低（Apple 允许逐区覆盖）。
  3. 是否申请 **App Store 小型企业计划**（Small Business Program），符合条件时佣金比例更低；需要在 ASC 申请，是否符合要看你的年度收入，**需你自行核实资格**。
- **App 本身价格**：必须从「先付费 ¥88」改为 **免费**：ASC → App 信息之外的 **「价格与销售范围」（Pricing and Availability）** → App 价格选「0」。该 App 尚未在 App Store 公开发布过（只有 TestFlight），所以没有已付费用户需要照顾；如果你已经在别处卖出过，需要另行考虑。

## 4. 审核截图（必填，且不能删除只能替换）

截图要求同 App 截图规格（见 [screenshots.md](screenshots.md)），**建议用 6.9" iPhone 的付费墙截图**（1260 × 2736）。内容：

- 第 1 张（必需）：付费墙 `PaywallSheet`，同时看见「解锁完整版 · ¥88」按钮、功能列表和「恢复购买」。
- 可见的商品名称/价格要与 ASC 一致：这张图在沙盒环境下截最好（价格由 StoreKit 返回）。注意用 Xcode 本地 StoreKit 配置截出来的价格是配置文件里的 `88.00`，与线上价格点相同时没问题，不同时要重截。
- 不要截带有 `-unlockAll` 的界面（那会是已解锁状态）。
- 不要在图里放 Apple 商标或 Apple Pay 图标。

命令清单见 [screenshots.md](screenshots.md) 的「付费墙」场景。

## 5. 审核备注（Review Notes，≤4000）

放在内购商品页的「审核备注」。简短版（可直接复制）：

```text
This is the only in-app purchase: a one-time, non-consumable "Full Access" that unlocks chapters 2-28, the general review cards and the videos for those chapters. Chapter 1 (including its video) is free. There is no subscription and no account.

How to reach the paywall: open the app, tap any locked chapter (e.g. chapter 2 on the Path tab). The paywall shows the price, the Buy button and Restore Purchases (also in Settings > Full Version).

Videos for chapters 2-28 are streamed from our CDN and need a network connection. The video entitlement is checked with the StoreKit transaction; use a sandbox Apple Account to buy and watch.

Product ID: com.kadaliao.SystemDesignQuest.full
```

完整的 App 审核备注见 [review-notes.md](review-notes.md)。

## 6. 上线前必须同时满足

1. **付费 App 协议、银行与税务信息**均已生效（ASC → 业务 → 协议、税务和银行业务）。App 之前是付费模式，协议通常已有，但**需你核对状态**；中国开发者另需完成国务院令第 810 号信息（见 [compliance-cn.md](compliance-cn.md)）。
2. 内购商品状态为「准备提交」（Ready to Submit）：本地化 + 价格 + 审核截图都填好。
3. **首个内购必须随 App 新版本一起提交**：在 App 版本页的「App 内购买项目和订阅」区域点「+」选中该商品，再提交审核。
4. 付费视频的服务端（`服务端/`）要先部署并允许 `Sandbox` 环境，否则审核员买完看不到视频（见 [review-notes.md](review-notes.md) 与 [release-runbook.md](release-runbook.md)）。
5. App 里必须有「恢复购买」入口（已有：付费墙和设置页），审核指南对此有要求。
