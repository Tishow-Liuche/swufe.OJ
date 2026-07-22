# 西财OJ平台 — 项目交接文档

> **日期**: 2026-07-14
> **目的**: 完整记录项目架构、已完成功能、关键代码路径、当前状态，供下一个开发者接手

---

## 一、项目总览

### 1.1 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 后端 | NestJS + TypeScript | 11 |
| 前端 | Vue 3 + Vite + CodeMirror 6 + KaTeX + marked | 5.x |
| ORM | Prisma | 5.x |
| 队列 | BullMQ + Redis | - |
| 数据库 | PostgreSQL | 16 (Docker) |
| 评测 | go-judge (Docker) | - |
| 存储 | MinIO (Docker) | - |

### 1.2 部署方式

```bash
# Docker 容器（3个）
docker ps
# oj-postgres  — PostgreSQL 16
# oj-redis     — Redis 7
# oj-minio     — MinIO 对象存储

# 后端启动（本地 Node.js）
cd packages/backend && node dist/main.js  # 端口 3000

# 前端启动（本地 Node.js）
cd packages/frontend && npx vite           # 端口 5173
```

### 1.3 账号体系

> 安全说明：仓库交接文档不保存任何真实密码、第三方 OJ 明文密码、Cookie、Session 或 Token。
> 本地开发/演示账号请通过 `packages/backend/prisma/seed.ts`、环境变量和管理员重置流程初始化。

| OJ 账号 | 密码 | 角色 | 绑定的 CF |
|---------|------|------|---------|
| 一只天守 | 请通过本地管理员重置 | ADMIN | Tishow__Liuche |
| admin | 请通过 seed/env 初始化 | ADMIN | 无 |
| student | 请通过 seed/env 初始化 | STUDENT | 无 |
| teacher | 请通过 seed/env 初始化 | TEACHER | 无 |

CF 账号信息仅保存在本机 `.env` 或用户浏览器登录态中，不上传到 GitHub。

---

## 二、数据库现状

```
题库总数：24,190 题
├── 洛谷 (LUOGU): 15,728 题  — 完整题面 ✅（来自官方 latest.ndjson.gz）
├── Codeforces (CODEFORCES): 8,455 题  — 元数据完整，题面为占位符
└── 本地 (LOCAL): 7 题
```

---

## 三、Codeforces 远程评测 — 完整架构（当前版本 v6.0）

### 3.1 核心流程

```
┌──────────────┐     ┌───────────────────┐     ┌────────────────────┐
│ OJ 前端      │     │ OJ 后端 (NestJS)   │     │ Tampermonkey 脚本   │
│ ProblemDetail├────→│ SubmissionService  ├────→│ cf-helper.user.js  │
│ .vue         │     │ → CfSubmissionSvc  │     │ (浏览器用户脚本)     │
│              │     │ → RemoteSubTask    │     │                    │
└──────┬───────┘     └────────┬──────────┘     └─────────┬──────────┘
       │ 轮询结果              │                         │
       │ (每1.5s, 最长10min)   │                         │ 在CF页面:
       │                      │                         │ 1. lookup获取代码
       │              ┌───────▼──────────┐              │ 2. 自动填表
       │              │ CfWorkerService  │              │ 3. 点Submit后监听
       │              │ (每10s轮询CF API) │              │ 4. 跳转到status页
       │              └───────┬──────────┘              │ 5. 轮询CF API查SID
       │                      │                         │ 6. report-sid回传
       │              ┌───────▼──────────┐              │ 7. location.replace
       │              │ CfHelperCtrl     │              │    跳回OJ
       │              │ /report-sid      │←─────────────┘
       │              │ (立即查CF API     │
       │              │  更新Submission)  │
       └──────────────┴──────────────────┘
```

### 3.2 关键后端端点

全部以 `http://localhost:3000` 为 base：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录，返回 JWT |
| POST | `/api/submissions` | 提交代码（CF 自动路由） |
| GET | `/api/cf-submit-helper/credentials` | 返回 CF 账号密码 |
| GET | `/api/cf-submit-helper/lookup?problemId=4A` | 按 CF 题号查待提交任务 |
| GET | `/api/cf-submit-helper/lookup-status?problemId=4A` | 查最近 PENDING 任务 |
| **POST** | **`/api/cf-submit-helper/:submissionId/report-sid`** | **TM脚本回传SID，立即查CF API更新结果** |
| GET | `/api/submissions/:id` | 查询提交结果（前端轮询用） |
| GET | `/api/sync/cf-list` | 返回所有CF题目（浏览器同步器用） |
| POST | `/api/sync/cf-statement` | 接收CF完整题面 |

### 3.3 源文件清单（CF 相关）

