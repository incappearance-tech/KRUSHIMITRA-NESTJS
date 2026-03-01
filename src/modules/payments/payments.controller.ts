import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Headers,
  Req,
  Param,
  HttpCode,
  HttpStatus,
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
} from '@nestjs/swagger';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) { }

  // ── Create Razorpay order ─────────────────────────────────────────────────
  @Post('create-order')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Razorpay payment order (idempotent for 30 min)' })
  async createOrder(
    @GetUser('id') userId: string,
    @Body() dto: CreatePaymentOrderDto,
  ) {
    return this.paymentsService.createOrder(userId, dto);
  }

  // ── Verify payment after Razorpay checkout ────────────────────────────────
  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify Razorpay payment signature & activate subscription' })
  async verify(@GetUser('id') userId: string, @Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(userId, dto);
  }

  // ── Mark payment failed (called by client on Razorpay error) ─────────────
  @Post('fail/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a pending payment as FAILED (client-side error callback)' })
  async markFailed(
    @GetUser('id') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.markFailed(userId, orderId);
  }

  // ── Check payment status (app-kill recovery) ──────────────────────────────
  @Get('status/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check payment status & recover if Razorpay captured but app was killed' })
  async getStatus(
    @GetUser('id') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.getPaymentStatus(userId, orderId);
  }

  // ── Subscription plan prices (single source of truth) ─────────────────────
  @Get('plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get subscription plan prices from backend (prevents frontend amount tampering)' })
  getPlans() {
    return this.paymentsService.getPlans();
  }

  // ── Razorpay webhook (public, signature-verified) ─────────────────────────
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Razorpay Webhook handler (HMAC signature validated)' })
  async handleWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Req() req: any,
  ) {
    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }

  // ── Payment history ───────────────────────────────────────────────────────
  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user payment history' })
  async getHistory(@GetUser('id') userId: string) {
    return this.paymentsService.getHistory(userId);
  }
}
