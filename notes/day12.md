# Day 12：SQS、SNS、EventBridge，让应用松耦合

学习日期：2026-10-10

本节按学习计划的实际顺序编号为 Day 12，对应 `index.html` 中原主题编号 11「SQS、SNS、EventBridge：让应用松耦合」。Day 11（第一周回顾与补课）暂时跳过。

## 1. 知识树

```text
Day 12：让组件之间不用互相等待，各自独立扩展
│
├─ ① 为什么要解耦？
│  ├─ 同步调用：库存 / 支付 / 邮件任何一个慢或宕机 → 整个下单卡住，可能做到一半
│  └─ 加一层中间服务 → 接收和处理分开，各自按自己的速度工作
│
├─ ② SQS：Simple Queue Service（简单队列服务）
│  │
│  ├─ 定位：队列，消费者主动拉取（Pull）
│  │  ├─ 削峰、缓冲、异步处理
│  │  ├─ 消息保存直到被处理并删除：默认 4 天，最长 14 天
│  │  └─ 队列容量没有上限，积压变多靠增加消费者，不是“加长队列”
│  │
│  ├─ Standard Queue（标准队列）
│  │  ├─ 吞吐几乎不限
│  │  ├─ 至少投递一次 → 可能重复
│  │  └─ 顺序尽力保持，不保证
│  │
│  ├─ FIFO Queue（先进先出队列）
│  │  ├─ 严格顺序（同一消息组内）
│  │  ├─ 去重（5 分钟窗口内，靠去重 ID）
│  │  ├─ 吞吐有上限（高吞吐模式更高）
│  │  └─ Message Group ID（消息组 ID）
│  │     ├─ 发送消息时带的标签：相同 ID = 同一组
│  │     ├─ 只保证同一组内的顺序
│  │     ├─ 同一组同一时间只交给一个消费者
│  │     ├─ 不同组之间可以并行
│  │     ├─ 账户 ID 作组 ID → 同账户有序，不同账户并行 ✔
│  │     └─ 所有消息同一个组 ID → 全部排成一队，并行度为 1 ✘
│  │
│  ├─ Visibility Timeout（可见性超时）
│  │  ├─ 消息被取走后，一段时间内对其他消费者不可见；默认 30 秒，最长 12 小时
│  │  ├─ 处理完要主动删除；超时没删 → 消息重新可见 → 被重复处理
│  │  ├─ 设置要大于处理时间
│  │  └─ 处理时间不确定 → 处理中途延长可见性超时
│  │
│  ├─ Dead-Letter Queue（死信队列，DLQ）
│  │  ├─ 反复处理失败的消息，超过最大接收次数后转入
│  │  └─ 单独排查，不拖住正常消息
│  │
│  └─ 幂等（Idempotent）
│     ├─ 同一条消息处理两次，结果与处理一次相同
│     └─ 是处理逻辑的属性；重复投递不会“破坏”幂等，只会暴露非幂等的逻辑
│
├─ ③ SNS：Simple Notification Service（简单通知服务）
│  │
│  ├─ 定位：发布订阅（Pub/Sub），推送（Push）
│  │  ├─ 发布者发到主题（Topic），所有订阅者各收到一份
│  │  ├─ 订阅者：SQS、Lambda、HTTP/HTTPS、邮件、短信、移动推送等
│  │  └─ 不长期保存消息 → 下游宕机时没有缓冲
│  │
│  ├─ Fan-out（扇出）：SNS 主题 + 多个 SQS 队列
│  │  ├─ 发布者发一次，SNS 自动往每个订阅的队列各推一份
│  │  ├─ 订阅关系在 SNS 一侧，发布者不知道有哪些下游
│  │  ├─ 新增下游：新队列订阅主题即可，发布者代码不用改
│  │  └─ 每个下游一个队列 → 各自缓冲，某个宕机不影响其他
│  │
│  ├─ Message Filtering（消息过滤）：订阅时按属性只接收符合条件的消息
│  └─ SNS FIFO 主题：配合 FIFO 队列保持顺序
│
├─ ④ EventBridge：事件总线与路由
│  │
│  ├─ 定位：按事件内容匹配规则，再路由到目标
│  │  ├─ Event Bus（事件总线）：接收事件的入口
│  │  ├─ Rule（规则）：按来源、类型、字段值匹配
│  │  └─ Target（目标）：Lambda、SQS、SNS、Step Functions 等
│  │
│  ├─ 事件来源
│  │  ├─ AWS 服务事件：自动进入默认总线（如 EC2 状态变化、S3 事件）
│  │  ├─ 自己的应用事件
│  │  └─ 第三方 SaaS 事件
│  │
│  ├─ 定时任务：按时间计划触发，如每天凌晨 2 点运行 Lambda
│  ├─ 其他能力：事件归档与回放
│  └─ 没有队列式缓冲；有重试（默认最长 24 小时）和死信队列兜底，不保证顺序
│
├─ ⑤ 三者怎么选？
│  │
│  ├─ 任务排队、削峰、异步处理、不能丢 → SQS
│  ├─ 严格顺序、不允许重复 → SQS FIFO（按需要的顺序范围设置消息组 ID）
│  ├─ 一条消息通知多个系统 → SNS，后面接 SQS 做缓冲（fan-out）
│  ├─ 按事件内容路由、响应 AWS 服务事件、定时任务 → EventBridge
│  │  └─ 路由规则复杂、事件类型和下游很多、需要归档回放，更倾向 EventBridge
│  └─ 吞吐高、纯一变多分发、下游要独立缓冲 → SNS + SQS
│     └─ 选择依据不是“消息量小就用 EventBridge”
│
└─ ⑥ SQS 消费者的典型架构
   ├─ 生产者 → SQS 队列 → 消费者（EC2 Auto Scaling 组 / Lambda）
   ├─ 扩容依据：CloudWatch 的队列积压指标
   │  └─ ApproximateNumberOfMessagesVisible；更精细：每个实例平均积压消息数
   ├─ EC2 消费者：Auto Scaling 目标跟踪扩缩（与 Day 07 同一机制，指标不同）
   ├─ Lambda 消费者：按积压自动扩展并发；单次执行最长 15 分钟；“最少运维”优先考虑
   ├─ 消费者保持无状态：实例随时可能被缩容终止
   └─ FIFO 的并行度取决于消息组数量
```

