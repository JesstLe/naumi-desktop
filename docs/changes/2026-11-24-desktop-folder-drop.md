# 桌面文件夹拖入路径桥接

模块与职责：基线1d09e99ea0e6583d5401282790ea59ee371dd597，独立codex/desktop-folder-drop-20261124，D:/NaumiBuild/desktop-folder-drop。仅preload最小路径契约、测试/发布门禁及0.4.13版本，不改导航、图标、输入器、权限或SDK原文件。

公共接口、依赖方向、数据归属：原生会话InputHub读取globalThis.__DSH_HOST_PATHS__.pathFor(File)。Electron preload通过contextBridge提供同步webUtils.getPathForFile(File)，只接受Chromium-backed File；无任意路径查询/读盘/IPC或目录遍历接口。原会话store仍负责引用、图片上传、草稿与提交。普通浏览器无此桥，保留原单文件上传/目录提示；未伪造desktop标识或改掉报错文本。

根因与实现：原Naumi preload只暴露naumiDesktop，没有上游原生输入器所需__DSH_HOST_PATHS__。因此桌面实际收到目录File仍判断bridge===undefined并返回浏览器提示。补原契约后，文件夹经原native引用管线加入；普通文件/图片继续原分支。普通会话、Bot、群聊共用原composer，未新增第二套拖放/编辑器。

验证与证据层级：真实Electron44/contextIsolation=true/sandbox=true，native file input与CDP原生文件夹drop均取得真实UTF8/空格路径；JS构造File和伪造path对象返回空字符串，日志ELECTRON_PATHS.log/JSON。集中全仓、真实完整包四配置×三场景folder/file drop门禁待执行后追加；安装包回执缺folderDrop则阻止发布。功能迭代1，证据D:/NaumiReleases/0.4.13。

未完成与下一步：固定main构建/实际包普通会话、Bot、群拖放与旧链接服务升级/发布；不重启或热补当前客户端。目录引用不等于给Agent新增文件读取权限，原生权限准入不变。

集中测试：node --test --test-concurrency=2 tests/*.test.mjs desktop/tests/*.test.cjs，1140/1140 PASS exit0；host-paths与发布门禁8项定向PASS。独立真实Electron native File input/CDP原生目录drop跨contextBridge成功，JS File及伪造path对象为空；不新增权限。实际完整包门禁同时覆盖四配置×三场景目录和普通文件拖入、保留已有草稿文字、清空无残留，并要求旧0.4.12实际包复现截图原错误后升级验证。源/真实Electron证明不替代最终完整包/发布证据。
