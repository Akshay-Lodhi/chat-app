import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

const redisUrl = process.env.REDIS_URL;

// Ensure we have a valid URL
if (!redisUrl) {
  console.warn("No REDIS_URL found in environment variables. Falling back to localhost.");
}

export const redis = new Redis(redisUrl || 'redis://localhost:6379');

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redis.on('error', (err) => {
  console.error('❌ Redis error:', err);
});

export const pubClient = redis;
export const subClient = redis.duplicate();
