
import mongoose from 'mongoose';
import IORedis from 'ioredis';
import { google } from 'googleapis';
import * as dotenv from 'dotenv';

dotenv.config();

async function testConnections() {
  console.log('--- Testing MongoDB ---');
  const mongoUri = process.env.MONGODB_URI || process.env.NODE_ENV === 'production' ? 'mongodb://your-prod-host:27017/onepws-chatbot' : 'mongodb://localhost:27017/onepws-chatbot';
  console.log(`Connecting to MongoDB at: ${mongoUri}`);
  try {
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB connection successful!');
    if (mongoose.connection.db) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      console.log(`Found ${collections.length} collections.`);
    }
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ MongoDB connection failed:', err);
  }

  console.log('\n--- Testing Redis ---');
  const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || (process.env.NODE_ENV === 'production' ? 'your-prod-redis-host' : 'localhost')}:${process.env.REDIS_PORT || 6379}`;
  console.log(`Connecting to Redis at: ${redisUrl}`);
  try {
    const redis = new IORedis(redisUrl, { maxRetriesPerRequest: 1 });
    await redis.ping();
    console.log('✅ Redis connection successful!');
    redis.disconnect();
  } catch (err) {
    console.error('❌ Redis connection failed:', err);
  }

  console.log('\n--- Testing Google Sheets ---');
  if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SHEETS_ONEPWS_ID) {
    console.warn('⚠️  Google Sheets credentials not configured, skipping test');
  } else {
    try {
      const auth = new google.auth.JWT({
        email: process.env.GOOGLE_CLIENT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const sheets = google.sheets({ version: 'v4', auth });
      
      // Test authentication and spreadsheet access
      const response = await sheets.spreadsheets.get({
        spreadsheetId: process.env.GOOGLE_SHEETS_ONEPWS_ID,
      });

      console.log(`✅ Google Sheets connection successful!`);
      console.log(`   Spreadsheet: ${response.data.properties?.title}`);
      console.log(`   Sheets: ${response.data.sheets?.length}`);
    } catch (err) {
      console.error('❌ Google Sheets connection failed:', err instanceof Error ? err.message : err);
    }
  }

  process.exit(0);
}

testConnections();
