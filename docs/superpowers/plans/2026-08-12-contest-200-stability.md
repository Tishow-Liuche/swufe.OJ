# 200 人正式比赛稳定性优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 SWUFE Singularity OJ 能稳定承载 200 人正式比赛，同时保持网页访问、提交、评测队列、实时榜单和提交记录可用。

**Architecture:** 将“用户访问/API/数据库”和“编译运行评测”解耦：主服务负责页面、API、PostgreSQL、Redis、MinIO；评测服务负责 `judge-worker` 与 `go-judge`。比赛榜单从“每个请求实时全量计算”改为“后台增量/定时计算 + Redis 缓存读取”，提交与榜单接口增加限频、分页和可观测指标。

**Tech Stack:** NestJS、Prisma、PostgreSQL、Redis/BullMQ、Docker Compose、Caddy、go-judge、Vue 3。

---

## Current Baseline

服务器当前约束：

- 2 vCPU，1.7 GiB RAM。
- `JUDGE_WORKER_CONCURRENCY=1`
- `GO_JUDGE_PARALLELISM=1`
- `DATABASE_URL?...connection_limit=5&pool_timeout=10`
- Redis maxmemory 192MB。
- 比赛前端每 15 秒轮询榜单和提交记录。
- `ContestService.standings()` 当前每次请求都会读取比赛参与者、题目、全部比赛提交，并在 Node 内存中重新计算排名。

当前瓶颈排序：

1. 本地评测单并发，提交高峰会排队。
2. 榜单接口重复全量计算，200 人轮询会放大数据库压力。
3. 数据库连接池偏小，比赛高峰容易等待连接。
4. 前端轮询固定 15 秒，页面不可见时仍可能刷新。
5. 缺少比赛压测脚本和赛前健康检查，无法量化“能不能办”。

## Target Capacity

200 人正式比赛目标：

- 200 人同时登录、看题、查看榜单。
- 峰值 50～80 次提交/分钟不拖垮网页。
- 本地评测 3～4 并发，提交可排队但 API 不阻塞。
- 榜单 3～5 秒内刷新一次，用户请求直接读缓存。
- 比赛中 API p95 响应：
  - 题面：小于 800ms
  - 榜单：小于 500ms
  - 提交创建：小于 800ms
  - 提交详情：小于 800ms

## Recommended Deployment Topology

### Minimum stable 200-person topology

```text
主服务器，建议 4C8G
- caddy
- backend
- postgres
- redis
- minio

评测服务器，建议 4C8G
- judge-worker
- go-judge
```

如果预算只能单机，最低建议把当前服务器升级到 4C8G，并将评测并发设为 2；但正式比赛更推荐拆出评测服务器。

### Production environment values

主服务器 `config/app.prod.env`：

```env
DATABASE_URL="postgresql://oj:<password>@postgres:5432/oj_platform?connection_limit=15&pool_timeout=20"
JUDGE_QUEUE_MAX_WAITING=1200
JUDGE_SUBMISSION_COOLDOWN_SECONDS=3
AUTH_USER_CACHE_TTL_MS=10000
CONTEST_STANDINGS_CACHE_TTL_SECONDS=3
CONTEST_SUBMISSION_FEED_TTL_SECONDS=3
```

评测服务器：

```env
DATABASE_URL="postgresql://oj:<password>@<main-private-ip>:5432/oj_platform?connection_limit=5&pool_timeout=20"
REDIS_HOST=<main-private-ip>
REDIS_PORT=6379
REDIS_PASSWORD=<same-redis-password>
GO_JUDGE_URL=http://go-judge:5050
JUDGE_WORKER_CONCURRENCY=3
GO_JUDGE_PARALLELISM=3
NODE_OPTIONS=--max-old-space-size=512
```

## File Structure

### Backend

- Modify `packages/backend/src/contest/contest.service.ts`
  - Keep contest validation and permission logic.
  - Move ranking calculation into a dedicated calculator service.
  - Add cached standings read path.
- Create `packages/backend/src/contest/contest-standings-calculator.service.ts`
  - Pure calculation: participants + problems + submissions → ranked rows.
  - Unit-testable without Redis or HTTP.
- Create `packages/backend/src/contest/contest-cache.service.ts`
  - Redis keys, TTL, invalidation and stale-while-refresh behavior.
- Modify `packages/backend/src/contest/contest.module.ts`
  - Register calculator/cache services.
- Modify `packages/backend/src/contest/contest.controller.ts`
  - Add optional `?fresh=1` for admins only.
  - Keep normal students on cached path.
