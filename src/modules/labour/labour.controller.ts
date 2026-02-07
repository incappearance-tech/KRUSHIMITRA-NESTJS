import { Controller, Get, Post, Body, UseGuards, Param } from '@nestjs/common';
import { LabourService } from './labour.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CreateLabourProfileDto } from './dto/labour-profile.dto';

@Controller('labour')
@UseGuards(JwtAuthGuard)
export class LabourController {
    constructor(private readonly labourService: LabourService) { }

    @Get('types')
    async getTypes() {
        return this.labourService.getTypes();
    }

    @Get('leads')
    async getLeads(@GetUser('id') userId: string) {
        return this.labourService.getLeads(userId);
    }

    @Get('profile')
    async getProfile(@GetUser('id') userId: string) {
        return this.labourService.getProfile(userId);
    }

    @Post('profile')
    async updateProfile(@GetUser('id') userId: string, @Body() dto: CreateLabourProfileDto) {
        return this.labourService.upsertProfile(userId, dto);
    }

    @Get('all')
    async findAll() {
        return this.labourService.findAll();
    }
    @Get('details/:id')
    async findOne(@Param('id') id: string) {
        return this.labourService.findOne(id);
    }
}
