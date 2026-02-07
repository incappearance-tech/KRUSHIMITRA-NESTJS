import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MachinesService } from './machines.service';
import { CreateMachineDto, MachineFilterDto } from './dto/machine.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import type { User } from '@prisma/client';

@Controller('machines')
export class MachinesController {
    constructor(private readonly machinesService: MachinesService) { }

    @UseGuards(JwtAuthGuard)
    @Post()
    async create(
        @Body() createMachineDto: CreateMachineDto,
        @GetUser() user: User
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
}
