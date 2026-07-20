import { createRedisConnectionOptions } from './submission.module';

describe('createRedisConnectionOptions', () => {
  it('does not require a Redis password for local development', () => {
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'REDIS_HOST') return 'localhost';
        if (key === 'REDIS_PORT') return '6379';
        throw new Error(`Missing ${key}`);
      }),
      get: jest.fn(() => undefined),
    };

    expect(createRedisConnectionOptions(config as any)).toEqual({
      host: 'localhost',
      port: 6379,
    });
  });

  it('passes Redis password only when configured', () => {
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'REDIS_HOST') return 'redis.internal';
        if (key === 'REDIS_PORT') return '6380';
        throw new Error(`Missing ${key}`);
      }),
      get: jest.fn((key: string) => (key === 'REDIS_PASSWORD' ? 'secret' : undefined)),
    };

    expect(createRedisConnectionOptions(config as any)).toEqual({
      host: 'redis.internal',
      port: 6380,
      password: 'secret',
    });
  });
});
