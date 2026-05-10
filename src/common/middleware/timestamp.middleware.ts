import {
  Injectable,
  NestMiddleware,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../database/redis/redis.service';

@Injectable()
export class TimestampMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TimestampMiddleware.name);

  // 2-minute window — tight enough to block most replay attacks while tolerating
  // slow village-network round-trips (was 5 minutes, which was exploitably wide).
  private readonly TIMESTAMP_TOLERANCE_MS = 2 * 60 * 1000;

  // Nonce TTL must be > timestamp tolerance so a replayed nonce is always caught.
  // 3 minutes > 2-minute tolerance.
  private readonly NONCE_TTL_SECONDS = 180;

  private readonly enabled: boolean;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    this.enabled =
      this.configService.get('TIMESTAMP_VALIDATION_ENABLED') === 'true';
  }

  async use(req: Request, res: Response, next: NextFunction) {
    if (!this.enabled) return next();

    const url = req.url || '';
    if (
      req.method === 'GET' ||
      url.includes('/health') ||
      url.includes('/payments/webhook')
    ) {
      return next();
    }

    const timestamp = req.headers['x-timestamp'] as string;
    const nonce     = req.headers['x-nonce']     as string;

    if (!timestamp) {
      this.logger.warn(`Missing timestamp header from ${req.ip}`);
      throw new BadRequestException('Request timestamp required');
    }
    if (!nonce) {
      this.logger.warn(`Missing nonce header from ${req.ip}`);
      throw new BadRequestException('Request nonce required');
    }

    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime)) {
      throw new BadRequestException('Invalid timestamp format');
    }

    const timeDiff = Math.abs(Date.now() - requestTime);
    if (timeDiff > this.TIMESTAMP_TOLERANCE_MS) {
      this.logger.warn(`Timestamp out of range: ${timeDiff}ms from ${req.ip}`);
      throw new BadRequestException('Request timestamp expired or too far in future');
    }

    // Nonce replay check — store only a sentinel '1', not request metadata
    const nonceKey  = `nonce:${nonce}`;
    const nonceUsed = await this.redisService.get(nonceKey);
    if (nonceUsed) {
      this.logger.error(`Replay attack detected! Nonce reused: ${nonce.substring(0, 8)}... from ${req.ip}`);
      throw new BadRequestException('Request nonce already used (replay attack detected)');
    }

    // Mark nonce as used for its TTL window
    await this.redisService.set(nonceKey, '1', this.NONCE_TTL_SECONDS);

    this.logger.debug(`Request validated: nonce=${nonce.substring(0, 8)}...`);
    next();
  }
}
