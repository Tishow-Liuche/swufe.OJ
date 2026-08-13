#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client');
const { Queue } = require('bullmq');

function redisConnectionFromEnv() {
  const port = Number(process.env.REDIS_PORT || 6379);
  return {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port,
    ...(process.env.REDIS_PASSWORD ? { password: process.env.REDIS_PASSWORD } : {}),
  };
}

async function main() {
  const contestId = process.argv[2] || process.env.CONTEST_ID;
  if (!contestId) throw new Error('Usage: npm run contest:preflight -- <contestId>');

  const prisma = new PrismaClient();
  const queue = new Queue('judge', { connection: redisConnectionFromEnv() });
  const failures = [];

  async function check(name, fn) {
    try {
      const detail = await fn();
      console.log(`PASS ${name}${detail ? ` ${detail}` : ''}`);
    } catch (error) {
      failures.push({ name, message: error.message });
      console.log(`FAIL ${name} ${error.message}`);
    }
  }

  await check('database', async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  await check('redis', async () => {
    const client = await queue.client;
    const pong = await client.ping();
    if (pong !== 'PONG') throw new Error(`unexpected response ${pong}`);
  });

  await check('judge-queue', async () => {
    const [waiting, active, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
    ]);
    const maxWaiting = Number(process.env.JUDGE_QUEUE_MAX_WAITING || 1200);
    if (waiting + delayed >= maxWaiting) throw new Error(`waiting=${waiting} delayed=${delayed} max=${maxWaiting}`);
    return `waiting=${waiting} active=${active} delayed=${delayed}`;
  });

  await check('contest', async () => {
    const contest = await prisma.contest.findUnique({
      where: { id: contestId },
      include: {
        _count: { select: { participants: true, problems: true } },
      },
    });
    if (!contest) throw new Error(`contest ${contestId} not found`);
    if (contest._count.problems === 0) throw new Error('contest has no problems');
    const maxParticipants = Number(process.env.CONTEST_PREFLIGHT_MAX_PARTICIPANTS || 220);
    if (contest._count.participants > maxParticipants) {
      throw new Error(`participants=${contest._count.participants} max=${maxParticipants}`);
    }
    return `participants=${contest._count.participants} problems=${contest._count.problems}`;
  });

  await queue.close();
  await prisma.$disconnect();

  if (failures.length) {
    process.exitCode = 1;
    return;
  }
  console.log('READY for 200-person contest');
}

main().catch((error) => {
  console.error(`FAIL preflight ${error.message}`);
  process.exit(1);
});
