import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { MachinesService } from './machines.service';
import { CreateMachineDto, MachineFilterDto } from './dto/machine.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';

@ApiTags('Machinery Marketplace')
@Controller('machines')
export class MachinesController {
    constructor(private readonly machinesService: MachinesService) { }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @Post()
    @ApiOperation({ summary: 'Create a new machine listing (Sell/Rent)' })
    @ApiResponse({ status: 201, description: 'Listing created successfully' })
    async create(
        @Body() createMachineDto: CreateMachineDto,
        @GetUser() user: User
    ) {
        return this.machinesService.createListing(user.id, createMachineDto);
    }

    @Get()
    @ApiOperation({ summary: 'Get all machine listings with filters' })
    async findAll(@Query() filters: MachineFilterDto) {
        return this.machinesService.findAll(filters);
    }

    @Get(':id')
    @ApiOperation({ summary: 'Get details of a specific machine' })
    @ApiResponse({ status: 200, description: 'Return machine details' })
    @ApiResponse({ status: 404, description: 'Machine not found' })
    async findOne(@Param('id') id: string) {
        return this.machinesService.findOne(id);
    }
}
