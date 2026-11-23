# 内置钉钉CLI与旧链接服务接续

模块与职责：基线 cb732b72e39caf57508751e59a4d5dda8025c986；独立 codex/dingtalk-cli-linked-20261123，D:/NaumiBuild/dingtalk-cli-linked。复用既有官方 dingtalk-workspace-cli 1.0.68 pin/离线打包/账号目录/naumi-dingtalk skill，不另写业务执行器、不增加UI、不自动登录。

公共接口、依赖与状态：Desktop backendEnvironment 负责把固定应用bundle的bin/Node前置PATH；受管NAUMI_DINGTALK_MANIFEST只定位经过既有版本/二进制hash/许可证核验的manifest。插件健康探测复用resolveDingTalk；launcher仍用固定bundle，账号状态只在各自DSH_HOME/integrations/dingtalk，资源自解压仍在个人runtime缓存。原生shell及审批生命周期不改。

本次实现与迁移：0.4.11已实际内置CLI，但旧backend-link根目录缺bin/dws.cmd、runtime launcher及dingtalk npm包，原backend PATH只前置旧root，技能存在却找不到命令，健康探测也只从旧profile解析模块。现链接服务从本次应用releaseRoot使用工具，不热补旧checkout、不迁移/复制个人钉钉登录态。普通内置服务保持原行为，非受管开发服务不继承外来manifest override。功能切片计数1。

验证命令、结果与证据层级：待集中模块/真实CLI/真实Harness技能/完整包发布验收后追加。实际已安装0.4.11仅只读检查；未重启3080或登录/发送钉钉。

未完成项与下一步：集中验证后固定main构建0.4.12并按既有默认发布更新源。CLI已内置不代表员工已登录或远端企业权限有效；真实钉钉账号授权和业务操作由员工明确发起。证据根D:/NaumiReleases/0.4.12。

集中验收：node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs，1136/1136 PASS exit0。真实固定CLI在完全没有dws的旧root中经新PATH执行--version/auth status readonly/业务schema，版本1.0.68、未登录、schema JSON、资源vendor目录及exe hash不变；实际新resolver健康探测installed/healthy=true、authorized=false、networkVerified=false。两次早期schema参数/叶路径失败保留CLI_SCHEMA_FAILURES.txt，修正测试命令后通过，不将其记作真实业务调用。

基线实际cmd找不到dws；修改后真实命令成功；独立源文件副本回滚后再次找不到dws，原始hash恢复，实际MODIFIED_FILE保持修改，三项回放命令均exit0。证据D:/NaumiReleases/0.4.12。发布门禁已扩展：四种真实打包EXE配置均从实际asar抽取环境helper执行固定CLI，并通过原生skills/list确认naumi-dingtalk；与本次安装器hash绑定，缺CLI/Skill回执阻止发布。
