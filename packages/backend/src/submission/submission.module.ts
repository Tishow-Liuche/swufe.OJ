import { Module } from '@nestjs/common';
import { SubmissionService } from './submission.service';
import { SubmissionController } from './submission.controller';
import { CfHelperController } from './cf-helper.controller';
import { LuoguHelperController } from '../luogu/luogu-helper.controller';
import { QojHelperController } from '../qoj/qoj-helper.controller';
import { JudgeModule } from '../judge/judge.module';
import { HelperModule } from '../helper/helper.module';
import { CodeforcesModule } from '../codeforces/cf.module';
import { LuoguModule } from '../luogu/luogu.module';
import { LearningModule } from '../learning/learning.module';
import { QojModule } from '../qoj/qoj.module';
import { TeacherModule } from '../teacher/teacher.module';
import { registerJudgeQueue } from './judge-queue';

export { createRedisConnectionOptions } from './judge-queue';

@Module({
  imports: [
    JudgeModule, HelperModule, CodeforcesModule, LuoguModule, LearningModule, QojModule, TeacherModule,
    registerJudgeQueue(),
  ],
  controllers: [SubmissionController, CfHelperController, LuoguHelperController, QojHelperController],
  providers: [SubmissionService],
  exports: [SubmissionService],
})
export class SubmissionModule {}
