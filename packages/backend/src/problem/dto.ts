import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  Min,
  Max,
} from 'class-validator';

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
  @IsArray()
  tags?: string[];
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
  status?: string;
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
  @IsInt()
  page?: number;

  @IsOptional()
  @IsInt()
  pageSize?: number;
}
