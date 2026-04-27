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
    description: 'Payment type',
    enum: ['LISTING_FEE', 'CALL_FEE', 'SUBSCRIPTION'],
  })
  @IsString()
  @IsIn(['LISTING_FEE', 'CALL_FEE', 'SUBSCRIPTION'])
  type: string;

  @ApiProperty({ description: 'Amount in paise (e.g. 49900 = ₹499)', example: 49900 })
  @IsNumber()
  @Min(0)   // 0 is valid for free listings
  amount: number;

  @ApiPropertyOptional({ description: 'Entity ID (machineId, vehicleId, etc.)' })
  @IsString()
  @IsOptional()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Human-readable description for admin panel' })
  @IsString()
  @IsOptional()
  description?: string;
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

  @ApiPropertyOptional({ enum: ['LISTING_FEE', 'CALL_FEE', 'SUBSCRIPTION'] })
  @IsString()
  @IsOptional()
  @IsIn(['LISTING_FEE', 'CALL_FEE', 'SUBSCRIPTION'])
  type?: string;

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
