import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserRole {
  FARMER = 'FARMER',
  LABOUR = 'LABOUR',
  TRANSPORTER = 'TRANSPORTER',
}

export class RequestOtpDto {
  @ApiProperty({
    description: 'User phone number in E.164 format',
    example: '+919876543210',
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
    example: '+919876543210',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'phoneNumber must be a valid E.164 formatted number',
  })
  phoneNumber: string;

  @ApiProperty({
    description: '6-digit OTP received via SMS',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be 6 digits' })
  otp: string;

  @ApiPropertyOptional({
    enum: UserRole,
    description: 'User role (optional during login)',
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Preferred language code (e.g., en, hi, mr)',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @ApiPropertyOptional({
    description: 'Firebase Cloud Messaging token for push notifications',
  })
  @IsOptional()
  @IsString()
  fcmToken?: string;

  @ApiPropertyOptional({
    description: 'Device OS (android or ios)',
    example: 'android',
  })
  @IsOptional()
  @IsString()
  deviceOS?: string;

  @ApiProperty({ description: 'Consent for privacy policy', example: true })
  @IsNotEmpty({ message: 'Privacy consent is required' })
  @IsBoolean()
  privacyConsent: boolean;
}

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'Full name of the user',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Optimized avatar image URL from Supabase',
  })
  @IsOptional()
  @IsString()
  profileImage?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'User role' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Preferred language code',
    example: 'en',
  })
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
  @IsOptional()
  deviceOS?: string;

  @ApiPropertyOptional({ description: 'Custom Farmer ID' })
  @IsOptional()
  @IsString()
  farmerId?: string;

  @ApiPropertyOptional({ description: 'Formatted address from geocoding' })
  @IsOptional()
  @IsString()
  locationAddress?: string;

  @ApiPropertyOptional({ description: 'GPS latitude', example: 18.5204 })
  @IsOptional()
  @IsNumber()
  locationLat?: number;

  @ApiPropertyOptional({ description: 'GPS longitude', example: 73.8567 })
  @IsOptional()
  @IsNumber()
  locationLng?: number;

  @ApiPropertyOptional({ description: 'State' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'District' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'Taluka' })
  @IsOptional()
  @IsString()
  taluka?: string;

  @ApiPropertyOptional({ description: 'Village' })
  @IsOptional()
  @IsString()
  village?: string;

  @ApiPropertyOptional({ description: 'Pin Code' })
  @IsOptional()
  @IsString()
  pincode?: string;
}

export class UpdateLocationDto {
  @ApiProperty({ description: 'GPS latitude', example: 18.5204 })
  @IsNumber()
  lat: number;

  @ApiProperty({ description: 'GPS longitude', example: 73.8567 })
  @IsNumber()
  lng: number;

  @ApiPropertyOptional({
    description: 'Formatted address string',
    example: 'Pune, Maharashtra',
  })
  @IsOptional()
  @IsString()
  locationAddress?: string;

  @ApiPropertyOptional({ description: 'State' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ description: 'District' })
  @IsOptional()
  @IsString()
  district?: string;

  @ApiPropertyOptional({ description: 'Taluka' })
  @IsOptional()
  @IsString()
  taluka?: string;

  @ApiPropertyOptional({ description: 'Village' })
  @IsOptional()
  @IsString()
  village?: string;

  @ApiPropertyOptional({ description: 'Pin Code' })
  @IsOptional()
  @IsString()
  pincode?: string;
}
