import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as path from 'path';
import { FileUploadService } from '../common/file-upload.service';
import { PrismaService } from '../prisma/prisma.service';
import { normalizePointDifficulty } from './point-difficulty';

type JudgeMode = 'STANDARD' | 'SPJ';
type ProblemViewer = { id: string; role?: string };

const PROBLEM_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'CONTEST_RESERVED']);
const TEST_DATA_REQUIRED_STATUSES = new Set(['PUBLISHED', 'CONTEST_RESERVED']);

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

    const status = this.normalizeProblemStatus(dto.status);
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
        createdBy: userId,
        difficulty: normalizePointDifficulty(dto.difficulty),
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

  async uploadTestData(problemId: string, file: Express.Multer.File, viewer?: ProblemViewer) {
    if (viewer) await this.assertCanManageLocalProblem(problemId, viewer);
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
    await this.fillMissingSamplesFromFirstCase(version, cases, judgeMode);
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
    where.status = 'PUBLISHED';
    if (keyword) {
      const search = String(keyword).trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
        { sourceInfo: { is: { remoteProblemId: { contains: search, mode: 'insensitive' } } } },
        { sourceInfo: { is: { remoteUrl: { contains: search, mode: 'insensitive' } } } },
      ];
    }
    if (source) {
      if (source === 'LUOGU' || source === 'CODEFORCES' || source === 'QOJ') {
        where.sourceInfo = { platform: source };
      } else {
        where.source = source;
      }
    }
    if (difficulty) where.difficulty = normalizePointDifficulty(difficulty);
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

  async findAuthored(query: any, viewer: ProblemViewer) {
    const { keyword, status, page = 1, pageSize = 20 } = query;
    const where: any = { source: 'LOCAL' };
    const currentPage = Math.max(Number(page) || 1, 1);
    const currentPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    if (viewer.role !== 'ADMIN') where.createdBy = viewer.id;
    if (status) where.status = status;
    if (keyword) {
      const search = String(keyword).trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { id: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        select: {
          id: true,
          title: true,
          source: true,
          status: true,
          difficulty: true,
          timeLimit: true,
          memoryLimit: true,
          outputLimit: true,
          createdBy: true,
          createdAt: true,
          updatedAt: true,
          tags: { select: { name: true } },
          versions: {
            where: { isCurrent: true },
            take: 1,
            orderBy: { version: 'desc' },
            select: {
              id: true,
              version: true,
              description: true,
              sampleInput: true,
              sampleOutput: true,
              checker: true,
              _count: { select: { testCases: true } },
            },
          },
          _count: { select: { submissions: true } },
        },
        skip: (currentPage - 1) * currentPageSize,
        take: currentPageSize,
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.problem.count({ where }),
    ]);
    return { items, total, page: currentPage, pageSize: currentPageSize };
  }

  async findOne(id: string) {
    const problem = await this.prisma.problem.findFirst({
      where: { id, status: 'PUBLISHED' },
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
        createdAt: true,
        updatedAt: true,
        versions: {
          where: { isCurrent: true },
          take: 1,
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
            createdAt: true,
          },
        },
        tags: { select: { name: true, type: true } },
        sourceInfo: {
          select: {
            platform: true,
            remoteProblemId: true,
            remoteContestId: true,
            remoteProblemIndex: true,
            remoteUrl: true,
          },
        },
      },
    });
    if (!problem) throw new NotFoundException('题目不存在或尚未发布');
    return problem;
  }

  async findManageable(id: string, viewer: ProblemViewer) {
    await this.assertCanManageLocalProblem(id, viewer);
    const problem = await this.findProblemDetail(id);
    if (!problem) throw new NotFoundException('Problem not found');
    return problem;
  }

  async update(id: string, dto: any, viewer?: ProblemViewer) {
    if (viewer) await this.assertCanManageLocalProblem(id, viewer);
    const currentVersion = await this.prisma.problemVersion.findFirst({
      where: { problemId: id, isCurrent: true },
      include: { checker: true },
      orderBy: { version: 'desc' },
    });
    if (!currentVersion) throw new NotFoundException('Problem version not found');

    if (dto.status !== undefined) dto.status = this.normalizeProblemStatus(dto.status);
    const problemData = this.pickDefined({
      title: dto.title,
      difficulty: dto.difficulty === undefined ? undefined : normalizePointDifficulty(dto.difficulty),
      timeLimit: dto.timeLimit,
      memoryLimit: dto.memoryLimit,
      outputLimit: dto.outputLimit,
      status: dto.status,
    });
    const versionData = this.pickDefined({
      description: dto.description,
      inputFormat: dto.inputFormat,
      outputFormat: dto.outputFormat,
      sampleInput: dto.sampleInput,
      sampleOutput: dto.sampleOutput,
      hint: dto.hint,
      dataRange: dto.dataRange,
    });
    const wantsCheckerUpdate = dto.judgeMode !== undefined
      || dto.spjLanguage !== undefined
      || dto.spjSourceCode !== undefined;
    const checker = wantsCheckerUpdate
      ? this.normalizeChecker(
          dto.judgeMode !== undefined
            ? this.normalizeJudgeMode(dto.judgeMode)
            : (currentVersion.checker?.type === 'SPJ' ? 'SPJ' : 'STANDARD'),
          dto.spjLanguage ?? currentVersion.checker?.language ?? undefined,
          dto.spjSourceCode ?? currentVersion.checker?.sourceCode ?? undefined,
        )
      : null;

    if (TEST_DATA_REQUIRED_STATUSES.has(dto.status)) {
      const testCount = await this.prisma.problemTestCase.count({
        where: { problemVersionId: currentVersion.id },
      });
      if (testCount === 0) throw new BadRequestException('Publishing a local problem requires uploaded test data');
    }

    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(versionData).length) {
        await tx.problemVersion.update({
          where: { id: currentVersion.id },
          data: versionData,
        });
      }
      if (checker) {
        await tx.checker.upsert({
          where: { problemVersionId: currentVersion.id },
          create: { problemVersionId: currentVersion.id, ...checker },
          update: checker,
        });
      }
      if (Array.isArray(dto.tags)) {
        const tags = dto.tags.map((name: string) => String(name).trim()).filter(Boolean);
        await tx.problemTag.deleteMany({ where: { problemId: id } });
        if (tags.length) {
          await tx.problemTag.createMany({
            data: tags.map((name: string) => ({ problemId: id, name, type: 'TAG' })),
          });
        }
      }
      return tx.problem.update({
        where: { id },
        data: problemData,
      });
    });
  }

  async delete(id: string, viewer?: ProblemViewer) {
    if (viewer) await this.assertCanManageLocalProblem(id, viewer);
    const problem = await this.findProblemDetail(id);
    if (!problem) throw new NotFoundException('Problem not found');
    return this.prisma.problem.delete({ where: { id } });
  }

  async updateStatus(id: string, status: string, viewer?: ProblemViewer) {
    const nextStatus = this.normalizeProblemStatus(status);
    if (viewer) await this.assertCanManageLocalProblem(id, viewer);
    const problem = await this.findProblemDetail(id);
    if (!problem) throw new NotFoundException('Problem not found');
    if (TEST_DATA_REQUIRED_STATUSES.has(nextStatus) && problem.source === 'LOCAL') {
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
    return this.prisma.problem.update({ where: { id }, data: { status: nextStatus } });
  }

  private async findProblemDetail(id: string) {
    return this.prisma.problem.findUnique({
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
  }

  private async assertCanManageLocalProblem(problemId: string, viewer: ProblemViewer) {
    const problem = await this.prisma.problem.findUnique({
      where: { id: problemId },
      select: { id: true, source: true, createdBy: true },
    });
    if (!problem) throw new NotFoundException('Problem not found');
    if (problem.source !== 'LOCAL') throw new BadRequestException('Only locally authored problems can be edited here');
    if (viewer.role === 'ADMIN') return problem;
    if (problem.createdBy && problem.createdBy === viewer.id) return problem;
    throw new ForbiddenException('No permission to modify this problem');
  }

  private pickDefined<T extends Record<string, any>>(data: T) {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  }

  private normalizeProblemStatus(status?: string) {
    const value = String(status || 'DRAFT').toUpperCase();
    if (!PROBLEM_STATUSES.has(value)) throw new BadRequestException('Invalid problem status');
    return value;
  }

  private normalizeJudgeMode(mode?: string): JudgeMode {
    return String(mode || 'STANDARD').toUpperCase() === 'SPJ' ? 'SPJ' : 'STANDARD';
  }

  private async fillMissingSamplesFromFirstCase(
    version: { id: string; sampleInput?: string | null; sampleOutput?: string | null },
    cases: Array<{ input: string; expectedOutput: string }>,
    judgeMode: JudgeMode,
  ) {
    const firstCase = cases[0];
    if (!firstCase) return;

    const data: { sampleInput?: string; sampleOutput?: string } = {};
    if (!String(version.sampleInput || '').trim()) data.sampleInput = firstCase.input;
    if (judgeMode === 'STANDARD' && !String(version.sampleOutput || '').trim()) {
      data.sampleOutput = firstCase.expectedOutput;
    }
    if (Object.keys(data).length === 0) return;

    await this.prisma.problemVersion.update({
      where: { id: version.id },
      data,
    });
  }

  private normalizeInlineTestCases(
    rawCases: Array<{ input?: string; expectedOutput?: string; score?: number; isSample?: boolean }>,
    judgeMode: JudgeMode,
    status: string,
  ) {
    if (!Array.isArray(rawCases) || rawCases.length === 0) {
      if (TEST_DATA_REQUIRED_STATUSES.has(status)) throw new BadRequestException('发布题目前必须先录入或上传测试数据');
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
