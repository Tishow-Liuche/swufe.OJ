import { Module } from '@nestjs/common';
import { TeacherService } from './teacher.service';
import { TeacherController } from './teacher.controller';
import { AssignmentProgressService } from './assignment-progress.service';
import { NotificationOutboxService } from './notification-outbox.service';

@Module({
  controllers: [TeacherController],
  providers: [TeacherService, AssignmentProgressService, NotificationOutboxService],
  exports: [TeacherService, AssignmentProgressService, NotificationOutboxService],
})
export class TeacherModule {}
