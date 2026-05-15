import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsIn,
  IsDateString,
  IsPositive,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreatePaymentOrderDto {
  @ApiProperty({
    description: 'DEPRECATED: Use feature instead. Kept for backward compatibility.',
  })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiProperty({
    description: 'Feature being paid for (e.g. MACHINE_LISTING_BASIC, VEHICLE_SUBSCRIPTION_MONTHLY)',
  })
  @IsString()
  @IsNotEmpty()
  feature: string;

  @ApiPropertyOptional({
    description: 'Plan tier if applicable (e.g. basic, pro, monthly)',
  })
  @IsString()
  @IsOptional()
  planTier?: string;

  @ApiProperty({ description: 'Amount in paise (e.g. 49900 = ₹499)', example: 49900 })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional({
    description: 'Who is paying — FARMER | TRANSPORTER | LABOUR (default: derived from JWT)',
    enum: ['FARMER', 'TRANSPORTER', 'LABOUR'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['FARMER', 'TRANSPORTER', 'LABOUR'])
  role?: string;

  @ApiPropertyOptional({
    description: 'What entity this payment is for',
    example: 'machine-uuid-here',
  })
  @IsString()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({
    description: 'Type of entity — MACHINE | VEHICLE | CONTACT | PROFILE',
    enum: ['MACHINE', 'VEHICLE', 'CONTACT', 'PROFILE'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['MACHINE', 'VEHICLE', 'CONTACT', 'PROFILE'])
  entityType?: string;

  @ApiPropertyOptional({ description: 'Human-readable description shown in admin panel' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Payment method — UPI (default) or FREE for ₹0 listings', enum: ['UPI', 'FREE'] })
  @IsString()
  @IsOptional()
  @IsIn(['UPI', 'FREE'])
  paymentMethod?: string;
}

export class VerifyPaymentDto {
  @ApiProperty({ description: 'Razorpay order id' })
  @IsString()
  @IsNotEmpty()
  razorpayOrderId: string;

  @ApiProperty({ description: 'Razorpay payment id' })
  @IsString()
  @IsNotEmpty()
  razorpayPaymentId: string;

  @ApiProperty({ description: 'Razorpay HMAC signature' })
  @IsString()
  @IsNotEmpty()
  razorpaySignature: string;
}

export class AdminPaymentsQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page (max 100)', default: 20 })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({ enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] })
  @IsString()
  @IsOptional()
  @IsIn(['PENDING', 'PAID', 'FAILED', 'REFUNDED'])
  status?: string;

  @ApiPropertyOptional({ description: 'Legacy type filter' })
  @IsString()
  @IsOptional()
  type?: string;

  @ApiPropertyOptional({ description: 'Filter by feature (e.g., MACHINE_LISTING)' })
  @IsString()
  @IsOptional()
  feature?: string;

  @ApiPropertyOptional({ description: 'Filter by role (e.g., FARMER, TRANSPORTER)' })
  @IsString()
  @IsOptional()
  role?: string;

  @ApiPropertyOptional({ description: 'Filter by userId' })
  @IsString()
  @IsOptional()
  userId?: string;

  @ApiPropertyOptional({ description: 'From date (ISO 8601)', example: '2026-01-01' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'To date (ISO 8601)', example: '2026-12-31' })
  @IsDateString()
  @IsOptional()
  to?: string;
}

export class AdminStatsQueryDto {
  @ApiPropertyOptional({ description: 'From date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ description: 'To date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  to?: string;
}
