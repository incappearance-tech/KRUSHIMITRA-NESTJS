import { IsOptional, IsString, IsNumber, IsEnum, Min, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export enum ListingType {
    SELL = 'SELL',
    RENT = 'RENT'
}

export class CreateMachineDto {
    @IsString()
    category: string;

    @IsString()
    brand: string;

    @IsString()
    model: string;

    @IsNumber()
    @Min(1900)
    yearOfPurchase: number;

    @IsEnum(ListingType)
    listingType: ListingType;

    @IsNumber()
    @Min(0)
    price: number;

    @IsOptional()
    @IsString()
    rentUnit?: string;

    @IsArray()
    @IsString({ each: true })
    images: string[];
}

export class MachineFilterDto {
    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsString()
    brand?: string;

    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(ListingType)
    listingType?: ListingType;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    minPrice?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    maxPrice?: number;

    @IsOptional()
    @IsString()
    rentUnit?: string;
}
