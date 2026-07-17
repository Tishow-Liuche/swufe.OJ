# 安全加固实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标：** 将当前 OJ 的基础设施、会话、题目权限、题面渲染、强制改密和上传边界改为默认安全，并以自动化测试覆盖关键拒绝路径。

**架构：** 基础设施只绑定回环地址并从忽略的部署变量文件读取密钥。后端将刷新会话改为 Cookie + 哈希持久化，使用策略服务统一题目 owner/委派权限，并在输入、渲染与 HTTP 边界增加净化和限制。历史题目保留空创建者，只有管理员可重新分配。

**技术栈：** NestJS 11、Prisma/PostgreSQL、BullMQ/Redis、Vue 3、Axios、DOMPurify、Helmet、Nest Throttler、Jest、Vitest。

---

## 文件结构

- 新建：`config/infra.env.example` — Docker 基础设施的必填变量模板。
- 新建：`packages/backend/src/common/problem-access.service.ts` — 题目 owner、管理员和委派权限决策。
- 新建：`packages/backend/src/common/content-sanitizer.ts` — 服务端题面 HTML 白名单净化。
- 新建：`packages/backend/src/common/security-config.ts` — Cookie、CSP、ZIP 限额等共享安全常量。
- 新建：`packages/backend/src/auth/refresh-token.ts` — 刷新令牌哈希和 Cookie 名称工具。
- 新建：`packages/backend/src/auth/must-change-password.guard.ts` — 强制改密的服务端守卫。
- 新建：`packages/backend/src/problem/problem-access.service.spec.ts`、`packages/backend/src/auth/auth.service.spec.ts`、`packages/backend/src/common/content-sanitizer.spec.ts` — 后端安全回归测试。
- 新建：`packages/frontend/src/security/sanitize-statement.ts`、`packages/frontend/src/security/sanitize-statement.spec.ts`、`packages/frontend/vitest.config.ts` — 前端渲染净化与测试。
- 修改：`docker-compose.yml`、`.gitignore`、`config/.env.example`、`README.md` — 私有端口和部署说明。
- 修改：`packages/backend/package.json`、`package-lock.json`、`src/main.ts`、`src/app.module.ts`、`src/submission/submission.module.ts` — 安全依赖、HTTP 基线、Redis 密码。
- 修改：`packages/backend/prisma/schema.prisma`，并新增迁移目录 — 刷新令牌哈希和题目创建者。
- 修改：`packages/backend/src/auth/*`、`src/user/user.controller.ts`、`src/user/user.service.ts` — Cookie 会话和服务端强制改密。
- 修改：`packages/backend/src/problem/*`、`src/sync/*`、`src/atcoder/*` — owner/委派授权与导入题目归属。
- 修改：`packages/backend/src/common/file-upload.service.ts`、`src/problem/problem.service.ts` — ZIP 安全预算。
- 修改：`packages/frontend/package.json`、`package-lock.json`、`src/api/client.ts`、`src/stores/auth.ts`、`src/router/index.ts`、`src/views/ProblemDetail.vue` — 内存令牌和净化后的题面渲染。

## 任务 1：私有基础设施与必填密钥

**文件：**
- 新建：`config/infra.env.example`
- 修改：`.gitignore`
- 修改：`docker-compose.yml`
- 修改：`config/.env.example`
- 修改：`packages/backend/src/submission/submission.module.ts`
- 修改：`packages/backend/src/common/file-upload.service.ts`
- 测试：`docker compose --env-file config/infra.env.example config`

- [ ] **步骤 1：先写出基础设施变量模板和忽略规则。**

```dotenv
# config/infra.env.example
POSTGRES_USER=oj
POSTGRES_PASSWORD=replace-with-a-random-32-char-password
POSTGRES_DB=oj_platform
REDIS_PASSWORD=replace-with-a-random-32-char-password
MINIO_ROOT_USER=replace-with-a-non-default-user
MINIO_ROOT_PASSWORD=replace-with-a-random-32-char-password
```

在 `.gitignore` 添加 `config/infra.env`，确保真实密钥不能被 Git 跟踪。

- [ ] **步骤 2：运行 Compose 配置检查，确认修改前仍含公开端口和硬编码默认值。**

运行：`rg -n '5432:5432|6379:6379|9000:9000|oj_dev_2024|minioadmin' docker-compose.yml`

