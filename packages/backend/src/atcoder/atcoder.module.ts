import { Module } from '@nestjs/common';
import { AtCoderController } from './atcoder.controller';
import { AtCoderReadonlyAdapter } from './atcoder-readonly.adapter';
import { AtCoderService } from './atcoder.service';
import { ProblemAccessService } from '../common/problem-access.service';

@Module({
  controllers: [AtCoderController],
  providers: [AtCoderReadonlyAdapter, AtCoderService, ProblemAccessService],
  exports: [AtCoderReadonlyAdapter, AtCoderService],
})
export class AtCoderModule {}
