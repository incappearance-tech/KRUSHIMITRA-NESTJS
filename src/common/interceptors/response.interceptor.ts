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

export interface StandardResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T | string;
  path: string;
  timestamp: string;
  encrypted: boolean;
  version: string;
  error: any;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<
  T,
  StandardResponse<T>
> {
  constructor(private configService: ConfigService) { }

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<StandardResponse<T>> {
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<any>();
    const response = httpCtx.getResponse<any>();

    const isEncryptionEnabled =
      this.configService.get('ENCRYPTION_ENABLED') === 'true';

    // 🚀 CRITICAL: Skip standard response wrapping and encryption for SSE streams
    // SSE requires raw text/event-stream format, and standard wrapping breaks it.
    if (request.headers['accept'] === 'text/event-stream' || request.url.includes('/stream')) {
      return next.handle();
    }

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
          }
        }

        return {
          success: true,
          statusCode: response.statusCode || response.code, // Support both Fastify and Express status access
          message: message,
          data: responseData ?? {},
          path: request.url,
          timestamp: new Date().toISOString(),
          encrypted,
          version: '1.0',
          error: null,
        };
      }),
    );
  }
}
