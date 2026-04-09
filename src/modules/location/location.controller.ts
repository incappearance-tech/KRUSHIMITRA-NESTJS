import { Controller, Get, Query, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';
import { LocationService } from './location.service';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Locations')
@Controller('locations')
@UseInterceptors(CacheInterceptor)
@CacheTTL(86400000) // 24 hours global default for this controller
export class LocationController {
    constructor(private readonly locationService: LocationService) { }

    @Get('states')
    @ApiOperation({ summary: 'Get all states' })
    async getStates() {
        return this.locationService.getStates();
    }

    @Get('districts')
    @ApiOperation({ summary: 'Get districts by state' })
    async getDistricts(@Query('stateId') stateId: string) {
        return this.locationService.getDistricts(stateId);
    }

    @Get('talukas')
    @ApiOperation({ summary: 'Get talukas by district' })
    async getTalukas(@Query('districtId') districtId: string) {
        return this.locationService.getTalukas(districtId);
    }

    @Get('villages')
    @ApiOperation({ summary: 'Get villages by taluka' })
    async getVillages(@Query('talukaId') talukaId: string) {
        return this.locationService.getVillages(talukaId);
    }
}
