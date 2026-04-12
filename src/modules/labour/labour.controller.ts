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
  Req,
} from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { HttpCacheInterceptor } from '../../common/interceptors/http-cache.interceptor';
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
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(86400000) // 24 hours
  async getTypes() {
    return this.labourService.getTypes();
  }

  @Get('leads')
  @UseGuards(JwtAuthGuard)
  getLeads(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.labourService.getLeads(req.user.id, pageNum, limitNum);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard)
  getJobHistory(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.labourService.getJobHistory(req.user.id, pageNum, limitNum);
  }

  @Get('active')
  @UseGuards(JwtAuthGuard)
  getActiveJobs(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    return this.labourService.getActiveJobs(req.user.id, pageNum, limitNum);
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
  @UseInterceptors(HttpCacheInterceptor)
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
    @Query('pincode') pincode?: string,
    @Query('district') district?: string,
    @Query('taluka') taluka?: string,
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
      pincode,
      district,
      taluka,
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

  @Patch('leads/:id/cancel')
  @UseGuards(JwtAuthGuard)
  cancelBooking(
    @Req() req: any,
    @Param('id') bookingId: string,
  ) {
    return this.labourService.cancelBooking(req.user.id, bookingId);
  }

  @Patch('requests/:id/cancel')
  @UseGuards(JwtAuthGuard)
  cancelFarmerRequest(
    @GetUser('id') userId: string,
    @Param('id') bookingId: string,
  ) {
    return this.labourService.cancelFarmerBooking(userId, bookingId);
  }

  @Get('details/:id')
  async findOne(@Param('id') id: string) {
    return this.labourService.findOne(id);
  }
}