- Modify `packages/backend/src/submission/submission.service.ts`
  - Enforce contest-aware submit cooldown and queue pressure protection before creating submissions.
  - Invalidate or refresh contest cache after accepted/final status.
- Modify `packages/backend/src/submission/judge.processor.ts`
  - Emit contest cache invalidation after final judgement.
- Modify `packages/backend/src/submission/submission.module.ts`
  - Inject contest cache dependency carefully to avoid circular imports.
- Create `packages/backend/src/common/rate-limit/contest-rate-limit.service.ts`
  - Lightweight Redis token bucket for contest submit and board refresh protection.
- Modify `packages/backend/prisma/schema.prisma`
  - Add indexes for contest standing and submission feed queries.
- Create Prisma migration under `packages/backend/prisma/migrations/<timestamp>_contest_performance_indexes/migration.sql`.
- Create `packages/backend/scripts/contest-preflight.js`
  - Checks DB connectivity, Redis connectivity, queue depth, worker count, go-judge health, and current contest participant count.
- Create `packages/backend/scripts/contest-load-smoke.js`
  - A small local smoke test to simulate board refresh and submission creation without destructive mass data.

### Frontend

- Modify `packages/frontend/src/views/Contests.vue`
  - Replace fixed `setInterval` with visibility-aware adaptive `setTimeout`.
  - Poll standings every 5 seconds while visible, 20～30 seconds when idle, stop when hidden.
  - Poll submission feed every 8～10 seconds, not every board refresh.
  - Show “榜单更新时间”和“评测队列繁忙”提示.
- Modify `packages/frontend/src/views/ProblemDetail.vue`
  - Contest mode submit button cooldown display.
  - If backend returns 429, show queue/cooldown message rather than generic failure.

### Deployment

- Create `docker-compose.judge.yml`
  - Runs `judge-worker` and `go-judge` only.
  - Connects to main Redis/Postgres over private network.
- Create `docs/deployment/contest-200-runbook.md`
  - Step-by-step pre-contest, during-contest, post-contest procedure.
- Create `docs/deployment/judge-worker-split.md`
  - How to provision and connect a dedicated judge server.

## Task 1: Add Contest Standings Calculator

**Files:**

- Create `packages/backend/src/contest/contest-standings-calculator.service.ts`
- Create `packages/backend/src/contest/contest-standings-calculator.service.spec.ts`
- Modify `packages/backend/src/contest/contest.service.ts`

- [ ] **Step 1: Write failing calculator tests**

Create `packages/backend/src/contest/contest-standings-calculator.service.spec.ts`:

```ts
import { ContestStandingsCalculatorService } from './contest-standings-calculator.service';

describe('ContestStandingsCalculatorService', () => {
  const service = new ContestStandingsCalculatorService();

  it('ranks ACM participants by solved count then penalty', () => {
    const start = new Date('2026-08-12T10:00:00Z');
    const end = new Date('2026-08-12T13:00:00Z');
    const result = service.calculate({
      contest: { id: 'c1', title: 'Round', mode: 'ACM', startTime: start, endTime: end, penaltyTime: 20, freezeTime: null },
      participants: [
        { userId: 'u1', isVirtual: false, virtualStart: null, virtualEnd: null, user: { id: 'u1', username: 'alice', nickname: 'Alice' } },
        { userId: 'u2', isVirtual: false, virtualStart: null, virtualEnd: null, user: { id: 'u2', username: 'bob', nickname: 'Bob' } },
      ],
      problems: [
        { problemId: 'p1', order: 0, score: 100, problem: { title: 'A' } },
        { problemId: 'p2', order: 1, score: 100, problem: { title: 'B' } },
      ],
      submissions: [
        { id: 's1', userId: 'u1', problemId: 'p1', status: 'WRONG_ANSWER', score: 0, createdAt: new Date('2026-08-12T10:05:00Z') },
        { id: 's2', userId: 'u1', problemId: 'p1', status: 'ACCEPTED', score: 100, createdAt: new Date('2026-08-12T10:10:00Z') },
        { id: 's3', userId: 'u2', problemId: 'p1', status: 'ACCEPTED', score: 100, createdAt: new Date('2026-08-12T10:30:00Z') },
      ],
      now: new Date('2026-08-12T11:00:00Z'),
      canManage: false,
    });

    expect(result.rows.map((row) => row.userId)).toEqual(['u1', 'u2']);
    expect(result.rows[0].solvedCount).toBe(1);
    expect(result.rows[0].penalty).toBe(30);
    expect(result.rows[0].problems[0].firstBlood).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd packages/backend
npm test -- --runInBand src/contest/contest-standings-calculator.service.spec.ts
```

