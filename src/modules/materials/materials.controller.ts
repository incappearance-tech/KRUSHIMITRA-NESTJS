import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MaterialsService } from './materials.service';
import { CreateFarmerMaterialDto, BrowseMaterialsDto } from './dto/material.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import type { User } from '@prisma/client';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Materials')
@Controller('materials')
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FARMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new material listing (Farmers only)' })
  async createMaterial(
    @GetUser() user: User,
    @Body() dto: CreateFarmerMaterialDto,
  ) {
    return this.materialsService.createMaterial(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Browse nearby materials' })
  async browseMaterials(@Query() query: BrowseMaterialsDto) {
    return this.materialsService.browseMaterials(query);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FARMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get logged in farmer materials' })
  async getMyMaterials(@GetUser() user: User) {
    return this.materialsService.getMyMaterials(user.id);
  }

  @Post(':id/renew')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FARMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Renew a material listing' })
  async renewMaterial(@GetUser() user: User, @Param('id') id: string) {
    return this.materialsService.renewMaterial(user.id, id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.FARMER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a material listing' })
  async deleteMaterial(@GetUser() user: User, @Param('id') id: string) {
    return this.materialsService.deleteMaterial(user.id, id);
  }
}
