import { IsString, IsNotEmpty, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetAvailabilityDto {
  @ApiProperty({ description: 'Date to set availability for (ISO string)' })
  @IsString()
  @IsNotEmpty()
  date: string;

  @ApiProperty({
    description: 'Availability state',
    enum: ['AVAILABLE', 'BUSY', 'MAINTENANCE', 'DRIVER_UNAVAILABLE'],
  })
  @IsString()
  @IsIn(['AVAILABLE', 'BUSY', 'MAINTENANCE', 'DRIVER_UNAVAILABLE'])
  state: 'AVAILABLE' | 'BUSY' | 'MAINTENANCE' | 'DRIVER_UNAVAILABLE';

  @ApiPropertyOptional({ description: 'Optional note/reason' })
  @IsString()
  @IsOptional()
  note?: string;
}
