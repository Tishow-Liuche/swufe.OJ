import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as zlib from 'zlib';
import * as readline from 'readline';

const p = new PrismaClient();

interface LuoguProblem {
  pid: string;
  type: string;
  difficulty: number;
  samples: Array<[string, string]>;
  limits: { time: number[]; memory: number[] };
  tags: number[];
  title: string;
  background: string;
  description: string;
  inputFormat: string;
  outputFormat: string;
  hint: string;
  locale: string;
}

function mapDifficulty(d: number): string {
  if (d <= 1) return 'POINT_0';
  if (d <= 3) return 'POINT_1';
  if (d <= 4) return 'POINT_2';
  if (d <= 5) return 'POINT_3';
  if (d <= 6) return 'POINT_4';
  return 'POINT_5';
}

function buildDescription(p: LuoguProblem): string {
  let md = '';
  if (p.background) md += p.background + '\n\n---\n\n';
  md += `## 棰樼洰鎻忚堪\n\n${p.description}\n\n`;
  md += `## 杈撳叆鏍煎紡\n\n${p.inputFormat}\n\n`;
  md += `## 杈撳嚭鏍煎紡\n\n${p.outputFormat}\n\n`;

  if (p.samples && p.samples.length > 0) {
    p.samples.forEach(([input, output], i) => {
      md += `## 鏍蜂緥 #${i + 1}\n\n`;
      md += `### 鏍蜂緥杈撳叆 #${i + 1}\n\n\`\`\`\n${input}\n\`\`\`\n\n`;
      md += `### 鏍蜂緥杈撳嚭 #${i + 1}\n\n\`\`\`\n${output}\n\`\`\`\n\n`;
    });
  }

  if (p.hint) md += `## 鎻愮ず\n\n${p.hint}\n\n`;

  return md;
}

async function main() {
  const gzPath = '../../luogu_full.ndjson.gz';
  console.log(`Reading ${gzPath}...`);

  const fileStream = fs.createReadStream(gzPath);
  const gunzip = zlib.createGunzip();
  const rl = readline.createInterface({ input: fileStream.pipe(gunzip) });

  // Get existing titles for dedup
  const existingTitles = new Set((await p.problem.findMany({ select: { title: true } })).map(x => x.title));
  const existingPids = new Set<string>((await p.problemSource.findMany({ select: { remoteProblemId: true } })).map(x => x.remoteProblemId));

  let lineNum = 0, created = 0, updated = 0, skipped = 0;

  for await (const line of rl) {
    lineNum++;
    try {
      const obj: LuoguProblem = JSON.parse(line);
      if (obj.type !== 'P') { skipped++; continue; } // skip non-problem types

      const pid = obj.pid;
      const title = `${pid} ${obj.title}`;
      const difficulty = mapDifficulty(obj.difficulty);
      const desc = buildDescription(obj);
      const tags = obj.tags.map(String); // numeric tag IDs

      const existing = await p.problemSource.findFirst({
        where: { platform: 'LUOGU', remoteProblemId: pid },
        include: { problem: { include: { versions: { where: { isCurrent: true }, take: 1 } } } },
      });

      if (existing && existing.problem) {
        // Update the description and tags
        const ver = existing.problem.versions[0];
        if (ver) {
          await p.problemVersion.update({ where: { id: ver.id }, data: { description: desc } });
        }
        await p.problem.update({ where: { id: existing.problem.id }, data: { difficulty, title } });

        // Update tags
        await p.problemTag.deleteMany({ where: { problemId: existing.problem.id } });
        // Map numeric tag IDs to names 鈥?we'll use the IDs as names for simplicity
        await p.problemTag.createMany({
          data: tags.map(name => ({ problemId: existing.problem.id, name, type: 'TAG' })),
        });
        updated++;
      } else {
        // Create new problem
        const newProb = await p.problem.create({
          data: {
            title,
            source: 'EXTERNAL',
            difficulty,
            timeLimit: obj.limits?.time?.[0] || 1000,
            memoryLimit: obj.limits?.memory?.[0] || 256,
            status: 'PUBLISHED',
            versions: { create: { version: 1, description: desc } },
            tags: { create: tags.map(name => ({ name, type: 'TAG' })) },
            sourceInfo: {
              create: {
                platform: 'LUOGU',
                remoteProblemId: pid,
                remoteUrl: `https://www.luogu.com.cn/problem/${pid}`,
              },
            },
          },
        });
        created++;
      }

      if (lineNum % 1000 === 0) {
        console.log(`  ${lineNum} lines processed, created=${created}, updated=${updated}, skipped=${skipped}`);
      }
    } catch (e: any) {
      if (lineNum <= 5) console.error(`  Error line ${lineNum}: ${e.message?.substring(0, 100)}`);
      skipped++;
    }
  }

  const total = await p.problem.count();
  console.log(`\n鉁?Done! Lines: ${lineNum}, Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
  console.log(`Total problems in DB: ${total}`);
  console.log(`LOCAL: ${await p.problem.count({ where: { source: 'LOCAL' } })}`);
  console.log(`EXTERNAL: ${await p.problem.count({ where: { source: 'EXTERNAL' } })}`);

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });

