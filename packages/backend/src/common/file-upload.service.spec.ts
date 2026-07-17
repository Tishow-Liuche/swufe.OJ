import { BadRequestException } from '@nestjs/common';
import { FileUploadService } from './file-upload.service';

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
