# 英语术语表（译者必读）

本表规定「系统设计闯关」英语版的统一译法。27 个译者并行翻译，**同一个中文概念在所有章节必须用同一个英文词**。规则：

1. 表里有的词，一律照表。表里没有的词，先按「业界通行、面向全球工程师最常见」的说法译；若这个词在你的章节里会反复出现，**在你的最终报告里列出来**，由汇总的人补进本表。
2. 「用法」列写了大小写、单复数、是否缩写。**句中用小写**（除专有名词和缩写），标题和图标签用 Title Case 或 sentence case，同一处保持一致；本项目标题（章标题、课标题）用 Title Case，其余句子用 sentence case。
3. 中文正文里带括号的英文原词（如「缓存（Caching）」）是原书术语，译文直接用该英文，不再加括号重复。
4. 「别译成」列是常见误译，不要用。
5. 保留英文不译的缩写：QPS、TPS、DAU、MAU、CDN、DNS、TTL、LRU、LFU、SLA、SLO、RTO、RPO、CRUD、SQL、NoSQL、API、HTTP、TCP、UDP、IP、RPC、ACID、CAP、MVCC、WAL、CDC、GC、GOP、DAG、ETL、ISR、ACK、KV、JSON、UUID、SPOF、P50/P95/P99。第一次出现、且读者未必认识时，括号补全称一次（如 "single point of failure (SPOF)"），之后用缩写。

## 1. 扩展、可用性与基础概念

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 规模化 / 扩展 | scaling | 动词 scale；「扩展到百万用户」scale to millions of users |
| 纵向扩展 | vertical scaling (scale up) | 别译 "longitudinal" |
| 横向扩展 | horizontal scaling (scale out) | |
| 单服务器 | single server | |
| 单点故障 | single point of failure (SPOF) | 简称 single point |
| 瓶颈 | bottleneck | 「瓶颈转移」the bottleneck shifts |
| 负载均衡器 | load balancer (LB) | |
| 无状态 | stateless | 「无状态 Web 层」stateless web tier |
| 有状态 | stateful | |
| 会话 | session | 别译 "meeting" |
| 粘性会话 | sticky session | |
| 故障转移 | failover | 动词短语 fail over |
| 故障切换 | failover | 与「故障转移」同译；「切回」failback |
| 高可用 | high availability (HA) | |
| 可用性 | availability | |
| 可靠性 | reliability | |
| 持久性 | durability | 别与 persistence 混用 |
| 吞吐量 | throughput | |
| 延迟 | latency | 别译 "delay"；「尾延迟」tail latency |
| 响应时间 | response time | |
| 峰值 / 平均值 | peak / average | |
| 容量 | capacity | 「容量规划」capacity planning |
| 利用率 | utilization | |
| 饱和 | saturation | 「接近饱和」near saturation |
| 过载 | overload | |
| 超时 | timeout | 名词；动词 time out |
| 排队 | queueing | 动词 queue up |
| 积压 | backlog | 「消息积压」message backlog |
| 削峰 | traffic smoothing | 别译 "peak shaving"；可说 "absorb traffic spikes" |
| 降级 | degrade / graceful degradation | 「降级运行」run in a degraded mode |
| 容错 | fault tolerance | |
| 冗余 | redundancy | |
| 故障域 | failure domain | |
| 数据中心 | data center | 美式拼写；「多数据中心」multi-data center |
| 机架 | rack | |
| 机房 | data center / site | 视上下文；「就近机房」nearest site |
| 回滚 | roll back | 名词 rollback |
| 灰度发布 | canary release / gradual rollout | |
| 数量级估算 | back-of-the-envelope estimation | 章标题保留原书说法 |
| 数量级 | order of magnitude | |
| 面试框架 | interview framework | |
| 权衡 / 取舍 | trade-off | 带连字符 |
| 一页式模板 | one-page template | |

