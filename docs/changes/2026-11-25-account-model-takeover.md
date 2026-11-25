# 47 全账号模型接管

## 模块与职责
- 本线程负责 Desktop/账号模型服务及发布；基线 `6471c6d974c9ddf232afec7e870cb66284d27366`，独立 `codex/account-models-takeover-20261125`。
- 文件范围：`services/account-models`、Desktop bootstrap/backend/升级迁移、打包/发布门禁、对应测试和操作脚本。中央 Web/Worker/原 UNKNOWN/监督生命周期继续归原 owner。

## 公共接口、依赖方向、数据/状态/事务归属
- 原 Canvas `/api/auth/session` 与 `/api/admin/login` 仍是认证权威。正式服务使用 `https://47.105.59.142`，保持默认 TLS 校验，不固定旧 Web 容器端口。
- PG 原 credential owner 负责校验、加密、写入和解密；服务使用单独只读 LOGIN，仅 SELECT 四表指定列。它不是 provider 行隔离；共享 SETTINGS_SECRET 的访问面必须如实保留，不能称新建独立密钥库。
- 独立 SQLite 拥有全账号默认、账号覆盖、授权审计、短凭证 hash、请求 UUID 与 UNKNOWN。新请求逐次校验当前策略，已有流不伪称中途撤销。现有账户停用在下一次续签生效，旧 token 最长五分钟。
- `CatalogRegistry` 用固定目录映射来源；客户端仅收到不透明模型 ID、显示名称、声明参数和本站网关地址。原协议和真正 wire ID 在网关边界才选择；别名不是底层型号/性能认证。

## 本次实现与迁移状态
1. 第一次登录也必须 bootstrap；404 不再返回 null。标准分发 manifest 标记账号服务必需，backend 再次校验；公开发布拒绝内嵌或试用凭据包。
2. 旧测试包自有 `NAUMI_EMBEDDED_TEST_*` 引用从活动配置和 `embedded-model-backups` 内定点退役。使用前向、持久、脱敏候选日志恢复中断，不新建带旧密钥的备份；个人 refs、其他配置和会话不动。失败/漂移阻止启动，不能回退内嵌。
3. 原 importer 的短命 operator 增加 `--existing-schema`：明确只校验 import 所需的对象/类型/约束，不修改整个模型 schema owner 的 readiness 缓存。仅该编译入口把原 credentials 的 schema-readiness 依赖薄适配为 import-only 只读预检，原密钥校验/加密/INSERT/reader 不变。其他模式仍走原初始化。
4. 四表导入 COMMIT 后 readback 失败记 `COMMITTED_VERIFY_PENDING`，保留 operation，仅进行只读 verify，不以异常等同未写入。
5. 供应商端旧 Key 的吊销不包含在 Nginx 入口事务中。旧包可提取的旧 Key 并不会因新包上线自动失效；升级接管与上游吊销是两件事。

## 验证命令、结果及证据层级
- 基线 `node --test --test-concurrency=2 tests/account-models.test.mjs desktop/tests/embedded-models.test.cjs`：23/23。
- 修改后定向（含原 importer 校验）：34/34。三协议、默认继承、单账号覆盖/撤销、断连 UNKNOWN/UUID 禁重放、无供应商抬头 DTO、别名服务端改写、升级退役和中断恢复均使用本地 fixture。
- `node scripts/verify-account-model-takeover-pg.mjs`：13 项真实隔离 PG 通过，0 生产写入/0 模型调用。原加密 importer、缺列/错类型/缺唯一约束、冲突零新增、幂等、提交后验证失败/verify、只读角色与精确自有行回滚。
- 独立 bundle 实际进程 health=200、未登录 admin=401。首次全仓缺少独立树的已固定 CUA 构建缓存，原样保留 `FULL_FIRST_MISSING_CACHE.log`；补入同 hash 缓存后集中复测：1145/1145 PASS。

## 未完成项与下一步
- 中央 owner 尚未开放远端准备/共享入口窗口；在固定制品、资源预算、精确 DB 和 Nginx allowlist 完成后分阶段申请。
- 正式 PG 导入/专用角色、后台默认启用、实际账号回执、HTTPS 接管、新包真实升级矩阵及更新源发布均待完成。不得把本地测试记为所有已分发客户端已接管。
- 所有远端证据、源代码整合、固定包发布和回滚证明在本记录后续更新；未经观察不标完成。

功能迭代：本切片 2 模块，尚未发布；同步 origin/main 保持基线。

