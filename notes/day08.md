# Day 08：RDS 与 Aurora 关系型数据库

学习日期：2026-10-09

本节按学习计划的实际顺序编号为 Day 08，对应 `index.html` 中原主题编号 9「RDS 和 Aurora：关系型数据库」。

今天的主线：先判断需求是故障接班、读取扩展、历史恢复，还是连接管理；再选择服务和部署形式。用户已有 MySQL、PL/SQL、Microsoft Access 和 Neo4j 使用经验，本节重点是 AWS 架构而不是 SQL 入门。

## 1. 知识树

```text
Day 8：数据库故障、查询太多、误删数据、连接太多怎么办？
│
├─ ① 基础概念：服务、实例、角色、存储、地址不是同一个东西
│  ├─ RDS：Relational Database Service（关系型数据库服务）
│  │  ├─ AWS 托管底层基础设施与数据库维护能力
│  │  ├─ 用户仍负责表结构、SQL、索引、访问权限和业务数据
│  │  └─ 备份、高可用等需要按需求配置，不是选 RDS 就全部自动具备
│  ├─ DB Instance（数据库实例）：运行数据库引擎的 CPU、内存等计算资源
│  ├─ Primary / Writer（主实例 / 写入角色）：可以读，也负责写
│  ├─ Reader（读取角色）：正常状态下只读；被提升为 Writer 后才能写
│  ├─ Storage（存储）：保存数据，不直接代替实例执行 SQL
│  └─ Endpoint（连接端点）：应用使用的连接地址，不是执行 SQL 的实例
│
├─ ② 如何防故障？——High Availability（高可用）
│  ├─ HA 是目标；Failover（故障转移）是接班机制
│  ├─ 传统 Multi-AZ DB instance deployment（多可用区数据库实例部署）
│  │  ├─ 同一个 Region 内：1 个 Primary + 1 个 Standby，跨 2 个 AZ
│  │  ├─ Standby（备用实例）：同步复制，但不处理日常查询
│  │  └─ 主实例故障 → RDS 自动切换到 Standby；连接可能短暂中断
│  ├─ RDS Multi-AZ DB cluster deployment（多可用区数据库集群部署）
│  │  ├─ 同一个 Region 内：1 个 Writer + 2 个 Reader，跨 3 个 AZ
│  │  ├─ 两个 Reader：可以查询，也能作为自动故障转移目标
│  │  ├─ 各实例有自己的数据库存储，通过引擎复制保持关联
│  │  └─ Semisynchronous Replication（半同步复制）仍可能有读取延迟
│  └─ Multi-AZ 是部署方式：不能一概说所有备用实例都不能查询
│
├─ ③ 如何分担查询？——Read Scaling（读取扩展）
│  ├─ 普通 RDS Read Replica（只读副本），本节以 RDS for MySQL 为例
│  │  ├─ 另外创建，用于报表等读取负载
│  │  ├─ 主实例 → Asynchronous Replication（异步复制）→ 副本
│  │  ├─ 应用需要实际把查询发给副本，不会因创建副本就自动分流
│  │  └─ 不能默认会自动接管主实例写入；需要提升与应用切换等安排
│  ├─ 可与传统 Multi-AZ 配合：Standby 接班，Read Replica 分担查询
│  └─ Replication Lag（复制延迟）
│     ├─ 副本可能暂时看不到主实例刚提交的订单
│     ├─ 刚下单后必须立即看到 → 查询 Primary / Writer
│     └─ 允许稍有延迟的报表 → 可查询副本 / Reader
│
├─ ④ Aurora 与普通 RDS 集群有什么不同？
│  ├─ Amazon Aurora：AWS 开发的关系型数据库引擎，属于 RDS 服务
│  │  ├─ Aurora MySQL-Compatible（兼容 MySQL）
│  │  └─ Aurora PostgreSQL-Compatible（兼容 PostgreSQL）
│  │     └─ 兼容不代表全部版本与功能完全相同，迁移仍需检查
│  ├─ Compute（计算）与 Storage（存储）分离
│  │  ├─ Writer：数据库实例，执行读写 SQL
│  │  ├─ Aurora Replica：就是 Reader 数据库实例，执行读取 SQL
│  │  └─ Cluster Volume（集群存储卷）：实例共享，底层跨 AZ 冗余
│  ├─ 计算层与存储层高可用要分开看
│  │  ├─ 存储冗余 ≠ 已有另一台运行中的数据库实例
│  │  ├─ 有 Reader → 可提升其中一个为新 Writer
│  │  └─ 只有 Writer → 故障后需恢复或重建计算实例，不能靠存储执行 SQL
│  ├─ 共享存储 ≠ 共享实例内存或零复制延迟
│  │  └─ Reader 仍需跟上 Writer 更新；刚写入必须立即读取时查 Writer
│  └─ Aurora Endpoints（Aurora 连接端点）
│     ├─ Cluster / Writer Endpoint（集群 / 写入端点）：指向当前 Writer
│     │  ├─ 用于写入，也可以读取
│     │  └─ Failover 后端点指向新 Writer；应用仍需处理断线与重连
│     └─ Reader Endpoint（读取端点）：有 Reader 时分配新连接给 Reader
│        ├─ 按连接分配，不把同一连接内每条 SQL 轮流发给不同实例
│        ├─ 不分析 SQL 自动做读写分流
│        └─ INSERT 连到正常 Reader → 失败，不自动转发给 Writer
│
├─ ⑤ 如何找回误删的数据？——Backup and Recovery（备份与恢复）
│  ├─ 冗余不是历史备份：删除也会复制到 Standby / Reader
│  ├─ Snapshot（快照）：保存某个时刻的数据库状态
│  │  └─ 从 12:00 快照恢复 → 得到该快照时刻的数据
│  ├─ PITR：Point-in-Time Recovery（时间点恢复）
│  │  ├─ 利用自动备份与事务日志，恢复到可恢复范围内的指定时间点
│  │  └─ 14:05 误删 → 可选择可恢复的 14:04，保留更多误删前数据
│  └─ RDS 实例恢复不是原地倒带
│     ├─ 原数据库 A 不变 → 网站若没改连接，仍访问 A
│     ├─ 恢复创建新数据库 B → 验证后安排切换或取回数据
│     └─ B 不包含恢复时间点之后的变化，需考虑后续正常业务数据
│
└─ ⑥ 如何缓解连接洪峰？——RDS Proxy（RDS 数据库代理）
   ├─ 应用 → Proxy → RDS / Aurora
   ├─ Connection Pooling（连接池）：维护、复用到数据库的连接
   ├─ 缓解频繁创建连接与连接数量暴增带来的开销
   └─ 不等于查询扩容、结果缓存或自动 SQL 读写分流
      └─ 不能让数据库拥有无限的 SQL 处理能力
```

