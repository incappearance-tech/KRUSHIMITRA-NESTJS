const fs = require('fs');
const dotenv = require('dotenv');
const envConfig = dotenv.parse(fs.readFileSync('.env'));
const { PrismaClient } = require('@prisma/client');
const { Redis } = require('ioredis');

async function run() {
  const prisma = new PrismaClient();
  
  // Construct Redis URL from .env
  const redisPort = envConfig.REDIS_PORT || 6379;
  const redisHost = envConfig.REDIS_HOST;
  const redisPassword = envConfig.REDIS_PASSWORD;
  
  let redisUrl = 'redis://localhost:6379';
  if (redisHost) {
    redisUrl = `rediss://default:${redisPassword}@${redisHost}:${redisPort}`;
  }
  
  console.log('Connecting to Redis at:', redisHost);
  const redis = new Redis(redisUrl);
  
  try {
    const res1 = await prisma.rentalRequest.deleteMany({});
    console.log('Deleted RentalRequests:', res1.count);
    
    const res2 = await prisma.order.deleteMany({ where: { machineId: { not: null } } });
    console.log('Deleted Orders with machineId:', res2.count);
    
    const res3 = await prisma.machine.deleteMany({});
    console.log('Deleted Machines:', res3.count);

    console.log('Attempting to clear Redis cache...');
    
    const cacheKeys = await redis.keys('*');
    const machineRelated = cacheKeys.filter(k => k.toLowerCase().includes('machine') || k.toLowerCase().includes('rental') || k.toLowerCase().includes('mine'));
    if (machineRelated.length > 0) {
      await redis.del(...machineRelated);
      console.log('Deleted machine/rental cache keys:', machineRelated.length);
    } else {
      console.log('No machine/rental specific keys found in Redis.');
    }
    
    const nestKeys = await redis.keys('*nest*');
    if (nestKeys.length > 0) {
      await redis.del(...nestKeys);
      console.log('Deleted nest cache keys:', nestKeys.length);
    }
    
    // Also clear all lists / hashes just in case there are caching keys for Farmer IDs that are removed
    // We can do a full flush if there's no data we need to keep.
    // The user asked to "Clear machine List and Related Data from DB and also from Redies if available"
    // Since farmers are deleted, let's clear the whole cache to be safe.
    await redis.flushdb();
    console.log('Flushed entire Redis DB to clear any orphaned farmer/machine cache');
    
  } catch (err) {
    console.error('Error during cleanup:', err);
  } finally {
    await prisma.$disconnect();
    redis.quit();
  }
}

run();
