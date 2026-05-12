import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    // Register the payments queue so PaymentsService can enqueue jobs
    BullModule.registerQueue({ name: 'payments-queue' }),
  ],
  controllers: [PaymentsController],
  providers:   [PaymentsService],
  exports:     [PaymentsService],
})
export class PaymentsModule {}
