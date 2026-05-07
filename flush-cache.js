const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const { Redis } = require('ioredis');

async function flush() {
  const redisPort = envConfig.REDIS_PORT || 6379;
  const redisHost = envConfig.REDIS_HOST;
  const redisPassword = envConfig.REDIS_PASSWORD;
  
  let redisUrl = 'redis://localhost:6379';
  if (redisHost) {
    redisUrl = `rediss://default:${redisPassword}@${redisHost}:${redisPort}`;
  }
  
  const redis = new Redis(redisUrl);
  try {
    await redis.flushdb();
    console.log('Redis Flushed successfully!');
  } catch(e) {
    console.error(e);
  } finally {
    redis.quit();
  }
}
flush();
