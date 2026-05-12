import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateRentalRequestDto {
  @ApiProperty({ description: 'Start date (YYYY-MM-DD)', example: '2026-05-10' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'Number of days to rent', example: 2 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  numberOfDays: number;

  @ApiPropertyOptional({ description: 'Optional message to the owner', maxLength: 300 })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RejectRentalRequestDto {
  @ApiPropertyOptional({ description: 'Reason for rejection', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  rejectReason?: string;
}