## 2. 数据库、复制与分片

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 数据库 | database (DB) | 图里空间小可缩写 DB |
| 关系型数据库 | relational database | |
| 非关系型数据库 | non-relational database / NoSQL | |
| 主库 / 从库 | primary / replica | 别用 master/slave；原书标题 "Master-Slave Model" 译为 Primary-Replica Model |
| 主从复制 | primary-replica replication | |
| 读副本 | read replica | |
| 复制延迟 | replication lag | |
| 复制位点 | replication position | 视上下文可说 log position / offset |
| 读己之写 | read-your-writes | 连字符，一个概念 |
| 读写分离 | read/write splitting | |
| 提升（从库为主库） | promote | "promote a replica to primary" |
| 脑裂 | split brain | |
| 隔离旧主 | fence off the old primary / fencing | |
| 仲裁 | quorum | |
| 环形复制 | ring replication | |
| 多主 | multi-primary | |
| 同步复制 / 异步复制 | synchronous / asynchronous replication | |
| 分片 | shard (n.) / sharding | 动词 shard；「分片键」shard key |
| 重新分片 | resharding | |
| 分桶 | bucketing | 「分桶后缀」bucket suffix |
| 热点 | hotspot | 一个词；「名人热点」celebrity hotspot；「热点库存行」hot inventory row |
| 数据倾斜 | data skew | |
| 反规范化 | denormalization | |
| 规范化 | normalization | |
| 索引 | index | 复数 indexes（数据库语境） |
| 事务 | transaction | |
| 原子性 | atomicity | 「原子条件更新」atomic conditional update |
| 隔离级别 | isolation level | |
| 乐观锁 / 悲观锁 | optimistic locking / pessimistic locking | |
| 锁等待 | lock wait | |
| 持锁 | hold the lock | |
| 行锁 | row lock | |
| 死锁 | deadlock | |
| 超卖 | overselling | 动词 oversell |
| 唯一约束 | unique constraint | |
| 主键 | primary key | |
| 外键 | foreign key | |
| 联表查询 | JOIN | 大写 JOIN，复数 JOINs；「跨分片 JOIN」cross-shard JOIN |
| 慢查询 | slow query | |
| 连接池 | connection pool | |
| 一致性 | consistency | |
| 强一致 | strong consistency | |
| 最终一致 | eventual consistency | |
| 线性一致 | linearizability | |
| 版本号 | version number | 代码里 version |
| 向量时钟 | vector clock | |
| 冲突 | conflict | 「写冲突」write conflict |
| 读修复 | read repair | |
| 反熵 | anti-entropy | |
| 逻辑删除 | soft delete | |
| 快照 | snapshot | |
| 备份 | backup | 别与 replica 混用 |
| 对账 | reconciliation | |

## 3. 缓存与 CDN

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 缓存 | cache (n.) / caching | 动词 cache |
| 命中 / 未命中 | hit / miss | 「命中率」hit rate |
| 回源 | fall through to the backend / origin fetch | 缓存回源 = fetch from the backend (database)；CDN 回源 = fetch from the origin；别译 "return to source" |
| 源站 | origin server | 简称 origin |
| 过期 | expire | 名词 expiration；「过期策略」expiration policy |
| 淘汰 | evict | 名词 eviction；「淘汰策略」eviction policy |
| 失效（缓存） | invalidate | 名词 invalidation；「让缓存失效」invalidate the cache entry |
| 缓存穿透 | cache penetration | |
| 缓存击穿 | cache breakdown / hot-key expiry | 首次出现加一句解释 |
| 缓存雪崩 | cache avalanche | |
| 请求合并 | request coalescing | |
| 预热 | warm up (v.) / warm-up (n.) | 「冷启动」cold start |
| 旁路缓存 | cache-aside | |
| 写穿 / 写回 | write-through / write-back | |
| 内容分发网络 | content delivery network (CDN) | |
| 静态文件 | static file | |
| 清除（CDN 缓存） | purge | |
| 内容哈希 | content hash | |
| 边缘节点 | edge node | |
| 就近加速 | nearby acceleration / serving from a nearby location | |
| 布隆过滤器 | Bloom filter | B 大写 |

