import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { adminRoles, intents, leadStatuses, leadTemperatures, senderTypes, solutionCategories } from "@onepws/types";

const DepartmentSchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    primaryEmail: { type: String, required: true },
    ccEmails: { type: [String], default: [] },
    fallbackEmail: String,
    description: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const PersonMappingSchema = new Schema(
  {
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, required: true },
    departmentSlug: { type: String, required: true, index: true },
    aliases: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const RoutingRuleSchema = new Schema(
  {
    solutionKeywords: { type: [String], default: [] },
    intents: { type: [String], enum: intents, default: [] },
    targetDepartmentSlug: { type: String, required: true, index: true },
    targetEmail: { type: String, required: true },
    ccEmails: { type: [String], default: [] },
    priority: { type: Number, default: 100, index: true },
    fallback: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const AdminUserSchema = new Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    roles: { type: [String], enum: adminRoles, default: ["viewer"] },
    departmentSlug: String,
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

const ChatSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    visitorId: { type: String, required: true, index: true },
    pageUrl: String,
    pageTitle: String,
    referrer: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
    utmTerm: String,
    utmContent: String,
    ipHash: String,
    userAgent: String,
    preferredLanguage: String,
    detectedLanguage: String,
    currentIntent: { type: String, enum: intents, default: "unknown" },
    currentSolutionCategory: { type: String, enum: solutionCategories, default: "unknown" },
    status: { type: String, default: "active", index: true },
    startedAt: { type: Date, default: Date.now },
    endedAt: Date,
  },
  { timestamps: true }
);

const MessageSchema = new Schema(
  {
    sessionId: { type: String, required: true, index: true },
    senderType: { type: String, enum: senderTypes, required: true },
    content: { type: String, required: true },
    normalizedContent: String,
    language: String,
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

const LeadSchema = new Schema(
  {
    leadId: { type: String, required: true, unique: true, index: true },
    sessionId: { type: String, required: true, index: true },
    status: { type: String, enum: leadStatuses, default: "draft", index: true },
    assignedDepartment: String,
    assignedPerson: String,
    assignedEmails: { type: [String], default: [] },
    fullName: String,
    email: { type: String, index: true },
    phone: { type: String, index: true },
    company: { type: String, index: true },
    designation: String,
    city: String,
    country: String,
    projectLocation: String,
    industry: String,
    businessNeed: String,
    solutionCategory: { type: String, enum: solutionCategories, default: "unknown", index: true },
    solutionCategories: { type: [String], enum: solutionCategories, default: [] },
    projectType: String,
    requirementSummary: String,
    budget: String,
    timeline: String,
    operatorCount: String,
    preferredContactMode: String,
    preferredContactTime: String,
    departmentRequested: String,
    personRequested: String,
    urgency: String,
    summary: String,
    conclusion: String,
    leadScore: { type: Number, default: 0, index: true },
    leadTemperature: { type: String, enum: leadTemperatures, default: "cold", index: true },
    sourcePage: String,
    referrer: String,
    utmSource: String,
    utmMedium: String,
    utmCampaign: String,
    language: String,
    duplicateOfLeadId: String,
    notes: String,
  },
  { timestamps: true }
);

const PromptConfigSchema = new Schema(
  {
    version: { type: String, required: true },
    name: { type: String, required: true },
    systemPrompt: { type: String, required: true },
    qualificationPrompt: { type: String, required: true },
    extractionPrompt: { type: String, required: true },
    summaryPrompt: { type: String, required: true },
    routingPrompt: { type: String, required: true },
    languagePolicy: { type: String, required: true },
    tonePolicy: { type: String, required: true },
    isActive: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

const EmailLogSchema = new Schema(
  {
    leadId: String,
    sessionId: String,
    type: { type: String, required: true },
    provider: String,
    to: { type: [String], default: [] },
    cc: { type: [String], default: [] },
    bcc: { type: [String], default: [] },
    subject: String,
    html: String,
    text: String,
    status: { type: String, default: "pending", index: true },
    providerMessageId: String,
    errorMessage: String,
    sentAt: Date,
  },
  { timestamps: true }
);

const JobLogSchema = new Schema(
  {
    jobType: { type: String, required: true, index: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, default: "queued", index: true },
    attemptCount: { type: Number, default: 0 },
    errorMessage: String,
    processedAt: Date,
  },
  { timestamps: true }
);

const AuditLogSchema = new Schema(
  {
    actorId: String,
    actorType: String,
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: String,
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: true }
);

const FeatureFlagSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    description: String,
    enabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const AppSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    value: Schema.Types.Mixed,
    description: String,
    category: String,
  },
  { timestamps: true }
);

const KnowledgeBaseDocumentSchema = new Schema(
  {
    sourceUrl: { type: String, required: true, index: true },
    title: { type: String, required: true },
    chunkIndex: { type: Number, required: true },
    content: { type: String, required: true },
    contentHash: { type: String, required: true, unique: true, index: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
    capturedAt: { type: Date, default: Date.now, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

KnowledgeBaseDocumentSchema.index({ title: "text", content: "text", sourceUrl: "text" });

export const DepartmentModel = mongoose.models.Department || mongoose.model("Department", DepartmentSchema);
export const PersonMappingModel = mongoose.models.PersonMapping || mongoose.model("PersonMapping", PersonMappingSchema);
export const RoutingRuleModel = mongoose.models.RoutingRule || mongoose.model("RoutingRule", RoutingRuleSchema);
export const AdminUserModel = mongoose.models.AdminUser || mongoose.model("AdminUser", AdminUserSchema);
export const ChatSessionModel = mongoose.models.ChatSession || mongoose.model("ChatSession", ChatSessionSchema);
export const MessageModel = mongoose.models.Message || mongoose.model("Message", MessageSchema);
export const LeadModel = mongoose.models.Lead || mongoose.model("Lead", LeadSchema);
export const PromptConfigModel = mongoose.models.PromptConfig || mongoose.model("PromptConfig", PromptConfigSchema);
export const EmailLogModel = mongoose.models.EmailLog || mongoose.model("EmailLog", EmailLogSchema);
export const JobLogModel = mongoose.models.JobLog || mongoose.model("JobLog", JobLogSchema);
export const AuditLogModel = mongoose.models.AuditLog || mongoose.model("AuditLog", AuditLogSchema);
export const FeatureFlagModel = mongoose.models.FeatureFlag || mongoose.model("FeatureFlag", FeatureFlagSchema);
export const AppSettingModel = mongoose.models.AppSetting || mongoose.model("AppSetting", AppSettingSchema);
export const KnowledgeBaseDocumentModel =
  mongoose.models.KnowledgeBaseDocument || mongoose.model("KnowledgeBaseDocument", KnowledgeBaseDocumentSchema);

export type AdminUserDocument = InferSchemaType<typeof AdminUserSchema>;
export type LeadDocument = InferSchemaType<typeof LeadSchema>;