```
packages/backend/src/codeforces/
├── cf.module.ts                  # NestJS Module (全局注册)
├── cf-submission.service.ts      # 创建CF任务，返回cfSubmitUrl
├── cf-worker.service.ts          # 后台Worker，每10s轮询CF API
└── cf-verdict.mapper.ts          # CF判题结果 → OJ状态码映射

packages/backend/src/submission/
├── cf-helper.controller.ts       # CF辅助API (lookup, report-sid, credentials)
├── submission.service.ts         # 提交路由 (CODEFORCES → CfSubmissionService)
├── submission.controller.ts      # REST Controller
├── submission.module.ts          # 导入CodeforcesModule + CfHelperController
└── judge.processor.ts            # 本地评测 BullMQ Processor

packages/backend/src/sync/
├── cf-sync.controller.ts         # CF题面同步接收端点
└── sync.controller.ts            # 洛谷题面同步接收端点

packages/frontend/public/
├── cf-helper.user.js             # ★ Tampermonkey 用户脚本 (v6.0)
├── sync-cf.html                  # ★ CF题面浏览器同步器
├── sync-luogu.html               # 洛谷题面同步器（仅浏览器端可用）
└── install-cf-helper.html        # TM脚本安装引导页

packages/frontend/src/views/
└── ProblemDetail.vue             # 题目详情+提交页 (含CF弹窗、轮询)
```

---

## 四、Tampermonkey 用户脚本 (v6.0)

### 4.1 安装方式

打开 `http://localhost:5173/cf-helper.user.js`，Tampermonkey 应弹出安装/更新窗口。

### 4.2 脚本行为

**前提条件**：用户必须在 Chrome 浏览器中登录 Codeforces 一次（勾选 Remember Me）。

1. **提交页** (`/problemset/submit/{contestId}/{index}`)：
   - 等待 Cloudflare 挑战完成（阻塞标题检测）
   - 检查是否已登录 CF（未登录显示提示）
   - 从后端 `lookup?problemId=` 获取代码
   - 自动选语言 + 填代码 → 监听 Submit 按钮
   - 点 Submit 时记录时间戳到 `GM_setValue`

2. **状态页** (`/problemset/status?my=on`)：
   - 读取存储的 `cf_ts`（提交时间戳）和 `cf_pid`（题目ID）
   - 5 分钟内有效，否则清理
   - 从页面 DOM 提取 CF handle（`a[href*="/profile/"]` 解析）
   - 轮询 `CF API /user.status` → 按 `(contestId, index, time)` 匹配
   - 只匹配 `verdict !== 'TESTING'` 状态的提交
   - 匹配成功后调用 `report-sid` 回传 → `location.replace(OJ_URL)` 跳回

3. **兜底**：status 页 60 次轮询无结果 → 显示超时提示

### 4.3 调试方式

在 CF 页面按 F12 → Console，查看 `[CF-Helper]` 开头日志。

---

## 五、CF 提交流程端到端测试方法

```bash
cd "c:/西财OJ平台/packages/backend"

# 1. 登录
printf '{"username":"一只天守","password":"<local-password>"}' > /tmp/login.json
TOKEN=$(curl -s -X POST "http://127.0.0.1:3000/api/auth/login" \
  -H "Content-Type: application/json; charset=utf-8" \
  -d @/tmp/login.json | python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")

# 2. 提交 CF 4A
RESULT=$(curl -s -X POST "http://127.0.0.1:3000/api/submissions" \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"problemId":"cmrk3ht6r12pyhgazev8bkjjg","language":"cpp","sourceCode":"#include <iostream>\nusing namespace std;\nint main(){int w;cin>>w;cout<<(w%2==0&&w>2?\"YES\":\"NO\");}"}')
SUBMISSION_ID=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['submissionId'])")

# 3. 模拟 TM 回传真实 SID
LATEST_SID=$(curl -s "https://codeforces.com/api/user.status?handle=Tishow__Liuche&from=1&count=5" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d['result'][0]['id'])")
curl -s -X POST "http://127.0.0.1:3000/api/cf-submit-helper/$SUBMISSION_ID/report-sid" \
  -H "Content-Type: application/json" \
  -d "{\"cfSubmissionId\":\"$LATEST_SID\"}"

# 4. 检查结果
docker exec oj-postgres psql -U oj -d oj_platform -c \
  "SELECT status, score FROM \"Submission\" WHERE id='$SUBMISSION_ID';"
```

---

## 六、已知问题和限制

### 6.1 Cloudflare 封锁
- **服务器端无法访问任何 CF HTML 页面** (403)
- CF 公开 API (`/api/user.status`) 不受 Cloudflare 保护
- 因此必须用浏览器（TM 脚本）完成填表提交
- 题库题面也只能通过浏览器端 sync-cf.html 同步