## 4. 队列、流与异步

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 消息队列 | message queue | |
| 生产者 / 消费者 | producer / consumer | |
| 发布订阅 | publish/subscribe (pub/sub) | |
| 主题 | topic | |
| 分区 | partition | |
| 消费组 | consumer group | |
| 偏移量 | offset | |
| 重平衡 | rebalance | |
| 确认 | acknowledge (ack) | 名词 acknowledgement；口语 ack 可作动词 |
| 重投 / 重试 | redelivery / retry | 队列语境用 redelivery |
| 重复投递 | duplicate delivery | |
| 幂等 | idempotent (adj.) / idempotency (n.) | 「幂等键」idempotency key |
| 至少一次 / 至多一次 / 恰好一次 | at-least-once / at-most-once / exactly-once | |
| 死信队列 | dead-letter queue (DLQ) | |
| 退避 | backoff | 「指数退避」exponential backoff |
| 背压 | backpressure | |
| 消息顺序 | message ordering | |
| 异步 / 同步 | asynchronous / synchronous | 口语 async / sync |
| 扇出 | fan-out | 「写扩散」fan-out on write；「读扩散」fan-out on read；「推拉结合」push-pull hybrid |
| 推 / 拉 | push / pull | |
| 事务发件箱 | transactional outbox | 简称 outbox |
| 补偿 | compensation | 「补偿事务」compensating transaction |
| 工作线程 | worker | |
| 任务 | task / job | 队列任务用 task，批处理用 job |
| 窗口 | window | 「滚动窗口」tumbling window；「滑动窗口」sliding window |
| 水位线 | watermark | |
| 事件时间 / 处理时间 | event time / processing time | |
| 乱序 / 迟到 | out-of-order / late (events) | |
| 流处理 | stream processing | |
| 批处理 | batch processing | |
| 聚合 | aggregation | |
| 降采样 | downsampling | |
| 日志（数据结构） | log | 「预写日志」write-ahead log (WAL) |
| 变更数据捕获 | change data capture (CDC) | |

## 5. 算法与数据结构

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 一致性哈希 | consistent hashing | 「哈希环」hash ring；「虚拟节点」virtual node |
| 哈希 | hash | 「哈希取模」hash modulo N |
| 令牌桶 | token bucket | |
| 漏桶 | leaking bucket | |
| 固定窗口计数 | fixed window counter | |
| 滑动窗口日志 / 计数 | sliding window log / counter | |
| 限流 | rate limiting | 「限流器」rate limiter；「被限流」be rate limited |
| 前缀树 | trie | |
| 堆 | heap | |
| 有序集合 | sorted set | Redis 语境 |
| 排行榜 | leaderboard | |
| 名次 | rank | 「并列名次」tied rank |
| 四叉树 | quadtree | |
| 地理哈希 | geohash | 小写，一个词 |
| 瓦片 | tile | 「地图瓦片」map tile |
| 最短路径 | shortest path | |
| 邻近搜索 | proximity search | |
| 近邻 | nearest neighbor | k 近邻 k-nearest neighbors |
| 纠删码 | erasure coding | 「8+4 纠删码」8+4 erasure coding |
| 去重 | deduplication (dedup) | |
| 校验和 | checksum | |
| 倒排索引 | inverted index | |
| LSM 树 / SSTable | LSM tree / SSTable | |
| 内存表 | memtable | |
| 雪花算法 | Snowflake | 保留专名 |
| 时钟回拨 | clock rollback / clock moving backward | |
| 序列号 | sequence number | |
| 时间戳 | timestamp | |
| 位 / 字节 | bit / byte | |

