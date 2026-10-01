# 视频鉴权服务端

为 iOS App「系统设计闯关」提供第 2–28 章视频的付费门控。设计依据：`动画讲解/APP-INTEGRATION.md` 第 1–3、7 节。本目录只含代码、测试和文档，**没有部署到任何云，也不含任何账号或密钥**。

```
App ──(StoreKit 2 JWS)──▶ 签发服务 ──▶ token / 签名 URL
 │                         ├─ 海外：Cloudflare Worker（src/worker）
 │                         └─ 大陆：国内云函数（src/cn）
 └──(带 token 的地址)──▶ 视频源
                          ├─ 海外：同一个 Worker 从 R2 读取并校验 token
                          └─ 大陆：国内 CDN（URL 鉴权，由 CDN 边缘校验）
```

| 路径 | 作用 |
|---|---|
| `src/shared/storekit.ts` | StoreKit 2 JWS 验证（WebCrypto，Workers 与 Node 20+ 通用） |
| `src/shared/x509.ts` | 最小 X.509/DER 解析 + ECDSA 证书签名校验 |
| `src/shared/apple-roots.ts` | 内置 Apple Root CA G3 |
| `src/shared/token.ts` / `range.ts` / `config.ts` | HMAC token、Range 解析、环境变量解析 |
| `src/worker/index.ts` + `wrangler.toml` | 海外 Worker |
| `src/cn/cdn-sign.ts` | 阿里云 A/B/C、腾讯云 A/B/C/D、七牛 签名函数 |
| `src/cn/handler.ts` / `server.ts` | 国内签发逻辑（平台无关）/ Node HTTP 入口 |
| `test/` | 49 个测试 |

命令：`npm install`；`npm test`（node:test + tsx）；`npm run typecheck`；`npm run build:cn`（产出单文件 `dist/cn/index.cjs`，无运行时依赖）；`npm run dev:worker`（本地 workerd）。

## 1. 验证库：为什么自己实现，而不是用 Apple 官方库

