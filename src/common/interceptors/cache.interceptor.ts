import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { RedisService } from '../../database/redis/redis.service';
import { CACHE_KEY_METADATA, CACHE_TTL_METADATA } from '../decorators/cacheable.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
    constructor(
        private readonly reflector: Reflector,
        private readonly redisService: RedisService,
    ) { }

    async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
        const cacheKey = this.reflector.get<string>(CACHE_KEY_METADATA, context.getHandler());
        const ttl = this.reflector.get<number>(CACHE_TTL_METADATA, context.getHandler());

        // If no cache metadata, skip caching
        if (!cacheKey) {
            return next.handle();
        }

        // Generate unique cache key based on method arguments
        const request = context.switchToHttp().getRequest();
        const args = JSON.stringify({
            params: request.params,
            query: request.query,
            user: request.user?.id, // Include user ID if authenticated
        });
        const fullCacheKey = `cache:${cacheKey}:${args}`;

        // Try to get from cache
        try {
            const cachedData = await this.redisService.get(fullCacheKey);
            if (cachedData) {
                // Cache hit!
                return of(JSON.parse(cachedData));
            }
        } catch (error) {
            // Cache miss or error, continue to execute method
        }

        // Cache miss, execute method and cache result
        return next.handle().pipe(
            tap(async (data) => {
                try {
                    await this.redisService.set(
                        fullCacheKey,
                        JSON.stringify(data),
                        ttl || 300,
                    );
                } catch (error) {
                    // Silently fail cache write, don't break the request
                }
            }),
        );
    }
}
