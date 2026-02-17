import { IsBoolean, IsNumber, IsOptional, IsString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateVehicleDto {
    @ApiProperty({ description: 'Type of vehicle', example: 'Truck' })
    @IsString()
    type: string;

    @ApiProperty({ description: 'Vehicle model', example: 'Tata Ace' })
    @IsString()
    model: string;

    @ApiPropertyOptional({ description: 'License plate number' })
    @IsString()
    @IsOptional()
    numberPlate?: string;

    @ApiPropertyOptional({ description: 'Load capacity', example: '1 Ton' })
    @IsString()
    @IsOptional()
    capacity?: string;

    @ApiPropertyOptional({ description: 'Rate per km', example: 20 })
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

    @ApiPropertyOptional({ description: 'Subscription plan' })
    @IsString()
    @IsOptional()
    plan?: string;

    @ApiPropertyOptional({ description: 'Subscription expiry date' })
    @IsString()
    @IsOptional()
    expiryDate?: string;

    @ApiPropertyOptional({ description: 'Availability status', example: true })
    @IsBoolean()
    @IsOptional()
    isAvailable?: boolean;

    @ApiPropertyOptional({ description: 'Vehicle images' })
    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    images?: string[];
}

export class UpdateVehicleDto extends CreateVehicleDto { }
