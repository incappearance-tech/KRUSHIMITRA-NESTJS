import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateLabourBookingDto {
  @ApiProperty({
    description: 'LabourProfile ID to book',
    example: 'uuid-here',
  })
  @IsString()
  @IsNotEmpty()
  labourId: string;

  @ApiProperty({ description: 'Type of task', example: 'Harvesting' })
  @IsString()
  @IsNotEmpty()
  taskType: string;

  @ApiProperty({
    description: 'Date of work (ISO string)',
    example: '2026-03-01T00:00:00.000Z',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Number of days required', example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  numberOfDays?: number;

  @ApiProperty({
    description: 'Work location / village',
    example: 'Pune, Maharashtra',
  })
  @IsString()
  @IsNotEmpty()
  location: string;

  @ApiPropertyOptional({ description: 'Number of workers needed', example: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  workers?: number;
}

export class UpdateBookingStatusDto {
  @ApiProperty({
    description: 'New status',
    example: 'accepted',
    enum: ['accepted', 'rejected', 'completed'],
  })
  @IsString()
  @IsNotEmpty()
  status: string;
}
