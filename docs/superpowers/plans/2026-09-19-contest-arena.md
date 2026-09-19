# Contest Arena Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent icon cleanup and review; implement coupled routing and page state locally.

**Goal:** 四个独立比赛页面，无赛场侧栏，统一精简装饰性图标。

**Architecture:** `ContestArena.vue` 管理比赛详情及顶部导航；四个子视图通过 props 接收详情，按职责请求数据。共用 contest 模型、状态格式化、自动刷新和提交详情组件。`Contests.vue` 仅保留列表及创建。

**Tech Stack:** Vue 3, Vue Router, TypeScript, Vitest, Playwright; existing NestJS APIs unchanged.

### Task 1: 路由与页面隔离回归

- [ ] 新增 `packages/frontend/scripts/check-contest-arena.mjs`：使用 Playwright context.route 为比赛、榜单、记录提供固定数据，点击四个文字页签。
- [ ] 核心断言 `assert.equal(await page.locator('.contest-sidebar').count(), 0)`；检查 pathname 为 `/contests/c1/register|problems|standings|submissions`，且每页只有对应模块。
- [ ] 执行旧生产构建，确认断言失败，再实现子路由；`npm run build` 后重新执行，预期全部通过。

### Task 2: 独立赛场组件

- [ ] 创建 `src/views/contest/contest.ts`：Contest 类型、dateText、problemDisplayTitle、statusText、participant/access helpers。
- [ ] 创建 `src/views/contest/ContestArena.vue`：父级加载、请求竞态防护、四个 router-link、router-view 向子页传参、报名后的 reload。
- [ ] 创建 `ContestRegistration.vue`：校赛学号姓名、密码赛密码、注册/虚拟赛按钮、错误态；API 路径保持 `/api/contests/:id/register|virtual`。
- [ ] 创建 `ContestProblems.vue`：题号/标题/状态表，仅按服务端题目列表显示；题目新标签页包含 contestId。
- [ ] 创建 `useContestFeed.ts`：单次请求无重叠、AbortController、卸载停止、403/429 明确提示、前后台轮询间隔不同。
- [ ] 创建 `ContestStandings.vue`、`ContestSubmissions.vue`，分别只请求 `/standings`、`/submissions`；共用 `ContestSubmissionDialog.vue` 展示已有授权详情接口。
- [ ] 修改 `src/router/index.ts` 为父子路由；列表 `Contests.vue` 移除旧详情、双份榜单、详情轮询，只保留创建与列表。
- [ ] 创建 `src/styles/contest-arena.css`，所有选择器限定赛场；内容最大宽度 1440px，手机标签可横向滚动，表格容器 overflow:auto。

### Task 3: 图标精简（独立任务）

- [ ] 清理 Home.vue、Profile.vue、Leaderboard.vue、ProblemStateBadges.vue 及其它非比赛页面同类装饰图标；避免改动业务逻辑、保留功能图标和可访问名称。
- [ ] 补充 `src/components/icon-style.spec.ts`，读模板确认不再出现 Sparkles/装饰 emoji，运行 `npm test -- --run`。
- [ ] 先按需求审查，再按代码质量审查，修复明确缺陷后合并工作区结果。

### Task 4: 验收与发布

- [ ] 更新原 `check-september-ui.mjs` 的比赛路由断言为 `/register`，保持已验证功能。
- [ ] `npm test -- --run`、`npm run build`、新旧浏览器回归均通过；桌面与手机截图检查。
- [ ] 审查完整改动，提交并推送 HEAD:42411036（不改 main）。
- [ ] 保存当前 caddy 镜像回滚标签，上传测试过的前端源码/构建，验证 Caddy 配置，单独更新 caddy，不重启数据库、后端和判题机。
- [ ] 公网验证新标签页、四个独立页面与学号绑定入口保留；清理临时测试账号/比赛。
