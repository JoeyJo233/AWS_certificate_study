# Day 10：DynamoDB 与缓存

学习日期：2026-10-09。对应重排计划的 Day 10、原主题 10。

主线：先想清楚怎样查数据，再设计键、索引、容量与缓存。例子统一用 FamilyMart（全家便利店）。

## 1. 知识树

```text
Day 10：查得快、读得新、恢复得回来
│
├─ ① 数据怎么组织？——DynamoDB（键值与文档数据库）
│  ├─ Table（表）→ Item（记录）→ Attribute（属性）
│  ├─ Partition Key（分区键）：找到一组数据，如会员编号
│  ├─ Sort Key（排序键）：排列、定位组内数据，如日期#订单编号
│  ├─ 只有分区键：分区键值必须唯一
│  └─ 复合主键：分区键可以重复，两种键的组合必须唯一
│
├─ ② 怎么查询？
│  ├─ Query（按键查询）：指定分区键，可用排序键限定范围
│  ├─ Scan（扫描）：遍历数据再筛选，大表反复扫描成本可能高
│  └─ GSI（Global Secondary Index，全局二级索引）
│     ├─ 增加查找入口：有自己的键，可与原表不同
│     ├─ 保存索引数据，由 AWS 根据原表异步维护
│     └─ 可能落后于原表；只支持最终一致性读取
│
├─ ③ 读取够不够新？——Read Consistency（读取一致性）
│  ├─ Eventually Consistent（最终一致性）：默认，可能暂时读到旧值
│  ├─ Strongly Consistent（强一致性）：反映读取前已成功完成的更新
│  └─ 原表支持两种；GSI 不支持强一致性
│
├─ ④ 容量怎么付费？——Capacity Mode（容量模式）
│  ├─ On-Demand（按需）：不预先设置读写容量，按请求消耗计费
│  └─ Provisioned（预置）：配置读写容量，按配置和时长计费
│     └─ 可配 Auto Scaling（自动扩缩）；调整需要时间
│
├─ ⑤ 怎样减少重复读取？——Cache（缓存）
│  ├─ DAX（DynamoDB 加速器）：专用于 DynamoDB
│  │  ├─ 加速可接受最终一致性的重复读取
│  │  └─ 强一致性读取转交 DynamoDB，不由缓存提供结果
│  └─ ElastiCache（托管内存缓存）：由应用安排缓存读写
│     ├─ Memcached：简单键值缓存，如饭团介绍
│     ├─ Redis OSS / Valkey：丰富数据结构、会话、排行榜
│     └─ Sorted Set（有序集合）：维护会员分数与排名
│
├─ ⑥ 跨区域怎么办？——Global Tables（全局表）
│  ├─ 多个 Region（区域）的表都能读写，AWS 自动复制
│  ├─ MREC（多区域最终一致性）：默认，异步跨区域复制
│  ├─ MRSC（多区域强一致性）：支持跨区域强一致性，需符合配置要求
│  └─ 副本不代替历史备份；应用流量切换也需要配置
│
├─ ⑦ 误修改怎么办？——PITR（时间点恢复）
│  ├─ 提前开启，在可恢复范围内选时间点
│  └─ 恢复成新表；核对后安排使用，并处理该时间点之后的正常数据
│
├─ ⑧ 数据变了，怎样做后续任务？——Streams（变更流）
│  ├─ 记录新增、修改、删除，可包含修改前后的内容
│  └─ DynamoDB → Streams → Lambda → 更新 Redis 等
│     └─ 处理可能重复，代码需考虑幂等性、并发和更新顺序
│
└─ ⑨ 过期数据怎样清理？——DynamoDB TTL（存活时间）
   ├─ 为记录设置过期时间，后台异步删除，通常过期后几天内清理
   └─ 到期不等于立即删除；业务仍需自行检查有效期
```

## 2. 最容易混淆的边界

