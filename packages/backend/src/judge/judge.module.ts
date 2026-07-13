import { Module } from '@nestjs/common';
import { JudgeService } from './judge.service';
import { NativeJudgeService } from './native-judge.service';

@Module({
  providers: [JudgeService, NativeJudgeService],
  exports: [JudgeService, NativeJudgeService],
})
export class JudgeModule {}
