import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { MediaDto } from '@gitroom/nestjs-libraries/dtos/media/media.dto';

export class SanityDto {
  @IsString()
  @MinLength(2)
  @IsDefined()
  title: string;

  @IsOptional()
  @IsString()
  excerpt?: string;

  @IsString()
  @MinLength(2)
  @IsDefined()
  author: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  main_image?: MediaDto;

  @IsOptional()
  @IsString()
  @IsIn(['publish', 'draft'])
  status?: string;
}
