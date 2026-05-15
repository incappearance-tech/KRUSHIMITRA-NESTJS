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
import * as crypto from 'crypto';

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
            const payload     = HmacUtil.createSignaturePayload(req.method, p, timestamp, nonce, bodyString);
            const expectedSig = HmacUtil.generateSignature(payload, secret);

            // Timing-safe comparison — prevents timing side-channel attacks.
            // HMAC-SHA256 base64 is always 44 chars; buffers must be equal length.
            try {
                const eBuf = Buffer.from(expectedSig,  'base64');
                const sBuf = Buffer.from(signature ?? '', 'base64');
                if (eBuf.length === sBuf.length && crypto.timingSafeEqual(eBuf, sBuf)) {
                    isValid = true;
                    break;
                }
            } catch { /* malformed base64 — treat as invalid */ }
        }

        if (!isValid) {
            // Log only non-sensitive context — NEVER log expectedSig (information disclosure)
            this.logger.warn(
                `Signature mismatch: method=${req.method} path=${normalizedPath} ` +
                `ip=${req.ip} bodyLen=${bodyString.length}`,
            );
            throw new UnauthorizedException('Invalid request signature');
        }
    }

    private decryptBody(req: any) {
        const isEncrypted    = req.headers['x-encrypted'] === 'true';
        const encryptionType = (req.headers['x-encryption-type'] as string) || 'aes';

        if (!isEncrypted || !req.body) return;

        if (encryptionType === 'rsa-aes' && req.body.encryptedKey) {
            // ── RSA-4096 + AES-256-GCM hybrid ─────────────────────────────────
            try {
                const { data, aesKey } = CryptoUtil.decryptHybridPayload(req.body);
                req.body   = data;
                req.aesKey = aesKey; // stored for ResponseInterceptor to encrypt the response
                if (process.env.NODE_ENV !== 'production') {
                    this.logger.debug(`[DEV] 🔓 Decrypted RSA+AES [${req.method} ${req.url}]: ${JSON.stringify(data).substring(0, 200)}`);
                }
            } catch (error: any) {
                // Log every detail so the developer can see the root cause
                this.logger.error(`RSA+AES decryption failed: ${error?.message ?? error}`);
                this.logger.error(`RSA_PRIVATE_KEY set: ${!!process.env.RSA_PRIVATE_KEY}`);
                this.logger.error(`encryptedKey length: ${req.body?.encryptedKey?.length ?? 'N/A'}`);
                this.logger.error(`iv: ${req.body?.iv ?? 'N/A'}`);
                this.logger.error(`authTag: ${req.body?.authTag ?? 'N/A'}`);
                throw new BadRequestException(`Failed to decrypt request body: ${error?.message ?? 'unknown'}`);
            }
        } else if (req.body.payload && typeof req.body.payload === 'string') {
            // ── Legacy shared-secret AES ───────────────────────────────────────
            try {
                req.body = CryptoUtil.decryptPayload(req.body.payload);
                if (process.env.NODE_ENV !== 'production') {
                    this.logger.debug(`[DEV] 🔓 Decrypted AES [${req.method} ${req.url}]: ${JSON.stringify(req.body).substring(0, 200)}`);
                }
            } catch (error) {
                this.logger.error('AES decryption failed', error);
                throw new BadRequestException('Failed to decrypt request body');
            }
        }
    }
}
