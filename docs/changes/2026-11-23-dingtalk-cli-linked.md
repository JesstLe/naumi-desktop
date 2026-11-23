# 内置钉钉CLI与旧链接服务接续

模块与职责：基线 cb732b72e39caf57508751e59a4d5dda8025c986；独立 codex/dingtalk-cli-linked-20261123，D:/NaumiBuild/dingtalk-cli-linked。复用既有官方 dingtalk-workspace-cli 1.0.68 pin/离线打包/账号目录/naumi-dingtalk skill，不另写业务执行器、不增加UI、不自动登录。

公共接口、依赖与状态：Desktop backendEnvironment 负责把固定应用bundle的bin/Node前置PATH；受管NAUMI_DINGTALK_MANIFEST只定位经过既有版本/二进制hash/许可证核验的manifest。插件健康探测复用resolveDingTalk；launcher仍用固定bundle，账号状态只在各自DSH_HOME/integrations/dingtalk，资源自解压仍在个人runtime缓存。原生shell及审批生命周期不改。

本次实现与迁移：0.4.11已实际内置CLI，但旧backend-link根目录缺bin/dws.cmd、runtime launcher及dingtalk npm包，原backend PATH只前置旧root，技能存在却找不到命令，健康探测也只从旧profile解析模块。现链接服务从本次应用releaseRoot使用工具，不热补旧checkout、不迁移/复制个人钉钉登录态。普通内置服务保持原行为，非受管开发服务不继承外来manifest override。功能切片计数1。

验证命令、结果与证据层级：待集中模块/真实CLI/真实Harness技能/完整包发布验收后追加。实际已安装0.4.11仅只读检查；未重启3080或登录/发送钉钉。

未完成项与下一步：集中验证后固定main构建0.4.12并按既有默认发布更新源。CLI已内置不代表员工已登录或远端企业权限有效；真实钉钉账号授权和业务操作由员工明确发起。证据根D:/NaumiReleases/0.4.12。

集中验收：node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs，1136/1136 PASS exit0。真实固定CLI在完全没有dws的旧root中经新PATH执行--version/auth status readonly/业务schema，版本1.0.68、未登录、schema JSON、资源vendor目录及exe hash不变；实际新resolver健康探测installed/healthy=true、authorized=false、networkVerified=false。两次早期schema参数/叶路径失败保留CLI_SCHEMA_FAILURES.txt，修正测试命令后通过，不将其记作真实业务调用。

基线实际cmd找不到dws；修改后真实命令成功；独立源文件副本回滚后再次找不到dws，原始hash恢复，实际MODIFIED_FILE保持修改，三项回放命令均exit0。证据D:/NaumiReleases/0.4.12。发布门禁已扩展：四种真实打包EXE配置均从实际asar抽取环境helper执行固定CLI，并通过原生skills/list确认naumi-dingtalk；与本次安装器hash绑定，缺CLI/Skill回执阻止发布。

首个候选实际包（固定d87f3f2）门禁发现真实问题：CLI执行通过，但原生skills/list缺naumi-dingtalk，未发布，BUILD_FIRST.log/NATIVE_FIRST_FAILURE.json/FIRST_PACKAGE.json保留。原嵌套scope.plugin包装未产生可见技能贡献；改为复用filesystemSkills.apply公共安装函数，仍由原注入scope管理注册/销毁，不复制SDK技能实现。真实Harness新增测试确认与其他filesystem provider共存、完整skill body可读、卸载仅移除本模块，1/1通过。该修订需要完整重建，不把修正后的源码冒称已进入首包。

最终交付：固定main e85c9b0355e036ea0fce57a0d330925f8f0ce0a8完整重建0.4.12，npm build及实际EXE门禁exit0。45673运行文件hash、实际客户端/服务0.4.12、asar固定源、许可证/CLI pin及安装器/feed摘要9项全部通过。最终全仓1137/1137 PASS；真实Harness钉钉技能list/get/dispose与旁路provider共存1/1；实际Program Files空格路径的旧安装资源只读CLI验证通过，未修改原安装资源。

实际分发：四配置fresh/legacy-first/legacy-r2/linked-legacy均通过真实CLI版本1.0.68、auth readonly、业务schema、vendor目录及exe hash保持；原生Agent skills/list均可见naumi-dingtalk，四设置页及十二会话场景继续通过。8次loopback模型请求、0真实供应商推理；测试账号DingTalk未登录，不把安装/健康或技能登记当成真实业务授权。

发布：https://github.com/JesstLe/naumi-desktop/releases/tag/v0.4.12；安装器504632424bytes，SHA256 a6ec1f8cf1b32ca7a0cb2c8c91c35d6457d06160aecceab38c654990e4d835b5。已核对tag/Latest固定e85c9b0、公开匿名latest.yml HTTP200版本/完整字节/hash、官方资产digest/size与中性说明。镜像本次429，直接GitHub源200，不冒称所有镜像即时可用。原已授权测试模型内嵌配置SHA保持不变，未加入模型配置迁移；当前用户客户端/3080未安装或重启，未登录/发信/读取真实DingTalk业务数据。

稳定工件D:/NaumiReleases/0.4.12，四件套、完整首包失败记录与最终通过记录均保留。回滚仅恢复独立backend源文件副本的原hash与旧缺命令行为，实际修改源码/安装包保持改变。复制交付尚在进行时一次提前回放的MODULE_NOT_FOUND已记录REPLAY_READINESS.txt，交付完整后按新包重新回放三项均exit0。私人构建输入已移除，原包/原source及其他任务文件保留。
