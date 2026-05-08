// @ts-nocheck
import { google } from "googleapis";
import nodemailer from "nodemailer";
import { env } from "@onepws/config";
import { EmailLogModel, JobLogModel, LeadModel } from "./models";
import { logger } from "./logger";

export async function sendInternalLeadEmail(input: {
  leadId: string;
  sessionId: string;
  subject: string;
  html: string;
  text: string;
  to: string[];
  cc?: string[];
  type: string;
}) {
  const log = await EmailLogModel.create({
    leadId: input.leadId,
    sessionId: input.sessionId,
    type: input.type,
    to: input.to,
    cc: input.cc ?? [],
    subject: input.subject,
    html: input.html,
    text: input.text,
    status: "pending",
  });

  if (!env.ENABLE_EMAIL) {
    log.status = "skipped";
    log.errorMessage = "Email disabled by configuration";
    await log.save();
    return log;
  }

  const hasSmtpConfig = Boolean(env.SMTP_HOST && env.SMTP_FROM);
  const hasGmailConfig = Boolean(env.GMAIL_FROM_EMAIL && env.GMAIL_REFRESH_TOKEN);

  if (!hasSmtpConfig && !hasGmailConfig) {
    log.status = "skipped";
    log.errorMessage = "No email provider configured";
    await log.save();
    return log;
  }

  try {
    const transporter =
      hasSmtpConfig
        ? nodemailer.createTransport({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_PORT === 465,
            auth: env.SMTP_USER && env.SMTP_PASS ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
          })
        : nodemailer.createTransport({
            service: "gmail",
            auth: { user: env.GMAIL_FROM_EMAIL, pass: env.GMAIL_REFRESH_TOKEN },
          });

    const result = await transporter.sendMail({
      from: env.SMTP_FROM ?? env.GMAIL_FROM_EMAIL,
      to: input.to,
      cc: [...(input.cc ?? []), env.MARKETING_CC_EMAIL].filter(Boolean),
      subject: input.subject,
      html: input.html,
      text: input.text,
    });

    log.status = "sent";
    log.provider = env.SMTP_HOST ? "smtp" : "gmail";
    log.providerMessageId = result.messageId;
    log.sentAt = new Date();
    await log.save();
    return log;
  } catch (error) {
    log.status = "failed";
    log.errorMessage = error instanceof Error ? error.message : "Unknown email error";
    await log.save();
    throw error;
  }
}

export async function sendCustomerAcknowledgmentEmail(input: {
  leadId: string;
  sessionId: string;
  to: string;
  fullName?: string;
  solutionCategory?: string;
}) {
  return sendInternalLeadEmail({
    leadId: input.leadId,
    sessionId: input.sessionId,
    to: [input.to],
    cc: [],
    type: "customer_acknowledgment_email",
    subject: `OnePWS received your enquiry`,
    html: `
      <h2>Thank you for contacting OnePWS</h2>
      <p>Hello ${input.fullName ?? "there"},</p>
      <p>We have received your enquiry${input.solutionCategory ? ` regarding ${input.solutionCategory.replace(/_/g, " ")}` : ""}.</p>
      <p>Our team will review the requirement and connect with you shortly.</p>
      <p>Regards,<br />OnePWS</p>
    `,
    text: `Thank you for contacting OnePWS.
We have received your enquiry${input.solutionCategory ? ` regarding ${input.solutionCategory.replace(/_/g, " ")}` : ""}.
Our team will review the requirement and connect with you shortly.
Regards,
OnePWS`,
  });
}

export async function appendLeadToSheets(leadId: string) {
  const lead = await LeadModel.findOne({ leadId }).lean();
  if (!lead || !env.ENABLE_GOOGLE_SHEETS || !env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_SHEETS_ONEPWS_ID) {
    return;
  }

  const auth = new google.auth.JWT({
    email: env.GOOGLE_CLIENT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const sheets = google.sheets({ version: "v4", auth });
  const row = [
    new Date().toISOString(),
    lead.leadId,
    lead.sessionId,
    lead.fullName,
    lead.company,
    lead.email,
    lead.phone,
    lead.city,
    lead.country,
    lead.projectLocation,
    lead.industry,
    lead.solutionCategory,
    lead.requirementSummary,
    lead.budget,
    lead.timeline,
    lead.departmentRequested,
    lead.personRequested,
    lead.urgency,
    lead.leadScore,
    lead.leadTemperature,
    lead.sourcePage,
    lead.referrer,
    lead.utmSource,
    lead.utmMedium,
    lead.utmCampaign,
    lead.language,
    lead.summary,
    lead.conclusion,
    lead.assignedDepartment,
    lead.assignedPerson,
    lead.status,
  ];

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEETS_ONEPWS_ID,
    range: "Sheet1!A:AE",
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [row] },
  });
}

