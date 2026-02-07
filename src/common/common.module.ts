import { Module } from '@nestjs/common';
import { CleanupService } from './services/cleanup.service';
import { PrismaModule } from '../database/prisma/prisma.module';

@Module({
    imports: [PrismaModule],
    providers: [CleanupService],
    exports: [CleanupService],
})
export class CommonModule { }
