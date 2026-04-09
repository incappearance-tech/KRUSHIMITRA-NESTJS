import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ImageWorker } from './image.worker';

@Module({
    imports: [
        BullModule.registerQueue({
            name: 'images-queue',
        }),
    ],
    providers: [ImageWorker],
    exports: [BullModule],
})
export class ImageWorkerModule { }
