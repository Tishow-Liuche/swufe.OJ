import { Body, Controller, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { SyncService } from './sync.service';
import { sanitizeProblemContent } from '../common/content-sanitizer';

@Controller('api/sync')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('ADMIN')
export class SyncController {
  private readonly logger = new Logger(SyncController.name);

  constructor(
    private prisma: PrismaService,
    private syncService: SyncService,
  ) {}

  @Post('problem')
  async syncProblem(@Body() body: { platform: string; remoteId: string }, @Req() req: any) {
    const platform = String(body.platform || '').trim().toUpperCase();
    const remoteId = String(body.remoteId || '').trim();
    if (!platform || !remoteId) return { error: 'platform and remoteId required' };

    const problemId = await this.syncService.syncProblem(platform, remoteId, req.user);
    return { platform, remoteId, problemId, synced: !!problemId };
  }

  @Post('batch')
  async syncBatch(@Body() body: { platform: string; page?: number; pageSize?: number }, @Req() req: any) {
    const platform = String(body.platform || '').trim().toUpperCase();
    const page = Math.max(Number(body.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(body.pageSize) || 20, 1), 100);
    if (!platform) return { error: 'platform required' };

    const results = await this.syncService.syncBatch(platform, page, pageSize, req.user);
    return { platform, page, pageSize, results };
  }

  @Post('qoj-statement')
  async receiveQoj(@Body() body: {
    remoteId: string;
    title: string;
    description: string;
    inputFormat?: string;
    outputFormat?: string;
    samples?: Array<{ input: string; output: string }>;
    timeLimit?: number;
    memoryLimit?: number;
    tags?: string[];
    sourceUrl?: string;
  }, @Req() req: any) {
    const remoteId = String(body.remoteId || '').trim();
    if (!remoteId || !body.description) return { error: 'remoteId and description required' };

    const source = await this.prisma.problemSource.findFirst({
      where: { platform: 'QOJ', remoteProblemId: remoteId },
      include: { problem: { include: { versions: { where: { isCurrent: true } } } } },
    });
    const sampleInput = body.samples?.map((s) => s.input).join('\n---\n') || null;
    const sampleOutput = body.samples?.map((s) => s.output).join('\n---\n') || null;
    const title = body.title || `QOJ ${remoteId}`;

    if (source) {
      const ver = source.problem.versions[0];
      if (!ver) return { error: 'No version' };
      await this.prisma.problemVersion.update({
        where: { id: ver.id },
        data: {
          description: sanitizeProblemContent(body.description),
          inputFormat: sanitizeOptionalContent(body.inputFormat),
          outputFormat: sanitizeOptionalContent(body.outputFormat),
          sampleInput,
          sampleOutput,
          dataRange: `Time: ${body.timeLimit || source.problem.timeLimit}ms, Memory: ${body.memoryLimit || source.problem.memoryLimit}MB`,
        },
      });
      await this.prisma.problem.update({
        where: { id: source.problemId },
        data: {
          title,
          timeLimit: body.timeLimit || source.problem.timeLimit,
          memoryLimit: body.memoryLimit || source.problem.memoryLimit,
        },
      });
      return { updated: true, created: false, remoteId, problemId: source.problemId };
    }

    const problem = await this.prisma.problem.create({
      data: {
        createdById: req.user.id,
        title,
        source: 'EXTERNAL',
        difficulty: 'NOI',
        timeLimit: body.timeLimit || 1000,
        memoryLimit: body.memoryLimit || 1024,
        status: 'PUBLISHED',
        versions: {
          create: {
            version: 1,
            description: sanitizeProblemContent(body.description),
            inputFormat: sanitizeOptionalContent(body.inputFormat),
            outputFormat: sanitizeOptionalContent(body.outputFormat),
            sampleInput,
            sampleOutput,
            dataRange: `Time: ${body.timeLimit || 1000}ms, Memory: ${body.memoryLimit || 1024}MB`,
          },
        },
        tags: { create: (body.tags || []).map((name) => ({ name, type: 'TAG' })) },
        sourceInfo: {
          create: {
            platform: 'QOJ',
            remoteProblemId: remoteId,
            remoteUrl: body.sourceUrl || `https://qoj.ac/problem/${remoteId}`,
          },
        },
      },
    });
    return { updated: true, created: true, remoteId, problemId: problem.id };
  }

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
        description: sanitizeProblemContent(description),
        inputFormat: body.inputFormat ? sanitizeProblemContent(body.inputFormat) : existingVersion.inputFormat,
        outputFormat: body.outputFormat ? sanitizeProblemContent(body.outputFormat) : existingVersion.outputFormat,
        sampleInput: body.samples?.map(s => s.input).join('\n---\n') || existingVersion.sampleInput,
        sampleOutput: body.samples?.map(s => s.output).join('\n---\n') || existingVersion.sampleOutput,
        hint: body.hint ? sanitizeProblemContent(body.hint) : existingVersion.hint,
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

function sanitizeOptionalContent(value?: string) {
  return value ? sanitizeProblemContent(value) : null;
}
