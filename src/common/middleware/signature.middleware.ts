import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { HmacUtil } from '../utils/hmac.util';

@Injectable()
export class SignatureMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SignatureMiddleware.name);
  private readonly enabled: boolean;
  private readonly sharedSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get('SIGNATURE_VERIFICATION_ENABLED') === 'true';
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Skip signature verification if disabled
    if (!this.enabled) {
      return next();
    }

    // Skip for GET requests, health checks, uploads, and Razorpay webhook
    if (
      req.method === 'GET' ||
      req.url.includes('/health') ||
      req.url.includes('/upload') ||
      req.url.includes('/payments/webhook')
    ) {
      return next();
    }

    const signature = req.headers['x-signature'] as string;
    const timestamp = req.headers['x-timestamp'] as string;
    const nonce = req.headers['x-nonce'] as string;

    if (!signature || !timestamp || !nonce) {
      throw new UnauthorizedException('Missing security headers');
    }

    // Normalize path candidates
    const originalPath = req.url.split('?')[0]; // /api/v1/auth/...
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
        body,
      );
      const expectedSig = HmacUtil.generateSignature(payload, secret);

      // Timing-safe comparison prevents timing side-channel attacks
      try {
        const a = Buffer.from(expectedSig);
        const b = Buffer.from(signature.padEnd(expectedSig.length, '\0'));
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          isValid = true;
          usedPath = p;
          break;
        }
      } catch {
        // Buffer length mismatch — signature is invalid
      }
    }

    if (!isValid) {
      // Log only non-sensitive metadata — never log secrets, signatures, or body
      this.logger.warn(
        `Signature mismatch: method=${req.method} path=${normalizedPath} ip=${req.ip}`,
      );
      throw new UnauthorizedException('Invalid request signature');
    }

    next();
  }
}
