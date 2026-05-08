import { z } from "zod";

export const adminRoles = ["super_admin", "marketing", "sales", "department_manager", "viewer"] as const;
export const intents = [
  "sales_enquiry",
  "product_enquiry",
  "consultation_request",
  "layout_request",
  "department_connect",
  "person_connect",
  "support_request",
  "general_information",
  "vendor_query",
  "unknown",
] as const;
export const solutionCategories = [
  "control_room",
  "control_room_consoles",
  "auditorium",
  "corporate_interiors",
  "integrated_workspace",
  "raised_access_flooring",
  "false_flooring",
  "modular_operation_theatre",
  "healthcare_infrastructure",
  "clean_room_related",
  "general_consultation",
  "mixed_requirement",
  "unknown",
] as const;
export const leadTemperatures = ["hot", "warm", "cold"] as const;
export const leadStatuses = ["draft", "qualified", "submitted", "routed", "closed", "duplicate"] as const;
export const senderTypes = ["user", "assistant", "system", "admin"] as const;

export type AdminRole = (typeof adminRoles)[number];
export type Intent = (typeof intents)[number];
export type SolutionCategory = (typeof solutionCategories)[number];
export type LeadTemperature = (typeof leadTemperatures)[number];
export type LeadStatus = (typeof leadStatuses)[number];
export type SenderType = (typeof senderTypes)[number];

export const leadFieldsSchema = z.object({
  fullName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  company: z.string().optional(),
  designation: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  projectLocation: z.string().optional(),
  industry: z.string().optional(),
  businessNeed: z.string().optional(),
  solutionCategory: z.enum(solutionCategories).optional(),
  solutionCategories: z.array(z.enum(solutionCategories)).optional(),
  projectType: z.string().optional(),
  requirementSummary: z.string().optional(),
  budget: z.string().optional(),
  timeline: z.string().optional(),
  operatorCount: z.string().optional(),
  preferredContactMode: z.string().optional(),
  preferredContactTime: z.string().optional(),
  departmentRequested: z.string().optional(),
  personRequested: z.string().optional(),
  urgency: z.string().optional(),
  language: z.string().optional(),
});

export const widgetInitSchema = z.object({
  visitorId: z.string().optional(),
  sessionId: z.string().optional(),
  pageUrl: z.string().url(),
  pageTitle: z.string().optional(),
  referrer: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  preferredLanguage: z.string().optional(),
});

export const chatIdentitySchema = z.object({
  sessionId: z.string(),
  fullName: z.string().min(2).max(80),
  email: z.string().email(),
});

export const chatAttachmentSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  data: z.string(),
});

export const chatMetadataSchema = z
  .object({
    attachments: z.array(chatAttachmentSchema).max(4).optional(),
  })
  .catchall(z.unknown());

export const chatMessageSchema = z.object({
  sessionId: z.string(),
  content: z.string().min(1).max(4000),
  metadata: chatMetadataSchema.optional(),
});

export const fallbackLeadFormSchema = leadFieldsSchema.extend({
  sessionId: z.string(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const routingRuleSchema = z.object({
  solutionKeywords: z.array(z.string()),
  intents: z.array(z.enum(intents)),
  targetDepartmentSlug: z.string(),
  targetEmail: z.string().email(),
  ccEmails: z.array(z.string().email()).default([]),
  priority: z.number().default(100),
  fallback: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const departmentSchema = z.object({
  name: z.string(),
  slug: z.string(),
  primaryEmail: z.string().email(),
  ccEmails: z.array(z.string().email()).default([]),
  fallbackEmail: z.string().email().optional(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

export const personMappingSchema = z.object({
  fullName: z.string(),
  email: z.string().email(),
  role: z.string(),
  departmentSlug: z.string(),
  aliases: z.array(z.string()).default([]),
  isActive: z.boolean().default(true),
});

export type LeadFields = z.infer<typeof leadFieldsSchema>;
export type WidgetInitInput = z.infer<typeof widgetInitSchema>;
export type ChatIdentityInput = z.infer<typeof chatIdentitySchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type ChatAttachment = z.infer<typeof chatAttachmentSchema>;
export type FallbackLeadInput = z.infer<typeof fallbackLeadFormSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type DepartmentInput = z.infer<typeof departmentSchema>;
export type PersonMappingInput = z.infer<typeof personMappingSchema>;
export type RoutingRuleInput = z.infer<typeof routingRuleSchema>;

export type ConversationExtraction = LeadFields & {
  intent: Intent;
  detectedLanguage: string;
  missingFields: string[];
  leadScore: number;
  leadTemperature: LeadTemperature;
  summary?: string;
  conclusion?: string;
  shouldSubmitLead: boolean;
  nextQuestion?: string;
};

export type ChatPipelineResult = {
  assistantReply: string;
  extraction: ConversationExtraction;
};
