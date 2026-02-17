import { IsNotEmpty, IsString, Length, Matches, IsEnum, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserRole {
    FARMER = 'FARMER',
    LABOUR = 'LABOUR',
    TRANSPORTER = 'TRANSPORTER',
}

export class RequestOtpDto {
    @ApiProperty({
        description: 'User phone number in E.164 format',
        example: '+919876543210'
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+?[1-9]\d{1,14}$/, {
        message: 'phoneNumber must be a valid E.164 formatted number',
    })
    phoneNumber: string;
}

export class VerifyOtpDto {
    @ApiProperty({
        description: 'User phone number in E.164 format',
        example: '+919876543210'
    })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+?[1-9]\d{1,14}$/, {
        message: 'phoneNumber must be a valid E.164 formatted number',
    })
    phoneNumber: string;

    @ApiProperty({
        description: '6-digit OTP received via SMS',
        example: '123456'
    })
    @IsString()
    @IsNotEmpty()
    @Length(6, 6, { message: 'OTP must be 6 digits' })
    otp: string;

    @ApiPropertyOptional({ enum: UserRole, description: 'User role (optional during login)' })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional({ description: 'Preferred language code (e.g., en, hi, mr)', example: 'en' })
    @IsOptional()
    @IsString()
    preferredLanguage?: string;

    @ApiPropertyOptional({ description: 'Firebase Cloud Messaging token for push notifications' })
    @IsOptional()
    @IsString()
    fcmToken?: string;

    @ApiPropertyOptional({ description: 'Device OS (android or ios)', example: 'android' })
    @IsOptional()
    @IsString()
    deviceOS?: string;

    @ApiProperty({ description: 'Consent for privacy policy', example: true })
    @IsNotEmpty({ message: 'Privacy consent is required' })
    @IsBoolean()
    privacyConsent: boolean;
}

export class UpdateProfileDto {
    @ApiPropertyOptional({ description: 'Full name of the user', example: 'John Doe' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ enum: UserRole, description: 'User role' })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional({ description: 'Preferred language code', example: 'en' })
    @IsOptional()
    @IsString()
    preferredLanguage?: string;

    @ApiPropertyOptional({ description: 'FCM Token update' })
    @IsOptional()
    @IsString()
    fcmToken?: string;

    @ApiPropertyOptional({ description: 'Device OS update' })
    @IsOptional()
    @IsString()
    deviceOS?: string;
}
