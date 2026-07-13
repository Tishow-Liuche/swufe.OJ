import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';

@Module({
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
