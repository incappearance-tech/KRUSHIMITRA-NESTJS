import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Patch,
  Delete,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { MachinesService } from './machines.service';
import { CreateMachineDto, MachineFilterDto } from './dto/machine.dto';
import { CreateRentalRequestDto, RejectRentalRequestDto } from './dto/rental-request.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Machines')
@Controller('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @Body() createMachineDto: CreateMachineDto,
    @GetUser() user: User,
  ) {
    return this.machinesService.createListing(user.id, createMachineDto);
  }

  @Get()
  async findAll(@Query() filters: MachineFilterDto) {
    return this.machinesService.findAll(filters);
  }

  // ⚠️ Static routes MUST come before @Get(':id') — NestJS matches in declaration order

  @Get('categories')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(86400000) // Cache categories for 24 hours (rarely change)
  async getCategories() {
    return this.machinesService.getCategories();
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get own machine listings' })
  async findMine(@GetUser() user: User) {
    return this.machinesService.findMine(user.id);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.machinesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edit own machine listing' })
  async update(
    @Param('id') id: string,
    @GetUser() user: User,
    @Body() data: Partial<CreateMachineDto>,
  ) {
    return this.machinesService.update(id, user.id, data);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own machine listing' })
  async remove(@Param('id') id: string, @GetUser() user: User) {
    return this.machinesService.remove(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/busy-dates')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update busy dates for a machine' })
  async updateBusyDates(
    @Param('id') id: string,
    @Body('busyDates') busyDates: string[],
    @GetUser() user: User,
  ) {
    return this.machinesService.updateBusyDates(id, user.id, busyDates);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/toggle')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle machine listing status' })
  async toggle(@Param('id') id: string, @GetUser() user: User) {
    return this.machinesService.toggle(id, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/plan')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set machine listing plan tier' })
  async setPlan(
    @Param('id') id: string,
    @GetUser() user: User,
    @Body('plan') plan: string,
  ) {
    return this.machinesService.setPlan(id, user.id, plan);
  }

  // ─── Rental Request Endpoints ──────────────────────────────────────────────

  /** Public: Returns date ranges already booked for a machine (used by borrower calendar) */
  @Get(':id/booked-dates')
  @ApiOperation({ summary: 'Get booked date ranges for a machine — shown as unavailable in the rent-in calendar' })
  async getBookedDates(@Param('id') machineId: string) {
    return this.machinesService.getBookedDates(machineId);
  }

  /** Borrower sends a rental request for a machine */
  @Post(':id/request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a rental request to the machine owner' })
  async createRentalRequest(
    @Param('id') machineId: string,
    @GetUser() user: User,
    @Body() dto: CreateRentalRequestDto,
  ) {
    return this.machinesService.createRentalRequest(machineId, user.id, dto);
  }

  /** Borrower views their own sent rental requests */
  @Get('rental-requests/mine')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get my sent rental requests (borrower view)' })
  async getMyRentalRequests(@GetUser() user: User) {
    return this.machinesService.getMyRentalRequests(user.id);
  }

  /** Owner views incoming rental requests */
  @Get('rental-requests/incoming')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get incoming rental requests for my machines (owner view)' })
  async getIncomingRentalRequests(
    @GetUser() user: User,
    @Query('status') status?: string,
  ) {
    return this.machinesService.getIncomingRentalRequests(user.id, status);
  }

  /** Owner accepts a rental request */
  @Patch('rental-requests/:requestId/accept')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Accept a rental request — auto-rejects other pending requests for same machine' })
  async acceptRentalRequest(
    @Param('requestId') requestId: string,
    @GetUser() user: User,
  ) {
    return this.machinesService.acceptRentalRequest(requestId, user.id);
  }

  /** Owner rejects a rental request */
  @Patch('rental-requests/:requestId/reject')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reject a rental request with optional reason' })
  async rejectRentalRequest(
    @Param('requestId') requestId: string,
    @GetUser() user: User,
    @Body() dto: RejectRentalRequestDto,
  ) {
    return this.machinesService.rejectRentalRequest(requestId, user.id, dto);
  }

  /** Owner or borrower marks rental as completed */
  @Patch('rental-requests/:requestId/complete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark rental as completed — resets machine to AVAILABLE' })
  async completeRentalRequest(
    @Param('requestId') requestId: string,
    @GetUser() user: User,
  ) {
    return this.machinesService.completeRentalRequest(requestId, user.id);
  }

  /** Borrower cancels a pending request */
  @Patch('rental-requests/:requestId/cancel')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a pending rental request (borrower only)' })
  async cancelRentalRequest(
    @Param('requestId') requestId: string,
    @GetUser() user: User,
  ) {
    return this.machinesService.cancelRentalRequest(requestId, user.id);
  }
}
