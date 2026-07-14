import { Module } from '@nestjs/common';
import { AtCoderController } from './atcoder.controller';
import { AtCoderReadonlyAdapter } from './atcoder-readonly.adapter';
import { AtCoderService } from './atcoder.service';

@Module({
  controllers: [AtCoderController],
  providers: [AtCoderReadonlyAdapter, AtCoderService],
  exports: [AtCoderReadonlyAdapter, AtCoderService],
})
export class AtCoderModule {}
