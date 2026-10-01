# App Store 截图方案

> 本文**只写方案和命令，没有截任何图**：界面本地化仍在进行（`iOS/` 里 `Localizable.xcstrings` 尚未提交），截图应在界面文案定稿、构建号固定之后再做。所有命令都没有执行过，首次运行时请逐条确认（尤其是设备名与 `.app` 路径）。

## 1. 需要的尺寸（Apple 官方，2026-10-01 抓取）

来源：[App Store Connect 帮助：截图规格](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)（已读原文）。每种设备 1–10 张，格式 `.jpg/.jpeg/.png`，**不能有 alpha 通道**。

| 设备 | 要求 | 竖屏像素 | 说明 |
|---|---|---|---|
| iPhone 6.9" | **必需**（App 支持 iPhone） | 1260 × 2736 | 页面把 iPhone 17 Pro Max、16 Pro Max、16 Plus、15 Pro Max 等列为 6.9" |
| iPhone 6.5" | 仅在没有 6.9" 时需要 | 1284 × 2778 | 提供了 6.9" 就不需要 |
| iPhone 6.3 / 6.1 / 5.5 等 | 可选 | 见页面 | 不提供则由更大尺寸缩放 |
| iPad 13" | **必需**（`TARGETED_DEVICE_FAMILY: "1,2"`，App 支持 iPad） | 2064 × 2752 | iPad Pro 13"（M5/M4）、iPad Air 13" |
| iPad 11" 等 | 可选 | 1488 × 2266 等 | 不提供则缩放 |

**注意**：我读到的页面只给了 6.9" 一个像素值 1260×2736，而真机 iPhone 17 Pro Max 的原生分辨率是 1320×2868；Apple 历史上对 6.9" 也接受 1290×2796 / 1320×2868。**以 ASC 上传框的实际提示为准**，若被拒绝，用 `sips -z 2736 1260 in.png --out out.png` 缩放（比例几乎一致）。横屏截图只在需要展示横屏视频时用。

按语言分别上传：**简体中文一套、英语一套**（ASC 每个本地化各自有截图；英文本地化的启用条件见 [appstore-en.md](appstore-en.md)）。前 3 张最重要：搜索结果和商品页首屏主要展示它们。

## 2. 建议的 8 张（每种语言一套，顺序即上传顺序）

> 文案规则：标题短（≤ 14 个汉字 / ≤ 28 个英文字符），副标题一句话；只写 App 里确实有的功能。每张图的画面都出自真实界面。

| # | 场景 | 画面内容 | 中文标题 / 副标题 | English headline / sub |
|---|---|---|---|---|
| 1 | 学习路径 | 蜿蜒的关卡，前 3 章已完成，当前关卡高亮 | 每天一关，稳步闯关 / 28 章课程，按顺序解锁 | Level up, one lesson a day / 28 chapters on a clear path |
| 2 | 答题反馈 | 答错一题，底部弹出正确答案与解析 | 答错当场讲清为什么 / 1039 道题，六种题型 | Learn why you were wrong / 1,039 questions, six formats |
| 3 | 交互实验 | `rate-limiter-race` 实验运行中，播放控制条可见 | 动手看懂分布式 / 48 个交互实验，离线运行 | See it, don't just read it / 48 labs that run offline |
| 4 | 口述练习 | 口述卡：先出声讲，再自评四档 | 合上书，讲一遍 / 58 张口述卡，自评后排复习 | Close the book. Say it out loud. / 58 speak-aloud cards with spaced review |
| 5 | 讲解视频 | 视频播放页（第 1 章，已内置），可用横屏版 | 一章一支讲解动画 / 28 支，可缓存离线看 | A short video for every chapter / Cache them to watch offline |
| 6 | 错题与复习 | 练习页的错题本与到期复习 | 错题按间隔回来 / 1、3、7、16 天复习 | Mistakes come back on schedule / Review after 1, 3, 7 and 16 days |
| 7 | 单元指南 | 章节导读 + 手绘插图（可放大） | 先看图，再做题 / 每章导读、插图与要点 | Start with the picture / A guide, illustrations and key points per chapter |
| 8 | 免费与完整版 | 付费墙：功能列表、价格按钮、恢复购买 | 第 1 章免费，一次买断 / 无订阅，永久解锁 | Chapter 1 is free / One purchase, no subscription |

