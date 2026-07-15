import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as path from 'path';
import { FileUploadService } from '../common/file-upload.service';
import { PrismaService } from '../prisma/prisma.service';

type JudgeMode = 'STANDARD' | 'SPJ';

@Injectable()
export class ProblemService {
  constructor(
    private prisma: PrismaService,
    private fileUpload: FileUploadService,
  ) {}

  async createFull(dto: {
    title: string;
    description: string;
    difficulty?: string;
    timeLimit?: number;
    memoryLimit?: number;
    outputLimit?: number;
    allowLanguages?: string[];
    tags?: string[];
    inputFormat?: string;
    outputFormat?: string;
    sampleInput?: string;
    sampleOutput?: string;
    hint?: string;
    dataRange?: string;
    status?: string;
    judgeMode?: string;
    spjLanguage?: string;
    spjSourceCode?: string;
    testCases?: Array<{ input?: string; expectedOutput?: string; score?: number; isSample?: boolean }>;
  }, userId: string) {
    const existing = await this.prisma.problem.findFirst({ where: { title: dto.title } });
    if (existing) throw new BadRequestException('题目标题已存在');

    const status = dto.status || 'DRAFT';
    const judgeMode = this.normalizeJudgeMode(dto.judgeMode);
    const testCases = this.normalizeInlineTestCases(dto.testCases || [], judgeMode, status);
    const checker = this.normalizeChecker(judgeMode, dto.spjLanguage, dto.spjSourceCode);

    const versionCreate: any = {
      version: 1,
      description: dto.description,
      inputFormat: dto.inputFormat,
      outputFormat: dto.outputFormat,
      sampleInput: dto.sampleInput,
      sampleOutput: dto.sampleOutput,
      hint: dto.hint,
      dataRange: dto.dataRange,
      checker: { create: checker },
    };
    if (testCases.length > 0) versionCreate.testCases = { create: testCases };

    return this.prisma.problem.create({
      data: {
        title: dto.title,
        source: 'LOCAL',
        status,
        difficulty: dto.difficulty || 'POPULAR',
        timeLimit: dto.timeLimit || 1000,
        memoryLimit: dto.memoryLimit || 256,
        outputLimit: dto.outputLimit || 64,
        allowLanguages: dto.allowLanguages || ['cpp', 'c', 'python', 'java'],
        versions: { create: versionCreate },
        tags: { create: (dto.tags || []).map((name) => ({ name, type: 'TAG' })) },
      },
      include: {
        versions: { where: { isCurrent: true }, take: 1 },
        tags: true,
      },
    });
  }

  async uploadTestData(problemId: string, file: Express.Multer.File) {
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) throw new NotFoundException('题目不存在');

    const version = await this.prisma.problemVersion.findFirst({
      where: { problemId, isCurrent: true },
      include: { checker: true },
    });
    if (!version) throw new NotFoundException('题目版本不存在');

    const judgeMode: JudgeMode = version.checker?.type === 'SPJ' ? 'SPJ' : 'STANDARD';
    const cases = this.parseTestDataZip(file, judgeMode);
    const data = cases.map((tc) => ({ problemVersionId: version.id, ...tc }));

    await this.prisma.problemTestCase.deleteMany({ where: { problemVersionId: version.id } });
    await this.prisma.problemTestCase.createMany({ data });
    await this.prisma.testGroup.deleteMany({ where: { problemVersionId: version.id } });
    await this.prisma.testGroup.create({
      data: {
        problemVersionId: version.id,
        name: file.originalname,
        score: 100,
        testCount: data.length,
        order: 1,
      },
    });

