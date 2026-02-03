import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches, IsEnum, IsOptional } from 'class-validator';

export enum UserRole {
    FARMER = 'FARMER',
    LABOUR = 'LABOUR',
    TRANSPORTER = 'TRANSPORTER',
}

export class RequestOtpDto {
    @ApiProperty({ example: '+919876543210', description: 'User phone number in E.164 format' })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+?[1-9]\d{1,14}$/, {
        message: 'phoneNumber must be a valid E.164 formatted number',
    })
    phoneNumber: string;
}

export class VerifyOtpDto {
    @ApiProperty({ example: '+919876543210' })
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+?[1-9]\d{1,14}$/, {
        message: 'phoneNumber must be a valid E.164 formatted number',
    })
    phoneNumber: string;

    @ApiProperty({ example: '123456', description: '6-digit OTP received via SMS' })
    @IsString()
    @IsNotEmpty()
    @Length(6, 6, { message: 'OTP must be 6 digits' })
    otp: string;

    @ApiPropertyOptional({ enum: UserRole, example: UserRole.FARMER })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional({ example: 'mr', description: 'ISO language code (en, hi, mr, etc.)' })
    @IsOptional()
    @IsString()
    preferredLanguage?: string;

    @ApiPropertyOptional({ example: 'tokens-from-firebase', description: 'FCM Token for push notifications' })
    @IsOptional()
    @IsString()
    fcmToken?: string;

    @ApiPropertyOptional({ example: 'android', description: 'Device OS (android/ios)' })
    @IsOptional()
    @IsString()
    deviceOS?: string;
}

export class UpdateProfileDto {
    @ApiPropertyOptional({ example: 'Rajesh Kumar' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ enum: UserRole })
    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @ApiPropertyOptional({ example: 'hi' })
    @IsOptional()
    @IsString()
    preferredLanguage?: string;

    @ApiPropertyOptional({ example: 'tokens-from-firebase' })
    @IsOptional()
    @IsString()
    fcmToken?: string;

    @ApiPropertyOptional({ example: 'ios' })
    @IsOptional()
    @IsString()
    deviceOS?: string;
}
