import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTripDto {
    @IsUUID()
    @IsNotEmpty()
    transporterId: string;

    @IsString()
    @IsNotEmpty()
    vehicleType: string; // e.g., "Mini Truck"

    @IsString()
    @IsOptional()
    loadType?: string; // e.g., "Crops (2.5 Tons)"

    @IsString()
    @IsNotEmpty()
    pickupLocation: string;

    @IsString()
    @IsNotEmpty()
    dropLocation: string;

    @IsString()
    @IsNotEmpty()
    date: string; // ISO Date string
}