Expected: FAIL because service file does not exist.

- [ ] **Step 3: Implement calculator service**

Create `packages/backend/src/contest/contest-standings-calculator.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

type CalculateInput = {
  contest: any;
  participants: any[];
  problems: any[];
  submissions: any[];
  now: Date;
  canManage: boolean;
};

@Injectable()
export class ContestStandingsCalculatorService {
  calculate(input: CalculateInput) {
    const { contest, participants, problems, submissions, now, canManage } = input;
    const problemHeaders = problems.map((problem, index) => ({
      problemId: problem.problemId,
      order: problem.order,
      label: this.problemLabel(index),
      title: problem.problem?.title || `Problem ${this.problemLabel(index)}`,
      score: problem.score,
    }));

    const firstAcceptedByProblem = new Map<string, { submissionId: string; userId: string; acceptedAt: Date }>();
    for (const participant of participants) {
      const start = participant.isVirtual && participant.virtualStart ? participant.virtualStart : contest.startTime;
      const end = participant.isVirtual && participant.virtualEnd ? participant.virtualEnd : contest.endTime;
      const acceptedSubmissions = submissions
        .filter((submission) => submission.userId === participant.userId && submission.status === 'ACCEPTED' && submission.createdAt >= start && submission.createdAt <= end)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      for (const submission of acceptedSubmissions) {
        const current = firstAcceptedByProblem.get(submission.problemId);
        if (!current || submission.createdAt < current.acceptedAt) {
          firstAcceptedByProblem.set(submission.problemId, { submissionId: submission.id, userId: submission.userId, acceptedAt: submission.createdAt });
        }
      }
    }

    const rows = participants.map((participant) => {
      const start = participant.isVirtual && participant.virtualStart ? participant.virtualStart : contest.startTime;
      const end = participant.isVirtual && participant.virtualEnd ? participant.virtualEnd : contest.endTime;
      const participantSubmissions = submissions
        .filter((submission) => submission.userId === participant.userId && submission.createdAt >= start && submission.createdAt <= end)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

      const cells = problems.map((problem, index) => {
        const attempts = participantSubmissions.filter((submission) => submission.problemId === problem.problemId);
        const accepted = attempts.find((submission) => submission.status === 'ACCEPTED');
        const wrongAttempts = accepted
          ? attempts.filter((submission) => submission.createdAt < accepted.createdAt && submission.status !== 'ACCEPTED').length
          : attempts.filter((submission) => !['PENDING', 'QUEUING', 'JUDGING'].includes(submission.status)).length;
        const label = this.problemLabel(index);
        return {
          problemId: problem.problemId,
          label,
          title: problem.problem?.title || `Problem ${label}`,
          status: this.cellStatus(attempts, accepted),
          accepted: Boolean(accepted),
          viewableSubmissionId: now > end || canManage ? accepted?.id || null : null,
          attempts: attempts.length,
          wrongAttempts,
          score: attempts.reduce((best, submission) => Math.max(best, submission.score || 0), 0),
          acceptedAt: accepted?.createdAt || null,
          firstBlood: Boolean(accepted && firstAcceptedByProblem.get(problem.problemId)?.submissionId === accepted.id),
        };
      });

      if (contest.mode === 'IOI') {
        const score = cells.reduce((sum, cell) => sum + cell.score, 0);
        return { user: participant.user, userId: participant.userId, isVirtual: participant.isVirtual, solvedCount: cells.filter((cell) => cell.accepted).length, score, penalty: 0, lastActive: participantSubmissions.at(-1)?.createdAt || null, problems: cells };
      }

      const solved = cells.filter((cell) => cell.accepted);
      const penalty = solved.reduce((sum, cell) => {
        const minutes = Math.floor((cell.acceptedAt.getTime() - start.getTime()) / 60_000);
        return sum + minutes + cell.wrongAttempts * contest.penaltyTime;
      }, 0);
      return { user: participant.user, userId: participant.userId, isVirtual: participant.isVirtual, solvedCount: solved.length, score: 0, penalty, lastActive: participantSubmissions.at(-1)?.createdAt || null, problems: cells };
    });

    rows.sort((a, b) => contest.mode === 'IOI'
      ? b.score - a.score || (a.lastActive?.getTime() || Infinity) - (b.lastActive?.getTime() || Infinity)
      : b.solvedCount - a.solvedCount || a.penalty - b.penalty || (a.lastActive?.getTime() || Infinity) - (b.lastActive?.getTime() || Infinity));

    let previous: any;
    return {
      contest: { id: contest.id, title: contest.title, mode: contest.mode, frozen: false },
      problems: problemHeaders,
      rows: rows.map((row, index) => {
        const tied = previous && (contest.mode === 'IOI'
          ? previous.score === row.score && previous.lastActive?.getTime() === row.lastActive?.getTime()
          : previous.solvedCount === row.solvedCount && previous.penalty === row.penalty);
        const rank = tied ? previous.rank : index + 1;
        previous = { ...row, rank };
        return { rank, ...row };
      }),
    };
  }

  private problemLabel(index: number) {
    let current = index;
    let label = '';
    do {
      label = String.fromCharCode(65 + (current % 26)) + label;
      current = Math.floor(current / 26) - 1;
    } while (current >= 0);
    return label;
  }

  private cellStatus(attempts: any[], accepted?: any) {
    if (accepted) return 'ACCEPTED';
    if (!attempts.length) return 'UNTRIED';
    const running = new Set(['PENDING', 'QUEUING', 'JUDGING', 'SUBMITTING', 'COMPILING', 'RUNNING']);
    return attempts.some((submission) => !running.has(submission.status)) ? 'WRONG_ANSWER' : 'PENDING';
  }
}
```

