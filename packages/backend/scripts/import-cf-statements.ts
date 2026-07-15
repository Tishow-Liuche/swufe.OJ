import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { formatCfStatement, CfProblemJson } from '../src/sync/cf-statement-format';

interface ImportFile {
  problems?: CfProblemJson[];
}

const prisma = new PrismaClient();

async function main() {
  const file = resolve(process.argv[2] || '../../codeforces-problems.json');
  const overwrite = process.argv.includes('--overwrite');
  const dryRun = process.argv.includes('--dry-run');
  const raw = JSON.parse(readFileSync(file, 'utf8')) as ImportFile;
  const problems = raw.problems || [];

  let updated = 0;
  let skipped = 0;
  let missing = 0;
  let invalid = 0;
  let createdTags = 0;

  console.log('Reading CF statements: ' + file);
  console.log('Problems in file: ' + problems.length);
  console.log('Mode: ' + (dryRun ? 'dry-run' : 'write') + ', overwrite=' + overwrite);

  const sources = await prisma.problemSource.findMany({
    where: { platform: 'CODEFORCES' },
    include: {
      problem: {
        include: {
          versions: { where: { isCurrent: true } },
          tags: true,
        },
      },
    },
  });

  const sourceMap = new Map(sources.map((source) => [source.remoteProblemId, source]));
  console.log('CODEFORCES sources in OJ: ' + sources.length);

  for (const item of problems) {
    let formatted;
    try {
      formatted = formatCfStatement(item);
    } catch {
      invalid++;
      continue;
    }

    const source = sourceMap.get(formatted.remoteProblemId);
    if (!source) {
      missing++;
      continue;
    }

    const version = source.problem.versions[0];
    if (!version) {
      missing++;
      continue;
    }

    const hasRealStatement =
      version.description &&
      version.description.length > 500 &&
      version.description.includes('## 题目描述') &&
      !version.description.startsWith('来自 CODEFORCES');

    if (hasRealStatement && !overwrite) {
      skipped++;
      continue;
    }

    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        await tx.problemVersion.update({
          where: { id: version.id },
          data: {
            description: formatted.description,
            inputFormat: formatted.inputFormat,
            outputFormat: formatted.outputFormat,
            sampleInput: formatted.sampleInput,
            sampleOutput: formatted.sampleOutput,
            hint: formatted.hint,
            dataRange: formatted.dataRange,
          },
        });

        await tx.problem.update({
          where: { id: source.problemId },
          data: {
            title: formatted.title,
            timeLimit: formatted.timeLimit,
            memoryLimit: formatted.memoryLimit,
            difficulty: formatted.difficulty,
          },
        });

        const existingTags = new Set(source.problem.tags.map((tag) => tag.name.toLowerCase()));
        const newTags = formatted.tags.filter((tag) => !existingTags.has(tag.toLowerCase()));
        if (newTags.length) {
          await tx.problemTag.createMany({
            data: newTags.map((name) => ({
              problemId: source.problemId,
              name,
              type: 'TAG',
            })),
            skipDuplicates: true,
          });
          createdTags += newTags.length;
        }
      });
    }

    updated++;
    if (updated % 500 === 0) {
      console.log(
        'Progress updated=' + updated +
        ' skipped=' + skipped +
        ' missing=' + missing +
        ' invalid=' + invalid,
      );
    }
  }

  console.log('=== CF statement import done ===');
  console.log('Updated: ' + updated);
  console.log('Skipped: ' + skipped);
  console.log('Missing in OJ: ' + missing);
  console.log('Invalid records: ' + invalid);
  console.log('Tags added: ' + createdTags);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
