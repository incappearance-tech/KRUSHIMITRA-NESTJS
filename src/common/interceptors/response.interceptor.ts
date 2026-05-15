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
  data:       T;
  path:       string;
  timestamp:  string;
  version:    string;
  error:      any;
}

// Wire format when encryption is enabled — full envelope is inside payload
export interface EncryptedEnvelope {
  encrypted: true;
  payload:   string; // base64(AES-GCM( JSON<StandardResponse> ))
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
        // Build the full response envelope first
        const envelope: StandardResponse<typeof data> = {
          success:    true,
          statusCode: response.statusCode || response.code || 200,
          message:    'Request successful',
          data:       data ?? {},
          path:       request.url,
          timestamp:  new Date().toISOString(),
          version:    '1.0',
          error:      null,
        };

        if (isEncryptionEnabled && data !== null && data !== undefined) {
          try {
            const aesKey = request.aesKey as Buffer | undefined;

            if (aesKey) {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEV] 🔐 Encrypting full RSA+AES response [${request.url}]`);
              }
              // Encrypt the ENTIRE envelope — nothing leaks in plaintext
              return { encrypted: true, payload: CryptoUtil.encryptWithAesKey(envelope, aesKey) } as any;
            } else {
              if (process.env.NODE_ENV !== 'production') {
                console.log(`[DEV] 🔐 Encrypting full AES response [${request.url}]`);
              }
              return { encrypted: true, payload: CryptoUtil.encryptPayload(envelope) } as any;
            }
          } catch {
            // Encryption failure → fall through to plaintext
          }
        }

        return { ...envelope, encrypted: false };
      }),
    );
  }
}