## 6. 业务系统与产品概念

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 短链接 | short URL | 「短码」short code |
| 重定向 | redirect | 301 permanent redirect / 302 temporary redirect |
| 网页爬虫 | web crawler | |
| 通知 | notification | 「推送通知」push notification |
| 新闻 Feed | news feed | 简称 feed |
| 关注 / 粉丝 | follow / follower | |
| 名人 | celebrity | 指粉丝极多的账号 |
| 聊天系统 | chat system | |
| 在线状态 | presence | 「心跳」heartbeat |
| 搜索自动补全 | search autocomplete | |
| 转码 | transcoding | |
| 视频切片 | video segment / chunk | GOP 切片 GOP-based segment |
| 码率 | bitrate | |
| 对象存储 | object storage | |
| 桶（存储） | bucket | |
| 元数据 | metadata | |
| 同步 / 冲突副本（网盘） | sync / conflicted copy | |
| 增量上传 | incremental upload | |
| 邻近服务 | proximity service | |
| 附近的朋友 | nearby friends | |
| 指标 | metric | |
| 监控 | monitoring | |
| 告警 | alerting / alert (n.) | |
| 阈值 | threshold | |
| 持续时长 | duration / for-duration | Prometheus 规则里的 for 保持 `for` |
| 点击事件 | click event | |
| 酒店预订 | hotel reservation | |
| 库存 | inventory | 酒店「房量」room inventory |
| 邮件服务 | email service | |
| 钱包 | wallet | |
| 事件溯源 | event sourcing | |
| 重放 | replay | |
| 订单 | order | |
| 撮合引擎 | matching engine | |
| 订单簿 | order book | |
| 限价单 / 市价单 | limit order / market order | |
| 支付服务提供商 | payment service provider (PSP) | |
| 回调 | webhook / callback | 支付语境用 webhook |
| 秒杀 | flash sale | |
| 抢购 | rush purchase | 视上下文 |

## 7. 运维、可观测性与教学用语

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 日志（运维） | logs / logging | |
| 追踪 | tracing / trace | |
| 健康检查 | health check | |
| 基线 | baseline | |
| 自动化 | automation | |
| 观测 | observe | 名词 observability |
| 服务水平目标 / 协议 | service level objective (SLO) / agreement (SLA) | |
| 恢复时间 / 恢复点目标 | recovery time objective (RTO) / recovery point objective (RPO) | |
| 副作用 | side effect | |
| 竞态 | race condition | |
| 并发 | concurrency / concurrent | |
| 串行 | serial / serialize | 「串行化」serialize |
| 并行 | parallel | |
| 原子 | atomic | |
| 同一事务 | the same transaction | |
| 崩溃 | crash | |
| 宕机 / 下线 | go down / take down | 「下线一台」take one server down |
| 兜底 | fallback | |
| 抖动 | jitter / flapping | 网络抖动 network flapping |
| 误报 / 漏报 | false positive / false negative | |
| 假阳性 | false positive | Bloom filter 语境同样用 false positive |
| 示意 | illustrative | 「示意值」illustrative value；「示意图」illustration / sketch |
| 教学模型 | teaching model | |
| 预设场景 | preset scenario | |
| 先猜 / 观察 | Predict first / Takeaway | 对应实验界面 |
| 口述卡 / 自测卡 | spoken-answer card / self-check card | App 内口径统一用 "self-check card" |
| 结论 | conclusion | 卡片首段 **Conclusion: …** |
| 记忆提示 | memory hook | 卡片末段 **Memory hook: …** |
| 边界 | boundaries | 「边界」段 **Boundaries**: …；指方案成立的条件和局限 |
| 例子 | example | **Example**: … |
| 批注 | annotation / note | 正文里中文版加的批注；不要在题库里引用「批注」 |
| 排查 | troubleshoot / diagnose | |
| 反例 | counterexample | |
| 经验值 | rule of thumb | |
| 口诀 | mnemonic / memory hook | |
| 止血 | stop the bleeding / quick fix | 译成 "quick fix" |
| 白等 | wait for nothing | |

## 8. 章标题与固定短语

章标题（`title` 用短名词短语，`fullTitle` 用 "Chapter N: " + 原书风格标题，Title Case）：

