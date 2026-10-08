# Day 06：存储、数据保护与成本取舍

学习日期：2026-10-03、2026-10-08

## 1. 知识树

```text
Day 6：AWS 存储
│
├─ ① 数据放哪里？——先看应用怎样访问数据
│  │
│  ├─ S3：Object Storage（对象存储）
│  │  ├─ 适合图片、视频、日志、备份文件
│  │  ├─ Bucket（存储桶）：对象的容器
│  │  └─ GetObject / PutObject：读取／上传对象
│  │
│  ├─ EBS：Block Storage（块存储）
│  │  ├─ 像 EC2 的硬盘：安装系统、软件、保存数据
│  │  ├─ 卷与 EC2 必须在同一个 AZ（可用区）
│  │  ├─ Attach（连接）：把卷连接到 EC2
│  │  └─ Mount（挂载）：把文件系统接入操作系统目录
│  │
│  └─ 共享文件存储——多台服务器使用同一个文件夹
│     ├─ EFS（弹性文件系统）
│     │  ├─ 像 NAS（网络附加存储），常用于 Linux
│     │  ├─ 使用 NFS（网络文件系统协议）
│     │  ├─ Regional（区域型）：数据跨多个 AZ 保存
│     │  └─ One Zone（单可用区型）：数据在一个 AZ 保存
│     │
│     └─ FSx（托管文件系统系列）——与 EFS 是独立服务
│        ├─ FSx for Windows File Server（Windows 文件服务器）
│        │  ├─ Windows 文件共享，支持 SMB 协议
│        │  └─ 集成 AD（活动目录），使用域账号和组管理访问
│        └─ FSx for Lustre（托管 Lustre 文件系统）
│           └─ 高性能并行文件访问：科学计算、机器学习等
│
├─ ② S3 如何管理数据？
│  │
│  ├─ Versioning（版本控制）——保留历史版本
│  │  ├─ 同一个 Key（对象名称）可有多个 Version ID（版本编号）
│  │  ├─ 误覆盖：可以利用保留的旧版本恢复
│  │  ├─ 普通删除：不指定版本编号，添加 Delete Marker（删除标记）
│  │  │  └─ 普通读取显示不存在，但旧版本仍在
│  │  └─ 指定版本永久删除：该版本无法靠版本控制找回
│  │
│  ├─ Lifecycle（生命周期管理）——按规则处理数据
│  │  ├─ Transition（转换）：改变存储类别，数据还在
│  │  ├─ Expiration（过期删除）：按规则删除
│  │  └─ 开启版本控制后，当前版本和历史版本需分别考虑
│  │
│  └─ Replication（复制）——另一个桶保存副本
│     ├─ SRR（同区域复制）：源桶、目标桶在同一 Region（区域）
│     ├─ CRR（跨区域复制）：源桶、目标桶在不同 Region
│     ├─ 异步复制：上传成功不代表目标桶立即已有副本
│     ├─ 源桶、目标桶都需开启版本控制，并配置复制权限
│     └─ 规则启用前已有对象：可用 Batch Replication（批量复制）
│
├─ ③ S3 存储类别怎么选？
│  │
│  ├─ 经常读取
│  │  └─ Standard（标准）
│  │
│  ├─ 偶尔读取，必须立即拿到
│  │  ├─ Standard-IA（标准低频访问）
│  │  │  └─ 跨多个 AZ 保存，最低存储计费期限 30 天
│  │  └─ One Zone-IA（单可用区低频访问）
│  │     └─ 成本更低，适合可重建数据；不能承受所在 AZ 丢失
│  │
│  ├─ 访问规律未知或经常变化
│  │  └─ Intelligent-Tiering（智能分层）
│  │     ├─ 按实际访问情况自动调整访问层
│  │     ├─ 有对象监控与自动化费用
│  │     └─ 可选的异步归档层启用后，读取前需要恢复
│  │
│  └─ 长期保存，极少读取
│     ├─ Glacier Instant Retrieval（归档即时取回）
│     │  └─ 毫秒级读取；最低存储计费期限 90 天
│     ├─ Glacier Flexible Retrieval（归档灵活取回）
│     │  └─ 先恢复，分钟到小时；最低计费期限 90 天
│     └─ Glacier Deep Archive（深度归档）
│        └─ 先恢复，小时到一两天；最低计费期限 180 天
│
├─ ④ 如何判断存储成本？——FinOps（云财务运营）思路
│  ├─ 总成本：存储费＋取回费＋请求费＋适用的其他费用
│  ├─ Standard-IA vs Glacier IR（归档即时取回）
│  │  └─ 都能立即读取；IR 存储更便宜，但取回和 GET 请求更贵
│  ├─ 便宜的类别可能牺牲：读取费用、恢复时间、跨 AZ 保护
│  └─ 最低计费期限不是禁止删除，提前删除可能仍需补足费用
│
├─ ⑤ 数据怎样加密、授权？
│  │
│  ├─ In Transit（传输中）：使用 HTTPS / TLS（传输层安全协议）
│  │
│  ├─ At Rest（静态存储时）
│  │  ├─ SSE-S3：使用 S3 管理密钥的服务端加密，新上传对象默认加密
│  │  └─ SSE-KMS：使用 KMS（密钥管理服务）密钥的服务端加密
│  │
│  └─ 读取 SSE-KMS 对象
│     ├─ s3:GetObject：允许读取指定 S3 对象
│     ├─ kms:Decrypt：允许使用对应 KMS 密钥解密
│     ├─ Key Policy（密钥策略）：需要支持这种授权
│     └─ S3 负责服务端解密，应用不需要保存密钥手动解密
│
├─ ⑥ EFS 怎样通过网络使用？
│  ├─ EC2 → Mount Target（挂载目标，私有 IP）→ EFS
│  ├─ 使用 NFS，TCP 2049
│  ├─ EC2 安全组允许出站连接，挂载目标安全组允许入站连接
│  ├─ 同 VPC（虚拟私有云）的访问可走内部网络，不需要 NAT / IGW
│  └─ 网络连通后，文件权限等访问控制仍需满足
│
└─ ⑦ 如何备份、恢复？
   │
   ├─ EBS Snapshot（快照）
   │  ├─ 保存某个时间点的卷数据，之后的修改不会自动加入
   │  ├─ 增量保存：后续快照只新增保存变化的数据块
   │  ├─ 每份快照都能恢复对应时间点的完整卷数据
   │  ├─ 删除旧快照不会破坏保留的其他快照
   │  └─ 可在另一个 AZ 创建新卷；两个卷之后不会自动同步
   │
   ├─ EFS → 使用 AWS Backup（AWS 备份服务）
   ├─ FSx → 具体产品支持的备份／快照
   ├─ S3 → 版本控制，也可以使用 AWS Backup
   │
   └─ 跨 AZ 冗余 ≠ 备份
      ├─ 跨 AZ 冗余：应对 AZ 故障
      └─ 备份：找回过去的数据，应对误删除、错误修改
```

