import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../database/redis/redis.service';
import { HmacUtil } from '../utils/hmac.util';
import { CryptoUtil } from '../utils/crypto.util';

@Injectable()
export class SecurityGuard implements CanActivate {
    private readonly logger = new Logger(SecurityGuard.name);
    private readonly TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;
    private readonly NONCE_TTL_SECONDS = 600;

    constructor(
        private readonly configService: ConfigService,
        private readonly redisService: RedisService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const http = context.switchToHttp();
        const request = http.getRequest<any>();

        // 1. Skip if on health or webhook routes, or if it's an OPTIONS request
        const url = request.url || '';
        if (request.method === 'OPTIONS' || url.includes('/health') || url.includes('/payments/webhook')) {
            return true;
        }

        // 2. Timestamp & Nonce Validation
        if (this.configService.get('TIMESTAMP_VALIDATION_ENABLED') === 'true') {
            await this.validateTimestamp(request);
        }

        // 3. Signature Verification
        if (this.configService.get('SIGNATURE_VERIFICATION_ENABLED') === 'true') {
            this.verifySignature(request);
        }

        // 4. Decryption
        this.decryptBody(request);

        return true;
    }

    private async validateTimestamp(req: any) {
        if (req.method === 'GET') return;

        const timestamp = req.headers['x-timestamp'];
        const nonce = req.headers['x-nonce'];

        if (!timestamp || !nonce) {
            throw new BadRequestException('Security headers (timestamp/nonce) missing');
        }

        const requestTime = parseInt(timestamp, 10);
        const timeDiff = Math.abs(Date.now() - requestTime);

        if (timeDiff > this.TIMESTAMP_TOLERANCE_MS) {
            throw new BadRequestException('Request timestamp out of range');
        }

        const nonceKey = `nonce:${nonce}`;
        const nonceExists = await this.redisService.get(nonceKey);
        if (nonceExists) {
            throw new BadRequestException('Nonce already used (replay attack)');
        }

        await this.redisService.set(nonceKey, '1', this.NONCE_TTL_SECONDS);
    }

    private verifySignature(req: any) {
        if (req.method === 'GET') return;

        const signature = req.headers['x-signature'];
        const timestamp = req.headers['x-timestamp'];
        const nonce = req.headers['x-nonce'];

        if (!signature || !timestamp || !nonce) {
            throw new UnauthorizedException('Missing security headers');
        }

        const secret = this.configService.get('HMAC_SHARED_SECRET');
        const url = req.url.split('?')[0];
        const normalizedPath = url.replace(/^\/api\/v\d+/, '');

        // In Guards, req.body is already parsed
        const bodyString = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : '';

        const pathsToTry = [normalizedPath, url];
        let isValid = false;

        for (const p of pathsToTry) {
            const payload = HmacUtil.createSignaturePayload(
                req.method,
                p,
                timestamp,
                nonce,
                bodyString,
            );
            const expectedSig = HmacUtil.generateSignature(payload, secret);
            if (expectedSig === signature) {
                isValid = true;
                break;
            }
        }

        if (!isValid) {
            const expectedSig = HmacUtil.generateSignature(
                HmacUtil.createSignaturePayload(req.method, normalizedPath, timestamp, nonce, bodyString),
                secret
            );
            const debugInfo = {
                url,
                normalizedPath,
                method: req.method,
                timestamp,
                nonce,
                bodyLen: bodyString.length,
                receivedSig: signature,
                expectedSig,
                bodyString: bodyString.substring(0, 100) + (bodyString.length > 100 ? '...' : ''),
            };
            this.logger.error(`Invalid signature for ${url}. Debug: ${JSON.stringify(debugInfo)}`);
            throw new UnauthorizedException('Invalid request signature');
        }
    }

    private decryptBody(req: any) {
        const isEncrypted = req.headers['x-encrypted'] === 'true';
        if (isEncrypted && req.body && req.body.payload) {
            try {
                req.body = CryptoUtil.decryptPayload(req.body.payload);
            } catch (error) {
                this.logger.error('Decryption failed', error);
                throw new BadRequestException('Failed to decrypt request body');
            }
        }
    }
}
