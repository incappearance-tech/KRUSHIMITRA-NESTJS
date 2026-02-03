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
        const publicKey = this.configService.get<string>('RSA_PUBLIC_KEY');

        return next.handle().pipe(
            map((result) => {
                let data = result;
                let message = 'Request successful';

                // Handle cases where the controller returns an object with data and message
                if (result && typeof result === 'object' && ('data' in result || 'message' in result)) {
                    data = result.data !== undefined ? result.data : result;
                    message = result.message || message;
                }

                let responseData = data;
                let encrypted = false;

                if (isEncryptionEnabled && publicKey && data !== null && data !== undefined) {
                    responseData = CryptoUtil.encryptPayload(data, publicKey.replace(/\\n/g, '\n'));
                    encrypted = true;
                }

                return {
                    success: true,
                    statusCode: response.statusCode,
                    message: message,
                    data: responseData,
                    path: request.url,
                    timestamp: new Date().toISOString(),
                    encrypted,
                    version: '1.0',
                };
            }),
        );
    }
}