**口诀：Versioning 留旧版，Lifecycle 按规则管理，Replication 到别处留副本。**

## 2. 易混概念，用例子记

| 概念 | 简单理解 |
|---|---|
| EBS / EFS / S3 | 我的硬盘／大家共用的网络文件夹／通过接口存取的对象仓库 |
| Attach / Mount | 把硬盘接到电脑／让文件系统通过 `/data` 这样的目录使用；反向操作是 Detach（分离）与 Unmount（卸载） |
| EFS / FSx | 独立服务；不能记成“所有 FSx 都用于 Windows”，Lustre 常用于 Linux 高性能计算 |
| SMB（服务器消息块协议） | 网络访问共享文件的规则，例如 Windows 打开 `\\fileserver\财务资料` |
| AD：Active Directory（活动目录） | 公司统一的域账号、组管理系统；文件服务器根据这些身份配置文件权限 |
| 冷数据 / 慢读取 | 数据很少访问不代表读取一定慢；Standard-IA 和 Glacier IR 都能毫秒级读取 |
| One Zone-IA | 冗余副本都在一个 AZ，并非只有一份数据；整个 AZ 丢失时仍有丢失风险 |
| EFS Regional / 备份 | 跨 AZ 维护当前数据／保留过去的数据；删除共享文件后，其他 EC2 也看不到，冗余不会自动撤销删除 |

- EFS 是同一个共享文件系统；新 EC2 挂载后可直接访问，不需要先复制到自己的 EBS。
- 多台服务器同时修改同一文件，程序仍需正确处理并发和文件锁。
- EFS Regional 可以在各 AZ 配置挂载目标，供客户端访问同一个文件系统。
- Security Group（安全组）是资源网络接口的门卫，只支持允许规则；有状态，已允许连接的回复自动放行。
- NACL（网络访问控制列表）检查子网边界流量，支持允许与拒绝；无状态，请求与回复需分别放行。
- Snapshot 不是 EBS 独有的概念：FSx for ONTAP 支持原生快照，FSx for Windows 支持备份；EFS 常用 AWS Backup。S3 没有与 EBS 相同的“整个桶快照”功能。
- EBS 快照由 AWS 存在 S3 中，不能用自己的 S3 控制台直接查看或下载这些快照。

## 3. IAM 与 KMS：谁、操作、资源分开看

```text
EC2 上的应用使用 IAM Role（角色）发起请求
│
├─ s3:GetObject → 操作目标是 S3 对象，不是 EC2
└─ kms:Decrypt → 使用该对象对应的 KMS 密钥解密
```

两项权限都可以授予角色。`kms:Decrypt` 是独立的解密操作权限，不是让 `s3:GetObject` 生效的通用开关；SSE-S3 对象不需要额外的 KMS 解密权限。

