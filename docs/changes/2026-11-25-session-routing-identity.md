# 会话身份、导航与受管模型切换修复

## 模块与职责

负责人：session-routing-identity 切片；发布仍由独立 Desktop 0.4.15 owner 统一构建。
独立分支 `codex/session-routing-identity-20261125`，起点 `d78db942e088c53a7e59bcb73e8af5808dfc8f75`；集中验证前整合 `19e83a3`。三个功能模块，集中测试一次；没有版本、安装器、更新源或生产服务改动。

## 公共接口、依赖方向、状态归属

- `agent-presentation.js` 只依赖原生公开 `systemPrompt.section/context/variable`、assemble waterfall、agent/pre-step 与 agent/request。注册按 Agent scope 生命周期清理；它只替换原生身份/应用上下文和 `source.kind=model-selection` 的系统生成通知，不修改用户原文、历史答案、源文件或实际路由。显示名称是产品选项，不是底层型号的独立认证。
- `context-recovery.js` 通过公开 `agentPresets.serviceFor(agent, 'compaction')` 取得该 Agent **实际保留的 preset revision** 中的隔离压缩器，才回落非 preset service。不能从 Agent 根 context 猜测子组服务；原实现的检测在标准 preset 下可能误建第二个压缩器。这次沿用该引擎公开 summarize 定制 hook，不触原型或私有 registry。
- `managed-compaction.js` 仅在原摘要路由已退出账号授权目录时，使用本 Session 当前所选且仍授权的路由生成摘要。授权原路由继续走原生逻辑。账号 refresh/严格 stream allowlist 仍是权限所有者；没有任意模型 fallback、放宽权限、重试或业务工具重放。
- 原生 `BasicCompactionEngine` 保有测量、范围选择、事件、持久检查点和错误收口；Session 原始历史/请求头不重写。输出预算取原策略与目标模型上限的较小值，记录实际摘要目标；失败、截断、撤权、取消不伪造成功。
- 原生摘要 helper 仅在依赖内部定义，package 未公开导出；因此薄适配只使用公开 `llm.stream` 与 `BlockAssembler` 拼接保留最新任务/进度/回执的 checkpoint 指令，不导入私有路径，不另造执行链。若 SDK 后续公开目标路由选择 hook，可删除本薄适配，保留原生回执验收。
- 任务 sourceSessionId 是来源证据，不转移普通线程所有权；Bot sidebar 只根据真实 target/已绑定目录分类。后台目录刷新和跨窗口 mode 偏好不导航。显式 Bot 点击在 await 前取得原生 navigation signal，较晚返回不得覆盖更新的原生导航。

## 本次实现与迁移状态

产品只新增两模块、host/package 注册、context-recovery 薄接线、两个 Bot assets。没有新输入器、新 Session、新消息数据库或数据迁移。旧会话保留，模型切换是同一 Session 接续而不是恢复另一个模型的历史分支。原生错误 `MODEL_SWITCH_COMPACTION_FAILED` 保留 code/cause，但用户可见消息不拼接内部路由编号。

## 验证命令、结果与证据层级

证据目录 `evidence/session-routing-identity/`；完整重开归档另见本任务 VERIFICATION.txt。

- 原实现四组定向：38/38 PASS；基线 Chrome 实际复现 `baseline_background_dispatch_forces_bot_mode`，0 模型调用。
- 原实现真实独立 Host/AgentLoop/Session/PiAiAdapter：大历史由 8 次 loopback 请求生成，重启受管配置后切模型，持久事件明确 `MODEL_SWITCH_COMPACTION_FAILED` + `ACCOUNT_MODEL_ROUTE_DENIED`，无新增供应商请求、无成功摘要。
- `node --test --test-concurrency=2 tests/session-routing-identity.test.mjs tests/account-models.test.mjs tests/context-recovery.test.mjs tests/naumi-thread-bot-separation.test.mjs tests/thread-team-visibility.test.mjs`：47/47 PASS。包含原生 SystemPrompt/notice、作用域清理、旧路由仍授权、刷新撤权、提供方失败、截断、取消、preset serviceFor 边界。
- `node scripts/verify-session-model-recovery.mjs`：9 checks / 2 次 Host 启动 / 11 loopback 请求（8 旧历史、1 原生摘要、2 接续）/ 0 真实供应商。新摘要和接续使用当前选择；切回保留最新任务。它证明原生传输/持久状态连续，不把固定响应说成真实模型理解效果。
- `node scripts/verify-session-navigation.mjs`：真实独立原生 React shell + Chrome 21 checks，覆盖后台 source 任务刷新、另一窗口 localStorage、晚返回目录、Bot/线程草稿隔离、原生搜索/列表/分组/刷新与群聊入口，0 模型调用。
- 全仓首次 1161/1162，唯一失败 `CUA_BUNDLE_MISSING`，是独立树缺既有离线依赖；从主仓核对官方固定 SHA 的同字节缓存复制后集中重测，最终 1165/1165 PASS（FULL.log）；末次非文本摘要 guard 定向 18/18 PASS。不改 CUA 引擎或 pin。
- 大历史夹具最初有 wait 输出窗口、boundary address 缺 kind、过小 context 与默认 headroom 冲突等失败，保留原始日志；最终 baseline 必须同时匹配两个错误 code，不用宽泛 compaction failure 代替路由拒绝。

## 未完成项与下一步

本切片不宣称截图中他人原会话已现场恢复；没有该会话导出，不清空/压缩/重发真实用户任务。最终安装包由发布 owner 从固定 main 重新构建并做真实 EXE 门禁，本切片本身不是已公开分发。

用户后补 `503 ACCOUNT_MODEL_UNAVAILABLE` 另建独立故障切片：需定位实际网关/续签故障，不自动重发原请求，不将错误中文化当作供应商恢复。前三问题的已验证修复不混入未经验证的第四项。

## 副本回滚与交付

七个产品文件原字节 SHA 已封存；标记副本 ROLLBACK.sh 还原 5 个旧文件并移除 2 个新增模块，38 回归通过，真实原生大历史基线再次 5 checks 复现原错误，修改版仍保持新行为。四工件位于 `E:/tmp/naumi-session-routing-identity-20261125/`，完整命令与 exit 见 `evidence/session-routing-identity/VERIFICATION.txt`。安装发布不在本提交内。
