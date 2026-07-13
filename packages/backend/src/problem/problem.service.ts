import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FileUploadService } from '../common/file-upload.service';

@Injectable()
export class ProblemService {
  constructor(
    private prisma: PrismaService,
    private fileUpload: FileUploadService,
  ) {}

  /** 创建完整题目（含测试数据、标程等） */
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
  }, userId: string) {
    // 检查重复标题
    const existing = await this.prisma.problem.findFirst({ where: { title: dto.title } });
    if (existing) throw new BadRequestException('题目标题已存在');

    const problem = await this.prisma.problem.create({
      data: {
        title: dto.title,
        source: 'LOCAL',
        status: dto.status || 'DRAFT',
        difficulty: dto.difficulty || 'POPULAR',
        timeLimit: dto.timeLimit || 1000,
        memoryLimit: dto.memoryLimit || 256,
        outputLimit: dto.outputLimit || 64,
        allowLanguages: dto.allowLanguages || ['cpp', 'c', 'python', 'java'],
        versions: {
          create: {
            version: 1,
            description: dto.description,
            inputFormat: dto.inputFormat,
            outputFormat: dto.outputFormat,
            sampleInput: dto.sampleInput,
            sampleOutput: dto.sampleOutput,
            hint: dto.hint,
            dataRange: dto.dataRange,
          },
        },
        tags: {
          create: (dto.tags || []).map((name) => ({ name, type: 'TAG' })),
        },
      },
      include: {
        versions: { where: { isCurrent: true }, take: 1 },
        tags: true,
      },
    });
    return problem;
  }

  /** 上传测试数据 */
  async uploadTestData(problemId: string, file: Express.Multer.File) {
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) throw new NotFoundException('题目不存在');

    // 检查测试数据包是否有效
    const result = await this.fileUpload.uploadTestData(file, problemId);

    // 创建 TestGroup 记录
    const version = await this.prisma.problemVersion.findFirst({
      where: { problemId, isCurrent: true },
    });
    if (!version) throw new NotFoundException('题目版本不存在');

    // 删除旧测试组
    await this.prisma.testGroup.deleteMany({ where: { problemVersionId: version.id } });

    // 创建测试组（记录存储路径）
    await this.prisma.testGroup.create({
      data: {
        problemVersionId: version.id,
        name: file.originalname,
        score: 100,
        testCount: 0,
        order: 1,
      },
    });

    return {
      status: 'uploaded',
      path: result.path,
      size: result.totalSize,
      fileName: file.originalname,
    };
  }

  /** 上传 Markdown 图片 */
  async uploadImage(file: Express.Multer.File) {
    const s3Path = await this.fileUpload.uploadImage(file);
    const url = await this.fileUpload.getPresignedUrl(s3Path);
    return { url: `s3://${s3Path}`, previewUrl: url };
  }

  /** 上传标程（Checker / Standard Program） */
  async uploadChecker(problemId: string, file: Express.Multer.File, type: string, language: string) {
    const problem = await this.prisma.problem.findUnique({ where: { id: problemId } });
    if (!problem) throw new NotFoundException('题目不存在');

    const version = await this.prisma.problemVersion.findFirst({
      where: { problemId, isCurrent: true },
    });
    if (!version) throw new NotFoundException('版本不存在');

    const s3Path = await this.fileUpload.uploadFile(file, `checkers/${problemId}`);

    // 更新或创建 Checker
    await this.prisma.checker.upsert({
      where: { problemVersionId: version.id },
      create: {
        problemVersionId: version.id,
        type,
        language,
        sourceCode: '', // 二进制文件，存 S3 路径
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
    const where: any = { status: 'PUBLISHED' };
    if (keyword) where.title = { contains: keyword, mode: 'insensitive' };
    if (source) where.source = source;
    if (difficulty) where.difficulty = difficulty;
    if (tag) where.tags = { some: { name: tag } };

    const [items, total] = await Promise.all([
      this.prisma.problem.findMany({
        where,
        select: {
          id: true, title: true, source: true, difficulty: true,
          timeLimit: true, memoryLimit: true, createdAt: true,
          tags: { select: { name: true } },
          _count: { select: { submissions: true } },
        },
        skip: (page - 1) * pageSize, take: pageSize,
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

  async update(id: string, dto: any) {
    const problem = await this.prisma.problem.findUnique({ where: { id } });
    if (!problem) throw new NotFoundException('题目不存在');

    if (problem.status === 'PUBLISHED' && (dto.description || dto.inputFormat)) {
      await this.prisma.problemVersion.updateMany({
        where: { problemId: id, isCurrent: true }, data: { isCurrent: false },
      });
      const latest = await this.prisma.problemVersion.findFirst({
        where: { problemId: id }, orderBy: { version: 'desc' },
      });
      await this.prisma.problemVersion.create({
        data: {
          problemId: id, version: (latest?.version || 1) + 1,
          description: dto.description || '',
          inputFormat: dto.inputFormat, outputFormat: dto.outputFormat,
          sampleInput: dto.sampleInput, sampleOutput: dto.sampleOutput,
          hint: dto.hint,
        },
      });
    }

    return this.prisma.problem.update({
      where: { id },
      data: {
        title: dto.title, difficulty: dto.difficulty,
        timeLimit: dto.timeLimit, memoryLimit: dto.memoryLimit,
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
    return this.prisma.problem.update({ where: { id }, data: { status } });
  }
}
