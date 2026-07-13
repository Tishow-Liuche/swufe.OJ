# 西财 OJ 平台

> 面向高校的综合性程序设计教学与竞赛训练平台

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/docker-compose-blue)](https://www.docker.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)](https://www.typescriptlang.org/)

---

## 📖 项目简介

西财 OJ 是一个集**统一题库管理、在线评测、教学管理、竞赛训练**于一体的综合性在线评测平台，专为高校程序设计课程和算法竞赛训练场景设计。

### 核心能力

- 🏫 **统一题库**：本地题目 + 第三方 OJ 题目（洛谷、Codeforces 等）聚合管理
- ⚡ **本地评测**：C/C++/Python/Java 多语言实时编译执行，支持 WA/AC/TLE/RE/CE 判定
- 🌐 **Remote Judge**：插件式适配器框架，支持接入第三方 OJ 平台（洛谷官方 API 优先）
- 👨‍🏫 **教学管理**：班级、作业、学生导入、完成率统计、成绩导出
- 🏆 **竞赛训练**：ACM/ICPC 与 IOI 双赛制，封榜、排名快照、赛后补题
- 📊 **能力分析**：知识点体系 + 用户能力画像 + 薄弱项识别 + 训练计划推荐

---

## 🛠 技术栈

| 层 | 技术 |
|----|------|
| **前端** | Vue 3 + TypeScript + Vite 5 + Pinia + Axios |
| **后端** | NestJS 11 + TypeScript + Prisma 5 + BullMQ |
| **数据库** | PostgreSQL 16 |
| **缓存/队列** | Redis 7 + BullMQ |
| **存储** | MinIO (S3 兼容) |
| **评测沙箱** | go-judge (生产) / Node.js child_process (开发) |
| **部署** | Docker Compose + Nginx |

---

## 🚀 快速开始

### 环境要求

- **Node.js** >= 20.11
- **Docker Desktop** + WSL2 (Windows)
- **g++** / **python3** (评测编译执行)

### 1. 克隆项目

```bash
git clone https://github.com/your-org/swufe-oj.git
cd swufe-oj
```

### 2. 启动基础设施

```bash
docker compose up -d
```

自动启动 PostgreSQL、Redis、MinIO、go-judge。

### 3. 初始化数据库

```bash
cd packages/backend
cp ../../config/.env.example .env
npm install
npx prisma migrate dev --name init
npx prisma generate
```

### 4. 导入种子题目

```bash
npm run seed   # 一键导入洛谷 P1000-P1010 共 11 道题目
```

### 5. 构建前端

```bash
cd ../frontend
npm install
npm run build
```

### 6. 启动后端（含前端托管）

```bash
cd ../backend
npm run start:dev
```

访问 **http://localhost:3000**

### 测试账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| 管理员 | admin | 123456 |
| 教师 | teacher | 123456 |
| 学生 | student | 123456 |

---

## 🏗 项目结构

```
西财OJ平台/
├── docker-compose.yml           # 基础设施一键启动
├── config/.env.example          # 环境变量模板
├── docs/
│   ├── PROJECT_LOG.md           # 项目开发日志
│   └── SETUP.md                 # 详细搭建指南
├── packages/
│   ├── backend/                 # NestJS 后端
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # 47 表数据模型
│   │   │   └── seed.ts          # 种子数据 (P1000-P1010)
│   │   └── src/
│   │       ├── auth/            # 认证 (JWT + Passport)
│   │       ├── problem/         # 题目 CRUD + 批量导入
│   │       ├── submission/      # 提交 + BullMQ 评测队列
│   │       └── judge/           # 评测引擎 (go-judge / Native)
│   └── frontend/                # Vue 3 前端
│       ├── src/
│       │   ├── views/           # 6 个页面
│       │   ├── api/             # HTTP 客户端 + Token 管理
│       │   ├── stores/          # Pinia 状态管理
│       │   └── router/          # Vue Router
│       └── scripts/             # 构建注入脚本
└── 方案.md                      # 项目方案 (V0.2)
```

---

## 📊 数据模型

47 张 PostgreSQL 表，覆盖以下模块：

| 模块 | 核心表 | 说明 |
|------|--------|------|
| 用户与权限 | User, Role, Permission, UserSession | RBAC，Token 旋转 |
| 题库 | Problem, ProblemVersion, ProblemTag, TestGroup | 版本管理，多语言题面 |
| 评测 | Submission, SubmissionCase, JudgeTask, RemoteJudgeJob | 统一评测 + Remote Judge |
| 比赛 | Contest, ContestProblem, ContestRankSnapshot | ACM/OI 双赛制 |
| 教学 | Organization, Course, Class, Assignment | 班级管理，作业系统 |
| 分析 | KnowledgePoint, UserSkillProfile, LearningPlan | 能力画像，训练计划 |
| 审计 | AuditLog, SystemConfig | 操作审计，系统配置 |

---

## 🔒 安全设计

- **评测沙箱隔离**：评测节点与业务服务器物理分离
- **代码执行限制**：CPU 时间/内存/进程数/文件大小/系统调用过滤
- **Token 安全**：Access Token (15min 内存) + Refresh Token (7d HttpOnly Cookie Rotation)
- **Remote Judge 凭据**：加密存储，仅 Worker 可解密，不入日志
- **API 限流**：登录失败限制、提交频率限制

---

## 📝 开发阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| 阶段 1 | 基础平台 MVP（认证/题库/本地评测/管理后台） | ✅ 完成 |
| 阶段 2 | 教学和比赛（班级/作业/ACM 比赛/排行榜） | 🔨 进行中 |
| 阶段 3 | Remote Judge（插件框架/洛谷接入/账号池） | 📋 计划中 |
| 阶段 4 | 能力分析和学习规划 | 📋 计划中 |
| 阶段 5 | 生产强化（Special Judge/交互题/高可用） | 📋 计划中 |

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 提交 Pull Request

---

## 📄 许可证

MIT License

---

## 🔗 参考资源

- [HydroOJ](https://github.com/hydro-dev/Hydro) — Node.js OJ 架构参考
- [go-judge](https://github.com/criyle/go-judge) — 评测沙箱引擎
- [洛谷开放平台](https://www.luogu.com.cn) — Remote Judge API
