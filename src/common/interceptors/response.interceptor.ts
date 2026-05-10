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
  success:    boolean;
  statusCode: number;
  message:    string;
  data:       T | string;
  path:       string;
  timestamp:  string;
  encrypted:  boolean;
  version:    string;
  error:      any;
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, StandardResponse<T>> {
  constructor(private configService: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<StandardResponse<T>> {
    const httpCtx  = context.switchToHttp();
    const request  = httpCtx.getRequest<any>();
    const response = httpCtx.getResponse<any>();

    // Skip SSE streams
    if (
      response.getHeader?.('Content-Type') === 'text/event-stream' ||
      request.url?.includes('/notifications/stream') ||
      request.headers?.['accept'] === 'text/event-stream'
    ) {
      return next.handle();
    }

    const isEncryptionEnabled = this.configService.get('ENCRYPTION_ENABLED') === 'true';

    return next.handle().pipe(
      map((data) => {
        let responseData = data;
        let encrypted    = false;

        if (isEncryptionEnabled && data !== null && data !== undefined) {
          try {
            const aesKey = request.aesKey as Buffer | undefined;

            if (aesKey) {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEV] 🔐 Encrypting RSA+AES response [${request.url}]:`, JSON.stringify(data).substring(0, 300));
              }
              responseData = CryptoUtil.encryptWithAesKey(data, aesKey);
            } else {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEV] 🔐 Encrypting AES response [${request.url}]:`, JSON.stringify(data).substring(0, 300));
              }
              responseData = CryptoUtil.encryptPayload(data);
            }
            encrypted = true;
          } catch {
            // Encryption failure → send plaintext
          }
        }

        return {
          success:    true,
          statusCode: response.statusCode || response.code || 200,
          message:    'Request successful',
          data:       responseData ?? {},
          path:       request.url,
          timestamp:  new Date().toISOString(),
          encrypted,
          version:    '1.0',
          error:      null,
        };
      }),
    );
  }
}
