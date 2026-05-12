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

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService.get('SIGNATURE_VERIFICATION_ENABLED') === 'true';
  }

  use(req: Request, res: Response, next: NextFunction) {
    if (!this.enabled) return next();

    if (
      req.method === 'GET' ||
      req.url.includes('/health') ||
      req.url.includes('/upload') ||
      req.url.includes('/payments/webhook')
    ) {
      return next();
    }

    const signature = req.headers['x-signature'] as string;
    const timestamp  = req.headers['x-timestamp']  as string;
    const nonce      = req.headers['x-nonce']      as string;

    if (!signature || !timestamp || !nonce) {
      throw new UnauthorizedException('Missing security headers');
    }

    const originalPath   = req.url.split('?')[0];
    const normalizedPath = originalPath.replace(/^\/api\/v\d+/, '');
    const rawPath        = req.path;

    const body   = req.body ? JSON.stringify(req.body) : '';
    const secret = this.configService.get('HMAC_SHARED_SECRET');

    const pathsToTry = [normalizedPath, originalPath, rawPath];
    let isValid  = false;
    let usedPath = '';

    for (const p of pathsToTry) {
      const payload     = HmacUtil.createSignaturePayload(req.method, p, timestamp, nonce, body);
      const expectedSig = HmacUtil.generateSignature(payload, secret);

      // HMAC-SHA256 → base64 is always 44 chars; reject immediately on length mismatch
      // to keep comparison strictly constant-time for matching-length inputs.
      const eBuf = Buffer.from(expectedSig);
      const sBuf = Buffer.from(signature);

      if (eBuf.length !== sBuf.length) {
        // Still do a dummy comparison so branch timing doesn't leak expectedSig length
        crypto.timingSafeEqual(eBuf, eBuf);
        continue;
      }

      try {
        if (crypto.timingSafeEqual(eBuf, sBuf)) {
          isValid  = true;
          usedPath = p;
          break;
        }
      } catch {
        // Should not happen (lengths already checked), but treat as invalid
      }
    }

    if (!isValid) {
      this.logger.warn(
        `Signature mismatch: method=${req.method} path=${normalizedPath} ip=${req.ip}`,
      );
      throw new UnauthorizedException('Invalid request signature');
    }

    next();
  }
}
