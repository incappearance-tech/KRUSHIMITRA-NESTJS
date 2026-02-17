import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateLabourProfileDto {
    @ApiProperty({ description: 'List of skills', example: ['Harvesting', 'Ploughing'] })
    @IsArray()
    @IsString({ each: true })
    skills: string[];

    @ApiPropertyOptional({ description: 'Display name', example: 'Raju Labour' })
    @IsString()
    @IsOptional()
    name?: string;

    @ApiPropertyOptional({ description: 'Years of experience', example: '5 years' })
    @IsString()
    @IsOptional()
    experience?: string;

    @ApiProperty({ description: 'Daily wage in INR', example: 500 })
    @IsNumber()
    pricePerDay: number;

    @ApiPropertyOptional({ description: 'Work preference (Day/Night/Both)', example: 'Day' })
    @IsString()
    @IsOptional()
    workPreference?: string;

    @ApiPropertyOptional({ description: 'Current location address', example: 'Pune, Maharashtra' })
    @IsString()
    @IsOptional()
    locationAddress?: string;

    @ApiPropertyOptional({ description: 'Availability status', example: true })
    @IsBoolean()
    @IsOptional()
    isAvailable?: boolean;
}

export class UpdateLabourProfileDto extends CreateLabourProfileDto { }
