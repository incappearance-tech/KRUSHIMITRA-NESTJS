import { IsOptional, IsString, IsNumber, IsEnum, Min, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ListingType {
    SELL = 'SELL',
    RENT = 'RENT'
}

export class CreateMachineDto {
    @ApiProperty({ description: 'Category of the machine', example: 'Tractor' })
    @IsString()
    category: string;

    @ApiProperty({ description: 'Brand name', example: 'Mahindra' })
    @IsString()
    brand: string;

    @ApiProperty({ description: 'Model name/number', example: '575 DI' })
    @IsString()
    model: string;

    @ApiProperty({ description: 'Year of purchase', example: 2020, minimum: 1900 })
    @IsNumber()
    @Min(1900)
    yearOfPurchase: number;

    @ApiProperty({ enum: ListingType, description: 'Type of listing (SELL or RENT)' })
    @IsEnum(ListingType)
    listingType: ListingType;

    @ApiProperty({ description: 'Price or Rent amount', example: 500000 })
    @IsNumber()
    @Min(0)
    price: number;

    @ApiPropertyOptional({ description: 'Rent unit (e.g., HOURLY, DAILY)', example: 'HOURLY' })
    @IsOptional()
    @IsString()
    rentUnit?: string;

    @ApiProperty({ description: 'Array of image URLs', example: ['https://example.com/image1.jpg'] })
    @IsArray()
    @IsString({ each: true })
    images: string[];
}

export class MachineFilterDto {
    @ApiPropertyOptional({ description: 'Filter by category' })
    @IsOptional()
    @IsString()
    category?: string;

    @ApiPropertyOptional({ description: 'Filter by brand' })
    @IsOptional()
    @IsString()
    brand?: string;

    @ApiPropertyOptional({ description: 'Search term for model or brand' })
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({ enum: ListingType, description: 'Filter by listing type' })
    @IsOptional()
    @IsEnum(ListingType)
    listingType?: ListingType;

    @ApiPropertyOptional({ description: 'Minimum price filter' })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    minPrice?: number;

    @ApiPropertyOptional({ description: 'Maximum price filter' })
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    maxPrice?: number;

    @ApiPropertyOptional({ description: 'Filter by rent unit' })
    @IsOptional()
    @IsString()
    rentUnit?: string;
}
