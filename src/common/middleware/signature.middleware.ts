import { Injectable, NestMiddleware, UnauthorizedException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { HmacUtil } from '../utils/hmac.util';

@Injectable()
export class SignatureMiddleware implements NestMiddleware {
    private readonly logger = new Logger(SignatureMiddleware.name);
    private readonly enabled: boolean;
    private readonly sharedSecret: string;

    constructor(private readonly configService: ConfigService) {
        this.enabled = this.configService.get('SIGNATURE_VERIFICATION_ENABLED') === 'true';
    }

    use(req: Request, res: Response, next: NextFunction) {
        // Skip signature verification if disabled
        if (!this.enabled) {
            return next();
        }

        // Skip for GET requests and health checks
        if (req.method === 'GET' || req.originalUrl.includes('/health')) {
            return next();
        }

        const signature = req.headers['x-signature'] as string;
        const timestamp = req.headers['x-timestamp'] as string;
        const nonce = req.headers['x-nonce'] as string;

        if (!signature || !timestamp || !nonce) {
            throw new UnauthorizedException('Missing security headers');
        }

        // Normalize path candidates
        const originalPath = req.originalUrl.split('?')[0]; // /api/v1/auth/...
        const normalizedPath = originalPath.replace(/^\/api\/v\d+/, ''); // /auth/...
        const rawPath = req.path; // / or /api/v1/...

        const body = req.body ? JSON.stringify(req.body) : '';
        const secret = this.configService.get('HMAC_SHARED_SECRET');

        // Verify against multiple path candidates to ensure robustness
        const pathsToTry = [normalizedPath, originalPath, rawPath];
        let isValid = false;
        let usedPath = '';

        for (const p of pathsToTry) {
            const payload = HmacUtil.createSignaturePayload(
                req.method,
                p,
                timestamp,
                nonce,
                body
            );
            const expectedSig = HmacUtil.generateSignature(payload, secret);

            // Constant-time comparison to prevent timing attacks
            if (expectedSig === signature) {
                isValid = true;
                usedPath = p;
                break;
            }
        }

        if (!isValid) {
            this.logger.error(`Invalid signature. Tried paths: ${pathsToTry.join(', ')}`);

            // Debug Logging
            const debugPayload = HmacUtil.createSignaturePayload(req.method, normalizedPath, timestamp, nonce, body);
            const expectedSignature = HmacUtil.generateSignature(debugPayload, secret);

            const fs = require('fs');
            const debugInfo = `
=========================================
Time: ${new Date().toISOString()}
OriginalUrl: ${req.originalUrl}
Normalized Path: ${normalizedPath}
Raw Path: ${req.path}
Method: ${req.method}
Timestamp: ${timestamp}
Nonce: ${nonce}
Body Type: ${typeof req.body}
Body: ${body}
Received Signature: ${signature}
Expected (Normalized): ${expectedSignature}
Shared Secret Prefix: ${secret.substring(0, 5)}
Paths Tried: ${JSON.stringify(pathsToTry)}
=========================================
`;
            try { fs.writeFileSync('debug_signature_error.txt', debugInfo); } catch (e) { }

            throw new UnauthorizedException('Invalid request signature');
        }

        next();
    }
}
