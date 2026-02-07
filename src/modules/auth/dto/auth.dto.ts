import { IsNotEmpty, IsString, Length, Matches, IsEnum, IsOptional } from 'class-validator';

export enum UserRole {
    FARMER = 'FARMER',
    LABOUR = 'LABOUR',
    TRANSPORTER = 'TRANSPORTER',
}

export class RequestOtpDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+?[1-9]\d{1,14}$/, {
        message: 'phoneNumber must be a valid E.164 formatted number',
    })
    phoneNumber: string;
}

export class VerifyOtpDto {
    @IsString()
    @IsNotEmpty()
    @Matches(/^\+?[1-9]\d{1,14}$/, {
        message: 'phoneNumber must be a valid E.164 formatted number',
    })
    phoneNumber: string;

    @IsString()
    @IsNotEmpty()
    @Length(6, 6, { message: 'OTP must be 6 digits' })
    otp: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @IsString()
    preferredLanguage?: string;

    @IsOptional()
    @IsString()
    fcmToken?: string;

    @IsOptional()
    @IsString()
    deviceOS?: string;

    @IsNotEmpty({ message: 'Privacy consent is required' })
    privacyConsent: boolean;
}

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @IsString()
    preferredLanguage?: string;

    @IsOptional()
    @IsString()
    fcmToken?: string;

    @IsOptional()
    @IsString()
    deviceOS?: string;
}
