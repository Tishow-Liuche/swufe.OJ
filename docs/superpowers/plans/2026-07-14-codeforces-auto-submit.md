# Codeforces Auto Submit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved Codeforces automatic submission loop: OJ opens Codeforces, the helper script fills and submits once, reports SID, closes the tab, and the OJ page shows the final result.

**Architecture:** Keep the browser as the Codeforces submit executor because Codeforces is protected by Cloudflare and the user already has a logged-in browser session. Make the backend the authority for task state, leases, SID binding, and result polling. Keep frontend changes focused on launch, recovery, polling, and removing manual-copy language.

**Tech Stack:** NestJS 11, Prisma 5, PostgreSQL, Jest, Vue 3, Vite, Tampermonkey userscript.

---

## File Structure

- Modify `packages/backend/prisma/schema.prisma`: add lease fields and indexes to `RemoteSubmissionTask`.
- Create `packages/backend/prisma/migrations/20260714120000_cf_auto_submit_lease/migration.sql`: database migration for lease fields and remote SID uniqueness.
- Create `packages/backend/src/codeforces/cf-task-lease.service.ts`: pure backend authority for lookup, lease acquisition, and SID binding.
- Create `packages/backend/src/codeforces/cf-task-lease.service.spec.ts`: Jest coverage for lease and SID conflict behavior.
- Modify `packages/backend/src/codeforces/cf.module.ts`: provide the lease service.
- Modify `packages/backend/src/submission/cf-helper.controller.ts`: remove credentials, add lookup-token shape, add lease endpoint, delegate SID binding.
- Create `packages/backend/src/submission/cf-helper.controller.spec.ts`: endpoint-level tests for disabled credentials and lease delegation.
- Modify `packages/frontend/src/views/ProblemDetail.vue`: open CF synchronously, show automatic-submission UI, expose retry button helpers, remove direct template `window`, `navigator`, and `location`.
- Modify `packages/frontend/public/cf-helper.user.js`: implement helper state machine, auto submit, lease, SID reporting while TESTING is allowed, and close after successful report.

## Task 1: Backend Lease Service

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260714120000_cf_auto_submit_lease/migration.sql`
- Create: `packages/backend/src/codeforces/cf-task-lease.service.ts`
- Create: `packages/backend/src/codeforces/cf-task-lease.service.spec.ts`
- Modify: `packages/backend/src/codeforces/cf.module.ts`

- [ ] **Step 1: Write failing lease tests**

Create `packages/backend/src/codeforces/cf-task-lease.service.spec.ts`:

```ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { CfTaskLeaseService } from './cf-task-lease.service';

function makePrisma(task: any) {
  const state = { task, updates: [] as any[], txCalls: [] as any[] };
  const prisma: any = {
    remoteSubmissionTask: {
      findFirst: jest.fn(async () => state.task),
      findUnique: jest.fn(async () => state.task),
      update: jest.fn(async ({ data }: any) => {
        state.task = { ...state.task, ...data, updatedAt: new Date('2026-07-14T12:00:00Z') };
        state.updates.push(data);
        return state.task;
      }),
    },
    remoteJudgeJob: {
      update: jest.fn(async ({ data }: any) => ({ ...data })),
    },
    submission: {
      update: jest.fn(async ({ data }: any) => ({ ...data })),
    },
    $transaction: jest.fn(async (fn: any) => {
      state.txCalls.push(fn);
      return fn(prisma);
    }),
    __state: state,
  };
  return prisma;
}

