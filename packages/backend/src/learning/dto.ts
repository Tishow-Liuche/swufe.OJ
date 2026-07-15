import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProblemListDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class UpdateProblemListDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}

export class AddProblemListItemDto {
  @IsString()
  problemId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class ReorderProblemListItemDto {
  @IsString()
  itemId: string;

  @IsInt()
  @Min(0)
  order: number;
}

export class ReorderProblemListDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReorderProblemListItemDto)
  items: ReorderProblemListItemDto[];
}

export class CreateLearningPlanDto {
  @IsString()
  @MaxLength(80)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsIn(['DAILY', 'WEEKLY', 'MONTHLY', 'CUSTOM'])
  type?: string;

  @IsDateString()
  startDate: string;

  @IsDateString()
  endDate: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  dailyTarget?: number;
}

export class UpdateLearningPlanDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  dailyTarget?: number;
}

export class AddLearningPlanItemDto {
  @IsString()
  problemId: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  dayIndex?: number;

  @IsOptional()
  @IsIn(['PRACTICE', 'REVIEW', 'CHALLENGE'])
  type?: string;
}

export class CheckInLearningPlanDto {
  @IsOptional()
  @IsDateString()
  date?: string;
}

export class ToggleFavoriteDto {
  @IsString()
  problemId: string;
}

export class UpsertWrongBookDto {
  @IsString()
  problemId: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  errorType?: string;
}

export class CreateProblemNoteDto {
  @IsString()
  problemId: string;

  @IsString()
  @MaxLength(10000)
  content: string;

  @IsOptional()
  @IsDateString()
  nextReviewAt?: string;
}

export class UpdateProblemNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  content?: string;

  @IsOptional()
  @IsDateString()
  nextReviewAt?: string;

  @IsOptional()
  @IsIn(['ACTIVE', 'MASTERED', 'ARCHIVED'])
  reviewStatus?: string;
}
