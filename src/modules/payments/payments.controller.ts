import {
  Controller,
  Post,
  Body,
  UseGuards,
  Get,
  Headers,
  Req,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CreatePaymentOrderDto,
  VerifyPaymentDto,
  AdminPaymentsQueryDto,
  AdminStatsQueryDto,
} from './dto/payment.dto';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // ── User: Create Razorpay order ─────────────────────────────────────────────
  @Post('create-order')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a Razorpay order — idempotent within 30 min per entity' })
  createOrder(
    @GetUser('id') userId: string,
    @Body() dto: CreatePaymentOrderDto,
  ) {
    return this.paymentsService.createOrder(userId, dto);
  }

  // ── User: Verify payment after Razorpay checkout ────────────────────────────
  @Post('verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verify Razorpay HMAC signature and activate subscription' })
  verify(@GetUser('id') userId: string, @Body() dto: VerifyPaymentDto) {
    return this.paymentsService.verifyPayment(userId, dto);
  }

  // ── User: Mark payment as failed (client-side checkout error) ───────────────
  @Post('fail/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark a PENDING order as FAILED — cleans up orphaned records' })
  markFailed(
    @GetUser('id') userId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.paymentsService.markFailed(userId, orderId);
  }

  // ── User: Check payment status (crash / app-kill recovery) ─────────────────
  @Get('status/:orderId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Fetch live status from Razorpay — used for recovery after app kill' })
  getStatus(@GetUser('id') userId: string, @Param('orderId') orderId: string) {
    return this.paymentsService.getPaymentStatus(userId, orderId);
  }

  // ── Public: Fee Configuration (Live Prices) ─────────────────────────────────
  @Get('fee-config')
  @Public()
  @ApiOperation({ summary: 'Get live dynamic pricing from FeeConfig table' })
  getFeeConfig() {
    return this.paymentsService.getFeeConfig();
  }

  // ── User: Subscription plan catalogue ──────────────────────────────────────
  @Get('plans')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Canonical plan prices from backend — prevents frontend price tampering' })
  getPlans() {
    return this.paymentsService.getPlans();
  }

  // ── User: Payment history ───────────────────────────────────────────────────
  @Get('history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current user payment history with subscription details' })
  getHistory(@GetUser('id') userId: string) {
    return this.paymentsService.getHistory(userId);
  }

  // ── Webhook: Razorpay (public, signature-verified internally) ───────────────
  @Post('webhook')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Razorpay webhook — HMAC-validated; events logged for replay' })
  handleWebhook(
    @Headers('x-razorpay-signature') signature: string,
    @Req() req: any,
  ) {
    return this.paymentsService.handleWebhook(req.rawBody, signature);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Admin endpoints — ADMIN role required
  // ════════════════════════════════════════════════════════════════════════════

  // ── Admin: Revenue + transaction stats ─────────────────────────────────────
  @Get('admin/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[ADMIN] Revenue stats, active subscriptions, expiry counts' })
  @ApiQuery({ name: 'from', required: false, description: 'Start date ISO 8601' })
  @ApiQuery({ name: 'to',   required: false, description: 'End date ISO 8601' })
  getAdminStats(@Query() query: AdminStatsQueryDto) {
    return this.paymentsService.getAdminStats(query.from, query.to);
  }

  // ── Admin: Paginated payment list ───────────────────────────────────────────
  @Get('admin/list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[ADMIN] Paginated list of all payments — filterable by status/type/date/user' })
  getAdminPayments(@Query() query: AdminPaymentsQueryDto) {
    return this.paymentsService.getAdminPayments(query);
  }

  // ── Admin: Subscription list ────────────────────────────────────────────────
  @Get('admin/subscriptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: '[ADMIN] List subscriptions — filter: active | expiring | expired | all' })
  @ApiQuery({ name: 'filter', enum: ['active', 'expiring', 'expired', 'all'], required: false })
  getAdminSubscriptions(@Query('filter') filter?: 'active' | 'expiring' | 'expired' | 'all') {
    return this.paymentsService.getAdminSubscriptions(filter ?? 'all');
  }
}