说明：
- #8 的价格由 StoreKit 返回，截图里会显示某个地区的价格。**不要把价格写进标题文案**（各地区不同）；中文用中国区（¥88），英文用美国区（$12.99）截取，需要用沙盒/本地 StoreKit 配置对应地区（`Products.storekit` 的 `_storefront` 是 `CHN`；截英文图时改为 `USA` 并把 `displayPrice` 改成 `12.99`，**改完要还原，别提交**）。
- 若想强调「连胜、经验、成就」，可以把 #6 换成「我的」页（`-tab profile`）。取舍：本 App 的核心是学习而不是游戏化，建议保留 #6。
- #5 视频：第 2 章起的视频需要联网，且视频域名目前仍是占位，**截图一律用第 1 章内置视频**。
- 画面中**不要出现**调试痕迹、「Debug」标题（`-openExercises` 的会话标题就是 "Debug"，答题截图请用 `-openLesson` 打开真实课程）、测试账号。
- 加标题条/设备边框是可选的：可以直接上传裸截图（最稳妥、符合「截图必须是真实界面」的审核要求）；若要加文字，用网页（HTML + Playwright 截图）或设计软件批量合成，输出尺寸必须保持上表的像素值。

## 3. 可执行命令清单（本机 Xcode / macOS）

### 3.1 准备：设备、构建、安装

```bash
# 列出可用设备，挑一个 6.9" iPhone 和一个 13" iPad
xcrun simctl list devices available | grep -E "iPhone 1[6-9] Pro Max|iPad Pro 13"

# 变量（按实际设备名改）
IPHONE="iPhone 17 Pro Max"
IPAD="iPad Pro 13-inch (M5)"
BID=com.kadaliao.SystemDesignQuest
SHOTS=~/Desktop/sdq-shots          # 输出目录（不在仓库里）
mkdir -p "$SHOTS"/{zh,en}/{iphone,ipad}

# 构建一次 Debug 版（-demo、-unlockAll、-openVideo 等只在这个构建里可用）
cd /Users/liaoxingyi/workspace/system-design-interview-zh/iOS
xcodegen generate
xcodebuild -project SystemDesignQuest.xcodeproj -scheme SystemDesignQuest \
  -configuration Debug -destination "platform=iOS Simulator,name=$IPHONE" \
  -derivedDataPath /tmp/sdq-dd build
APP=/tmp/sdq-dd/Build/Products/Debug-iphonesimulator/SystemDesignQuest.app

# 启动模拟器，固定状态栏与外观
xcrun simctl boot "$IPHONE" 2>/dev/null; open -a Simulator
xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100 --cellularBars 4 --wifiBars 3
xcrun simctl ui booted appearance light
xcrun simctl install booted "$APP"
```

### 3.2 一个通用函数：以指定语言/参数启动并截图

```bash
# 用法：shot <语言 zh|en> <文件名> <设备目录 iphone|ipad> <启动参数...>
shot() {
  local lang=$1 name=$2 dev=$3; shift 3
  local loc="zh-Hans"; local region="zh_CN"
  [ "$lang" = en ] && { loc="en"; region="en_US"; }
  xcrun simctl terminate booted $BID 2>/dev/null
  xcrun simctl launch booted $BID -AppleLanguages "($loc)" -AppleLocale $region "$@"
  sleep 3     # 等界面稳定；动画场景再加长
  xcrun simctl io booted screenshot --type=png "$SHOTS/$lang/$dev/$name.png"
}
```

### 3.3 八个场景（`<lang>` 换成 zh 或 en 各跑一遍）