```text
策略分工
│
├─ Trust Policy（信任策略）→ 谁可以使用角色？
├─ Permissions Policy（权限策略）→ 角色允许做什么、操作哪些资源？
└─ Key Policy（密钥策略）→ 这把 KMS 密钥怎样授权使用？
   ├─ 可以直接允许指定角色
   └─ 也可以允许账号通过 IAM 策略授权，再在角色策略中授予权限
```

仅在角色策略中写 `kms:Decrypt` 不一定足够，需要密钥策略支持相应授权；适用的 Explicit Deny（明确拒绝）仍会阻止操作。加密也不能替代访问权限和网络配置。

## 4. 费用实例：Standard-IA 与 Glacier IR 怎样取舍？

区域：US East (N. Virginia)（美国东部弗吉尼亚北部）。价格核实日期：2026-10-08；本次官方价格表发布日期为 2026-09-28。下列为美元公开单价，之后可能调整。

| 存储类别 | 每 GB／月存储费 | 每 GB 数据取回费 | 每 1,000 次 GET（读取请求） |
|---|---:|---:|---:|
| Standard（标准，前 50 TB 档） | $0.023 | $0 | $0.0004 |
| Standard-IA（标准低频访问） | $0.0125 | $0.01 | $0.001 |
| One Zone-IA（单可用区低频访问） | $0.01 | $0.01 | $0.001 |
| Glacier Instant Retrieval（归档即时取回） | $0.004 | $0.03 | $0.01 |

统一假设：持续保存 1,000 GB，每月 10,000 次 GET；文件均大于 128 KB，保存超过各类别最低计费期限。只计算存储＋取回＋GET，不含上传、转换、网络传输、税费、免费额度等。

| 每月累计读取量 | Standard | Standard-IA | One Zone-IA | Glacier IR |
|---|---:|---:|---:|---:|
| 100 GB | $23.00 | $13.51 | $11.01 | $7.10 |
| 500 GB | $23.00 | $17.51 | $15.01 | $19.10 |
| 1,000 GB | $23.00 | $22.51 | $20.01 | $34.10 |

```text
每月读取 500 GB：
Standard-IA：存储 $12.50＋取回 $5.00＋请求 $0.01＝$17.51
Glacier IR： 存储 $4.00 ＋取回 $15.00＋请求 $0.10＝$19.10
```

- 数据取回费与 GET 请求费是两笔费用；同一个文件反复读取，数据量累计计算。
- 本例两种类别的成本分界点约为每月读取 420 GB，不是所有业务通用的固定阈值。
- One Zone-IA 的低价来自单 AZ 的保护取舍，其取回单价与 Standard-IA 相同。
- 不要只按“每月读取几次”选类别，要一起看读取量、请求数、文件大小、保留时间和恢复要求。

## 学习记录

- 已学习：S3／EBS／EFS／FSx 选型、S3 版本与生命周期、存储类别与费用、复制、加密与 KMS 授权、EBS 快照、EFS 网络和备份。
- 已答随堂题包含：共享文件选 EFS、EBS 不能跨 AZ 连接、版本恢复、存储类别选择、CRR、加密权限、快照恢复与删除、Windows 文件服务、EFS 安全组。
- 尚未进行 Day 06 独立综合测验；本节未进行控制台实操。

## 官方参考

- [S3 概述](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html)
- [S3 存储类别对比](https://docs.aws.amazon.com/AmazonS3/latest/userguide/storage-class-intro.html)
- [S3 生命周期](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html)
- [S3 版本删除规则](https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html)
- [S3 复制](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication.html)
- [复制配置要求](https://docs.aws.amazon.com/AmazonS3/latest/userguide/replication-requirements.html)
- [S3 加密](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html)
- [SSE-KMS 权限](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)
- [KMS 密钥策略](https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html)
- [EBS 快照](https://docs.aws.amazon.com/ebs/latest/userguide/ebs-snapshots.html)
- [EFS 概述](https://docs.aws.amazon.com/efs/latest/ug/whatisefs.html)
- [EFS 挂载目标](https://docs.aws.amazon.com/efs/latest/ug/accessing-fs.html)
- [EFS 网络安全组](https://docs.aws.amazon.com/efs/latest/ug/network-access.html)
- [EFS 备份](https://docs.aws.amazon.com/efs/latest/ug/awsbackup.html)
- [FSx for Windows](https://docs.aws.amazon.com/fsx/latest/WindowsGuide/what-is.html)
- [FSx for Lustre](https://docs.aws.amazon.com/fsx/latest/LustreGuide/what-is.html)
- [FSx for ONTAP 快照](https://docs.aws.amazon.com/fsx/latest/ONTAPGuide/snapshots-ontap.html)
- [S3 备份](https://docs.aws.amazon.com/aws-backup/latest/devguide/s3-backups.html)
- [S3 计费规则](https://aws.amazon.com/s3/pricing/)
- [本次使用的 us-east-1 官方价格表](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonS3/current/us-east-1/index.json)
