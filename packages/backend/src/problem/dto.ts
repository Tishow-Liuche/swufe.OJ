import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  IsIn,
  ValidateNested,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PROBLEM_ACTIONS } from '../common/problem-access.service';

export class ProblemTestCaseDto {
  @IsString()
  input: string;

  @IsOptional()
  @IsString()
  expectedOutput?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  score?: number;

  @IsOptional()
  isSample?: boolean;
}

export class CreateProblemDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(60000)
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(16)
  @Max(4096)
  memoryLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(1024)
  outputLimit?: number;

  @IsOptional()
  @IsArray()
  allowLanguages?: string[];

  @IsOptional()
  @IsString()
  inputFormat?: string;

  @IsOptional()
  @IsString()
  outputFormat?: string;

  @IsOptional()
  @IsString()
  sampleInput?: string;

  @IsOptional()
  @IsString()
  sampleOutput?: string;

  @IsOptional()
  @IsString()
  hint?: string;

  @IsOptional()
  @IsString()
  dataRange?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  judgeMode?: string;

  @IsOptional()
  @IsString()
  spjLanguage?: string;

  @IsOptional()
  @IsString()
  spjSourceCode?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProblemTestCaseDto)
  testCases?: ProblemTestCaseDto[];
}

export class UpdateProblemDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsInt()
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  memoryLimit?: number;

  @IsOptional()
  @IsInt()
  outputLimit?: number;

  @IsOptional()
  @IsString()
  inputFormat?: string;

  @IsOptional()
  @IsString()
  outputFormat?: string;

  @IsOptional()
  @IsString()
  sampleInput?: string;

  @IsOptional()
  @IsString()
  sampleOutput?: string;

  @IsOptional()
  @IsString()
  hint?: string;

  @IsOptional()
  @IsString()
  dataRange?: string;

  @IsOptional()
  @IsArray()
  tags?: string[];

  @IsOptional()
  @IsString()
  judgeMode?: string;

  @IsOptional()
  @IsString()
  spjLanguage?: string;

  @IsOptional()
  @IsString()
  spjSourceCode?: string;

  @IsOptional()
  @IsString()
  status?: string;
}

export class ImportProblemDto {
  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsInt()
  timeLimit?: number;

  @IsOptional()
  @IsInt()
  memoryLimit?: number;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class BatchImportDto {
  @IsArray()
  problems: ImportProblemDto[];
}

export class AssignProblemOwnerDto {
  @IsString()
  @MaxLength(128)
  ownerId: string;
}

export class GrantProblemPermissionDto {
  @IsString()
  @MaxLength(128)
  targetId: string;

  @IsIn(PROBLEM_ACTIONS)
  permission: string;
}

export class QueryProblemDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  difficulty?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}

export class QueryAuthoredProblemDto {
  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;
}