预期：命令返回当前公开端口或开发默认值。

- [ ] **步骤 3：将 Compose 改为回环绑定、必填变量和有密码 Redis。**

```yaml
ports:
  - "127.0.0.1:5432:5432"
environment:
  POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER in config/infra.env}
  POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in config/infra.env}
command: >
  redis-server --requirepass ${REDIS_PASSWORD:?set REDIS_PASSWORD in config/infra.env}
  --protected-mode yes --appendonly yes --appendfsync everysec
```

对 Redis、MinIO、go-judge 的端口同样使用 `127.0.0.1:`；MinIO 用户名和密码改为 `${MINIO_ROOT_USER:?…}` / `${MINIO_ROOT_PASSWORD:?…}`。更新 README，要求使用：`docker compose --env-file config/infra.env up -d`。

- [ ] **步骤 4：让后端必须读取 Redis/S3 密钥。**

```ts
connection: {
  host: c.getOrThrow<string>('REDIS_HOST'),
  port: c.getOrThrow<number>('REDIS_PORT'),
  password: c.getOrThrow<string>('REDIS_PASSWORD'),
}
```

`FileUploadService` 不再提供 MinIO 默认 access key 或 secret key；从 `ConfigService.getOrThrow` 读取两项。

- [ ] **步骤 5：验证配置。**

运行：`docker compose --env-file config/infra.env.example config`

预期：退出码为 0，所有 `ports` 均以 `127.0.0.1:` 开头，Redis 命令包含 `--requirepass` 与 `--protected-mode yes`。

- [ ] **步骤 6：提交。**

```bash
git add .gitignore config/infra.env.example config/.env.example docker-compose.yml README.md packages/backend/src/submission/submission.module.ts packages/backend/src/common/file-upload.service.ts
git commit -m "security: privatize infrastructure services"
```

## 任务 2：Cookie 刷新会话与服务端强制改密

**文件：**
- 新建：`packages/backend/src/auth/refresh-token.ts`
- 新建：`packages/backend/src/auth/must-change-password.guard.ts`
- 新建：`packages/backend/src/auth/auth.service.spec.ts`
- 修改：`packages/backend/prisma/schema.prisma`
- 新建：`packages/backend/prisma/migrations/20260717210000_secure_refresh_tokens/migration.sql`
- 修改：`packages/backend/src/auth/auth.service.ts`
- 修改：`packages/backend/src/auth/auth.controller.ts`
- 修改：`packages/backend/src/auth/jwt.strategy.ts`
- 修改：`packages/backend/src/main.ts`
- 修改：`packages/frontend/src/api/client.ts`
- 修改：`packages/frontend/src/stores/auth.ts`
- 修改：`packages/frontend/src/router/index.ts`

- [ ] **步骤 1：编写会话测试，先证明新约定尚不存在。**

```ts
it('stores only a SHA-256 refresh-token hash', async () => {
  await service.login({ account: 'alice', password: 'Passw0rd!' });
  expect(prisma.userSession.create).toHaveBeenCalledWith({
    data: expect.objectContaining({ refreshTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
  });
});

it('blocks a must-change-password user outside the password route', async () => {
  await expect(guard.canActivate(contextFor('/api/submissions'))).rejects.toThrow('必须先修改密码');
});
```

运行：`npm test -- auth/auth.service.spec.ts --runInBand`

预期：失败，原因是 `refreshTokenHash` 与服务端强制改密守卫尚不存在。

- [ ] **步骤 2：迁移会话字段并清除旧会话。**

```sql
DELETE FROM "UserSession";
ALTER TABLE "UserSession" RENAME COLUMN "refreshToken" TO "refreshTokenHash";
```

Prisma 模型使用 `refreshTokenHash String @unique`。题目创建者关系留在任务 3 的独立迁移中，避免会话迁移与题目授权迁移耦合。

- [ ] **步骤 3：实现哈希令牌、Cookie 写入与轮换。**

```ts
export const REFRESH_COOKIE = 'oj_refresh';
export const hashRefreshToken = (token: string) =>
  createHash('sha256').update(token).digest('hex');
```

`AuthService.refresh` 和 `logout` 用哈希查询；`AuthController` 使用 `Response` 的 `cookie` / `clearCookie`，且所有登录、注册、刷新响应都从 JSON 中删除 `refreshToken`。`main.ts` 注册 `cookieParser()`。

