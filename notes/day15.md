# Day 15：加密、证书、密码与配置管理（上）

学习日期：2026-10-19～2026-10-26。对应学习计划的 Day 15。案例沿用 Amazon 电商教学架构，不代表 Amazon 的实际内部实现。

主线：数据怎样保护 → 谁能解密 → 网站怎样证明身份 → 应用怎样读取密码和配置。

## 1. 知识树

```text
Day 15：保护应用和数据
│
├─ ① 数据在哪个阶段需要保护？
│  ├─ Encryption in Transit（传输加密）
│  │  ├─ 保护正在网络上传输的数据
│  │  ├─ TLS = Transport Layer Security（传输层安全协议）
│  │  └─ HTTPS：使用 TLS 保护 HTTP 通信
│  └─ Encryption at Rest（静态加密）
│     └─ 保护已保存的数据，例如 S3 对象、EBS 卷
│
├─ ② KMS = Key Management Service（密钥管理服务）
│  ├─ 管理加密密钥，控制使用授权，支持轮换及使用审计
│  ├─ Encryption Key（加密密钥）参与加解密运算，不是登录密码
│  ├─ 获准使用密钥 ≠ 下载并拿走密钥材料
│  └─ S3 SSE-KMS（使用 KMS 密钥的服务端加密）
│     ├─ SSE = Server-Side Encryption（服务端加密）
│     ├─ S3 处理文件加密、解密；KMS 保护相关数据密钥
│     ├─ Envelope Encryption（信封加密）
│     │  ├─ Data Key（数据密钥）→ 加密文件
│     │  └─ KMS Key（KMS 密钥）→ 加密保护数据密钥
│     └─ 读取加密文件
│        ├─ 网络可达，相关网络规则允许通信
│        ├─ s3:GetObject：获准读取对应 S3 对象
│        ├─ kms:Decrypt：获准使用实际对应的 KMS 密钥解密
│        └─ 授权不足通常返回 AccessDenied（访问被拒绝）
│           不会把乱码文件交给应用；授权通过则返回正常文件内容
│
├─ ③ IAM（身份与访问管理）与密钥授权
│  ├─ IAM Role（角色）：应用使用的身份
│  ├─ Trust Policy（信任策略）：谁能使用角色？
│  ├─ Permissions Policy（权限策略）：角色获准执行哪些操作？
│  └─ Key Policy（密钥策略）：这把 KMS 密钥怎样授权使用？
│     ├─ 同账号内，可以直接授权指定角色
│     └─ 也可以允许账号通过 IAM 授权，再给角色配置相应权限
│        不能只看角色策略中的 Allow（允许）；适用的 Deny（拒绝）仍优先
│
├─ ④ TLS Certificate（TLS 证书）：建立安全连接时的身份证明
│  ├─ 包含适用域名、公钥、有效期、签发者和数字签名
│  ├─ Public Key（公钥）可公开；Private Key（私钥）必须保密
│  ├─ 证书可以公开；复制证书不等于取得对应私钥
│  ├─ 服务端需要证明持有对应私钥，浏览器检查域名、有效期、信任链等
│  ├─ CA = Certificate Authority（证书颁发机构）
│  │  └─ 验证域名控制权等条件，签发证书，例如 Amazon Trust Services
│  ├─ ACM = AWS Certificate Manager（AWS 证书管理器）
│  │  ├─ 申请、保存、管理证书，支持关联到 ALB、CloudFront 等服务
│  │  ├─ 也能导入其他 CA 签发的证书
│  │  └─ 对符合条件的证书提供自动续期，并非所有导入证书都会自动续期
│  └─ 证书区域规则
│     ├─ CloudFront 面向用户的 ACM 证书 → us-east-1（弗吉尼亚北部）
│     └─ ALB 使用的 ACM 证书 → ALB 所在 Region（区域）
│
├─ ⑤ ALB（应用负载均衡器）：请求发给谁、怎样联系后端？
│  ├─ Listener（监听器）：接收指定协议和端口的连接，如 HTTPS 443
│  ├─ Listener Rule（监听器规则）：按路径、域名等条件选择目标组
│  ├─ Target Group（目标组）：接收请求的一组后端，如 EC2 A、B
│  ├─ 目标组协议：ALB 用 HTTP 或 HTTPS 联系后端
│  └─ 两段连接分别配置
│     ├─ 浏览器 → ALB：由监听器配置
│     └─ ALB → EC2：由目标组协议及后端 HTTPS 服务等配置
│
├─ ⑥ Secrets Manager（秘密管理服务）
│  ├─ 保存数据库凭证、API Key（接口密钥）等秘密
│  ├─ 应用使用角色获取获准读取的凭证，避免把密码写死在代码里
│  ├─ 秘密本身使用 KMS 加密保护
│  └─ Rotation（轮换）需要正确配置
│     ├─ 协调更新数据库实际密码和保存的凭证
│     └─ 应用也需要刷新凭证，并正确处理新建连接
│
├─ ⑦ Parameter Store（参数存储，属于 Systems Manager）
│  ├─ 集中保存命名配置，如接口地址、超时时间、环境名称
│  ├─ String（字符串）、StringList（字符串列表）、SecureString（加密字符串）
│  ├─ SecureString 使用 KMS 加密，也可以保存密码
│  ├─ 原生不提供数据库密码自动轮换
│  └─ 修改参数后，应用重新读取才采用新值，不会自动改掉内存里的缓存
│
└─ ⑧ 待学：攻击防护与安全检测
   ├─ WAF（Web 应用防火墙）
   ├─ Shield（DDoS 防护服务）
   ├─ GuardDuty（威胁检测服务）
   └─ Macie（敏感数据发现服务）
```

