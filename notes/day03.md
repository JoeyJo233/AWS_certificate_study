# Day 03：EC2（云服务器）

学习日期：2026-09-30

## 1. 创建服务器时选什么？

| 概念 | 简单理解 |
|---|---|
| EC2 instance（云服务器实例） | 租一台电脑，运行网站或应用 |
| AMI（机器映像） | 装机模板：操作系统、可选的预装软件与配置 |
| Instance type（实例类型） | 电脑配置：CPU（处理器）、内存、网络等能力 |
| IAM Role（身份角色） | 应用可以访问哪些 AWS 资源 |
| Security group（安全组） | 允许哪些网络连接 |
| User data（用户数据／启动脚本） | 首次启动时自动安装软件、配置环境 |

- AMI 类似 Docker image（容器镜像），但 AMI 创建服务器；容器镜像创建容器，容器共享宿主机内核。
- General purpose（通用型）：普通网站，配置均衡。
- Compute optimized（计算优化型）：大量计算，例如视频转码。
- Memory optimized（内存优化型）：大量数据放在内存里，例如内存缓存。
- **先看瓶颈，再选配置；内存不足，不一定靠增加 CPU 解决。**

## 2. 购买方式树状图

按“省钱、容量保障、硬件独占”理解；这些维度可以配合使用。

```text
EC2（云服务器）的选择
│
├─ ① 怎么付款、怎么省钱？
│  │
│  ├─ 不承诺长期使用
│  │  ├─ On-Demand（按需购买）
│  │  │  └─ 随用随付，适合短期或用量不确定
│  │  └─ Spot（竞价实例）
│  │     └─ 闲置算力，通常便宜，但可能中断
│  │
│  └─ 承诺一年或三年，换折扣
│     ├─ Savings Plans（节省计划）
│     │  ├─ EC2 Instance SP（EC2 实例节省计划）
│     │  │  └─ 限定区域和实例系列，通常折扣更大
│     │  └─ Compute SP（计算节省计划）
│     │     └─ 可跨系列、区域，覆盖 EC2/Lambda/Fargate
│     │
│     └─ Reserved Instances，RI（预留实例）
│        ├─ 按调整灵活性分
│        │  ├─ Standard（标准型）：限制更多，通常折扣更大
│        │  └─ Convertible（可转换型）：可按规则交换配置
│        └─ 按适用范围分
│           ├─ Regional（区域级）：有折扣，不预留容量
│           └─ Zonal（可用区级）：有折扣，也预留容量
│
├─ ② 怎么提前保证有容量？
│  ├─ On-Demand Capacity Reservation（按需容量预留）
│  │  └─ 指定 AZ 和匹配配置；本身无折扣，闲置也收费
│  └─ Zonal RI（可用区级预留实例）
│     └─ 长期折扣 + 指定 AZ 的匹配容量保障
│
└─ ③ 是否需要独占硬件？
   ├─ Dedicated Instance（专用实例）
   │  └─ 硬件不与其他客户共享，但不直接管理具体主机
   └─ Dedicated Host（专用主机）
      └─ 独占整台物理主机，适合特定许可证或合规要求
```

- AZ（可用区）属于 Region（区域）。容量保障不等于永不宕机，高可用仍需架构设计。
- RI 的两组分类是不同维度，可组合，例如 Standard + Regional。
- 普通即时按需容量预留无需一年或三年承诺；未来日期的预留可能有额外承诺要求。

## 3. SP、折扣与场景选择

两种 SP 都承诺一年或三年的**每小时消费金额**，不是买下一台机器。

| 比较 | EC2 Instance SP | Compute SP |
|---|---|---|
| 服务范围 | EC2 | EC2、Lambda（无服务器计算）、Fargate（托管容器计算） |
| 区域和实例系列 | 固定一个区域和一个系列 | 可跨区域、系列 |
| 同系列调整大小 | 可以，例如 m5.large → m5.xlarge | 可以 |
| 操作系统 | 可以调整 | 可以调整 |
| 取舍 | 限制更多，通常折扣更大 | 灵活性更高，通常折扣较小 |

- 消费承诺即使用不满也要承担，不结转到下一小时；超出覆盖范围的用量通常按 On-Demand 计费。
- 折扣大致比较：On-Demand 无折扣 → Compute SP / Convertible RI → EC2 Instance SP / Standard RI；Spot 通常优惠很大，但可能中断。具体价格取决于配置、区域、期限和付款方式，没有固定排名。
- 不同用量可以混搭；同一份用量不叠加 RI、SP、Spot 折扣。匹配的 RI 先应用，SP 覆盖其他符合条件的用量。
- Capacity Reservation 本身不打折，可以配合符合条件的 SP 或 Regional RI；未使用的预留容量仍收费。

| 网上鞋店的需求 | 优先考虑 |
|---|---|
| 临时测试三天，不接受 Spot 回收 | On-Demand |
| 长期稳定的基础用量 | RI 或 SP |
| 临时促销增加服务器 | On-Demand；明确要求指定 AZ 容量保障时再考虑容量预留 |
| 可中断、可重试的图片处理 | Spot |
| 固定区域、固定 m5 系列，仅调整大小 | EC2 Instance SP |
| 未来可能迁移到 Lambda | Compute SP |
| 软件许可证要求管理具体物理主机 | Dedicated Host |

**口诀：SP 解决省钱；Capacity Reservation 解决有容量。**

## 4. 生命周期与数据保留

下表按普通停止、正常重启理解，不包含休眠等特殊情况。

| 数据所在位置 | Reboot（重启） | Stop → Start（停止后再启动） | Terminate（终止） |
|---|---|---|---|
| RAM（内存） | 丢失 | 丢失 | 丢失 |
| Instance store（实例存储） | 保留 | 丢失 | 丢失 |
| EBS（弹性块存储） | 保留 | 保留 | 由 DeleteOnTermination（终止时删除）设置决定 |

- Instance store 是宿主机上的临时本地磁盘，不是内存；底层磁盘故障也可能导致数据丢失。
- EBS 支持独立于实例保留；根卷常见默认配置是随实例终止而删除。
- Stop 后可再启动；Terminate 后不能恢复启动原实例。
- **停止后通常不收该实例的按需计算费用，但 EBS 等资源仍收费，RI/SP 承诺和容量预留费用也不会因此自动免除。**
- 唯一的重要数据不能只放临时磁盘；持久存储也需要备份。

订单例子：RDS（托管关系型数据库）存订单编号、金额和状态；S3（对象存储）存订单 PDF、图片和 CSV；EBS 存应用需要使用的本地文件。

## 5. 启动脚本与权限

- User data 默认通常只在首次启动时执行，普通重启不会再次执行；可另外配置执行频率。
- 网站每次开机自动启动，可通过操作系统服务配置实现，无需重复安装。
- 脚本从私有 S3 下载程序，仍需网络连通和具备读取权限的 Role。
- 不把长期 Access key（访问密钥）写入脚本或代码。

## 学习记录

- 核心理论和随堂练习已完成，综合题正确；尚未进行独立的五题测验或控制台实操。
- 易混点已澄清：容量预留本身没有折扣；临时使用不等于必须预留容量；Instance store 正常重启保留、停止后丢失。

## 官方参考

- [EC2 购买方式](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-purchasing-options.html)
- [Savings Plans 类型](https://docs.aws.amazon.com/savingsplans/latest/userguide/plan-types.html)
- [RI 的区域与可用区范围](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/reserved-instances-scope.html)
- [按需容量预留](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-capacity-reservations.html)
- [实例存储的数据保留](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-store-lifetime.html)
- [EC2 启动脚本](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html)