- [ ] **步骤 4：在 JWT 验证后服务端限制未改密用户。**

```ts
const allowed = new Set(['/api/user/password', '/api/user/profile', '/api/auth/me']);
if (user.mustChangePassword && !allowed.has(req.path)) {
  throw new ForbiddenException('必须先修改密码');
}
```

启用 `passReqToCallback: true`，并让 `JwtStrategy.validate` 选取 `mustChangePassword`；所有已有 `AuthGuard('jwt')` 路径因此自动受到限制。

- [ ] **步骤 5：移除前端持久化令牌。**

```ts
let accessToken = '';
export const setAccessToken = (token: string) => { accessToken = token; };
export const clearAccessToken = () => { accessToken = ''; };
```

Axios 使用 `withCredentials: true`；刷新请求不再发送 JSON token。Pinia 在首次需要受保护页面时调用刷新接口恢复内存令牌，登出只清除内存状态和 Cookie。

- [ ] **步骤 6：运行认证测试并检查浏览器代码。**

运行：`npm test -- auth/auth.service.spec.ts --runInBand`

预期：通过；`rg -n 'localStorage|sessionStorage|refreshToken' packages/frontend/src` 只允许出现迁移注释或测试断言，不允许业务持久化调用。

- [ ] **步骤 7：提交。**

```bash
git add packages/backend/prisma packages/backend/src/auth packages/backend/src/main.ts packages/frontend/src/api/client.ts packages/frontend/src/stores/auth.ts packages/frontend/src/router/index.ts
git commit -m "security: move refresh sessions to http-only cookies"
```

## 任务 3：题目 owner、委派权限与历史题目拒绝策略

**文件：**
- 新建：`packages/backend/src/common/problem-access.service.ts`
- 新建：`packages/backend/src/problem/problem-access.service.spec.ts`
- 修改：`packages/backend/prisma/schema.prisma`
- 新建：`packages/backend/prisma/migrations/20260717211000_add_problem_owners/migration.sql`
- 修改：`packages/backend/src/problem/problem.module.ts`
- 修改：`packages/backend/src/problem/problem.controller.ts`
- 修改：`packages/backend/src/problem/problem.service.ts`
- 修改：`packages/backend/src/problem/dto.ts`
- 修改：`packages/backend/src/sync/sync.controller.ts`
- 修改：`packages/backend/src/sync/sync.service.ts`
- 修改：`packages/backend/src/atcoder/atcoder.controller.ts`
- 修改：`packages/backend/src/atcoder/atcoder.service.ts`

- [ ] **步骤 1：编写权限策略失败测试。**

```ts
it.each([
  ['legacy', { id: 'teacher', role: 'TEACHER' }, 'EDIT'],
  ['other-owner', { id: 'teacher-b', role: 'TEACHER' }, 'MANAGE_TESTDATA'],
])('rejects %s for a teacher', async (_, actor, action) => {
  await expect(access.assertCanManage('p1', actor, action as ProblemAction)).rejects.toThrow(ForbiddenException);
});

it('allows the owner, an explicit delegate, and an administrator', async () => {
  // mock owner/delegate/admin rows and assert each resolves
});
```

运行：`npm test -- problem/problem-access.service.spec.ts --runInBand`

预期：失败，因为策略服务不存在。

- [ ] **步骤 2：新增 owner 模型与安全迁移。**

```prisma
createdById String?
createdBy   User? @relation("ProblemCreator", fields: [createdById], references: [id], onDelete: SetNull)

// User 模型中同时加入：
createdProblems Problem[] @relation("ProblemCreator")
```

迁移只添加允许空值的列与外键；不回填历史数据。为 `ProblemPermission` 添加 `[problemId, targetType, targetId, permission]` 唯一约束，防止重复委派。

- [ ] **步骤 3：实现集中式访问策略。**

```ts
if (actor.role === 'ADMIN') return problem;
if (problem.createdById === actor.id) return problem;
const delegated = problem.permissions.some((p) =>
  p.targetType === 'USER' && p.targetId === actor.id &&
  (p.permission === 'MANAGE' || p.permission === action),
);
if (!delegated) throw new ForbiddenException('无权管理该题目');
```

空 `createdById` 不匹配任何教师，因此历史题目自动仅管理员可管理。

