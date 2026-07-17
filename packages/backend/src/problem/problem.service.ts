import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import * as path from 'path';
import { FileUploadService } from '../common/file-upload.service';
import { PROBLEM_ACTIONS, ProblemAccessService, type ProblemAction, type ProblemActor } from '../common/problem-access.service';
import { sanitizeProblemContent } from '../common/content-sanitizer';
import { PrismaService } from '../prisma/prisma.service';

type JudgeMode = 'STANDARD' | 'SPJ';

const MAX_ZIP_ENTRIES = 200;
const MAX_ZIP_ENTRY_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_ZIP_COMPRESSION_RATIO = 100;

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
    testCases?: Array<{ input?: string; expectedOutput?: string; score?: number; isSample?: boolean }>;
  }, actor: ProblemActor) {
    const existing = await this.prisma.problem.findFirst({ where: { title: dto.title } });
    if (existing) throw new BadRequestException('题目标题已存在');

    const status = dto.status || 'DRAFT';
    const judgeMode = this.normalizeJudgeMode(dto.judgeMode);
    const testCases = this.normalizeInlineTestCases(dto.testCases || [], judgeMode, status);
    const checker = this.normalizeChecker(judgeMode, dto.spjLanguage, dto.spjSourceCode);

    const versionCreate: any = {
      version: 1,
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

  async uploadTestData(problemId: string, file: Express.Multer.File, actor: ProblemActor) {
    await this.problemAccess.assertCanManage(problemId, actor, 'MANAGE_TESTDATA');
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

  async uploadChecker(problemId: string, file: Express.Multer.File, type: string, language: string, actor: ProblemActor) {
    await this.problemAccess.assertCanManage(problemId, actor, 'MANAGE_CHECKER');
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
    const { keyword, source, difficulty, tag, page = 1, pageSize = 20 } = query;
    const where: any = {};
    const currentPage = Math.max(Number(page) || 1, 1);
    const currentPageSize = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    // This endpoint is public. Management queries must use a separately guarded API.
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

  async update(id: string, dto: any, actor: ProblemActor) {
    await this.problemAccess.assertCanManage(id, actor, 'EDIT');
    const problem = await this.prisma.problem.findUnique({ where: { id } });
    if (!problem) throw new NotFoundException('题目不存在');

    if (dto.status !== undefined && dto.status !== problem.status) {
      await this.problemAccess.assertCanManage(id, actor, 'PUBLISH');
    }

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
          description: sanitizeProblemContent(dto.description || ''),
          inputFormat: this.sanitizeOptionalContent(dto.inputFormat),
          outputFormat: this.sanitizeOptionalContent(dto.outputFormat),
          sampleInput: this.sanitizeOptionalContent(dto.sampleInput),
          sampleOutput: this.sanitizeOptionalContent(dto.sampleOutput),
          hint: this.sanitizeOptionalContent(dto.hint),
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
    await this.problemAccess.assertCanManage(id, actor, 'PUBLISH');
    const problem = await this.prisma.problem.findUnique({
      where: { id },
      select: { id: true, source: true },
    });
    if (!problem) throw new NotFoundException('题目不存在');
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

  private sanitizeOptionalContent(value?: string) {
    return value === undefined ? undefined : sanitizeProblemContent(value);
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
    const entries = zip.getEntries();
    this.validateZipBudget(entries);
    const byIndex = new Map<number, { input?: string; output?: string }>();
    for (const entry of entries) {
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

  validateZipBudget(entries: Array<{ isDirectory: boolean; header?: { size?: number; compressedSize?: number } }>) {
    let fileCount = 0;
    let totalSize = 0;

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      fileCount++;
      if (fileCount > MAX_ZIP_ENTRIES) {
        throw new BadRequestException('ZIP 条目数量超过限制');
      }

      const size = Number(entry.header?.size);
      const compressedSize = Number(entry.header?.compressedSize);
      if (!Number.isFinite(size) || !Number.isFinite(compressedSize) || size < 0 || compressedSize < 0) {
        throw new BadRequestException('ZIP 条目大小无效');
      }
      if (size > MAX_ZIP_ENTRY_BYTES) {
        throw new BadRequestException('单个文件解压后大小超过限制');
      }

      totalSize += size;
      if (totalSize > MAX_ZIP_TOTAL_BYTES) {
        throw new BadRequestException('解压后大小超过限制');
      }
      if (size > 0 && (compressedSize === 0 || size / compressedSize > MAX_ZIP_COMPRESSION_RATIO)) {
        throw new BadRequestException('ZIP 压缩比超过限制');
      }
    }
  }
}
