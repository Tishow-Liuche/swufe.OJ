# 外站脚本安装检测实施计划

**Goal:** CF、洛谷、QOJ 提交前检测对应脚本，未响应时提示安装，不创建提交任务，保留草稿。

**Architecture:** 三个 userscript 仅在明确列出的 OJ 域名提供无副作用的 ping/pong，带随机请求 ID 和平台。前端在提交前短暂等待响应；超时打开安装提示，可安装、重新检测或取消。旧脚本/禁用脚本无法响应，文案为“未检测到可用脚本”，不假称能读取浏览器扩展列表。

**Tech Stack:** Vue 3、TypeScript、Tampermonkey、Vitest、Playwright。

## 执行步骤

- [ ] 在 `packages/frontend/scripts/test-helper-presence.mjs` 用浏览器加载三个实际脚本，验证 OJ 域名仅回应匹配平台请求、不访问 GM 数据或展示提示条。
- [ ] 在 `packages/frontend/src/utils/helper-presence.spec.ts` 验证超时、平台不匹配、请求 ID 不匹配、成功响应与本地题平台选择。
- [ ] 新建 `utils/helper-presence.ts`，公开 `helperPlatform(problem)` 和 `detectHelper(platform)`，只接受同窗口、同源、相同请求 ID/平台的版本响应，清理监听和定时器。
- [ ] 修改三个脚本元数据和 OJ 域名早返回分支；版本 CF 7.6、洛谷 1.9、QOJ 2.6，同步安装页。
- [ ] 修改 `ProblemDetail.vue`，在提交 API 之前检测，检测中防重复点击；缺脚本弹出安装提示、保留编辑器内容，不关闭正在进行的旧提交结果；重新检测成功后提示再次点击提交，不暗中提交。
- [ ] 运行浏览器检测、已有洛谷语言/结果测试、前端全量单测和构建；检查当前域名安装链接与前端一致。

## 约束

不读取用户代码、账号、token 作为安装证明；不使用永久 localStorage 标记冒充实际安装状态；不要求三个脚本全部安装才能提交某一个平台；不覆盖主工作区已有未提交改动。页面检测仅 UX 提示，不是认证边界。
