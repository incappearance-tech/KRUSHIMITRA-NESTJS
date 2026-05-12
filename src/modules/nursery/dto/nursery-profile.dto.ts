import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NurseryProductCategory } from '@prisma/client';

export class CreateNurseryProfileDto {
  @ApiProperty({ description: 'Nursery business name', example: 'Green Valley Nursery' })
  @IsString()
  nurseryName: string;

  @ApiPropertyOptional({ description: 'Owner full name', example: 'Ramesh Patil' })
  @IsString()
  @IsOptional()
  ownerName?: string;

  @ApiPropertyOptional({ description: 'Business description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Product categories the nursery specializes in',
    enum: NurseryProductCategory,
    isArray: true,
    example: ['FRUIT_PLANT', 'VEGETABLE_SEEDLING'],
  })
  @IsArray()
  @IsEnum(NurseryProductCategory, { each: true })
  specializations: NurseryProductCategory[];

  @ApiPropertyOptional({ description: 'Full address' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ description: 'Village name' })
  @IsString()
  @IsOptional()
  village?: string;

  @ApiPropertyOptional({ description: 'Taluka name' })
  @IsString()
  @IsOptional()
  taluka?: string;

  @ApiPropertyOptional({ description: 'District name' })
  @IsString()
  @IsOptional()
  district?: string;

  @ApiPropertyOptional({ description: 'GST number (optional)' })
  @IsString()
  @IsOptional()
  gstNumber?: string;

  @ApiPropertyOptional({ description: 'WhatsApp contact number' })
  @IsString()
  @IsOptional()
  whatsappNumber?: string;

  @ApiPropertyOptional({ description: 'Delivery available flag' })
  @IsBoolean()
  @IsOptional()
  deliveryAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Business photo URLs' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  businessPhotos?: string[];

  @ApiPropertyOptional({ description: 'GPS latitude' })
  @IsNumber()
  @IsOptional()
  locationLat?: number;

  @ApiPropertyOptional({ description: 'GPS longitude' })
  @IsNumber()
  @IsOptional()
  locationLng?: number;
}

export class UpdateNurseryProfileDto extends CreateNurseryProfileDto {}
