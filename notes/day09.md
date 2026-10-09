# Day 09：Lambda、API Gateway 与工作流

学习日期：2026-10-09

按重排后的计划编号，对应原主题 12。主线：谁接请求、谁执行代码、谁协调流程，以及权限、并发、网络和重复处理的边界。

## 1. 知识树

```text
Day9：无服务器应用
│
├─ ① 谁执行代码？——Lambda（无服务器计算）
│  ├─ Serverless（无服务器）：AWS 管理底层服务器
│  │  └─ 用户仍负责代码、依赖、权限和业务逻辑
│  ├─ Trigger（触发器）：例如 S3 上传事件触发缩图代码
│  ├─ 部署代码＋配置：ZIP 包或容器镜像，以及入口、角色等
│  │  └─ 每次调用不必重新上传代码，也不重新构建 Dockerfile
│  └─ Execution Environment（执行环境）
│     ├─ 可能复用，也可能被回收；代码与配置仍保留
│     └─ 无状态设计：不能依赖上次内存、临时文件保存业务数据
│
├─ ② 谁能调用？运行后能做什么？——权限
│  ├─ Resource-based Policy（基于资源的策略）
│  │  └─ 例如允许指定 S3 桶触发 Lambda
│  └─ Execution Role（执行角色）
│     ├─ Trust Policy（信任策略）：允许 Lambda 服务使用角色
│     └─ Permissions Policy（权限策略）：运行时能做什么
│        ├─ s3:GetObject：读取指定原图对象
│        └─ s3:PutObject：上传到指定缩略图位置
│
├─ ③ 谁接用户请求？——API Gateway（API 网关）
│  ├─ 提供 API 入口，按配置管理路由、身份验证、限流等
│  ├─ 手机 → API Gateway → Lambda → 数据库
│  └─ 不自动保存订单或执行业务代码；不是 IGW / NAT 的替代品
│
├─ ④ 谁协调流程？——Step Functions（工作流服务）
│  ├─ 协调顺序、条件分支、等待、重试与错误处理
│  ├─ Standard Workflow（标准工作流）：可等待审批回调
│  ├─ Lambda 等服务执行具体任务；工作流管理步骤进度
│  └─ 简单、短时间的任务可放在一个 Lambda 中，不必强行拆分
│
├─ ⑤ 超时与重试怎么办？
│  ├─ Timeout（超时）：超过设置时间，终止执行
│  │  ├─ 本节普通 Lambda 单次执行最多 15 分钟
│  │  └─ 不自动回滚已创建的订单或外部扣款
│  └─ Idempotency（幂等性）：重复业务请求不重复产生业务效果
│     ├─ 同一次操作重试：使用相同业务请求编号
│     ├─ 新业务操作：使用新编号
│     ├─ 持久存储处理记录，结合唯一约束等防并发重复
│     └─ 外部付款服务也需支持幂等；不是 Lambda 自动实现
│
├─ ⑥ 如何控制 Concurrency（并发）？
│  ├─ 同时正在执行的任务数，不是一天请求总数
│  ├─ Reserved Concurrency（预留并发）
│  │  ├─ 类比：留 10 个 HC（人员名额），不代表人员已到岗
│  │  ├─ 专属并发额度＋并发上限；可保护下游数据库
│  │  └─ 设置本身无额外收费；实际执行仍收费
│  └─ Provisioned Concurrency（预置并发）
│     ├─ 类比：提前让收银员到岗，电脑和软件准备好
│     ├─ 减少 Cold Start（冷启动）的准备等待
│     ├─ 提前准备环境需要额外费用，业务执行仍需要时间
│     └─ 不是并发上限，可在允许额度内按需使用其他环境
│
├─ ⑦ 怎样访问网络资源？
│  ├─ 私有 RDS：配置 VPC、子网、安全组，建立网络连接
│  │  └─ 网络规则＋数据库认证；同 VPC 通信不需要 NAT
│  ├─ Public Subnet（公有子网）：有直接通往 IGW 的路由
│  │  └─ 公有子网不等于资源自动获得公网 IP
│  └─ 连接 VPC 的 Lambda 访问 IPv4 互联网
│     ├─ 配置公有子网不会自动获得公网 IPv4 地址
│     └─ 常见路径：私有子网网络接口 → NAT Gateway → IGW → 外网
│
└─ ⑧ 调用方式有什么区别？
   ├─ Synchronous Invocation（同步调用）
   │  ├─ 调用方等待函数结果，例如 API Gateway 查询订单
   │  └─ Lambda 不自动重试函数错误；调用方或服务按自身规则处理
   └─ Asynchronous Invocation（异步调用）
      ├─ 先接收事件，后处理，例如 S3 上传触发生成缩略图
      ├─ 接收成功不代表任务完成
      ├─ Lambda 管理队列，按配置和错误类型重试
      └─ 可能重复投递，代码仍需考虑幂等性
```

