import { Module } from '@nestjs/common';
import { TransporterController } from './transporter.controller';
import { TransporterService } from './transporter.service';
import { TransporterProfileService } from './profile.service';
import { VehicleService } from './vehicle.service';

@Module({
  controllers: [TransporterController],
  providers: [TransporterService, TransporterProfileService, VehicleService],
  exports: [TransporterService, TransporterProfileService, VehicleService],
})
export class TransporterModule { }
