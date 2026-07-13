import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProblemDto, UpdateProblemDto, QueryProblemDto } from './dto';

@Injectable()
export class ProblemService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateProblemDto, userId: string) {
    const tagNames = dto.tags || [];
    const problem = await this.prisma.problem.create({
      data: {
        title: dto.title,
        source: 'LOCAL',
        difficulty: dto.difficulty,
        timeLimit: dto.timeLimit || 1000,
        memoryLimit: dto.memoryLimit || 256,
        allowLanguages: dto.allowLanguages || ['cpp', 'c', 'python', 'java'],
        versions: {
          create: {
            description: dto.description,
            inputFormat: dto.inputFormat,
            outputFormat: dto.outputFormat,
            sampleInput: dto.sampleInput,
            sampleOutput: dto.sampleOutput,
            hint: dto.hint,
          },
        },
        tags: {
          create: tagNames.map((name) => ({ name, type: 'TAG' })),
        },
      },
      include: {
        versions: { where: { isCurrent: true }, take: 1 },
        tags: true,
      },
    });
    return problem;
  }

  async findAll(query: QueryProblemDto) {
    const { keyword, source, difficulty, status, tag, page = 1, pageSize = 20 } = query;

    const where: any = {};
    if (keyword) {
      where.title = { contains: keyword, mode: 'insensitive' };
    }
    if (source) where.source = source;
    if (difficulty) where.difficulty = difficulty;
    if (status) where.status = status;
    if (tag) {
      where.tags = { some: { name: tag } };
    }
    // Public problems only (unless admin)
    where.status = 'PUBLISHED';

    const [items, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        select: {
          id: true,
          title: true,
          source: true,
          difficulty: true,
          timeLimit: true,
          memoryLimit: true,
          createdAt: true,
          tags: { select: { name: true } },
          _count: { select: { submissions: true } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.problem.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const problem = await this.prisma.problem.findUnique({
      where: { id },
      include: {
        versions: { where: { isCurrent: true }, take: 1 },
        tags: true,
        sourceInfo: true,
      },
    });
    if (!problem) throw new NotFoundException('题目不存在');
    return problem;
  }

  async update(id: string, dto: UpdateProblemDto) {
    const problem = await this.prisma.problem.findUnique({ where: { id } });
    if (!problem) throw new NotFoundException('题目不存在');

    // Create new version if published
    if (problem.status === 'PUBLISHED' && (dto.description || dto.inputFormat)) {
      await this.prisma.problemVersion.updateMany({
        where: { problemId: id, isCurrent: true },
        data: { isCurrent: false },
      });
      const latestVersion = await this.prisma.problemVersion.findFirst({
        where: { problemId: id },
        orderBy: { version: 'desc' },
      });
      await this.prisma.problemVersion.create({
        data: {
          problemId: id,
          version: (latestVersion?.version || 1) + 1,
          description: dto.description || '',
          inputFormat: dto.inputFormat,
          outputFormat: dto.outputFormat,
          sampleInput: dto.sampleInput,
          sampleOutput: dto.sampleOutput,
          hint: dto.hint,
        },
      });
    }

    return this.prisma.problem.update({
      where: { id },
      data: {
        title: dto.title,
        difficulty: dto.difficulty,
        timeLimit: dto.timeLimit,
        memoryLimit: dto.memoryLimit,
        status: dto.status,
      },
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.problem.delete({ where: { id } });
  }

  async updateStatus(id: string, status: string) {
    await this.findOne(id);
    return this.prisma.problem.update({
      where: { id },
      data: { status },
    });
  }
}
