import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProblemModule } from './problem/problem.module';
import { SubmissionModule } from './submission/submission.module';
import { UserModule } from './user/user.module';
import { FileUploadModule } from './common/file-upload.module';
import { PublicModule } from './public/public.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../config/.env'],
    }),
    FileUploadModule,
    PrismaModule,
    AuthModule,
    ProblemModule,
    SubmissionModule,
    UserModule,
    PublicModule,
  ],
})
export class AppModule {}
