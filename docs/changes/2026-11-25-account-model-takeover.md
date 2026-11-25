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
