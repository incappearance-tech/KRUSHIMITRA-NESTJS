import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';

@Processor('payments-queue')
export class PaymentWorker extends WorkerHost {
    private readonly logger = new Logger(PaymentWorker.name);

    async process(job: Job<any, any, string>): Promise<any> {
        this.logger.log(`Processing payment job: ${job.id} for type ${job.name}`);

        try {
            // Handle async webhook verification/ledger updates
            await new Promise((resolve) => setTimeout(resolve, 1000));
            this.logger.log(`Completed payment job: ${job.id}`);
            return { success: true };
        } catch (error) {
            this.logger.error(`Failed payment job: ${job.id}`, error);
            throw error;
        }
    }
}
