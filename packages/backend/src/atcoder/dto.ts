import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';

export class ImportAtCoderProblemDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url: string;
}

export class UpdateAtCoderPlatformDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
