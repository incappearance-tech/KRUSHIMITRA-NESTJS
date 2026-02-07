import { Module } from '@nestjs/common';
import { TransporterController } from './transporter.controller';
import { TransporterService } from './transporter.service';

@Module({
    controllers: [TransporterController],
    providers: [TransporterService],
})
export class TransporterModule { }
