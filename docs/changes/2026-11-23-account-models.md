# 账号模型自动配置

模块与职责：基线c34e034ce2d5eb31baea3c492e61ad43475af0a5，codex/account-models-20261123。复用Canvas账号、既有服务端凭据库与模型来源；实现默认/账号授权、原协议网关、Desktop登录自动接入。功能模块3（授权/代理、桌面接入、后台管理），完成后fetch origin/main仍为c34e034，无其他主线增量。

公共接口、依赖与状态：服务端SQLite拥有grant/default policy/CAS/revision/短租约hash/request receipt/audit；原Canvas模块仍拥有身份、管理员、加密Key及供应商来源。market/auth从原server抽出纯模块，仅增加可选typed subject返回，避免打包时触发原市场进程入口；旧默认接口和行为保持。Desktop复用原Chromium身份分区及本地受保护bridge，只内存持有5分钟账号/独立设备凭证，60秒刷新；原生PiAiAdapter和选择器处理协议与交互。

实现与迁移状态：默认模型模板一次设置，账号登录自动继承；指定账号覆盖/禁用优先。只读原加密凭据，三种原协议固定路由/固定endpoint代理，无上游Key下发。已进入受管模式后不回落内嵌或BYO；原配置/凭据保留但启动覆盖层禁用本地pi-ai路由。已运行旧非受管backend要求正常退出再启，不自动杀任务。新服务初始默认策略关闭，生产授权未自动开启。部署说明见services/account-models/README.md。

验证命令、结果与证据层级：
- node --test tests/*.test.mjs desktop/tests/*.test.cjs：1123/1123，exit0，本地全仓回归。
- 新模块12项覆盖默认继承/逐账号覆盖、CAS/幂等、账号/设备隔离、撤销/过期/时钟、原生三协议真实loopback、原生Cordis LLM登记/派发、bridge、进程重启UNKNOWN与0重复调用。
- node scripts/verify-account-model-admin.mjs：8项实际Chrome操作，真实SQLite默认授权/账号禁用，pageerrors0；认证边界为明确fixture，非生产管理员登录。图片已打开检查。
- node scripts/prepare-account-models.mjs + verify-account-model-service：独立无node_modules bundle启动、HTTP200、未登录admin401，0模型调用。复用原credential reader，CONTRACT_PIN固定原源码5aac42a2和bundle hash。
- 47只读实际检查：38来源条目中36条参数完整、2条容量缺项；36次原凭据解密核验，Anthropic/Responses原协议保持；0模型调用/0授权修改/原容器StartedAt保持。不将凭据可读与付费供应商可用混淆。缺input仅继承原来源modality=text；不按名称开启image。初次两次失败CAPABILITY_REQUIRED/CAPACITY_REQUIRED均保留；随后隔离缺容量条目并在管理页显示待补全数量，不让缺项阻断其他36条。
- 全仓首轮2失败：独立树缺CUA离线资产、旧update-gate VM fixture未提供新增accountModels在途服务；复制并校验原pin资产，补fixture和在途断言后全仓通过。Anthropic SSE夹具缺event字段与Cordis fixture返回非法effect的早期失败保留，不作为已通过。打包依赖闭包/市场入口副作用失败亦保留，最终真正无node_modules独立进程通过。

未完成项与下一步：47新服务HTTP入口只读仍404；本轮未执行生产写入、未设任何真实账号/默认授权、未轮换密钥、未重启既有服务、未发布新Desktop安装包。完整上线还需固定main服务部署、管理员选择默认模型、两条容量补全或保持不授权、包含本提交的新包与真实账号验收。旧0.4.10安装包不含本功能，不能声称登录即已在线启用。企业M4预算/计费和组织模块不改，本模块stream_complete不是结算证明。