| 概念 | 正确理解 |
| --- | --- |
| 分区键 vs SQL | 查询时像 `WHERE CustomerID = 'Joey'`；不是 `GROUP BY` 汇总，也不自动算总额 |
| DynamoDB vs MongoDB | 都属于 NoSQL（非关系型）数据库，但不是同一产品；DynamoDB 重视预先设计访问模式 |
| 复杂查询 | DynamoDB 可通过键和索引支持多种业务查询；灵活的复杂关联、SQL 查询通常更适合 RDS / Aurora |
| Scan 返回少 | 不代表读取少；筛选发生在读取之后，不消除已消耗的读取容量 |
| GSI vs 原表 | GSI 不是应用独立写入的业务表，但有自己的索引数据，也需要维护 |
| GSI 的 Global | 指索引覆盖整个表的范围；不是跨 Region 复制，后者是 Global Tables |
| GSI 延迟 | 指索引可能尚未反映原表更新，不代表查询请求一定返回得慢 |
| 强一致性请求 | `ConsistentRead = true` 表示要求强一致性；不能让不支持它的 GSI 获得该能力 |
| 读取速度 vs 数据新旧 | 请求返回很快，也可能返回旧数据；不能说强一致性固定慢几倍 |
| Provisioned vs EC2 RI | 前者配置数据库读写能力，不要求承诺使用一年或三年 |
| 缓存与数据库 | 两份数据不会天然同步；缓存、索引、跨区域复制都可能产生旧数据，但原因不同 |
| Redis vs Kafka | Redis 可做缓存，也有消息功能；Kafka 侧重事件流的传递、保留与重放，不能直接等同 |

**读取容量例子**：单次读取一条不超过 4 KB 的记录，强一致性消耗 1 个 Read Unit（读取单位），最终一致性消耗 0.5。相同普通读取的容量消耗相差两倍，不代表整个数据库账单翻倍。

### GSI 为什么需要更新？

```text
原表：ProductID（商品编号）P001 → 品牌 A
GSI：BrandID（品牌编号）品牌 A → P001
             ↓ 把商品改为品牌 B
① 原表修改成功：P001 → 品牌 B
② GSI 异步更新：从品牌 A 移除 P001，在品牌 B 下加入 P001
```

两步之间，GSI 可能返回旧结果或暂时找不到新记录。二级索引这个概念不要求一定异步；这是 DynamoDB GSI 的更新规则。原表默认最终一致性读取也可能暂时返回旧值，立即确认修改应使用原表的完整主键进行强一致性读取。

### 强一致性的范围

| 配置 | 强一致性读取的保证 |
| --- | --- |
| 普通单区域原表 | 反映读取前已成功完成的写入，不排除之后又有人修改 |
| MREC 全局表 | 保证当地表；不能让其他区域尚未复制过来的修改瞬间到达 |
| MRSC 全局表 | 支持跨区域强一致性；是另一种表配置，不是把读取参数改为 `true` |

例：东京积分已更新为 1,600，但 MREC 复制尚未到新加坡；强一致性读取新加坡表仍可能得到 1,200。“当地”指 AWS Region，不是自己的电脑。GSI 在这些情况下仍只支持最终一致性读取。

## 3. 全家便利店：把数据库、缓存和函数连起来

**缓存商品介绍：Lazy Loading / Cache-Aside（懒加载 / 旁路缓存）**

```text
应用先问 ElastiCache
├─ Cache Hit（缓存命中）→ 直接返回
└─ Cache Miss（缓存未命中）→ 查询 RDS → 保存缓存副本 → 返回
```

缓存可设置 TTL；过期后下一次查询才重新加载，不是到点自动查询数据库。数据库修改时可由应用更新或删除对应缓存。Write-Through（写穿透）是在写数据库时维护缓存，但两次写入不能默认成为一个原子事务。缓存本身也收费，降低数据库读取不保证总费用一定更低。

**会员积分排行榜：Redis 不只是保存查好的结果。**

```text
DynamoDB：保存积分业务记录
    ↓ Streams 记录变化
Lambda：执行更新代码
    ↓
Redis Sorted Set：维护分数和排名 → 快速查前十名、某位会员名次
```

也可缓存数据库算好的前十名结果；有序集合则支持动态维护排名。应用需要安排更新，不能认为 Redis 自动复制 DynamoDB。重复事件不能重复加分；“设为最新分数”还要考虑旧事件覆盖新分数，需妥善处理去重、并发和顺序。

**优惠券：缓存有效期、业务有效期、记录删除时间是三件事。**

