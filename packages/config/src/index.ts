import fs from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const envCandidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "..", ".env"),
  path.resolve(process.cwd(), "..", "..", ".env"),
];
const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));
loadDotenv(envPath ? { path: envPath } : undefined);

const blankToUndefined = (value: unknown) => (value === "" ? undefined : value);
const optionalUrl = z.preprocess(blankToUndefined, z.string().url().optional());
const optionalEmail = z.preprocess(blankToUndefined, z.string().email().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(5000),
  APP_NAME: z.string().default("OnePWS_AI_CHATBOT"),
  APP_URL: z.string().url().default(process.env.NODE_ENV === "production" ? "https://api.chat.onepws.com" : "http://localhost:5000"),
  WIDGET_URL: z.string().url().default(process.env.NODE_ENV === "production" ? "https://chat.onepws.com" : "http://localhost:3000"),
  ADMIN_URL: z.string().url().default(process.env.NODE_ENV === "production" ? "https://admin.chat.onepws.com" : "http://localhost:3001"),
  JWT_SECRET: z.string().default("change-me"),
  JWT_REFRESH_SECRET: z.string().default("change-me-refresh"),
  SESSION_SECRET: z.string().default("change-me-session"),
  ENCRYPTION_SECRET: z.string().default("change-me-encryption"),
  MONGODB_URI: z.string().default("mongodb://localhost:27017/onepws-chatbot"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  REDIS_HOST: z.string().default("localhost"),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_USERNAME: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: optionalUrl,
  OPENAI_MODEL: z.string().default("gpt-5.4-mini"),
  OPENAI_SUMMARY_MODEL: z.string().default("gpt-5.4-mini"),
  OPENAI_EXTRACTION_MODEL: z.string().default("gpt-5.4-mini"),
  OPENAI_REALTIME_MODEL: z.string().default("gpt-realtime"),
  OPENAI_REALTIME_TRANSCRIPTION_MODEL: z.string().default("gpt-realtime-whisper"),
  OPENAI_REALTIME_VOICE: z.string().default("marin"),
  OLLAMA_GENERATE_URL: optionalUrl,
  OLLAMA_MODEL: z.string().default("llama3.2"),
  GOOGLE_PROJECT_ID: z.string().optional(),
  GOOGLE_CLIENT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  GOOGLE_SHEETS_MASTER_ID: z.string().optional(),
  GOOGLE_SHEETS_ONEPWS_ID: z.string().optional(),
  GMAIL_SENDER_NAME: z.string().default("OnePWS Lead Bot"),
  GMAIL_FROM_EMAIL: z.string().optional(),
  GMAIL_CLIENT_ID: z.string().optional(),
  GMAIL_CLIENT_SECRET: z.string().optional(),
  GMAIL_REFRESH_TOKEN: z.string().optional(),
  GMAIL_REDIRECT_URI: z.string().default("https://developers.google.com/oauthplayground"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  MARKETING_CC_EMAIL: optionalEmail.default("marketing@onepws.com"),
  FALLBACK_LEAD_EMAIL: optionalEmail.default("marketing@onepws.com"),
  ONEPWS_DOMAIN: z.string().url().default("https://onepws.com"),
  DEPT_CONTROL_ROOM_EMAIL: optionalEmail,
  DEPT_CONSOLES_EMAIL: optionalEmail,
  DEPT_INTERIORS_EMAIL: optionalEmail,
  DEPT_FLOORING_EMAIL: optionalEmail,
  DEPT_MODULAR_OT_EMAIL: optionalEmail,
  DEPT_SUPPORT_EMAIL: optionalEmail,
  DEPT_ENTERPRISE_SOLUTIONS_EMAIL: optionalEmail,
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  LOG_LEVEL: z.string().default("info"),
  ENABLE_EMAIL: z.coerce.boolean().default(true),
  ENABLE_GOOGLE_SHEETS: z.coerce.boolean().default(true),
  ENABLE_LEAD_SCORING: z.coerce.boolean().default(true),
  ENABLE_CUSTOMER_ACK_EMAIL: z.coerce.boolean().default(false),
  ENABLE_FILE_UPLOAD: z.coerce.boolean().default(false),
  ENABLE_RAG: z.coerce.boolean().default(false),
  CAPTCHA_SECRET: z.string().optional(),
});

export const env = envSchema.parse(process.env);
export type AppEnv = typeof env;
