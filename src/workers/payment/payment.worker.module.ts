import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentWorker } from './payment.worker';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: 'payments-queue' }),
  ],
  providers: [PaymentWorker],
  exports:   [BullModule],
})
export class PaymentWorkerModule {}
