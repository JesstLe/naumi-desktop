# 桌面文件夹拖入路径桥接

模块与职责：基线1d09e99ea0e6583d5401282790ea59ee371dd597，独立codex/desktop-folder-drop-20261124，D:/NaumiBuild/desktop-folder-drop。仅preload最小路径契约、测试/发布门禁及0.4.13版本，不改导航、图标、输入器、权限或SDK原文件。

公共接口、依赖方向、数据归属：原生会话InputHub读取globalThis.__DSH_HOST_PATHS__.pathFor(File)。Electron preload通过contextBridge提供同步webUtils.getPathForFile(File)，只接受Chromium-backed File；无任意路径查询/读盘/IPC或目录遍历接口。原会话store仍负责引用、图片上传、草稿与提交。普通浏览器无此桥，保留原单文件上传/目录提示；未伪造desktop标识或改掉报错文本。

根因与实现：原Naumi preload只暴露naumiDesktop，没有上游原生输入器所需__DSH_HOST_PATHS__。因此桌面实际收到目录File仍判断bridge===undefined并返回浏览器提示。补原契约后，文件夹经原native引用管线加入；普通文件/图片继续原分支。普通会话、Bot、群聊共用原composer，未新增第二套拖放/编辑器。

验证与证据层级：真实Electron44/contextIsolation=true/sandbox=true，native file input与CDP原生文件夹drop均取得真实UTF8/空格路径；JS构造File和伪造path对象返回空字符串，日志ELECTRON_PATHS.log/JSON。集中全仓、真实完整包四配置×三场景folder/file drop门禁待执行后追加；安装包回执缺folderDrop则阻止发布。功能迭代1，证据D:/NaumiReleases/0.4.13。

未完成与下一步：固定main构建/实际包普通会话、Bot、群拖放与旧链接服务升级/发布；不重启或热补当前客户端。目录引用不等于给Agent新增文件读取权限，原生权限准入不变。

集中测试：node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs，1140/1140 PASS exit0；host-paths与发布门禁8项定向PASS。独立真实Electron native File input/CDP原生目录drop跨contextBridge成功，JS File及伪造path对象为空；不新增权限。实际完整包门禁同时覆盖四配置×三场景目录和普通文件拖入、保留已有草稿文字、清空无残留，并要求旧0.4.12实际包复现截图原错误后升级验证。源/真实Electron证明不替代最终完整包/发布证据。

最终验收：固定main 28d99119b3f62bf359ff226e183daf08dd67e210构建0.4.13完整包，npm build及真实EXE门禁exit0。旧0.4.12在实际CDP原生目录drop后出现截图同句提示，实时DOM断言通过；旧PNG未捕获瞬时toast，不以该图片冒充可见告警证据。新包固定截图FOLDER_DROP_FIXED.png已实际打开，目录带文件夹图标与尾斜线，普通文件引用及原草稿文字均正确。

四配置fresh/legacy-first/legacy-r2/linked-legacy×Bot/普通会话/群聊十二场景均通过目录+文件拖入、草稿保留/清空，已有模型选择/设置与钉钉CLI/Skill门禁继续通过，8次loopback模型请求、0真实供应商请求/页面错误/生产写入。真实Electron隔离/sandbox下原生File跨contextBridge路径与JS伪造输入拒绝通过。集中全仓1140/1140、定向8/8、完整包45673文件hash及客户端/服务版本/asar固定源/PE/feed9项全部通过。

发布：https://github.com/JesstLe/naumi-desktop/releases/tag/v0.4.13。安装器504632431bytes，SHA256 fa49e19789df58ed856c916a090dba1ecdc5d4f52e1f586bff7fb45741c05df0。GitHub tag/Latest固定构建SHA、实际匿名latest.yml HTTP200版本/完整字节/hash、资产digest/size与中性公开说明均一致。镜像本次429，直接GitHub源200，不泛化为全部镜像即刻可用。原已授权测试模型配置SHA不变，未新增配置迁移、未热补/安装/重启用户当前客户端或3080。

四件套及完整命令/输入/stdout/exit/原始与修改hash/副本恢复状态在D:/NaumiReleases/0.4.13。独立preload副本恢复原hash和误判分支，实际MODIFIED_FILE/源码及发布包仍保持修改。私人复制构建输入已移除，仅清理本任务隔离测试目录，未触碰用户库存统计目录或其他任务资源。
