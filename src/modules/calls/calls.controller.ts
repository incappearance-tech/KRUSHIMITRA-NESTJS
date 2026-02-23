import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { CallsService } from './calls.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import {
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';

class ConnectCallDto {
  @ApiProperty({ description: 'Receiver user ID' })
  @IsString()
  @IsNotEmpty()
  receiverId: string;

  @ApiPropertyOptional({ description: 'Booking ID if call is under a booking' })
  @IsString()
  @IsOptional()
  bookingId?: string;

  @ApiPropertyOptional({
    description: 'Booking type (LABOUR, TRANSPORT, MACHINE)',
  })
  @IsString()
  @IsOptional()
  bookingType?: string;
}

@ApiTags('Calls')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
@Controller('calls')
export class CallsController {
  constructor(private readonly callsService: CallsService) {}

  @Post('connect')
  @ApiOperation({ summary: 'Initiate a masked call via Exotel' })
  async connect(@GetUser('id') callerId: string, @Body() dto: ConnectCallDto) {
    return this.callsService.connectCall(
      callerId,
      dto.receiverId,
      dto.bookingId,
      dto.bookingType,
    );
  }

  @Get('history')
  @ApiOperation({ summary: 'Get call history' })
  async getHistory(@GetUser('id') userId: string) {
    return this.callsService.getHistory(userId);
  }
}