- [ ] **Step 4: Run test to verify pass**

Run:

```bash
cd packages/backend
npm test -- --runInBand src/contest/contest-standings-calculator.service.spec.ts
```

Expected: PASS.

## Task 2: Add Redis-backed Contest Cache

**Files:**

- Create `packages/backend/src/contest/contest-cache.service.ts`
- Create `packages/backend/src/contest/contest-cache.service.spec.ts`
- Modify `packages/backend/src/contest/contest.module.ts`
- Modify `packages/backend/src/contest/contest.service.ts`

- [ ] **Step 1: Write cache service tests**

Create `packages/backend/src/contest/contest-cache.service.spec.ts`:

```ts
import { ContestCacheService } from './contest-cache.service';

describe('ContestCacheService', () => {
  it('stores and loads standings using a stable contest key', async () => {
    const redis: any = {
      get: jest.fn().mockResolvedValue(JSON.stringify({ rows: [{ userId: 'u1' }] })),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
    };
    const service = new ContestCacheService(redis);

    await expect(service.getStandings('c1')).resolves.toEqual({ rows: [{ userId: 'u1' }] });
    await service.setStandings('c1', { rows: [] }, 3);
    await service.invalidateContest('c1');

    expect(redis.get).toHaveBeenCalledWith('contest:c1:standings:v1');
    expect(redis.set).toHaveBeenCalledWith('contest:c1:standings:v1', JSON.stringify({ rows: [] }), 'EX', 3);
    expect(redis.del).toHaveBeenCalledWith('contest:c1:standings:v1', 'contest:c1:submissions:v1');
  });
});
```

- [ ] **Step 2: Implement cache service**

Create `packages/backend/src/contest/contest-cache.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class ContestCacheService {
  constructor(private readonly redis: { get: Function; set: Function; del: Function }) {}

  standingsKey(contestId: string) {
    return `contest:${contestId}:standings:v1`;
  }

  submissionsKey(contestId: string) {
    return `contest:${contestId}:submissions:v1`;
  }

  async getStandings(contestId: string) {
    const raw = await this.redis.get(this.standingsKey(contestId));
    return raw ? JSON.parse(raw) : null;
  }

  async setStandings(contestId: string, value: unknown, ttlSeconds: number) {
    await this.redis.set(this.standingsKey(contestId), JSON.stringify(value), 'EX', ttlSeconds);
  }

  async invalidateContest(contestId: string) {
    await this.redis.del(this.standingsKey(contestId), this.submissionsKey(contestId));
  }
}
```

- [ ] **Step 3: Wire cache into standings**

In `ContestService.standings(id, viewer)`, before heavy DB loading:

```ts
const canManage = viewer.role === 'ADMIN' || contest.createdBy === viewer.id;
if (!canManage) {
  const cached = await this.contestCache.getStandings(id);
  if (cached) return cached;
}
```

After computing:

```ts
await this.contestCache.setStandings(id, result, Number(process.env.CONTEST_STANDINGS_CACHE_TTL_SECONDS || 3));
return result;
```

- [ ] **Step 4: Run backend tests**

Run:

