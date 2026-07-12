import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProblemModule } from './problem/problem.module';
import { SubmissionModule } from './submission/submission.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../config/.env'],
    }),
    PrismaModule,
    AuthModule,
    ProblemModule,
    SubmissionModule,
  ],
})
export class AppModule {}