- [ ] **步骤 4：将调用者传入每个题目变更。**

`ProblemController` 的创建、更新、删除、状态、测试数据和标程上传均传递 `req.user`；服务层在写入前调用 `ProblemAccessService`。创建和导入题目写入 `createdById`。同步/AtCoder 管理接口把管理员或教师身份传到服务层。

- [ ] **步骤 5：提供管理员转交与 owner/管理员委派接口。**

```ts
@Patch(':id/owner')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
assignOwner(@Param('id') id: string, @Body() dto: AssignProblemOwnerDto) {
  return this.problem.assignOwner(id, dto.ownerId);
}
```

再提供 owner/管理员可调用的 `POST /:id/permissions` 和 `DELETE /:id/permissions/:permissionId`，只接受 `USER` 目标和 `EDIT`、`MANAGE_TESTDATA`、`MANAGE_CHECKER`、`PUBLISH`、`DELETE`、`MANAGE` 权限值。

- [ ] **步骤 6：运行策略与控制器守卫测试。**

运行：`npm test -- problem/problem-access.service.spec.ts common/guards/security-guards.spec.ts --runInBand`

预期：通过，且未归属历史题目拒绝教师访问。

- [ ] **步骤 7：提交。**

```bash
git add packages/backend/prisma packages/backend/src/common/problem-access.service.ts packages/backend/src/problem packages/backend/src/sync packages/backend/src/atcoder
git commit -m "security: enforce problem ownership and delegation"
```

## 任务 4：题面净化与 ZIP 解压边界

**文件：**
- 新建：`packages/backend/src/common/content-sanitizer.ts`
- 新建：`packages/backend/src/common/content-sanitizer.spec.ts`
- 修改：`packages/backend/src/problem/problem.service.ts`
- 修改：`packages/backend/src/sync/sync.controller.ts`
- 修改：`packages/backend/src/sync/cf-sync.controller.ts`
- 修改：`packages/backend/src/sync/sync.service.ts`
- 修改：`packages/backend/src/common/file-upload.service.ts`
- 修改：`packages/backend/src/common/file-upload.service.spec.ts`
- 新建：`packages/frontend/src/security/sanitize-statement.ts`
- 新建：`packages/frontend/src/security/sanitize-statement.spec.ts`
- 新建：`packages/frontend/vitest.config.ts`
- 修改：`packages/frontend/package.json`
- 修改：`packages/frontend/src/views/ProblemDetail.vue`

- [ ] **步骤 1：编写后端净化和 ZIP 限额失败测试。**

```ts
expect(sanitizeProblemContent('<img src=x onerror=alert(1)><script>x</script>')).toBe('<img src="x" />');
await expect(service.validateZipBudget(entriesWith({ size: 101 * 1024 * 1024 }))).rejects.toThrow('解压后大小超过限制');
```

运行：`npm test -- common/content-sanitizer.spec.ts common/file-upload.service.spec.ts --runInBand`

预期：失败，因为净化工具与解压预算尚不存在。

- [ ] **步骤 2：实现服务端题面 HTML 白名单。**

```ts
export function sanitizeProblemContent(value: string): string {
  return sanitizeHtml(value, {
    allowedTags: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'pre', 'code', 'blockquote', 'ul', 'ol', 'li', 'strong', 'em', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'span', 'div'],
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title'], '*': ['class'] },
    allowedSchemes: ['http', 'https'],
  });
}
```

所有题面 create/update、QOJ/洛谷/Codeforces 同步和同步服务写入都调用该函数。

- [ ] **步骤 3：在读取 ZIP 内容前执行预算检查。**

```ts
const MAX_ENTRIES = 200;
const MAX_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_RATIO = 100;
```

遍历 `AdmZip.getEntries()` 时先读取头部中的 `size` 与 `compressedSize`，拒绝超限、缺失/无效大小和压缩比过高条目；只有通过检查后才能调用 `entry.getData()`。

- [ ] **步骤 4：为前端添加 DOMPurify 并测试。**

```ts
export function sanitizeStatementHtml(html: string) {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true, mathMl: true },
    ALLOWED_URI_REGEXP: /^(?:(?:https?):|\/|#)/i,
  });
}
```

`ProblemDetail.vue` 在 `marked.parse` 和 KaTeX 占位符替换完成后调用该函数。添加 `vitest`、`jsdom` 和 `dompurify`，并让测试断言 `<script>`、`onerror` 与 `javascript:` 全部消失。

