import { IsBoolean, IsNumber, IsOptional, IsString, IsArray } from 'class-validator';

export class CreateVehicleDto {
    @IsString()
    type: string;

    @IsString()
    model: string;

    @IsString()
    @IsOptional()
    numberPlate?: string;

    @IsString()
    @IsOptional()
    capacity?: string;

    @IsNumber()
    @IsOptional()
    ratePerKm?: number;

    @IsString()
    @IsOptional()
    driverName?: string;

    @IsString()
    @IsOptional()
    driverPhone?: string;

    @IsString()
    @IsOptional()
    driverLicense?: string;

    @IsString()
    @IsOptional()
    plan?: string;

    @IsString()
    @IsOptional()
    expiryDate?: string;

    @IsBoolean()
    @IsOptional()
    isAvailable?: boolean;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    images?: string[];
}

export class UpdateVehicleDto extends CreateVehicleDto { }
