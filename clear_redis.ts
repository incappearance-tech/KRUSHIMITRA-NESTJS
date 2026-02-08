import Redis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

async function clearRedis() {
    const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT) || 6379,
    });

    try {
        console.log('Connecting to Redis...');
        await redis.flushall();
        console.log('🚀 Redis DB cleared successfully (FLUSHALL completed).');
    } catch (error: any) {
        console.error('❌ Failed to clear Redis:', error.message);
    } finally {
        await redis.quit();
        process.exit(0);
    }
}

clearRedis();
