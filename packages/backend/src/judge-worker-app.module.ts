import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { JudgeWorkerModule } from './submission/judge-worker.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../config/.env'] }),
    PrismaModule,
    JudgeWorkerModule,
  ],
})
export class JudgeWorkerAppModule {}
