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
} from '@nestjs/common';
import { MachinesService } from './machines.service';
import { CreateMachineDto, MachineFilterDto } from './dto/machine.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';

@ApiTags('Machines')
@Controller('machines')
export class MachinesController {
  constructor(private readonly machinesService: MachinesService) {}

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

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.machinesService.findOne(id);
  }

  @Get('categories')
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
}
