# 真实供应商链路验收

模块与职责：基线c08735d1f8a6600c3614757ed21334d9d7687c98，codex/account-models-real-20261123；新增显式运维验收脚本，最小修复客户端时钟偏差与服务端SSE收口。保留受管设置白名单及其他任务。

公共接口、依赖与状态归属：复用原Canvas真实auth API、原凭据reader/hashPassword、ImportedRegistry/AccountModelStore/accountModelServer、Desktop IdentityRuntime/AccountModelsSession、Chromium Session与原生PiAiAdapter。47仅启动独立临时服务/SQLite，不部署公网入口、不改全局授权。临时账号一小时到期、零积分、role=user，仅用于此次验证；清理由email+原password hash+note+role+零积分精确CAS删除。API Key一直在47，客户端只使用短期账号凭证。

本次实现与迁移状态：
1. 实测47时钟比本机快约4秒，旧客户端1秒未来容差拒绝正常5分钟凭证。上限改为5分钟+60秒设备时钟容差；网关仍按服务端原精确5分钟TTL校验，不延长云侧授权。超出容差仍拒绝。
2. 网关旧实现收到协议终止帧仍等待socket EOF。新增协议终止检查，按SSE完整帧/CRLF/分块解析，只在对应协议的[DONE]/response.completed/message_stop后结束并取消本次上游读取；无终止帧/错误帧保持UNKNOWN，不伪造结束。原生SDK、请求/工具转换与账务语义不改。原GPT运行没有保存原始供应商帧，不将该项代码修复冒充已证明GPT上游终止帧正常。
3. 显式运维脚本仅在--run-real-suppliers时运行。严格SSH pin、既有三锁（最多等待20秒，不抢锁）、新nonce/UUID、独立私有容器接口，经本机SSH loopback接入；临时Electron无用户窗口，真实Chromium登录/Cookie生命周期。loopback auth转发仅作隔离部署适配，Canvas密码验证/签名/账号停用校验均为真实接口；不记为正式公网/安装包上线。

验证命令、结果与证据层级：
- 原模块baseline12/12通过。新行为测试运行于原产品副本：clock偏差与keep-open终止测试均失败，exit1；修改后15项专项通过。
- node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs：1132/1132，exit0。整合最新主线后另记INTEGRATED_FULL.log。
- 实际47+实际账号+实际供应商，接受运行e9163a82-615e-4a73-83b2-7f836a9e5423：DeepSeek配置通道1100ms、finish=stop，完整返回随机口令NAUMI_OK_d4f1f2f4ea0e；供应商报告input52/output25/total77，不冒充财务结算。该轮上游派发1；原UUID重提409、撤销后新请求403、注销后bootstrap拒绝均通过，上游次数保持1。原凭据/模型注册表/计费版本、容器启动时间与Nginx hash保持。
- GPT通道没有通过：bafe0539原请求拿到校验口令但90秒aborted，ledger UNKNOWN；代码修复后以新nonce/UUID做独立验证d18001b0，连接结果UNKNOWN。两个原请求均保留，不重放、不改写为成功或退款。
- 共4次真实上游派发（DeepSeek2、GPT2），四个UUID各不相同；不是全部38项逐一调用。临时账号创建/删除6个；锁忙3次仅准入、无账号/供应商调用。首次Docker网络隧道、Electron VM require夹具、时钟校验失败均保留。
- 原始run.source记录基础SHA，不是声称未提交修复不存在；实际服务器bundle SHA与本机修复文件hash由SUMMARY.json和本任务manifest绑定。

主线同步：功能187053d后整合origin/main ce95947及ff13ec7，保留0.4.11设置页/截图分发验证修正（只涉及对方文档及verify-model-picker-distribution）。本任务仅2个产品修复模块，不修改版本/安装器或发布既有包。

未完成项与下一步：GPT通道仍需单独供应商连通/结束语义核对，保留UNKNOWN原回执，不盲重试。完整服务部署、真实员工授权、安装包构建/安装与公网HTTPS入口验收未执行。本轮为私有隔离部署中的真实供应商闭环，不替代正式员工安装验收。生产默认授权和企业模块保持现状。
