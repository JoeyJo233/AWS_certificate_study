# Day 13：Route 53、CloudFront 与监控

学习日期：2026-10-10。对应重排计划的 Day 13、原主题 13。例子使用 FamilyMart（全家便利店）。

主线：找到入口 → 加快访问 → 应对故障 → 观察运行与追查操作。

## 1. 知识树

```text
Day 13：找到网站、访问更快、发现问题
│
├─ ① Route 53（DNS 服务）：根据域名找到入口
│  ├─ 支持域名注册、DNS 解析、健康检查
│  ├─ DNS 查询得到地址后，浏览器向入口发网页请求
│  │  └─ 网页请求不由 Route 53 逐个转发
│  ├─ DNS Record（DNS 记录）
│  │  ├─ A：域名 → IPv4 地址
│  │  ├─ AAAA：域名 → IPv6 地址
│  │  ├─ CNAME：域名 → 另一个域名，不能直接用于域名根节点
│  │  └─ Alias：可指向 ALB 等受支持资源，可用于域名根节点
│  └─ Routing Policy（路由策略）
│     ├─ Weighted（加权）：按相对权重选择 DNS 回答，适合逐步发布新版
│     ├─ Failover（故障转移）：主入口不健康时选择备用入口
│     ├─ Latency-based（基于延迟）：参考 AWS 延迟数据选择区域
│     └─ Geolocation（地理位置）：按查询来源位置与规则选择，配置默认记录兜底
│
├─ ② CloudFront（内容分发网络，CDN）：靠近用户分发内容
│  ├─ Origin（源站）：原始内容来源，如 S3 或 ALB
│  ├─ Edge Location（边缘站点）：接收用户请求、缓存内容
│  ├─ Cache Hit（缓存命中）：直接返回缓存内容
│  ├─ Cache Miss（缓存未命中）：获取源站内容，按策略缓存
│  ├─ 更新内容
│  │  ├─ TTL（缓存有效期）：源站更新不等于缓存立刻更新
│  │  ├─ Invalidation（缓存失效）：使旧路径缓存失效
│  │  └─ Versioned Filename（版本文件名）：改用新路径，避免命中旧路径
│  └─ OAC（源站访问控制）+ S3 Bucket Policy（存储桶策略）
│     ├─ CloudFront 签名请求，策略允许指定分配读取私有 S3
│     └─ 管 CloudFront → S3，不负责判断顾客是否付费
│
├─ ③ Global Accelerator，GA（全球加速器）
│  ├─ 固定入口 IP，经 AWS 全球网络优化访问路径，不缓存内容
│  ├─ 支持 TCP / UDP；标准加速器后端可用 ALB、NLB、EC2 等
│  └─ 标准加速器支持故障转移
│     ├─ 根据健康状态，将新连接送往可用端点
│     ├─ 入口 IP 不变，后端切换不依赖更新 DNS 地址
│     └─ 不无缝迁移旧连接，不自动复制应用数据
│
└─ ④ 监控、审计、配置
   ├─ CloudWatch（监控）：运行得怎样？指标、日志、告警
   │  ├─ Metric（指标）：CPU、延迟、错误率等数值
   │  ├─ Log（日志）：具体报错与运行记录
   │  └─ Alarm（告警）：按评估条件通知或触发配置好的动作
   ├─ CloudTrail（操作审计）：谁、何时、调用了什么 API？
   └─ AWS Config（配置记录与评估）：配置前后是什么？是否符合规则？
```

## 2. 容易混淆的区别

### DNS 与负载均衡

- Route 53：帮助用户找到入口，如东京 ALB 或新加坡 ALB。
- ALB（应用负载均衡器）：接收请求，分配给健康的后端服务器；不保证各实例 CPU 完全相同。
- ASG（自动扩缩组）：按配置增减实例，并替换不健康实例。
- 类比：Route 53 找门店，ALB 安排收银台，ASG 决定开几个收银台。
- ALB 的地址可能变化：域名指向 ALB 优先用 Alias，不要固定写入查到的某个 IP。
- Zone Apex（域名根节点）如 `example.com`，不能直接配置 CNAME，可使用 Route 53 Alias。

### 两种故障转移

| 对比 | Route 53 Failover | GA 标准加速器 |
| --- | --- | --- |
| 切换机制 | 改变后续 DNS 回答 | 改变固定 IP 后面的新连接去向 |
| DNS 缓存 | 旧地址可能暂时保留 | 后端切换不依赖 DNS 地址改变 |
| 原有连接 | 不会自动搬到备用站 | 不会无缝迁移；可能需要客户端重连 |
| 应用与数据 | 备用区域需要预先准备 | 备用区域需要预先准备 |

