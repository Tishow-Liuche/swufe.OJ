import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface SeedProblem {
  title: string;
  source: string;
  platform: string;
  difficulty: string;
  timeLimit: number;
  memoryLimit: number;
  tags: string[];
  tests: Array<{
    input: string;
    expectedOutput: string;
    score: number;
    order: number;
    isSample?: boolean;
  }>;
}

async function main() {
  const dataPath = path.join(__dirname, 'problem-seed.json');
  const problems: SeedProblem[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  console.log(`Loading ${problems.length} problems from problem-seed.json...`);
  let created = 0, skipped = 0;

  for (const p of problems) {
    const existing = await prisma.problem.findFirst({ where: { title: p.title } });
    if (existing) {
      skipped++;
      continue;
    }

    const problem = await prisma.problem.create({
      data: {
        title: p.title,
        source: p.source,
        difficulty: p.difficulty,
        timeLimit: p.timeLimit,
        memoryLimit: p.memoryLimit,
        status: 'PUBLISHED',
        versions: {
          create: {
            version: 1,
            description: generateDescription(p),
          },
        },
        tags: {
          create: p.tags.map(name => ({ name, type: 'TAG' })),
        },
        sourceInfo: p.platform !== 'LOCAL' ? {
          create: {
            platform: p.platform,
            remoteProblemId: p.title.match(/P\d+/)?.[0] || '',
            remoteUrl: p.title.match(/P\d+/) ? `https://www.luogu.com.cn/problem/${p.title.match(/P\d+/)![0]}` : null,
          },
        } : undefined,
      },
      include: { versions: { where: { isCurrent: true }, take: 1 } },
    });

    const version = problem.versions[0];
    if (version && p.tests.length > 0) {
      await prisma.problemTestCase.createMany({
        data: p.tests.map(t => ({
          problemVersionId: version.id,
          input: t.input,
          expectedOutput: t.expectedOutput,
          score: t.score,
          order: t.order,
          isSample: t.isSample || false,
        })),
      });
    }

    console.log(`  ✓ ${p.title} [${p.source}] ${p.tests.length} tests`);
    created++;
  }

  const total = await prisma.problem.count();
  console.log(`\nDone: created ${created}, skipped ${skipped}, total ${total}`);
  await prisma.$disconnect();
}

function generateDescription(p: SeedProblem): string {
  const tagStr = p.tags.join('、');
  return `## 题目描述

本题来自洛谷题库 [${p.title}](https://www.luogu.com.cn/problem/${p.title.match(/P\d+/)?.[0] || ''})。

本题主要考察 ${tagStr}。

## 输入格式

请参考原题链接。

## 输出格式

请参考原题链接。

## 提示

- 时间限制: ${p.timeLimit}ms
- 内存限制: ${p.memoryLimit}MB
- 难度: ${p.difficulty}
- 标签: ${tagStr}`;
}

main().catch(e => { console.error(e); process.exit(1); });
