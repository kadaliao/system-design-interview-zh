# 交互实验总览

每章正文里嵌入了可操作的小实验：拖动参数、运行预设场景，亲眼看到机制在突发、并发和故障下怎样表现。每个实验都有几个「预设场景」，先读题预测结果，再点运行对照。每章末尾还有自测练习卡，第 29 章顶部是跨章节的练习模式。

实验只在[在线阅读版](https://kadaliao.github.io/system-design-interview-zh/)或本地打开的 `index.html` 中可操作；在 GitHub 或电子书里看到的是一行文字说明。实验进度、自测自评和答案草稿只保存在你自己的浏览器里（localStorage），清除站点数据后会丢失。

## 实验清单

<!-- 实验清单：由 工具/build_lab_index.py 生成 -->

| 章节 | 实验 | 你会看到 |
|---|---|---|
| 1 · 从零扩展到百万用户 | [复制延迟：刚改的昵称为什么又变回去](../01.%20Scaling/Readme.md#lab-replica-lag) | 改完昵称立刻刷新，对比轮流读从库、写后 1 秒读主库、带版本号读，以及缓存未失效时各读到新值还是旧值。 |
| 1 · 从零扩展到百万用户 | [从单机到分片：瓶颈在哪一层](../01.%20Scaling/Readme.md#lab-scale-journey) | 拖动流量，逐个加上拆库、负载均衡、缓存、CDN、读副本、消息队列和分片，看瓶颈怎样在各层之间转移，以及加 Web 解决不了的行锁等待和名人热点。 |
| 2 · 数量级估算 | [几个 9：串联相乘，冗余相并](../02.%20Back%20Of%20the%20Envelope%20Estimation/Readme.md#lab-availability-nines) | 用抽样的一年看三个 99.9% 串联为什么只剩约 99.7%，以及加副本、共用机房和可降级依赖怎样改变端到端可用性。 |
| 2 · 数量级估算 | [估算计算器：从日活推到 QPS、存储和机器数](../02.%20Back%20Of%20the%20Envelope%20Estimation/Readme.md#lab-estimate-calculator) | 每一步都显示算式和单位，改一个假设就能看到哪些结果变了几倍，并在一天的流量曲线上对比按平均和按峰值买机器。 |
| 3 · 系统设计面试框架 | [新闻 Feed：需求答案怎样改变架构](../03.%20System%20Design%20Framework/Readme.md#lab-interview-scope) | 切换排序方式、关注关系、内容类型和日活规模，看发布、读取和媒体路径上会多出哪些组件，以及名人发帖怎样压垮扇出队列。 |
| 3 · 系统设计面试框架 | [面试节奏练习：45 分钟、最后 5 分钟、90 秒](../03.%20System%20Design%20Framework/Readme.md#lab-interview-drill) | 带检查点的练习计时器：按本章建议分配练完整面试，或单独练最后 5 分钟收口和 90 秒陈述。 |
| 4 · 设计限流器 | [五种限流算法同场对比](../04.%20Rate%20Limiter/Readme.md#lab-rate-limiter-arena) | 同一股流量交给五种算法，对比窗口边界突发、空闲后突发和持续超速下的放行、拒绝与排队。 |
| 4 · 设计限流器 | [两台网关抢最后一个名额](../04.%20Rate%20Limiter/Readme.md#lab-rate-limiter-race) | 逐步执行「GET 再 INCR」、原子 INCR、Lua 脚本和跨地区计数，看哪种写法会超发。 |
| 5 · 设计一致性哈希 | [哈希环：增删一台服务器，谁要搬家](../05.%20Consistent%20Hashing/Readme.md#lab-hash-ring) | 在 0–99 的环上加入或移除服务器，对比一致性哈希与 hash % N 各有哪些 key 换了主人，并看 key 怎样顺时针找到负责的服务器。 |
| 5 · 设计一致性哈希 | [虚拟节点：分布更匀，热门 key 照样压在一台](../05.%20Consistent%20Hashing/Readme.md#lab-hash-ring-vnodes) | 拖动每台服务器的虚拟节点数，看 key 分布的偏差怎样缩小、新服务器从谁那里接 key，以及一个热门 key 的请求为何仍落在一台机器上。 |
| 6 · 设计键值存储 | [Quorum 读写：集合相交，就一定读到新值吗](../06.%20Key-Value%20Store/Readme.md#lab-quorum-rw) | 调 N、W、R，让副本变慢或失联，逐步看写确认、读回复和每个副本的版本；复现「读到 1 后又读到 0」的反例、读修复的效果，以及 sloppy quorum 下读写集合不再相交。 |
| 6 · 设计键值存储 | [向量时钟：谁是祖先，谁在冲突](../06.%20Key-Value%20Store/Readme.md#lab-vector-clock) | 选基础版本和处理服务器来写入，看向量怎样递增、两个版本何时互不支配成为 siblings，以及客户端合并后的新向量。 |
| 6 · 设计键值存储 | [Bloom Filter：「可能存在」为什么还要读盘](../06.%20Key-Value%20Store/Readme.md#lab-bloom-filter) | 在 SSTable 读路径上插入和查询 key，看位数组怎样产生假阳性、位数组大小如何影响误报，以及为什么不能靠清零位来删除。 |
| 7 · 设计分布式唯一 ID 生成器 | [Snowflake 发号器：位预算、序列耗尽与时钟回拨](../07.%20Unique-Id%20Generator/Readme.md#lab-snowflake) | 调整各字段位数看年限与容量怎样此消彼长，再让三台机器逐毫秒发号，观察序列用尽、时钟回拨、机器号重复和时钟偏差对唯一与有序的影响。 |
| 8 · 设计短网址服务 | [301 还是 302，服务端能数到几次点击](../08.%20URL%20Shortener/Readme.md#lab-url-redirect) | 两位用户点击同一个短链，预览机器人也来抓取；切换 301、302 和缓存头，看浏览器缓存怎样让点击绕过短链服务，请求数为什么不等于点击数。 |
| 8 · 设计短网址服务 | [哈希截取与 Base62 两种短码方案](../08.%20URL%20Shortener/Readme.md#lab-url-shortener) | 同一个长网址同时交给「MD5 截取 + 碰撞重算」和「唯一 ID + Base62」，把短码空间调小看碰撞和重试怎样随占用率增加，再看 Bloom Filter 能省掉哪些查询、几位 Base62 才够 3650 亿条。 |
| 9 · 设计网络爬虫 | [URL Frontier 决定先抓谁、何时抓、哪些不抓](../09.%20Web%20Crawler/Readme.md#lab-crawler-frontier) | 在一张小网页图上按 BFS 抓取，看前置队列排优先级、后置队列按主机限速；开关 URL 去重和内容去重、增减 worker、放出无限日历陷阱，对照两道去重和深度规则各挡住了什么。 |
| 10 · 设计通知系统 | [分渠道队列遇上第三方故障](../10.%20Notification%20System/Readme.md#lab-notification-pipeline) | 通知持续进入 iOS、Android、短信、邮件四个队列；让短信服务商故障，看只有这一条链路积压、退避重试、过期验证码作废，再换成共用队列对比其他渠道被拖慢多少。 |
| 10 · 设计通知系统 | [为什么「先查后发」挡不住重复通知](../10.%20Notification%20System/Readme.md#lab-notification-dedup) | 同一事件被投递两次，逐步执行「发送后崩溃」「两个 worker 同时处理」「确认丢失」，对比不去重、先查后发、原子占用加幂等键时用户会收到几条。 |
| 11 · 设计新闻流系统 | [名人发帖时的写扩散、读扩散与混合](../11.%20News%20Feed%20System/Readme.md#lab-feed-fanout) | 名人发帖、你打开 feed，三种扩散方式同场对比写入次数、多久轮到你、每次打开要读多少次；拖动混合阈值，看全站写入与读取怎样此消彼长。 |
| 11 · 设计新闻流系统 | [feed 缓存只存 ID，读取时再组装和过滤](../11.%20News%20Feed%20System/Readme.md#lab-feed-hydrate) | 制造删帖、拉黑和新帖插入，看缓存里的旧 ID 为什么要在读取时按当前权限过滤，以及 offset 分页为什么会重复而游标不会。 |
| 12 · 设计聊天系统 | [一条消息怎样到达每台设备](../12.%20Chat%20System/Readme.md#lab-chat-delivery) | 发一条消息，看它先写入 KV，再推给在线设备、给离线用户发提醒；切换会话内序号、Snowflake 与游标方式，观察万人群的写扩散、漏收和顺序颠倒。 |
| 12 · 设计聊天系统 | [网络抖一下，算不算离线](../12.%20Chat%20System/Readme.md#lab-presence-heartbeat) | 制造几次断网，对比心跳超时与「断开即离线」两种判定，看阈值怎样影响误判、下线发现延迟和好友扇出量。 |
| 13 · 设计搜索自动补全 | [前缀树上的 Top-K，现算还是预先贴好](../13.%20Search%20Autocomplete/Readme.md#lab-trie-topk) | 输入前缀看查询在 Trie 里走过的节点，对比遍历子树与节点缓存 Top-K；再把本周日志批量构建成新版本，比较原地覆盖和整版切换，并模拟短前缀热点。 |
| 14 · 设计 YouTube 视频系统 | [转码 DAG 的并行、重试与完成条件](../14.%20Youtube/Readme.md#lab-transcode-dag) | 按 GOP 切片的转码任务在 worker 池上排队并行；调 worker 数、注入分片失败，看重试范围，以及过早通知为什么会让用户拿到 404。 |
| 15 · 第15章：设计 Google Drive | [只传变化的块，冲突留副本](../15.%20Google%20Drive/Readme.md#lab-block-sync) | 修改文件中的几块再同步，看增量上传、按哈希去重、两台设备同时修改时的冲突副本，以及上传中断时版本为什么停在 pending。 |
| 16 · 第16章：附近地点服务 | [Geohash 附近搜索：选精度、查九格、再精确过滤](../16.%20Proximity%20Service/Readme.md#lab-geohash-nearby) | 在原书坐标周围点选位置、切换半径和编码长度，看本格加 8 个邻格取回多少候选、按距离过滤后剩几家，以及边界两侧的近邻为什么前缀不同、精度太细时九格为什么盖不住圆。 |
| 16 · 第16章：附近地点服务 | [四叉树：按密度拆格子，再找最近的 k 家](../16.%20Proximity%20Service/Readme.md#lab-quadtree-knn) | 拖动叶子阈值看四叉树逐层拆分、树变深，点地图看 k 近邻查询依次访问了哪些节点，并与固定精度的 Geohash 九格对照。 |
| 17 · 第17章：附近好友 | [附近好友：每人一个频道，订阅端按距离过滤](../17.%20Nearby%20Friends/README.md#lab-nearby-pubsub) | 看位置更新怎样发布到自己的 Redis 频道、扇出到在线好友所在的服务器，再按 5 英里过滤；调节更新间隔与在线好友数换算原书的每秒推送量，并演示加好友、删好友时的订阅变化。 |
| 18 · 第18章：设计 Google Maps | [路由瓦片：只加载路线需要的子图，长途走高层](../18.%20Google%20Maps/README.md#lab-routing-tiles) | 在网格路网上对比整张图 Dijkstra、A* 按需加载路由瓦片和分层路由瓦片：各加载了多少瓦片和道路边、展开了多少路口，路线是否变慢。 |
| 18 · 第18章：设计 Google Maps | [地图瓦片：缩放一级，瓦片数 ×4](../18.%20Google%20Maps/README.md#lab-map-tiles) | 缩放和平移地图，看每级瓦片总数按 4 倍增长、屏幕却只需要十来张，客户端怎样按 z/x/y 算出瓦片编号，以及平移时哪些瓦片来自 CDN、哪些来自本地缓存。 |
| 19 · 第19章：分布式消息队列 | [副本、ISR 与 ACK：Leader 宕机时丢不丢](../19.%20Distributed%20Message%20Queue/README.md#lab-mq-isr-acks) | 一个分区三个副本：切换 ACK=0/1/all，让 Follower 卡住或让 Leader 宕机，看哪些「已确认」的消息会丢、慢副本怎样被移出 ISR、min.insync.replicas 何时拒绝写入。 |
| 19 · 第19章：分布式消息队列 | [消费组：分区分配、重平衡与 offset 提交](../19.%20Distributed%20Message%20Queue/README.md#lab-mq-consumer-group) | 按 key 写入分区、增减或让消费者崩溃触发重平衡，对比「拉到就提交」与「处理完再提交」在崩溃后是丢消息还是重复处理。 |
| 20 · 第20章：指标监控与告警系统 | [降采样与分层保留](../20.%20Metrics%20Monitoring%20and%20Alerting%20System/README.md#lab-metrics-downsample) | 逐窗计算原文的 30 秒平均（含纠正后的数值），看短暂尖峰怎样被平均抹掉，再按 7 天 / 30 天 / 1 年的分层估算存储量。 |
| 20 · 第20章：指标监控与告警系统 | [告警规则：阈值加持续时长](../20.%20Metrics%20Monitoring%20and%20Alerting%20System/README.md#lab-alert-rule) | 拖动阈值与 for 持续时长，看 inactive、pending、firing 怎样切换，尖峰会不会误报，主机失联、不再上报时规则为何会发出错误的恢复。 |
| 21 · 第21章：广告点击事件聚合 | [事件时间、窗口与水位线](../21.%20Ad%20Click%20Event%20Aggregation/README.md#lab-stream-window) | 点击按事件时间落进滚动或滑动窗口，调节乱序容忍和允许迟到，比较结果产出的快慢、被丢进侧输出的迟到点击和更正版本。 |
| 21 · 第21章：广告点击事件聚合 | [聚合节点崩溃：结果会重复还是丢失](../21.%20Ad%20Click%20Event%20Aggregation/README.md#lab-agg-exactly-once) | 在「发结果」和「记 offset」之间注入崩溃，对比先发后提交、先存进度、原子提交与下游幂等写的最终计数。 |
| 22 · 酒店预订系统 | [两位客人抢最后一间房](../22.%20Hotel%20Reservation%20System/README.md#lab-booking-race) | 逐步执行两条交错的预订事务，对比无保护、悲观锁、乐观锁和两种数据库约束下库存行怎样变化、谁会超卖。 |
| 22 · 酒店预订系统 | [多晚事务、幂等重试与缓存延迟](../22.%20Hotel%20Reservation%20System/README.md#lab-booking-multi-night) | 看中间一晚没房时整笔事务怎样回滚，超时重试时 reservation_id 怎样避免重复扣房，以及缓存显示有房为什么仍会下单失败。 |
| 23 · 分布式邮件服务 | [一封邮件的旅程与队列水位](../23.%20Distributed%20Email%20Service/README.md#lab-mail-pipeline) | 追踪一封发出的信和一封收到的信，看 SMTP 250、入库、可搜索、已读分别是哪一层的「成功」，再调慢索引消费者或让对方限流，按水位找出卡点。 |
| 24 · S3 类对象存储 | [8+4 纠删码与三副本的容错和空间](../24.%20S3-like%20Object%20Storage/README.md#lab-erasure-coding) | 点选宕机节点或让整个机架断电，看三副本与 8+4 分别还能不能恢复，并对比 3 倍与 1.5 倍的总占用。 |
| 24 · S3 类对象存储 | [孤儿对象、GC 与旧元数据缓存](../24.%20S3-like%20Object%20Storage/README.md#lab-object-commit) | 逐步看元数据提交超时后留下了什么、GC 为什么要等宽限期，以及三份新字节为什么挡不住旧的元数据缓存。 |
| 25 · 实时游戏排行榜 | [Sorted Set 排行榜：位置、名次与同分](../25.%20Real-time%20Gaming%20Leaderboard/README.md#lab-leaderboard-zset) | 用 ZINCRBY、ZREVRANGE、ZREVRANK 操作一张月榜，看前 10 与「我」上下各 4 名、同分时零基位置与竞赛名次的差别，以及重试投递时为什么要按 match_id 去重。 |
| 25 · 实时游戏排行榜 | [分片以后：Top K 合并、跨片名次与单 key 热点](../25.%20Real-time%20Gaming%20Leaderboard/README.md#lab-leaderboard-shard) | 对比单个 key、哈希拆 key、共用 hash tag 和按分数范围分片：写入落在哪些 Redis Cluster 节点，前 K 名怎样散集合并，个人名次要问几个分片，边界并列为什么需要阈值查询。 |
| 26 · 支付系统 | [支付超时后的重试、幂等键与对账](../26.%20Payment%20System/README.md#lab-payment-retry) | 注入响应丢失、PSP 宕机、重复 webhook 等故障，对比换新键重试与沿用原键重试，看订单状态怎样迁移、买家被扣几次，以及夜间对账怎样发现并收敛差异。 |
| 27 · 数字钱包 | [事件溯源钱包的命令、事件与重放](../27.%20%20Digital%20Wallet/README.md#lab-wallet-event-sourcing) | 提交转账命令看校验与事件追加，拖动回放位置重建任意序号的余额，对比有无快照要应用的事件数，再用守恒校验和新旧版本逐事件比对区分「可重现」与「正确」。 |
| 28 · 证券交易所 | [撮合引擎主备切换的四道关口](../28.%20Stock%20Exchange/README.md#lab-exchange-failover) | 让主节点宕机或假死，看选主、隔离旧主、重放日志、校验输出边界四道关口怎样决定 RTO，本地确认为什么会丢已确认数据，以及没有 fencing 时旧主醒来后的双发。 |
| 28 · 证券交易所 | [限价订单簿按价格和到达顺序撮合](../28.%20Stock%20Exchange/README.md#lab-order-book) | 下限价单或市价单，逐步看撮合引擎取最优对手价、取队首订单、按双方剩余量成交、剩余量入簿，以及大单扫过多档、撤单与成交的先后顺序。 |

<!-- 实验清单结束 -->

## 维护说明

实验源码在 `交互实验/`：`runtime.js` 与 `runtime.css` 提供统一外框、控件、动画时钟、预设场景、自测练习和本地进度；`labs/` 下每章一个脚本，用 `SDLab.define({...})` 注册实验。Markdown 仍是唯一内容源，正文用下面的占位块决定实验出现的位置：

```html
<div class="sd-lab" id="lab-实验ID" data-lab="实验ID">
<p><strong>交互实验：标题</strong>。一句话说明。<a href="https://kadaliao.github.io/system-design-interview-zh/#d4/lab-实验ID">在线阅读版</a>中可直接操作。</p>
</div>
```

`工具/build-reader.mjs` 会自动引入 `labs/` 下的全部脚本。单独开发某个实验时打开 `交互实验/preview.html?file=04-rate-limiter.js`；验收用：

```bash
PLAYWRIGHT_MODULE="$(npm root -g)/playwright" node 工具/check-labs.cjs            # 全部实验：挂载、运行每个预设场景、检查报错/横向溢出/过小文字
PLAYWRIGHT_MODULE="$(npm root -g)/playwright" node 工具/check-labs.cjs --file 04-rate-limiter.js
```

### 编写新实验

```js
(function(){
const {el:h,util}=SDLab;
SDLab.define({
  id:'hash-ring', chapter:5, title:'标题', summary:'一两句话说明读者能做什么',
  caveat:'简化假设（底部显示为「教学模型：…」）',
  mount(ctx){ /* 构建界面；可选 return {destroy(){}} */ }
});
})();
```

`ctx` 的常用能力：
- 容器：`ctx.stage`（主视图）、`ctx.controls`（控件网格）。
- 画图：`ctx.svg(宽,高)` 建按 viewBox 缩放的 SVG；`h(tag,props,...children)` 与 `ctx.svgEl(...)` 建 DOM/SVG 元素。
- 控件：`ctx.slider/select/toggle/segmented/button`。
- 统计与日志：`ctx.stats([...]).set(key,值,tone)`、`ctx.log(文本,tone)`。
- 时间：`ctx.loop((dt,秒)=>…)` 是只在可见时运行的动画循环；`await ctx.wait(毫秒)` 按可见时间等待，重置或切换场景会中断，自己捕获时用 `SDLab.isAbort(e)` 区分。
- 场景：`ctx.scenarios([{id,label,ask,insight,run}])`。
- 其他：`ctx.css(key,样式)`（选择器加实验前缀）、`ctx.onResize(w=>…)`、`ctx.colors`、`util.rng(种子)`。

右上角「重置」会整体重新挂载实验。

写实验时守住几条：
- 让机制本身看得见（数据流动、状态变化、出错位置），数字面板只是辅助。
- 场景的 `run` 自己设定初始状态，并且必须是确定性的。
- `insight` 只写实际运行显示出来的结果，写完要跑一遍核对。
- 手机 390px 宽度下不能横向溢出，文字不小于 11px；SVG 里放文字时，viewBox 宽度要控制住，或在窄屏切换布局。
- 颜色语义固定：绿表示成功/放行，红表示失败/拒绝，琥珀表示等待/警告，蓝表示信息/当前。
- 按浅色设计即可：夜间模式对实验外框整体做「反色 + 色相回转」。只有本身就是深底浅字的元素（如命令行面板）需要加一条 `:root[data-theme=dark]` 规则预先换成浅底深字，否则反色后会变成亮块；预览页加 `?theme=dark`、验收加 `--theme dark` 可检查夜间效果。

新增或删除实验后运行 `python3 工具/build_lab_index.py --write`，更新上面的清单并检查占位块与实验定义是否一一对应。

实验是教学模型，不是生产系统的性能仿真。每个实验底部的「教学模型」说明写明了简化假设；场景结论必须与正文、批注和第 29 章答案一致，修改正文结论时要同步检查对应实验。
