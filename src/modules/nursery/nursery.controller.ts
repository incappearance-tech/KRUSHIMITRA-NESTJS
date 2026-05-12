import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { NurseryProductCategory } from '@prisma/client';
import { NurseryService } from './nursery.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { HttpCacheInterceptor } from '../../common/interceptors/http-cache.interceptor';
import { CreateNurseryProfileDto } from './dto/nursery-profile.dto';
import {
  CreateNurseryProductDto,
  UpdateNurseryProductDto,
  CreateNurseryEnquiryDto,
  RespondEnquiryDto,
} from './dto/nursery-product.dto';

@ApiTags('Nursery')
@Controller('nursery')
@ApiBearerAuth()
export class NurseryController {
  constructor(private readonly nurseryService: NurseryService) {}

  // === NURSERY OWNER ENDPOINTS ===

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get own nursery profile' })
  getProfile(@GetUser('id') userId: string) {
    return this.nurseryService.getProfile(userId);
  }

  @Post('profile')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Create or update nursery business profile' })
  upsertProfile(
    @GetUser('id') userId: string,
    @Body() dto: CreateNurseryProfileDto,
  ) {
    return this.nurseryService.upsertProfile(userId, dto);
  }

  @Get('products/mine')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get all products listed by this nursery owner' })
  getMyProducts(
    @GetUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.nurseryService.getMyProducts(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
      category as NurseryProductCategory | undefined,
    );
  }

  @Post('products')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Add a new product listing' })
  addProduct(
    @GetUser('id') userId: string,
    @Body() dto: CreateNurseryProductDto,
  ) {
    return this.nurseryService.addProduct(userId, dto);
  }

  @Patch('products/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Update a product listing' })
  updateProduct(
    @GetUser('id') userId: string,
    @Param('id') productId: string,
    @Body() dto: UpdateNurseryProductDto,
  ) {
    return this.nurseryService.updateProduct(userId, productId, dto);
  }

  @Delete('products/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Delete a product listing' })
  deleteProduct(
    @GetUser('id') userId: string,
    @Param('id') productId: string,
  ) {
    return this.nurseryService.deleteProduct(userId, productId);
  }

  @Patch('products/:id/toggle')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Toggle product availability (in-stock / out-of-stock)' })
  toggleProductAvailability(
    @GetUser('id') userId: string,
    @Param('id') productId: string,
  ) {
    return this.nurseryService.toggleProductAvailability(userId, productId);
  }

  @Get('enquiries')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get incoming enquiries for nursery owner' })
  getEnquiries(
    @GetUser('id') userId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.nurseryService.getMyEnquiries(
      userId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  @Patch('enquiries/:id/respond')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Respond to a farmer enquiry' })
  respondToEnquiry(
    @GetUser('id') userId: string,
    @Param('id') enquiryId: string,
    @Body() dto: RespondEnquiryDto,
  ) {
    return this.nurseryService.respondToEnquiry(userId, enquiryId, dto.message);
  }

  @Patch('enquiries/:id/close')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Close a resolved enquiry' })
  closeEnquiry(
    @GetUser('id') userId: string,
    @Param('id') enquiryId: string,
  ) {
    return this.nurseryService.closeEnquiry(userId, enquiryId);
  }

  // === FARMER-FACING / PUBLIC ENDPOINTS ===

  @Get('all')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(30000)
  @ApiOperation({ summary: 'GPS-based nursery discovery for farmers' })
  @ApiQuery({ name: 'lat', required: false })
  @ApiQuery({ name: 'lng', required: false })
  @ApiQuery({ name: 'radius', required: false })
  @ApiQuery({ name: 'searchQuery', required: false })
  @ApiQuery({ name: 'category', required: false, enum: NurseryProductCategory })
  @ApiQuery({ name: 'deliveryOnly', required: false })
  findAll(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchQuery') searchQuery?: string,
    @Query('category') category?: string,
    @Query('deliveryOnly') deliveryOnly?: string,
  ) {
    return this.nurseryService.findAll({
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radius: radius ? parseFloat(radius) : 50,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 15,
      searchQuery,
      category: category as NurseryProductCategory | undefined,
      deliveryOnly: deliveryOnly === 'true',
    });
  }

  @Get('products/all')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(30000)
  @ApiOperation({ summary: 'Search all nursery products by GPS, category, price, season' })
  @ApiQuery({ name: 'category', required: false, enum: NurseryProductCategory })
  findProducts(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
    @Query('radius') radius?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('searchQuery') searchQuery?: string,
    @Query('category') category?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('season') season?: string,
    @Query('deliveryOnly') deliveryOnly?: string,
  ) {
    return this.nurseryService.findProducts({
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      radius: radius ? parseFloat(radius) : 50,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 15,
      searchQuery,
      category: category as NurseryProductCategory | undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      season,
      deliveryOnly: deliveryOnly === 'true',
    });
  }

  @Get('products/:id')
  @ApiOperation({ summary: 'Get single product detail with nursery info' })
  getProductById(@Param('id') id: string) {
    return this.nurseryService.getProductById(id);
  }

  @Get('seasonal')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(3600000) // 1 hour cache — season doesn't change every minute
  @ApiOperation({ summary: 'Get seasonal product suggestions based on current month' })
  getSeasonalSuggestions(
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.nurseryService.getSeasonalSuggestions(
      lat ? parseFloat(lat) : undefined,
      lng ? parseFloat(lng) : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get nursery detail with all available products' })
  getNurseryById(@Param('id') id: string) {
    return this.nurseryService.getNurseryById(id);
  }

  // === ENQUIRY CREATION (Farmer sends enquiry) ===

  @Post('enquiry')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Farmer sends an enquiry to a nursery about a product' })
  createEnquiry(
    @GetUser('id') farmerId: string,
    @Body() dto: CreateNurseryEnquiryDto,
  ) {
    return this.nurseryService.createEnquiry(farmerId, dto);
  }
}
