import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

export function createRedisConnectionOptions(c: ConfigService) {
  const port = Number(c.getOrThrow<string>('REDIS_PORT'));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('REDIS_PORT must be a valid TCP port');
  }
  const password = c.get<string>('REDIS_PASSWORD');
  return {
    host: c.getOrThrow<string>('REDIS_HOST'),
    port,
    ...(password ? { password } : {}),
  };
}

export function registerJudgeQueue() {
  return BullModule.registerQueueAsync({
    name: 'judge',
    imports: [ConfigModule],
    inject: [ConfigService],
    useFactory: (c: ConfigService) => ({
      connection: createRedisConnectionOptions(c),
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    }),
  });
}