```bash
# 1 学习路径（前 3 章已完成；-unlockAll 让关卡全部可见）
shot zh 01-path iphone -demo -unlockAll

# 2 答题反馈：先打开真实课程，再用 tap 答错一题（坐标需要先截图确认）
shot zh 02-feedback iphone -demo -unlockAll -openLesson c04-01
#   然后用 MCP 工具点选一个错误选项并点「检查」（见 3.4），等待底部反馈出现再截图：
xcrun simctl io booted screenshot --type=png "$SHOTS/zh/iphone/02-feedback.png"

# 3 交互实验：打开后点「开始/播放」，等 4–5 秒再截（画面里应有流动的请求）
shot zh 03-lab iphone -demo -unlockAll -openLab rate-limiter-race
#   用 MCP tap 点播放，sleep 5，再截图

# 4 口述练习：切到练习页，进入口述卡（用 tap），翻到「看结论」后截
shot zh 04-speak iphone -demo -unlockAll -tab practice

# 5 视频：-openVideo 是 DEBUG 参数；第 1 章内置，离线可播。视频页开始播放后截图
shot zh 05-video iphone -demo -unlockAll -openVideo 1
#   横屏版：Simulator 菜单 Device > Rotate Left（⌘←）后再截图，尺寸会是 2736×1260，再换回竖屏

# 6 错题与复习：错题本在练习页，-demo 数据里有错题
shot zh 06-review iphone -demo -unlockAll -tab practice

# 7 单元指南：在路径页点某章的「指南」图标，点开一张插图（或停留在导读 + 插图）
shot zh 07-guide iphone -demo -unlockAll

# 8 付费墙：不要带 -unlockAll；打开第 2 章课程会被拦截并弹付费墙
shot zh 08-paywall iphone -demo -openLesson c02-01
```

英文同样跑一遍：把 `zh` 换成 `en`（`-AppleLanguages (en)` 会让 `AppLanguage.current` 取英文，课程内容、实验、插图、视频随之切到英文）。**前提**：英文界面已本地化。

iPad：先 `xcrun simctl shutdown "$IPHONE"`，换成 `$IPAD` 启动/安装，再把上面 `iphone` 换成 `ipad` 重跑（iPad 内容限宽居中，注意截图里左右留白是否好看，必要时选「横屏」截图，但需要 ASC 接受 2752×2064）。

### 3.4 需要交互的步骤：用 iOS 模拟器 MCP 工具

`mcp__Claude_Code_iOS_Simulator__control` 可以在不打开 Simulator 窗口的情况下操作；坐标单位是**设备点**（不是像素），先截一张图量出按钮位置：

```text
control(action="launch", app_path="/tmp/sdq-dd/Build/Products/Debug-iphonesimulator/SystemDesignQuest.app", bundle_id="com.kadaliao.SystemDesignQuest")
control(action="screenshot")                  # 先看当前画面，量坐标
control(action="tap", x=200, y=500)           # 点选一个选项（坐标仅示意）
control(action="tap", x=200, y=780)           # 点「检查」按钮（坐标仅示意）
control(action="screenshot")
control(action="swipe", x=200, y=600, x2=200, y2=300)   # 滚动
control(action="open_url", url="...")        # 本 App 没有自定义 URL scheme，不用此项
```

该工具不接受 `-demo` 等启动参数；需要参数时先用 `xcrun simctl launch` 启动（3.2），再用 MCP 做点击和截图。

### 3.5 后处理：去 alpha、核对尺寸、缩放

```bash
cd "$SHOTS"
# 查看像素和 alpha
for f in zh/iphone/*.png; do sips -g pixelWidth -g pixelHeight -g hasAlpha "$f"; done

# 若 hasAlpha 为 yes：转成 JPEG（无 alpha）再转回或直接上传 JPEG
for f in */iphone/*.png */ipad/*.png; do sips -s format jpeg -s formatOptions 95 "$f" --out "${f%.png}.jpg"; done

# 若 6.9" 尺寸不是 1260×2736 而被 ASC 拒绝：缩放（高度、宽度）
sips -z 2736 1260 in.png --out out.png
```

### 3.6 检查清单

- [ ] 每张图 1260×2736（iPhone）/ 2064×2752（iPad）或 ASC 接受的尺寸，无 alpha
- [ ] 中、英各 8 张，顺序一致，文字语言正确（用 `-AppleLanguages` 之后确认 UI 没有残留中文）
- [ ] 状态栏 9:41、满电；没有调试标题 / 测试数据 / 开发者账号信息
- [ ] #8 的价格与 ASC 当前价格点一致
- [ ] 内购审核截图（见 [iap-products.md](iap-products.md)）可复用 #8 的 iPhone 截图
