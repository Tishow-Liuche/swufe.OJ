# Codeforces 全自动提交闭环设计

## 目标

用户在西财 OJ 题目页提交 Codeforces 题目后，无需在 Codeforces 页面进行任何操作。系统自动打开 Codeforces 提交页、选择语言、填写代码、提交、识别对应的 Codeforces Submission ID（SID）、回传 OJ 后端并关闭 Codeforces 标签页。原 OJ 页面持续轮询并展示最终判题结果。

## 成功标准

- 一次 OJ 提交最多产生一次 Codeforces 提交。
- OJ 创建远程任务后立即开始轮询，并能展示 QUEUING、JUDGING 和最终状态。
- Codeforces 页面完成自动填表和自动提交，不要求用户点击 Submit。
- 辅助脚本精确识别本次提交的 SID，并成功回传后端。
- SID 回传成功后才允许自动关闭 Codeforces 标签页。
- OJ 最终显示 AC、WA、TLE、MLE、RE、CE、SYSTEM_ERROR 或 REMOTE_ERROR。
- 登录失效、Cloudflare 验证、弹窗拦截、页面结构变化和网络失败都有明确提示及安全恢复路径。
- 前后端构建通过，新增核心行为有自动化测试覆盖。

## 约束

- Codeforces HTML 页面受 Cloudflare 保护，服务端直接登录和提交不作为主链路。
- Codeforces 公共 API 可由后端查询，用于 SID 对应的判题状态同步。
- 自动化依赖用户在浏览器中安装并启用 Tampermonkey 脚本，并已登录 Codeforces。
- Codeforces 标签页必须由 OJ 页面通过 `window.open` 创建，浏览器才允许脚本调用 `window.close`。
- 不在前端或辅助脚本中传输、展示 Codeforces 密码。

## 总体架构

采用 Tampermonkey 浏览器自动化作为提交执行端，OJ 后端作为任务真相源，Codeforces 公共 API 作为判题结果来源。

```text
ProblemDetail.vue
  -> POST /api/submissions
  -> 创建 Submission + RemoteSubmissionTask + RemoteJudgeJob
  -> window.open(cfSubmitUrl)
  -> 轮询 GET /api/submissions/:id

cf-helper.user.js
  -> lookup 获取任务、语言和源码
  -> 等待 CF 登录态和提交表单就绪
  -> 填语言与源码
  -> 获取一次性提交租约
  -> 自动点击 Submit
  -> 在状态页按题号、时间和用户精确识别 SID
  -> POST report-sid
  -> 收到确认后 window.close()

OJ Backend
  -> report-sid 原子绑定 SID
  -> 查询 CF API 并更新 Submission
  -> CfWorker 对 TESTING 状态继续轮询
  -> OJ 页面显示最终结果
```

## 前端行为

`ProblemDetail.vue` 在收到 `mode=CODEFORCES` 和 `cfSubmitUrl` 后：

1. 保存 submissionId 并立即开始轮询。
2. 同步调用 `window.open` 打开新标签页，避免异步调用触发浏览器弹窗拦截。
3. 若打开失败，展示可点击的“继续 Codeforces 自动提交”按钮；点击不会创建新的 OJ Submission，仅重新打开现有任务 URL。
4. 弹窗说明改为“正在自动提交”，展示当前阶段和故障恢复入口，不再要求复制粘贴或手动点击 Submit。
5. 轮询最终状态后停止定时器并展示分数、耗时、内存和状态。
6. 将模板中的 `window`、`navigator`、`location` 访问封装到脚本函数中，恢复 Vue TypeScript 构建。

## Tampermonkey 状态机

脚本按以下状态推进：

```text
WAIT_PAGE -> WAIT_LOGIN -> LOOKUP_TASK -> FILL_FORM
          -> ACQUIRE_LEASE -> SUBMITTING -> FIND_SID
          -> REPORT_SID -> CLOSE
```

- `WAIT_PAGE`：等待 Cloudflare 页面消失且真实提交表单出现。
- `WAIT_LOGIN`：确认页面存在登录用户标识；未登录时停止并显示操作提示。
- `LOOKUP_TASK`：按 contestId/index 查询后端待提交任务。
- `FILL_FORM`：设置语言并写入源码，随后读取表单验证值确实生效。
- `ACQUIRE_LEASE`：向后端申请一次性提交租约。只有租约持有者可以点击 Submit。
- `SUBMITTING`：记录 submissionId、题号、提交时间和随机 nonce，然后触发一次 Submit。
- `FIND_SID`：在跳转后的状态页通过当前 CF handle、题号、时间窗口和最新提交列表识别 SID；允许 SID 处于 TESTING。
- `REPORT_SID`：携带 SID 和任务标识回传；网络失败采用有上限的退避重试。
- `CLOSE`：仅在后端确认 SID 已绑定后清理本地状态并关闭标签页。

