import { Controller, Get, Post, Body, UseGuards, Delete, Param, Patch } from '@nestjs/common';
import { TransporterService } from './transporter.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CreateTransporterProfileDto } from './dto/transporter-profile.dto';
import { CreateVehicleDto } from './dto/vehicle.dto';
import { CreateTripDto } from './dto/create-trip.dto';

@Controller('transporter')
@UseGuards(JwtAuthGuard)
export class TransporterController {
    constructor(private readonly transporterService: TransporterService) { }

    @Get('leads')
    async getLeads(@GetUser('id') userId: string) {
        return this.transporterService.getLeads(userId);
    }

    @Post('leads/:id/status')
    async updateLeadStatus(
        @GetUser('id') userId: string,
        @Param('id') leadId: string,
        @Body('status') status: string
    ) {
        return this.transporterService.updateLeadStatus(userId, leadId, status);
    }

    @Get('profile')
    async getProfile(@GetUser('id') userId: string) {
        return this.transporterService.getProfile(userId);
    }

    @Post('profile')
    async updateProfile(@GetUser('id') userId: string, @Body() dto: CreateTransporterProfileDto) {
        return this.transporterService.upsertProfile(userId, dto);
    }

    @Post('vehicles')
    async addVehicle(@GetUser('id') userId: string, @Body() dto: CreateVehicleDto) {
        return this.transporterService.addVehicle(userId, dto);
    }

    @Delete('vehicles/:id')
    async deleteVehicle(@Param('id') vehicleId: string) {
        return this.transporterService.deleteVehicle(vehicleId);
    }

    @Patch('vehicles/:id')
    async updateVehicle(
        @GetUser('id') userId: string,
        @Param('id') vehicleId: string,
        @Body() dto: Partial<CreateVehicleDto>
    ) {
        return this.transporterService.updateVehicle(userId, vehicleId, dto);
    }

    @Get('all')
    async findAll() {
        return this.transporterService.findAll();
    }

    @Get(':id')
    async getTransporterById(@Param('id') id: string) {
        return this.transporterService.getTransporterById(id);
    }

    @Post('book')
    async bookTrip(@GetUser('id') userId: string, @Body() dto: CreateTripDto) {
        return this.transporterService.bookTrip(userId, dto);
    }

    @Get('my-trips')
    async getMyTrips(@GetUser('id') userId: string) {
        return this.transporterService.getFarmerTrips(userId);
    }
}
