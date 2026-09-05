# 系统设计面试笔记：中文版学习版

这是基于本仓库原版系统设计笔记整理的中文学习版（对应《System Design Interview》卷 1、卷 2 的笔记，并非原书全文），目标读者是**会写 CRUD，但对分布式系统、容量估算和故障处理缺乏整体感觉的工程师**。

> 原版目录和文件保持不变。中文版只在新目录中增加翻译、批注、学习提示和补充插图。

![从 CRUD 到系统设计的学习路线](./images/learning-roadmap.svg)

[打开离线阅读版](./index.html) · [自测题详解](./29.%20自测题详解/README.md) · [术语速查](./术语速查.md) · [原版延伸阅读](./延伸阅读.md) · [校验记录](./校验/验收说明.md)

## 怎么读

不要一开始背组件名。每一章都先回答四个问题：

1. **用户要什么**：请求是什么，成功结果是什么，哪些情况算失败。
2. **数据往哪里走**：客户端、API、缓存、数据库、队列、异步任务分别做什么。
3. **哪里会变慢或出错**：容量、热点、超时、重复消息、数据丢失和单点故障。
4. **怎样证明设计可用**：指标、重试、降级、数据校验和恢复演练。

正文保留原笔记的讲解顺序，在对应知识点旁加入补充：

- **学习导读**：先记住的主线和前置知识。
- **中文翻译**：按原文结构翻译，关键术语保留英文。
- **批注**：用 CRUD 工程师熟悉的类比解释“为什么这样设计”。
- **理解与复盘**：用例子、反例或自测问题检查是否真正理解。
- **插图**：把请求流、数据流或故障边界画出来；图中的箭头代表数据或控制流。

## 章节索引

- [第 1 章：从零扩展到百万用户](./01.%20Scaling/Readme.md)
- [第 2 章：数量级估算](./02.%20Back%20Of%20the%20Envelope%20Estimation/Readme.md)
- [第 3 章：系统设计面试框架](./03.%20System%20Design%20Framework/Readme.md)
- [第 4 章：限流器](./04.%20Rate%20Limiter/Readme.md)
- [第 5 章：一致性哈希](./05.%20Consistent%20Hashing/Readme.md)
- [第 6 章：键值存储](./06.%20Key-Value%20Store/Readme.md)
- [第 7 章：分布式唯一 ID](./07.%20Unique-Id%20Generator/Readme.md)
- [第 8 章：URL 短链接](./08.%20URL%20Shortener/Readme.md)
- [第 9 章：网页爬虫](./09.%20Web%20Crawler/Readme.md)
- [第 10 章：通知系统](./10.%20Notification%20System/Readme.md)
- [第 11 章：新闻 Feed](./11.%20News%20Feed%20System/Readme.md)
- [第 12 章：聊天系统](./12.%20Chat%20System/Readme.md)
- [第 13 章：搜索自动补全](./13.%20Search%20Autocomplete/Readme.md)
- [第 14 章：YouTube](./14.%20Youtube/Readme.md)
- [第 15 章：Google Drive](./15.%20Google%20Drive/Readme.md)
- [第 16 章：邻近服务](./16.%20Proximity%20Service/Readme.md)
- [第 17 章：附近的朋友](./17.%20Nearby%20Friends/README.md)
- [第 18 章：Google Maps](./18.%20Google%20Maps/README.md)
- [第 19 章：分布式消息队列](./19.%20Distributed%20Message%20Queue/README.md)
- [第 20 章：指标、监控与告警](./20.%20Metrics%20Monitoring%20and%20Alerting%20System/README.md)
- [第 21 章：广告点击聚合](./21.%20Ad%20Click%20Event%20Aggregation/README.md)
- [第 22 章：酒店预订系统](./22.%20Hotel%20Reservation%20System/README.md)
- [第 23 章：分布式邮件服务](./23.%20Distributed%20Email%20Service/README.md)
- [第 24 章：S3 类对象存储](./24.%20S3-like%20Object%20Storage/README.md)
- [第 25 章：实时游戏排行榜](./25.%20Real-time%20Gaming%20Leaderboard/README.md)
- [第 26 章：支付系统](./26.%20Payment%20System/README.md)
- [第 27 章：数字钱包](./27.%20%20Digital%20Wallet/README.md)
- [第 28 章：股票交易所](./28.%20Stock%20Exchange/README.md)

- [第 29 章：自测题详解（58 个答案条目）](./29.%20自测题详解/README.md)

## 建议的学习顺序

先读第 1–3 章建立容量和沟通框架；再读第 4–7 章掌握限流、分片、复制、唯一 ID 等基础积木；接着按兴趣阅读具体系统。支付、钱包、交易所和对象存储章节要特别关注**一致性、幂等和故障恢复**，它们比“能不能把数据写进数据库”更重要。

## 术语和图例

- **同步（sync）**：调用方要等结果返回。
- **异步（async）**：先把工作放进队列，稍后处理。
- **扩展（scale out）**：增加机器数量。
- **副本（replica）**：同一份数据的额外拷贝。
- **幂等（idempotency）**：同一个请求重复执行，最终效果与执行一次相同。
- **SLO / SLA**：对延迟、可用性等服务目标的约定。

所有章节图片都放在各章的 `images/` 中，原图按字节复制；新增图使用独立的 SVG 文件名，文中以中文标题或批注标识。英文原图中的术语可结合邻近中文说明阅读。

原笔记中的过时概括、算式矛盾和示例缺陷在相应位置单独标注，不默默改成另一套结论。未经实测的吞吐量和成本仍是题设或估算，不能直接当成生产系统保证。

第 29 章汇总 46 个章末自测条目，另补 5 道通用复盘题和 7 道钱包/交易所正文追问。每道题有稳定编号，可从原章题目后的链接跳到详细答案。
