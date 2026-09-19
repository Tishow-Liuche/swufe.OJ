import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { CodeforcesModule } from '../codeforces/cf.module';
import { TeacherModule } from '../teacher/teacher.module';

@Module({
  imports: [CodeforcesModule, TeacherModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
