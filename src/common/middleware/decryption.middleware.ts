import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { ConfigService } from '@nestjs/config';
import { CryptoUtil } from '../utils/crypto.util';

@Injectable()
export class DecryptionMiddleware implements NestMiddleware {
    constructor(private configService: ConfigService) { }

    use(req: Request, res: Response, next: NextFunction) {
        // Only decrypt if body is present and it's a POST/PUT/PATCH request
        const isEncrypted = req.headers['x-encrypted'] === 'true';
        const hasBody = req.body && Object.keys(req.body).length > 0;

        if (isEncrypted && hasBody && typeof req.body.payload === 'string') {
            try {
                // AES Decryption (No RSA keys needed here, CryptoUtil uses the shared secret)
                const decryptedBody = CryptoUtil.decryptPayload(req.body.payload);
                req.body = decryptedBody;
            } catch (error) {
                console.error('Decryption Error Detail:', error);
                throw new BadRequestException(`Invalid encrypted payload: ${error.message}`);
            }
        } else if (this.configService.get('ENCRYPTION_REQUIRED') === 'true' && !isEncrypted && hasBody) {
            // Option to enforce encryption in production
            throw new BadRequestException('Encryption required for this endpoint');
        }

        next();
    }
}
