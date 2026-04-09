import { IsInt, IsOptional, IsString, IsNumber } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransporterProfileDto {
  @ApiPropertyOptional({ description: 'Name of the transport business' })
  @IsString()
  @IsOptional()
  businessName?: string;

  @ApiPropertyOptional({ description: 'Operating radius in km', example: 50 })
  @IsInt()
  @IsOptional()
  operatingRadius?: number;

  @ApiPropertyOptional({ description: 'Years of driver experience' })
  @IsString()
  @IsOptional()
  experience?: string;

  @ApiPropertyOptional({ description: 'Latitude' })
  @IsNumber()
  @IsOptional()
  locationLat?: number;

  @ApiPropertyOptional({ description: 'Longitude' })
  @IsNumber()
  @IsOptional()
  locationLng?: number;
}

export class UpdateTransporterProfileDto extends CreateTransporterProfileDto { }
