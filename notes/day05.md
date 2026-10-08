# Day 05：网络访问控制与网络连接

学习日期：2026-10-03

## 1. 按问题分类的树状图

```text
AWS 网络知识
│
├─ ① 数据往哪里走？
│  └─ Route Table（路由表）
│     └─ 根据目标地址，选择下一站；请求与回复都需要路由
│
├─ ② 哪些网络流量可以通过？
│  ├─ Security Group（安全组）
│  │  ├─ 控制关联资源的网络接口流量
│  │  ├─ 只有 Allow（允许）规则
│  │  └─ Stateful（有状态）：已允许连接的回复自动放行
│  │
│  └─ NACL（网络访问控制列表）
│     ├─ 控制跨越 Subnet（子网）边界的流量
│     ├─ 可设置 Allow（允许）与 Deny（拒绝）
│     ├─ 编号从小到大，第一条匹配规则决定结果
│     └─ Stateless（无状态）：请求和回复分别检查
│
├─ ③ VPC 如何访问互联网？
│  ├─ IGW：Internet Gateway（互联网网关）
│  │  └─ 挂接到 VPC，连接 VPC 与互联网
│  │
│  └─ Public NAT Gateway（公有 NAT 网关）
│     └─ 私有 EC2 主动出网：EC2 → NAT → IGW → 互联网
│
├─ ④ 如何私下访问指定 AWS 服务？
│  └─ VPC Endpoint（VPC 端点）：访问指定服务的入口
│     ├─ Gateway Endpoint（网关端点）
│     │  ├─ 支持 S3（对象存储）、DynamoDB（键值与文档数据库）
│     │  ├─ 通过关联路由表加入服务路由
│     │  └─ 端点本身没有小时费和数据处理费
│     │
│     └─ Interface Endpoint（接口端点）
│        ├─ 支持许多服务，例如 Secrets Manager（密钥管理服务）
│        ├─ 在选定子网创建 ENI（弹性网络接口），分配私有 IP
│        ├─ 网络接口关联安全组，HTTPS 通常需要允许 TCP 443
│        ├─ 使用 AWS PrivateLink（私有连接技术）
│        └─ 通常有小时费和数据处理费
│
├─ ⑤ 如何连接不同 VPC？
│  ├─ VPC Peering（VPC 对等连接）
│  │  ├─ 两个 VPC 直接连接，通过私有 IP 通信
│  │  ├─ 两边的 CIDR（地址范围）不能重叠
│  │  ├─ 双方配置路由和安全规则
│  │  └─ 不支持中转：A—B、B—C，不代表 A 能借 B 到 C
│  │
│  └─ TGW：Transit Gateway（中转网关）
│     ├─ 多个网络接入统一的中转中心
│     ├─ 根据路由表转发流量，也可通过路由配置隔离网络
│     └─ 可接入多个 VPC 和公司网络连接
│
└─ ⑥ 如何连接公司机房与 AWS？
   ├─ Site-to-Site VPN（站点到站点 VPN）
   │  ├─ 常见方式：在互联网中建立加密隧道
   │  ├─ 使用 IPsec（互联网协议安全）加密
   │  └─ 适合快速接入，也可作为备用连接
   │
   └─ Direct Connect，DX（专线连接）
      ├─ 通过专用链路接入 AWS，需要准备实际连接
      ├─ 适合长期连接，重视带宽和网络表现的场景
      └─ 默认不加密；需要时另配 VPN 等适用加密方案
```

## 2. 易混词：概念与产品名分开记

- **Endpoint（端点）**：服务接受访问的入口。数据库的 `10.0.2.20:3306` 是一个连接入口；端点不一定是一台独立设备。
- **Gateway（网关）**：连接网络、转发或转换流量的通道节点。要看完整产品名，不能仅凭这个词判断用途。
- **VPC Endpoint（VPC 端点）**：AWS 提供的指定服务访问入口；不是把服务本身搬进 VPC。
- **S3 Bucket（S3 存储桶）**是组织对象的容器，不是子网里的 EC2，不能给它分配一个 EC2 私有 IP。
- Interface Endpoint 的私有 IP 属于端点网络接口，不属于 S3 存储桶或服务本身。
- S3 也支持 Interface Endpoint；Secrets Manager 不支持 Gateway Endpoint。
- 网络连通与权限是两回事：端点、安全组、路由正确后，仍需相应 IAM（身份与访问管理）权限。