```bash
cd packages/backend
npm test -- --runInBand src/contest/contest-cache.service.spec.ts src/contest/contest-standings-calculator.service.spec.ts
npm run build
```

Expected: tests and build pass.

## Task 3: Optimize Database Indexes

**Files:**

- Modify `packages/backend/prisma/schema.prisma`
- Create `packages/backend/prisma/migrations/20260812000100_contest_performance_indexes/migration.sql`

- [ ] **Step 1: Add Prisma indexes**

Add to `Submission`:

```prisma
@@index([userId, problemId, status, createdAt])
@@index([problemId, status, createdAt])
```

Add to `ContestSubmission`:

```prisma
@@index([contestId, submissionId])
```

Add to `ContestParticipant`:

```prisma
@@index([contestId, userId])
```

- [ ] **Step 2: Add SQL migration**

Create migration SQL:

```sql
CREATE INDEX IF NOT EXISTS "Submission_userId_problemId_status_createdAt_idx"
ON "Submission"("userId", "problemId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Submission_problemId_status_createdAt_idx"
ON "Submission"("problemId", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "ContestSubmission_contestId_submissionId_idx"
ON "ContestSubmission"("contestId", "submissionId");

CREATE INDEX IF NOT EXISTS "ContestParticipant_contestId_userId_idx"
ON "ContestParticipant"("contestId", "userId");
```

- [ ] **Step 3: Verify migration**

Run:

```bash
cd packages/backend
npx prisma validate
npm run build
```

Expected: Prisma validates and backend builds.

## Task 4: Split Judge Worker Deployment

**Files:**

- Create `docker-compose.judge.yml`
- Create `docs/deployment/judge-worker-split.md`
- Modify `config/app.prod.env.example`
- Modify `config/infra.env.example`

- [ ] **Step 1: Create judge compose**

Create `docker-compose.judge.yml`:

```yaml
services:
  judge-worker:
    image: swufe-oj:latest
    container_name: oj-judge-worker
    restart: unless-stopped
    init: true
    mem_limit: 1024m
    pids_limit: 512
    environment:
      NODE_OPTIONS: --max-old-space-size=768
      JUDGE_WORKER_CONCURRENCY: ${JUDGE_WORKER_CONCURRENCY:-3}
    env_file:
      - ${APP_ENV_FILE:-config/app.prod.env}
    command: ["node", "dist/src/judge-worker"]
    depends_on:
      go-judge:
        condition: service_started

  go-judge:
    image: oj-go-judge:latest
    container_name: oj-go-judge
    privileged: true
    restart: unless-stopped
    mem_limit: 2048m
    ulimits:
      nproc: 65535
      nofile: 65535
    pids_limit: -1
    command: >
      -http-addr 0.0.0.0:5050
      -enable-metrics
      -parallelism ${GO_JUDGE_PARALLELISM:-3}
      -tmp-fs-param size=512m,nr_inodes=16k
      -output-limit 268435456
      -copy-out-limit 67108864
      -force-gc-target 20971520
      -force-gc-interval 5s
      -pre-fork 0
    ports:
      - "127.0.0.1:5050:5050"
      - "127.0.0.1:5052:5052"
    shm_size: 1024m
```

- [ ] **Step 2: Create deployment doc**

Create `docs/deployment/judge-worker-split.md` with:

```md
# Judge Worker Split Deployment

1. Main server opens private-network access for Postgres 5432 and Redis 6379 only to the judge server.
2. Judge server receives the same `swufe-oj:latest` and `oj-go-judge:latest` images.
3. Judge server `config/app.prod.env` points `DATABASE_URL` to the main server private IP.
4. Judge server `REDIS_HOST` points to the main server private IP.
5. Start judge server with:

```bash
docker compose --env-file config/infra.env -f docker-compose.judge.yml up -d
```

6. Verify:

```bash
docker exec oj-judge-worker node -e "console.log('worker ok')"
curl -fsS http://127.0.0.1:5050/version || true
```
```

## Task 5: Frontend Polling and Backpressure UX

**Files:**

- Modify `packages/frontend/src/views/Contests.vue`
- Modify `packages/frontend/src/views/ProblemDetail.vue`

- [ ] **Step 1: Replace fixed board interval**

Replace:

```ts
standingTimer = setInterval(refreshLiveBoard, 15000);
```

With:

