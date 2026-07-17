import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { LearningController } from './learning.controller';
import { ProblemListsController } from './problem-lists.controller';
import { LearningService } from './learning.service';

@Module({
  imports: [PrismaModule],
  controllers: [LearningController, ProblemListsController],
  providers: [LearningService],
  exports: [LearningService],
})
export class LearningModule {}