| 章 | `title` | `fullTitle`（冒号后） |
|---|---|---|
| 1 | Scaling from Zero to Millions of Users | Scaling from Zero to Millions of Users |
| 2 | Back-of-the-Envelope Estimation | Back-of-the-Envelope Estimation |
| 3 | System Design Interview Framework | A Framework for System Design Interviews |
| 4 | Rate Limiter | Design a Rate Limiter |
| 5 | Consistent Hashing | Design Consistent Hashing |
| 6 | Key-Value Store | Design a Key-Value Store |
| 7 | Distributed Unique ID Generator | Design a Unique ID Generator in Distributed Systems |
| 8 | URL Shortener | Design a URL Shortener |
| 9 | Web Crawler | Design a Web Crawler |
| 10 | Notification System | Design a Notification System |
| 11 | News Feed | Design a News Feed System |
| 12 | Chat System | Design a Chat System |
| 13 | Search Autocomplete | Design a Search Autocomplete System |
| 14 | YouTube | Design YouTube |
| 15 | Google Drive | Design Google Drive |
| 16 | Proximity Service | Proximity Service |
| 17 | Nearby Friends | Nearby Friends |
| 18 | Google Maps | Google Maps |
| 19 | Distributed Message Queue | Distributed Message Queue |
| 20 | Metrics, Monitoring, and Alerting | Metrics Monitoring and Alerting System |
| 21 | Ad Click Aggregation | Ad Click Event Aggregation |
| 22 | Hotel Reservation System | Hotel Reservation System |
| 23 | Distributed Email Service | Distributed Email Service |
| 24 | S3-like Object Storage | S3-like Object Storage |
| 25 | Real-Time Gaming Leaderboard | Real-Time Gaming Leaderboard |
| 26 | Payment System | Payment System |
| 27 | Digital Wallet | Digital Wallet |
| 28 | Stock Exchange | Stock Exchange |

题库里常见的固定句式：

| 中文 | English |
|---|---|
| 按本章思路，……应该做什么？ | Following this chapter's approach, what should you do …? |
| 下列哪些……？ | Which of the following …? |
| 最可能的结果是？ | What is the most likely result? |
| 主要问题是？ | What is the main problem? |
| 最稳妥的做法是？ | What is the safest approach? |
| 把……排好顺序 | Put … in order |
| 把……连起来 | Match each … with … |
| 补全…… | Complete … |
| 约 N 倍 | about N times |
| 不是……而是…… | not …, but … |

## 9. 各章补充术语（终审合并）

各章译者在报告里建议、终审时并入本表的术语。同一中文概念各章译法不同的，表中已选定一个；「别译成」列注明不用的写法。

### 9.1 存储、同步与对象存储（第 14、15、24 章）

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 增量同步 | delta sync | 只传变化的块；别译 incremental sync |
| 块服务器 | block server | |
| 预签名 URL | pre-signed URL | 带连字符；别写 presigned |
| 清单 | manifest | 文件由哪些块组成的清单 |
| 自适应码率 | adaptive bitrate (ABR) | 首次出现带缩写 |
| 擦洗 / 巡检校验 | scrubbing | 后台周期性读盘校验 |
| 分片上传 | multipart upload | |
| 孤儿对象 | orphan object | |
| 删除标记 | delete marker | 对象存储多版本语境；与 tombstone 区分 |
| 宽限期 | grace period | |
| 数据分片 / 校验分片 | data shard / parity shard | 纠删码语境；别译 data block |
| 纠删码 | erasure coding | |
| 分层保留 | tiered retention | 第 20 章指标降采样保留 |

### 9.2 流处理、一致性与分布式（第 6、11、19、20、21、25、26、27、28 章）

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 旁路输出 | side output | |
| 允许迟到时间 | allowed lateness | |
| 滚动 / 滑动 / 会话窗口 | tumbling / sliding / session window | |
| 跳表 | skip list | |
| 哈希槽 | hash slot | Redis Cluster |
| 哈希标签 | hash tag | Redis Cluster |
| 并列排名（跳号） | competition ranking | 1、2、2、4 |
| 并列排名（不跳号） | dense ranking | 1、2、2、3 |
| 隔离令牌 / 围栏 | fencing (token) | 防旧主写入 |
| 任期 | term | Raft/选主语境；小写 |
| 热备 | hot standby | |
| 成交回报 | execution report | |
| 买一价 / 卖一价 | best bid / best ask | |
| 定序器 | sequencer | 撮合引擎前的排序组件 |
| 同机房部署 | colocation | |
| 空回滚 | empty rollback | TCC |
| 悬挂 | hanging operation | TCC：Cancel 先于 Try |
| 编排式 / 协同式 Saga | orchestration / choreography Saga | 别译 conductor |
| 归约（器） | reducer | 流处理聚合 |
| 一致割集 | consistent cut | |
| 分区主副本 | partition leader | Kafka；别用 master |
| 组协调器 | group coordinator | |
| 最小同步副本数 | min.insync.replicas | 配置名，原样 |
| 非同步副本选主 | unclean leader election | |
| 分层时间轮 | hierarchical timing wheel | |
| 宽松法定人数 | sloppy quorum | |
| 暗示移交 | hinted handoff | |
| 读修复 | read repair | |
| 兄弟版本 | siblings | 向量时钟冲突的多个版本 |
| 内存表 | memtable | |
| 墓碑 | tombstone | LSM / Cassandra 删除标记 |
| 压实 | compaction | 别译 compression |
| 默克尔树 | Merkle tree | M 大写 |
| 闲话协议 | gossip (protocol) | |

