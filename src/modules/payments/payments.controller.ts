import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Headers,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { CreatePaymentOrderDto, VerifyPaymentDto } from './dto/payment.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiHideProperty,
} from '@nestjs/swagger';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-order')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Razorpay payment order' })
  async createOrder(
    @GetUser('id') userId: string,
    @Body() dto: CreatePaymentOrderDto,
  ) {
    return this.paymentsService.createOrder(userId, dto);
  }

  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify Razorpay payment signature' })
  async verify(@GetUser('id') userId: string, @Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(userId, dto);
  }

  @Post('webhook')
  @Public()
  @ApiOperation({ summary: 'Razorpay Webhook handler' })
  async handleWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Req() req: any,
  ) {
    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user payment history' })
  async getHistory(@GetUser('id') userId: string) {
    return this.paymentsService.getHistory(userId);
  }
}
