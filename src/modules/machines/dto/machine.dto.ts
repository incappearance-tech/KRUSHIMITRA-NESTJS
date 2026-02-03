import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum, Min, IsArray } from 'class-validator';

export enum ListingType {
    SELL = 'SELL',
    RENT = 'RENT'
}

export class CreateMachineDto {
    @ApiProperty({ example: 'Tractor', description: 'Category of the machine' })
    @IsString()
    category: string;

    @ApiProperty({ example: 'John Deere', description: 'Brand of the machine' })
    @IsString()
    brand: string;

    @ApiProperty({ example: '5050E', description: 'Model name/number' })
    @IsString()
    model: string;

    @ApiProperty({ example: 2022, description: 'Year the machine was purchased' })
    @IsNumber()
    @Min(1900)
    yearOfPurchase: number;

    @ApiProperty({ enum: ListingType, example: ListingType.SELL })
    @IsEnum(ListingType)
    listingType: ListingType;

    @ApiProperty({ example: 500000, description: 'Price in INR' })
    @IsNumber()
    @Min(0)
    price: number;

    @ApiPropertyOptional({ example: 'HOURLY', description: 'Rent unit if applicable (HOURLY/DAILY)' })
    @IsOptional()
    @IsString()
    rentUnit?: string;

    @ApiProperty({ example: ['https://s3/pic1.jpg'], description: 'Array of image URLs' })
    @IsArray()
    @IsString({ each: true })
    images: string[];
}

export class MachineFilterDto {
    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsEnum(ListingType)
    listingType?: ListingType;

    @IsOptional()
    @IsNumber()
    minPrice?: number;

    @IsOptional()
    @IsNumber()
    maxPrice?: number;
}
