import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
    public client: Redis;

    constructor(private configService: ConfigService) {
        const host = this.configService.get<string>('REDIS_HOST', 'localhost');
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
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: null, // Recommended for BullMQ co-existence although this is separate client
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
