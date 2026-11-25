# 发版内置模型控制，替代后台账号模型下发

## 模块与职责

用户本轮明确改为随版本内置 URL、Key 和目录，更新覆盖模型配置，不再向后台进行模型权限校验或领取模型。起点 `b4eb6418d0c7fccf400b7fc943434cf27b04d96a`，独立 `codex/bundled-model-control-20261125`。功能负责人本切片；版本/CHANGELOG/安装包/公开 feed 归唯一发布 owner，下一版本由其固定主线构建。保留0.4.15的身份、导航与会话连续性修复，不做整个仓库 revert。

## 公共接口、依赖、状态和事务归属

- 扩展既有 embedded-models 崩溃恢复事务，正式 v2 `mode=bundled-release` 与旧 v1 temporary-test 分离。按版本包覆盖自有 provider 目录与凭据 refs，保留个人 refs、普通身份账号、企业业务、Session/Bot/任务。manifest/inventory hash 校验在消费资源前执行；失败恢复原字节，漂移保留待恢复状态。
- `bundled-models.js` 是本地配置服务，refresh 只返回内存目录，没有网络/租约/到期/后台请求。复用现有公开 PiAiAdapter、注册生命周期和附件/协议处理，wire id 仅在公开 provider API 的 `stream/streamSimple` 薄适配处转换；不复制执行器、不改依赖私有状态、不全局拦截 fetch。
- 保留原15选项及原opaque provider/model IDs，旧受管会话的已选项不失效。真实wire ID与Key来自私有构建输入，不把它们当UI名称；设置页继续复用既有名称/配置状态白名单。
- Desktop根据安装资源明确选择 bundled 模式：不调用账号模型 bootstrap，不把该服务传给local models bridge；启动子进程清旧账号模型token/config env，禁用原pi-ai普通配置adapter，再注册本地bundled adapter。普通身份登录和企业业务认证保持原路径。
- 原生BasicCompactionEngine依然拥有历史测量、事件与检查点。bundled本地目录沿用公开summarize hook，摘要预算限制到目标上限；无业务任务重放。旧历史、原请求头和UNKNOWN不清空。

## 构建/分发契约

正式构建必须显式提供 `NAUMI_BUNDLED_MODELS_FILE` 私有输入及 `NAUMI_BUNDLED_MODELS_ACK=release-bundled-20261125`；不接受缺输入时偷偷回云模式，旧trial/embedded/model-policy变量不能混用。manifest `edition=bundled-models`、`modelControl.mode=bundled`、`bundledModels.distribution=release-bundled`、真实记录 `personalCredentials=true`，不含accountModels。

正式publish需 `--ack-bundled-models`，验证明确模式、目录hash和选项数；仍需真实EXE四配置×Bot/线程/群聊、旧真EXE暖缓存升级、linked service、设置页白名单与完整installer hash。新门禁额外绑定内置资源hash、确切wire映射、0后台模型管理请求，不绕过既有门禁。测试仅用loopback替代endpoint和Key，不发付费请求；真实构建输入只在本机受保护位置，不提交public Git，不进入更新说明/验收日志。

## 本次实现与迁移状态

原503服务STAGE/freeze/candidate/ingress申请按用户新方向作废，不能因容量恢复自动继续。47旧3193兼容入口先保留，供未升级旧版使用，不停/删旧服务、数据、审计或UNKNOWN。该后台模型设计不再用于新客户端或后续功能建设；普通后台业务保留。

## 验证与未完成项

初始基线33/33。定向覆盖provider/key覆盖、每个失败边界恢复、漂移、正式模式发布guard、真实原生adapter直连与原ID保留、UI白名单。实际原生大历史+跨重启 cloud→bundled 接续及15原生目录验收结果随本目录证据更新；0真实供应商调用。

源码验证/整合不等于新安装包已发布；最后实际EXE/原账号隔离副本/更新源门禁由发布owner在唯一新包中完成，不重启原客户端或改原profile。本切片不回放旧UNKNOWN，也不承诺绕过上游网络故障。

## 集中验收记录（本地源码层）

- 原实现：`node --test --test-concurrency=2 desktop/tests/embedded-models.test.cjs tests/account-models.test.mjs tests/session-routing-identity.test.mjs`，33/33 PASS，exit0。
- 完整控制切片加发布guard：同上追加 `tests/bundled-model-control.test.mjs tests/model-picker-distribution.test.mjs`，50/50 PASS，exit0；随后补一项EXE夹具协议/目录绑定检查，纳入最终全仓。
- `node scripts/verify-session-model-recovery.mjs --bundled`：真实native Host四次启动，12 checks / 13 loopback requests / 1原生摘要 / 0 real supplier，exit0。原cloud选择跨重启后仍走同opaque选项直连，旧最新进度保留，无自动任务重放。
- `node scripts/verify-bundled-model-catalog.mjs`：私有输入pin绑定，实际PiAiAdapter目录15、image14、text-only1、0网络目录请求、0真实供应商请求，exit0。能力标记来自已封存目录，本轮不再做付费能力验证。
- EXE四配置×12场景仍是发布时强制门禁，代码复用原gate，新增精确15原生provider/model/name比较、bundled启动无cloud bootstrap、内置资源hash和wire验证/0后台请求回执；仅替换loopback URL/Key，保留包内原协议，不把OpenAI配置改成Anthropic以迁就夹具。
- 第一次全仓1179/1180，唯一失败为缺内置输入校验抢在非法target所有权校验前；修复guard顺序，原失败日志保留，未修改原target测试。修复后一次全仓1183/1183；最终增加的EXE夹具断言结果以最终回执为准。

## 交付与回滚

四工件固定在受保护本机目录 `E:/tmp/naumi-bundled-model-control-20261125/`：`MODIFIED_FILE.zip`（只含本切片源码，不含私有构建输入）、`DIFF_FILE.patch`、`VERIFICATION.txt`、`ROLLBACK.sh`。回滚脚本仅接受带任务marker的独立副本，逐文件CAS确认本次after hash后恢复基线原字节/移除本次新增文件；不对共享工作区或用户profile做reset/覆盖。`BASELINE_FILES.json`和`BASELINE_FILES.zip`保存基线与逐文件前后hash。副本恢复后再跑原33项，当前源包保持修改。

实现迭代计数：控制方式、正式构建门禁、原生历史接续，共3模块；再次fetch后origin/main仍为起点b4eb641，未混入其他工作。正式0.4.16安装包、真实0.4.15 EXE缓存升级和公开更新源由发布owner统一执行；本切片只交源码、门禁代码和本地证据，不冒称新版公开或用户已安装。

最终全仓：`node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs`，1184/1184 PASS、0 skipped、exit0（`FULL_FINAL.log`）。原guard失败和新语法调试证据保留在私有封存，不改写为首次全部成功。最终仓库仅提交源码、模块文档与紧凑通过回执；大EVENTS、首次调试和副本工件留受保护目录，不提交个人或凭据输入。
