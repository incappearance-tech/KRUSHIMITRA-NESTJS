import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NurseryProductCategory, ProductUnit } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateNurseryProductDto {
  @ApiProperty({ description: 'Product name', example: 'Alphonso Mango Plant' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: NurseryProductCategory })
  @IsEnum(NurseryProductCategory)
  category: NurseryProductCategory;

  @ApiProperty({ description: 'Price per unit in INR', example: 150 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  price: number;

  @ApiProperty({ description: 'Available stock quantity', example: 100 })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  quantity: number;

  @ApiProperty({ enum: ProductUnit, default: ProductUnit.PIECE })
  @IsEnum(ProductUnit)
  unit: ProductUnit;

  @ApiPropertyOptional({ description: 'Product description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Product image URLs' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  images?: string[];

  @ApiPropertyOptional({ description: 'Delivery available for this product' })
  @IsBoolean()
  @IsOptional()
  deliveryAvailable?: boolean;

  @ApiPropertyOptional({ description: 'WhatsApp contact for this product' })
  @IsString()
  @IsOptional()
  whatsappNumber?: string;

  @ApiPropertyOptional({
    description: 'Best growing season',
    example: 'Monsoon',
    enum: ['Monsoon', 'Summer', 'Winter', 'All Year'],
  })
  @IsString()
  @IsOptional()
  season?: string;
}

export class UpdateNurseryProductDto extends CreateNurseryProductDto {}

export class CreateNurseryEnquiryDto {
  @ApiProperty({ description: 'NurseryProfile ID', example: 'uuid' })
  @IsString()
  @IsNotEmpty()
  nurseryId: string;

  @ApiPropertyOptional({ description: 'NurseryProduct ID if enquiry is about a specific product' })
  @IsString()
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ description: 'Enquiry message' })
  @IsString()
  @IsOptional()
  message?: string;

  @ApiPropertyOptional({ description: 'Quantity needed', example: 50 })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  quantity?: number;
}

export class RespondEnquiryDto {
  @ApiProperty({ description: 'Response message' })
  @IsString()
  @IsNotEmpty()
  message: string;
}