## 正式 dedicated 管理认证补验
- 真实现存 native 会话在独立 Chromium 副本读取：session200、主体与原来源账号一致、固定 enterprise 一致、actor.owner=true；2026-11-25T04:32:45Z，无Cookie/成员明文输出。
- 正式 `/api/admin/login` 为404，是 dedicated 产品隔离，不是缺文件。因此正式模式改用明确部署allowlist：同一已有Cookie，fresh `/api/auth/session` + 固定 `/api/enterprise?enterpriseId=...`，同时要求精确来源主体、固定企业、`actor.owner===true`。普通用户bootstrap不要求owner。不修改中央模式/角色，不伪造nv_admin。
- 原平台密码模式保留给非dedicated受支持部署/原契约测试，正式requireRO模式必须提供native-owner配置。
- 认证/原通道集中19项通过：覆盖错主体、错企业、非owner、仅admin/管理标志、缺字段、字符串true、404/非JSON/超时/超大正文，均不授管理。
- 运行服务目录需因本认证修订重新固定；客户端3b1b05ca产物不包含该服务源码，原模型选择器升级矩阵继续独立验收。

## 正式上线与更新源交付（已观察）
- Desktop固定源 `3b1b05ca2ea620a00189c8285ce9a49bb385c7a8`；独立服务固定源 `37d34c691d2c40a0e3f78a17a73f89d01e6569e4`。后续提交仅部署guard/证据，不重写已固定制品。
- 准备阶段真实exit0：原credential owner新增四表各4行；原数据digest一致。专用RO角色实际无业务写权限/成员身份/自有表/schemaCREATE；独立sidecar与四项默认启用。未改原Web/Worker启动身份。
- 首轮ingress实际nginx-t/reload后读验收异常，原CAS回滚真实恢复完整旧闭包。保留FIRST_FAILED、中央独立封存以及原失败日志；不记首次发布成功。随后修正有限只读GET收敛与分阶段状态记录，第二窗口exit0，公网health200，匿名管理401。
- 第二窗口完整闭包 `1d20f9acc3972b81ee99df134ec3f533f1082d53ab38541956ca84ce426d1f6d`，原vhost仅增加批准include。中央owner独立闭窗，gateway pin重绑canonical2864→2865并恢复timer；中央原UNKNOWN/HOLD继续保留，并非中央监督整体PASS。
- 公网真实owner管理页面读取4项、目录/default/bootstrap200；真实0.4.14打包EXE使用原合法会话副本，客户端/服务均0.4.14、账号管理模式开启、设置DTO仅模型名/状态；0原用户配置写入/0重启原客户端。
- 授权CAS真实撤销及恢复：默认revision1→2关闭，原token新请求403/新bootstrap403，revision3恢复，fresh bootstrap4项。没有额外模型调用。
- 0.4.14实际安装器与EXE/ASAR/UI哈希绑定；4配置×12场景、真实旧0.4.13缓存升级及关联服务同步通过。本机fixture模型调用8，0真实供应商；此门禁不是原用户本机已安装。
- 包扫描45,672文件/881,758,109B：已知3个旧上游密钥0命中，personalCredentials=false，embedded资源不存在，accountModels.required=true。
- 更新源已公开发布 [v0.4.14](https://github.com/JesstLe/naumi-desktop/releases/tag/v0.4.14)，504,633,255B，SHA256 `4736150befcfd04efd305e89f937b59a0e8619bb48facfceca319162559f5de6`。匿名完整GET200且字节/hash一致。镜像当次429，原客户端默认GitHub回退实际成功；真实0.4.13检查更新到0.4.14并下载校验至ready，未点安装/未改原用户安装。
- 四项实际供应商测试经用户另行授权，每项一次/64输出token：`gpt6.1sol`与`claude opus5.5` marker匹配+native stop+服务stream_complete；`claude fable5.2`与`gpt6.1terra` native SERVER/error、服务unknown。共4 UUID，无自动重试/回放；不声称四通道全通过，不把UNKNOWN改成成功/退款。

## 最终保留边界
- 所有登录本实例服务的账号继承后台默认；指定账号禁用/覆盖可由固定来源所有者管理。已有0.4.13真实副本在本轮也已领取后台目录；更旧未包含bootstrap的包仍需升级。
- 已下载旧包中的上游密钥仍由原供应商决定失效。本轮未吊销/轮换共享上游凭据，不能宣称所有旧离线副本已失效；新包不再内嵌，升级会定点退役自有旧引用。
- 新版未自动覆盖用户正在使用的安装或重启其程序。中央原Worker UNKNOWN、完整生产容量、两条未知供应商回执不在本次成功状态内。
- 正式管理入口：`https://47.105.59.142/admin/desktop-models`，先使用原47所有者账号登录；不创建第二套管理员。
