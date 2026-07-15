import { Module } from '@nestjs/common';
import { PublicController } from './public.controller';
import { ContestModule } from '../contest/contest.module';

@Module({
  imports: [ContestModule],
  controllers: [PublicController],
})
export class PublicModule {}
