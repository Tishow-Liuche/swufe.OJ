jest.mock('minio', () => ({ Client: jest.fn() }));

import * as Minio from 'minio';
import { FileUploadService } from './file-upload.service';

describe('FileUploadService production storage routing', () => {
  const internalClient = {
    bucketExists: jest.fn(),
    makeBucket: jest.fn(),
    putObject: jest.fn(),
    removeObject: jest.fn(),
  };
  const publicClient = {
    presignedGetObject: jest.fn(),
  };

  const config = {
    getOrThrow: (key: string) => ({
      S3_ENDPOINT: 'minio',
      S3_PORT: '9000',
      S3_ACCESS_KEY: 'access-key',
      S3_SECRET_KEY: 'secret-key',
      S3_BUCKET: 'oj-testdata',
      S3_PUBLIC_ENDPOINT: 'subswufe.duckdns.org',
      S3_PUBLIC_PORT: '443',
    } as Record<string, string>)[key],
    get: (key: string, fallback?: string) => ({
      S3_USE_SSL: 'false',
      S3_PUBLIC_ENDPOINT: 'subswufe.duckdns.org',
      S3_PUBLIC_PORT: '443',
      S3_PUBLIC_USE_SSL: 'true',
      S3_REGION: 'us-east-1',
    } as Record<string, string>)[key] ?? fallback,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    internalClient.bucketExists.mockResolvedValue(true);
    (Minio.Client as unknown as jest.Mock)
      .mockImplementationOnce(() => internalClient)
      .mockImplementationOnce(() => publicClient);
  });

  it('uses the internal client for startup and the public client for presigned URLs', async () => {
    const service = new FileUploadService(config as any);

    expect(Minio.Client).toHaveBeenNthCalledWith(1, {
      endPoint: 'minio',
      port: 9000,
      useSSL: false,
      accessKey: 'access-key',
      secretKey: 'secret-key',
      region: 'us-east-1',
    });
    expect(Minio.Client).toHaveBeenNthCalledWith(2, {
      endPoint: 'subswufe.duckdns.org',
      port: 443,
      useSSL: true,
      accessKey: 'access-key',
      secretKey: 'secret-key',
      region: 'us-east-1',
    });

    await (service as any).onModuleInit();
    expect(internalClient.bucketExists).toHaveBeenCalledWith('oj-testdata');

    publicClient.presignedGetObject.mockResolvedValue('https://subswufe.duckdns.org/oj-testdata/image.png');
    await expect(service.getPresignedUrl('s3://oj-testdata/image.png')).resolves.toContain('subswufe.duckdns.org');
    expect(publicClient.presignedGetObject).toHaveBeenCalledWith('oj-testdata', 'image.png', 300);
  });

  it('fails startup when the internal bucket cannot be initialized', async () => {
    internalClient.bucketExists.mockRejectedValue(new Error('MinIO unavailable'));
    const service = new FileUploadService(config as any);

    await expect((service as any).onModuleInit()).rejects.toThrow('MinIO unavailable');
  });
});
