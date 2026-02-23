import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransportRequestDto {
  @ApiProperty({ description: 'Vehicle ID to request' })
  @IsString()
  @IsNotEmpty()
  vehicleId: string;

  @ApiProperty({ description: 'Transporter profile ID' })
  @IsString()
  @IsNotEmpty()
  transporterId: string;

  @ApiProperty({ description: 'Pickup location' })
  @IsString()
  @IsNotEmpty()
  pickup: string;

  @ApiProperty({ description: 'Drop/destination location' })
  @IsString()
  @IsNotEmpty()
  drop: string;

  @ApiPropertyOptional({ description: 'Crop type', example: 'Wheat' })
  @IsString()
  @IsOptional()
  crop?: string;

  @ApiPropertyOptional({
    description: 'Quantity to transport',
    example: '2 Tons',
  })
  @IsString()
  @IsOptional()
  quantity?: string;

  @ApiProperty({ description: 'Required transport date (ISO string)' })
  @IsString()
  @IsNotEmpty()
  requiredDate: string;
}
