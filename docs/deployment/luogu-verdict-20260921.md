# 洛谷结果误报修复（2026-09-21，Helper 1.8）

## 证据与原因

线上一条 P1001 提交被记为 AC / 0ms / 0KB，但保存的远端原文总状态仍为 Waiting。用户随后提供相同题目、提交时间和语言的截图，显示 Unaccepted / 0 分 / 40ms / 872KB，并报告最终为 WA。

旧脚本有两条独立的误判路径：`ACCEPTED` 子串匹配到 `Unaccepted`；全页面扫描优先选任意终态，测试点/隐藏内容中的 AC 可以盖过总状态 Waiting。等待指标的重试还会沿用旧状态。

## 修改

- 只读取 `.l-flex-info-row` 中“评测状态”的值，使用完整状态匹配，不再从全页面推断总结果。
- Unaccepted 只从当前记录 `.test-case .status` 中选择明确失败原因；没有明确原因时继续等，不默认 AC/WA。
- 指标取记录头部，分数取“评测分数”，不再把记录编号误作分数。
- 记录 ID 只取当前路由；题号必须匹配任务；ID 回传成功后才发最终结果，失败可重试。
- 每次等待指标/网络重试重新读取状态，Waiting 不会上报为终态。
- 后端要求已确认且相同的记录 ID、有效 token/lease、显式 Accepted 总状态；拒绝 Waiting/Unaccepted 却声称 AC。
- 绑定和结果写入均加事务条件更新，防止并发覆盖已终态记录。
- 安装页更新到洛谷脚本 1.8，CF/QOJ 脚本不变。

页面结构来自只读核对洛谷公开资源：

- `https://fecdn.luogu.com.cn/columba/columba~4da6587d708a8f52.js`（RecordShow）
- `https://fecdn.luogu.com.cn/columba/columba~8de03ed0deab1d05.js`（NormalPageLayout）

## 验证

- 后端：53 suites / 477 tests；Nest build 通过。
- 前端：25 suites / 73 tests。
- 浏览器：14 项结果采集测试、13 项已有语言选择测试通过。
- 安装页、脚本静态检查通过。
- `scripts/test-luogu-verdict-db.cjs`：真实 PostgreSQL 独立临时 schema，验证错误 AC 被拒、WA+指标写入、并发结果/记录绑定只成功一次、事务回滚；测试后删除专属 schema，不读写正式提交。
- 线上公开脚本、安装页与本地内容逐字节相同；健康检查通过。

没有在用户已登录的洛谷浏览器中实交代码；远端记录对未登录请求返回 401，未绕过登录。修复验证采用公开页面结构浏览器测试和真实隔离数据库测试。

## 发布与历史纠正

增量镜像 `swufe-oj:luogu-verdict-20260921`、`swufe-oj-caddy:luogu-verdict-20260921`。仅重新创建 backend，Caddy 不重启，教师判题隧道保持不变。前端静态文件同时原子替换；旧语言修复镜像保留作回滚。

仅对用户报告的单条提交作定点修正：以用户 WA 报告和匹配截图为依据，保存原状态备份后纠正为 WA / 0 分 / 40ms / 872KB；原回传证据保存在服务器私有备份，不提交用户数据或源码。没有对其他历史记录批量改判。

浏览器中已安装的 1.7 不会因服务器更新立即替换，需要通过安装页更新到 1.8。