- 单台 EC2 故障：ALB 避开它，ASG 按健康检查配置替换它。
- 区域入口不可用：可用 Route 53 或 GA 做跨入口故障转移。
- 看到“固定 IP、跨区域故障转移、避免 DNS 缓存拖慢切换”，想到 GA 标准加速器。
- 这里的健康检查故障转移针对标准加速器；Custom Routing（自定义路由）不是同一机制。

### 路由与缓存

- Weighted 的比例是 DNS 回答选择比例，不保证网页请求严格按 90% / 10% 分配。
- Latency-based 参考 AWS 的延迟数据，不是每次请求临时测速；地理更近不一定网络更快。
- CloudFront 能加速 HTTP / HTTPS 的静态与动态请求，不是只能服务图片。
- GA 优化 TCP / UDP 网络路径，不保存图片或数据库查询结果。
- Redis / DAX 缓存靠近后台，减少数据库读取；CloudFront 缓存靠近用户，分发网页内容。
- `poster.jpg` 换成 `poster-v2.jpg`，请求路径变化，不命中旧路径缓存；网页也需引用新路径。
- Versioned Filename 不等于 S3 Versioning（版本控制）；后者不会自动更新 CloudFront 缓存。
- 会员订单等个人内容，不能随意用同一缓存项返回给所有用户；需正确设置缓存与访问控制。
- OAC 适用于普通 S3 桶源站；S3 Website Endpoint（网站端点）不能使用同样的 OAC 方案。

### 监控三件套

| 要回答的问题 | 优先服务 |
| --- | --- |
| 请求为什么慢？错误率和应用报错是什么？ | CloudWatch |
| 谁在昨晚调用了停止 EC2 或修改安全组的 API？ | CloudTrail |
| 安全组修改前后开放哪些端口？是否违反配置规则？ | AWS Config |

- 不要看到题干出现“修改”就选 CloudTrail，先看当前要查什么。
- Config 评估不合规不等于默认自动修复，修复动作需要另行配置。
- CloudWatch 创建告警不等于自动扩容，需要配置扩缩容策略与动作。
- CloudTrail 的事件记录范围取决于事件类型和记录配置，不能理解成默认记录一切应用行为。

## 3. 全家完整访问流程

```text
浏览器先查询域名 → Route 53 提供入口地址

浏览器访问入口 → CloudFront
                   ├─ 图片缓存命中 → 直接返回
                   ├─ 图片未命中 → OAC 签名访问私有 S3 → 获取图片
                   └─ 配置好的动态请求路径 → ALB → EC2 → 数据库

另一种入口方案：用户 → GA 固定 IP → 健康区域的 ALB / NLB → 后端

运行异常：CloudWatch Alarm → SNS → 邮件通知
需要扩容：监控指标与配置好的扩缩容策略 → ASG
需要调查：CloudTrail 查操作；Config 查配置历史与合规
```

GA 与 CloudFront 不要求同时使用，需根据协议、缓存、固定 IP 等需求选择。

## 4. 学习记录与待验证

- 已讲解：DNS 记录与四种路由策略、CloudFront 缓存与更新、私有 S3 与 OAC、GA 加速与故障转移、监控三件套和告警通知。
- 已正确回答多道引导题，包括根域名 Alias、延迟路由、版本文件名、OAC、UDP + GA、GA 固定 IP 故障转移。
- 需要加强：CloudTrail 与 Config 曾混淆；运行指标与日志应查 CloudWatch。相关内容已纠正，仍需新题独立验证。
- 输入框的自动回答建议曾泄露答案；这些题不计入独立测验。CloudWatch 题在讲解后改选 C，记为复习确认。
- 后续正式测验使用交互选择窗口；选项不附带功能提示，提交后再解释。
- 待完成：计划中的 10 道独立新题、综合 DNS 与加速架构方案及一条具体告警设计。
- 本节未创建 AWS 资源或进行控制台实操；写笔记不自动改变网页打卡状态。
- Day 11 的回顾暂时暂停；Day 12 消息服务已在此前笔记记录，今天未重新完成独立测验。

## 5. 官方参考

- [Route 53 概述](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html)
- [加权路由](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy-weighted.html)
- [故障转移路由](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy-failover.html)
- [延迟路由](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy-latency.html)
- [地理位置路由](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy-geo.html)
- [CloudFront 内容分发](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowCloudFrontWorks.html)
- [OAC 与私有 S3](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html)
- [GA 工作原理与故障转移](https://docs.aws.amazon.com/global-accelerator/latest/dg/introduction-how-it-works.html)
- [CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html)
- [CloudTrail](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html)
- [AWS Config](https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html)