## 2. 目标组：最关键的一句话

**目标组＝交给哪些后端；路由规则＝什么时候交给它们；目标组协议＝怎样联系它们。**

```text
浏览器 ── HTTPS ──→ ALB 的 HTTPS 443 监听器
                         ├─ /images/* → 图片目标组 ── HTTPS → EC2 A、B
                         └─ /orders/* → 订单目标组 ── HTTPS → EC2 C、D
```

- 路径规则匹配 URL，不会打开文件、识别出图片后再分流。
- 目标组选择 HTTPS 后，EC2 上也要配置 HTTPS 服务、证书，并允许相关网络通信。
- 只开放 443 端口，不会自动把 HTTP 变成 HTTPS。
- 浏览器 → ALB 使用 HTTPS，不代表 ALB → EC2 自动使用 HTTPS。
- TLS Termination（TLS 终止）：浏览器的 TLS 连接在 ALB 结束；ALB 到后端是另一条连接，可以另行使用 HTTPS。
- CloudFront 也能通过 Cache Behavior（缓存行为）的路径规则选择源站，例如图片到 S3、其他请求到 ALB；它与 ALB 的目标组是不同概念。

## 3. 两个具体例子

### 下载加密发票

```text
EC2 应用使用 IAM Role
    ↓ 经可用网络路径，通过 HTTPS 请求 S3
S3 检查读取授权；KMS 检查对应密钥的解密授权
    ↓ 授权通过
S3 借助 KMS 解开数据密钥，再解开发票
    ↓
通过 HTTPS 返回可正常阅读的内容
```

- 文件读取权限与密钥使用权限针对不同资源。
- 应用有 K1 的解密授权，不代表也能使用 K2；应检查文件实际对应的密钥。
- Key Policy 可以直接授权或启用 IAM 授权机制，不是任何情况下都要在两份策略里重复写角色名称。以上以同账号为例，仍需考虑适用的其他限制。

### 集中管理超时配置与数据库密码

```text
Parameter Store：/orders/timeout = 10
    ↓ 应用重新读取
请求超时时间采用 10 秒，不必为这个数值修改代码

Secrets Manager：保存数据库凭证，并配置适用的密码轮换
    ↓ 应用获取、适当缓存并刷新凭证
用当前凭证连接数据库
```

只把 Parameter Store 中的密码改成 new-pass，不会把数据库里的 old-pass 一起改掉。反过来，数据库与 Secrets Manager 已成功轮换后，应用若一直缓存旧密码，新建连接仍可能失败。

## 4. 容易混淆的边界

| 概念 | 分清什么 |
| --- | --- |
| KMS / ACM | KMS 管加密密钥；ACM 管 TLS 证书 |
| TLS 证书 / ACM 证书 | 前者说明证书用途；后者强调由 ACM 管理，本节说的是同类 TLS 证书 |
| CA / ACM / 浏览器 | CA 验证并签发；ACM 申请和管理；浏览器验证网站出示的证书 |
| 有效证书 / 网站可信 | 有效证书不保证商家诚信；骗子也能给自己控制的域名申请证书 |
| 静态加密 / 传输加密 | 保存时的保护与网络传输时的保护，需要分别考虑 |
| KMS 密钥轮换 / 数据库密码轮换 | 更新加密密钥材料，不等于修改数据库登录密码 |
| Secrets Manager / Parameter Store | 专门管理秘密及轮换，与集中管理配置的侧重点不同；两者都能加密保存值 |

证书区域示例：浏览器 → CloudFront → 新加坡 ALB，CloudFront 用户侧 ACM 证书在 us-east-1，ALB 的 ACM 证书在新加坡。证书域名还需匹配各自使用场景。

## 5. 学习与测验记录

- 已学：传输与静态加密、SSE-KMS 与信封加密、IAM/KMS 授权、TLS/CA/ACM、证书区域、ALB 监听器与目标组、Secrets Manager、Parameter Store。
- 第一轮 10 道自编随堂题：6 道正确；证书区域题选错；目标组、密钥策略题干、信封加密术语这 3 道先记待补讲，不按错题直接判断掌握程度。
- 补讲后 5 道变体题：**5/5 正确**，答案依次为 C、A、D、B、A。考查两段 TLS、路径分流、证书区域、K1/K2 授权、参数值与数据库实际密码。
- 这些是自编理解练习，不是 AWS 考试原题或全范围限时模拟。
- WAF、Shield、GuardDuty、Macie 仍待学习，Day 15 尚未全部完成；本节未创建 AWS 资源或进行控制台实操。
- 教学偏好：先 overview（全貌），再完整讲一个主题；仅在明确要求测验时出题，讲解不与选择窗口同时出现；讲评附完整题干、选项与解释。

## 6. 官方参考

- [S3 加密概述](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingEncryption.html)
- [SSE-KMS：权限与信封加密流程](https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html)
- [KMS 密钥策略](https://docs.aws.amazon.com/kms/latest/developerguide/key-policies.html)
- [ACM 概述与区域要求](https://docs.aws.amazon.com/acm/latest/userguide/acm-overview.html)
- [CloudFront 的证书要求](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html)
- [ALB HTTPS 监听器](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-https-listener.html)
- [ALB 目标组协议](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/load-balancer-target-groups.html)
- [Secrets Manager 概述](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html)
- [Secrets Manager 凭证轮换](https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets.html)
- [Parameter Store 概述与对比](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html)
