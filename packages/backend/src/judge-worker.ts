import { NestFactory } from '@nestjs/core';
import { JudgeWorkerAppModule } from './judge-worker-app.module';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(JudgeWorkerAppModule);
  app.enableShutdownHooks();
  console.log('SWUFE Singularity OJ judge worker started');
}

bootstrap();
