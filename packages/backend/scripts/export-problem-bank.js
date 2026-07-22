const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { PrismaClient } = require('@prisma/client');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const eq = line.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvFile(path.resolve(__dirname, '../.env'));

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to export the problem bank.');
  }

  const prisma = new PrismaClient();
  try {
    const problems = await prisma.problem.findMany({
      orderBy: [{ source: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        source: true,
        status: true,
        difficulty: true,
        timeLimit: true,
        memoryLimit: true,
        outputLimit: true,
        allowLanguages: true,
        scoreType: true,
        createdAt: true,
        updatedAt: true,
        sourceInfo: true,
        tags: {
          orderBy: [{ type: 'asc' }, { name: 'asc' }],
          select: { name: true, type: true },
        },
        versions: {
          orderBy: [{ version: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            version: true,
            description: true,
            inputFormat: true,
            outputFormat: true,
            sampleInput: true,
            sampleOutput: true,
            hint: true,
            dataRange: true,
            isCurrent: true,
            createdAt: true,
            checker: {
              select: {
                type: true,
                language: true,
                sourceCode: true,
              },
            },
            testCases: {
              orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
              select: {
                input: true,
                expectedOutput: true,
                score: true,
                order: true,
                isSample: true,
              },
            },
            testGroups: {
              orderBy: [{ order: 'asc' }],
              select: {
                name: true,
                score: true,
                testCount: true,
                order: true,
              },
            },
          },
        },
      },
    });

    const sourceCounts = {};
    let versionCount = 0;
    let testCaseCount = 0;
    let checkerCount = 0;
    for (const problem of problems) {
      sourceCounts[problem.source] = (sourceCounts[problem.source] ?? 0) + 1;
      versionCount += problem.versions.length;
      for (const version of problem.versions) {
        testCaseCount += version.testCases.length;
        checkerCount += version.checker ? 1 : 0;
      }
    }

    const snapshot = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      safety:
        'Sanitized problem-bank snapshot only. Excludes users, passwords, sessions, submissions, source-code submissions, audit logs, and third-party cookies/tokens.',
      counts: {
        problems: problems.length,
        versions: versionCount,
        testCases: testCaseCount,
        checkers: checkerCount,
        bySource: sourceCounts,
      },
      problems,
    };

    const outputPath = path.resolve(
      __dirname,
      '../prisma/problem-bank.snapshot.json.gz',
    );
    fs.writeFileSync(outputPath, zlib.gzipSync(JSON.stringify(snapshot)));
    console.log(
      JSON.stringify(
        {
          outputPath,
          ...snapshot.counts,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
