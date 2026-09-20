import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as path from 'path';
import { FileUploadService } from '../common/file-upload.service';
import { PROBLEM_ACTIONS, ProblemAccessService, type ProblemAction, type ProblemActor } from '../common/problem-access.service';
import { sanitizeProblemContent } from '../common/content-sanitizer';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { normalizePointDifficulty } from './point-difficulty';
import { readTestDataEntry } from './test-data-zip';

type JudgeMode = 'STANDARD' | 'SPJ';

const PROBLEM_STATUSES = new Set(['DRAFT', 'PUBLISHED', 'CONTEST_RESERVED']);
const TEST_DATA_REQUIRED_STATUSES = new Set(['PUBLISHED', 'CONTEST_RESERVED']);

const MAX_ZIP_ENTRIES = 200;
const MAX_ZIP_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024;

@Injectable()
export class ProblemService {
  constructor(
    private prisma: PrismaService,
    private fileUpload: FileUploadService,
    private problemAccess: ProblemAccessService,
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
    spjProtocol?: string;
    testCases?: Array<{ input?: string; expectedOutput?: string; score?: number; isSample?: boolean }>;
  }, actor: ProblemActor) {
    const existing = await this.prisma.problem.findFirst({ where: { title: dto.title } });
    if (existing) throw new BadRequestException('题目标题已存在');

    const status = this.normalizeProblemStatus(dto.status);
    const judgeMode = this.normalizeJudgeMode(dto.judgeMode);
    const testCases = this.normalizeInlineTestCases(dto.testCases || [], judgeMode, status);
    const checker = this.normalizeChecker(judgeMode, dto.spjLanguage, dto.spjSourceCode, dto.spjProtocol);

    const versionCreate: any = {
      version: 1,
      timeLimit: dto.timeLimit || 1000,
      memoryLimit: dto.memoryLimit || 256,
      description: sanitizeProblemContent(dto.description),
      inputFormat: this.sanitizeOptionalContent(dto.inputFormat),
      outputFormat: this.sanitizeOptionalContent(dto.outputFormat),
      sampleInput: this.sanitizeOptionalContent(dto.sampleInput),
      sampleOutput: this.sanitizeOptionalContent(dto.sampleOutput),
      hint: this.sanitizeOptionalContent(dto.hint),
      dataRange: this.sanitizeOptionalContent(dto.dataRange),
      checker: { create: checker },
    };
    if (testCases.length > 0) versionCreate.testCases = { create: testCases };

    return this.prisma.problem.create({
      data: {
        createdById: actor.id,
        title: dto.title,
        source: 'LOCAL',
        status,
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

  async uploadTestData(problemId: string, file: Express.Multer.File, actor: ProblemActor) {
    await this.problemAccess.assertCanManage(problemId, actor, 'MANAGE_TESTDATA');
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) throw new NotFoundException('题目不存在');

    return this.prisma.$transaction(async (tx) => {
      const version = await this.lockCurrentVersion(tx, problemId);
      const latestProblem = await tx.problem.findUniqueOrThrow({ where: { id: problemId } });
      const judgeMode: JudgeMode = version.checker?.type === 'SPJ' ? 'SPJ' : 'STANDARD';
      const cases = this.parseTestDataZip(file, judgeMode);
      const samples: Record<string, string> = {};
      // Large judge fixtures are not page samples; avoid bloating subsequent edits.
      if (Buffer.byteLength(cases[0].input) + Buffer.byteLength(cases[0].expectedOutput) <= 64 * 1024) {
        if (!String(version.sampleInput || '').trim()) samples.sampleInput = cases[0].input;
        if (judgeMode === 'STANDARD' && !String(version.sampleOutput || '').trim()) samples.sampleOutput = cases[0].expectedOutput;
      }
      const created = await this.publishVersion(tx, version, latestProblem, {
        ...samples, testCases: cases,
        testGroups: [{ name: file.originalname, score: 100, testCount: cases.length, order: 1 }],
      });
      return { status: 'imported', fileName: file.originalname, size: file.size, testCount: cases.length, judgeMode, versionId: created.id };
    }, { timeout: 30000 });
  }

  async uploadImage(file: Express.Multer.File) {
    const s3Path = await this.fileUpload.uploadImage(file);
    const url = await this.fileUpload.getPresignedUrl(s3Path);
    return { url: this.publicObjectUrl(s3Path), previewUrl: url, s3Path };
  }

  async uploadChecker(problemId: string, file: Express.Multer.File, type: string, language: string, actor: ProblemActor, protocol?: string) {
    await this.problemAccess.assertCanManage(problemId, actor, 'MANAGE_CHECKER');
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) throw new NotFoundException('题目不存在');

    if (!file?.buffer?.length || file.buffer.length > 1024 * 1024) throw new BadRequestException('请上传不超过 1MB 的 UTF-8 判题源码');
    let source: string;
    try { source = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer); }
    catch { throw new BadRequestException('判题源码必须为 UTF-8 文本'); }
    if (source.includes('\0')) throw new BadRequestException('不能上传二进制判题程序，请上传源码');
    return this.prisma.$transaction(async (tx) => {
      const version = await this.lockCurrentVersion(tx, problemId);
      const checker = this.normalizeChecker(this.normalizeJudgeMode(type), language, source,
        protocol ?? (version.checker?.type === 'SPJ' ? version.checker.protocol || 'LEGACY' : undefined));
      const latestProblem = await tx.problem.findUniqueOrThrow({ where: { id: problemId } });
      const created = await this.publishVersion(tx, version, latestProblem, {
        checker, ...this.modeChangeData(version, checker, latestProblem.status),
      });
      return { versionId: created.id, type: checker.type, language: checker.language, protocol: checker.protocol };
    }, { timeout: 30000 });
  }

  async findAll(query: any) {
    const { keyword, source, difficulty, status, tag, page = 1, pageSize = 20 } = query;
    const where: any = {};
    const currentPage = Math.max(Number(page) || 1, 1);
    const currentPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    where.status = 'PUBLISHED';
    if (keyword) {
      const search = String(keyword).trim();
      const platformNo = this.parsePlatformProblemNo(search);
      if (platformNo) {
        where.problemNo = platformNo;
      } else {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { id: { contains: search, mode: 'insensitive' } },
          { sourceInfo: { is: { remoteProblemId: { contains: search, mode: 'insensitive' } } } },
          { sourceInfo: { is: { remoteUrl: { contains: search, mode: 'insensitive' } } } },
        ];
      }
    }
    if (source) {
      if (!['LOCAL', 'REMOTE'].includes(source)) {
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
          problemNo: true,
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
        orderBy: { problemNo: 'asc' },
      }),
      this.prisma.problem.count({ where }),
    ]);
    return { items, total, page: currentPage, pageSize: currentPageSize };
  }

  async getMetadata() {
    const publishedWhere = { status: 'PUBLISHED' };
    const [total, localCount, tagGroups, difficultyGroups, sourceGroups] = await Promise.all([
      this.prisma.problem.count({ where: publishedWhere }),
      this.prisma.problem.count({ where: { ...publishedWhere, source: 'LOCAL' } }),
      this.prisma.problemTag.groupBy({
        by: ['name'],
        where: { problem: publishedWhere },
        _count: { name: true },
        orderBy: [{ _count: { name: 'desc' } }, { name: 'asc' }],
      }),
      this.prisma.problem.groupBy({
        by: ['difficulty'],
        where: publishedWhere,
        _count: { _all: true },
      }),
      this.prisma.problemSource.groupBy({
        by: ['platform'],
        where: { problem: publishedWhere },
        _count: { _all: true },
      }),
    ]);

    return {
      total,
      tags: tagGroups.map((item) => ({ name: item.name, count: item._count.name })),
      difficulties: difficultyGroups.map((item) => ({ difficulty: item.difficulty, count: item._count._all })),
      sources: [
        ...(localCount > 0 ? [{ source: 'LOCAL', count: localCount }] : []),
        ...sourceGroups.map((item) => ({ source: item.platform, count: item._count._all })),
      ],
    };
  }

  async findAuthored(query: any, viewer: ProblemActor) {
    const { keyword, status, page = 1, pageSize = 20 } = query;
    const where: any = { source: 'LOCAL' };
    const currentPage = Math.max(Number(page) || 1, 1);
    const currentPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    if (viewer.role !== 'ADMIN') where.createdById = viewer.id;
    if (status) where.status = status;
    if (keyword) {
      const search = String(keyword).trim();
      const platformNo = this.parsePlatformProblemNo(search);
      if (platformNo) {
        where.problemNo = platformNo;
      } else {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { id: { contains: search, mode: 'insensitive' } },
        ];
      }
    }

    const [items, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        select: {
          id: true,
          problemNo: true,
          title: true,
          source: true,
          status: true,
          difficulty: true,
          timeLimit: true,
          memoryLimit: true,
          outputLimit: true,
          createdById: true,
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
              checker: { select: { type: true } },
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
        problemNo: true,
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

  async findManageable(id: string, actor: ProblemActor) {
    await this.problemAccess.assertCanManage(id, actor, 'EDIT');
    const problem = await this.findProblemDetail(id);
    if (!problem) throw new NotFoundException('题目不存在');
    if (problem.source !== 'LOCAL') throw new BadRequestException('仅支持在此编辑本地录入题目');
    return problem;
  }

  async update(id: string, dto: any, actor: ProblemActor) {
    await this.problemAccess.assertCanManage(id, actor, 'EDIT');
    const problem = await this.prisma.problem.findUnique({ where: { id } });
    if (!problem) throw new NotFoundException('题目不存在');
    if (dto.status !== undefined && dto.status !== problem.status) {
      await this.problemAccess.assertCanManage(id, actor, 'PUBLISH');
    }

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
      description: this.sanitizeOptionalContent(dto.description),
      inputFormat: this.sanitizeOptionalContent(dto.inputFormat),
      outputFormat: this.sanitizeOptionalContent(dto.outputFormat),
      sampleInput: this.sanitizeOptionalContent(dto.sampleInput),
      sampleOutput: this.sanitizeOptionalContent(dto.sampleOutput),
      hint: this.sanitizeOptionalContent(dto.hint),
      dataRange: this.sanitizeOptionalContent(dto.dataRange),
    });
    const wantsCheckerUpdate = dto.judgeMode !== undefined
      || dto.spjLanguage !== undefined
      || dto.spjSourceCode !== undefined || dto.spjProtocol !== undefined;

    return this.prisma.$transaction(async (tx) => {
      const currentVersion = await this.lockCurrentVersion(tx, id);
      const latestProblem = await tx.problem.findUniqueOrThrow({ where: { id } });
      if (TEST_DATA_REQUIRED_STATUSES.has(dto.status) && currentVersion.testCases.length === 0) {
        throw new BadRequestException('发布题目前必须先上传测试数据');
      }
      const checker = wantsCheckerUpdate ? this.normalizeChecker(
        dto.judgeMode !== undefined ? this.normalizeJudgeMode(dto.judgeMode) : (currentVersion.checker?.type === 'SPJ' ? 'SPJ' : 'STANDARD'),
        dto.spjLanguage ?? currentVersion.checker?.language ?? undefined,
        dto.spjSourceCode ?? currentVersion.checker?.sourceCode ?? undefined,
        dto.spjProtocol ?? (currentVersion.checker?.type === 'SPJ' ? currentVersion.checker.protocol || 'LEGACY' : undefined),
      ) : null;
      if (Object.keys(versionData).length || checker || dto.timeLimit !== undefined || dto.memoryLimit !== undefined) {
        await this.publishVersion(tx, currentVersion, latestProblem, {
          ...versionData, ...(checker ? { checker } : {}),
          ...this.modeChangeData(currentVersion, checker, dto.status ?? latestProblem.status),
          timeLimit: dto.timeLimit ?? latestProblem.timeLimit,
          memoryLimit: dto.memoryLimit ?? latestProblem.memoryLimit,
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
    }, { timeout: 30000 });
  }
  async delete(id: string, actor: ProblemActor) {
    await this.problemAccess.assertCanManage(id, actor, 'DELETE');
    const problem = await this.prisma.problem.findUnique({ where: { id }, select: { id: true } });
    if (!problem) throw new NotFoundException('题目不存在');
    return this.prisma.problem.delete({ where: { id } });
  }

  async assignOwner(problemId: string, ownerId: string, actor: ProblemActor) {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenException('只有管理员可以转交题目所有权');
    }
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, role: true },
    });
    if (!owner || !['TEACHER', 'ADMIN'].includes(owner.role)) {
      throw new BadRequestException('题目所有者必须是教师或管理员');
    }
    return this.prisma.problem.update({
      where: { id: problemId },
      data: { createdById: owner.id },
    });
  }

  async grantPermission(
    problemId: string,
    dto: { targetId: string; permission: string },
    actor: ProblemActor,
  ) {
    await this.problemAccess.assertCanChangePermissions(problemId, actor);
    const permission = String(dto.permission || '').toUpperCase() as ProblemAction;
    if (!PROBLEM_ACTIONS.includes(permission)) {
      throw new BadRequestException('不支持的题目委派权限');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: dto.targetId },
      select: { id: true, role: true },
    });
    if (!target || !['TEACHER', 'ADMIN'].includes(target.role)) {
      throw new BadRequestException('只能向教师或管理员委派题目管理权限');
    }
    const data = {
      problemId,
      targetType: 'USER',
      targetId: target.id,
      permission,
    };
    return this.prisma.problemPermission.upsert({
      where: { problemId_targetType_targetId_permission: data },
      create: data,
      update: {},
    });
  }

  async removePermission(problemId: string, permissionId: string, actor: ProblemActor) {
    await this.problemAccess.assertCanChangePermissions(problemId, actor);
    const result = await this.prisma.problemPermission.deleteMany({
      where: { id: permissionId, problemId },
    });
    if (result.count === 0) throw new NotFoundException('题目委派权限不存在');
    return { deleted: true };
  }

  async updateStatus(id: string, status: string, actor: ProblemActor) {
    const nextStatus = this.normalizeProblemStatus(status);
    await this.problemAccess.assertCanManage(id, actor, 'PUBLISH');
    return this.prisma.$transaction(async (tx) => {
      // Publication and data changes must serialize on the same key.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`problem-version:${id}`}, 0))`;
      const problem = await tx.problem.findUnique({
        where: { id }, select: { id: true, source: true },
      });
      if (!problem) throw new NotFoundException('题目不存在');
      if (TEST_DATA_REQUIRED_STATUSES.has(nextStatus) && problem.source === 'LOCAL') {
        const version = await this.lockCurrentVersion(tx, id);
        if (version.testCases.length === 0) throw new BadRequestException('发布题目前必须先上传测试数据包');
      }
      return tx.problem.update({ where: { id }, data: { status: nextStatus } });
    }, { timeout: 30000 });
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

  private pickDefined<T extends Record<string, any>>(data: T) {
    return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
  }

  private normalizeProblemStatus(status?: string) {
    const value = String(status || 'DRAFT').toUpperCase();
    if (!PROBLEM_STATUSES.has(value)) throw new BadRequestException('Invalid problem status');
    return value;
  }

  private publicObjectUrl(s3Path: string) {
    const match = s3Path.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) return s3Path;
    return `/${match[1]}/${match[2]}`;
  }

  private normalizeJudgeMode(mode?: string): JudgeMode {
    return String(mode || 'STANDARD').toUpperCase() === 'SPJ' ? 'SPJ' : 'STANDARD';
  }

  private sanitizeOptionalContent(value?: string) {
    return value === undefined ? undefined : sanitizeProblemContent(value);
  }

  private async lockCurrentVersion(tx: Prisma.TransactionClient, problemId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`problem-version:${problemId}`}, 0))`;
    const version = await tx.problemVersion.findFirst({
      where: { problemId, isCurrent: true }, orderBy: { version: 'desc' },
      include: { checker: true, testCases: { orderBy: { order: 'asc' } }, testGroups: true },
    });
    if (!version) throw new NotFoundException('题目版本不存在');
    return version;
  }

  private modeChangeData(previous: any, checker: any, status: string) {
    if (previous.checker?.type === 'SPJ' && checker?.type === 'STANDARD' && previous.testCases.length) {
      if (status !== 'DRAFT') throw new BadRequestException('改为普通题前请先设为草稿，再重新上传包含输出文件的测试数据');
      return { testCases: [], testGroups: [] };
    }
    return {};
  }

  private async publishVersion(tx: Prisma.TransactionClient, previous: any, problem: any, patch: any) {
    const value = { ...previous, ...patch };
    const checker = value.checker;
    // Old rows and their test cases remain immutable for queued submissions/rejudges.
    await tx.problemVersion.updateMany({ where: { problemId: problem.id, isCurrent: true }, data: { isCurrent: false } });
    return tx.problemVersion.create({ data: {
      problemId: problem.id, version: previous.version + 1, isCurrent: true,
      description: value.description, inputFormat: value.inputFormat, outputFormat: value.outputFormat,
      sampleInput: value.sampleInput, sampleOutput: value.sampleOutput, hint: value.hint, dataRange: value.dataRange,
      timeLimit: patch.timeLimit ?? previous.timeLimit ?? problem.timeLimit,
      memoryLimit: patch.memoryLimit ?? previous.memoryLimit ?? problem.memoryLimit,
      ...(checker ? { checker: { create: {
        type: checker.type, language: checker.language, sourceCode: checker.sourceCode, protocol: checker.protocol || 'LEGACY',
      } } } : {}),
      testCases: { create: value.testCases.map(({ input, expectedOutput, score, order, isSample }: any) => ({ input, expectedOutput, score, order, isSample })) },
      testGroups: { create: value.testGroups.map(({ name, score, testCount, order }: any) => ({ name, score, testCount, order })) },
    } });
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

  private normalizeChecker(judgeMode: JudgeMode, language?: string, sourceCode?: string, protocol?: string) {
    if (judgeMode === 'STANDARD') {
      return { type: 'STANDARD', language: null, sourceCode: null, protocol: 'BOOLEAN_STDOUT' };
    }
    const checkerLanguage = String(language || '').trim();
    const checkerSource = String(sourceCode || '').trim();
    if (!checkerLanguage || !checkerSource) {
      throw new BadRequestException('SPJ 题目必须录入评测代码和评测代码语言');
    }
    if (!['cpp', 'c', 'python', 'java'].includes(checkerLanguage)) throw new BadRequestException('不支持的 SPJ 语言');
    const checkerProtocol = protocol || 'BOOLEAN_STDOUT';
    if (!['BOOLEAN_STDOUT', 'EXIT_CODE', 'LEGACY'].includes(checkerProtocol)) throw new BadRequestException('不支持的 SPJ 判定协议');
    return { type: 'SPJ', language: checkerLanguage, sourceCode: checkerSource, protocol: checkerProtocol };
  }

  private parseTestDataZip(file: Express.Multer.File, judgeMode: JudgeMode) {
    if (!file) throw new BadRequestException('请上传测试数据 ZIP 文件');
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('测试数据必须是 ZIP 格式');
    }
    if (!file.buffer || file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw new BadRequestException('无效的 ZIP 文件');
    }

    if (file.buffer.length > 50 * 1024 * 1024) throw new BadRequestException('测试数据 ZIP 不能超过 50MB');
    let entries: AdmZip.IZipEntry[];
    try {
      entries = new AdmZip(file.buffer).getEntries();
    } catch {
      throw new BadRequestException('ZIP 文件结构损坏，请重新打包后上传');
    }
    this.validateZipBudget(entries);
    const byName = new Map<string, { name: string; index: number; input?: string; output?: string }>();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const normalized = entry.entryName.replace(/\\/g, '/');
      if (normalized.includes('..')) throw new BadRequestException('测试数据包不能包含非法路径');
      const base = path.posix.basename(normalized);
      const match = base.match(/^(.*?(\d+))\.(in|out|ans)$/i);
      if (!match) continue;
      const name = match[1];
      const index = Number(match[2]);
      if (!Number.isSafeInteger(index) || index <= 0) continue;
      const kind = match[3].toLowerCase();
      const item = byName.get(name) || { name, index };
      const field = kind === 'in' ? 'input' : 'output';
      if (item[field] !== undefined) throw new BadRequestException(`测试点 ${name} 的${kind === 'in' ? '输入' : '输出'}文件重复，请保留一份同名文件`);
      item[field] = readTestDataEntry(entry, MAX_ZIP_ENTRY_BYTES).toString('utf8');
      byName.set(name, item);
    }

    const cases = [...byName.values()].sort((a, b) => a.index - b.index || a.name.localeCompare(b.name, 'en'));
    if (cases.length === 0) throw new BadRequestException('ZIP 中没有找到形如 1.in 或 abs1.in 的输入文件，文件名须以正整数编号结尾');
    const score = Math.floor(100 / cases.length);
    const rest = 100 - score * cases.length;

    return cases.map((item, position) => {
      if (item.input === undefined) throw new BadRequestException(`缺少 ${item.name}.in 输入文件`);
      if (judgeMode === 'STANDARD' && item.output === undefined) {
        throw new BadRequestException(`普通题缺少 ${item.name}.out 或 ${item.name}.ans 输出文件`);
      }
      return {
        input: item.input,
        expectedOutput: judgeMode === 'SPJ' ? '' : item.output!,
        score: score + (position === cases.length - 1 ? rest : 0),
        order: position + 1,
        isSample: false,
      };
    });
  }

  validateZipBudget(entries: Array<{ isDirectory: boolean; header?: { size?: number; compressedSize?: number } }>) {
    let fileCount = 0;
    let totalSize = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      fileCount++;
      if (fileCount > MAX_ZIP_ENTRIES) {
        throw new BadRequestException('ZIP 条目数量超过限制，最多 200 个文件');
      }

      const size = Number(entry.header?.size);
      const compressedSize = Number(entry.header?.compressedSize);
      if (!Number.isSafeInteger(size) || !Number.isSafeInteger(compressedSize) || size < 0 || compressedSize < 0 || (size > 0 && compressedSize === 0)) {
        throw new BadRequestException('ZIP 条目大小无效');
      }
      if (size > MAX_ZIP_ENTRY_BYTES) {
        throw new BadRequestException('单个文件解压后大小超过限制，最大 64 MiB');
      }

      totalSize += size;
      if (totalSize > MAX_ZIP_TOTAL_BYTES) {
        throw new BadRequestException('解压后大小超过限制，全部文件合计最大 100MB');
      }
    }
  }

  private parsePlatformProblemNo(search: string) {
    const match = search.match(/^T\s*(\d+)$/i);
    if (!match) return null;
    const value = Number.parseInt(match[1], 10);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
}
