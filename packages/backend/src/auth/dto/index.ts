import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(3, { message: '用户名至少 3 个字符' })
  @MaxLength(20, { message: '用户名最多 20 个字符' })
  @Matches(/^[A-Za-z0-9_-]+$/, { message: '用户名只能包含字母、数字、下划线和连字符' })
  username: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @MaxLength(72, { message: '密码最多 72 位' })
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, { message: '密码需同时包含字母和数字' })
  password: string;

  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2, { message: '请选择学校' })
  @MaxLength(80, { message: '学校名称最多 80 个字符' })
  school: string;

  @ValidateIf((dto) => dto.requestedRole === 'STUDENT')
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MinLength(2, { message: '请选择或填写所在学院' })
  @MaxLength(80, { message: '学院名称最多 80 个字符' })
  college?: string;

  @IsIn(['STUDENT', 'TEACHER'], { message: '身份只能选择学生或教师' })
  requestedRole: 'STUDENT' | 'TEACHER';

  @IsOptional()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(20)
  nickname?: string;
}

export class LoginDto {
  @ValidateIf((dto) => !dto.username)
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  account?: string;

  // Backward compatibility for existing clients.
  @ValidateIf((dto) => !dto.account)
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  username?: string;

  @IsString()
  @MaxLength(72)
  password: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}
