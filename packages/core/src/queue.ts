// @ts-nocheck
import { Job, Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { env } from "@onepws/config";
import { LeadModel } from "./models";
import { appendLeadToSheets, buildLeadEmailBody, logIntegrationError, logJob, sendCustomerAcknowledgmentEmail, sendInternalLeadEmail } from "./integrations";
import { logger } from "./logger";

export const queueNames = {
  email: "lead-email",
  sheets: "lead-sheets",
} as const;

let connection: IORedis | null = null;
let redisWarningLogged = false;

function getRedisConnection() {
  if (!connection) {
    connection = env.REDIS_URL
      ? new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null })
      : new IORedis({
          host: env.REDIS_HOST,
          port: env.REDIS_PORT,
          username: env.REDIS_USERNAME,
          password: env.REDIS_PASSWORD,
          maxRetriesPerRequest: null,
        });

    connection.on("error", (error) => {
      if (!redisWarningLogged) {
        redisWarningLogged = true;
        logger.warn({ error: error.message }, "Redis unavailable. Falling back to inline job processing.");
      }
    });
  }
  return connection;
}

export function createQueues() {
  const redis = getRedisConnection();
  return {
    emailQueue: new Queue(queueNames.email, { connection: redis }),
    sheetsQueue: new Queue(queueNames.sheets, { connection: redis }),
  };
}

export async function enqueueLeadWork(leadId: string, sessionId: string) {
  try {
    const { emailQueue, sheetsQueue } = createQueues();
    await emailQueue.add("send-internal-lead-email", { leadId, sessionId }, { attempts: 3, backoff: { type: "exponential", delay: 3000 } });
    await sheetsQueue.add("append-lead-sheet", { leadId }, { attempts: 3, backoff: { type: "exponential", delay: 3000 } });
  } catch (error) {
    logger.warn({ error }, "Queue unavailable, executing lead jobs inline");
    await processEmailJob({ data: { leadId, sessionId } } as Job);
    await processSheetsJob({ data: { leadId } } as Job);
  }
}

export async function processEmailJob(job: Pick<Job, "data">) {
  try {
    const lead = await LeadModel.findOne({ leadId: job.data.leadId }).lean();
    if (!lead) return;
    const content = buildLeadEmailBody(lead);
    const primaryRecipients = lead.assignedEmails?.length ? lead.assignedEmails : [env.FALLBACK_LEAD_EMAIL ?? env.MARKETING_CC_EMAIL].filter(Boolean);
    await sendInternalLeadEmail({
      leadId: lead.leadId,
      sessionId: lead.sessionId,
      subject: content.subject,
      html: content.html,
      text: content.text,
      to: primaryRecipients,
      type: lead.assignedPerson ? "specific_person_routing_email" : "department_routing_email",
    });
    if (env.ENABLE_CUSTOMER_ACK_EMAIL && lead.email) {
      await sendCustomerAcknowledgmentEmail({
        leadId: lead.leadId,
        sessionId: lead.sessionId,
        to: lead.email,
        fullName: lead.fullName,
        solutionCategory: lead.solutionCategory,
      });
    }
    await logJob(queueNames.email, job.data, "completed");
  } catch (error) {
    await logJob(queueNames.email, job.data, "failed", error instanceof Error ? error.message : "Email job failed");
    logIntegrationError("email-job", error);
    throw error;
  }
}

export async function processSheetsJob(job: Pick<Job, "data">) {
  try {
    await appendLeadToSheets(job.data.leadId);
    await logJob(queueNames.sheets, job.data, "completed");
  } catch (error) {
    await logJob(queueNames.sheets, job.data, "failed", error instanceof Error ? error.message : "Sheets job failed");
    logIntegrationError("sheets-job", error);
    throw error;
  }
}

export function startWorkers() {
  try {
    const redis = getRedisConnection();
    const emailWorker = new Worker(queueNames.email, processEmailJob, { connection: redis });
    const sheetsWorker = new Worker(queueNames.sheets, processSheetsJob, { connection: redis });

    emailWorker.on("failed", (_job, error) => logger.error({ error }, "Email worker failed"));
    sheetsWorker.on("failed", (_job, error) => logger.error({ error }, "Sheets worker failed"));

    logger.info("BullMQ workers started");
    return { emailWorker, sheetsWorker };
  } catch (error) {
    logger.warn({ error }, "Failed to start BullMQ workers - Redis might be unavailable");
    return null;
  }
}
