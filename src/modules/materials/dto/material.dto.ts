import { IsString, IsUrl, IsOptional, IsLatitude, IsLongitude, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateFarmerMaterialDto {
  @ApiProperty({ description: 'Name of the material to sell' })
  @IsString()
  materialName: string;

  @ApiProperty({ description: 'S3 URL of the material photo' })
  @IsUrl()
  photoUrl: string;
}

export class BrowseMaterialsDto {
  @ApiPropertyOptional({ description: 'Latitude for nearby search' })
  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @ApiPropertyOptional({ description: 'Longitude for nearby search' })
  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;

  @ApiPropertyOptional({ description: 'Radius in km (default 50)' })
  @IsOptional()
  @Type(() => Number)
  radius?: number;

  @ApiPropertyOptional({ description: 'Page number for pagination' })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Number of items per page' })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by material name (case-insensitive partial match)' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  searchQuery?: string;
}
