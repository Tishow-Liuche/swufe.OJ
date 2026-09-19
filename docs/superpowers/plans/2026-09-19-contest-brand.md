# Contest Brand UI Implementation Plan

> Use executing-plans inline for coupled Vue/CSS edits; request independent review before release.

**Goal:** 将比赛界面视觉与主页统一，保留独立赛场行为。

**Architecture:** ContestArena.vue 仅增加真实信息展示；contest-arena.css 统一头图、导航、表单、表格、弹窗的视觉；Contests.vue 仅调整列表标题样式。

**Tech Stack:** Vue3 / CSS / Playwright / Vitest.

- [ ] 在独立浏览器样式脚本中先断言 `.arena-highlights` 存在、头图背景含 gradient、选中页签为蓝色渐变；旧构建执行失败。
- [ ] ContestArena.vue 添加 computed 时长（endTime-startTime，分钟），头图使用 `.arena-identity` 与三张 `.arena-highlights` 数据卡；不改请求与权限。
- [ ] 重写限定 `.contest-arena` 的样式，复用主页渐变/品牌蓝/圆角/阴影；保留状态色、表格内部滚动、原有选择器。
- [ ] 更新 Contests.vue 末尾 hero/ghost 的品牌色样式，保留所有创建和新标签页行为。
- [ ] `npm run build`、`npx vitest run`、新样式脚本及原 check-contest-arena/check-september-ui 通过；检查四页桌面与手机截图。
- [ ] 独立代码审查，提交推送 HEAD:42411036。caddy 镜像备份后仅部署 caddy；公网实测与清理临时记录，后端/判题不重启。
