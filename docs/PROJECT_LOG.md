# 西财 OJ 平台 — 项目日志

---

## 2026-07-12 session 1 — 项目骨架搭建

### 完成内容

**基础设施层**
- [x] Git 仓库初始化
- [x] Docker Compose 配置（PG 16 + Redis 7 + MinIO + go-judge）
- [x] 环境变量模板 `config/.env.example`
- [x] `.gitignore`

**后端 (NestJS + TypeScript) — `packages/backend/`**
- [x] NestJS 项目脚手架
- [x] Prisma 5 数据库 Schema（47 张表，覆盖用户/题库/评测/比赛/教学/分析/审计）
- [x] PrismaService 全局数据库服务
- [x] 认证模块：注册 / 登录 / Token 刷新 / 退出 / JWT 策略 / Passport 守卫
- [x] 题目模块：CRUD + 版本管理 + 搜索 + DTO 校验
- [x] 提交模块：提交入队 + BullMQ 队列 + 评测 Processor（当前为模拟评测）
- [x] DTO 校验管线（class-validator）

**前端 (Vue 3 + Vite + TypeScript) — `packages/frontend/`**
- [x] Vue 3 + Vite 5 脚手架
- [x] Vue Router 4（6 条路由）
- [x] Pinia 状态管理（auth store）
- [x] Axios HTTP 客户端 + Token 拦截器 + 自动刷新
- [x] 页面：首页 / 登录注册 / 题库列表 / 题目详情+提交 / 提交列表 / 提交详情

**文档**
- [x] `docs/SETUP.md` 搭建指南
- [x] `docs/PROJECT_LOG.md` 项目日志

### 技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| Prisma 版本 | v5.x | Node 20.11 兼容性问题，Prisma 7 要求 20.19+ |
| 前端路由 | vue-router@4 | 与 Vite 5 兼容 |
| 评测 Processor | 当前模拟 | 后续替换为 go-judge HTTP API |
| 代码存储 | PostgreSQL text 字段 | MVP 简易方案，后期移入对象存储 |
| Token 存储 | localStorage（开发阶段） | 生产环境改为 HttpOnly Cookie |

### 下一步（等待手动操作）

1. **安装 WSL2 Ubuntu 发行版 + Docker Desktop** — 必须手动操作
2. 启动 `docker compose up -d`
3. 运行 `npx prisma migrate dev --name init`
4. 验证 `curl http://localhost:5050/version`（go-judge）
5. 启动后端 `npm run start:dev`
6. 启动前端 `npm run dev`
7. 用 curl 创建测试题目，验证全链路

### 关键依赖版本

| 包 | 版本 |
|----|------|
| Node.js | v20.11.0 |
| npm | 10.2.4 |
| NestJS | 11.x |
| Prisma | 5.x |
| Vue | 3.x |
| Vite | 5.x |
| vue-router | 4.x |
| pinia | 2.x |
| bullmq | latest |
| PostgreSQL (Docker) | 16-alpine |
| Redis (Docker) | 7-alpine |
| go-judge (Docker) | latest |
