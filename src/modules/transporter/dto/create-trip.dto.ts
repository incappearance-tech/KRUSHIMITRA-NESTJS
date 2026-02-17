import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTripDto {
    @ApiProperty({ description: 'UUID of the transporter' })
    @IsUUID()
    @IsNotEmpty()
    transporterId: string;

    @ApiProperty({ description: 'Type of vehicle required', example: 'Mini Truck' })
    @IsString()
    @IsNotEmpty()
    vehicleType: string;

    @ApiPropertyOptional({ description: 'Type and weight of load', example: 'Crops (2.5 Tons)' })
    @IsString()
    @IsOptional()
    loadType?: string;

    @ApiProperty({ description: 'Pickup address' })
    @IsString()
    @IsNotEmpty()
    pickupLocation: string;

    @ApiProperty({ description: 'Drop address' })
    @IsString()
    @IsNotEmpty()
    dropLocation: string;

    @ApiProperty({ description: 'Trip date (ISO string)', example: '2023-11-01T10:00:00.000Z' })
    @IsString()
    @IsNotEmpty()
    date: string;
}
