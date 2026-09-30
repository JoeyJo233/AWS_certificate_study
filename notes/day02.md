# Day 02：IAM（身份与访问管理）

学习日期：2026-09-30

## 1. 身份与权限

| 概念 | 简单理解 |
|---|---|
| Root user（根用户） | 注册 AWS 账号时的最高控制身份，减少日常使用，保护好 MFA |
| IAM User（用户） | 独立身份，可配置密码或长期访问密钥；名字叫 admin 不代表是根用户 |
| IAM Group（用户组） | 给多个 IAM 用户统一授权；角色不加入用户组 |
| IAM Role（角色） | 人或应用可以获准使用的身份，使用时获得临时凭证 |
| Policy（策略） | 规定允许或拒绝哪些操作、针对哪些资源 |

- 人可以使用 User，也可以通过公司统一登录获得角色权限。
- EC2（云服务器）上的应用访问 AWS，优先使用 Role，避免把长期密钥写进代码。
- **角色可以长期存在，临时的是 Credential（凭证）。** 正确配置的 AWS SDK（开发工具包）通常自动获取和更新临时凭证，网站可以持续运行。
- Switch role（切换角色）后，当前请求使用角色权限，不叠加用户原来的权限；退出后回到原身份。

## 2. 角色的两类策略

| 策略 | 回答的问题 | 例子 |
|---|---|---|
| Trust policy（信任策略） | 谁可以使用这个角色？ | 允许 EC2 服务承担角色 |
| Permissions policy（权限策略） | 使用后可以做什么？ | 允许读取指定 S3 图片 |

**口诀：换谁来用，看信任策略；改变能做什么，看权限策略。** JSON（数据格式）只是书写格式。

允许 EC2 使用角色的信任策略示例：

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "ec2.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
```

- Principal（主体）：谁可以使用；sts:AssumeRole（承担角色）：获得角色的临时凭证。
- 实际使用还需完成 EC2 的角色配置；人员承担角色也要满足相关授权条件。

## 3. 看懂权限策略

只允许读取商品图片的策略示例：

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::shop-images/products/*"
  }]
}
```

- Effect（效果）：Allow（允许）或 Deny（拒绝）。
- Action（操作）：能做什么；Resource（资源）：对哪里做。
- ARN（资源标识符）要保留桶名：`shop-images/products/*` 是指定桶内的对象范围；`arn:aws:s3:::products/*` 则指向另一个名为 products 的桶。
- Version（版本）是策略语言版本，不是创建日期。

| 操作 | 含义 |
|---|---|
| s3:GetObject | 读取对象 |
| s3:PutObject | 上传或写入对象，写入同名对象可能覆盖原内容 |
| s3:DeleteObject | 删除对象 |
| s3:ListBucket | 列出桶内对象，不代表能读取内容 |

- 已知完整 Key（对象键）并读取文件，通常不需要额外授予 ListBucket。
- 同时读取和上传：`"Action": ["s3:GetObject", "s3:PutObject"]`；只替换成 PutObject 会去掉这条策略的读取授权。

## 4. 权限判断与安全原则

- Least privilege（最小权限）：只授予必要操作和必要资源范围。
- 多个组授予的权限可以汇集到用户，但仍受其他适用限制约束。
- **Explicit deny（显式拒绝）优先于 Allow；没有有效允许时，默认拒绝。**
- 拒绝只影响匹配的请求：拒绝上传不等于拒绝读取。
- MFA（多因素认证）增强 Authentication（身份认证），不会自动增加 Authorization（授权）。
- 应用被攻破后，只读角色限制删除和上传，但可读数据仍可能泄露。

## 5. 网络与权限是两个条件

- Connectivity（连通性）：请求到得了吗？Authorization（授权）：准许操作吗？两者都要满足。
- 普通 S3（对象存储）存储桶不在你的 VPC（虚拟私有云）或 Subnet（子网）里，无需把 EC2 和桶放进同一个网络。
- EC2 可通过公共服务端点或 S3 Gateway endpoint（网关端点）访问 S3；公共端点不等于文件公开。

```text
EC2 上的应用
  → 使用获准承担的 Role，获取临时凭证
  → 通过可用网络路径请求 S3
  → 按适用策略检查是否允许读取指定对象
```

## 学习记录

- 核心理论完成；巩固测验 5/5。
- 重点纠正：角色不是只能短期使用；桶名与对象前缀不同；信任策略和权限策略各管一件事。
- 待完成：在控制台观察一个角色的信任策略和权限策略，画出 EC2 → Role → S3 的访问关系。

## 官方参考

- [IAM 安全最佳实践](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [IAM 角色](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles.html)
- [策略评估逻辑](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_evaluation-logic.html)
