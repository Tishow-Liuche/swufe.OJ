import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { AtCoderService } from './atcoder.service';
import { ImportAtCoderProblemDto, UpdateAtCoderPlatformDto } from './dto';

@Controller('api/atcoder')
export class AtCoderController {
  constructor(private readonly atcoder: AtCoderService) {}

  @Get('platform')
  getPlatformStatus() {
    return this.atcoder.getPlatformStatus();
  }

  @Post('problems/import')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('TEACHER', 'ADMIN')
  importProblem(@Body() dto: ImportAtCoderProblemDto) {
    return this.atcoder.importProblem(dto.url);
  }

  @Patch('platform')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('ADMIN')
  updatePlatform(@Body() dto: UpdateAtCoderPlatformDto) {
    return this.atcoder.updatePlatform(dto.enabled, dto.reason);
  }
}