### 9.3 支付、钱包与订房（第 22、26、27 章）

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 支付订单 | payment order | |
| 支付执行器 | payment executor | |
| 托管支付页 | hosted payment page | |
| 复式记账 | double-entry ledger | |
| 对账文件 / 结算文件 | settlement file | |
| 更正分录 | correcting entry | |
| 冲正分录 | reversing entry | |
| 3D 安全验证 | 3D Secure | |
| 预占 / 保留 | hold | 订房库存预占；名词，限时 hold |
| 可售上限 | sellable limit | |
| 间夜 | room night | |
| 半开区间 | half-open interval | 入住日含、退房日不含 |

### 9.4 地理、监控与告警（第 16、17、18、20 章）

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 地理围栏 | geofencing | |
| 位置缓存 | location cache | |
| 排空（节点） | draining | 先排空再下线 |
| 标签基数 | label cardinality | |
| 时序数据库 | time-series database (TSDB) | 首次出现全称 |
| 采集器 | collector | |
| 待触发 / 触发中 / 恢复 | pending / firing / resolved | 告警状态；动词 resolve |
| 差值编码 | delta encoding | |

### 9.5 面试流程用语（第 3 章）

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 澄清范围 | clarify scope | |
| 收尾 | wrap-up | |
| 深入讲解 | deep dive | |
| 取得认同 | get buy-in | |
| 蓝图 | blueprint | 高层设计草图 |

### 9.6 社交、爬虫、短链与通讯（第 7、8、9、11、12、13、23 章）

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 扇出服务 | fan-out service | 连字符；别写 fanout |
| 大 V / 大账号 | large creator | |
| 请求合并 | request coalescing | |
| 主节点（持有者） | primary owner | 一致性哈希里持有某 key 的节点；别用 master |
| 短码 | short code | 别译 short key |
| 长 URL | long URL | |
| ID 生成器 | ID generator | |
| 冲突 / 碰撞 | collision | 哈希或 ID 冲突 |
| 种子 URL | seed URL | |
| URL 去重（已见检查） | URL-seen check | |
| 内容去重（已见检查） | content-seen check | |
| 前端队列 / 后端队列 | front queues / back queues | 爬虫调度：优先级 / 礼貌性 |
| 爬取预算 | crawl budget | |
| 爬虫陷阱 | crawler trap | |
| 礼貌性 | politeness | |
| 新鲜度 | freshness | |
| 通道工作线程 | channel worker | |
| 在线状态服务 | presence service | |
| 通知服务器 | notification server | |
| 游标 | cursor | |
| 收件箱（信息流 / 聊天） | inbox | 邮件系统里的「收件箱」同译 inbox |
| 写扩散 | fan-out on write | |
| 补发 / 追赶 | catch-up | 名词；动词 catch up |

### 9.7 全书统一用语

| 中文 | English | 用法 / 别译成 |
|---|---|---|
| 原书 / 原文 / 本章（指所依据的书） | the book / the chapter | 别写 "the original text"、"the original"（指书）；「批注」不在题库正文里引用，需要时写 "the chapter" |
| 幂等键 | idempotency key | 不写 idempotent key / idempotency token |
| 扇出 | fan-out | 名词带连字符；动词 fan out |
| 写穿 / 写回 | write-through / write-back | 带连字符（名词/形容词）；动词「写回」write back |
