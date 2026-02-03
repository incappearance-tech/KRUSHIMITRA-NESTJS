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
                const privateKey = this.configService.get<string>('RSA_PRIVATE_KEY');
                if (!privateKey) {
                    throw new Error('Server RSA Private Key not configured');
                }

                const decryptedBody = CryptoUtil.decryptPayload(req.body.payload, privateKey.replace(/\\n/g, '\n'));
                req.body = decryptedBody;
            } catch (error) {
                throw new BadRequestException('Invalid encrypted payload');
            }
        } else if (this.configService.get('ENCRYPTION_REQUIRED') === 'true' && !isEncrypted && hasBody) {
            // Option to enforce encryption in production
            throw new BadRequestException('Encryption required for this endpoint');
        }

        next();
    }
}
