import { Controller, Post, Body, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('api/sync')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(private prisma: PrismaService) {}

  /** 从浏览器端接收洛谷题面数据 */
  @Post('luogu-description')
  async receiveLuogu(@Body() body: {
    pid: string; title: string; description: string;
    inputFormat?: string; outputFormat?: string;
    samples?: Array<{ input: string; output: string }>;
    hint?: string; difficulty?: number;
    timeLimit?: number; memoryLimit?: number;
    tags?: string[];
  }) {
    const { pid, title, description } = body;
    if (!pid || !description) return { error: 'pid and description required' };

    // 查找已有题目
    const source = await this.prisma.problemSource.findFirst({
      where: { platform: 'LUOGU', remoteProblemId: pid },
      include: { problem: { include: { versions: { where: { isCurrent: true } } } } },
    });

    if (!source) {
      this.logger.warn('Problem not found: ' + pid);
      return { updated: false, error: 'Not found: ' + pid };
    }

    const existingVersion = source.problem.versions[0];
    if (!existingVersion) return { updated: false, error: 'No version' };

    // 判断是否需要更新
    if (existingVersion.description.length > 200 &&
        !existingVersion.description.startsWith('来自 LUOGU')) {
      return { updated: false, reason: 'Already has full description' };
    }

    // 更新 ProblemVersion
    await this.prisma.problemVersion.update({
      where: { id: existingVersion.id },
      data: {
        description,
        inputFormat: body.inputFormat || existingVersion.inputFormat,
        outputFormat: body.outputFormat || existingVersion.outputFormat,
        sampleInput: body.samples?.map(s => s.input).join('\n---\n') || existingVersion.sampleInput,
        sampleOutput: body.samples?.map(s => s.output).join('\n---\n') || existingVersion.sampleOutput,
        hint: body.hint || existingVersion.hint,
      },
    });

    // 更新题目标题（如果原标题不包含完整题名）
    if (title && title.includes(' ') && !source.problem.title.includes(title.split(' ')[1] || '')) {
      await this.prisma.problem.update({
        where: { id: source.problemId },
        data: { title },
      });
    }

    // 更新难度
    if (body.difficulty !== undefined) {
      const diffMap: Record<number, string> = {
        0: 'BEGINNER', 1: 'BEGINNER', 2: 'POPULAR', 3: 'POPULAR',
        4: 'IMPROVE', 5: 'IMPROVE', 6: 'PROVINCIAL', 7: 'PROVINCIAL',
        8: 'NOI', 9: 'NOI',
      };
      const d = diffMap[body.difficulty] || 'POPULAR';
      await this.prisma.problem.update({
        where: { id: source.problemId },
        data: { difficulty: d },
      });
    }

    this.logger.log('Updated description: ' + pid + ' (' + description.length + ' chars)');
    return { updated: true, pid };
  }
}
