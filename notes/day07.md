# Day 07：负载均衡、自动扩缩与无状态应用

学习日期：2026-10-09

本节按学习计划的实际顺序编号为 Day 07，对应 `index.html` 中原主题编号 8「负载均衡和自动扩缩」。

## 1. 知识树

```text
Day 7：让网站分流、扩容，并应对实例故障
│
├─ ① 如何分配流量？——Load Balancing（负载均衡）
│  │
│  ├─ ALB：Application Load Balancer（应用负载均衡器）
│  │  ├─ HTTP / HTTPS 网站与接口
│  │  ├─ Path-based Routing（基于路径的路由）
│  │  │  └─ /shop → 商品目标组；/api → 接口目标组
│  │  ├─ Host-based Routing（基于主机名的路由）
│  │  │  └─ images.example.com / api.example.com → 不同目标组
│  │  └─ 根据应用健康检查结果选择可用后端
│  │
│  ├─ NLB：Network Load Balancer（网络负载均衡器）
│  │  ├─ TCP / UDP 等网络服务；支持每个启用 AZ 的固定入口 IP
│  │  ├─ Listener（监听器）：按配置的协议、端口接收连接
│  │  │  └─ TCP 9000 → 目标组 A；TCP 9001 → 目标组 B
│  │  ├─ Flow Hash（流哈希）：根据连接信息选择组内后端
│  │  │  └─ 都是 TCP，也能把不同连接分配给不同 EC2
│  │  ├─ 同一条 TCP 连接在存续期间固定到同一个后端
│  │  │  └─ 不需要启用粘性；新连接默认可能分到其他后端
│  │  └─ 支持 TCP / HTTP / HTTPS 主动健康检查
│  │     └─ 能检查 /health ≠ 能按 /shop、/api 分流
│  │
│  ├─ GWLB：Gateway Load Balancer（网关负载均衡器）
│  │  └─ 将流量分配给第三方虚拟防火墙等网络安全设备
│  │
│  └─ Target Group（目标组）
│     ├─ 接收流量的一组后端目标，例如 EC2
│     └─ 商品服务、订单服务可以各有自己的目标组和 ASG
│
├─ ② 如何管理 EC2 数量？——Auto Scaling（自动扩缩）
│  │
│  ├─ ASG：Auto Scaling Group（自动扩缩组）
│  │  ├─ Minimum Capacity（最小容量）：缩容下限
│  │  ├─ Desired Capacity（期望容量）：当前希望维持的数量
│  │  └─ Maximum Capacity（最大容量）：扩容上限
│  │     └─ Min=2、Desired=2、Max=6 → 先尝试维持 2 台，不是 6 台
│  │
│  ├─ 故障替换：不健康实例 → 尝试替换，维持 Desired
│  │  └─ 即使没有扩缩策略，也能执行故障替换
│  │
│  ├─ Scaling Policy（扩缩策略）：按实际指标调整容量
│  │  └─ Target Tracking Scaling（目标跟踪扩缩）
│  │     ├─ 例如把平均 CPU 使用率尽量保持在 50%
│  │     ├─ Scale Out（扩容）：增加实例
│  │     └─ Scale In（缩容）：减少实例
│  │
│  └─ Scheduled Scaling（定时扩缩）：按时间调整容量
│     ├─ 例如 20:00 直播 → 提前提高容量，给应用启动留时间
│     ├─ 适合提前知道的负载变化，可与目标跟踪配合
│     └─ 未配置相关策略或计划时，不会仅因 CPU 高就自动扩容
│
├─ ③ 谁检查健康？谁采取行动？
│  │
│  ├─ EC2 Status Checks（EC2 状态检查）
│  │  ├─ 检查实例与底层系统状态；ASG 默认采用 EC2 检查
│  │  └─ 基础状态检查通过，不保证网站程序已正常运行
│  │
│  ├─ ALB Health Checks（ALB 健康检查）
│  │  ├─ 例如请求 /health，检查应用响应是否符合配置
│  │  └─ ALB 据此分配请求，不负责替换 EC2
│  │
│  ├─ ELB Health Checks（负载均衡健康检查，ASG 的可选依据）
│  │  ├─ 在 ASG 中启用后，也采用 ALB / NLB 的检查结果
│  │  ├─ 增加判断依据，原来的 EC2 检查仍保留
│  │  └─ 未启用时：ALB 不健康、EC2 正常 → 不仅凭 ALB 结果替换
│  │
│  └─ Health Check Grace Period（健康检查宽限期）
│     ├─ ASG 的设置：给新实例初始化时间
│     ├─ 避免仅因应用尚未就绪、负载均衡检查失败就过早替换
│     ├─ 应用约需 4 分钟启动 → 按实际启动时间留合理余量
│     ├─ 期满仍不健康、且 ASG 采用相应检查 → 后续判定并替换
│     └─ 不控制 ALB 发流量；初始检查通过即可接收请求
│
├─ ④ ASG 怎么准备新服务器？
│  │
│  ├─ Launch Template（启动模板）：保存创建 EC2 所需配置
│  │  ├─ AMI：Amazon Machine Image（机器映像）
│  │  │  └─ 系统、预装应用与依赖
│  │  ├─ Instance Type（实例类型）：CPU / 内存等规格
│  │  ├─ Security Groups（安全组）：网络访问规则
│  │  └─ User Data（用户数据）：首次启动时执行的准备脚本
│  │
│  ├─ 手工修改旧 EC2，不会自动让新实例继承这些修改
│  └─ Instance Refresh（实例刷新）
│     ├─ 更新模板 → 后续新实例使用新配置
│     ├─ 触发刷新 → 按配置逐步更新已有实例
│     └─ 可人工或由部署流程触发；需考虑健康容量与准备时间
│
├─ ⑤ 如何让任意 EC2 都能处理请求？
│  │
│  ├─ Stateless Application（无状态应用）
│  │  └─ 后续请求不依赖某台 EC2 独有的会话、文件等状态
│  │
│  ├─ Session（会话）：例如用户登录状态
│  │  ├─ 只在 A 内存中 → B 不知道；A 终止后新实例不继承
│  │  └─ 存到共享 ElastiCache / DynamoDB 等外部存储
│  │     └─ 应用必须实际写入、读取共享存储，不是开服务就自动共享
│  │
│  ├─ 上传文件
│  │  ├─ 只在 A 的 EBS → 请求分到 B 时找不到
│  │  ├─ 保持普通共享文件目录访问 → 可选 EFS
│  │  └─ 对象接口访问 → 根据需求使用 S3
│  │
│  └─ Sticky Sessions（粘性会话）
│     ├─ 影响后续请求 / 连接的后端选择，具体机制因负载均衡器而异
│     └─ 不复制会话，不保护故障实例内存中的数据
│
└─ ⑥ 如何组合成跨 AZ 的网站？
   ├─ ALB：分配请求，避开不健康实例（存在故障开放例外）
   ├─ 跨 AZ 的 ASG：维持容量、扩缩容、替换不健康实例
   ├─ ElastiCache 等：共享登录会话
   ├─ EFS Regional：共享文件，数据跨 AZ 冗余保存
   └─ 新实例流程：模板 → 创建 EC2 → 应用准备 → ALB 检查通过 → 接流量
```

## 2. 今天重点纠正的概念

- **扩容 ≠ 故障替换**：Target Tracking 根据负载调整容量；健康检查用于判断实例是否需要替换。
- **ALB 检查 ≠ EC2 检查**：操作系统正常，不保证网站程序正常。ALB 分流；ASG 替换。
- **宽限期 ≠ 放行用户请求**：宽限期限制 ASG 过早替换；ALB 独立进行应用检查。
- **宽限期不是绝对免替换**：如果实例不再处于 `running` 状态，ASG 在宽限期内也会判定不健康并替换。
- **健康检查不是永远阻断不健康目标**：ALB 在目标组只有不健康目标时、NLB 在所有启用 AZ 的目标均不健康等情况下可能 Fail Open（故障开放），仍向不健康目标转发。
- **一条 TCP 连接固定后端 ≠ 已启用粘性会话**：这是 NLB 的连接分配行为；新连接默认可能选择不同后端。
- **固定 IP 不等于一定需要负载均衡**：单实例可考虑 EIP；题目还需有多后端分流、高可用等要求，才能说明负载均衡的必要性。NLB 是每个启用 AZ 有固定 IP，不是整个多 AZ 服务只有一个固定 IP。
- **实例刷新 ≠ 清理内存**：本次学习的是以新配置替换实例；旧实例独有的内存状态不会继承。
- **EFS Regional ≠ 另一个 Region 的备份**：同一区域跨 AZ 冗余；多个挂载目标是同一个文件系统的入口。One Zone 也有冗余，只在同一 AZ 内。
- **安全组 / NACL ≠ 双向 / 单向**：两者都有入站与出站；安全组有状态，已允许连接的回复自动放行；NACL 无状态，去回都要有规则。

## 3. 学习记录

- 已学习：ALB / NLB / GWLB 选型、路径与主机名路由、NLB 连接分配、ASG 容量与扩缩方式、健康检查与宽限期、启动模板与实例刷新、无状态应用、共享会话与文件。
- 存储复习：5 道引导式题均选对；安全组题曾表示不理解，经讲解后能正确解释回复流量。Region / AZ、单 AZ 内冗余与备份的术语已纠正，不记为独立综合测验成绩。
- 已能解释：ALB 分流而 ASG 替换；宽限期不让应用提前接流量；同一 TCP 连接固定后端；实例替换不继承内存；EFS 不自动共享会话。
- 综合题记录：ALB、ElastiCache、宽限期选对；曾将 ELB 检查当作自动扩容依据，解析后表示理解，需用新题再次独立验证。
- 尚未完成：计划中的 10 道独立扩缩容题与完整多 AZ 架构绘图；本节未进行控制台实操。
- 下一节按重排计划为 Day 08「RDS 和 Aurora：关系型数据库」；开始前可先补本节独立综合练习。

## 4. 官方参考

- [ALB 概述：路径、主机名路由与目标组](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html)
- [ALB 健康检查与故障开放](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html)
- [NLB 概述：流哈希、连接分配与固定 IP](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html)
- [NLB 健康检查](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/target-group-health-checks.html)
- [GWLB 概述](https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/introduction.html)
- [ASG 扩缩方式与固定容量维护](https://docs.aws.amazon.com/autoscaling/ec2/userguide/scaling-overview.html)
- [目标跟踪扩缩](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html)
- [定时扩缩](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-scheduled-scaling.html)
- [ASG 健康检查](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-checks-overview.html)
- [ASG 健康检查宽限期](https://docs.aws.amazon.com/autoscaling/ec2/userguide/health-check-grace-period.html)
- [实例刷新](https://docs.aws.amazon.com/autoscaling/ec2/userguide/asg-instance-refresh.html)
- [EFS 文件系统与挂载目标](https://docs.aws.amazon.com/efs/latest/ug/accessing-fs.html)
- [EFS 冗余与可用性](https://aws.amazon.com/efs/faq/)
- [安全组有状态](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html)
- [NACL 无状态](https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html)
