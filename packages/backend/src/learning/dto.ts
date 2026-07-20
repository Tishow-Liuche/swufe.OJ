import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

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
  problemListId: string;
}

export class UpdateLearningPlanDto {
  @IsString()
  @IsIn(['ACTIVE', 'COMPLETED'])
  status: string;
}

export class ProblemStatesDto {
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  problemIds: string[];
}

export class SaveProblemDraftDto {
  @IsString()
  @MaxLength(30)
  language: string;

  @IsString()
  @MaxLength(200000)
  sourceCode: string;
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

export class ResolveWrongBookDto {
  @IsBoolean()
  favorite: boolean;
}
