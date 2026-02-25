import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Param,
  Query,
  Patch,
  UseInterceptors,
} from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { LabourService } from './labour.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CreateLabourProfileDto } from './dto/labour-profile.dto';
import {
  CreateLabourBookingDto,
  UpdateBookingStatusDto,
} from './dto/labour-booking.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Labour')
@Controller('labour')
// @UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LabourController {
  constructor(private readonly labourService: LabourService) { }

  @Get('types')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(86400000) // 24 hours
  async getTypes() {
    return this.labourService.getTypes();
  }

  @Get('leads')
  @UseGuards(JwtAuthGuard)
  async getLeads(@GetUser('id') userId: string) {
    return this.labourService.getLeads(userId);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  async getProfile(@GetUser('id') userId: string) {
    return this.labourService.getProfile(userId);
  }

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  async updateProfile(
    @GetUser('id') userId: string,
    @Body() dto: CreateLabourProfileDto,
  ) {
    return this.labourService.upsertProfile(userId, dto);
  }

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(30000) // 30 seconds
  async findAll(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchQuery') searchQuery?: string,
    @Query('skills') skills?: string,
    @Query('minRating') minRating?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    let parsedSkills: string[] | undefined;
    if (skills) {
      parsedSkills = skills.split(',').map((s) => s.trim());
    }

    return this.labourService.findAll({
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radius: radius ? parseFloat(radius) : 50,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 15,
      searchQuery,
      skills: parsedSkills,
      minRating: minRating ? parseFloat(minRating) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    });
  }
  @Post('book')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Farmer books a labourer' })
  async createBooking(
    @GetUser('id') userId: string,
    @Body() dto: CreateLabourBookingDto,
  ) {
    return this.labourService.createBooking(userId, dto);
  }

  @Get('my-bookings')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Farmer views their labour booking history' })
  async getMyBookings(@GetUser('id') userId: string) {
    return this.labourService.getMyBookings(userId);
  }

  @Patch('leads/:id/status')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Labourer accepts or rejects a booking' })
  async updateBookingStatus(
    @GetUser('id') userId: string,
    @Param('id') bookingId: string,
    @Body() dto: UpdateBookingStatusDto,
  ) {
    return this.labourService.updateBookingStatus(
      userId,
      bookingId,
      dto.status,
    );
  }

  @Get('details/:id')
  async findOne(@Param('id') id: string) {
    return this.labourService.findOne(id);
  }
}