    return {
      status: 'imported',
      fileName: file.originalname,
      size: file.size,
      testCount: data.length,
      judgeMode,
    };
  }

  async uploadImage(file: Express.Multer.File) {
    const s3Path = await this.fileUpload.uploadImage(file);
    const url = await this.fileUpload.getPresignedUrl(s3Path);
    return { url: `s3://${s3Path}`, previewUrl: url };
  }

  async uploadChecker(problemId: string, file: Express.Multer.File, type: string, language: string) {
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) throw new NotFoundException('题目不存在');

    const version = await this.prisma.problemVersion.findFirst({
      where: { problemId, isCurrent: true },
    });
    if (!version) throw new NotFoundException('题目版本不存在');

    const s3Path = await this.fileUpload.uploadFile(file, `checkers/${problemId}`);
    await this.prisma.checker.upsert({
      where: { problemVersionId: version.id },
      create: {
        problemVersionId: version.id,
        type,
        language,
        sourceCode: s3Path,
      },
      update: {
        type,
        language,
        sourceCode: s3Path,
      },
    });

    return { path: s3Path, type, language };
  }

  async findAll(query: any) {
    const { keyword, source, difficulty, status, tag, page = 1, pageSize = 20 } = query;
    const where: any = {};
    const currentPage = Math.max(Number(page) || 1, 1);
    const currentPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    where.status = status || 'PUBLISHED';
    if (keyword) where.title = { contains: keyword, mode: 'insensitive' };
    if (source) {
      if (source === 'LUOGU' || source === 'CODEFORCES' || source === 'QOJ') {
        where.sourceInfo = { platform: source };
      } else {
        where.source = source;
      }
    }
    if (difficulty) where.difficulty = difficulty;
    if (tag) where.tags = { some: { name: tag } };

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
          sourceInfo: {
            select: { platform: true, remoteProblemId: true, remoteUrl: true },
          },
          tags: { select: { name: true } },
          _count: { select: { submissions: true } },
        },
        skip: (currentPage - 1) * currentPageSize,
        take: currentPageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.problem.count({ where }),
    ]);
    return { items, total, page: currentPage, pageSize: currentPageSize };
  }

  async findOne(id: string) {
    const problem = await this.prisma.problem.findUnique({
      where: { id },
      include: {
        versions: {
          where: { isCurrent: true },
          take: 1,
          include: {
            testCases: { orderBy: { order: 'asc' } },
            checker: true,
          },
        },
        tags: true,
        sourceInfo: true,
      },
    });
    if (!problem) throw new NotFoundException('题目不存在');
    return problem;
  }

  async update(id: string, dto: any) {
    const problem = await this.prisma.problem.findUnique({ where: { id } });
    if (!problem) throw new NotFoundException('题目不存在');

    if (problem.status === 'PUBLISHED' && (dto.description || dto.inputFormat)) {
      await this.prisma.problemVersion.updateMany({
        where: { problemId: id, isCurrent: true },
        data: { isCurrent: false },
      });
      const latest = await this.prisma.problemVersion.findFirst({
        where: { problemId: id },
        orderBy: { version: 'desc' },
      });
      await this.prisma.problemVersion.create({
        data: {
          problemId: id,
          version: (latest?.version || 1) + 1,
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
    const problem = await this.findOne(id);
    if (status === 'PUBLISHED' && problem.source === 'LOCAL') {
      const version = await this.prisma.problemVersion.findFirst({
        where: { problemId: id, isCurrent: true },
        select: { id: true },
      });
      if (!version) throw new NotFoundException('题目版本不存在');
      const testCount = await this.prisma.problemTestCase.count({
        where: { problemVersionId: version.id },
      });
      if (testCount === 0) throw new BadRequestException('发布题目前必须先上传测试数据包');
    }
    return this.prisma.problem.update({ where: { id }, data: { status } });
  }

  private normalizeJudgeMode(mode?: string): JudgeMode {
    return String(mode || 'STANDARD').toUpperCase() === 'SPJ' ? 'SPJ' : 'STANDARD';
  }

  private normalizeInlineTestCases(
    rawCases: Array<{ input?: string; expectedOutput?: string; score?: number; isSample?: boolean }>,
    judgeMode: JudgeMode,
    status: string,
  ) {
    if (!Array.isArray(rawCases) || rawCases.length === 0) {
      if (status === 'PUBLISHED') throw new BadRequestException('发布题目前必须先录入或上传测试数据');
      return [];
    }
    return rawCases.map((tc, index) => {
      const input = typeof tc.input === 'string' ? tc.input : '';
      const expectedOutput = typeof tc.expectedOutput === 'string' ? tc.expectedOutput : '';
      if (judgeMode === 'STANDARD' && tc.expectedOutput === undefined) {
        throw new BadRequestException(`普通题第 ${index + 1} 组测试数据必须录入输出数据`);
      }
      return {
        input,
        expectedOutput: judgeMode === 'SPJ' ? '' : expectedOutput,
        score: Number.isFinite(Number(tc.score)) ? Number(tc.score) : 10,
        order: index + 1,
        isSample: Boolean(tc.isSample),
      };
    });
  }

  private normalizeChecker(judgeMode: JudgeMode, language?: string, sourceCode?: string) {
    if (judgeMode === 'STANDARD') {
      return { type: 'STANDARD', language: null, sourceCode: null };
    }
    const checkerLanguage = String(language || '').trim();
    const checkerSource = String(sourceCode || '').trim();
    if (!checkerLanguage || !checkerSource) {
      throw new BadRequestException('SPJ 题目必须录入评测代码和评测代码语言');
    }
    return { type: 'SPJ', language: checkerLanguage, sourceCode: checkerSource };
  }

  private parseTestDataZip(file: Express.Multer.File, judgeMode: JudgeMode) {
    if (!file) throw new BadRequestException('请上传测试数据 ZIP 文件');
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('测试数据必须是 ZIP 格式');
    }
    if (!file.buffer || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw new BadRequestException('无效的 ZIP 文件');
    }

    const zip = new AdmZip(file.buffer);
    const byIndex = new Map<number, { input?: string; output?: string }>();
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory) continue;
      const normalized = entry.entryName.replace(/\\/g, '/');
      if (normalized.includes('..')) throw new BadRequestException('测试数据包不能包含非法路径');
      const base = path.posix.basename(normalized);
      const match = base.match(/^(\d+)\.(in|out|ans)$/i);
      if (!match) continue;
      const index = Number(match[1]);
      if (!Number.isInteger(index) || index <= 0) continue;
      const kind = match[2].toLowerCase();
      const item = byIndex.get(index) || {};
      if (kind === 'in') item.input = entry.getData().toString('utf8');
      else item.output = entry.getData().toString('utf8');
      byIndex.set(index, item);
    }

    const indexes = [...byIndex.keys()].sort((a, b) => a - b);
    if (indexes.length === 0) throw new BadRequestException('ZIP 中没有找到形如 1.in 的输入文件');
    const score = Math.floor(100 / indexes.length);
    const rest = 100 - score * indexes.length;

    return indexes.map((index, position) => {
      const item = byIndex.get(index)!;
      if (item.input === undefined) throw new BadRequestException(`缺少 ${index}.in 输入文件`);
      if (judgeMode === 'STANDARD' && item.output === undefined) {
        throw new BadRequestException(`普通题缺少 ${index}.out 或 ${index}.ans 输出文件`);
      }
      return {
        input: item.input,
        expectedOutput: judgeMode === 'SPJ' ? '' : item.output!,
        score: score + (position === indexes.length - 1 ? rest : 0),
        order: position + 1,
        isSample: false,
      };
    });
  }
}
