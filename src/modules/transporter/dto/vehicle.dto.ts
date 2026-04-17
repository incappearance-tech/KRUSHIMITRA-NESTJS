import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateVehicleDto {
  @ApiProperty({ description: 'Type of vehicle', example: 'Mini Truck' })
  @IsString()
  type: string;

  @ApiProperty({ description: 'Vehicle model', example: 'Tata Ace Gold' })
  @IsString()
  model: string;

  @ApiPropertyOptional({ description: 'License plate number', example: 'MH 12 AB 1234' })
  @IsString()
  @IsOptional()
  numberPlate?: string;

  @ApiPropertyOptional({ description: 'Load capacity', example: '1.5 Ton' })
  @IsString()
  @IsOptional()
  capacity?: string;

  @ApiPropertyOptional({ description: 'Rate per km', example: 30 })
  @IsNumber()
  @IsOptional()
  ratePerKm?: number;

  @ApiPropertyOptional({ description: 'Name of the driver' })
  @IsString()
  @IsOptional()
  driverName?: string;

  @ApiPropertyOptional({ description: 'Driver phone number' })
  @IsString()
  @IsOptional()
  driverPhone?: string;

  @ApiPropertyOptional({ description: 'Driver license number' })
  @IsString()
  @IsOptional()
  driverLicense?: string;

  @ApiPropertyOptional({ description: 'Subscription plan', example: 'monthly' })
  @IsString()
  @IsOptional()
  plan?: string;

  @ApiPropertyOptional({ description: 'Subscription expiry date (ISO string)' })
  @IsString()
  @IsOptional()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Availability status', example: true })
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Vehicle images (URLs or local URIs)' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({
    description: 'Human-readable operating area (auto-built from GPS + radius)',
    example: 'Nagpur (50km radius)',
  })
  @IsString()
  @IsOptional()
  operatingArea?: string;

  @ApiPropertyOptional({
    description: 'Operating radius in km from vehicle current GPS location',
    example: 50,
  })
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  operatingRadius?: number;

  @ApiPropertyOptional({ description: 'Vehicle GPS latitude', example: 21.1458 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  locationLat?: number;

  @ApiPropertyOptional({ description: 'Vehicle GPS longitude', example: 79.0882 })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  locationLng?: number;
}

export class UpdateVehicleDto extends CreateVehicleDto {}
