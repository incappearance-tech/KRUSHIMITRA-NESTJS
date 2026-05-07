import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  public client: Redis;

  constructor(private configService: ConfigService) {
    let host = this.configService.get<string>('REDIS_HOST', 'localhost');
    // Remove protocol if present (common user error)
    host = host.replace(/^https?:\/\//, '').replace(/^redis:\/\//, '');

    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    // Auto-enable TLS for Upstash/Production
    const isRemote = host !== 'localhost';
    const tlsOptions = isRemote ? { servername: host } : undefined;

    this.client = new Redis({
      host,
      port,
      password,
      tls: tlsOptions,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        return delay;
      },
      maxRetriesPerRequest: null,
      keepAlive: 10000, // Sends ping every 10 seconds to prevent ECONNRESET
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          return true; // Reconnect when error is READONLY
        }
        return false;
      },
      connectTimeout: 20000,
    });

    this.client.on('error', (err: any) => {
      // Don't log ECONNRESET as a full error as it's common with serverless Redis
      if (err?.code === 'ECONNRESET') {
        console.warn('Redis Connection Reset (ECONNRESET) - ioredis will reconnect automatically.');
        return;
      }
      console.error('RedisService Error:', err);
    });
  }

  async set(key: string, value: string, ttlSeconds?: number) {
    if (ttlSeconds) {
      return this.client.set(key, value, 'EX', ttlSeconds);
    }
    return this.client.set(key, value);
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async del(key: string) {
    return this.client.del(key);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}
