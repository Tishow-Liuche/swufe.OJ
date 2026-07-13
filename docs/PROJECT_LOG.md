# 西财 OJ 平台 — 项目日志

---

## 2026-07-13 session 2 — 环境搭建 + 评测系统对接

### 完成内容

**Docker 基础设施**
- Docker Compose 启动 PostgreSQL 16、Redis 7、MinIO、go-judge（4 服务）
- Redis 配置 AOF 持久化 + noeviction 策略（BullMQ 要求）
- go-judge 版本 v1.12.1

**数据库**
- Prisma 5 Schema：47 张表完整创建（`prisma migrate dev --name init`）
- 表覆盖：用户/权限/题库/评测/比赛/教学/分析/审计

**后端 NestJS**
- 编译通过并启动（端口 3000）
- 认证 API：注册/登录/Token 刷新/退出 ✅
- 题库 API：CRUD + 搜索 + 发布 ✅
- 提交 API：BullMQ 队列入队 ✅
- **评测 Processor：真实编译评测** ✅
  - 支持 C/C++/Python/Java
  - 编译 → 执行 → 输出比对 → 计分
  - WA/TLE/RE/CE 判定
- 双模式架构：NativeJudge（开发用）| JudgeService（go-judge 生产用）
  - 当前开发使用 NativeJudge（Node.js child_process + MSYS2 g++/python3）
  - 生产部署切换为 go-judge（Docker 沙箱，替换 JudgeProcessor 注入）

**全链路测试结果**
| 测试项 | 结果 |
|--------|------|
| 注册用户 | ✅ accessToken + refreshToken |
| 创建题目 | ✅ 含版本 + 标签 |
| 发布题目 | ✅ DRAFT → PUBLISHED |
| C++ AC 提交 | ✅ ACCEPTED 100分 3/3 测试点 |
| C++ WA 提交 | ✅ WRONG_ANSWER 正确检测 |
| C++ CE 提交 | ✅ COMPILE_ERROR 正确检测 |
| Python AC 提交 | ✅ ACCEPTED 100分 3/3 测试点 |

**前端**
- 页面骨架就绪（6 个页面）
- Vue Router + Pinia + Axios Token 管理

### 环境基线
| 工具 | 版本 | 状态 |
|------|------|------|
| Node.js | v20.11.0 | ✅ |
| npm | 10.2.4 | ✅ |
| Docker | 29.6.1 | ✅ |
| WSL2 | docker-desktop | ✅ |
| g++ | 16.1.0 (MSYS2) | ✅ |
| python3 | 3.14.5 (MSYS2) | ✅ |
| PostgreSQL | 16-alpine | ✅ |
| Redis | 7-alpine | ✅ |
| go-judge | v1.12.1 | ⚠️ Docker Desktop cgroup 限制，开发用 NativeJudge |

### 关键决策
1. **评测模式**：开发环境使用 NativeJudge（child_process 编译执行），生产环境切换 go-judge Docker 沙箱
2. **Cgroup 问题**：Docker Desktop Windows 的 cgroup v2 嵌套不支持 go-judge 的沙箱模型（clone 失败），需在纯 Linux 服务器上用 go-judge
3. **Shell 兼容**：Windows cmd.exe 下 g++ 不自动追加 .exe，需统一命令模板
4. **Token 存储**：开发阶段用 localStorage，生产环境改 HttpOnly Cookie

### 项目文件结构
```
西财OJ平台/
├── 方案.md (V0.2)
├── docker-compose.yml
├── .gitignore
├── config/.env.example
├── docker/go-judge/Dockerfile (自定义镜像)
├── docs/
│   ├── PROJECT_LOG.md
│   └── SETUP.md
├── packages/
│   ├── backend/
│   │   ├── prisma/schema.prisma (47表)
│   │   └── src/
│   │       ├── prisma/      # DB 服务
│   │       ├── auth/        # 认证 (JWT + Passport)
│   │       ├── problem/     # 题目 CRUD
│   │       ├── submission/  # 提交 + BullMQ 队列
│   │       ├── judge/       # 评测引擎 (NativeJudge + JudgeService)
│   │       ├── app.module.ts
│   │       └── main.ts
│   └── frontend/
│       └── src/
│           ├── router/      # 6 路由
│           ├── stores/      # Pinia auth
│           ├── api/         # Axios HTTP 客户端
│           └── views/       # 6 页面
└── memory/
```

### 下一步
- [ ] 启动前端 `npm run dev`，验证浏览器全链路
- [ ] 集成 Monaco Editor 替代 textarea
- [ ] 从 MinIO 加载真实测试数据
- [ ] 生产部署至 Linux 服务器 + go-judge 沙箱