describe('CfTaskLeaseService', () => {
  const now = new Date('2026-07-14T12:00:00Z');

  beforeEach(() => jest.useFakeTimers().setSystemTime(now));
  afterEach(() => jest.useRealTimers());

  it('acquires a new one-time lease for a pending task', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PENDING',
      remoteProblemId: '4A',
      language: 'cpp',
      sourceCode: 'int main(){}',
      nonce: 'task-token',
      leaseNonce: null,
      leaseExpiresAt: null,
      remoteSubmissionId: null,
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.acquireLease('sub_1', 'task-token');

    expect(result.submissionId).toBe('sub_1');
    expect(result.leaseNonce).toHaveLength(32);
    expect(result.leaseExpiresAt.toISOString()).toBe('2026-07-14T12:02:00.000Z');
    expect(prisma.remoteSubmissionTask.update).toHaveBeenCalledWith({
      where: { submissionId: 'sub_1' },
      data: {
        leaseNonce: result.leaseNonce,
        leaseExpiresAt: result.leaseExpiresAt,
        helperStage: 'LEASED',
        status: 'PROCESSING',
      },
    });
  });

  it('rejects a second active lease with a different nonce', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'existing',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      remoteSubmissionId: null,
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new CfTaskLeaseService(prisma);

    await expect(service.acquireLease('sub_1', 'task-token')).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows the same active lease to be replayed idempotently', async () => {
    const leaseExpiresAt = new Date('2026-07-14T12:01:00Z');
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'existing',
      leaseExpiresAt,
      remoteSubmissionId: null,
      expiresAt: new Date('2026-07-14T12:30:00Z'),
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.acquireLease('sub_1', 'task-token', 'existing');

    expect(result.leaseNonce).toBe('existing');
    expect(result.leaseExpiresAt).toBe(leaseExpiresAt);
    expect(prisma.remoteSubmissionTask.update).not.toHaveBeenCalled();
  });

  it('binds SID once and promotes the local submission to judging', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'lease-a',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      remoteSubmissionId: null,
      remoteProblemId: '4A',
    });
    prisma.remoteSubmissionTask.findFirst = jest.fn(async (args: any) => {
      if (args.where.remoteSubmissionId === '123456') return null;
      return prisma.__state.task;
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.bindSid('sub_1', 'task-token', 'lease-a', '123456');

    expect(result).toEqual({ ok: true, submissionId: 'sub_1', cfSubmissionId: '123456', status: 'JUDGING' });
    expect(prisma.remoteSubmissionTask.update).toHaveBeenCalledWith({
      where: { submissionId: 'sub_1' },
      data: {
        remoteSubmissionId: '123456',
        helperStage: 'SID_REPORTED',
        status: 'PROCESSING',
      },
    });
    expect(prisma.submission.update).toHaveBeenCalledWith({
      where: { id: 'sub_1' },
      data: { status: 'JUDGING' },
    });
  });

  it('treats duplicate SID reports for the same task as success', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'lease-a',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      remoteSubmissionId: '123456',
      remoteProblemId: '4A',
    });
    const service = new CfTaskLeaseService(prisma);

    const result = await service.bindSid('sub_1', 'task-token', 'lease-a', '123456');

    expect(result.ok).toBe(true);
    expect(prisma.remoteSubmissionTask.update).not.toHaveBeenCalled();
  });

  it('rejects a different SID after one is already bound', async () => {
    const prisma = makePrisma({
      submissionId: 'sub_1',
      platformCode: 'CODEFORCES',
      status: 'PROCESSING',
      nonce: 'task-token',
      leaseNonce: 'lease-a',
      leaseExpiresAt: new Date('2026-07-14T12:01:00Z'),
      remoteSubmissionId: '123456',
      remoteProblemId: '4A',
    });
    const service = new CfTaskLeaseService(prisma);

    await expect(service.bindSid('sub_1', 'task-token', 'lease-a', '999999')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects missing tasks', async () => {
    const prisma = makePrisma(null);
    const service = new CfTaskLeaseService(prisma);

    await expect(service.acquireLease('sub_missing', 'task-token')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd packages/backend
npm test -- cf-task-lease.service.spec.ts --runInBand
```

Expected: FAIL because `./cf-task-lease.service` does not exist.

- [ ] **Step 3: Add schema fields**

In `packages/backend/prisma/schema.prisma`, update `RemoteSubmissionTask`:

```prisma
  nonce                 String?
  signature             String?
  leaseNonce            String?
  leaseExpiresAt        DateTime?
  helperStage           String?
  createdAt             DateTime  @default(now())
```

Add indexes inside the model:

```prisma
  @@index([remoteSubmissionId])
  @@index([leaseExpiresAt])
```

- [ ] **Step 4: Add migration**

Create `packages/backend/prisma/migrations/20260714120000_cf_auto_submit_lease/migration.sql`:

```sql
ALTER TABLE "RemoteSubmissionTask" ADD COLUMN "leaseNonce" TEXT;
ALTER TABLE "RemoteSubmissionTask" ADD COLUMN "leaseExpiresAt" TIMESTAMP(3);
ALTER TABLE "RemoteSubmissionTask" ADD COLUMN "helperStage" TEXT;

CREATE INDEX "RemoteSubmissionTask_remoteSubmissionId_idx" ON "RemoteSubmissionTask"("remoteSubmissionId");
CREATE INDEX "RemoteSubmissionTask_leaseExpiresAt_idx" ON "RemoteSubmissionTask"("leaseExpiresAt");
```

- [ ] **Step 5: Implement lease service**

Create `packages/backend/src/codeforces/cf-task-lease.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const LEASE_TTL_MS = 2 * 60 * 1000;
const OPEN_STATUSES = ['PENDING', 'PROCESSING'];

@Injectable()
export class CfTaskLeaseService {
  constructor(private readonly prisma: PrismaService) {}

  async lookup(problemId: string) {
    if (!problemId) throw new BadRequestException('problemId required');
    const task = await this.prisma.remoteSubmissionTask.findFirst({
      where: {
        platformCode: 'CODEFORCES',
        status: { in: OPEN_STATUSES },
        remoteProblemId: problemId,
        remoteSubmissionId: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!task) throw new NotFoundException('No pending CF task for problem ' + problemId);
    return {
      submissionId: task.submissionId,
      remoteProblemId: task.remoteProblemId,
      language: task.language,
      sourceCode: task.sourceCode,
      status: task.status,
      token: task.nonce,
    };
  }

  async acquireLease(submissionId: string, token: string, replayLeaseNonce?: string) {
    const task = await this.loadTask(submissionId, token);
    const now = new Date();
    if (task.remoteSubmissionId) {
      throw new ConflictException('Task already has a Codeforces submission ID');
    }
    if (
      task.leaseNonce &&
      task.leaseExpiresAt &&
      task.leaseExpiresAt.getTime() > now.getTime()
    ) {
      if (replayLeaseNonce && replayLeaseNonce === task.leaseNonce) {
        return {
          submissionId,
          leaseNonce: task.leaseNonce,
          leaseExpiresAt: task.leaseExpiresAt,
        };
      }
      throw new ConflictException('Task already has an active lease');
    }
    const leaseNonce = randomBytes(16).toString('hex');
    const leaseExpiresAt = new Date(now.getTime() + LEASE_TTL_MS);
    await this.prisma.remoteSubmissionTask.update({
      where: { submissionId },
      data: {
        leaseNonce,
        leaseExpiresAt,
        helperStage: 'LEASED',
        status: 'PROCESSING',
      },
    });
    return { submissionId, leaseNonce, leaseExpiresAt };
  }

  async bindSid(
    submissionId: string,
    token: string,
    leaseNonce: string,
    cfSubmissionId: string,
  ) {
    const sid = String(cfSubmissionId || '').trim();
    if (!/^\d+$/.test(sid)) throw new BadRequestException('Invalid cfSubmissionId');
    const task = await this.loadTask(submissionId, token);
    if (task.leaseNonce && task.leaseNonce !== leaseNonce) {
      throw new ConflictException('Lease nonce mismatch');
    }
    if (task.remoteSubmissionId) {
      if (task.remoteSubmissionId === sid) {
        return { ok: true, submissionId, cfSubmissionId: sid, status: 'JUDGING' };
      }
      throw new ConflictException('Task already has a different SID');
    }
    const duplicate = await this.prisma.remoteSubmissionTask.findFirst({
      where: {
        platformCode: 'CODEFORCES',
        remoteSubmissionId: sid,
        submissionId: { not: submissionId },
      },
      select: { submissionId: true },
    });
    if (duplicate) throw new ConflictException('SID is already bound to another task');
    await this.prisma.$transaction(async (tx) => {
      await tx.remoteSubmissionTask.update({
        where: { submissionId },
        data: {
          remoteSubmissionId: sid,
          helperStage: 'SID_REPORTED',
          status: 'PROCESSING',
        },
      });
      await tx.remoteJudgeJob.update({
        where: { submissionId },
        data: { remoteSubmissionId: sid },
      });
      await tx.submission.update({
        where: { id: submissionId },
        data: { status: 'JUDGING' },
      });
    });
    return { ok: true, submissionId, cfSubmissionId: sid, status: 'JUDGING' };
  }

  private async loadTask(submissionId: string, token: string) {
    if (!submissionId) throw new BadRequestException('submissionId required');
    if (!token) throw new BadRequestException('token required');
    const task = await this.prisma.remoteSubmissionTask.findUnique({
      where: { submissionId },
    });
    if (!task || task.platformCode !== 'CODEFORCES') {
      throw new NotFoundException('Task not found');
    }
    if (task.nonce && task.nonce !== token) {
      throw new ConflictException('Task token mismatch');
    }
    if (task.status === 'COMPLETED' || task.status === 'FAILED') {
      throw new ConflictException('Task is already terminal');
    }
    if (task.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException('Task expired');
    }
    return task;
  }
}
```

- [ ] **Step 6: Register service**

In `packages/backend/src/codeforces/cf.module.ts`, add `CfTaskLeaseService` to imports and providers:

```ts
import { CfTaskLeaseService } from './cf-task-lease.service';

providers: [CfSubmissionService, CfWorkerService, CfVerdictMapper, CfTaskLeaseService],
exports: [CfSubmissionService, CfTaskLeaseService],
```

- [ ] **Step 7: Run lease tests to verify GREEN**

Run:

```bash
cd packages/backend
npm test -- cf-task-lease.service.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 8: Commit Task 1**

Run:

```bash
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260714120000_cf_auto_submit_lease/migration.sql packages/backend/src/codeforces/cf-task-lease.service.ts packages/backend/src/codeforces/cf-task-lease.service.spec.ts packages/backend/src/codeforces/cf.module.ts
git commit -m "feat: add Codeforces submission lease service"
```

## Task 2: Helper Controller Protocol

**Files:**
- Modify: `packages/backend/src/submission/cf-helper.controller.ts`
- Create: `packages/backend/src/submission/cf-helper.controller.spec.ts`

- [ ] **Step 1: Write failing controller tests**

Create `packages/backend/src/submission/cf-helper.controller.spec.ts`:

```ts
import { NotFoundException } from '@nestjs/common';
import { CfHelperController } from './cf-helper.controller';

describe('CfHelperController', () => {
  function makeController(lease: any) {
    return new CfHelperController(lease);
  }

  it('does not expose Codeforces credentials', () => {
    const controller: any = makeController({});
    expect(controller.getCredentials).toBeUndefined();
  });

  it('returns lookup data with token and language display name', async () => {
    const controller = makeController({
      lookup: jest.fn(async () => ({
        submissionId: 'sub_1',
        remoteProblemId: '4A',
        language: 'cpp',
        sourceCode: 'int main(){}',
        status: 'PENDING',
        token: 'task-token',
      })),
    });

    await expect(controller.lookup('4A')).resolves.toEqual({
      submissionId: 'sub_1',
      remoteProblemId: '4A',
      language: 'cpp',
      sourceCode: 'int main(){}',
      status: 'PENDING',
      token: 'task-token',
      langName: 'GNU G++17',
    });
  });

  it('delegates lease acquisition', async () => {
    const lease = {
      acquireLease: jest.fn(async () => ({
        submissionId: 'sub_1',
        leaseNonce: 'lease-a',
        leaseExpiresAt: new Date('2026-07-14T12:02:00Z'),
      })),
    };
    const controller = makeController(lease);

    const result = await controller.acquireLease('sub_1', {
      token: 'task-token',
      leaseNonce: 'old',
    });

    expect(lease.acquireLease).toHaveBeenCalledWith('sub_1', 'task-token', 'old');
    expect(result.leaseNonce).toBe('lease-a');
  });

  it('delegates SID report and accepts TESTING-stage SID reports', async () => {
    const lease = {
      bindSid: jest.fn(async () => ({
        ok: true,
        submissionId: 'sub_1',
        cfSubmissionId: '123456',
        status: 'JUDGING',
      })),
    };
    const controller = makeController(lease);

    const result = await controller.reportSid('sub_1', {
      token: 'task-token',
      leaseNonce: 'lease-a',
      cfSubmissionId: '123456',
    });

    expect(lease.bindSid).toHaveBeenCalledWith('sub_1', 'task-token', 'lease-a', '123456');
    expect(result.status).toBe('JUDGING');
  });

  it('passes lookup miss through as NotFoundException', async () => {
    const controller = makeController({
      lookup: jest.fn(async () => {
        throw new NotFoundException('No pending CF task for problem 4A');
      }),
    });

    await expect(controller.lookup('4A')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
cd packages/backend
npm test -- cf-helper.controller.spec.ts --runInBand
```

Expected: FAIL because the controller constructor and endpoints still use the old Prisma/config implementation.

- [ ] **Step 3: Replace controller implementation**

Rewrite `packages/backend/src/submission/cf-helper.controller.ts`:

```ts
import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CfTaskLeaseService } from '../codeforces/cf-task-lease.service';

const LANG: Record<string, string> = {
  cpp: 'GNU G++17',
  c: 'GNU GCC C11',
  python: 'Python 3',
  java: 'Java 11',
};

@Controller('api/cf-submit-helper')
export class CfHelperController {
  constructor(private readonly lease: CfTaskLeaseService) {}

  @Get('lookup')
  async lookup(@Query('problemId') problemId: string) {
    const task = await this.lease.lookup(problemId);
    return {
      ...task,
      langName: LANG[task.language] || task.language,
    };
  }

  @Post(':submissionId/lease')
  acquireLease(
    @Param('submissionId') id: string,
    @Body() body: { token: string; leaseNonce?: string },
  ) {
    return this.lease.acquireLease(id, body.token, body.leaseNonce);
  }

  @Post(':submissionId/report-sid')
  reportSid(
    @Param('submissionId') id: string,
    @Body() body: { token: string; leaseNonce: string; cfSubmissionId: string },
  ) {
    return this.lease.bindSid(id, body.token, body.leaseNonce, body.cfSubmissionId);
  }
}
```

- [ ] **Step 4: Run controller tests to verify GREEN**

Run:

```bash
cd packages/backend
npm test -- cf-helper.controller.spec.ts --runInBand
```

Expected: PASS.

- [ ] **Step 5: Run backend tests**

Run:

```bash
cd packages/backend
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add packages/backend/src/submission/cf-helper.controller.ts packages/backend/src/submission/cf-helper.controller.spec.ts
git commit -m "feat: harden Codeforces helper protocol"
```

## Task 3: Frontend Automatic Submit UX

**Files:**
- Modify: `packages/frontend/src/views/ProblemDetail.vue`

- [ ] **Step 1: Run frontend build to verify current failure**

Run:

```bash
cd packages/frontend
npm run build
```

Expected: FAIL with template errors for `location`, `navigator`, or `window`.

- [ ] **Step 2: Add browser helper functions**

In the `<script setup>` section of `packages/frontend/src/views/ProblemDetail.vue`, add these refs and functions near `cfData`:

```ts
const cfOpenBlocked = ref(false);
const cfAutoMessage = ref('');

function openExternalUrl(url?: string): boolean {
  if (!url) return false;
  const opened = globalThis.window?.open(url, '_blank', 'noopener,noreferrer');
  return !!opened;
}

function retryOpenCf() {
  cfOpenBlocked.value = !openExternalUrl(cfData.value?.url);
}

async function copyCfCode() {
  try {
    await globalThis.navigator?.clipboard?.writeText(cfData.value?.code || '');
    copySuccess.value = true;
  } catch {
    copySuccess.value = false;
  }
}

function refreshPage() {
  globalThis.location?.reload();
}
```

- [ ] **Step 3: Change CF branch to auto-submit messaging**

Replace the CF branch in `submitCode()` with:

```ts
    if (data.mode === 'CODEFORCES' && data.cfSubmitUrl) {
      isExternal.value = true;
      const langNames: Record<string, string> = { cpp:'GNU G++17', c:'GNU GCC C11', python:'Python 3', java:'Java 11' };
      cfData.value = {
        url: data.cfSubmitUrl,
        language: langNames[language.value] || language.value,
        code: code.value,
        submissionId: data.submissionId,
      };
      cfDialog.value = true;
      cfAutoMessage.value = '正在打开 Codeforces 并自动提交。完成后标签页会自动关闭，结果会回到这里。';
      copyCfCode();
      cfOpenBlocked.value = !openExternalUrl(data.cfSubmitUrl);
      startPolling(data.submissionId);
    } else {
```

- [ ] **Step 4: Replace direct template globals**

Change:

```vue
@click="location.reload()"
@click="navigator.clipboard.writeText(cfData?.code); copySuccess = true"
@click="window.open(cfData?.url, '_blank')"
```

To:

```vue
@click="refreshPage"
@click="copyCfCode"
@click="retryOpenCf"
```

- [ ] **Step 5: Replace CF dialog body copy**

Replace the dialog body steps with:

```vue
          <p style="margin-bottom:12px">{{ cfAutoMessage }}</p>
          <p v-if="cfOpenBlocked" style="margin:0 0 12px; color:#e65100; font-size:14px;">
            浏览器拦截了新标签页。点击下方按钮继续同一个提交任务。
          </p>

          <div class="cf-step">
            <span class="cf-step-num">1</span>
            <span class="cf-step-text">Codeforces 页面会自动选择语言: <b>{{ cfData?.language }}</b></span>
          </div>
          <div class="cf-step">
            <span class="cf-step-num">2</span>
            <span class="cf-step-text">辅助脚本会自动填入代码并点击 Submit</span>
          </div>
          <div class="cf-step">
            <span class="cf-step-num">3</span>
            <span class="cf-step-text">识别 SID 并回传成功后，Codeforces 标签页会自动关闭</span>
          </div>
          <div class="cf-step">
            <span class="cf-step-num">4</span>
            <span class="cf-step-text">此页面持续轮询并展示最终评测结果</span>
          </div>
```

- [ ] **Step 6: Run frontend build to verify GREEN**

Run:

```bash
cd packages/frontend
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add packages/frontend/src/views/ProblemDetail.vue
git commit -m "feat: update Codeforces auto-submit frontend flow"
```

## Task 4: Tampermonkey State Machine

**Files:**
- Modify: `packages/frontend/public/cf-helper.user.js`

- [ ] **Step 1: Preserve current script and identify old manual-submit text**

Run:

```bash
rg -n "Ready|click Submit|reportAndJump|watchForOurSub|cf_ts|cf_oid|cf_pid" packages/frontend/public/cf-helper.user.js
```

Expected: shows the old manual-submit listener and `location.replace(OJ)` behavior.

- [ ] **Step 2: Replace storage keys and add state helpers**

In `packages/frontend/public/cf-helper.user.js`, keep header grants and replace old `cf_ts`, `cf_oid`, `cf_pid` helper usage with:

```js
var STATE_KEY = 'swufe_cf_auto_state';

function loadState() {
  try { return JSON.parse(gv(STATE_KEY, '{}') || '{}'); }
  catch (_) { return {}; }
}

function saveState(next) {
  sv(STATE_KEY, JSON.stringify(next || {}));
}

function clearState() {
  dv(STATE_KEY);
}
```

- [ ] **Step 3: Add request helper**

Add:

```js
function apiRequest(method, url, data, cb) {
  GM_xmlhttpRequest({
    method: method,
    url: API + url,
    headers: { 'Content-Type': 'application/json' },
    data: data ? JSON.stringify(data) : undefined,
    timeout: 10000,
    onload: function(r) {
      try {
        var parsed = r.responseText ? JSON.parse(r.responseText) : {};
        if (r.status >= 200 && r.status < 300) cb(null, parsed);
        else cb(parsed && parsed.message ? parsed.message : 'HTTP ' + r.status, null);
      } catch (e) {
        cb('Bad JSON response', null);
      }
    },
    onerror: function() { cb('Network error', null); },
    ontimeout: function() { cb('Timeout', null); }
  });
}
```

- [ ] **Step 4: Change report to close only after success**

Replace `reportAndJump` with:

```js
function reportSidAndClose(sid) {
  var st = loadState();
  if (!st.submissionId || !st.token || !st.leaseNonce) {
    banner('SID found, but task state is missing. Keep this page open and retry from OJ.', '#e74c3c');
    return;
  }
  banner('Reporting SID ' + sid + ' to OJ...', '#27ae60');
  apiRequest('POST', '/api/cf-submit-helper/' + st.submissionId + '/report-sid', {
    token: st.token,
    leaseNonce: st.leaseNonce,
    cfSubmissionId: String(sid)
  }, function(err) {
    if (err) {
      console.error('[CF-Helper] report-sid failed:', err);
      banner('SID report failed. Retrying soon...', '#f39c12');
      setTimeout(function() { reportSidAndClose(sid); }, 3000);
      return;
    }
    clearState();
    banner('SID reported. Closing Codeforces tab...', '#27ae60');
    setTimeout(function() {
      window.close();
      banner('Result has been returned to OJ. You can safely close this tab.', '#27ae60');
    }, 500);
  });
}
```

- [ ] **Step 5: Report SID even while TESTING**

In the status watcher loop, remove the branch that waits when `!verdict || verdict === 'TESTING'`. The first matching SID should call:

```js
saveState(Object.assign({}, loadState(), { stage: 'SID_FOUND', cfSubmissionId: String(x.id) }));
reportSidAndClose(x.id);
return;
```

- [ ] **Step 6: Add lease and automatic submit on submit page**

After successful lookup and form fill, replace the old click listener with:

```js
        var existing = loadState();
        var taskState = {
          stage: existing.stage || 'FILLED',
          submissionId: d.submissionId,
          problemId: problemId,
          token: d.token,
          submittedAt: existing.submittedAt || 0,
          leaseNonce: existing.leaseNonce || ''
        };
        saveState(taskState);

        function afterLease(lease) {
          var current = loadState();
          current.stage = current.submittedAt ? 'SUBMITTED' : 'LEASED';
          current.leaseNonce = lease.leaseNonce;
          saveState(current);
          if (current.submittedAt) {
            banner('Submission already sent. Waiting for SID...', '#3498db');
            watchForOurSub();
            return;
          }
          current.submittedAt = Math.floor(Date.now() / 1000);
          current.stage = 'SUBMITTED';
          saveState(current);
          banner('Submitting to Codeforces automatically...', '#3498db');
          bn.click();
        }

        apiRequest('POST', '/api/cf-submit-helper/' + d.submissionId + '/lease', {
          token: d.token,
          leaseNonce: taskState.leaseNonce || undefined
        }, function(err, lease) {
          if (err) {
            console.error('[CF-Helper] Lease failed:', err);
            banner('Could not acquire OJ submit lease: ' + err, '#e74c3c');
            return;
          }
          afterLease(lease);
        });
```

- [ ] **Step 7: Update status watcher to read unified state**

Change `watchForOurSub()` to read:

```js
  var st = loadState();
  var ts = st.submittedAt;
  var pid = st.problemId;
```

On timeout, keep state instead of clearing it:

```js
banner('Timeout finding SID. Refresh this page to keep searching; no second submit will be made.', '#f39c12');
```

- [ ] **Step 8: Run syntax check**

Run:

```bash
node --check packages/frontend/public/cf-helper.user.js
```

Expected: no syntax errors.

- [ ] **Step 9: Commit Task 4**

Run:

```bash
git add packages/frontend/public/cf-helper.user.js
git commit -m "feat: automate Codeforces helper submission"
```

## Task 5: End-to-End Verification

**Files:**
- Verify only unless a previous task fails.

- [ ] **Step 1: Generate Prisma client**

Run:

```bash
cd packages/backend
npx prisma generate
```

Expected: Prisma Client generated successfully.

- [ ] **Step 2: Run backend tests**

Run:

```bash
cd packages/backend
npm test -- --runInBand
```

Expected: PASS.

- [ ] **Step 3: Run backend build**

Run:

```bash
cd packages/backend
npm run build
```

Expected: PASS.

- [ ] **Step 4: Run frontend build**

Run:

```bash
cd packages/frontend
npm run build
```

Expected: PASS.

- [ ] **Step 5: Run userscript syntax check**

Run:

```bash
node --check packages/frontend/public/cf-helper.user.js
```

Expected: no syntax errors.

- [ ] **Step 6: Inspect final diff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only intentional files are modified. Existing unrelated user changes may still be present and must not be reverted.

- [ ] **Step 7: Commit final verification note if needed**

If verification required tiny follow-up fixes, commit them:

```bash
git add <changed-files>
git commit -m "fix: stabilize Codeforces auto-submit flow"
```

If no files changed, do not create an empty commit.

## Self-Review

- Spec coverage: automatic submit, one-time lease, SID binding, close-after-report, frontend polling, disabled credentials, TESTING SID reports, popup recovery, and build/test verification are covered.
- Placeholder scan: clean.
- Type consistency: backend lease names are `token`, `leaseNonce`, `leaseExpiresAt`, `helperStage`, and `cfSubmissionId`; the controller and userscript use the same names.