```ts
let standingTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLiveBoardRefresh(delay = 5000) {
  if (standingTimer) clearTimeout(standingTimer);
  standingTimer = setTimeout(async () => {
    if (document.visibilityState === 'visible' && selected.value) {
      await refreshStandings();
      if (selected.value.state === 'RUNNING') await refreshContestSubmissions();
    }
    scheduleLiveBoardRefresh(document.visibilityState === 'visible' ? 5000 : 30000);
  }, delay);
}

onMounted(async () => {
  await load();
  scheduleLiveBoardRefresh();
});

onUnmounted(() => {
  if (standingTimer) clearTimeout(standingTimer);
});
```

- [ ] **Step 2: Add 429 message handling in `ProblemDetail.vue`**

When submit fails:

```ts
if (e.response?.status === 429) {
  result.value = {
    status: 'QUEUING',
    compileMessage: e.response?.data?.message || '提交过于频繁或评测队列繁忙，请稍后再试',
  };
  return;
}
```

## Task 6: Contest Preflight and Load Smoke

**Files:**

- Create `packages/backend/scripts/contest-preflight.js`
- Create `packages/backend/scripts/contest-load-smoke.js`
- Modify `packages/backend/package.json`

- [ ] **Step 1: Add scripts**

Add package scripts:

```json
{
  "contest:preflight": "node scripts/contest-preflight.js",
  "contest:smoke": "node scripts/contest-load-smoke.js"
}
```

- [ ] **Step 2: Create preflight script**

`contest-preflight.js` checks:

```js
const checks = [
  'DATABASE_URL present',
  'Redis reachable',
  'judge queue waiting count below threshold',
  'go-judge /version reachable',
  'contest exists and has problems',
  'participant count <= configured max'
];
```

Expected output:

```text
PASS database
PASS redis
PASS judge queue
PASS go-judge
PASS contest cxxxx
READY for 200-person contest
```

- [ ] **Step 3: Create smoke script**

Smoke script should make repeated authenticated GETs to:

- `/api/contests/:id/standings`
- `/api/contests/:id/submissions`
- `/api/contests/:id/problems/:problemId`

It should print p50/p95 latency and fail if p95 exceeds target.

## Task 7: Production Config Rollout

**Files:**

- Modify server `config/app.prod.env`
- Modify server `config/infra.env`
- Modify deployment docs.

- [ ] **Step 1: Main server config**

Use:

```env
DATABASE_URL="postgresql://oj:<password>@postgres:5432/oj_platform?connection_limit=15&pool_timeout=20"
JUDGE_QUEUE_MAX_WAITING=1200
JUDGE_SUBMISSION_COOLDOWN_SECONDS=3
AUTH_USER_CACHE_TTL_MS=10000
CONTEST_STANDINGS_CACHE_TTL_SECONDS=3
```

- [ ] **Step 2: Judge server config**

Use:

```env
JUDGE_WORKER_CONCURRENCY=3
GO_JUDGE_PARALLELISM=3
```

- [ ] **Step 3: Deploy**

Run on main server:

```bash
docker compose --env-file config/infra.env -f docker-compose.yml -f docker-compose.prod.yml up -d --build --remove-orphans
```

Run on judge server:

```bash
docker compose --env-file config/infra.env -f docker-compose.judge.yml up -d
```

## Acceptance Criteria

- `npm test -- --runInBand` passes in backend.
- `npm run build` passes in backend and frontend.
- Prisma migration applies successfully.
- `contest:preflight` reports READY.
- 200-user smoke profile:
  - standings p95 < 500ms
  - problem detail p95 < 800ms
  - contest submissions p95 < 800ms
  - submit creation p95 < 800ms
- During smoke, backend memory remains below 70% of container limit.
- Redis memory remains below 70% of maxmemory.
- Postgres active connections remain below pool capacity.
- Judge queue can absorb at least 500 waiting submissions without API failure.

## Rollback Plan

1. Keep database backup before migration:

```bash
docker exec oj-postgres pg_dump -U oj -d oj_platform -Fc > backups/pre-contest-performance.dump
```

2. If cache code misbehaves, disable with:

```env
CONTEST_STANDINGS_CACHE_TTL_SECONDS=0
```

3. If judge server fails, stop judge server and temporarily run local main-server worker at concurrency 1.

4. If migration causes slow queries, drop added indexes only after confirming query plan regression.

## Implementation Order

1. Calculator extraction.
2. Redis standings cache.
3. DB indexes.
4. Frontend polling/backpressure UX.
5. Judge split compose and docs.
6. Preflight/smoke scripts.
7. Server rollout and load test.

This order keeps every step independently testable and avoids deploying infrastructure changes before the app can benefit from them.
