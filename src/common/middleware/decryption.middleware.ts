import {
  Injectable,
  NestMiddleware,
  BadRequestException,
} from '@nestjs/common';
import { CryptoUtil } from '../utils/crypto.util';

@Injectable()
export class DecryptionMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const isEncrypted    = req.headers['x-encrypted'] === 'true';
    const encryptionType = (req.headers['x-encryption-type'] as string) || 'aes';
    const hasBody        = req.body && Object.keys(req.body).length > 0;
    const isWebhook      = (req.url || '').includes('/payments/webhook');

    if (isWebhook) return next();

    if (isEncrypted && hasBody) {
      try {
        if (encryptionType === 'rsa-aes' && req.body.encryptedKey) {
          // ── RSA-4096 + AES-256-GCM hybrid ─────────────────────────────
          const { data, aesKey } = CryptoUtil.decryptHybridPayload(req.body);
          req.body   = data;
          req.aesKey = aesKey;
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEV] 🔓 Decrypted RSA+AES request [${req.method} ${req.url}]:`, JSON.stringify(data).substring(0, 300));
          }
        } else if (req.body.payload && typeof req.body.payload === 'string') {
          // ── Legacy shared-secret AES ───────────────────────────────────
          req.body = CryptoUtil.decryptPayload(req.body.payload);
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[DEV] 🔓 Decrypted AES request [${req.method} ${req.url}]:`, JSON.stringify(req.body).substring(0, 300));
          }
        }
      } catch (error: any) {
        throw new BadRequestException('Invalid encrypted payload');
      }
    }

    next();
  }
}
