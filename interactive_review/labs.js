/* Teaching simulations: these states do not create or modify AWS resources. */
window.REVIEW_LABS = [
  {
    id: "nat-failure",
    title: "NAT 故障：另一扇门会自动接班吗？",
    question: "后台服务器正在下载更新。NAT A 坏了，NAT B 还好好的，接下来会怎样？",
    baseline: "本例使用公共型 Zonal NAT Gateway（可用区级 NAT 网关）。EC2 A 在私有子网，默认路由指向 NAT A；NAT B 位于另一个 AZ（可用区），两边的出网配置原本均正常。",
    diagram: {
      nodes: [
        { id: "ec2-a", title: "EC2 A", subtitle: "后台服务器", type: "compute", zone: "AZ A", col: 0, row: 0, service: "ec2" },
        { id: "nat-a", title: "NAT A", subtitle: "原出网网关", type: "network", zone: "AZ A", col: 1, row: 0, service: "nat" },
        { id: "nat-b", title: "NAT B", subtitle: "另一可用区网关", type: "network", zone: "AZ B", col: 1, row: 2, service: "nat" },
        { id: "igw", title: "IGW", subtitle: "互联网网关", type: "network", zone: "VPC", col: 2, row: 0, service: "igw" },
        { id: "internet", title: "Internet", subtitle: "更新下载站点", type: "entry", zone: "Internet", col: 2, row: 2 }
      ],
      edges: [
        { from: "ec2-a", to: "nat-a", label: "原默认路由" },
        { from: "ec2-a", to: "nat-b", label: "修改路由后", kind: "alternative" },
        { from: "nat-a", to: "igw" },
        { from: "nat-b", to: "igw" },
        { from: "igw", to: "internet" }
      ]
    },
    states: [
      {
        id: "healthy", label: "一切正常", resultTitle: "按原路由下载成功",
        resultBody: "EC2 A → NAT A → IGW（互联网网关）→ 更新站点。路由负责选下一站，NAT 负责地址转换。",
        activeNodes: ["ec2-a", "nat-a", "igw", "internet"], failedNodes: [],
        highlightEdges: ["ec2-a>nat-a", "nat-a>igw", "igw>internet"], status: "ok"
      },
      {
        id: "nat-a-down", label: "只有 NAT A 故障", resultTitle: "服务器活着，原出网路径却断了",
        resultBody: "默认路由仍然写着“去 NAT A”，AWS 不会因为 NAT B 存在，就自动把这条路由改为 NAT B。下载失败；同 VPC（虚拟私有云）内的数据库通信仍可走内部路由。",
        activeNodes: ["ec2-a", "nat-b", "igw", "internet"], failedNodes: ["nat-a"],
        highlightEdges: ["ec2-a>nat-a"], status: "danger"
      },
      {
        id: "nat-b-idle", label: "NAT B 已经建好了", resultTitle: "只增加网关，流量仍不会自己换路",
        resultBody: "设备存在和路由指向是两件事。即使 NAT B 完全正常，只要 EC2 A 所在子网的默认路由仍指向 NAT A，这批出网流量就仍然受影响。",
        activeNodes: ["ec2-a", "nat-b", "igw", "internet"], failedNodes: ["nat-a"],
        highlightEdges: ["ec2-a>nat-a"], status: "warning"
      },
      {
        id: "reroute", label: "把路由改到 NAT B", resultTitle: "EC2 A 可以借 NAT B 重新出网",
        resultBody: "假设 EC2 A 和相关网络仍正常，并已确认 NAT B 的公网路径可用，把默认路由改到 NAT B 后，新连接可以从 AZ B 出网。跨 AZ 路径可能增加费用；原有连接可能需要重建。",
        activeNodes: ["ec2-a", "nat-b", "igw", "internet"], failedNodes: ["nat-a"],
        highlightEdges: ["ec2-a>nat-b", "nat-b>igw", "igw>internet"], status: "ok"
      },
      {
        id: "az-a-down", label: "整个 AZ A 都故障", resultTitle: "换出网网关，救不活已经停摆的服务器",
        resultBody: "这时 EC2 A 自己也无法工作，改用 NAT B 无法让它继续执行任务。需要由另一个 AZ 中的健康应用接手；每个 AZ 都有自己的 NAT，能减少相互依赖。",
        activeNodes: ["nat-b", "igw", "internet"], failedNodes: ["ec2-a", "nat-a"],
        highlightEdges: [], status: "danger"
      }
    ],
    lesson: "先分清故障范围：只有网关坏了，检查和切换路由；整个可用区停摆了，需要健康可用区中的应用接班。本实验讨论可用区级 NAT，并不把所有 NAT 产品都当成同一种部署方式。"
  },
  {
    id: "redis-cache",
    title: "Redis 缓存：是谁去数据库拿数据？",
    question: "耳机价格刚刚修改了。商品页、缓存和结算系统，应该分别相信哪一份数据？",
    baseline: "商品服务使用 Cache Aside（旁路缓存）：应用自己先查 Redis（内存数据存储），未命中时再查 DynamoDB（键值与文档数据库）。数据库保存权威业务记录。",
    diagram: {
      nodes: [
        { id: "customer", title: "Customer", subtitle: "查看耳机商品", type: "entry", zone: "Internet", col: 0, row: 0 },
        { id: "app", title: "Product App", subtitle: "应用决定查哪里", type: "compute", zone: "Application", col: 1, row: 0 },
        { id: "redis", title: "Redis", subtitle: "商品信息缓存", type: "data", zone: "Cache", col: 2, row: 0, service: "elasticache" },
        { id: "database", title: "DynamoDB", subtitle: "权威商品记录", type: "data", zone: "Database", col: 2, row: 2, service: "dynamodb" }
      ],
      edges: [
        { from: "customer", to: "app", label: "请求商品信息" },
        { from: "app", to: "redis", label: "读取或写入缓存" },
        { from: "app", to: "database", label: "查询权威数据" }
      ]
    },
    states: [
      {
        id: "hit", label: "缓存命中", resultTitle: "这一次商品页读取可以少查数据库",
        resultBody: "应用从 Redis 找到了可用的商品介绍，把结果返回给顾客。这个请求不用再查数据库，通常减少读取等待，也减轻数据库的重复读取压力。",
        activeNodes: ["customer", "app", "redis"], failedNodes: [],
        highlightEdges: ["customer>app", "app>redis"], status: "ok"
      },
      {
        id: "miss", label: "缓存未命中", resultTitle: "应用回源查询，再填充缓存",
        resultBody: "Redis 没找到这条记录。商品应用自己读取 DynamoDB，把结果返回给顾客，并按缓存策略把结果写入 Redis。Redis 在这里不是替应用自动访问数据库的代理。",
        activeNodes: ["customer", "app", "redis", "database"], failedNodes: [],
        highlightEdges: ["customer>app", "app>redis", "app>database"], status: "ok"
      },
      {
        id: "stale", label: "商品价格刚更新", resultTitle: "缓存还可能暂时显示旧价格",
        resultBody: "数据库里的耳机已从 ¥299 调为 ¥279，但 Redis 的缓存仍是 ¥299。数据库更新不会自动替所有缓存完成同步；应用需要设计更新、失效或到期策略。",
        activeNodes: ["customer", "app", "redis", "database"], failedNodes: [],
        highlightEdges: ["customer>app", "app>redis"], status: "warning"
      },
      {
        id: "checkout", label: "顾客确认付款", resultTitle: "结算按业务规则确认权威成交价",
        resultBody: "下单程序向权威数据源确认适用价格、优惠和库存，再保存成交信息，不能直接把商品页缓存当作最终扣款依据。读取策略以及并发更新的处理，也需要应用和数据库一起设计。",
        activeNodes: ["customer", "app", "database"], failedNodes: [],
        highlightEdges: ["customer>app", "app>database"], status: "ok"
      },
      {
        id: "redis-unavailable", label: "Redis 暂时不可用", resultTitle: "能否继续购物，取决于应用的降级设计",
        resultBody: "如果程序支持绕过缓存，就可以查询数据库继续服务，但数据库可能突然承受更大压力。缓存故障不会自动删除数据库记录；也不能假定所有应用都会自动正确回源。",
        activeNodes: ["customer", "app", "database"], failedNodes: ["redis"],
        highlightEdges: ["customer>app", "app>database"], status: "warning"
      }
    ],
    lesson: "把 Redis 想成应用旁边的速查本：应用负责查本子、补内容、决定什么时候重查原始记录。缓存适合加速，但价格确认、付款和库存等关键操作仍要遵守权威业务规则。"
  },
  {
    id: "alb-asg",
    title: "应用故障：ALB 和 ASG 分别做什么？",
    question: "EC2 A 的机器还活着，但网站程序已经报错。是谁不再给它派请求，谁会换掉它？",
    baseline: "ALB（应用负载均衡器）后有 EC2 A 和 EC2 B，两台原本健康。EC2 B 在整个实验中保持健康，并且有足够容量；我们只改变 EC2 A 的应用状态和 ASG（自动扩缩组）健康检查配置。",
    diagram: {
      nodes: [
        { id: "customer", title: "Customer", subtitle: "顾客请求", type: "entry", zone: "Internet", col: 0, row: 0 },
        { id: "alb", title: "ALB", subtitle: "检查健康并分流", type: "network", zone: "Application", col: 1, row: 0, service: "alb" },
        { id: "ec2-a", title: "EC2 A", subtitle: "应用实例 A", type: "compute", zone: "AZ A", col: 2, row: 0, service: "ec2" },
        { id: "ec2-b", title: "EC2 B", subtitle: "健康应用实例 B", type: "compute", zone: "AZ B", col: 2, row: 2, service: "ec2" },
        { id: "asg", title: "ASG", subtitle: "管理与替换实例", type: "support", zone: "Control", col: 1, row: 3, service: "asg" }
      ],
      edges: [
        { from: "customer", to: "alb", label: "网站请求" },
        { from: "alb", to: "ec2-a", label: "健康目标" },
        { from: "alb", to: "ec2-b", label: "健康目标" },
        { from: "asg", to: "ec2-a", label: "检查或替换", kind: "control" },
        { from: "asg", to: "ec2-b", label: "管理实例", kind: "control" }
      ]
    },
    states: [
      {
        id: "all-healthy", label: "两台应用都健康", resultTitle: "ALB 分配请求，ASG 维持实例数量",
        resultBody: "ALB 可以把请求交给两个健康目标。ASG 根据最小、期望和最大容量等配置管理服务器数量。分流和管理实例是两个不同职责。",
        activeNodes: ["customer", "alb", "ec2-a", "ec2-b", "asg"], failedNodes: [],
        highlightEdges: ["customer>alb", "alb>ec2-a", "alb>ec2-b"], status: "ok"
      },
      {
        id: "app-failure-ec2-check", label: "A 应用坏了：ASG 只检查 EC2", resultTitle: "ALB 摘除坏应用，ASG 可能仍认为机器健康",
        resultBody: "应用健康检查达到失败阈值后，ALB 不再向 A 发送新的普通请求，交给仍健康的 B。由于 EC2 层面的状态检查仍通过，ASG 仅依靠它，未必会替换 A。已有连接和正在处理的请求仍可能受故障影响。",
        activeNodes: ["customer", "alb", "ec2-b", "asg"], failedNodes: ["ec2-a"],
        highlightEdges: ["customer>alb", "alb>ec2-b"], status: "warning"
      },
      {
        id: "app-failure-elb-check", label: "A 应用坏了：ASG 使用 ELB 检查", resultTitle: "ALB 停止分流给 A，ASG 按配置替换 A",
        resultBody: "ASG 已启用 ELB（弹性负载均衡）健康检查，并满足宽限期等条件时，可以把应用不健康的 A 视为需要替换的实例。替换需要时间，期间由健康的 B 接收请求。",
        activeNodes: ["customer", "alb", "ec2-b", "asg"], failedNodes: ["ec2-a"],
        highlightEdges: ["customer>alb", "alb>ec2-b", "asg>ec2-a"], status: "warning"
      },
      {
        id: "replacement-ready", label: "新 A 启动并通过健康检查", resultTitle: "新实例健康后重新参与服务",
        resultBody: "ASG 使用 Launch Template（启动模板）创建替代实例；应用初始化并通过 ALB 健康检查后，新 A 可以接收请求。把状态只放在旧 A 内存里会丢失，因此共享会话和关键数据要保存在合适的外部存储。",
        activeNodes: ["customer", "alb", "ec2-a", "ec2-b", "asg"], failedNodes: [],
        highlightEdges: ["customer>alb", "alb>ec2-a", "alb>ec2-b", "asg>ec2-a"], status: "ok"
      }
    ],
    lesson: "ALB 像前台，负责把顾客引向健康窗口；ASG 像人事与排班，负责维持人数、替换实例。要让 ASG 根据应用健康状态换人，需要启用相应的健康检查，而不只是看机器是否还开着。"
  },
  {
    id: "dynamodb-consistency",
    title: "数据刚写完：哪个入口已经能确认？",
    question: "东京把商品状态改成“已上架”并成功返回。此刻从 GSI 或新加坡读取，一定已经更新了吗？",
    baseline: "Tokyo（东京）原表与它的 GSI（全局二级索引）之间异步更新。Global Tables（全局表）使用 MREC（多区域最终一致性），东京到 Singapore（新加坡）的复制也可能暂时落后。假设没有其他并发修改。",
    diagram: {
      nodes: [
        { id: "client", title: "Client", subtitle: "应用选择读取入口", type: "entry", zone: "Application", col: 0, row: 1 },
        { id: "tokyo-table", title: "Tokyo Table", subtitle: "原表：已上架", type: "data", zone: "Tokyo", col: 1, row: 0, service: "dynamodb" },
        { id: "tokyo-gsi", title: "Tokyo GSI", subtitle: "另一查询入口", type: "data", zone: "Tokyo", col: 2, row: 0, service: "gsi" },
        { id: "singapore-table", title: "Singapore Table", subtitle: "跨区域副本", type: "data", zone: "Singapore", col: 1, row: 3, service: "global-tables" }
      ],
      edges: [
        { from: "client", to: "tokyo-table", label: "读取原表" },
        { from: "tokyo-table", to: "tokyo-gsi", label: "异步更新", kind: "async" },
        { from: "tokyo-table", to: "singapore-table", label: "MREC 异步复制", kind: "async" },
        { from: "client", to: "tokyo-gsi", label: "查询索引" },
        { from: "client", to: "singapore-table", label: "读取本地区域" }
      ]
    },
    states: [
      {
        id: "write-succeeded", label: "东京写入成功", resultTitle: "原表写入成功，不等于所有入口都同步完成",
        resultBody: "东京原表已完成这次写入。GSI 和新加坡副本还各自有更新过程，因此两个入口此刻都可能仍返回旧状态。这里的等待是数据传播，并不等于查询本身运行得慢。",
        activeNodes: ["client", "tokyo-table", "tokyo-gsi", "singapore-table"], failedNodes: [],
        highlightEdges: ["client>tokyo-table", "tokyo-table>tokyo-gsi", "tokyo-table>singapore-table"], status: "warning"
      },
      {
        id: "gsi-lag", label: "立即查询东京 GSI", resultTitle: "索引可能暂时仍显示“未上架”",
        resultBody: "GSI 是独立维护的索引数据结构，需要等待异步更新；它不支持强一致性读取。Global（全局）在 GSI 名字里，也不表示它就是跨 Region（区域）复制。",
        activeNodes: ["client", "tokyo-table", "tokyo-gsi"], failedNodes: [],
        highlightEdges: ["client>tokyo-gsi", "tokyo-table>tokyo-gsi"], status: "warning"
      },
      {
        id: "local-strong", label: "新加坡原表：强一致读取", resultTitle: "本地强读取，不会替 MREC 等待东京复制",
        resultBody: "对新加坡原表使用 ConsistentRead=true（强一致性读取），也可能暂时看不到东京刚完成的更新：在 MREC 模式下，东京的数据还可能没复制过来。不能把本地区域的强读，理解成跨区域同步屏障。",
        activeNodes: ["client", "tokyo-table", "singapore-table"], failedNodes: [],
        highlightEdges: ["client>singapore-table", "tokyo-table>singapore-table"], status: "warning"
      },
      {
        id: "source-strong", label: "东京原表：强一致读取", resultTitle: "在写入区域的原表确认“已上架”",
        resultBody: "使用完整主键向东京原表执行 GetItem（按主键读取），并设置 ConsistentRead=true。在本例没有并发修改的前提下，可以确认这次已成功完成的写入；不要改从 GSI 查询。",
        activeNodes: ["client", "tokyo-table"], failedNodes: [],
        highlightEdges: ["client>tokyo-table"], status: "ok"
      },
      {
        id: "caught-up", label: "复制和索引更新完成", resultTitle: "这次变化已经传播到两个入口",
        resultBody: "当 GSI 更新和跨区域复制都已完成后，这些入口也能读到“已上架”。这说明本次更新已传播完成，不代表今后的每次写入都立刻同步；MRSC（多区域强一致性）是另一种需要单独评估的全局表模式。",
        activeNodes: ["client", "tokyo-table", "tokyo-gsi", "singapore-table"], failedNodes: [],
        highlightEdges: ["tokyo-table>tokyo-gsi", "tokyo-table>singapore-table", "client>tokyo-gsi", "client>singapore-table"], status: "ok"
      }
    ],
    lesson: "每次先问“在哪个区域、读原表还是索引、使用什么一致性模式”。强一致性不是加速开关；它规定能确认哪些已完成的写入，也不能让 GSI 获得它不支持的读取能力。"
  },
  {
    id: "payment-retry",
    title: "付款后超时：重试会不会再扣一次？",
    question: "付款平台已经扣款，但 Lambda 保存结果前超时了。页面显示失败，就能直接再付一次吗？",
    baseline: "订单编号是 ORDER-1001。Lambda（函数计算）调用外部付款平台，随后保存结果，并把通知任务交给 SQS（简单队列服务）。这些系统之间的操作不会因为同一次调用就自动成为一个原子事务。",
    diagram: {
      nodes: [
        { id: "customer", title: "Customer", subtitle: "确认支付订单", type: "entry", zone: "Internet", col: 0, row: 0 },
        { id: "lambda", title: "Lambda", subtitle: "付款处理程序", type: "compute", zone: "Application", col: 1, row: 0, service: "lambda" },
        { id: "payment", title: "Payment API", subtitle: "外部扣款服务", type: "entry", zone: "Payment", col: 2, row: 0 },
        { id: "orders", title: "Order DB", subtitle: "订单处理记录", type: "data", zone: "Database", col: 1, row: 2 },
        { id: "queue", title: "SQS", subtitle: "付款后通知任务", type: "support", zone: "Messaging", col: 2, row: 2, service: "sqs" }
      ],
      edges: [
        { from: "customer", to: "lambda", label: "提交支付" },
        { from: "lambda", to: "payment", label: "业务付款请求编号" },
        { from: "lambda", to: "orders", label: "保存与核对结果" },
        { from: "lambda", to: "queue", label: "提交后续通知", kind: "async" }
      ]
    },
    states: [
      {
        id: "timeout", label: "扣款成功后程序超时", resultTitle: "程序超时，不等于付款平台没有扣款",
        resultBody: "付款平台已经完成扣款，Lambda 却没来得及保存或返回结果。此刻页面与订单记录可能暂时不完整；应使用原业务请求编号查询付款状态、对账，避免把未知结果直接当成失败。",
        activeNodes: ["customer", "payment", "orders"], failedNodes: ["lambda"],
        highlightEdges: ["lambda>payment"], status: "warning"
      },
      {
        id: "new-id", label: "每次重试生成新编号", resultTitle: "付款方可能把重试当成第二笔付款",
        resultBody: "第一次用 PAY-1001，重试却变成 PAY-1002，付款平台可能把它们视为两笔不同请求，产生重复扣款风险。最终是否真的扣了两次，需要查询支付记录确认，不能只看本地页面。",
        activeNodes: ["customer", "lambda", "payment", "orders"], failedNodes: [],
        highlightEdges: ["customer>lambda", "lambda>payment"], status: "danger"
      },
      {
        id: "stable-id", label: "固定编号，付款方支持幂等", resultTitle: "同一笔业务重试，降低重复扣款风险",
        resultBody: "这笔付款的重试都使用同一个 PAY-1001，付款平台按它支持的幂等规则识别相同业务，并返回已有处理结果。应用再核对并补齐本地记录；还要遵守付款方的有效期、参数一致性等规则。",
        activeNodes: ["customer", "lambda", "payment", "orders"], failedNodes: [],
        highlightEdges: ["customer>lambda", "lambda>payment", "lambda>orders"], status: "ok"
      },
      {
        id: "notification-delay", label: "付款后，通知队列积压", resultTitle: "通知还没送到，不代表这笔付款失败",
        resultBody: "已确认付款成功，但发给消费者的通知任务还在 SQS 排队。应分别展示付款状态与通知处理状态，监控并处理积压；不能因为通知晚到，就重新向顾客扣款。",
        activeNodes: ["customer", "lambda", "payment", "orders", "queue"], failedNodes: [],
        highlightEdges: ["lambda>payment", "lambda>orders", "lambda>queue"], status: "warning"
      },
      {
        id: "reconciled", label: "查询支付记录并完成对账", resultTitle: "用实际支付结果修复本地业务状态",
        resultBody: "根据原业务请求编号查询支付平台，并与订单记录核对。确认成功就补齐订单状态、继续后续任务；确认失败再按业务规则处理。处于未知状态时继续核查，而不是凭超时消息猜测资金结果。",
        activeNodes: ["customer", "lambda", "payment", "orders", "queue"], failedNodes: [],
        highlightEdges: ["lambda>payment", "lambda>orders", "lambda>queue"], status: "ok"
      }
    ],
    lesson: "分开看三件事：付款方是否扣款、本地订单是否记录成功、后续通知是否处理完成。幂等依靠稳定的业务编号与收款方的支持；队列重试和 Lambda 重试不会自动保证整笔业务只生效一次。"
  }
];
