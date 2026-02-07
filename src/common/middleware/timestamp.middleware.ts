import { Injectable, NestMiddleware, BadRequestException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../database/redis/redis.service';

@Injectable()
export class TimestampMiddleware implements NestMiddleware {
    private readonly logger = new Logger(TimestampMiddleware.name);
    private readonly TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000; // 5 minutes
    private readonly NONCE_TTL_SECONDS = 600; // 10 minutes
    private readonly enabled: boolean;

    constructor(
        private readonly redisService: RedisService,
        private readonly configService: ConfigService,
    ) {
        this.enabled = this.configService.get('TIMESTAMP_VALIDATION_ENABLED') === 'true';
    }

    async use(req: Request, res: Response, next: NextFunction) {
        // Skip if timestamp validation is disabled
        if (!this.enabled) {
            return next();
        }

        // Skip timestamp validation for GET requests and health checks
        if (req.method === 'GET' || req.path.includes('/health')) {
            return next();
        }

        const timestamp = req.headers['x-timestamp'] as string;
        const nonce = req.headers['x-nonce'] as string;

        // Validate timestamp presence
        if (!timestamp) {
            this.logger.warn(`Missing timestamp header from ${req.ip}`);
            throw new BadRequestException('Request timestamp required');
        }

        // Validate nonce presence
        if (!nonce) {
            this.logger.warn(`Missing nonce header from ${req.ip}`);
            throw new BadRequestException('Request nonce required');
        }

        // Parse and validate timestamp
        const requestTime = parseInt(timestamp, 10);
        if (isNaN(requestTime)) {
            throw new BadRequestException('Invalid timestamp format');
        }

        const currentTime = Date.now();
        const timeDiff = Math.abs(currentTime - requestTime);

        // Check if request is within acceptable time window
        if (timeDiff > this.TIMESTAMP_TOLERANCE_MS) {
            this.logger.warn(`Request timestamp out of range: ${timeDiff}ms from ${req.ip}`);
            throw new BadRequestException('Request timestamp expired or too far in future');
        }

        // Check nonce hasn't been used before (prevents replay attacks)
        const nonceKey = `nonce:${nonce}`;
        const nonceExists = await this.redisService.get(nonceKey);

        if (nonceExists) {
            this.logger.error(`Replay attack detected! Nonce reused: ${nonce} from ${req.ip}`);
            throw new BadRequestException('Request nonce already used (replay attack detected)');
        }

        // Store nonce in Redis with TTL to prevent reuse
        await this.redisService.set(
            nonceKey,
            JSON.stringify({
                timestamp: requestTime,
                ip: req.ip,
                path: req.path,
                method: req.method,
            }),
            this.NONCE_TTL_SECONDS,
        );

        this.logger.debug(`Request validated: timestamp=${requestTime}, nonce=${nonce.substring(0, 8)}...`);
        next();
    }
}