### 6.2 用户必须先登录 CF
- TM 脚本 v6.0 不会自动登录 CF（Cloudflare 让自动登录不可靠）
- 用户必须手动在 `https://codeforces.com/enter` 登录一次，勾选 Remember Me

### 6.3 CF 题面待同步
- 8,455 道 CF 题目只有元数据，没有完整题面
- 需要在浏览器打开 `http://localhost:5173/sync-cf.html` 批量同步
- 每 5 秒抓取一题 → 全部同步约需 12 小时（建议后台运行）

### 6.4 Prisma Schema 中的 CF 相关模型

```prisma
model RemoteSubmissionTask {
  submissionId  String
  platformCode  String       // "CODEFORCES"
  remoteProblemId String     // "4A"
  language      String
  sourceCode    String
  status        String       // PENDING → PROCESSING → COMPLETED/FAILED
  remoteSubmissionId String?
  …
}

model RemoteJudgeJob {
  submissionId  String
  platform      String
  remoteProblemId String
  remoteSubmissionId String?
  rawStatus     String?     // CF 原始verdict
  …
}

model ProblemSource {
  platform      String       // "CODEFORCES" | "LUOGU"
  remoteProblemId String
  …
}

model ExternalAccount {
  platform    String
  remoteUsername String
  status      String       // IDENTITY_ONLY | SUBMISSION_READY
  …
}
```

---

## 七、常用运维命令

```bash
# 启动 Docker 容器
docker start oj-postgres oj-redis oj-minio

# 构建后端
cd packages/backend && npx nest build

# 重启后端
OLD=$(netstat -ano | grep ":3000" | grep LISTENING | awk '{print $NF}')
cmd.exe //c "taskkill /F /PID $OLD"
cd packages/backend && nohup node dist/main.js > /tmp/backend.log 2>&1 &

# 查看后端日志
tail -50 /tmp/backend.log | grep -E "CF|cf|error" -i

# 前端启动
cd packages/frontend && npx vite --host 0.0.0.0

# 数据库查询
docker exec oj-postgres psql -U oj -d oj_platform -c "…"

# 查看 CF Worker 状态
grep "CfWorker\|CF matched\|CF Result\|Tick" /tmp/backend.log | tail -20

# 清理死任务
docker exec oj-postgres psql -U oj -d oj_platform -c \
  "DELETE FROM \"RemoteSubmissionTask\" WHERE \"expiresAt\" < NOW();"
```

---

## 八、CF 提交问题排查清单

| 症状 | 可能原因 | 检查方法 |
|------|---------|---------|
| OJ 提交后一直 QUEUING | TM 脚本没安装/没运行 | CF页面F12→Console有无`[CF-Helper]` |
| QUEUING → 超时 | report-sid 没被调用 | 后端日志`grep report-sid /tmp/backend.log` |
| CF 页面显示提示"未登录" | 浏览器CF未登录 | 手动打开 `codeforces.com` 检查 |
| report-sid 成功但结果不对 | dedup 逻辑拦截 | 后端日志有无 `already matched` |
| CF 页面打开后无填表 | TM脚本match不匹配 | 检查TM脚本是否启用+match是否正确 |
| 前端0分但DB有100分 | 前端轮询过早结束 | ProblemDetail.vue 的 maxAttempts 值 |

---

## 九、版本历史

| 版本 | 日期 | 关键变更 |
|------|------|---------|
| TM v2.x | 7/13 | 初版：自动填表 |
| TM v3.x | 7/13 | 添加 SID 检测 + window.close |
| TM v4.x | 7/14 | 改用 CF API 轮询替代 DOM 解析 |
| TM v5.x | 7/14 | GM 存储跨页面状态 + 跳转修复 |
| TM v6.0 | 7/14 | **稳定版**：提取用户CF handle + 题目精确匹配 + 兜底清理 |
| 后端 | 7/14 | report-sid 改为立即查 CF API 更新 Submission |

---

## 十、依赖包清单

```json
// packages/backend/package.json 关键依赖
{
  "@nestjs/common": "^11",
  "@nestjs/core": "^11",
  "@nestjs/bullmq": "^11",
  "@prisma/client": "^5",
  "bullmq": "^5",
  "bcryptjs": "^2",
  "@nestjs/passport": "^11",
  "passport-jwt": "^4",
  "cheerio": "^1",      // CF HTML题面解析
  "sanitize-html": "^2", // 题面HTML清洗
  "puppeteer": "^22"    // 未使用（CF封锁），可移除
}

// packages/frontend/package.json 关键依赖
{
  "vue": "^3",
  "vite": "^5",
  "vue-router": "^4",
  "codemirror": "^6",
  "@codemirror/lang-cpp": "^6",
  "@codemirror/lang-python": "^6",
  "@codemirror/lang-java": "^6",
  "marked": "^12",
  "katex": "^0.16"
}
```
