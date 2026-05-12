import { Module } from '@nestjs/common';
import { NurseryController } from './nursery.controller';
import { NurseryService } from './nursery.service';

@Module({
  controllers: [NurseryController],
  providers: [NurseryService],
})
export class NurseryModule {}