## 2. 今天重点纠正的概念

- **队列要“加长”？** SQS 队列容量无上限；积压变多，要增加的是消费者数量。
- **重复投递 ≠ 破坏幂等**：幂等是处理逻辑的属性；逻辑不幂等，重复投递才造成重复扣款、重复发货等后果。
- **可见性超时过短 → 重复处理**：不是 FIFO 或死信队列能解决的问题；应设为大于处理时间。
- **死信队列 ≠ 超时重复的解决办法**：它处理的是反复失败的消息。
- **SNS 本身不缓冲**：“SNS + SQS”中，一变多靠 SNS，缓冲靠 SQS。
- **EventBridge 不是“会丢东西”**：有重试和死信队列，但没有队列式缓冲，也不保证顺序。
- **EventBridge 与 SNS 的取舍不看消息量**：消息量大、吞吐高时，SNS + SQS 反而更合适；EventBridge 看的是内容路由、事件来源、定时和归档回放。
- **FIFO 的顺序只在同一消息组内保证**：所有消息用同一个组 ID，整个队列退化为串行处理。
- **S3 上传触发处理有两条路**：S3 事件通知直接发给 Lambda / SQS / SNS，或交给 EventBridge 再路由；需要内容过滤、多目标时倾向 EventBridge。

## 3. 学习记录

- 已学习：SQS（标准 / FIFO、消息组 ID、可见性超时、死信队列、幂等）、SNS（发布订阅、fan-out、消息过滤）、EventBridge（事件总线、规则、目标、定时任务）、三者选型、SQS 消费者与 Auto Scaling 的衔接。
- 引导问答：
  - 同步调用的问题：能指出“卡住、丢记录”。
  - 队列的作用：曾认为消费者慢时“还是会变慢”，纠正为网站接收订单不受影响，只是处理延迟、积压变多。
  - 可见性超时：能解释 30 秒后重复处理，并给出正确调整方向。
  - 标准队列与 FIFO：营销邮件选标准、银行记账选 FIFO，理由正确。
  - Fan-out：开始不理解，经流程图讲解后能说明“防止下游宕机导致丢失”，并选对 SNS + SQS。
  - EventBridge 与 SNS + SQS 的取舍：曾凭消息量猜测，已纠正。
  - 场景题：曾说“增加队列长度”，纠正为增加消费者并用积压指标扩容；复盘后能说出 EC2 消费者 + Auto Scaling 的典型做法。
- 5 题快速检测（选择题）：5 题全部选对，但均未写出理由，且第 4 题提交答案时仍不了解“消息组 ID”，经讲解后才理解，不记为独立掌握。
- 已能解释：队列负责存、消费者负责做、Auto Scaling 决定几个消费者；fan-out 为何要加队列；可见性超时与重复处理的关系；EventBridge 适合 AWS 服务事件和定时任务。
- 待再次独立验证：消息组 ID 的选择，用新题再验证一次，并写出理由。
- 尚未完成：计划中的 10 道消息题（今天完成了 5 题）、完整的“下单 → 队列 → 处理订单”绘图；本节未进行控制台实操。
- Day 11（第一周回顾与补课）暂时跳过，之后可补。

## 4. 官方参考

- [Amazon SQS 开发者指南](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html)
- [SQS 可见性超时](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-visibility-timeout.html)
- [SQS 死信队列](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html)
- [SQS FIFO 队列与消息组 ID](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html)
- [Amazon SNS 开发者指南](https://docs.aws.amazon.com/sns/latest/dg/welcome.html)
- [SNS 常见场景：fan-out](https://docs.aws.amazon.com/sns/latest/dg/sns-common-scenarios.html)
- [Amazon EventBridge 用户指南](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html)
