import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('images-queue')
export class ImageWorker extends WorkerHost {
    private readonly logger = new Logger(ImageWorker.name);

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing image job: ${job.id} for type ${job.name}`);

        try {
            // Handle heavy image compression/storing in S3/CloudFlare
            await new Promise((resolve) => setTimeout(resolve, 800));
            this.logger.log(`Completed image job: ${job.id}`);
            return { success: true };
        } catch (error) {
            this.logger.error(`Failed image job: ${job.id}`, error);
            throw error;
        }
    }
}
