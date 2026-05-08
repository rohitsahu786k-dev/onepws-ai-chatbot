import mongoose from "mongoose";
import { env } from "@onepws/config";
import { logger } from "./logger";

let connected = false;

export async function connectToDatabase() {
  if (connected) return mongoose.connection;
  await mongoose.connect(env.MONGODB_URI);
  connected = true;
  logger.info("MongoDB connected");
  return mongoose.connection;
}
