import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';
import * as crypto from 'crypto';
import * as path from 'path';

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private client: Minio.Client;
  private bucket: string;

  constructor(private config: ConfigService) {
    this.client = new Minio.Client({
      endPoint: config.get('S3_ENDPOINT', 'localhost'),
      port: parseInt(config.get('S3_PORT', '9000')),
      useSSL: config.get('S3_USE_SSL', 'false') === 'true',
      accessKey: config.get('S3_ACCESS_KEY', 'minioadmin'),
      secretKey: config.get('S3_SECRET_KEY', 'minioadmin_dev'),
    });
    this.bucket = config.get('S3_BUCKET', 'oj-testdata');
    this.ensureBucket();
  }

  private async ensureBucket() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) await this.client.makeBucket(this.bucket);
      this.logger.log(`Bucket "${this.bucket}" ready`);
    } catch (e) {
      this.logger.warn(`MinIO init warning: ${(e as any).message}`);
    }
  }

  /** 上传文件到 MinIO，返回文件路径 */
  async uploadFile(file: Express.Multer.File, prefix: string): Promise<string> {
    const ext = path.extname(file.originalname);
    const key = `${prefix}/${crypto.randomUUID()}${ext}`;

    await this.client.putObject(this.bucket, key, file.buffer, file.size, {
      'Content-Type': file.mimetype,
      'x-amz-meta-original-name': Buffer.from(file.originalname, 'latin1').toString('utf8'),
    });

    return `s3://${this.bucket}/${key}`;
  }

  /** 上传测试数据 ZIP 包 */
  async uploadTestData(file: Express.Multer.File, problemId: string): Promise<{
    path: string;
    fileCount: number;
    totalSize: number;
  }> {
    // 校验文件类型
    if (!file.originalname.endsWith('.zip')) {
      throw new BadRequestException('测试数据必须为 ZIP 格式');
    }

    // 文件大小限制 50MB
    if (file.size > 50 * 1024 * 1024) {
      throw new BadRequestException('测试数据包不能超过 50MB');
    }

    // 校验 ZIP 内容（防止 zip bomb 和非法路径）
    await this.validateZip(file);

    const key = `testdata/${problemId}/${crypto.randomUUID()}.zip`;
    await this.client.putObject(this.bucket, key, file.buffer, file.size, {
      'Content-Type': 'application/zip',
      'x-amz-meta-original-name': file.originalname,
    });

    return {
      path: `s3://${this.bucket}/${key}`,
      fileCount: 0, // 解压后才能确定
      totalSize: file.size,
    };
  }

  /** 获取文件下载签名 URL（5 分钟有效） */
  async getPresignedUrl(s3Path: string): Promise<string> {
    const { bucket, key } = this.parseS3Path(s3Path);
    return this.client.presignedGetObject(bucket, key, 5 * 60);
  }

  /** 删除文件 */
  async deleteFile(s3Path: string) {
    const { bucket, key } = this.parseS3Path(s3Path);
    await this.client.removeObject(bucket, key);
  }

  /** 上传 Markdown 中的图片 */
  async uploadImage(file: Express.Multer.File): Promise<string> {
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('仅支持 PNG/JPEG/GIF/WebP/SVG 图片');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('图片不能超过 5MB');
    }
    return this.uploadFile(file, 'images');
  }

  /** 上传用户头像，限制为可安全展示的常见位图格式。 */
  async uploadAvatar(file: Express.Multer.File): Promise<string> {
    if (!file) throw new BadRequestException('请选择头像图片');
    const allowedTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('头像仅支持 PNG/JPEG/GIF/WebP 图片');
    }
    if (file.size > 2 * 1024 * 1024) {
      throw new BadRequestException('头像图片不能超过 2MB');
    }
    return this.uploadFile(file, 'avatars');
  }

  private async validateZip(file: Express.Multer.File) {
    // 检查 ZIP 文件头
    if (file.buffer[0] !== 0x50 || file.buffer[1] !== 0x4b) {
      throw new BadRequestException('无效的 ZIP 文件');
    }

    // 检查压缩比（防 zip bomb）
    const ratio = file.buffer.length / file.size;
    if (ratio > 1 && file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('文件异常：解压后大小超过限制');
    }
  }

  private parseS3Path(s3Path: string): { bucket: string; key: string } {
    const match = s3Path.match(/^s3:\/\/([^\/]+)\/(.+)$/);
    if (!match) throw new BadRequestException('Invalid S3 path');
    return { bucket: match[1], key: match[2] };
  }
}
