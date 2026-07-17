import { Module } from '@nestjs/common';
import { ProblemService } from './problem.service';
import { ProblemController } from './problem.controller';
import { ProblemAccessService } from '../common/problem-access.service';

@Module({
  controllers: [ProblemController],
  providers: [ProblemService, ProblemAccessService],
  exports: [ProblemService],
})
export class ProblemModule {}
