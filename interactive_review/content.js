/* 本地普通脚本：不访问网络，不包含账户或密钥。 */
window.REVIEW_DATA = {
  chapters: [
    {
      id: 'images', title: '一张耳机图片的旅程', kicker: '01 / 上传 → 处理 → 分发',
      summary: '商家上传原图，后台生成缩略图，顾客从附近的缓存读取。把文件、代码、权限和缓存串起来。',
      story: '我们为 Amazon 风格的日本电商站设计教学系统。商家上传一副耳机的照片，Joey 稍后打开商品页面。这里的具体搭配是教学设计，不代表 Amazon 真实内部架构。',
      goal: '分清 S3 保存文件、Lambda 执行代码、IAM 决定权限、CloudFront 分发内容。',
      steps: [
        { title: '商家上传原图', body: '图片放进 S3（对象存储）的 shop-images 桶，Key（对象名称）是 originals/headphone.jpg。Bucket（存储桶）像容器，对象名称帮助应用找到文件。', activeNodes: ['im-seller', 'im-original'] },
        { title: '上传事件触发处理代码', body: 'S3 上传事件触发 Lambda（函数计算）。函数读取原图、生成缩略图，写入 thumbnails/，输入和输出目录分开，避免递归触发。', activeNodes: ['im-original', 'im-lambda', 'im-thumb'] },
        { title: '给程序合适的工作权限', body: 'Lambda 使用 IAM Role（角色）取得临时凭证，只允许读 originals/*、写 thumbnails/*。使用 SSE-KMS（KMS 服务端加密）的原图，还要有有效的解密授权与支持该授权的 Key Policy（密钥策略）。', activeNodes: ['im-role', 'im-kms', 'im-lambda', 'im-original'] },
        { title: '顾客从边缘缓存读图片', body: '浏览器向 CloudFront（内容分发网络）请求缩略图。缓存命中就直接返回；未命中时，CloudFront 用配置好的 OAC（源站访问控制）向私有 S3 源站取文件。', activeNodes: ['im-customer', 'im-cdn', 'im-thumb'] },
        { title: '商家换图，顾客怎样看见新版？', body: '网页改用 headphone-v2.jpg，就不会命中旧路径缓存；也可执行 Invalidation（缓存失效）。S3 Versioning（版本控制）用于保留文件历史，不会自动刷新 CloudFront 缓存。', activeNodes: ['im-seller', 'im-original', 'im-thumb', 'im-cdn', 'im-customer'] }
      ],
      diagram: {
        nodes: [
          { id: 'im-seller', title: 'Seller', subtitle: '商家上传', type: 'entry', zone: '商家设备', col: 0, row: 0 },
          { id: 'im-original', title: 'S3 Originals', subtitle: '保存原图', type: 'data', zone: 'AWS 区域服务', col: 1, row: 0, service: 's3' },
          { id: 'im-lambda', title: 'Lambda', subtitle: '生成缩略图', type: 'compute', zone: 'AWS 区域服务', col: 2, row: 0, service: 'lambda' },
          { id: 'im-kms', title: 'KMS', subtitle: '加密密钥授权', type: 'support', zone: 'AWS 区域服务', col: 1, row: 1, service: 'kms' },
          { id: 'im-thumb', title: 'S3 Thumbnails', subtitle: '保存缩略图', type: 'data', zone: 'AWS 区域服务', col: 2, row: 1, service: 's3' },
          { id: 'im-customer', title: 'Browser', subtitle: '顾客查看图片', type: 'entry', zone: '顾客设备', col: 0, row: 2 },
          { id: 'im-cdn', title: 'CloudFront', subtitle: '就近返回缓存', type: 'entry', zone: 'AWS 边缘网络', col: 1, row: 2, service: 'cloudfront' },
          { id: 'im-role', title: 'IAM Role', subtitle: '程序临时身份', type: 'support', zone: '权限配置', col: 2, row: 2, service: 'iam-role' }
        ],
        edges: [
          { from: 'im-seller', to: 'im-original', label: 'PutObject 上传' },
          { from: 'im-original', to: 'im-lambda', label: '对象上传事件' },
          { from: 'im-lambda', to: 'im-thumb', label: '写入缩略图' },
          { from: 'im-role', to: 'im-lambda', label: '允许读取与写入', kind: 'control' },
          { from: 'im-kms', to: 'im-original', label: '密钥使用授权', kind: 'control' },
          { from: 'im-customer', to: 'im-cdn', label: 'HTTPS 图片请求' },
          { from: 'im-cdn', to: 'im-thumb', label: '未命中：OAC 取源站' }
        ]
      },
      takeaways: ['文件由 S3 保存，处理文件的代码由 Lambda 执行。', 'OAC 管 CloudFront 到 S3 的访问，不负责判断顾客是否购买了商品。', '传输使用 HTTPS / TLS（传输层安全协议）；静态加密和传输加密保护不同阶段。', '历史发票可按读取频率选择 Standard-IA 或归档类别；选类别时同时考虑取回费和恢复等待。'],
      pitfalls: ['S3 桶不在我们的 VPC 子网里，不能给桶随意分配 EC2 私有 IP。', '上传成功不等于缩略图已生成，异步处理也可能重试。', '存储单价更低不保证总账单更低；取回、请求和最低计费期限也会影响成本。'],
      services: ['s3', 'lambda', 'iam-role', 'iam-policy', 'kms', 'cloudfront', 's3-classes', 's3-versioning', 's3-lifecycle']
    },
    {
      id: 'identity', title: 'Joey 登录，程序也要有身份', kicker: '02 / 登录 → 授权 → 执行',
      summary: '顾客证明自己是谁，后台程序取得操作 AWS 的权限。人和程序都能使用角色，但使用方式不同。',
      story: 'Joey 登录电商应用后查看订单。后台 Lambda 要读取属于他的订单文件，不能因为他登录成功就获得管理员权限。',
      goal: '分清 Authentication（身份认证）、Authorization（权限授权）、User Pool（用户池）、Role（角色）及两种策略。',
      steps: [
        { title: '先确认顾客是谁', body: 'Cognito User Pool（用户池）处理注册、登录和 Token（令牌）。应用验证令牌后知道当前顾客是 Joey；这不等于给他创建一个 AWS 管理员。', activeNodes: ['id-customer', 'id-cognito'] },
        { title: '带着登录证明调用业务接口', body: '顾客调用 API Gateway（API 网关），接口按配置验证身份，再交给 Lambda（函数计算）。代码还要检查 Joey 是否有权读取指定订单，不能只检查“登录了没有”。', activeNodes: ['id-customer', 'id-api', 'id-lambda'] },
        { title: 'Trust Policy：谁能穿这件工作服？', body: '给 Lambda 的 IAM Role（角色）配置信任策略，允许 Lambda 服务使用它。角色本身可以长期存在，运行时拿到的是会过期、由平台更新的临时凭证。', activeNodes: ['id-trust', 'id-role', 'id-lambda'] },
        { title: 'Permissions Policy：穿上后能做什么？', body: '权限策略允许 s3:GetObject（读取对象）作用于所需文件范围。它不允许删除；适用的 Explicit Deny（明确拒绝）优先，没有有效允许也会拒绝。', activeNodes: ['id-permissions', 'id-role', 'id-lambda', 'id-s3'] },
        {
          title: '顾客要直接上传，才考虑临时 AWS 凭证',
          body: '商家先从 Cognito User Pool（用户池）取得登录令牌，再向 Identity Pool（身份池）换取受限的临时 AWS 凭证，例如只写该商家目录。这里使用专门的上传角色，不是后台 Lambda 的执行角色；若上传始终由后端代办，就不必为了“登录”强行增加身份池。',
          activeNodes: ['ip-merchant', 'ip-user-pool', 'ip-identity-pool', 'ip-upload-role', 'ip-s3'],
          diagram: {
            nodes: [
              { id: 'ip-merchant', title: 'Merchant User', subtitle: '登录后的商家', type: 'entry', zone: '商家设备', col: 0, row: 0 },
              { id: 'ip-user-pool', title: 'Cognito User Pool', subtitle: '签发登录令牌', type: 'support', zone: '身份认证', col: 1, row: 0, service: 'cognito-user' },
              { id: 'ip-identity-pool', title: 'Cognito Identity Pool', subtitle: '换取临时凭证', type: 'support', zone: '临时 AWS 访问', col: 2, row: 0, service: 'cognito-identity' },
              { id: 'ip-upload-role', title: 'Upload Role', subtitle: '仅允许商家目录', type: 'support', zone: '独立上传角色', col: 2, row: 1, service: 'iam-role' },
              { id: 'ip-s3', title: 'S3 Upload', subtitle: '直接上传商品图', type: 'data', zone: 'AWS 区域服务', col: 1, row: 2, service: 's3' }
            ],
            edges: [
              { from: 'ip-merchant', to: 'ip-user-pool', label: '登录获取 Token' },
              { from: 'ip-merchant', to: 'ip-identity-pool', label: '携带 Token 换凭证' },
              { from: 'ip-upload-role', to: 'ip-identity-pool', label: '配置上传角色与限制', kind: 'control' },
              { from: 'ip-identity-pool', to: 'ip-merchant', label: '返回临时 AWS 凭证' },
              { from: 'ip-merchant', to: 'ip-s3', label: '使用临时凭证上传' }
            ]
          }
        }
      ],
      diagram: {
        nodes: [
          { id: 'id-customer', title: 'Customer', subtitle: '登录后的 Joey', type: 'entry', zone: '顾客设备', col: 0, row: 0 },
          { id: 'id-cognito', title: 'Cognito User Pool', subtitle: '验证登录身份', type: 'support', zone: '身份认证', col: 1, row: 0, service: 'cognito-user' },
          { id: 'id-api', title: 'API Gateway', subtitle: '接收业务请求', type: 'entry', zone: 'AWS 区域服务', col: 2, row: 0, service: 'api-gateway' },
          { id: 'id-trust', title: 'Trust Policy', subtitle: '谁能使用角色', type: 'support', zone: '角色配置', col: 0, row: 1, service: 'iam-policy' },
          { id: 'id-role', title: 'IAM Role', subtitle: '程序临时身份', type: 'support', zone: '权限配置', col: 1, row: 1, service: 'iam-role' },
          { id: 'id-lambda', title: 'Lambda', subtitle: '检查订单归属', type: 'compute', zone: '业务代码', col: 2, row: 1, service: 'lambda' },
          { id: 'id-permissions', title: 'Permissions Policy', subtitle: '允许哪些操作', type: 'support', zone: '角色配置', col: 1, row: 2, service: 'iam-policy' },
          { id: 'id-s3', title: 'S3 Invoice', subtitle: '受限订单文件', type: 'data', zone: 'AWS 区域服务', col: 2, row: 2, service: 's3' }
        ],
        edges: [
          { from: 'id-customer', to: 'id-cognito', label: '登录换 Token' },
          { from: 'id-customer', to: 'id-api', label: '携带 Token 请求' },
          { from: 'id-api', to: 'id-lambda', label: '身份验证后调用' },
          { from: 'id-trust', to: 'id-role', label: '信任 Lambda', kind: 'control' },
          { from: 'id-permissions', to: 'id-role', label: '限定操作与资源', kind: 'control' },
          { from: 'id-role', to: 'id-lambda', label: '执行角色凭证', kind: 'control' },
          { from: 'id-lambda', to: 'id-s3', label: 'GetObject 读取' }
        ]
      },
      takeaways: ['MFA（多因素认证）加强身份验证，不会自动授予额外业务权限。', '人也能 Assume Role（扮演角色）；切换角色后，请求使用当前角色会话的权限，不会叠加原用户全部权限。', 's3:ListBucket（列出桶内容）作用于桶 ARN；GetObject / PutObject（读取 / 上传对象）作用于对象 ARN。', 'Root User（根用户）只用于必要特殊操作；日常员工使用合适的身份与角色。'],
      pitfalls: ['Trust Policy（信任策略）不负责授予上传图片权限；要修改 Permissions Policy（权限策略）。', 'User Pool（用户池）的登录令牌与 Identity Pool（身份池）换取的 AWS 临时凭证不是同一件东西。', '应用允许 Joey 查看自己的订单，不意味着应用应允许他指定任意 CustomerID（顾客编号）越权查询。'],
      services: ['cognito-user', 'cognito-identity', 'iam-role', 'iam-policy', 'iam-user', 'api-gateway', 'kms', 'sg']
    },
    {
      id: 'catalog', title: '查商品、看购物车、更新排行榜', kicker: '03 / 查找 → 缓存 → 数据新旧',
      summary: '商品介绍适合缓存；刚修改的价格、优惠券状态要按业务要求确认。查询快与读到新数据是两个维度。',
      story: 'Joey 查耳机详情，把它加入购物车。商家按 SellerID（商家编号）找全部商品，运营人员还想随时看销量前十名。',
      goal: '理解应用怎样使用 DynamoDB（键值与文档数据库）、GSI（全局二级索引）、Redis（内存数据存储）和变更流。',
      steps: [
        { title: '应用先查商品缓存', body: 'EC2（云服务器）上的应用先向 Redis / Valkey 查询商品介绍。命中就返回；未命中时由应用查询 DynamoDB，再把结果写入缓存。Redis 不是自动转发 SQL 的数据库代理。', activeNodes: ['ca-customer', 'ca-ec2', 'ca-redis', 'ca-table'] },
        { title: '用键查购物车，比全表翻找明确', body: '购物车以 CustomerID（顾客编号）为 Partition Key（分区键），ProductID（商品编号）为 Sort Key（排序键）。Query（按键查询）指定 Joey 的分区键；Scan（扫描）会读取更广范围，再筛选。', activeNodes: ['ca-customer', 'ca-ec2', 'ca-table'] },
        { title: '换个查询入口：商家查自己的商品', body: '商品原表按 ProductID（商品编号）查；按 SellerID（商家编号）查则可建立相应 GSI。AWS 异步维护索引数据，所以商家刚改完记录时，GSI 可能暂时落后。', activeNodes: ['ca-ec2', 'ca-table', 'ca-gsi'] },
        { title: '排行榜由应用安排更新', body: 'DynamoDB Streams（变更流）记录销量变化，触发 Lambda 更新 Redis Sorted Set（有序集合）。业务记录保存在数据库，Redis 维护方便取前十名的结构；重试和旧事件乱序要由代码处理。', activeNodes: ['ca-table', 'ca-streams', 'ca-lambda', 'ca-redis'] },
        { title: '要确认新值，就选正确读取方式', body: '已知原表完整主键时，可以请求 Strongly Consistent Read（强一致性读取）确认已成功完成的写入；GSI 只支持最终一致性。DAX（DynamoDB 加速器）是另一种缓存选择，强一致性请求会转交原表，不从缓存返回。', activeNodes: ['ca-ec2', 'ca-table', 'ca-gsi', 'ca-dax'] }
      ],
      diagram: {
        nodes: [
          { id: 'ca-customer', title: 'Browser', subtitle: '查商品与购物车', type: 'entry', zone: '顾客设备', col: 0, row: 0 },
          { id: 'ca-ec2', title: 'EC2 App', subtitle: '应用决定查哪里', type: 'compute', zone: 'VPC 私有子网', col: 1, row: 0, service: 'ec2' },
          { id: 'ca-redis', title: 'ElastiCache', subtitle: '缓存与排行榜', type: 'data', zone: 'VPC 私有网络', col: 2, row: 0, service: 'elasticache' },
          { id: 'ca-dax', title: 'DAX', subtitle: '可选读取加速', type: 'data', zone: '替代缓存方案', col: 0, row: 1, service: 'dax' },
          { id: 'ca-table', title: 'DynamoDB Table', subtitle: '保存业务记录', type: 'data', zone: 'AWS 区域服务', col: 1, row: 1, service: 'dynamodb' },
          { id: 'ca-gsi', title: 'GSI', subtitle: '异步维护新入口', type: 'data', zone: 'DynamoDB 索引', col: 2, row: 1, service: 'gsi' },
          { id: 'ca-streams', title: 'DynamoDB Streams', subtitle: '记录数据变化', type: 'support', zone: 'AWS 区域服务', col: 1, row: 2, service: 'dynamodb-streams' },
          { id: 'ca-lambda', title: 'Lambda', subtitle: '更新排名结构', type: 'compute', zone: 'AWS 区域服务', col: 2, row: 2, service: 'lambda' }
        ],
        edges: [
          { from: 'ca-customer', to: 'ca-ec2', label: '业务查询' },
          { from: 'ca-ec2', to: 'ca-redis', label: '应用查缓存' },
          { from: 'ca-ec2', to: 'ca-table', label: '未命中再查原表' },
          { from: 'ca-ec2', to: 'ca-gsi', label: '按 SellerID 查询' },
          { from: 'ca-table', to: 'ca-gsi', label: '异步维护索引', kind: 'control' },
          { from: 'ca-table', to: 'ca-streams', label: '记录变更' },
          { from: 'ca-streams', to: 'ca-lambda', label: '触发处理' },
          { from: 'ca-lambda', to: 'ca-redis', label: '更新 Sorted Set' },
          { from: 'ca-dax', to: 'ca-table', label: '未命中或强一致读取' }
        ]
      },
      takeaways: ['分区键用于定位记录或记录组，不是 SQL 的 GROUP BY（分组汇总）。', 'GSI 的延迟指更新传播可能落后，不代表查询请求本身一定慢。', '缓存、GSI、跨区域副本都可能出现旧数据，但产生原因和解决方式不同。', '优惠券是否过期由业务有效期决定；缓存 TTL（有效期）和 DynamoDB TTL（后台清理）不能延长它。'],
      pitfalls: ['给 GSI 设置 ConsistentRead=true（要求强一致性）不能让它支持强一致性读取。', 'Redis 里加分成功后任务重试，不能无条件再加一次；还要防止旧值覆盖新值。', '缓存本身也收费；减少数据库读取不保证总费用一定下降。'],
      services: ['dynamodb', 'gsi', 'dax', 'elasticache', 'memcached', 'dynamodb-streams', 'dynamodb-ttl', 'dynamodb-capacity', 'rds']
    },
    {
      id: 'checkout', title: '付款到一半超时，怎么办？', kicker: '04 / 接口 → 事务 → 编排',
      summary: '接口入口、业务代码、数据库连接和多步骤流程各有工作。扣款重试要避免让顾客付两次钱。',
      story: 'Joey 点击购买耳机。系统核对价格、预留库存、调用外部支付平台，再更新订单。支付已成功但保存结果超时，是最需要认真处理的一刻。',
      goal: '把 API Gateway（API 网关）、Lambda（函数计算）、Step Functions（工作流服务）、RDS Proxy（数据库代理）和 Aurora（关系型数据库）放对位置。',
      steps: [
        { title: '接口接单，代码开始执行', body: '浏览器向 API Gateway（API 网关）提交下单请求。Lambda 校验身份和参数，创建业务请求编号，再启动工作流；“请求已接收”不等于“付款已完成”。', activeNodes: ['co-customer', 'co-api', 'co-lambda', 'co-workflow'] },
        { title: '把多步骤交给工作流协调', body: 'Step Functions（工作流服务）安排校验、预留库存、付款和更新状态等任务。每步代码可由不同 Lambda 执行；长时间人工退款审批可由 Standard Workflow（标准工作流）等待回调。', activeNodes: ['co-workflow', 'co-lambda', 'co-pay'] },
        { title: '数据库保存交易事实', body: 'Aurora（关系型数据库）保存订单、成交金额和库存事务。高并发 Lambda 经 RDS Proxy（数据库代理）复用连接，缓解频繁建连；代理不会缓存查询结果，也不会消除数据库性能上限。', activeNodes: ['co-lambda', 'co-proxy', 'co-db'] },
        { title: '外部已扣款，函数却超时', body: '重试时继续使用同一个付款请求编号，并让支付服务支持 Idempotency（幂等性）。数据库事务不会自动包含外部扣款，失败后需要查付款结果、释放库存或退款等补偿。', activeNodes: ['co-workflow', 'co-lambda', 'co-pay', 'co-db'] },
        { title: '确认成功后安排后续工作', body: '确认订单后再可靠地安排发货任务，并为“订单写成功、消息尚未发出”准备补偿与核对。工作流、队列和支付回执都应使用明确的业务编号，便于恢复和追踪。', activeNodes: ['co-workflow', 'co-db', 'co-queue'] }
      ],
      diagram: {
        nodes: [
          { id: 'co-customer', title: 'Customer', subtitle: '提交购买请求', type: 'entry', zone: '顾客设备', col: 0, row: 0 },
          { id: 'co-api', title: 'API Gateway', subtitle: 'HTTPS 业务入口', type: 'entry', zone: 'AWS 区域服务', col: 1, row: 0, service: 'api-gateway' },
          { id: 'co-lambda', title: 'Lambda Tasks', subtitle: '校验与付款代码', type: 'compute', zone: '多个业务函数', col: 2, row: 0, service: 'lambda' },
          { id: 'co-db', title: 'Aurora', subtitle: '交易事实与事务', type: 'data', zone: 'VPC 数据库子网', col: 0, row: 1, service: 'aurora' },
          { id: 'co-proxy', title: 'RDS Proxy', subtitle: '复用数据库连接', type: 'support', zone: 'VPC 私有网络', col: 1, row: 1, service: 'rds-proxy' },
          { id: 'co-workflow', title: 'Step Functions', subtitle: '协调任务与失败', type: 'compute', zone: 'AWS 区域服务', col: 2, row: 1, service: 'step-functions' },
          { id: 'co-queue', title: 'SQS', subtitle: '后续任务排队', type: 'support', zone: 'AWS 区域服务', col: 0, row: 2, service: 'sqs' },
          { id: 'co-pay', title: 'Payment API', subtitle: '外部支付平台', type: 'entry', zone: '互联网服务', col: 2, row: 2 }
        ],
        edges: [
          { from: 'co-customer', to: 'co-api', label: '下单请求' },
          { from: 'co-api', to: 'co-lambda', label: '调用入口函数' },
          { from: 'co-lambda', to: 'co-workflow', label: '启动流程' },
          { from: 'co-workflow', to: 'co-lambda', label: '协调后续任务', kind: 'control' },
          { from: 'co-lambda', to: 'co-proxy', label: '数据库连接' },
          { from: 'co-proxy', to: 'co-db', label: '复用连接执行 SQL' },
          { from: 'co-lambda', to: 'co-pay', label: '幂等付款请求' },
          { from: 'co-workflow', to: 'co-queue', label: '确认后安排任务' }
        ]
      },
      takeaways: ['Step Functions（工作流服务）协调任务；Lambda（函数计算）执行每一步代码。', 'Lambda 环境可能复用，但不能把未来请求需要的唯一业务状态只放在内存或 /tmp。', '同一个请求重试多次也应只产生一次付款结果，这靠业务幂等设计。', 'Lambda 连入 VPC 后访问互联网支付平台，通常需要正确的 NAT 出网路径；API Gateway 能调用它不等于它能出网。'],
      pitfalls: ['无状态不等于每次都重新部署代码；冷启动和暖环境复用是另一维度。', '不应让 Lambda 持续运行等待经理审批一天。', 'RDS Proxy（数据库代理）解决连接复用，ElastiCache（缓存）减少重复数据读取，两者用途不同。'],
      services: ['api-gateway', 'lambda', 'step-functions', 'aurora', 'rds-proxy', 'sqs', 'secrets-manager', 'lambda-concurrency']
    },
    {
      id: 'messaging', title: '订单成功后，仓库与通知各忙各的', kicker: '05 / 通知多方 → 排队 → 重试',
      summary: '把必须同时等候的调用拆开。仓库、邮件和积分各有自己的队列，一个系统暂时故障，不必把所有后续业务拖住。',
      story: 'Prime Day（会员大促）有很多新订单。仓库打印面单比较慢，邮件系统又短暂出错，系统仍需要接住已经确认的任务。',
      goal: '分清 SNS（发布订阅）、SQS（任务队列）、EventBridge（事件路由）和业务幂等。',
      steps: [
        { title: '一次订单事件，通知多个订阅者', body: '订单服务把“订单已确认”发布到 SNS（简单通知服务）主题。发货队列和通知队列分别订阅主题，各收到一份，叫 Fan-out（扇出）。', activeNodes: ['me-order', 'me-sns', 'me-shipq', 'me-noticeq'] },
        { title: '每个下游按自己的速度处理', body: '仓库消费者从自己的 SQS（简单队列服务）队列拉取任务，通知程序处理另一队列。通知程序停止时，它的任务可以积压，不需要让仓库一起等待。', activeNodes: ['me-shipq', 'me-noticeq', 'me-worker', 'me-notifier'] },
        { title: '取走消息不代表任务完成', body: 'Visibility Timeout（可见性超时）暂时隐藏已取到的消息；处理成功后才删除。任务超时未删除可能再次可见，因此不能每收到一次消息就多发一件商品。', activeNodes: ['me-shipq', 'me-worker'] },
        { title: '坏任务单独处理，有序需求单独设计', body: '反复失败并达到配置的最大接收次数后，消息转入 DLQ（死信队列）排查。需要同一订单内有序时用 FIFO（先进先出）队列，订单编号作 Message Group ID（消息组编号），不同订单可并行。', activeNodes: ['me-shipq', 'me-worker', 'me-dlq'] },
        { title: '按事件内容分流，或者定时触发', body: '退款、高金额订单等事件可通过 EventBridge（事件总线）的规则匹配，再送往相应目标。每天凌晨对账可使用 Scheduler（事件调度器）；这与“给所有订阅者各发一份”是不同的选择依据。', activeNodes: ['me-order', 'me-eventbridge', 'me-noticeq'] }
      ],
      diagram: {
        nodes: [
          { id: 'me-order', title: 'Order Service', subtitle: '发布确认事件', type: 'compute', zone: '业务应用', col: 0, row: 0 },
          { id: 'me-sns', title: 'SNS Topic', subtitle: '一份事件通知多方', type: 'support', zone: 'AWS 区域服务', col: 1, row: 0, service: 'sns' },
          { id: 'me-shipq', title: 'SQS Shipping', subtitle: '发货任务缓冲', type: 'support', zone: 'AWS 区域服务', col: 2, row: 0, service: 'sqs' },
          { id: 'me-eventbridge', title: 'EventBridge', subtitle: '可选规则分流', type: 'support', zone: '另一种事件路径', col: 0, row: 1, service: 'eventbridge' },
          { id: 'me-noticeq', title: 'SQS Notice', subtitle: '通知任务缓冲', type: 'support', zone: 'AWS 区域服务', col: 2, row: 1, service: 'sqs' },
          { id: 'me-dlq', title: 'DLQ', subtitle: '反复失败待排查', type: 'support', zone: 'AWS 区域服务', col: 0, row: 2, service: 'sqs-dlq' },
          { id: 'me-notifier', title: 'Notice Worker', subtitle: '发送业务通知', type: 'compute', zone: '业务消费者', col: 1, row: 2, service: 'lambda' },
          { id: 'me-worker', title: 'Warehouse Worker', subtitle: '核对后安排发货', type: 'compute', zone: '业务消费者', col: 2, row: 2, service: 'ec2' }
        ],
        edges: [
          { from: 'me-order', to: 'me-sns', label: '发布订单确认' },
          { from: 'me-sns', to: 'me-shipq', label: '订阅者收到一份' },
          { from: 'me-sns', to: 'me-noticeq', label: '订阅者收到一份' },
          { from: 'me-shipq', to: 'me-worker', label: '消费者拉取处理' },
          { from: 'me-noticeq', to: 'me-notifier', label: '消费者拉取处理' },
          { from: 'me-worker', to: 'me-shipq', label: '成功后删除', kind: 'control' },
          { from: 'me-shipq', to: 'me-dlq', label: '达到失败阈值' },
          { from: 'me-order', to: 'me-eventbridge', label: '其他业务事件' },
          { from: 'me-eventbridge', to: 'me-noticeq', label: '符合规则时路由' }
        ]
      },
      takeaways: ['SQS（队列）让任务等待消费者，SNS（发布订阅）让多个订阅者各收到一份。', 'Standard Queue（标准队列）可能重复、可能乱序，应用应按业务编号去重。', 'FIFO（先进先出）控制消息组内顺序和发送去重，不保证外部业务副作用永不重复。', '积压增长时，要检查消费者处理速度并增加合适的处理能力，不是给队列“加长”。'],
      pitfalls: ['消息被取到后暂时不可见，不等于已经删除。', 'Visibility Timeout（可见性超时）太短导致重复处理，不能只靠换 FIFO 解决。', 'DLQ（死信队列）保存失败任务便于排查，进入后仍需要人或程序处理。'],
      services: ['sns', 'sqs', 'sqs-fifo', 'sqs-dlq', 'eventbridge', 'cloudwatch', 'asg', 'lambda']
    },
    {
      id: 'network', title: '同一台后台的三条网络路径', kicker: '06 / 内部访问 → AWS 服务 → 公网',
      summary: '先问目标在哪里，再选路径。数据库、S3 和外部支付平台不该被画成同一条网络路线。',
      story: '私有子网中的 EC2 要查数据库、取 S3 图片、读取密码，并调用互联网支付平台。它没有公网 IPv4 地址，也仍然可以完成这些任务。',
      goal: '理解 Route Table（路由表）、Gateway Endpoint（网关端点）、Interface Endpoint（接口端点）、NAT 与 IGW 的分工。',
      steps: [
        { title: '查同 VPC 的数据库：内部路由', body: 'EC2 的私有地址为 10.0.1.10，数据库为 10.0.2.20，属于同一个 10.0.0.0/16 VPC。AWS 网络按路由表选择更具体的 local（内部路由），不用绕 NAT 或互联网。', activeNodes: ['ne-ec2', 'ne-db'] },
        { title: '读同区域 S3：网关端点路径', body: 'Gateway Endpoint（网关端点）关联应用子网使用的路由表，为匹配的 S3 流量提供路径，不依赖 NAT 或 IGW。S3 本身依然是区域服务；端点策略和 IAM 权限需要满足访问要求。', activeNodes: ['ne-ec2', 'ne-gateway', 'ne-s3'] },
        { title: '读取 Secrets Manager：接口端点', body: 'Interface Endpoint（接口端点）在子网内提供私有网络接口。应用经对应端点访问 Secrets Manager（密钥管理服务），还要配置 DNS（域名解析）、安全组和有效权限。', activeNodes: ['ne-ec2', 'ne-interface', 'ne-secrets'] },
        { title: '调用互联网支付：NAT 再到 IGW', body: '本例使用公共型 Zonal NAT Gateway（可用区级 NAT 网关），放在公有子网并配置 EIP（弹性公网 IP）。私有应用的默认出网路由指向 NAT，NAT 所在子网再经 IGW（互联网网关）到公网。', activeNodes: ['ne-ec2', 'ne-nat', 'ne-igw', 'ne-internet'] },
        { title: '能走到，不代表会放行', body: 'Security Group（安全组）检查资源流量，有状态；NACL（网络访问控制列表）检查子网进出流量，无状态，要考虑返回临时端口。数据库认证或 AWS IAM 权限还要分别满足。', activeNodes: ['ne-ec2', 'ne-db', 'ne-gateway', 'ne-interface', 'ne-nat'] }
      ],
      diagram: {
        nodes: [
          { id: 'ne-secrets', title: 'Secrets Manager', subtitle: '保存数据库密码', type: 'support', zone: 'AWS 区域服务', col: 0, row: 0, service: 'secrets-manager' },
          { id: 'ne-interface', title: 'Interface Endpoint', subtitle: '私有访问密码服务', type: 'network', zone: 'VPC 私有接口', col: 1, row: 0, service: 'interface-endpoint' },
          { id: 'ne-gateway', title: 'Gateway Endpoint', subtitle: 'S3 路由入口', type: 'network', zone: 'VPC 端点配置', col: 2, row: 0, service: 'gateway-endpoint' },
          { id: 'ne-ec2', title: 'Private EC2', subtitle: '无公网 IPv4 地址', type: 'compute', zone: 'VPC 私有子网', col: 0, row: 1, service: 'ec2' },
          { id: 'ne-db', title: 'Private Database', subtitle: '同 VPC 不同子网', type: 'data', zone: 'VPC 数据库子网', col: 1, row: 1, service: 'aurora' },
          { id: 'ne-s3', title: 'S3', subtitle: '区域对象服务', type: 'data', zone: 'VPC 外的 AWS 服务', col: 2, row: 1, service: 's3' },
          { id: 'ne-nat', title: 'Public NAT Gateway', subtitle: '私有应用主动出网', type: 'network', zone: 'VPC 公有子网', col: 0, row: 2, service: 'nat' },
          { id: 'ne-igw', title: 'Internet Gateway', subtitle: '连接 VPC 与公网', type: 'network', zone: '挂载于 VPC', col: 1, row: 2, service: 'igw' },
          { id: 'ne-internet', title: 'Payment API', subtitle: '外部支付平台', type: 'entry', zone: '互联网', col: 2, row: 2 }
        ],
        edges: [
          { from: 'ne-ec2', to: 'ne-db', label: 'local：内部路由' },
          { from: 'ne-ec2', to: 'ne-gateway', label: '匹配 S3 服务路由' },
          { from: 'ne-gateway', to: 'ne-s3', label: '访问 S3' },
          { from: 'ne-ec2', to: 'ne-interface', label: '私有接口请求' },
          { from: 'ne-interface', to: 'ne-secrets', label: '私有访问服务' },
          { from: 'ne-ec2', to: 'ne-nat', label: '公网 IPv4 默认路由' },
          { from: 'ne-nat', to: 'ne-igw', label: '转换后的出网流量' },
          { from: 'ne-igw', to: 'ne-internet', label: '互联网连接' }
        ]
      },
      takeaways: ['VPC（虚拟私有云）属于一个 Region（区域），Subnet（子网）属于一个 AZ（可用区）。', 'Public Subnet（公有子网）通常指向 IGW 的直接路由；里面每个资源不会自动获得公网 IP。', 'Route Table（路由表）按目标地址选择下一站，Longest Prefix Match（最长前缀匹配）优先更具体的范围。', '应用 VPC 与分析 VPC 可以按需求使用 Peering（对等连接）或 Transit Gateway（中转网关）；机房可用 VPN 或 Direct Connect（专线连接）。'],
      pitfalls: ['IGW（互联网网关）挂在 VPC 上，不是放在某个子网里。', '有两台 Zonal NAT（可用区级 NAT），不等于路由会自动从故障 NAT A 切换到 NAT B。', '没有端点时，经 NAT 访问 S3 的公网服务端点是另一种路径，不意味着桶必须公开，也不能简单说流量一定离开 AWS 骨干网。'],
      services: ['vpc', 'route-table', 'sg', 'nacl', 'igw', 'nat', 'gateway-endpoint', 'interface-endpoint', 'peering', 'tgw', 'vpn', 'direct-connect', 'secrets-manager']
    },
    {
      id: 'resilience', title: '机器坏了，与数据写错了', kicker: '07 / 故障接班 → 历史恢复',
      summary: '副本帮助业务继续运行，历史备份帮助找回过去的数据。复制得再快，也可能把错误一起复制过去。',
      story: '大促中一台 EC2 坏了，稍后数据库主实例故障。另一天，管理员误改了积分；这三件事需要不同的恢复方法。',
      goal: '区分 ALB（应用负载均衡）、ASG（自动扩缩组）、Multi-AZ（多可用区）、Global Tables（全局表）与 PITR（时间点恢复）。',
      steps: [
        { title: '单个应用实例故障', body: 'ALB（应用负载均衡器）根据健康检查避开不健康目标。ASG（自动扩缩组）按已配置的健康检查替换实例；ALB 本身不负责新建服务器，剩余实例也需要足够容量。', activeNodes: ['re-alb', 're-ec2b'], failedNodes: ['re-ec2a'], highlightEdges: ['re-alb>re-ec2b'] },
        { title: '数据库写入实例故障', body: 'Aurora（关系型数据库）的副本可按配置成为新的 Writer（写入实例），应用处理断线并重连。普通 RDS 传统双实例 Multi-AZ（多可用区）的备用实例用于接班，不承担日常读取。', activeNodes: ['re-ec2b', 're-writer', 're-reader'] },
        { title: '整个区域不可用时', body: '备用区域必须预先准备应用与数据，再由 Route 53（DNS 服务）或 GA（全球加速器）切换合适入口。DynamoDB Global Tables（全局表）负责表复制；MREC（多区域最终一致性）仍可能有跨区域传播延迟。', activeNodes: ['re-ec2b', 're-global'] },
        { title: '积分误修改，副本也变错了', body: '已开启 PITR（时间点恢复）时，选误改前的时间生成新表，再核对与安排切换。误改后产生的正常记录要另行处理；恢复历史状态不会自动替你合并后续业务。', activeNodes: ['re-global', 're-backup', 're-restore'] },
        { title: '文件和磁盘也要分清保护层', body: 'EBS Snapshot（快照）可恢复新卷，S3 保留版本可找回历史对象，EFS 可用 AWS Backup（备份服务）。EFS Regional（区域型文件系统）能承受相应 AZ 故障，但误删仍可能影响共享数据。', activeNodes: ['re-backup', 're-restore'] }
      ],
      diagram: {
        nodes: [
          { id: 're-alb', title: 'ALB', subtitle: '健康目标分流', type: 'entry', zone: '区域入口', col: 0, row: 0, service: 'alb' },
          { id: 're-ec2a', title: 'EC2 A', subtitle: '故障实例示例', type: 'compute', zone: 'Tokyo · AZ A', col: 1, row: 0, service: 'ec2' },
          { id: 're-writer', title: 'Aurora Writer', subtitle: '当前写入实例', type: 'data', zone: 'Tokyo · AZ A', col: 2, row: 0, service: 'aurora' },
          { id: 're-ec2b', title: 'EC2 B', subtitle: '其他可用实例', type: 'compute', zone: 'Tokyo · AZ B', col: 1, row: 1, service: 'ec2' },
          { id: 're-reader', title: 'Aurora Replica', subtitle: '可按配置接班', type: 'data', zone: 'Tokyo · AZ B', col: 2, row: 1, service: 'aurora' },
          { id: 're-backup', title: 'Backup / PITR', subtitle: '独立保留历史', type: 'support', zone: '数据保护配置', col: 0, row: 2, service: 'backup' },
          { id: 're-restore', title: 'Restored Resource', subtitle: '新资源核对后使用', type: 'data', zone: '恢复结果', col: 1, row: 2, service: 'pitr' },
          { id: 're-global', title: 'Global Tables', subtitle: '东京与新加坡复制', type: 'data', zone: '跨区域数据库', col: 2, row: 2, service: 'global-tables' }
        ],
        edges: [
          { from: 're-alb', to: 're-ec2a', label: '仅健康时转发' },
          { from: 're-alb', to: 're-ec2b', label: '健康实例接收请求' },
          { from: 're-ec2a', to: 're-writer', label: '数据库请求' },
          { from: 're-ec2b', to: 're-writer', label: '数据库请求' },
          { from: 're-writer', to: 're-reader', label: '集群副本与接班', kind: 'control' },
          { from: 're-ec2b', to: 're-global', label: '另一类业务数据' },
          { from: 're-global', to: 're-backup', label: '另行开启 PITR', kind: 'control' },
          { from: 're-writer', to: 're-backup', label: '独立备份保护', kind: 'control' },
          { from: 're-backup', to: 're-restore', label: '选择历史时间恢复' }
        ]
      },
      takeaways: ['High Availability（高可用）降低故障中断，Backup（备份）保留可恢复的历史。', 'Aurora Reader（读取实例）可分担读取；数据库副本和缓存都需要理解数据新旧要求。', 'GA（全球加速器）可以把新连接转向健康端点，但不会自动搬迁旧连接或复制订单。', 'CloudWatch（监控）查运行状态，CloudTrail（审计）查 API 操作，Config（配置记录）查配置历史与规则。'],
      pitfalls: ['MREC 全局表在新加坡的强一致性读取，不会强制东京尚未传来的更新瞬间出现。', '删除较早的 EBS 增量快照不会破坏保留的后续快照，AWS 管理底层依赖。', '健康检查和备用资源都要事先配置；画两个 AZ 不等于所有依赖都已具备故障恢复能力。'],
      services: ['alb', 'asg', 'rds', 'aurora', 'global-tables', 'pitr', 'backup', 'ebs-snapshot', 'route53', 'global-accelerator', 'cloudwatch', 'cloudtrail', 'config']
    },
    {
      id: 'cost', title: 'Prime Day 大促：多开机器，还要算账', kicker: '08 / 扩缩 → 付款方式 → 观测',
      summary: '平时的稳定用量、临时高峰、可中断后台任务分别选择购买方式。省钱、容量保障和硬件独占是不同维度。',
      story: '平时需要 4 台网站 EC2，大促预计需要 20 台；还有很多可重试的图片处理任务。团队希望快速扩容、保护数据库，并能解释钱花在了哪里。',
      goal: '将 ALB、ASG、CloudWatch 与 On-Demand（按需）、Spot（竞价）、SP（节省计划）、RI（预留实例）放进同一张经营账。',
      steps: [
        { title: '分流与扩容是两份工作', body: 'ALB（应用负载均衡器）分配请求，ASG（自动扩缩组）按启动模板管理 EC2 数量。配置最小、期望和最大容量，大促可提前定时扩容，并按指标继续调整。', activeNodes: ['ct-buyers', 'ct-alb', 'ct-asg', 'ct-base', 'ct-peak'] },
        { title: '稳定基础用量，评估长期折扣', body: '基础 EC2 量长期稳定时，评估 RI（预留实例）或 Savings Plans（节省计划）。Compute SP（计算节省计划）更灵活；EC2 Instance SP（EC2 实例节省计划）限定区域和实例系列，符合匹配用量才有意义。', activeNodes: ['ct-base', 'ct-asg'] },
        { title: '大促临时高峰，按需且不能中断', body: '额外网站容量用 On-Demand（按需购买）应对短期变化。若必须提前保障指定 AZ 的匹配容量，可另建 On-Demand Capacity Reservation（按需容量预留）；它本身不提供折扣，闲置也收费。', activeNodes: ['ct-buyers', 'ct-alb', 'ct-peak'] },
        { title: '可重试的后台任务，才考虑 Spot', body: '图片处理消费者可用 Spot（竞价实例）从 SQS 拉取任务，接受被中断并重新处理。唯一文件放在持久存储，按需记录检查点；不要把 Instance Store（实例存储）当唯一备份。', activeNodes: ['ct-base', 'ct-queue', 'ct-spot'] },
        { title: '用指标扩容，也保护下游', body: 'CloudWatch（监控）观察延迟、错误率、队列积压和数据库连接，再驱动配置好的扩缩策略。Lambda 的 Reserved Concurrency（预留并发）限制同时执行数量；Provisioned Concurrency（预置并发）提前准备环境，解决的是冷启动等待。', activeNodes: ['ct-monitor', 'ct-asg', 'ct-base', 'ct-peak', 'ct-queue', 'ct-spot'] }
      ],
      diagram: {
        nodes: [
          { id: 'ct-buyers', title: 'Prime Day Buyers', subtitle: '短时大量请求', type: 'entry', zone: '顾客设备', col: 0, row: 0 },
          { id: 'ct-alb', title: 'ALB', subtitle: '分配现有容量', type: 'entry', zone: '区域网站入口', col: 1, row: 0, service: 'alb' },
          { id: 'ct-asg', title: 'Auto Scaling', subtitle: '管理实例数量', type: 'support', zone: '容量配置', col: 2, row: 0, service: 'asg' },
          { id: 'ct-queue', title: 'SQS Work Queue', subtitle: '可重试后台任务', type: 'support', zone: 'AWS 区域服务', col: 0, row: 1, service: 'sqs' },
          { id: 'ct-base', title: 'EC2 Baseline', subtitle: '稳定基础用量', type: 'compute', zone: 'SP / RI 评估对象', col: 1, row: 1, service: 'savings-plans' },
          { id: 'ct-peak', title: 'EC2 Peak', subtitle: '临时网站高峰', type: 'compute', zone: 'On-Demand 用量', col: 2, row: 1, service: 'on-demand' },
          { id: 'ct-spot', title: 'Spot Workers', subtitle: '接受中断与重试', type: 'compute', zone: '后台计算', col: 0, row: 2, service: 'spot' },
          { id: 'ct-monitor', title: 'CloudWatch', subtitle: '运行指标与告警', type: 'support', zone: '运行观测', col: 1, row: 2, service: 'cloudwatch' }
        ],
        edges: [
          { from: 'ct-buyers', to: 'ct-alb', label: '访问网站' },
          { from: 'ct-alb', to: 'ct-base', label: '分流健康目标' },
          { from: 'ct-alb', to: 'ct-peak', label: '分流新增容量' },
          { from: 'ct-asg', to: 'ct-base', label: '按模板管理', kind: 'control' },
          { from: 'ct-asg', to: 'ct-peak', label: '按需求增减', kind: 'control' },
          { from: 'ct-base', to: 'ct-queue', label: '提交后台任务' },
          { from: 'ct-queue', to: 'ct-spot', label: '消费者拉取处理' },
          { from: 'ct-monitor', to: 'ct-asg', label: '配置好的扩缩动作', kind: 'control' }
        ]
      },
      takeaways: ['同一系统可以组合使用不同购买方式，不必整站只选一种。', 'Regional RI（区域级预留实例）提供匹配折扣，不预留容量；Zonal RI（可用区级预留实例）还提供相应 AZ 的匹配容量。', 'Dedicated Instance（专用实例）与 Dedicated Host（专用主机）关注硬件独占和许可证，不能直接当作最大折扣方案。', 'DynamoDB Provisioned（预置容量）配置读写能力，不等于购买 EC2 RI，也不是承诺一年。'],
      pitfalls: ['拥有折扣不等于指定 AZ 一定有容量；有容量预留也不等于自带折扣。', 'Spot 是可被中断的闲置容量，不是“夜间才运行”的实例。', 'Provisioned Concurrency（预置并发）超过已预置环境数后，仍可能使用额度内按需环境，不能把它当函数的固定并发上限。'],
      services: ['asg', 'ami', 'user-data', 'on-demand', 'spot', 'savings-plans', 'ri', 'capacity-reservation', 'dedicated', 'lambda-concurrency', 'cloudwatch', 'ebs', 'instance-store']
    }
  ],

  services: [
    { id: 'route53', name: 'Route 53', cn: 'DNS 服务', category: '访问入口', analogy: '查电话簿：先找到联系地址。', example: '浏览器查询商城域名，得到 CloudFront 或 ALB 入口；Alias（别名记录）可用于域名根节点。', boundary: '网页请求不会逐个由 Route 53 代理；加权是 DNS 回答选择比例，缓存会影响观察到的流量。', source: 'https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/Welcome.html' },
    { id: 'cloudfront', name: 'CloudFront', cn: '内容分发网络', category: '访问入口', analogy: '在顾客附近备一份可分发内容。', example: '就近返回耳机图片，未命中时通过 OAC（源站访问控制）读取私有 S3。', boundary: '也能转发动态 HTTP 请求；个人订单不能随意放进所有顾客共用的缓存项。', source: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowCloudFrontWorks.html' },
    { id: 'global-accelerator', name: 'Global Accelerator', cn: '全球加速器', category: '访问入口', analogy: '对外入口号码不变，里面改接健康的站点。', example: '合作伙伴把固定入口 IP 加入白名单，标准加速器把新连接送往健康的区域端点。', boundary: '不缓存文件，不自动复制数据，也不无缝迁移已有连接；备用端点需准备好。', source: 'https://docs.aws.amazon.com/global-accelerator/latest/dg/introduction-how-it-works.html' },
    { id: 'alb', name: 'Application Load Balancer', cn: '应用负载均衡器', category: '访问入口', analogy: '前台把顾客安排到可工作的收银台。', example: '/products/*（商品路径）送商品服务，/seller/*（商家路径）送商家服务，并避开不健康目标。', boundary: '面向 HTTP / HTTPS；不会自动新建 EC2，也不保证每台实例 CPU 恰好相等。', source: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/application/introduction.html' },
    { id: 'nlb', name: 'Network Load Balancer', cn: '网络负载均衡器', category: '访问入口', analogy: '按网络连接分配入口，重点不在网页路径。', example: '仓库设备使用 TCP 协议，并有固定入口 IP 等网络需求时，评估 NLB。', boundary: '不提供 ALB 那样的 HTTP 路径分流；协议和目标类型要匹配。', source: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/network/introduction.html' },
    { id: 'gwlb', name: 'Gateway Load Balancer', cn: '网关负载均衡器', category: '访问入口', analogy: '让经过检查站的流量分配到多台检查设备。', example: '企业部署第三方虚拟防火墙集群，需要分配经过设备的网络流量。', boundary: '不是商品网站默认入口，也不是用于接收下单 API 的 API Gateway。', source: 'https://docs.aws.amazon.com/elasticloadbalancing/latest/gateway/introduction.html' },
    { id: 'api-gateway', name: 'API Gateway', cn: 'API 网关', category: '访问入口', analogy: '业务接口的接待窗口。', example: '手机通过 HTTPS 提交购买或退货申请，由入口按配置验证身份并调用 Lambda。', boundary: '它负责 API 入口；不会自动赋予 Lambda 访问互联网的网络路径。', source: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/welcome.html' },
    { id: 'ec2', name: 'EC2', cn: '云服务器', category: '计算与流程', analogy: '租一台可自行安装系统和软件的电脑。', example: '持续运行商品服务、仓库处理程序，按 CPU、内存和磁盘需求选择实例类型。', boundary: '客户管理操作系统和应用补丁；实例自身不自动跨 AZ，也不自动伸缩。', source: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/concepts.html' },
    { id: 'ami', name: 'AMI', cn: '机器映像', category: '计算与流程', analogy: '新电脑的系统与预装软件模板。', example: '把统一版本的商城运行环境准备成映像，交给启动模板创建新 EC2。', boundary: 'AMI 是虚拟机映像，不等同 Docker 容器镜像；运行状态仍要交给外部持久存储。', source: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/AMIs.html' },
    { id: 'user-data', name: 'User Data / Launch Template', cn: '启动脚本 / 启动模板', category: '计算与流程', analogy: '一张新员工配置单，加一份入职初始化步骤。', example: '启动模板保存 AMI、实例类型、角色和安全组；User Data 在启动时安装或配置网站。', boundary: '常见启动脚本默认首次启动执行，不是每次网页请求都重新安装软件。', source: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/user-data.html' },
    { id: 'asg', name: 'EC2 Auto Scaling', cn: '自动扩缩组', category: '计算与流程', analogy: '根据客流决定开几个收银台。', example: '设定最小、期望、最大实例数，大促提前定时扩容，再按负载调整并替换坏实例。', boundary: '与 ALB 分工不同；扩缩策略、健康检查和初始化时间需要正确配置。', source: 'https://docs.aws.amazon.com/autoscaling/ec2/userguide/what-is-amazon-ec2-auto-scaling.html' },
    { id: 'lambda', name: 'Lambda', cn: '函数计算', category: '计算与流程', analogy: '事件来了执行一项任务，不用自己管理服务器系统。', example: '商品图片上传后生成缩略图，或执行订单校验和付款代码。', boundary: '环境可能复用，但不能依赖内存或临时目录保留唯一业务状态；一次执行最长 15 分钟。', source: 'https://docs.aws.amazon.com/lambda/latest/dg/welcome.html' },
    { id: 'step-functions', name: 'Step Functions', cn: '工作流服务', category: '计算与流程', analogy: '流程表负责安排下一步、等回执和处理失败。', example: '协调预留库存、付款、确认订单；标准工作流等待人工退货审批后继续。', boundary: '任务代码仍由 Lambda 等执行；配置重试不会自动消除重复扣款等业务副作用。', source: 'https://docs.aws.amazon.com/step-functions/latest/dg/welcome.html' },
    { id: 'lambda-concurrency', name: 'Reserved / Provisioned Concurrency', cn: '预留并发 / 预置并发', category: '计算与流程', analogy: '保留人员名额，与提前让员工到岗，是两件事。', example: '预留并发 20 保护数据库；给登录函数预置部分执行环境，减少冷启动等待。', boundary: '预留并发不负责预热；预置并发有额外费用，超过预置环境数仍可能在额度内按需执行。', source: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html' },
    { id: 's3', name: 'S3', cn: '对象存储', category: '数据与存储', analogy: '按对象名称取放文件的大仓库。', example: '保存商品原图、缩略图、发票 PDF；Bucket 是容器，Key 是对象名称。', boundary: '不是 EC2 挂载的一块普通磁盘，也不是位于客户 VPC 子网内的数据库。', source: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html' },
    { id: 's3-classes', name: 'S3 Storage Classes', cn: 'S3 存储类别', category: '数据与存储', analogy: '常用货放手边，少用货放便宜仓位，但取回条件不同。', example: '热销图片用 Standard；历史发票按读取频率选择 IA 或 Glacier 等类别。', boundary: 'One Zone-IA 只有单 AZ；Glacier IR 可立即读，Flexible / Deep Archive 需恢复。还要比较取回费和最低计费期限。', source: 'https://aws.amazon.com/s3/storage-classes/' },
    { id: 's3-versioning', name: 'S3 Versioning / Replication', cn: '版本控制 / 对象复制', category: '数据与存储', analogy: '保留历史稿，与在另一仓库放副本，各解决一种问题。', example: '误覆盖图片可利用旧版本；CRR（跨区域复制）在另一 Region 保存相应对象副本。', boundary: '复制不是历史恢复的替代品；版本可能被永久删除，复制也需要规则、权限和版本控制配置。', source: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html' },
    { id: 's3-lifecycle', name: 'S3 Lifecycle', cn: '生命周期管理', category: '数据与存储', analogy: '按保管期限自动调仓或清理。', example: '历史发票达到设定天数后转归档类别，按规则清理不再需要的旧版本。', boundary: 'Transition（转换）仍保留对象，Expiration（过期）删除对象；当前版本和历史版本需要分别考虑。', source: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lifecycle-mgmt.html' },
    { id: 'ebs', name: 'EBS', cn: '弹性块存储', category: '数据与存储', analogy: '连接到 EC2 的网络硬盘。', example: '保存系统与程序数据；Attach（连接）后，由操作系统 Mount（挂载）文件系统。', boundary: '卷与实例须在同一 AZ；停止实例后未删除的卷仍保存数据并可能继续计费。', source: 'https://docs.aws.amazon.com/ebs/latest/userguide/what-is-ebs.html' },
    { id: 'instance-store', name: 'Instance Store', cn: '实例存储', category: '数据与存储', analogy: '这台物理主机上的临时工作盘。', example: '处理图片时保存可重新生成的中间文件，完成后把必要结果写回 S3。', boundary: '正常重启通常保留，但停止、终止或底层磁盘故障会丢失；它不是 RAM，也不是唯一订单存放处。', source: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/InstanceStorage.html' },
    { id: 'efs', name: 'EFS', cn: '弹性文件系统', category: '数据与存储', analogy: '多台 Linux 服务器共同使用的网络文件夹。', example: '两台 EC2 经 NFS（网络文件系统协议）挂载同一模板目录；区域型 EFS 跨多个 AZ 保存数据。', boundary: '需要挂载目标、网络与相应安全规则；共享数据被误删时，多 AZ 不代替备份。', source: 'https://docs.aws.amazon.com/efs/latest/ug/whatisefs.html' },
    { id: 'fsx-windows', name: 'FSx for Windows File Server', cn: '托管 Windows 文件服务器', category: '数据与存储', analogy: 'Windows 员工熟悉的域内共享盘。', example: '旧仓库程序经 SMB（文件共享协议）共享文件，集成 AD（活动目录）管理域账号和组权限。', boundary: 'EFS 是独立产品，不是 FSx 的一种；FSx 家族也不只支持 Windows。', source: 'https://docs.aws.amazon.com/fsx/latest/WindowsGuide/what-is.html' },
    { id: 'fsx-lustre', name: 'FSx for Lustre', cn: '托管并行文件系统', category: '数据与存储', analogy: '供大量计算任务一起高速读写的专业文件系统。', example: '电商团队做大规模图片分析或机器学习，按需求评估高吞吐并行文件访问。', boundary: '不应因为“共享”就强行用于普通网站文件；先看协议、性能和持久性配置。', source: 'https://docs.aws.amazon.com/fsx/latest/LustreGuide/what-is.html' },
    { id: 'dynamodb', name: 'DynamoDB', cn: '键值与文档数据库', category: '数据与存储', analogy: '先设计查找方式，再按编号和范围取记录。', example: '购物车以顾客编号为分区键、商品编号为排序键；Query 定位 Joey 的购物车。', boundary: '分区键不是 GROUP BY；灵活复杂 JOIN、临时关联分析通常更适合关系型方案。', source: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Introduction.html' },
    { id: 'gsi', name: 'Global Secondary Index', cn: '全局二级索引', category: '数据与存储', analogy: '商品编号目录之外，再加一本商家目录。', example: '原表按 ProductID 查，GSI 按 SellerID 查商家的全部商品。', boundary: '索引异步更新，只支持最终一致性；Global 指覆盖全表的索引范围，不是跨区域复制。', source: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html' },
    { id: 'dax', name: 'DAX', cn: 'DynamoDB 加速器', category: '数据与存储', analogy: '专门记住 DynamoDB 常见读取答案的助手。', example: '商品介绍反复读取且允许短暂旧值时，评估 DAX 减少原表读取。', boundary: '强一致性读取交给 DynamoDB，不从 DAX 缓存返回；不能用于替 RDS 查询加速。', source: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DAX.html' },
    { id: 'elasticache', name: 'ElastiCache: Redis / Valkey', cn: '托管内存数据存储', category: '数据与存储', analogy: '离应用近的速查本，还能维护排名等专用结构。', example: '缓存商品介绍、共享会话，使用 Sorted Set（有序集合）快速查询销量前十。', boundary: '应用安排读写和同步；不是自动替数据库排序的透明代理。缓存过期也不自动查询原表。', source: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html' },
    { id: 'memcached', name: 'Memcached', cn: '简单键值缓存引擎', category: '数据与存储', analogy: '用名称保存一小段常用答案。', example: '保存可重新生成的商品介绍或已算好的页面片段，减少重复读取。', boundary: '不原生提供 Redis Sorted Set（有序集合）那种排名结构。', source: 'https://docs.aws.amazon.com/AmazonElastiCache/latest/dg/WhatIs.html' },
    { id: 'dynamodb-streams', name: 'DynamoDB Streams', cn: 'DynamoDB 变更流', category: '数据与存储', analogy: '记录业务表发生了哪些变化的流水带。', example: '记录销量更新，由 Lambda 同步更新 Redis 排行榜。', boundary: '处理可能重试，需防重复加分；还要处理并发和旧事件覆盖新数据的问题。', source: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.html' },
    { id: 'dynamodb-ttl', name: 'DynamoDB TTL', cn: '过期记录后台清理', category: '数据与存储', analogy: '告诉清洁员哪些记录到期了，不是到秒拉闸。', example: '给旧购物车临时记录设置到期时间，让服务后台清理。', boundary: '删除是异步的；优惠券 13:00 失效，13:01 记录还在也不能核销，应用检查业务有效期。', source: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html' },
    { id: 'dynamodb-capacity', name: 'DynamoDB Capacity Modes', cn: '数据库读写容量模式', category: '数据与存储', analogy: '按实际工作量付费，或先配置处理能力。', example: '访问难预测时选 On-Demand（按需），稳定可预测时评估 Provisioned（预置）与自动扩缩。', boundary: '预置的是读写容量，不要求承诺一年或三年；自动扩缩不是瞬间消除一切突发。', source: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteCapacityMode.html' },
    { id: 'rds', name: 'RDS', cn: '托管关系型数据库', category: '数据与存储', analogy: '交给平台维护更多底层工作的关系型数据库。', example: '用 PostgreSQL 或 MySQL 管订单、付款记录，做关系查询和事务。', boundary: '传统双实例 Multi-AZ 的备用实例用于接班，不承担读取；Read Replica（只读副本）用于读扩展。', source: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html' },
    { id: 'aurora', name: 'Aurora', cn: '兼容 MySQL / PostgreSQL 的关系型数据库', category: '数据与存储', analogy: '关系型交易系统，配集群存储与读取副本。', example: '保存订单事务；读取实例分担合适的读取，故障时按配置成为写入实例。', boundary: '读取端点分配连接，不是把每条 SQL 都重新平均分；应用仍要处理重连、权限与备份。', source: 'https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/CHAP_AuroraOverview.html' },
    { id: 'rds-proxy', name: 'RDS Proxy', cn: '数据库连接代理', category: '数据与存储', analogy: '复用少量稳定通道，避免每个人都重新开一道门。', example: '大量 Lambda 访问订单数据库时复用数据库连接。', boundary: '它不缓存商品查询结果，也不会提升数据库本身无限多的计算能力。', source: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-proxy.html' },
    { id: 'vpc', name: 'VPC / Subnet', cn: '虚拟私有云 / 子网', category: '网络与权限', analogy: '一个区域内的私有园区，以及分布在不同楼栋的网段。', example: '东京 VPC 跨两个 AZ，各自划分应用与数据库子网，使用不重叠的 CIDR。', boundary: 'VPC 属于一个 Region；每个 Subnet 只属于一个 AZ。不同子网不等于跨 AZ。', source: 'https://docs.aws.amazon.com/vpc/latest/userguide/what-is-amazon-vpc.html' },
    { id: 'route-table', name: 'Route Table', cn: '路由表', category: '网络与权限', analogy: '按目标地址决定下一站的指路清单。', example: '10.0.0.0/16 走 local；没有更具体匹配的公网目标，走 0.0.0.0/0 的 NAT 路由。', boundary: '子网关联路由表，表可供多个子网使用；路由不是防火墙授权，返回路径也要存在。', source: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Route_Tables.html' },
    { id: 'sg', name: 'Security Group', cn: '安全组', category: '网络与权限', analogy: '资源门口的允许名单，会记住已经允许的连接。', example: '数据库 3306 只允许来自应用安全组；网站入口按需求开放 443。', boundary: '只有允许规则，多个组取允许规则并集；有状态返回流量放行仍需要正确路由和 NACL。', source: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-security-groups.html' },
    { id: 'nacl', name: 'Network ACL', cn: '网络访问控制列表', category: '网络与权限', analogy: '子网边界逐条检查的规则表，不记住来回连接。', example: 'EC2 用临时端口 55012 访问外部 443，返回流量的目标端口是 55012。', boundary: '规则按编号从小到大首次匹配，有允许和拒绝；入站、出站以及返回临时端口都要考虑。', source: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-network-acls.html' },
    { id: 'igw', name: 'Internet Gateway', cn: '互联网网关', category: '网络与权限', analogy: '私有园区与互联网相连的出口设施。', example: '公有子网有直接到 IGW 的路由，具备公有 IPv4 和正确安全规则的 EC2 可经它通信。', boundary: '挂载在 VPC，不放在某个子网；只有 IGW 路由不会让无公网 IPv4 的 Lambda 自动出网。', source: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html' },
    { id: 'nat', name: 'Public NAT Gateway', cn: '公共 NAT 网关', category: '网络与权限', analogy: '让里面的人主动联系外面，代记往返地址。', example: '私有后台访问公网支付 API，经公有子网的 NAT 再经 IGW；本例采用可用区级 NAT。', boundary: '不允许互联网任意主动新建到私有实例的连接；两个可用区级 NAT 不会自动互相改路由兜底。', source: 'https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html' },
    { id: 'gateway-endpoint', name: 'Gateway Endpoint', cn: '网关端点', category: '网络与权限', analogy: '给特定 AWS 服务开一条专门的路由入口。', example: '关联私有子网路由表，访问同区域 S3 或 DynamoDB，不依赖 NAT 和 IGW。', boundary: '服务仍然是区域服务；端点不是把 S3 桶搬进 VPC。网络到达与访问授权分别满足。', source: 'https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html' },
    { id: 'interface-endpoint', name: 'Interface Endpoint', cn: '接口端点', category: '网络与权限', analogy: '在园区里设置可用私有地址访问服务的接入口。', example: 'VPC 中的应用经 Secrets Manager 对应端点读取密码，配好 DNS、安全组和 IAM。', boundary: '使用私有网络接口，按服务和配置收费；不要把它与修改路由表的 Gateway Endpoint 混为一谈。', source: 'https://docs.aws.amazon.com/vpc/latest/privatelink/create-interface-endpoint.html' },
    { id: 'peering', name: 'VPC Peering', cn: 'VPC 对等连接', category: '网络与权限', analogy: '两个园区之间修一条直连道路。', example: '电商 VPC 与分析 VPC 在地址不重叠时建立连接，双方路由和安全规则都配置好。', boundary: '不支持 A 经 B 中转到 C；建了 A—B 与 B—C，不代表 A—C 自动互通。', source: 'https://docs.aws.amazon.com/vpc/latest/peering/what-is-vpc-peering.html' },
    { id: 'tgw', name: 'Transit Gateway', cn: '中转网关', category: '网络与权限', analogy: '很多园区接入同一交通枢纽。', example: '多个业务 VPC 集中接入，用相应 TGW 路由表和 VPC 路由管理生产、开发连接。', boundary: '不是连接后默认所有网络互通；传播、关联和路由隔离要明确配置。', source: 'https://docs.aws.amazon.com/vpc/latest/tgw/what-is-transit-gateway.html' },
    { id: 'vpn', name: 'Site-to-Site VPN', cn: '站点到站点 VPN', category: '网络与权限', analogy: '在现有公网道路上建立加密隧道。', example: '仓库机房需要尽快与 AWS 私网通信时，建立 IPsec（加密隧道协议）连接。', boundary: '依赖底层网络条件，不等于拥有一条专用物理线路。', source: 'https://docs.aws.amazon.com/vpn/latest/s2svpn/VPC_VPN.html' },
    { id: 'direct-connect', name: 'Direct Connect', cn: '专线连接', category: '网络与权限', analogy: '为机房和云准备专用连接道路。', example: '仓库长期需要较稳定的连接条件，评估专线并准备所需冗余。', boundary: '专用连接不等于默认端到端加密；按需求配置 VPN 等合适的加密方案。', source: 'https://docs.aws.amazon.com/directconnect/latest/UserGuide/Welcome.html' },
    { id: 'iam-role', name: 'IAM Role', cn: 'IAM 角色', category: '网络与权限', analogy: '可由合适的人或程序穿上的工作服。', example: 'EC2 取得只能读商品图的临时凭证；管理员也可切换到只读角色。', boundary: '角色可长期存在，临时的是会话凭证；使用角色时不会叠加原用户的全部权限。', source: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html' },
    { id: 'iam-policy', name: 'Trust / Permissions Policy', cn: '信任策略 / 权限策略', category: '网络与权限', analogy: '谁能穿工作服，与穿上能做什么。', example: '信任 Lambda 服务使用角色；权限允许 GetObject 读取 originals/*，PutObject 写 thumbnails/*。', boundary: '信任策略不会替代对象操作授权；适用的明确拒绝优先，没有有效允许则默认拒绝。', source: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies.html' },
    { id: 'iam-user', name: 'IAM User / Group / Root', cn: '用户 / 用户组 / 根用户', category: '网络与权限', analogy: '个人身份、统一配权限的成员组，以及账号最高权限身份。', example: '已有 IAM 用户可通过组统一授权；日常员工使用适当角色与 MFA（多因素认证）。', boundary: 'IAM 用户不是只能表示管理员；Root 只用于必要特殊任务，应用不要嵌入长期用户密钥。', source: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html' },
    { id: 'cognito-user', name: 'Cognito User Pool', cn: '顾客用户池', category: '网络与权限', analogy: '顾客注册与登录中心，发放登录证明。', example: 'Joey 登录后取得令牌，应用验证身份并检查订单归属。', boundary: '令牌证明应用身份，不自动授予直接操作 S3 或其他 AWS 资源的权限。', source: 'https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html' },
    { id: 'cognito-identity', name: 'Cognito Identity Pool', cn: '身份池', category: '网络与权限', analogy: '按已确认的身份换取范围受限的临时工作证。', example: '允许商家直接向自己目录上传图片，取得对应 IAM 角色的临时 AWS 凭证。', boundary: '不能替代完整的顾客注册登录流程；若全部 AWS 操作由后端执行，不必强行使用。', source: 'https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-identity.html' },
    { id: 'kms', name: 'KMS / SSE-KMS', cn: '密钥管理 / KMS 服务端加密', category: '网络与权限', analogy: '文件柜加了锁，还需要被允许使用那把钥匙。', example: '后台读取加密发票，需要 GetObject 对象权限，以及有效的 Decrypt 解密授权。', boundary: 'Key Policy（密钥策略）要支持相应授权方式；静态加密不能替代 HTTPS 传输保护。', source: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html' },
    { id: 'secrets-manager', name: 'Secrets Manager', cn: '密钥管理服务', category: '网络与权限', analogy: '集中保存程序需要的密码，按权限领取。', example: '订单函数读取数据库密码，避免把真实凭据写进代码、网页或 Git 仓库。', boundary: '读取权限与网络路径都要满足；仅创建密码条目不会让应用自动使用它。', source: 'https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html' },
    { id: 'sqs', name: 'SQS Standard', cn: '标准任务队列', category: '消息与运维', analogy: '待办单暂存箱，消费者按自己的速度领取。', example: '仓库处理发货任务，成功后删除；超时未删除的任务可能再次被处理。', boundary: '至少一次投递，可能重复且不保证严格顺序；消息可见性超时不等于业务完成。', source: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html' },
    { id: 'sqs-fifo', name: 'SQS FIFO', cn: '先进先出队列', category: '消息与运维', analogy: '同一订单的待办按顺序排，其他订单另排一队。', example: '订单编号作为 Message Group ID，同一订单内有序，不同订单可并行。', boundary: '发送去重有规则和时间窗口，消费者重试仍要处理幂等；不等于外部扣款绝不会执行两次。', source: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-fifo-queues.html' },
    { id: 'sqs-dlq', name: 'Dead-Letter Queue', cn: '死信队列', category: '消息与运维', analogy: '反复做不完的待办单移到待排查区。', example: '畸形发货消息超过最大接收次数后转入 DLQ，通知运维查原因。', boundary: 'DLQ 不会修复消息，也不替代重试、告警和后续人工处理。', source: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html' },
    { id: 'sns', name: 'SNS', cn: '发布订阅通知', category: '消息与运维', analogy: '公告发布一次，各订阅者各收到一份。', example: '订单确认事件扇出到发货、通知、积分各自的 SQS 队列。', boundary: '多个消费者共享一个 SQS 队列通常是在分任务；想每个系统都收到一份，应设计订阅与独立队列。', source: 'https://docs.aws.amazon.com/sns/latest/dg/welcome.html' },
    { id: 'eventbridge', name: 'EventBridge / Scheduler', cn: '事件路由 / 事件调度器', category: '消息与运维', analogy: '按内容分类转交事件，也可按时间叫醒任务。', example: '高金额订单事件按规则送复核流程，每天凌晨触发对账任务。', boundary: '本例用规则路由模式；重试、归档回放和目标配置仍要设计，不保证业务副作用只发生一次。', source: 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-what-is.html' },
    { id: 'cloudwatch', name: 'CloudWatch', cn: '运行监控、日志与告警', category: '消息与运维', analogy: '仪表盘与报警器：系统现在运行怎样？', example: '查看下单延迟、Lambda 错误、EC2 CPU 和队列积压，按配置通知或扩容。', boundary: '应用日志需实际收集；告警评估不是自动拥有扩容、修复或审计所有操作的能力。', source: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html' },
    { id: 'cloudtrail', name: 'CloudTrail', cn: 'AWS 操作审计', category: '消息与运维', analogy: '查谁在何时做过什么资源操作。', example: '追查谁昨晚调用 API 修改了安全组、停止了 EC2。', boundary: '不能把它当应用性能日志；事件覆盖范围取决于事件类型和实际记录配置。', source: 'https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-user-guide.html' },
    { id: 'config', name: 'AWS Config', cn: '配置记录与评估', category: '消息与运维', analogy: '保存资源配置历史，再按规则检查。', example: '核对安全组修改前后开放了哪些端口，数据库是否符合既定配置规则。', boundary: '发现不合规不代表默认自动修复，需要另行配置适当的修复动作。', source: 'https://docs.aws.amazon.com/config/latest/developerguide/WhatIsConfig.html' },
    { id: 'global-tables', name: 'DynamoDB Global Tables', cn: 'DynamoDB 全局表', category: '成本与可靠性', analogy: '多个区域都开业务窗口，并维护对应的数据副本。', example: '东京与新加坡的应用访问当地会员表；本例 MREC 模式允许短暂复制延迟。', boundary: '当地强一致性读取不催熟尚未复制来的远端更新；MRSC 是另一种有配置要求的模式，GSI 仍最终一致。', source: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GlobalTables.html' },
    { id: 'pitr', name: 'Point-in-Time Recovery', cn: '时间点恢复', category: '成本与可靠性', analogy: '从时间机器里拿出误改前的一份新副本。', example: '积分表 15:00 误改，恢复到 14:59 生成新表，再核对和安排切换。', boundary: '需提前开启并在可恢复范围内；15:00 后的正常记录需要另外核对补回。', source: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery.html' },
    { id: 'backup', name: 'AWS Backup', cn: '集中备份服务', category: '成本与可靠性', analogy: '按保管计划保存可恢复的历史副本。', example: '为 EFS 等受支持资源配置备份计划、保留时间，并验证恢复流程。', boundary: '多 AZ 当前副本不等于历史备份；只有创建计划并实际成功执行，才有相应恢复点。', source: 'https://docs.aws.amazon.com/aws-backup/latest/devguide/whatisbackup.html' },
    { id: 'ebs-snapshot', name: 'EBS Snapshot', cn: 'EBS 快照', category: '成本与可靠性', analogy: '保存硬盘某个时点可重建的状态。', example: '从快照在另一个 AZ 创建新卷，交给那里的 EC2 使用。', boundary: '增量存储的依赖由 AWS 管理，删除旧快照不会破坏保留快照；应用一致性仍需正确处理。', source: 'https://docs.aws.amazon.com/ebs/latest/userguide/ebs-snapshots.html' },
    { id: 'on-demand', name: 'EC2 On-Demand', cn: 'EC2 按需购买', category: '成本与可靠性', analogy: '临时加人，按使用付费，不承诺长期名额。', example: 'Prime Day 临时增加网站实例，任务不能接受 Spot 中断。', boundary: '不等于提前保证指定 AZ 的容量，容量保障可按需求另行预留。', source: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-on-demand-instances.html' },
    { id: 'spot', name: 'EC2 Spot', cn: 'EC2 竞价实例', category: '成本与可靠性', analogy: '便宜使用闲置资源，但要接受资源被收回。', example: '可重试的图片处理消费者记录任务进度，必要时在其他实例继续。', boundary: '不是只在夜间便宜；业务要处理实际中断，关键状态不能只放在临时磁盘。', source: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/using-spot-instances.html' },
    { id: 'savings-plans', name: 'Savings Plans', cn: '节省计划', category: '成本与可靠性', analogy: '承诺一段时间的用量金额，换符合条件的折扣。', example: '稳定基础用量评估 Compute SP 或限定区域、实例系列的 EC2 Instance SP。', boundary: '以每小时使用金额承诺，通常一年或三年；不预留容量，不应把所有可能用量盲目承诺进去。', source: 'https://docs.aws.amazon.com/savingsplans/latest/userguide/plan-types.html' },
    { id: 'ri', name: 'Reserved Instances', cn: '预留实例', category: '成本与可靠性', analogy: '长期折扣合约；是否保留座位还看范围。', example: 'Regional RI 提供匹配折扣；Zonal RI 在指定 AZ 还提供匹配容量，另有 Standard 与 Convertible 的灵活性区别。', boundary: '不是买完就自动创建 EC2；区域级 RI 不保证指定 AZ 的容量。', source: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-reserved-instances.html' },
    { id: 'capacity-reservation', name: 'On-Demand Capacity Reservation', cn: '按需容量预留', category: '成本与可靠性', analogy: '提前保留符合规格的座位，坐不坐都付相应费用。', example: '大促必须在指定 AZ 启动匹配实例时，先预留相应容量，可结合适用的已有折扣。', boundary: '本身不提供折扣，闲置也收费；不是损失灵活性后自动获得低价的计划。', source: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-capacity-reservations.html' },
    { id: 'dedicated', name: 'Dedicated Instance / Host', cn: '专用实例 / 专用主机', category: '成本与可靠性', analogy: '不与别家公司共用硬件，或明确租下整台物理主机。', example: '有硬件隔离或特定软件许可证要求时，评估相应独占方案。', boundary: '专用实例不直接让客户管理具体主机；独占硬件不等于自动高可用，也不是最大折扣的同义词。', source: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/dedicated-hosts-overview.html' }
  ],

  knowledgeTree: [
    { title: '顾客怎样找到并访问业务？', items: [
      { name: 'Route 53（DNS）', text: '按域名找到入口；Alias、加权、延迟与故障转移都在 DNS 选择这一层。' },
      { name: 'CloudFront（内容分发）', text: '靠近顾客缓存文件；源站访问、用户授权和缓存隔离分别配置。' },
      { name: 'ALB / NLB / GA（入口选择）', text: '网页分流、网络连接分流、固定全球入口，按协议与需求选择，不要求全部叠加。' }
    ] },
    { title: '谁来执行业务？', items: [
      { name: 'EC2 + ASG（服务器与扩缩）', text: 'AMI 与启动模板统一环境，ASG 管数量，ALB 管请求分配。' },
      { name: 'API Gateway + Lambda（接口与代码）', text: '入口接请求，函数执行任务，持久状态保存到外部。' },
      { name: 'Step Functions（流程编排）', text: '协调多步骤、等待与失败处理，业务仍要设计幂等和补偿。' }
    ] },
    { title: '业务数据放哪里？', items: [
      { name: 'S3 / EBS / EFS / FSx（存储）', text: '对象文件、块磁盘、Linux 共享文件、特定协议文件系统，先看应用怎样访问。' },
      { name: 'DynamoDB / GSI（按键与索引）', text: '主键定位业务记录，GSI 增加异步查询入口，Scan 不代替合理键设计。' },
      { name: 'Aurora / RDS（关系与事务）', text: '保存交易关系与事务；RDS Proxy 复用连接，读取副本分担合适的查询。' },
      { name: 'ElastiCache / DAX（读取加速）', text: '缓存和原库并不天然同步；数据够不够新要服从业务要求。' }
    ] },
    { title: '请求能到吗，到了允许吗？', items: [
      { name: 'VPC / Subnet / Route Table（网络与路由）', text: 'VPC 属于区域、子网属于可用区；按目标地址和最长前缀选择路径。' },
      { name: 'Endpoint / NAT / IGW（路径）', text: '同 VPC 数据库走内部；AWS 服务可走端点；公网服务按需走 NAT 与 IGW。' },
      { name: 'SG / NACL（网络控制）', text: '安全组有状态；NACL 无状态，请求和返回方向都要考虑。' },
      { name: 'Cognito / IAM / KMS（身份与授权）', text: '顾客登录、后台角色和密钥使用权限各管一层，网络连通不能替代授权。' }
    ] },
    { title: '任务与问题怎样被处理？', items: [
      { name: 'SQS / SNS / EventBridge（消息）', text: '任务排队、多方订阅、按内容路由与定时触发，各自解决不同需求。' },
      { name: 'Idempotency（幂等性）', text: '同一业务请求重复执行，仍保持正确结果；扣款、发货、加分都要设计。' },
      { name: 'CloudWatch / CloudTrail / Config（观测）', text: '分别查运行、查操作、查配置，不因为题干出现“修改”就忽略首要排查目标。' }
    ] },
    { title: '故障、历史与费用怎么取舍？', items: [
      { name: 'Multi-AZ / Cross-Region（故障范围）', text: '承受实例、可用区与区域故障需要不同的依赖和备用能力。' },
      { name: 'Backup / Versioning / PITR（历史恢复）', text: '副本也可能一起变错；历史保护需提前配置，恢复后核对后续正常数据。' },
      { name: 'SP / RI / On-Demand / Spot（计算成本）', text: '稳定用量、临时高峰和可中断任务分别选择购买方式；折扣不等于容量保障。' },
      { name: 'S3 Storage Classes（存储成本）', text: '存储、取回、请求、最低期限、恢复等待与 AZ 风险一起比较。' }
    ] }
  ],

  sources: [
    { title: 'AWS：电商参考架构与方案', url: 'https://aws.amazon.com/solutions/retail/' },
    { title: 'S3：对象存储与存储类别', url: 'https://aws.amazon.com/s3/storage-classes/' },
    { title: 'IAM：角色与策略', url: 'https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html' },
    { title: 'DynamoDB：读取一致性与 GSI 边界', url: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadConsistency.html' },
    { title: 'Lambda：执行环境与运行方式', url: 'https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtime-environment.html' },
    { title: 'Step Functions：标准与快速工作流', url: 'https://docs.aws.amazon.com/step-functions/latest/dg/concepts-standard-vs-express.html' },
    { title: 'SQS：队列、重复投递与消费者', url: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html' },
    { title: 'VPC：网关端点与私有访问', url: 'https://docs.aws.amazon.com/vpc/latest/privatelink/gateway-endpoints.html' },
    { title: 'RDS：传统多 AZ 数据库实例', url: 'https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html' },
    { title: 'EC2：容量预留与折扣的区别', url: 'https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-capacity-reservations.html' },
    { title: 'CloudFront：内容分发如何工作', url: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowCloudFrontWorks.html' },
    { title: 'CloudWatch：监控、日志与告警', url: 'https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html' }
  ]
};