评估对象：[apple/app-store-server-library-node](https://github.com/apple/app-store-server-library-node)（`SignedDataVerifier`）。按其仓库当前源码（2026-10-01 读取）：

- 证书链验证用 `node:crypto` 的 `X509Certificate`、`createHash`、`verify`，OCSP 与证书解析用 `jsrsasign`，JWT 用 `jsonwebtoken`，HTTP 用 `node-fetch`；
- 这些依赖里，`node:crypto` 的 `X509Certificate`、`jsonwebtoken` 对 Workers 运行时的兼容性，**Cloudflare 文档与 Apple 文档都没有说明**，我也没有在 workerd 里实测官方库；
- 生产环境验证还要求提供 `appAppleId`。

结论：不赌兼容性，用 WebCrypto 自己实现（约 400 行，无运行时依赖），换来的取舍是：**不做 OCSP 在线吊销检查**（Workers 里也不适合；退款/撤销靠 JWS 里的 `revocationDate`，见 §7 限制），以及证书解析器只支持 Apple 链用到的 EC 证书。如果你日后在 Node 服务端（大陆云函数）想换回官方库，接口 `verifyStoreKitTransaction` 的入参出参很薄，替换成本低。

### 验证项（`verifyStoreKitTransaction`）

1. JWS 三段、`alg` 必须是 `ES256`、`x5c` 存在；
2. 证书链：每张证书由下一张签发（ECDSA，支持 SHA-256/384/512，P-256/P-384/P-521）；链终点必须是内置 Apple Root CA G3（DER 完全一致），或由它签发（`x5c` 没带根时自动补）；中间证书必须是 CA；叶/中间证书必须带 Apple 私有扩展 OID（叶 `1.2.840.113635.100.6.11.1`、中间 `1.2.840.113635.100.6.2.1`，取自官方库 `jws_verification.ts`，可用 `requireAppleOids:false` 关闭）；证书有效期按 `signedDate` 判断（与官方库一致，可改 `certTimeBasis:"now"`），容忍 60 秒偏差；
3. ES256 签名（叶证书 P-256）；
4. `bundleId`、`productId`（白名单）；
5. `environment`：默认只允许 `Production`，可配置（`ALLOWED_ENVIRONMENTS`）；`Xcode` / `LocalTesting` 由本地证书签发，无法验证，永远会被证书链校验拒绝；
6. `revocationDate` 存在即拒绝；`expiresDate` 存在且已过期则拒绝；
7. `signedDate` 新鲜度：不能晚于 now+5 分钟，不能早于 now−`MAX_SIGNED_AGE_SECONDS`（默认 7 天，0=不检查）。

错误码 → HTTP：`MALFORMED`→400；`UNSUPPORTED_ALG/BAD_CHAIN/UNTRUSTED_ROOT/CERT_EXPIRED/BAD_SIGNATURE/STALE`→401；`WRONG_BUNDLE/WRONG_PRODUCT/WRONG_ENVIRONMENT/REVOKED/EXPIRED`→403。

### Apple 根证书的核对与更新

- **来源**：Apple PKI 页面 <https://www.apple.com/certificateauthority/> 列出 Apple Root CA - G3，下载地址 <https://www.apple.com/certificateauthority/AppleRootCA-G3.cer>。我在 2026-10-01 从该地址下载并用 openssl 解析：Subject `CN=Apple Root CA - G3, OU=Apple Certification Authority, O=Apple Inc., C=US`，有效期至 2039-04-30，SHA-256 指纹 `63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79`，内置的 base64 即该文件内容。
- **没有核对到的**：Apple 页面本身不公布指纹，所以上面的指纹是对官方下载文件的计算值，不是 Apple 声明值；我也没有拿到一份真实的 StoreKit JWS 去跑完整链（需要真机/沙盒交易），只用「真实 Apple 根证书自签名可被本库验证」和自建证书链测试覆盖了解析器与密码学路径。**上线前请务必用一张沙盒交易的真实 JWS 跑一遍（见 §6 步骤 7）。**
- **更新方法**：`curl -O https://www.apple.com/certificateauthority/AppleRootCA-G3.cer`，`openssl x509 -inform der -in AppleRootCA-G3.cer -noout -fingerprint -sha256 -dates`；新证书的 base64 填到 `src/shared/apple-roots.ts`，同步改指纹常量（`test/storekit.test.ts` 第一个用例会校验二者一致）。G3 有效期到 2039，近期无需更新；若 Apple 更换 App Store 签名根，可在 `trustedRoots` 里同时放新旧根。

## 2. 接口规范

### `POST /v1/auth`（两个地区共用同一个请求格式）

请求（`Content-Type: application/json`，正文 ≤ 20 KB）：

```json
{ "signedTransaction": "<Transaction.jwsRepresentation>", "lang": "zh" }
```

- `lang`：`ALLOWED_LANGS` 之一（默认 `zh`、`en`）。
- 大陆服务另可选 `"chapters": [2,3,4]`（1–28 的整数数组，缺省 = 全部 28 章）。

**海外成功响应 200：**

```json
{ "ok": true, "token": "<payload>.<mac>", "expiresAt": 1790000000, "ttlSeconds": 900, "pathPrefix": "/v1/zh/" }
```

token 格式：`base64url(JSON{v:1,exp,p:"/v1/zh/",s:"<交易短指纹>"}) + "." + base64url(HMAC-SHA256)`，只对 `pathPrefix` 下的路径有效，15 分钟（`TOKEN_TTL_SECONDS` 可改）。

**大陆成功响应 200：**

```json
{ "ok": true, "urls": { "2": "https://cdn.example.cn/v1/zh/ch02.mp4?sign=…&t=…", "…": "…" },
  "expiresAt": 1790000900, "ttlSeconds": 900 }
```

CDN URL 鉴权对每个 URL 单独签名（不能像 token 那样覆盖整个目录），所以按章节返回完整地址。免费章节若配置了 `FREE_BASE_URL`，返回不带签名的免费域名地址。

**失败响应**（统一）：`{ "ok": false, "error": { "code": "REVOKED", "message": "…" } }`，状态码见 §1；另有 `429 RATE_LIMITED`（海外，带 `Retry-After`）、`413`、`405`、`500 MISCONFIGURED`。响应一律 `Cache-Control: no-store`。

### `GET|HEAD /v1/{lang}/chNN.mp4`（仅海外 Worker）

- `NN` 为 01–`MAX_CHAPTER`（默认 28），`lang` 须在白名单，否则 404。
- 免费章节（`FREE_CHAPTERS`，默认 `1`）无需 token，响应 `Cache-Control: public, max-age=31536000, immutable`。
- 其余章节需 query `?token=…`：缺失/篡改/过期 → `401 TOKEN_*`（带 `WWW-Authenticate`）；路径不在 token 前缀下 → `403 TOKEN_PATH_DENIED`。付费响应 `Cache-Control: private, max-age=86400`。
- 完整支持 `Range`（单区间、`bytes=N-`、`bytes=-N`）→ `206` + `Content-Range`；越界 → `416` + `Content-Range: bytes */size`；多区间/非法语法按 RFC 9110 忽略 Range 返回 200；`If-Range` 不匹配返回 200；`If-None-Match` → `304`；始终带 `Accept-Ranges: bytes`、`Content-Length`、`ETag`、`X-Content-Type-Options: nosniff`。
- `GET /v1/{lang}/manifest.json`：公开（只含文件名、大小、sha256），同样走缓存。
- CORS：默认不发；设置 `CORS_ORIGINS`（逗号分隔或 `*`）才回显，AVPlayer 不需要。

## 3. 海外：Cloudflare Worker

**读取与缓存（核对了官方文档现行行为）**：Worker 里用 R2 绑定读取不经过 CDN 缓存，每次请求都是一次 R2 读操作；Cache API `cache.put` 会对 `206` 抛错，但 `cache.match` 能对已缓存的完整 `200` 响应按 `Range` 返回 `206`；缓存内容**不在数据中心之间复制**，且 `cache.put` 与分层缓存不兼容（[Cache API 文档](https://developers.cloudflare.com/workers/runtime-apis/cache/)）。据此：

- **未命中**：完整读 R2 对象（一次 Class B 操作）。完整请求用 `tee()` 边回给客户端边 `cache.put`；Range 请求先 `put` 完整对象再 `match` 带 Range 切片（首个 Range 请求要多等一个 3–6 MB 的读取）；`put` 失败则退回 R2 区间读。
- **命中**：不碰 R2。缓存键是不含 token 的 URL，所有用户共享同一份边缘副本；鉴权在查缓存之前完成。存储副本 `max-age=7天`，对象路径带 `v1`，**改内容必须发布 `v2`，不要覆盖同名文件**。
- **成本影响**：R2 出口流量免费，Class B 读 $0.36/百万次，免费额度 1000 万次/月（[R2 定价](https://developers.cloudflare.com/r2/pricing/)）。每个数据中心每个视频至多读一次 R2（副本被逐出后会重读），所以 R2 操作费可忽略；**主要成本是 Worker 请求数**——AVPlayer 播放一支视频会发多个 Range 请求，每个都是一次 Worker 调用。Workers 免费版 10 万请求/天、每次 10 ms CPU；付费版含 1000 万请求/月，超出 $0.30/百万（[Workers 定价](https://developers.cloudflare.com/workers/platform/pricing/)）。用户量上来后请用付费版。
- **取舍**：另一种做法是让 R2 自定义域名直接走 Cloudflare CDN，再用 WAF 校验 token，这样 Range 与缓存都由 CDN 原生处理，Worker 调用更少；但该方式依赖 WAF 规则能力和套餐，我没有核实，所以这里选了纯 Worker 方案。
- **域名**：用自定义域名，不要用 `workers.dev`（Cache API 文档只明确说明自定义域名可用；本地 `wrangler dev` 里我测过 206/416/304/缓存命中均正常，但线上行为请在部署后用 `curl -D-` 复核两次请求）。
- **速率限制**：`/v1/auth` 用 Workers Rate Limiting 绑定（`[[ratelimits]]`，`period` 只能是 10 或 60 秒，按数据中心计数、「宽松且最终一致」，不是精确计费，[文档](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)）。视频路径靠 token 15 分钟有效期，没有单独限流。

### 需要你自己做的（海外）

1. 注册 Cloudflare 账号，添加（或转入）一个域名到 Cloudflare。
2. 创建 R2 桶（`wrangler.toml` 里默认 `sdq-videos`，可改），**保持私有**，不要开 `r2.dev` 公开访问，也不要给桶绑公开自定义域名（否则 token 被绕过）。
3. 上传视频到与 App 约定一致的键：`v1/zh/ch01.mp4 … ch28.mp4`、`v1/zh/manifest.json`（英语同理 `v1/en/`）。来源是 `动画讲解/dist/v1/zh/`。示例：`npx wrangler r2 object put sdq-videos/v1/zh/ch02.mp4 --file ch02.mp4 --content-type video/mp4 --remote`。
4. 在 `wrangler.toml` 取消注释并改好 `routes`（如 `video.example.com/*`）。
5. 设置密钥：`openssl rand -base64 48 | npx wrangler secret put TOKEN_SECRET`。轮换时：把旧值放入 `TOKEN_SECRET_PREVIOUS`，新值设为 `TOKEN_SECRET`，15 分钟后删掉旧的。
6. `npm run deploy:worker`。变量（均在 `wrangler.toml [vars]`）：`APPLE_BUNDLE_ID`、`APPLE_PRODUCT_IDS`、`ALLOWED_ENVIRONMENTS`（**TestFlight 和 App 审核走 Sandbox，所以示例里是 `Production,Sandbox`；库的默认值是更严的 `Production`。** 稳定上线后建议收紧，但要先确认审核已通过）、`MAX_SIGNED_AGE_SECONDS`、`ALLOWED_LANGS`、`MAX_CHAPTER`、`FREE_CHAPTERS`、`TOKEN_TTL_SECONDS`、`CORS_ORIGINS`。
7. 用一台装了 TestFlight 版 App 的真机，把沙盒交易的 JWS 发给 `/v1/auth`，确认返回 token（见 §1 的未核对项）。

## 4. 中国大陆：云函数

`src/cn/handler.ts` 是平台无关的纯函数 `handle(req, {env})`；`server.ts` 把它挂在 Node `http` 服务器上（读 `PORT`，默认 9000），`npm run build:cn` 打成单文件 `dist/cn/index.cjs`。这是**能直接跑在 Web 函数/自定义运行时形态下的写法**：阿里云函数计算 FC 3.0 的 Web 函数、腾讯云 SCF 的 Web 函数都是「进程监听一个端口」。我没有在这两个平台上部署过，**监听端口、入口命令（`node index.cjs`）和 `/v1/auth` 的路由绑定请以各自控制台的 Web 函数文档为准**；若你想用「事件函数」形态，需要自己加几行适配器（事件对象 → `HttpIn`，`HttpOut` → 响应）。

### CDN 鉴权来源与向量

签名函数 `signCdnUrl`，用 `CDN_PROVIDER` 切换。**所有算法和示例向量取自官方文档，并在 `test/cdn-sign.test.ts` 里逐一复现（8 个向量全部一致）**：

| `CDN_PROVIDER` | URL 形式 | 官方文档 |
|---|---|---|
| `aliyun-a` | `/path?auth_key=ts-rand-uid-md5(path-ts-rand-uid-key)` | <https://help.aliyun.com/zh/cdn/user-guide/type-a-signing> |
| `aliyun-b` | `/YYYYMMDDHHMM(UTC+8)/md5(key+ts+path)/path` | <https://help.aliyun.com/zh/cdn/user-guide/type-b-signing> |
| `aliyun-c` | `/md5(key+path+hex(ts))/hex(ts)/path`（十六进制大写，同官方示例） | <https://help.aliyun.com/zh/cdn/user-guide/type-c-signing> |
| `tencent-a` | `/path?sign=ts-rand-uid-md5(path-ts-rand-uid-key)` | <https://cloud.tencent.com/document/product/228/41623> |
| `tencent-b` | 同阿里 B | <https://cloud.tencent.com/document/product/228/41871> |
| `tencent-c` | 同阿里 C，十六进制小写 | <https://cloud.tencent.com/document/product/228/41624> |
| `tencent-d` | `/path?sign=md5(key+path+ts)&t=ts` | <https://cloud.tencent.com/document/product/228/41625> |
| `qiniu` | `/path?sign=md5(key+urlencode(path)+T)&t=T`，T=过期时间十六进制小写 | <https://developer.qiniu.com/fusion/kb/1670/timestamp-hotlinking-prevention> |

要点：

- **阿里云与腾讯云的时间戳是「签发时间」，过期时间 = 时间戳 + 你在 CDN 控制台配置的有效时长**；七牛的 `t` 才是过期时间本身。因此前两家的真实有效期由控制台决定，请把控制台有效时长与环境变量 `CDN_VALIDITY_SECONDS`（只用于响应里的 `expiresAt` 提示，七牛则真正用作 TTL）设成一致，建议 15–30 分钟（一次播放期间 AVPlayer 的后续 Range 请求仍用同一个 URL，视频较短，30 分钟更稳妥；我没有实测播放时长超过有效期时的行为）。
- B 方式的时间是**北京时间** `YYYYMMDDHHMM`，函数内部已按 UTC+8 转换。
- 签名用的 `path` 是编码后的路径；本项目路径只含 ASCII，不受影响。
- 阿里 C 的「查询参数形式」、腾讯 A/D 的自定义参数名没有实现全部变体（A/D 参数名可通过 `paramNames` 覆盖）。
- 免费章节：官方文档对「同一域名下按目录开关鉴权」没有给出我能核实的说法，建议免费视频用单独域名（`FREE_BASE_URL`，不开鉴权）。

### 需要你自己做的（大陆）

1. 备案域名（App 备案、CDN 域名备案，见 `APP-INTEGRATION.md` §7），在选定的 CDN（阿里云/腾讯云/七牛）添加加速域名，源站放视频文件（对象存储等），目录同样是 `/v1/{lang}/chNN.mp4`。
2. 在 CDN 控制台开启 URL 鉴权/时间戳防盗链，选定 A/B/C/D 方式，生成密钥（阿里云 PrivateKey 16–32 位字母数字，腾讯 6–40 位，见各文档），设置有效时长。
3. 部署云函数（备案域名下的 HTTPS 触发器），环境变量：`APPLE_BUNDLE_ID`、`APPLE_PRODUCT_IDS`、`ALLOWED_ENVIRONMENTS`、`MAX_SIGNED_AGE_SECONDS`、`ALLOWED_LANGS`、`MAX_CHAPTER`、`FREE_CHAPTERS`、`CDN_PROVIDER`、`CDN_BASE_URL`（如 `https://cdn.example.cn`）、`CDN_KEY`（**密钥，用云厂商的密钥/加密环境变量功能存放**）、`CDN_VALIDITY_SECONDS`、可选 `FREE_BASE_URL`、`CORS_ORIGINS`。
4. 云函数需要能访问外网吗？不需要：验证完全离线（Apple 根证书内置，不调用 Apple 接口）。
5. 同样用沙盒交易的真实 JWS 联调。

## 5. 成本与限额备注（价格会变，以官网为准）

| 项 | 数字 | 来源 |
|---|---|---|
| R2 存储 | $0.015/GB·月，免费 10 GB·月 | <https://developers.cloudflare.com/r2/pricing/> |
| R2 Class B（读） | $0.36/百万，免费 1000 万/月；出口流量免费 | 同上 |
| Workers 免费版 | 10 万请求/天，10 ms CPU/次 | <https://developers.cloudflare.com/workers/platform/pricing/> |
| Workers 付费版 | 含 1000 万请求/月，超出 $0.30/百万；含 3000 万 CPU ms | 同上 |
| Cache API | 副本不跨数据中心复制，`put` 拒绝 206 | <https://developers.cloudflare.com/workers/runtime-apis/cache/> |
| Rate Limiting 绑定 | `period` 仅 10/60 秒，按数据中心计数 | <https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/> |

国内 CDN 流量与云函数调用费见 `APP-INTEGRATION.md` §6（云函数费用未逐项核实，量级预计很小）。本服务 CPU 开销：一次 `/v1/auth` 做 3–4 次 ECDSA 验证 + 1 次 HMAC，视频请求只做一次 HMAC 校验，流式转发不耗 CPU；**我没有在 Workers 免费版 10 ms CPU 限制下实测 `/v1/auth`**，ECDSA P-384 验证次数少但不确定能否 <10 ms，免费版跑不稳就上付费版。

## 6. iOS 端调用约定（App 侧由另一位 agent 对接）

1. **选源**：`Storefront.current?.countryCode == "CHN"` 用大陆服务，否则海外；两个服务的基础地址由远程配置给出（见 `APP-INTEGRATION.md` §2），失败回落内置地址。语言用 App 内所选内容语言（`zh`/`en`），与地区无关。
2. **免费章节**（第 1 章）：打包在 App 内，不请求服务端；若走网络，海外直接 `GET /v1/{lang}/ch01.mp4` 不带 token。
3. **取凭证**：`for await r in Transaction.currentEntitlements`，选 `productID == "com.kadaliao.SystemDesignQuest.full"` 且 `case .verified(let t)` 的交易，发送 `r.jwsRepresentation`（整个 JWS 字符串，不是 `t` 的某个字段）。凭证可能很久以前就被 App Store 签过，若服务器返回 `401 STALE`，先 `try await AppStore.sync()`（会弹登录）或让用户点「恢复购买」后重试；服务端窗口默认 7 天，**这个窗口对真机的适配性我没有实测，需要在 TestFlight 里验证 `signedDate` 的实际新旧**，必要时调大 `MAX_SIGNED_AGE_SECONDS`。
4. **请求**：`POST {base}/v1/auth`，JSON `{"signedTransaction": "...", "lang": "zh"}`（大陆可加 `chapters`）。超时 10 秒，请求体 ≤ 20 KB。
5. **海外播放**：`{base}/v1/zh/ch07.mp4?token=<token>`；整段 15 分钟内的所有请求（含 AVPlayer 的 Range、整文件下载落盘）复用同一个 token；`expiresAt` 前 60 秒重新换取；收到 `401 TOKEN_EXPIRED` 就重新 `POST /v1/auth` 后重试**一次**。
6. **大陆播放**：直接用响应 `urls["7"]` 的完整地址；`expiresAt` 过后（或 CDN 返回 403）重新请求。
7. **错误处理**：`403 REVOKED/EXPIRED/WRONG_PRODUCT`＝无权益，隐藏付费视频入口、不要重试；`401`＝凭证问题，可提示「恢复购买」；`429` 按 `Retry-After` 退避；网络错误可重试。
8. **缓存**：付费视频响应是 `private`，下载落盘由 App 自己管理；退款后是否继续允许离线播放是产品策略，见 `APP-INTEGRATION.md` §4。
9. **沙盒/审核**：Apple 审核与 TestFlight 使用 Sandbox 环境，服务端必须允许 `Sandbox`（见 §3 第 6 步），否则审核时看不到付费视频。本地 Xcode StoreKit 配置文件产生的交易由本地证书签名，**服务端永远会拒绝**，调试时需要用沙盒账号。

## 7. 已知限制

- **JWS 是承载凭证**：已付费用户可以把 JWS 或 15 分钟 token 转给别人；`signedDate` 窗口只能限制 JWS 的「年龄」，没有服务端状态就无法做真正的一次性防重放。若要强防重放需要加 KV/Durable Object 记录已用 `transactionId` 或绑定设备标识，本版没做。
- **不查在线吊销**：退款后 App Store 会在新 JWS 里写 `revocationDate`，但服务端只能看到客户端提交的那份；退款用户若继续提交退款前的旧 JWS，在 `MAX_SIGNED_AGE_SECONDS` 内仍会通过，已签发的 token/URL 也要等到过期。要即时撤销需接入 App Store Server API / 服务器通知（App Store Server Notifications V2）并维护黑名单，本版没做。
- 没有用真实 Apple JWS 验证（见 §1），证书解析器只在自建证书和真实根证书自签名上验证过。
- Cache API 的线上行为（尤其自定义域名下的命中率）只在本地 `wrangler dev` 验证过，未部署实测；缓存按数据中心隔离，冷门地区命中率低。
- CDN 鉴权的时间戳语义依赖控制台配置；云函数在阿里云 FC / 腾讯云 SCF 上的实际部署未验证（见 §4）。
- 清单 `manifest.json` 公开可读；视频文件名可预测，但没有 token 取不到付费章节。
- 国内合规（备案、资质）不在本目录范围，见 `APP-INTEGRATION.md` §7。