## 2. 三种部署架构对比

以下比较传统 RDS Multi-AZ 实例、非 Aurora 的 RDS Multi-AZ 集群，以及今天讲的单区域 Aurora 集群。

| 比较项 | 传统 RDS Multi-AZ 实例部署 | RDS Multi-AZ 集群部署 | Aurora 集群 |
| --- | --- | --- | --- |
| 实例角色 | 1 Primary + 1 Standby | 1 Writer + 2 Reader | 1 Writer，可添加 Reader |
| 非主实例平时能否查询 | Standby 不能 | Reader 可以 | 已配置的 Reader 可以 |
| 自动接班目标 | Standby | 集群中的 Reader | 已配置的 Aurora Reader |
| 存储结构 | 主备各有数据存储副本 | 各实例有数据存储，通过复制保持关联 | 实例使用共享集群存储卷 |
| 主要区别 | 高可用，不靠 Standby 扩展读取 | 高可用，同时能分担读取 | 计算与共享存储分离 |

```text
传统 RDS Multi-AZ 实例
Primary → 自己的存储 ──同步复制──→ Standby 的存储
                                  Standby 不接日常查询

RDS Multi-AZ 集群
Writer → 自己的存储
   ├──复制──→ Reader A → 自己的存储
   └──复制──→ Reader B → 自己的存储

Aurora 集群
Writer   ──┐
Reader A ──┼── 同一个逻辑集群存储卷（底层跨 AZ 冗余）
Reader B ──┘
```

说明：上图用于区分计算与存储，不表示 Aurora 没有实例间复制协调，也不保证 Reader 零延迟。普通 RDS 集群的数据库副本互相关联，不是三套可以各自随意写入的独立业务数据库。

## 3. 三类副本不要混淆

