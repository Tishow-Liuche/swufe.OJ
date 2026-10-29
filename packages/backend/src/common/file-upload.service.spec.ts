import { BadRequestException } from '@nestjs/common';
import { validateHeaderValue } from 'node:http';
import { FileUploadService } from './file-upload.service';

describe('FileUploadService filename metadata', () => {
  it.each(['avatar.png', 'my avatar.png', '头像.png', '头像😀.png', 'café.png', '100%.png', 'a\r\nb.png'])('safely stores filename %s through avatar and image uploads', async (name) => {
    for (const originalname of [name, Buffer.from(name).toString('latin1')]) {
      const service = Object.create(FileUploadService.prototype) as FileUploadService;
      const putObject = jest.fn(async (_bucket, _key, _buffer, _size, metadata: Record<string, string>) => {
        for (const [key, value] of Object.entries(metadata)) validateHeaderValue(key, value);
        expect(Buffer.from(metadata['x-amz-meta-original-name'], 'base64').toString('utf8')).toBe(name);
        expect(metadata['x-amz-meta-original-name-encoding']).toBe('base64');
      });
      Object.assign(service, { storageClient: { putObject }, bucket: 'test' });
      const file = { originalname, mimetype: 'image/png', size: 4, buffer: Buffer.from('test') } as Express.Multer.File;
      await expect(service.uploadAvatar(file)).resolves.toMatch(/^s3:\/\/test\/avatars\//);
      await expect(service.uploadImage(file)).resolves.toMatch(/^s3:\/\/test\/images\//);
      expect(putObject).toHaveBeenCalledTimes(2);
    }
  });

  it('encodes ZIP filename metadata too', async () => {
    const service = Object.create(FileUploadService.prototype) as FileUploadService;
    const putObject = jest.fn(async (_b, _k, _buf, _s, metadata) => {
      validateHeaderValue('x-amz-meta-original-name', metadata['x-amz-meta-original-name']);
      expect(Buffer.from(metadata['x-amz-meta-original-name'], 'base64').toString()).toBe('测试数据.zip');
    });
    Object.assign(service, { storageClient: { putObject }, bucket: 'test' });
    await service.uploadTestData({ originalname: '测试数据.zip', size: 2, buffer: Buffer.from('PK') } as Express.Multer.File, 'p1');
    expect(putObject).toHaveBeenCalledTimes(1);
  });
});

describe('FileUploadService avatar uploads', () => {
  let service: FileUploadService;

  beforeEach(() => {
    service = Object.create(FileUploadService.prototype) as FileUploadService;
    service.uploadFile = jest.fn();
  });

  it('stores a valid bitmap avatar under the avatar prefix', async () => {
    const file = {
      originalname: 'avatar.webp',
      mimetype: 'image/webp',
      size: 1024,
      buffer: Buffer.from('image'),
    } as Express.Multer.File;
    (service.uploadFile as jest.Mock).mockResolvedValue('s3://oj-testdata/avatars/avatar.webp');

    const result = await service.uploadAvatar(file);

    expect(service.uploadFile).toHaveBeenCalledWith(file, 'avatars');
    expect(result).toBe('s3://oj-testdata/avatars/avatar.webp');
  });

  it('rejects an SVG avatar before it reaches object storage', async () => {
    const file = {
      originalname: 'avatar.svg',
      mimetype: 'image/svg+xml',
      size: 1024,
      buffer: Buffer.from('<svg />'),
    } as Express.Multer.File;

    await expect(service.uploadAvatar(file)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.uploadFile).not.toHaveBeenCalled();
  });
});
