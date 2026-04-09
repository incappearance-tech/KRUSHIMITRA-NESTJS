import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReportWorker } from './report.worker';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'reports-queue',
        }),
    ],
    providers: [ReportWorker],
    exports: [BullModule],
})
export class ReportWorkerModule { }