## 2. 最容易混淆的边界

| 概念 | 正确理解 |
| --- | --- |
| 无状态 | 不依赖上次运行的业务状态，不是删除已部署代码 |
| 部署 vs 调用 | 先准备代码与配置；调用时使用它们执行任务 |
| 触发权限 vs 执行权限 | 谁能叫函数干活，与函数能访问哪些资源是两件事 |
| 超时 vs 回滚 | 执行终止，不代表之前的数据库写入、扣款被撤销 |
| API Gateway vs NAT Gateway | 前者管理 API 请求；后者提供相应出网路径 |
| 公有子网 vs 公有 IP | 前者描述路由，后者是公网可寻址地址 |
| 接收成功 vs 处理成功 | 异步接收后，任务可能仍未执行或执行失败 |

**食谱与厨房的类比**：AWS 保存的代码、配置像食谱；执行环境像厨房。厨房可以更换，食谱仍在。最终订单、图片应存到数据库或 S3 等外部存储。

**EC2 RI（预留实例）复习**：承诺 1 年或 3 年换匹配使用量的计费折扣，不自动创建、启动实例；Regional RI（区域级）不预留容量，Zonal RI（可用区级）预留指定 AZ 的匹配容量。它与 Lambda 预留并发是不同产品和目的。

## 3. 并发数字例子

```text
Reserved Concurrency = 10：最多同时执行 10 个任务
Provisioned Concurrency = 4：提前准备 4 个执行环境
│
├─ 前 4 个并发任务：使用已准备好的环境
├─ 第 5～10 个：可以按需使用其他环境，可能遇到冷启动
└─ 已有 10 个正在执行：新调用可能受限，处理取决于调用方式
```

以上假设调用指向配置预置并发的版本或别名，且无其他限制。预置并发不能超过已设置的预留并发，不保证零延迟。

## 4. 两个完整例子

```text
查订单（同步）
手机 → API Gateway → Lambda → 私有 RDS
手机 ← API Gateway ← Lambda ← 查询结果

生成缩略图（异步）
S3 原图上传 → 事件 → Lambda 读取、缩图 → S3 保存结果
```

缩图事件重复时，可根据原图标识生成固定目标，并妥善处理重复操作。原图更新是新任务，可以把 Version ID（版本编号）纳入标识；还要防止旧事件覆盖新版本结果。

API Gateway 能调用函数，不代表函数能访问互联网。私有数据库查询走内部路径；外部支付请求需要独立配置出网路径。

## 5. 学习记录

- 已完成：上面知识树中的核心讲解与引导题；重点澄清代码保留、执行环境回收、公有子网、两种并发控制，以及工作流与普通函数代码的取舍。
- 综合选择题：10 道新场景题首次提交全部正确，**10/10**。
- 答案：A、B、C、B、C、A、B、C、B、C。
- 覆盖：S3 事件、执行角色、持久状态、API 入口、审批工作流、幂等付款、并发上限、预置环境溢出、VPC 出网、异步重复事件。
- 成绩表示本轮选择正确；未逐题要求独立解释全部理由，不等于已验证所有实际配置能力。
- 待补充：原计划提到的 Cognito（用户身份服务）、SQS（简单队列服务）任务接收，以及 Lambda 测试事件与日志实验；本节尚未讲解或完成。
- 本节未进行 AWS 控制台实操或创建资源。
- 下一节按重排计划为 Day10「DynamoDB 与缓存」。

## 6. 官方参考

- [Lambda 概述与执行环境](https://docs.aws.amazon.com/lambda/latest/dg/welcome.html)
- [代码部署包与配置](https://docs.aws.amazon.com/lambda/latest/dg/configuration-function-zip.html)
- [S3 触发与两类权限](https://docs.aws.amazon.com/lambda/latest/dg/with-s3.html)
- [API Gateway 概述](https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html)
- [Step Functions：流程、等待、重试](https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html)
- [Lambda 超时设置](https://docs.aws.amazon.com/lambda/latest/dg/configuration-timeout.html)
- [Lambda 最佳实践与幂等性](https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html)
- [预留并发](https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html)
- [预置并发](https://docs.aws.amazon.com/lambda/latest/dg/provisioned-concurrency.html)
- [Lambda 连接 VPC](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html)
- [VPC 连接后的互联网访问](https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html)
- [同步调用](https://docs.aws.amazon.com/lambda/latest/dg/invocation-sync.html)
- [异步错误与重试](https://docs.aws.amazon.com/lambda/latest/dg/invocation-async-error-handling.html)
- [EC2 RI 概述](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-reserved-instances.html)
- [Regional / Zonal RI](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/reserved-instances-scope.html)
