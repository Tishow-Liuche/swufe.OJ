# CF 题面补全与洛谷语言修复（2026-09-21）

## 题面补入

原 CF 题库 10,974 道：10,024 道已有正文，950 道只有元数据占位。本次补入 925 道，现有正文 10,949 道，仍有 25 道不可获取。题号、标题、难度、提交记录及原有正文均未改变。同步修正占位记录错误的时限单位，题目和版本两层限制一致。

CF 自动请求返回 403 验证页，因此使用洛谷公开镜像的 `content.locale=en` 英文原文（不是 `contenu` 中文翻译）。正文含公式、全部样例、提示及镜像署名。918 道直接核对来源 ID；另 7 道 CF802 改号题由官方 `contest.standings?contestId=802` 的精确题名与公开镜像旧索引核对，硬编码白名单，不做模糊题名匹配，不改当前来源 ID。

公开补充文件：`data/codeforces-statements-supplement-20260921.json`（925 道原文及来源、25 道失败清单；不含账号、凭据、用户代码或测试数据）。

当前不可获取（洛谷 401/404，CF 原站自动请求验证受阻，本地原始文件亦缺失）：

```
2095D 2095A 2073L 2073J 2073A 1952A
1938J 1938H 1938G 1938E 1938C 1812A 1773K 1663A
1532A 1510G 1351B 1351A 1331A 1267A
1090L 1090K 1090I 1090B 1089E
```

不得宣称这 25 道已补全，也不使用错误页或猜测文本替代。

## 洛谷脚本 1.7

根因：旧脚本扫描整页 div/span 等汇总文本，可能误点含 C++ 字样的祖先节点；选语言失败仍继续提交；打开面板的辅助函数也会误点提交按钮。

修复：匹配真实语言控件与下拉选项，区分 C/C++/Python/Java；支持当前公开 Columba LCombo 的传送弹层；等待所选语言反馈，并在真正提交前再次核对。无法确认时停止。安装页面 URL 更新至 1.7。

线上原先缺少 `/api/luogu-submit-helper/:id/report-blocked`，已补上：严格验证已保存 token 和 lease、限制失败码、事务内检查任务/提交仍未完成且没有远端 ID，写入 REMOTE_ERROR 及可读原因并结束排队。不得覆盖已通过或已绑定远端记录的提交。

## 验证与发布

- 后端全量 53 suites / 469 tests、Nest 构建通过；前端全量 25 suites / 73 tests 通过。
- CF 修复纯测试 6 项：身份、公式样例、白名单改号、单位、保留旧正文、重复运行。
- 真实 PostgreSQL 临时 schema：备份碰撞、数据漂移、事务前元数据修改拦截、版本限制、标题/难度/元数据保留、重复运行零修改。
- 独立逐题复查全部 10,974 道 CF：恰好补入 925 道，已有正文、难度、题号均不变。
- 真实网站打开 2240B、2227H、2180D：公式无渲染错误，检查的题面图片全部加载，无页面异常。
- 洛谷 Chromium DOM 测试 13 项；后端专用测试 49 项；实际数据库验证错误 token 拒绝、终态保护及事务回滚、语言失败结束排队。
- 下载线上脚本和安装页逐字节比对本地一致；用无效失败码测试线上阻塞路由返回预期 400，不产生提交。
- 未使用真实洛谷账号发送代码，不声称完成了登录账号下的真实远端交题。
- Backend 镜像 `swufe-oj:luogu-language-20260921`；Frontend `swufe-oj-caddy:luogu-language-20260921`。Caddy 未重启，教师判题机配置未动；发布后队列未暂停、worker 在线。

运行浏览器回归测试（需已安装 Playwright/Chromium，或设置 PLAYWRIGHT_PATH）：

```sh
cd packages/frontend
npm run test:luogu-language
npm run test:luogu-helper
npm run test:oj-helpers
```

## 补入工具与恢复

```sh
cd packages/backend
node --test scripts/cf-statement-repair.test.cjs
node scripts/cf-statement-repair.cjs dry-run ../../data/codeforces-statements-supplement-20260921.json /secure/manifest.json
# 人工核对 manifest 中来源、原值及变更数量后应用
node scripts/cf-statement-repair.cjs apply /secure/manifest.json /secure/backup.json
```

只填占位正文，不覆盖已有真实题面；写入前独占创建备份，并对原值加锁复核。每 25 道独立事务，**不是整库单事务**。异常时可能已完成前面批次，须依据备份检查已提交范围，再重新 dry-run，不能强制复用旧清单。恢复时也必须检查此后人工修改，不能盲目全量覆盖旧值。

线上私有备份及清单：`/home/ubuntu/difficulty-20260921/cf-statement-backup.json`、`cf-statement-manifest.json`、`cf-statement-bank-before.json`，均未加入 Git。

已安装旧脚本的浏览器仍需通过安装页更新至 1.7；网站文件更新不能直接修改用户扩展里已经安装的副本。
