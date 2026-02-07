import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateTransporterProfileDto {
    @IsString()
    @IsOptional()
    businessName?: string;

    @IsInt()
    @IsOptional()
    operatingRadius?: number;

    @IsString()
    @IsOptional()
    experience?: string;

    @IsString()
    @IsOptional()
    locationAddress?: string;
}

export class UpdateTransporterProfileDto extends CreateTransporterProfileDto { }
