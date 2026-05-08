// @ts-nocheck
import { v4 as uuidv4 } from "uuid";
import type { ChatPipelineResult, FallbackLeadInput } from "@onepws/types";
import { normalizePhone } from "@onepws/utils";
import { ChatSessionModel, LeadModel, MessageModel } from "./models";
import { resolveRouting } from "./routing";

export async function initSession(payload: Record<string, unknown>) {
  const visitorId = typeof payload.visitorId === "string" ? payload.visitorId : undefined;
  const sessionId = typeof payload.sessionId === "string" ? payload.sessionId : undefined;

  if (sessionId) {
    const existingSession = await ChatSessionModel.findOne({ sessionId }).lean();
    if (existingSession) return existingSession;
  }

  if (visitorId) {
    const latestSession = await ChatSessionModel.findOne({ visitorId, status: "active" }).sort({ updatedAt: -1 }).lean();
    if (latestSession) return latestSession;
  }

  return ChatSessionModel.create({
    ...payload,
    sessionId: sessionId ?? uuidv4(),
    visitorId: visitorId ?? uuidv4(),
  });
}

export async function getSessionLead(sessionId: string) {
  return LeadModel.findOne({ sessionId }).lean();
}

export async function findExistingLeadByIdentity(input: { email?: string; phone?: string; fullName?: string }) {
  const orConditions = [
    ...(input.email ? [{ email: input.email }] : []),
    ...(input.phone ? [{ phone: normalizePhone(input.phone) }] : []),
  ];
  if (orConditions.length === 0) return null;

  const lead = await LeadModel.findOne({ $or: orConditions }).sort({ updatedAt: -1 }).lean();
  if (!lead) return null;
  if (input.fullName && lead.fullName && input.fullName.toLowerCase() !== String(lead.fullName).toLowerCase()) {
    return null;
  }
  return lead;
}

export async function captureLeadIdentity(sessionId: string, input: { fullName?: string; email?: string }) {
  if (!input.fullName && !input.email) return null;
  return LeadModel.findOneAndUpdate(
    { sessionId },
    {
      $set: {
        ...(input.fullName ? { fullName: input.fullName } : {}),
        ...(input.email ? { email: input.email } : {}),
      },
      $setOnInsert: {
        leadId: uuidv4(),
        sessionId,
        status: "draft",
      },
    },
    { new: true, upsert: true }
  );
}

export async function persistMessage(input: {
  sessionId: string;
  senderType: "user" | "assistant" | "system" | "admin";
  content: string;
  language?: string;
  metadata?: Record<string, unknown>;
}) {
  return MessageModel.create({
    ...input,
    normalizedContent: input.content.toLowerCase().trim(),
  });
}

export async function upsertLeadFromPipeline(sessionId: string, pipeline: ChatPipelineResult) {
  const routing = await resolveRouting({
    content: pipeline.extraction.requirementSummary ?? "",
    intent: pipeline.extraction.intent,
    solutionCategories: pipeline.extraction.solutionCategories ?? [pipeline.extraction.solutionCategory ?? "unknown"],
    departmentRequested: pipeline.extraction.departmentRequested,
    personRequested: pipeline.extraction.personRequested,
  });

  const base = {
    sessionId,
    fullName: pipeline.extraction.fullName,
    email: pipeline.extraction.email,
    phone: normalizePhone(pipeline.extraction.phone),
    company: pipeline.extraction.company,
    designation: pipeline.extraction.designation,
    city: pipeline.extraction.city,
    country: pipeline.extraction.country,
    projectLocation: pipeline.extraction.projectLocation,
    industry: pipeline.extraction.industry,
    businessNeed: pipeline.extraction.businessNeed,
    solutionCategory: pipeline.extraction.solutionCategory ?? "unknown",
    solutionCategories: pipeline.extraction.solutionCategories ?? [],
    projectType: pipeline.extraction.projectType,
    requirementSummary: pipeline.extraction.requirementSummary,
    budget: pipeline.extraction.budget,
    timeline: pipeline.extraction.timeline,
    operatorCount: pipeline.extraction.operatorCount,
    preferredContactMode: pipeline.extraction.preferredContactMode,
    preferredContactTime: pipeline.extraction.preferredContactTime,
    departmentRequested: pipeline.extraction.departmentRequested,
    personRequested: pipeline.extraction.personRequested,
    urgency: pipeline.extraction.urgency,
    summary: pipeline.extraction.summary,
    conclusion: pipeline.extraction.conclusion,
    leadScore: pipeline.extraction.leadScore,
    leadTemperature: pipeline.extraction.leadTemperature,
    language: pipeline.extraction.detectedLanguage,
    status: pipeline.extraction.shouldSubmitLead ? "qualified" : "draft",
    assignedDepartment: routing.assignedDepartment,
    assignedPerson: routing.assignedPerson ?? undefined,
    assignedEmails: routing.targetEmails,
  };

  const duplicate = await LeadModel.findOne({
    $or: [
      { sessionId },
      ...(pipeline.extraction.email ? [{ email: pipeline.extraction.email }] : []),
      ...(pipeline.extraction.phone ? [{ phone: normalizePhone(pipeline.extraction.phone) }] : []),
    ],
  });

  if (duplicate) {
    duplicate.set(base);
    if (duplicate.sessionId !== sessionId && (duplicate.email === base.email || duplicate.phone === base.phone)) {
      duplicate.duplicateOfLeadId = duplicate.leadId;
      duplicate.status = "duplicate";
    }
    await duplicate.save();
    return duplicate;
  }

  const session = await ChatSessionModel.findOne({ sessionId }).lean();
  return LeadModel.create({
    leadId: uuidv4(),
    ...base,
    sourcePage: session?.pageUrl,
    referrer: session?.referrer,
    utmSource: session?.utmSource,
    utmMedium: session?.utmMedium,
    utmCampaign: session?.utmCampaign,
  });
}

export async function submitFallbackLead(input: FallbackLeadInput) {
  return LeadModel.findOneAndUpdate(
    { sessionId: input.sessionId },
    {
      $set: {
        ...input,
        status: "qualified",
      },
      $setOnInsert: {
        leadId: uuidv4(),
      },
    },
    { new: true, upsert: true }
  );
}
