import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateLabourProfileDto {
    @IsArray()
    @IsString({ each: true })
    skills: string[];

    @IsString()
    @IsOptional()
    name?: string;

    @IsString()
    @IsOptional()
    experience?: string;

    @IsNumber()
    pricePerDay: number;

    @IsString()
    @IsOptional()
    workPreference?: string;

    @IsString()
    @IsOptional()
    locationAddress?: string;

    @IsBoolean()
    @IsOptional()
    isAvailable?: boolean;
}

export class UpdateLabourProfileDto extends CreateLabourProfileDto { }