- 缓存没有过期，不表示内容仍是最新；DynamoDB 记录尚未被 TTL 删除，也不表示券仍有效。
- 商品介绍、优惠券说明可以缓存；核销不能只相信可能过时的“可使用”缓存。
- 应用检查业务有效期与使用状态，并用 Conditional Write（条件写入）等原子操作防止并发重复核销。

## 4. 和之前知识串起来

- [Day 1](day01.md)：Multi-AZ（多可用区）应对区域内 AZ 故障；Global Tables 跨区域；当前副本不代替历史备份。
- [Day 7](day07.md)：ElastiCache 曾用于共享 Session（登录会话）；今天同一服务用于缓存查询结果、维护排名。
- [Day 8](day08.md)：RDS 副本也可能有 Replication Lag（复制延迟）；读取扩展、故障接班、历史恢复是不同需求。RDS 与 DynamoDB 的 PITR 都恢复到新数据库 / 新表。
- [Day 9](day09.md)：S3 事件 → Lambda，与 DynamoDB Streams → Lambda 都是变化触发后续处理；写入成功不等于后续任务完成，重试仍需 Idempotency（幂等性）。
- 服务与引擎：RDS 可运行 MySQL / PostgreSQL；ElastiCache 可运行 Redis OSS / Valkey / Memcached。Redis Pub/Sub（发布/订阅）不补发断线期间错过的消息；Streams（流）可保留消息，但不等于 Kafka。

## 5. 学习记录

- 已完成：核心讲解与引导题，补充 Streams、PITR、TTL、条件核销，以及 GSI 的索引数据与异步维护。
- 变体交互测验：**9/10**。第 3 题错；第 8 题选对，但当时不确定。之后已解释两处，尚未用新题再次独立验证。

| 题号 | 场景 / 正确判断 | 作答结果 |
| --- | --- | --- |
| 1 | Query 指定会员分区键，用排序键限定月份 | B，正确 |
| 2 | 按品牌 Query GSI，保留原表商品主键 | C，正确 |
| 3 | 刚写成功需立即确认：完整主键 + 原表强一致性读取 | 选 B；正确答案 A，GSI 不支持强一致性 |
| 4 | 用量未知、按请求消耗计费：On-Demand | B，正确 |
| 5 | DAX 将强一致性读取转交原表，不用缓存提供结果 | A，正确 |
| 6 | TTL 未删除、缓存未过期，均不能延长优惠券业务有效期 | C，正确 |
| 7 | Redis 维护排名，DynamoDB 保存业务记录，应用安排更新 | B，正确 |
| 8 | MREC 下当地强一致性读取不能消除跨区域复制延迟 | A，正确但不确定 |
| 9 | PITR 恢复过去状态到新表，另行考虑之后的正常记录 | C，正确 |
| 10 | Streams / Lambda 重试需持久化去重、原子操作与顺序处理 | B，正确 |

- 复习重点：先看读取原表还是 GSI，再看单区域、MREC 还是 MRSC；不要把“查询慢”和“数据更新慢”混为一谈。
- 本节未创建 AWS 资源或完成控制台实操；网页打卡状态独立保存，不因写笔记自动改变。

## 6. 官方参考

- [表、记录、键与索引](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html)
- [按访问模式设计 DynamoDB](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html)
- [Scan 与读取容量](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Scan.html)
- [GSI：索引数据、异步更新与费用](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html)
- [读取一致性与跨区域模式](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html)
- [读取单位计算](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/read-write-operations.html)
- [按需 / 预置容量](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/capacity-mode.html)
- [预置容量与自动扩缩](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/provisioned-capacity-mode.html)
- [DAX 与一致性](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.consistency.html)
- [缓存策略与 TTL](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/Strategies.html)
- [ElastiCache 引擎比较](https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/SelectEngine.html)
- [Redis 有序集合与排行榜](https://redis.io/docs/latest/develop/data-types/sorted-sets/)
- [Redis Pub/Sub 与 Streams 的区别](https://redis.io/docs/latest/develop/pubsub/)
- [Kafka 事件流概述](https://kafka.apache.org/intro/)
- [Global Tables](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GlobalTables.html)
- [PITR 恢复到新表](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/pointintimerecovery_restores.html)
- [DynamoDB Streams](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html)
- [Lambda 消费变更流与幂等处理](https://docs.aws.amazon.com/lambda/latest/dg/with-ddb.html)
- [DynamoDB TTL 清理规则](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html)