- [ ] **步骤 5：运行后端与前端安全测试。**

运行：`npm test -- common/content-sanitizer.spec.ts common/file-upload.service.spec.ts --runInBand`

运行：`npm run test -- --run`

预期：后端与 Vitest 测试全部通过。

- [ ] **步骤 6：提交。**

```bash
git add packages/backend/src/common packages/backend/src/problem/problem.service.ts packages/backend/src/sync packages/frontend/package.json packages/frontend/package-lock.json packages/frontend/vitest.config.ts packages/frontend/src/security packages/frontend/src/views/ProblemDetail.vue
git commit -m "security: sanitize statements and bound zip expansion"
```

## 任务 5：HTTP 安全响应头与限流

**文件：**
- 修改：`packages/backend/package.json`
- 修改：`packages/backend/package-lock.json`
- 修改：`packages/backend/src/main.ts`
- 修改：`packages/backend/src/app.module.ts`
- 修改：`packages/backend/src/auth/auth.controller.ts`
- 新建：`packages/backend/src/app.security.spec.ts`

- [ ] **步骤 1：编写 HTTP 基线失败测试。**

```ts
await request(app.getHttpServer()).get('/api/stats')
  .expect('X-Content-Type-Options', 'nosniff')
  .expect('X-Frame-Options', 'SAMEORIGIN');
```

运行：`npm test -- app.security.spec.ts --runInBand`

预期：失败，因为 Helmet 尚未注册。

- [ ] **步骤 2：安装并配置安全依赖。**

运行：`npm install helmet @nestjs/throttler`

在 `AppModule` 注册 `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` 和全局 `ThrottlerGuard`。在 `main.ts` 注册 `cookieParser()`、Helmet、生产 CSP/HSTS，并只在 `TRUST_PROXY=true` 时启用 `expressApp.set('trust proxy', 1)`。

- [ ] **步骤 3：为认证入口添加严格限流。**

```ts
@Throttle({ default: { limit: 5, ttl: 60_000 } })
@Post('login')
async login(/* ... */) {}
```

同样装饰 register、refresh 与 password-change；正常 API 继承每分钟 100 次的全局额度。

- [ ] **步骤 4：验证响应头与限流。**

运行：`npm test -- app.security.spec.ts --runInBand`

预期：通过；连续第 6 次登录请求返回 429。

- [ ] **步骤 5：提交。**

```bash
git add packages/backend/package.json packages/backend/package-lock.json packages/backend/src/main.ts packages/backend/src/app.module.ts packages/backend/src/auth/auth.controller.ts packages/backend/src/app.security.spec.ts
git commit -m "security: add headers and request throttling"
```

## 任务 6：集成验证与受控交付

**文件：**
- 修改：`README.md`
- 修改：`docs/SETUP.md`
- 测试：后端、前端、Prisma、Compose 配置和依赖审计。

- [ ] **步骤 1：更新上线说明。**

在 README 和 SETUP 中写明 `config/infra.env` 的生成方式、维护窗口轮换顺序、历史题目转交 API、会话作废影响和容器不自动重启的限制。

- [ ] **步骤 2：运行完整后端验证。**

运行：`npm test -- --runInBand`

运行：`npx tsc --noEmit -p tsconfig.build.json`

运行：`npx prisma validate`

预期：全部退出码为 0；修正当前关于尾部空白输出的过时测试，使测试契约与已采用的 `trimEnd()` 判题策略一致。

- [ ] **步骤 3：运行完整前端验证。**

运行：`npm run test -- --run`

运行：`npx vue-tsc --noEmit -p tsconfig.app.json`

运行：`npm run build`

预期：全部退出码为 0。

- [ ] **步骤 4：运行部署与依赖核查。**

运行：`docker compose --env-file config/infra.env.example config`

运行：`npm audit --omit=dev --json`

分别在 backend 和 frontend 目录执行。预期：不再存在由本次新增依赖带来的高危项；将 `xlsx` 与 Vite 的已知漏洞作为独立依赖升级任务处理。

- [ ] **步骤 5：提交。**

```bash
git add README.md docs/SETUP.md packages/backend packages/frontend docker-compose.yml config
git commit -m "docs: document secure deployment rollout"
```
