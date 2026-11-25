# 其他用户反馈：模型切换后任务进度不连续

## 模块与职责
本线程只调查原生模型切换与上下文传递，新增可重复的隔离验收脚本。基线main `2b965aa941d343a665f3c2b3bc4eaa79ea214422`，分支 `codex/model-switch-continuity-20261125`。不访问或修改对方未知会话，不更改模型、供应商或47授权，不改产品提示词来掩盖未经复现的问题。

## 公共接口、依赖方向、数据/状态/事务归属
- 使用原 `session/selectModel`、`session/prompt`、`session/wait`、Session持久化、AgentLoop、PiAiAdapter。
- 原生 `AgentModel.select` 只追加 `model/selection`；请求构建从当前 `session.deriveMessages()`取消息，而不是按模型分别取历史。
- 普通自定义模型和后台受管模型分别验证；供应商是loopback SSE fixture，回复只证明收到指定文本，不代表真实模型理解或任务执行效果。
- 新增脚本不纳入客户端runtime，不改生产执行链或持久会话。

## 本次实现与迁移状态
新增 `scripts/verify-model-switch-continuity.mjs`，创建独立Host与虚构会话，检查A旧任务→B新任务→A继续→第三协议→另一会话→Host重启。检查请求体是否确含B最新用户任务与B回复，同时验证另一会话不串入。每次结束销毁自己的Host/临时工作区；0真实模型调用、0共享服务写入。

## 验证命令、结果及证据层级
- `node scripts/verify-model-switch-continuity.mjs`：普通配置路径10项通过，两个Host启动，8次fixture请求。
- `node scripts/verify-model-switch-continuity.mjs --managed`：后台受管路径10项通过，两个Host启动，8次fixture请求。
- 三种实际协议序列化均有最新任务；切回A包括B的回复；跨会话和重启检查通过。
- 初版fixture把 `/v1/messages?beta=true`误判为非Messages路径，返回错误格式，导致B没有成功回复。对应首次失败保留；修正的是测试服务URL判断，不是产品代码，也不记为用户问题的复现或修复。
- 稳定脚本对wire trace中的原生系统提示长文本做省略；只归档虚构任务标记、实际请求hash及存在性检查，不归档对方用户会话。

## 未完成项与下一步
这两条隔离路径没有复现“按模型回退到旧任务”。截图是其他用户反馈，缺少该用户切换前后的原始Session/版本/请求回执；原因仍未确定。不能据此说对方没有问题，也不能把fixture回复当真实模型验证。

后续以该用户会话导出或经用户同意的脱敏诊断包核对：实际Session ID是否相同、最新事件是否在surface、是否有压缩检查点、切换后wire是否含最新消息、模型响应是否忽略了已传入内容。只有取得证据后才改对应层；不清空历史、不强制压缩、不重发真实任务。

当前只交付回归诊断与调查记录，不发新的“已修复”安装包，不重启本机或47服务。功能迭代计数0。
