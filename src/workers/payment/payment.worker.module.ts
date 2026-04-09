import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentWorker } from './payment.worker';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'payments-queue',
        }),
    ],
    providers: [PaymentWorker],
    exports: [BullModule],
})
export class PaymentWorkerModule { }
