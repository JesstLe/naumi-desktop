# Naumi 账号模型配置

## 产品行为
后台入口 `/admin/desktop-models`：默认模型配置一次保存，已登录的Naumi账号自动继承；指定账号可覆盖或禁用。默认策略初始关闭，不因为安装服务就授权所有用户。正式目录使用后台显示名称和不透明ID，真实协议和wire ID在服务端保留。

账号继续由Canvas原 `/api/auth/session` 验证；后台操作复用原 `/api/admin/login` 的localAuthed/nativeAdmin/passwordRequired判定，不创建第二套账号或管理员。管理员保存使用CAS revision和operationId幂等，默认与指定账号分别拥有版本；策略全局递增版本用于凭据防回退。

## 密钥、数据与执行归属
复用已导入47的 `app_supplier_source_snapshots`、`app_supplier_model_metadata`，以及原 `createCredentialReader`。API Key仍只在原加密凭据库；本模块不实现另一套加密，不改原密钥、积分或模型活动注册表。服务只读原PG，另用SQLite拥有授权、租约hash、审计和请求回执。生产连接应使用只读PG角色/默认只读事务，复用原SETTINGS_SECRET，通过容器受保护环境提供，不进入发布物。

服务端签发5分钟opaque凭证，绑定账号、每安装账号目录独立生成的设备ID、策略版本与目录指纹。SQLite只存token hash；Desktop仅内存保存token，公开目录与非敏感enrollment写入受保护账号目录。60秒刷新目录；每次新模型请求在网关核对当前授权。默认关闭、指定账号禁用、策略/来源变更即时拒绝旧凭证的新请求；Canvas停用账号在下一次续签拒绝，现存token最多5分钟。已有流不中途伪装撤销完成，最长受300秒请求时限约束。

按原生openai-completions/openai-responses/anthropic-messages转发，不转换协议或猜模型能力。只开放固定route+固定endpoint，客户端不能提供上游URL/Key。上游错误正文不回传。原生PiAiAdapter负责消息/工具/图片/思考序列化；自定义adapter登记只做目录和凭据薄适配。受管启动用原公开patch机制禁用本地pi-ai插件，不删除原配置/凭据；本次进程只登记账号模型。其他执行链、模型选择器位置与模型项呈现契约保持。

请求UUID先持久化后调用；任何重复UUID拒绝，不自动重放。断连/强杀未完成保留UNKNOWN；`stream_complete`只表示协议流完成，不表示财务结算。本切片不增加计费、企业预算或高可用承诺；原M4企业通道保持原状。

## 构建与部署输入
`node scripts/prepare-account-models.mjs <原Canvas契约源码目录>`：复用原只读凭据模块，固定source SHA/reader SHA/bundle SHA；`runtime/account-models-service`中为无凭据bundle、admin资产、Dockerfile与nginx增量。`node scripts/verify-account-model-service.mjs`启动实际独立bundle，检查HTTP/未登录拒绝。

服务环境：`NAUMI_IDENTITY_ORIGIN=https://47.105.59.142`、`DATABASE_URL`、原`SETTINGS_SECRET`、`NAUMI_ACCOUNT_MODEL_DATA=/data`、`HOST/PORT=127.0.0.1/3192`。容器部署使用独立持久目录与受保护env，不能把数据库URL/密钥写进Dockerfile或日志。Dockerfile的BASE_IMAGE必须固定可用Node24镜像；服务包已bundle pg，无需员工npm install。HTTPS站点增量包含本目录nginx-location.conf；发布固定main前检查既有三锁、nginx基线hash、旧容器StartedAt，失败只恢复自己的入口，保留SQLite。

本轮没有执行上述生产写入或发新安装包。47现有入口只读核对为404；只读注册表验收36条参数完整候选/2条容量缺项，36次凭据解密核验，0模型调用/0授权变更/原容器不变。不是36条供应商付费调用可用性已确认。缺容量条目由原后台资料模块补全后再授权，本模块不猜预算；来源声明为text但无input时只继承text，不擅自开启image。

## 客户端迁移与回退
新Desktop在原身份成功后、启动后台前bootstrap；新版首次登录也必须获得正式服务响应；404不再启用旧配置。旧分发物仍按其原逻辑运行，不能由新源码追溯改变。加入受管后禁止404/断网/撤销回落内嵌或个人密钥。已运行旧非受管backend拒绝静默复用，提示正常结束任务/退出再启动，不自动杀工作。旧0.4.10分发物尚不包含本功能；功能源码合并不能代替新包安装验收。

源码回滚仅在标记副本执行证据ROLLBACK.sh；不能以源码回滚恢复旧的员工授权或覆盖当前SQLite/PG。服务回退须保留已接受授权/审计/UNKNOWN，取消入口只影响云模型，新本地文件仍保留。当前不删除或轮换已分发测试包中的旧Key；正式切换后应在原供应商后台明确轮换。

## 2026-11-23 真实供应商补验
详见 docs/changes/2026-11-23-account-models-real.md 与 evidence/account-models-real/SUMMARY.json。真实DeepSeek账号闭环、重复409及撤销403通过；GPT两次独立请求仍为UNKNOWN，不重放。客户端支持60秒签发方时钟偏差，云侧5分钟TTL不变；网关在完整协议终止帧收口，不再等socket EOF。1132项回归通过。测试部署是私有隔离服务，尚未执行正式服务/安装包发布。

## 全账号接管切片
见 [2026-11-25 实施记录](../../docs/changes/2026-11-25-account-model-takeover.md)。标准分发拒绝内嵌凭据，正式PG只读权限与上游旧Key吊销分开验收。