脚本刷新或重复执行时读取本地状态：已经进入 `SUBMITTING` 后不得再次点击 Submit，只能继续查找或回传 SID。

## 后端接口与一致性

保留现有 lookup 和 report-sid 端点，并增强为明确状态协议：

- lookup 只返回当前题号下仍有效、未绑定 SID 的任务，不返回凭据。
- 增加原子租约操作，记录 lease nonce、租约时间和提交阶段，防止多个 CF 标签页重复执行。
- report-sid 校验任务存在、平台正确、SID 格式正确且未被其他任务占用。
- 同一任务重复回传同一 SID 返回成功，实现幂等。
- 同一任务回传不同 SID 或 SID 已绑定其他任务时返回冲突，不覆盖既有绑定。
- SID 绑定与远程任务状态更新在数据库事务中完成。
- report-sid 完成绑定后立即查询一次 CF API；若仍为 TESTING，则由后台 Worker 继续轮询。
- 达到 TTL、最大查询次数或确定性错误时，将 Submission 更新为 REMOTE_ERROR，避免 OJ 永久停在 QUEUING。

## SID 精确匹配

SID 匹配优先级：

1. 状态页或 Codeforces API 中与当前 handle、contestId、problem index、提交时间相符的最新记录。
2. 时间窗口只覆盖本次自动点击前后的小范围，拒绝过旧记录。
3. 找到 SID 后由后端进行唯一性校验；后端绑定结果是最终权威。

后端不再将仅凭题号和宽时间窗口猜测到的提交视为最终完成。只有确认 SID 后才写入最终 judgedAt 并完成任务。

## 错误处理与恢复

- **弹窗被拦截**：OJ 保留任务，显示继续按钮。
- **未安装脚本**：OJ 轮询期间显示安装入口和检测提示，不创建重复任务。
- **CF 未登录**：CF 标签页不提交、不关闭，显示登录提示；登录后可刷新继续原任务。
- **Cloudflare 验证**：在限定时间内等待；超时后保留页面并提示重试。
- **表单结构变化**：读取回验失败时禁止点击 Submit，并输出带版本号的诊断日志。
- **网络或后端暂时不可用**：SID 和任务状态保存在 GM 存储中，退避重试回传。
- **SID 长时间未出现**：不重复提交；显示错误并允许继续查找。
- **标签页无法关闭**：显示“结果已回传，可安全关闭本页”，不影响 OJ 获取结果。
- **OJ 页面刷新**：可通过 submissionId 继续查看，后端任务不依赖原页面存活。

## 安全要求

- 移除或禁用向前端返回 Codeforces 账号密码的 credentials 接口。
- lookup、租约和任务查询要求 OJ 身份认证；Tampermonkey 使用短时、单任务 token，而不是长期 JWT 或 CF 密码。
- 单任务 token 只允许读取对应任务、申请租约和回传 SID，并设置短 TTL。
- 源码只向对应的短时任务 token 返回。
- 所有跨域端点限制允许的方法、来源和字段，并对 lookup、租约、report-sid 做频率限制。
- 日志不记录源码、密码、JWT 或完整任务 token。

## 测试策略

### 单元测试

- CF 题号解析与语言映射。
- 状态映射和终态判断。
- 租约申请、重复申请、过期接管和冲突处理。
- report-sid 首次绑定、幂等重放、不同 SID 冲突和 SID 占用冲突。
- 前端状态归类和轮询终止条件。
- Tampermonkey 状态机的重复执行不会产生第二次点击。

### 集成测试

- 创建 CF Submission 后生成三类关联记录。
- lookup 只返回符合条件的任务。
- SID 回传后立即更新或进入 Worker 轮询。
- 任务超时会落到 REMOTE_ERROR。

### 浏览器端验证

- 已登录 CF：自动填表、自动提交、回传并关闭。
- 未登录 CF：不提交且提示明确。
- 弹窗拦截：OJ 恢复按钮可继续同一任务。
- CF 返回 TESTING：标签页回传后关闭，OJ 后续显示最终结果。
- 网络短暂中断：恢复后只回传、不重复提交。

### 回归验证

- 后端 build、test、e2e。
- 前端 TypeScript build 和 Vite build。
- 本地题目提交链路不受 CF 分支修改影响。

## 不在本次范围

- 绕过 Codeforces Cloudflare 或验证码。
- 服务端模拟 Codeforces 登录作为主提交方式。
- 多 Codeforces 账号池。
- 无 Tampermonkey/扩展条件下的完全自动提交。

