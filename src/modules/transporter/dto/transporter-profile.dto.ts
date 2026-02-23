import { IsInt, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTransporterProfileDto {
  @ApiPropertyOptional({ description: 'Name of the transport business' })
  @IsString()
  @IsOptional()
  businessName?: string;

  @ApiPropertyOptional({ description: 'Operating radius in km', example: 50 })
  @IsInt()
  @IsOptional()
  operatingRadius?: number;

  @ApiPropertyOptional({ description: 'Years of driver experience' })
  @IsString()
  @IsOptional()
  experience?: string;

  @ApiPropertyOptional({ description: 'Base location address' })
  @IsString()
  @IsOptional()
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

export class UpdateTransporterProfileDto extends CreateTransporterProfileDto {}