| 名称 | 属于哪里 | 日常查询 | 自动接管主实例写入 |
| --- | --- | --- | --- |
| Standby（备用实例） | 传统 RDS Multi-AZ 实例部署 | 不可以 | 可以 |
| 普通 Read Replica（只读副本） | 本节指另外创建的 RDS for MySQL 副本 | 可以 | 不能默认自动接管 |
| Reader（读取实例） | RDS Multi-AZ 集群 | 可以 | 可以，由 RDS 选择一个提升 |
| Aurora Replica（Aurora 读取副本） | Aurora 集群的计算层 | 可以 | 可以，被选中提升后成为 Writer |
| Aurora 底层存储副本 | Aurora 存储层 | 不能独立执行 SQL | 不是计算实例，不能充当 Writer |

Reader 的正常角色是只读；接班成为 Writer 后角色改变，才负责写入。Writer 本身也能执行 SELECT，不是只会写。

## 4. 故障接班与历史恢复对比

| 问题 | 需要什么 | 不要误选 |
| --- | --- | --- |
| 主实例或 AZ 故障 | High Availability + Failover | 不应把恢复历史备份当作现成实例接班 |
| 报表查询拖慢主实例 | 可读取的副本，并让应用把查询发过去 | 传统 Standby 不处理报表 |
| 刚下单要立即看到订单 | 查 Primary / Writer | 增加 Reader 不保证零延迟 |
| 误删且已提交 | 误删前快照或 PITR | 切换到同步收到删除的 Standby |
| 频繁建连或连接过多 | RDS Proxy 的连接管理 | 不应把连接问题与查询计算负载混为一谈 |

PITR 例子：14:05 误删 → 新数据库 B 恢复到 14:04 → 核对数据 → 安排取回数据或应用切换。原数据库 A 不被覆盖；恢复后的 B 也不含 14:04 之后的正常变化。

## 5. 今天纠正的概念与补充边界

- High Availability（高可用）是目标，Failover（故障转移）是接班机制；Standby 不是用来找回误删数据的历史备份。
- Aurora Replica 指计算层的 Reader，不是存储层的一份数据副本。
- Writer / Reader 是角色名称，不能仅凭名称判断两个产品的存储架构相同。
- Aurora 共享存储，但各实例有自己的内存、缓存与事务可见状态；仍可能有 Replication Lag。
- Writer Endpoint 是地址，不是实例；背后指向当前 Writer，不永久绑定旧实例。
- Endpoint 不自动理解 SQL 并分流；应用需要安排读写连接。
- Reader Endpoint 的边界：Aurora 没有 Reader 时，它会连接 Writer；“连到 Reader 写入失败”以确实连接正常只读 Reader 为前提。
- Aurora 的存储冗余与跨 AZ Reader 配置是两件事；自动接班也不是保证业务完全无中断。
- 本节架构比较限于上述部署，不表示共享存储是整个数据库领域只有 Aurora 才有的技术。

## 6. 学习记录

- 完成：RDS 责任边界、两种 Multi-AZ 部署、普通 Read Replica、复制延迟、快照与 PITR、Aurora 计算与存储、端点、RDS Proxy。
- 引导阶段曾混淆：Standby 与备份、PITR 是否原地覆盖、数据库实例与角色、两类集群存储结构、共享存储与零读取延迟；已逐步澄清。
- 综合练习：10 道选择题首次选择均正确，10/10。部分题未要求或未给出完整理由，因此成绩表示本轮选择正确，不等于全部概念都能独立完整解释。
- 第 2 题补充纠正：自动提升 Reader 不仅 Aurora 有，RDS Multi-AZ DB cluster 也有。
- 第 7 题选择正确，并追问 D 的错误原因；已补充 Aurora 共享存储仍可能有读取延迟。
- 本节未进行 AWS 控制台实操，也未创建付费资源。
- 下一节按重排计划为 Day 09「DynamoDB 与缓存」；复习优先比较副本角色、存储架构、故障接班与历史恢复。

## 7. 官方参考

- [RDS 概述与部署形式](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/)
- [传统 Multi-AZ 实例与不可读取的 Standby](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html)
- [RDS Multi-AZ 集群与半同步复制](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/multi-az-db-clusters-concepts.html)
- [普通 RDS Read Replica 与异步复制](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html)
- [RDS 快照](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_CreateSnapshot.html)
- [RDS PITR 创建新实例](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html)
- [Aurora 概述与兼容引擎](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_AuroraOverview.html)
- [Aurora 计算与共享集群存储](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.html)
- [Aurora Reader 与复制延迟](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Replication.html)
- [Aurora 端点与连接分配](https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/Aurora.Overview.Endpoints.html)
- [RDS Proxy 连接池与连接管理](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html)
