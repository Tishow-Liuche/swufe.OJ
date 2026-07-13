import { Module } from '@nestjs/common';
import { HelperService } from './helper.service';
import { HelperController, HelperTaskController } from './helper.controller';
import { HelperGateway } from './helper.gateway';

@Module({
  controllers: [HelperController, HelperTaskController],
  providers: [HelperService, HelperGateway],
  exports: [HelperService, HelperGateway],
})
export class HelperModule {}
