import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma/prisma.service';

@Injectable()
export class CleanupService {
    private readonly logger = new Logger(CleanupService.name);

    constructor(private prisma: PrismaService) { }

    // Run every day at 2:00 AM
    @Cron(CronExpression.EVERY_DAY_AT_2AM)
    async cleanupIncompleteRegistrations() {
        try {
            this.logger.log('Starting cleanup of incomplete GUEST registrations...');

            // Delete unverified users who haven't upgraded their role in 7 days
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

            const result = await this.prisma.user.deleteMany({
                where: {
                    isVerified: false, // Changed from role: 'GUEST'
                    createdAt: {
                        lt: sevenDaysAgo
                    }
                }
            });

            this.logger.log(`Cleaned up ${result.count} incomplete registrations`);
            return result;
        } catch (error) {
            this.logger.error('Failed to cleanup incomplete registrations', error);
            throw error;
        }
    }

    // Manual trigger endpoint (for testing)
    async triggerCleanup() {
        return this.cleanupIncompleteRegistrations();
    }
}
