import { Module } from '@nestjs/common';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';

import { CfSyncController } from './cf-sync.controller';
import { LuoguAdapter } from './adapters/luogu.adapter';
import { QojAdapter } from './adapters/qoj.adapter';

const syncAdapterBootstrapProvider = {
  provide: 'SYNC_ADAPTER_BOOTSTRAP',
  useFactory: (syncService: SyncService) => {
    syncService.registerAdapter(new LuoguAdapter());
    syncService.registerAdapter(new QojAdapter());
    return true;
  },
  inject: [SyncService],
};

@Module({
  controllers: [SyncController, CfSyncController],
  providers: [SyncService, syncAdapterBootstrapProvider],
  exports: [SyncService],
})
export class SyncModule {}
