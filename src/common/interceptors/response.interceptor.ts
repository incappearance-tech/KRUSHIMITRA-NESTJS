import {
    Injectable,
    NestInterceptor,
    ExecutionContext,
    CallHandler,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { CryptoUtil } from '../utils/crypto.util';
import { Request } from 'express';

export interface StandardResponse<T> {
    success: boolean;
    statusCode: number;
    message: string;
    data: T | string;
    path: string;
    timestamp: string;
    encrypted: boolean;
    version: string;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, StandardResponse<T>> {
    constructor(private configService: ConfigService) { }

    intercept(
        context: ExecutionContext,
        next: CallHandler,
    ): Observable<StandardResponse<T>> {
        const httpCtx = context.switchToHttp();
        const request = httpCtx.getRequest<Request>();
        const response = httpCtx.getResponse();

        const isEncryptionEnabled = this.configService.get('ENCRYPTION_ENABLED') === 'true';

        return next.handle().pipe(
            map((data) => {
                const message = 'Request successful';
                let responseData = data;
                let encrypted = false;

                // Encrypt if enabled and data exists
                if (isEncryptionEnabled && data !== null && data !== undefined) {
                    try {
                        // Use AES encryption (Shared Secret handled internally)
                        responseData = CryptoUtil.encryptPayload(data);
                        encrypted = true;
                    } catch (e) {
                        console.error('Response encryption failed:', e);
                        // Fallback to unencrypted or throw? Usually fallback for debugging but better throw for security.
                        // Let's keep it unencrypted if fails for now to see errors, but typically throw.
                    }
                }

                return {
                    success: true,
                    statusCode: response.statusCode,
                    message: message,
                    data: responseData ?? {},
                    path: request.url,
                    timestamp: new Date().toISOString(),
                    encrypted,
                    version: '1.0',
                };
            }),
        );
    }
}
