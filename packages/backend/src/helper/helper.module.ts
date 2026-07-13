import { Module } from '@nestjs/common';
import { HelperService } from './helper.service';
import { HelperController } from './helper.controller';
import { HelperGateway } from './helper.gateway';

@Module({
  controllers: [HelperController],
  providers: [HelperService, HelperGateway],
  exports: [HelperService, HelperGateway],
})
export class HelperModule {}
