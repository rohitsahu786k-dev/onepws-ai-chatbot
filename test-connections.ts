
import mongoose from 'mongoose';
import IORedis from 'ioredis';
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnections() {
  console.log('--- Testing MongoDB ---');
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/onepws-chatbot';
  console.log(`Connecting to MongoDB at: ${mongoUri}`);
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connection successful!');
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log(`Found ${collections.length} collections.`);
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
  }

  console.log('\n--- Testing Redis ---');
  const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
  console.log(`Connecting to Redis at: ${redisUrl}`);
  try {
    const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
    await redis.ping();
    console.log('✅ Redis connection successful!');
    redis.disconnect();
  } catch (err) {
    console.error('❌ Redis connection failed:', err);
  }
  process.exit(0);
}

testConnections();
