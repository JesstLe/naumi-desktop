# 模型网关连接超时与失败归因

## 模块与职责

独立 `codex/account-model-availability-20261125`，起点 `3d52c925e635a3851899f8ba8f24630ac24cbbde`。这是用户第四张截图 `503 ACCOUNT_MODEL_UNAVAILABLE` 的独立切片，不混入已固定的 0.4.15 客户端三项修复；不改客户端、版本、feed、catalog、授权或既有请求。

## 调研结论与证据边界

截图时间附近实际 Nginx 记录：bootstrap 为 200，模型 gateway 为 503；相应请求表保留 UNKNOWN。进程健康、原容器 ID/StartedAt/restarts 保持，配置服务不是整体离线。现 server 对普通 fetch 异常统一返回 ACCOUNT_MODEL_UNAVAILABLE 且没有阶段日志，因此旧请求的确切网络 cause 无法由现存记录反推。

只读、无凭据、无推理的 Host/容器诊断发现：同一上游 HEAD 间歇成功/超时；两个 IPv4 连接短时间握手超时，两个 IPv6 返回 ENETUNREACH；较长观察下默认 TLS 校验握手曾在 8699ms 成功。请求记录与 10 秒连接时限相符，但这是支持性证据，不把缺失的旧 cause 写成已证实。完整运维数据仅留本机保护证据，不提交上游来源/凭据/用户目录。

## 公共接口、依赖、状态/事务归属

- `upstream.mjs` 复用已固定于根 lock 的公开 undici 8.11.2 Agent + fetch，同一库版本组合；不把 undici8 Agent 混给 Node 内置 undici7 fetch。服务包显式 pin，prepare bundler 收入完整依赖。账号/模型/凭据读取模块保持原接口。
- 每个模型服务实例有独立 pool：connectTimeout 30 秒，4 连接、单连接单 in-flight、双栈快速尝试，headers/body 时限 300 秒；既有每个请求总时限仍为 300 秒。无 global dispatcher 变更、固定 IP、关闭证书验证、代理、跳转、替换上游、RetryAgent 或模型 POST 自动重发。
- `gatewayFailure` 只保留白名单 cause codes、服务内阶段、耗时和原请求 UUID。不记录 error.message/stack、URL、headers、prompt、模型 wire ID、账号或密钥。
- server 已接收的失败返回类型化 timeout/TLS/connection code 和 UUID；bootstrap/admission 的旧字符串 error 契约保留。请求回执仍由原 Store 独占，UNKNOWN/rejected 不改成功；重复 UUID 仍 409，诊断 sink 出错不改变回执。已发响应头的流失败销毁连接，不合成成功终止帧。
- 日志由宿主现有受保护日志驱动保存，部署前计入增长预算；本切片没有直接开启生产日志、改 logrotate 或迁移数据库。

## 实现与验证

- 原 account-models 15/15 PASS，包含真实 HTTP 断连重现原 503 和 UNKNOWN。
- 新/原集中 `node --test --test-concurrency=2 tests/account-models.test.mjs tests/account-model-availability.test.mjs`：22/22 PASS；再集中加入 owner-auth/stream/takeover/deploy-guards 后 31/31 PASS。覆盖 30 秒配置、不污染 global dispatcher、单次 dispatch、嵌套/循环错误白名单、timeout/TLS/reset/client abort、真实 HTTP 504+UUID、重复 409、rejected/UNKNOWN、日志失败和不完整流。
- `node scripts/verify-account-model-transport.mjs`：实际 loopback TLS 延迟 12 秒；默认连接预算报 UND_ERR_CONNECT_TIMEOUT，修改专用 pool TLS 校验通过返回 200；真实 POST 仅 1 次，无自动重试/真实供应商。fixture 专用 CA 只给该测试 Agent，不使用 rejectUnauthorized:false。
- `node scripts/prepare-account-models.mjs E:/Workspace/naumi-refactor-main-close-20261105`：完整 bundle 1354476B；原凭据 reader SHA 与既有正式包相等；不含凭据。`node scripts/verify-account-model-service.mjs`：实际子进程 health200、匿名 admin401、0 模型调用。
- 早期测试的证书 code 归类漏项、流在响应头前销毁的 fixture、混用 Node 内置 fetch/undici8 dispatcher 失败均保留，最终统一使用 undici 同版本 API，不掩盖首次失败。

## 未完成项与下一步

此提交是连接韧性与可观测性修复，不宣称旧 UNKNOWN 已恢复，也不以延长预算保证上游持续可用。生产仍运行原 bundle；上线必须从新固定源码准备完整 bundle、保持 catalog/SQLite/授权/请求兼容，通过独立候选就绪及串行入口窗后再自然 retire 旧进程。需刷新实际磁盘/增长预算、默认最新 revision、当前 UNKNOWN 和共享网关 pin；不沿用旧维护窗口、不覆写他人权限，不默认新增付费调用。

## 副本回滚与交付

五个产品/打包文件基线原字节 SHA、修改副本、差异与可执行副本回滚脚本已封存于 `E:/tmp/naumi-account-unavailable-20261125/`。独立标记副本完整还原，原 15/15 回归通过并保留 generic503/UNKNOWN/409 行为；修改树保持新配置。完整命令/输入/字面结果/exit 见 `evidence/account-model-availability/VERIFICATION.txt`。
