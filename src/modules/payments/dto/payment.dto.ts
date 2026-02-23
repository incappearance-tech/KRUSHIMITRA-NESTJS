import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentOrderDto {
  @ApiProperty({
    description: 'Payment type',
    example: 'LISTING_FEE',
    enum: ['LISTING_FEE', 'CALL_FEE', 'SUBSCRIPTION'],
  })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({
    description: 'Amount in paise (e.g. 49900 = ₹499)',
    example: 49900,
  })
  @IsNumber()
  @Min(100)
  amount: number;

  @ApiPropertyOptional({
    description: 'Entity ID (machineId, vehicleId, etc.)',
    example: 'uuid-here',
  })
  @IsString()
  @IsOptional()
  entityId?: string;
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

  @ApiProperty({ description: 'Razorpay signature' })
  @IsString()
  @IsNotEmpty()
  razorpaySignature: string;
}
