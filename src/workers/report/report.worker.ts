import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('reports-queue')
export class ReportWorker extends WorkerHost {
    private readonly logger = new Logger(ReportWorker.name);

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing report job: ${job.id} for type ${job.name}`);

        try {
            // Simulate heavy Excel/CSV generation
            await new Promise((resolve) => setTimeout(resolve, 2000));
            this.logger.log(`Completed report job: ${job.id}`);
            return { success: true };
        } catch (error) {
            this.logger.error(`Failed report job: ${job.id}`, error);
            throw error;
        }
    }
}
