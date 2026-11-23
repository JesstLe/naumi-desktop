# 真实供应商链路验收

模块与职责：基线c08735d，codex/account-models-real-20261123；仅新增显式运维验收脚本与证据，发现实际协议问题时最小修复。保留受管设置白名单和其他任务。
公共接口、依赖与状态：原Canvas真实账号API、原凭据reader、生产ImportedRegistry/AccountModelStore/accountModelServer、Desktop原身份和自动配置类、原生PiAiAdapter。独立loopback验收服务/SQLite；仅创建一小时到期、零积分、role=user的专属测试账号。原员工/全局默认授权不改。
实施状态：准备实际供应商最小文本调用，每个选定协议一条，不自动重发UNKNOWN；凭据留47服务器，账号Cookie只在隔离认证分区。代理仅把真实Canvas auth路径接入私有loopback部署，不记为公开HTTPS服务或正式安装包已上线。
验证、未完成与下一步：原12项baseline通过；真实链路结果、清理与回归随后追加。