## 3. 用鞋店理解网络路径

```text
EC2 查询同 VPC 的数据库：
EC2 → 私有 IP → DB（数据库）
└─ 不经过 NAT 或 IGW；跨子网时使用 local（内部路由）

私有 EC2 下载互联网更新：
EC2 → 公有 NAT → IGW → 互联网

私有 EC2 访问同区域 S3：
EC2 → S3 Gateway Endpoint → S3
└─ 不需要 NAT 或 IGW，S3 仍在你的 VPC 外

私有 EC2 读取数据库密码：
EC2 → Secrets Manager Interface Endpoint → Secrets Manager

EC2 与数据库位于不同 VPC：
VPC A 的 EC2 → VPC Peering / TGW → VPC B 的 DB
└─ 去路、回路、安全规则与数据库认证都必须满足
```

- 同子网的 EC2 与数据库仍需安全组和数据库认证；NACL 不检查同子网内部流量。
- 上述 NAT 路径以公有 NAT 为例；Day 04 的部署图使用公有子网中的可用区级 NAT。
- 少量 VPC 直接互连可考虑 Peering；多个网络集中连接和管理路由可考虑 TGW。接入 TGW 不代表所有网络自动互通。

## 4. 两个常考细节

**NACL 检查回复的目标端口，不要把请求端口与回复端口混为一谈。**

```text
EC2:55012 → 外部网站:443
EC2:55012 ← 外部网站:443
```

EC2 发起请求后，回复目标是它的临时端口 `55012`。NACL 只允许入站目标端口 `443`，无法放行这个回复；实际规则应按客户端临时端口范围配置。

- NACL：100 允许某流量、200 拒绝相同流量 → 先匹配 100，允许。
- IAM：适用的 Explicit Deny（明确拒绝）优先。不要把 IAM 的规则套到 NACL。

**端点并非一律更便宜，按产品与用量判断。**

- NAT 收运行小时费和流量处理费；S3 网关端点可让 S3 流量绕过 NAT，避免这部分 NAT 处理费。
- NAT 若仍为其他访问保留，小时费仍然存在；S3 自身的存储和请求等费用也照常计算。
- Interface Endpoint 通常收费，是否比 NAT 便宜取决于服务数量、可用区数量和流量。
- VPC Endpoint 的用途还包括指定服务的私有访问，减少对 NAT 和 IGW 的依赖。

## 学习记录

- Day 05 核心理论和随堂练习已完成；独立六道场景题 **6/6**。
- 答案：**B、C、A、B、C、A**。
- 测验覆盖：NACL 返回端口、S3 端点节省 NAT 处理费、Secrets Manager 接口端点、Peering 不支持中转、TGW 集中管理、DX 默认不加密。
- 本轮未进行控制台实操；Day 06 存储专题尚未开始。
- 场景题方法：先找能实现需求的方案，再按时间、安全、成本等约束选择。

## 官方参考

- [NACL 规则与有状态／无状态区别](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html)
- [Gateway Endpoint](https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html)
- [Interface Endpoint](https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html)
- [Secrets Manager 私有访问](https://docs.aws.amazon.com/secretsmanager/latest/userguide/vpc-endpoint-overview.html)
- [VPC Peering 的限制](https://docs.aws.amazon.com/vpc/latest/peering/vpc-peering-basics.html)
- [Transit Gateway](https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html)
- [Site-to-Site VPN](https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html)
- [Direct Connect 加密](https://docs.aws.amazon.com/directconnect/latest/UserGuide/encryption-in-transit.html)
- [NAT 与网关端点费用](https://aws.amazon.com/vpc/pricing/)
- [Interface Endpoint 费用](https://aws.amazon.com/privatelink/pricing/)
