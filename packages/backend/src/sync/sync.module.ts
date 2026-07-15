import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

import { CfSyncController } from './cf-sync.controller';

@Module({
  controllers: [SyncController, CfSyncController],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
