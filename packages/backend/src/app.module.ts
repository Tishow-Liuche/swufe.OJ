import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProblemModule } from './problem/problem.module';
import { SubmissionModule } from './submission/submission.module';
import { UserModule } from './user/user.module';
import { FileUploadModule } from './common/file-upload.module';
import { PublicModule } from './public/public.module';
import { TeacherModule } from './teacher/teacher.module';
import { SyncModule } from './sync/sync.module';
import { HelperModule } from './helper/helper.module';
import { CodeforcesModule } from './codeforces/cf.module';
import { ContestModule } from './contest/contest.module';
import { CommunityModule } from './community/community.module';
import { AtCoderModule } from './atcoder/atcoder.module';
import { LearningModule } from './learning/learning.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../config/.env'] }),
    FileUploadModule, PrismaModule, AuthModule, ProblemModule,
    SubmissionModule, UserModule, TeacherModule, SyncModule,
    HelperModule, CodeforcesModule, PublicModule,
    ContestModule, CommunityModule, AtCoderModule, LearningModule,
  ],
})
export class AppModule {}
