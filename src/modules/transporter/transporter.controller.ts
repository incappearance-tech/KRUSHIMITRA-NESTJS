import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Delete,
  Param,
  Patch,
  Query,
} from '@nestjs/common';
import { TransporterService } from './transporter.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CreateTransporterProfileDto } from './dto/transporter-profile.dto';
import { CreateVehicleDto } from './dto/vehicle.dto';
import { CreateTripDto } from './dto/create-trip.dto';
import { CreateTransportRequestDto } from './dto/create-transport-request.dto';
import { RespondRequestDto } from './dto/respond-request.dto';
import { CancelRequestDto } from './dto/cancel-request.dto';
import { ConfirmSuggestionDto } from './dto/confirm-suggestion.dto';
import { SetAvailabilityDto } from './dto/vehicle-availability.dto';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Transporter')
@Controller('transporter')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TransporterController {
  constructor(private readonly transporterService: TransporterService) { }

  // ───── PROFILE ─────────────────────────────────────────────

  @Get('profile')
  @ApiOperation({ summary: 'Get own transporter profile' })
  async getProfile(@GetUser('id') userId: string) {
    return this.transporterService.getProfile(userId);
  }

  @Post('profile')
  @ApiOperation({ summary: 'Create or update transporter profile' })
  async updateProfile(
    @GetUser('id') userId: string,
    @Body() dto: CreateTransporterProfileDto,
  ) {
    return this.transporterService.upsertProfile(userId, dto);
  }

  // ───── LEGACY LEADS (TransportTrip) ────────────────────────

  @Get('leads')
  @ApiOperation({ summary: 'Get incoming leads (legacy TransportTrip)' })
  async getLeads(@GetUser('id') userId: string) {
    return this.transporterService.getLeads(userId);
  }

  @Post('leads/:id/status')
  @ApiOperation({ summary: 'Update lead status (legacy)' })
  async updateLeadStatus(
    @GetUser('id') userId: string,
    @Param('id') leadId: string,
    @Body('status') status: string,
  ) {
    return this.transporterService.updateLeadStatus(userId, leadId, status);
  }

  @Patch('trips/:id/complete')
  @ApiOperation({ summary: 'Mark legacy trip as completed' })
  async completeTrip(
    @GetUser('id') userId: string,
    @Param('id') tripId: string,
  ) {
    return this.transporterService.updateLeadStatus(
      userId,
      tripId,
      'completed',
    );
  }

  @Get('my-trips')
  @ApiOperation({ summary: "Get farmer's own trips (legacy)" })
  async getMyTrips(@GetUser('id') userId: string) {
    return this.transporterService.getFarmerTrips(userId);
  }

  // ───── VEHICLES ─────────────────────────────────────────────

  @Post('vehicles')
  @ApiOperation({ summary: 'Add a new vehicle' })
  async addVehicle(
    @GetUser('id') userId: string,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.transporterService.addVehicle(userId, dto);
  }

  @Patch('vehicles/:id')
  @ApiOperation({ summary: 'Update vehicle details' })
  async updateVehicle(
    @GetUser('id') userId: string,
    @Param('id') vehicleId: string,
    @Body() dto: Partial<CreateVehicleDto>,
  ) {
    return this.transporterService.updateVehicle(userId, vehicleId, dto);
  }

  @Delete('vehicles/:id')
  @ApiOperation({
    summary: 'Delete vehicle (only if no active sub or future bookings)',
  })
  async deleteVehicle(
    @GetUser('id') userId: string,
    @Param('id') vehicleId: string,
  ) {
    return this.transporterService.deleteVehicle(userId, vehicleId);
  }

  // ───── VEHICLE AVAILABILITY CALENDAR ────────────────────────

  @Get('vehicles/:id/availability')
  @ApiOperation({
    summary:
      'Get vehicle availability calendar (optionally filter by month=YYYY-MM)',
  })
  async getAvailability(
    @Param('id') vehicleId: string,
    @Query('month') month?: string,
  ) {
    return this.transporterService.getVehicleAvailability(vehicleId, month);
  }

  @Post('vehicles/:id/availability')
  @ApiOperation({ summary: 'Set/update a day state on the vehicle calendar' })
  async setAvailability(
    @GetUser('id') userId: string,
    @Param('id') vehicleId: string,
    @Body() dto: SetAvailabilityDto,
  ) {
    return this.transporterService.setVehicleAvailability(
      userId,
      vehicleId,
      dto,
    );
  }

  // ───── FARMER-FACING VEHICLE BROWSE ─────────────────────────

  @Get('vehicles/browse')
  @ApiOperation({
    summary: 'Browse verified vehicles (farmer-facing, privacy-safe)',
  })
  async browseVehicles(
    @GetUser('id') userId: string,
    @Query('vehicleTypes') vehicleTypes?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('requiredDate') requiredDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchQuery') searchQuery?: string,
    @Query('minRating') minRating?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    let parsedVehicleTypes: string[] | undefined;
    if (vehicleTypes) {
      parsedVehicleTypes = vehicleTypes.split(',').map((t) => t.trim());
    }

    return this.transporterService.getVehiclesForFarmer({
      userId,
      vehicleTypes: parsedVehicleTypes,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radius: radius ? parseFloat(radius) : 50,
      requiredDate,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 15,
      searchQuery,
      minRating: minRating ? parseFloat(minRating) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    });
  }

  // ───── TRANSPORT REQUESTS (new flow) ────────────────────────

  @Post('requests')
  @ApiOperation({ summary: 'Farmer creates a transport request' })
  async createRequest(
    @GetUser('id') userId: string,
    @Body() dto: CreateTransportRequestDto,
  ) {
    return this.transporterService.createTransportRequest(userId, dto);
  }

  @Get('requests/incoming')
  @ApiOperation({ summary: 'Transporter views incoming requests' })
  async getIncomingRequests(@GetUser('id') userId: string) {
    return this.transporterService.getTransporterRequests(userId);
  }

  @Get('requests/mine')
  @ApiOperation({ summary: 'Farmer views their own requests' })
  async getMyRequests(@GetUser('id') userId: string) {
    return this.transporterService.getFarmerRequests(userId);
  }

  @Patch('requests/:id/respond')
  @ApiOperation({ summary: 'Transporter accepts / rejects / suggests date' })
  async respondToRequest(
    @GetUser('id') userId: string,
    @Param('id') requestId: string,
    @Body() dto: RespondRequestDto,
  ) {
    return this.transporterService.respondToRequest(userId, requestId, dto);
  }

  @Patch('requests/:id/complete')
  @ApiOperation({
    summary: 'Mark transport request as completed (either party)',
  })
  async markComplete(
    @GetUser('id') userId: string,
    @Param('id') requestId: string,
  ) {
    return this.transporterService.markRequestComplete(userId, requestId);
  }

  @Patch('requests/:id/cancel')
  @ApiOperation({ summary: 'Cancel transport request (either party)' })
  async cancelRequest(
    @GetUser('id') userId: string,
    @Param('id') requestId: string,
    @Body() dto: CancelRequestDto,
  ) {
    return this.transporterService.cancelTransportRequest(userId, requestId, dto);
  }

  @Patch('requests/:id/confirm-suggestion')
  @ApiOperation({ summary: 'Farmer confirms or declines suggested alternate date' })
  async confirmSuggestion(
    @GetUser('id') userId: string,
    @Param('id') requestId: string,
    @Body() dto: ConfirmSuggestionDto,
  ) {
    return this.transporterService.confirmSuggestion(userId, requestId, dto);
  }

  // ───── MISC ──────────────────────────────────────────────────

  @Get('all')
  @ApiOperation({ summary: 'Get all transporter profiles (legacy)' })
  async findAll(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
  ) {
    return this.transporterService.findAll(
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
      radius ? parseFloat(radius) : 10,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get transporter by profile ID' })
  async getTransporterById(@Param('id') id: string) {
    return this.transporterService.getTransporterById(id);
  }

  @Post('book')
  @ApiOperation({ summary: 'Book a trip (legacy TransportTrip flow)' })
  async bookTrip(@GetUser('id') userId: string, @Body() dto: CreateTripDto) {
    return this.transporterService.bookTrip(userId, dto);
  }
}
