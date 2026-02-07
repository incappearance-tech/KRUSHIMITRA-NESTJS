import { SetMetadata } from '@nestjs/common';

export const CACHE_KEY_METADATA = 'cache:key';
export const CACHE_TTL_METADATA = 'cache:ttl';

/**
 * Decorator to mark a method for caching
 * @param cacheKey - Redis cache key prefix
 * @param ttl - Time to live in seconds
 * 
 * @example
 * @Cacheable('user', 300) // Cache for 5 minutes
 * async findUserById(id: string) { ... }
 */
export const Cacheable = (cacheKey: string, ttl: number = 300) => {
    return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        SetMetadata(CACHE_KEY_METADATA, cacheKey)(target, propertyKey, descriptor);
        SetMetadata(CACHE_TTL_METADATA, ttl)(target, propertyKey, descriptor);
        return descriptor;
    };
};