export async function logJob(jobType: string, payload: unknown, status: string, errorMessage?: string) {
  return JobLogModel.create({
    jobType,
    payload,
    status,
    errorMessage,
    processedAt: status === "completed" ? new Date() : undefined,
  });
}

export function buildLeadEmailBody(lead: {
  leadId: string;
  fullName?: string;
  company?: string;
  email?: string;
  phone?: string;
  city?: string;
  projectLocation?: string;
  timeline?: string;
  budget?: string;
  urgency?: string;
  solutionCategory?: string;
  requirementSummary?: string;
  summary?: string;
  assignedDepartment?: string;
  assignedPerson?: string;
  sourcePage?: string;
}) {
  const detailRows = [
    ["Lead ID", lead.leadId],
    ["Name", lead.fullName ?? "N/A"],
    ["Company", lead.company ?? "N/A"],
    ["Email", lead.email ?? "N/A"],
    ["Phone", lead.phone ?? "N/A"],
    ["City", lead.city ?? "N/A"],
    ["Project Location", lead.projectLocation ?? "N/A"],
    ["Solution", lead.solutionCategory ?? "N/A"],
    ["Timeline", lead.timeline ?? "N/A"],
    ["Budget", lead.budget ?? "N/A"],
    ["Urgency", lead.urgency ?? "N/A"],
    ["Assigned Department", lead.assignedDepartment ?? "N/A"],
    ["Assigned Person", lead.assignedPerson ?? "N/A"],
    ["Source Page", lead.sourcePage ?? "N/A"],
  ];

  return {
    subject: `OnePWS lead ${lead.leadId} | ${lead.solutionCategory ?? "general"} enquiry`,
    html: `
      <div style="font-family:Arial,sans-serif;background:#f5f6fa;padding:24px;color:#17130f">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #ece7df;border-radius:18px;overflow:hidden">
          <div style="padding:20px 24px;background:linear-gradient(135deg,#111114 0%,#18181d 100%);color:#ffffff">
            <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.72">OnePWS Lead Alert</div>
            <div style="margin-top:8px;font-size:24px;font-weight:700;line-height:1.2">${lead.solutionCategory ?? "General"} enquiry</div>
          </div>
          <div style="padding:24px">
            <table style="width:100%;border-collapse:collapse">
              ${detailRows
                .map(
                  ([label, value]) => `
                    <tr>
                      <td style="width:200px;padding:10px 0;border-bottom:1px solid #f0ece5;font-size:13px;font-weight:700;color:#5f5a56">${label}</td>
                      <td style="padding:10px 0;border-bottom:1px solid #f0ece5;font-size:14px;line-height:1.45;color:#17130f">${value}</td>
                    </tr>`
                )
                .join("")}
            </table>
            <div style="margin-top:20px">
              <div style="font-size:13px;font-weight:700;color:#5f5a56">Requirement</div>
              <div style="margin-top:6px;font-size:14px;line-height:1.55;color:#17130f">${lead.requirementSummary ?? "N/A"}</div>
            </div>
            <div style="margin-top:18px">
              <div style="font-size:13px;font-weight:700;color:#5f5a56">Conversation Summary</div>
              <div style="margin-top:6px;font-size:14px;line-height:1.55;color:#17130f">${lead.summary ?? "N/A"}</div>
            </div>
          </div>
        </div>
      </div>
    `,
    text: `OnePWS Lead Summary
Lead ID: ${lead.leadId}
Name: ${lead.fullName ?? "N/A"}
Company: ${lead.company ?? "N/A"}
Email: ${lead.email ?? "N/A"}
Phone: ${lead.phone ?? "N/A"}
City: ${lead.city ?? "N/A"}
Project Location: ${lead.projectLocation ?? "N/A"}
Solution: ${lead.solutionCategory ?? "N/A"}
Timeline: ${lead.timeline ?? "N/A"}
Budget: ${lead.budget ?? "N/A"}
Urgency: ${lead.urgency ?? "N/A"}
Assigned Department: ${lead.assignedDepartment ?? "N/A"}
Assigned Person: ${lead.assignedPerson ?? "N/A"}
Source Page: ${lead.sourcePage ?? "N/A"}
Requirement: ${lead.requirementSummary ?? "N/A"}
Summary: ${lead.summary ?? "N/A"}`,
  };
}

export function logIntegrationError(scope: string, error: unknown) {
  logger.error({ scope, error }, "Integration failure");
}
