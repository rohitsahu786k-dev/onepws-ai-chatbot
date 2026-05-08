// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  AdminUserModel,
  AppSettingModel,
  AuditLogModel,
  ChatSessionModel,
  DepartmentModel,
  EmailLogModel,
  FeatureFlagModel,
  JobLogModel,
  LeadModel,
  MessageModel,
  PersonMappingModel,
  PromptConfigModel,
  RoutingRuleModel,
  captureLeadIdentity,
  connectToDatabase,
  enqueueLeadWork,
  findExistingLeadByIdentity,
  getAnalyticsOverview,
  getSessionLead,
  hashPassword,
  hasRole,
  initSession,
  parseAuthHeader,
  persistMessage,
  runChatPipeline,
  signAccessToken,
  signRefreshToken,
  submitFallbackLead,
  upsertLeadFromPipeline,
  verifyAccessToken,
  verifyPassword,
} from "@onepws/core";
import {
  chatIdentitySchema,
  chatMessageSchema,
  departmentSchema,
  fallbackLeadFormSchema,
  loginSchema,
  personMappingSchema,
  routingRuleSchema,
  widgetInitSchema,
} from "@onepws/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const adminReadRoles = ["super_admin", "marketing", "sales", "department_manager", "viewer"] as const;
const adminWriteRoles = ["super_admin", "marketing", "sales"] as const;

function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

function getToken(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = parseAuthHeader({ headers: { authorization: authHeader } });
    if (token) return token;
  }
  return request.cookies.get("accessToken")?.value;
}

function requireAuth(request: NextRequest, roles = adminReadRoles) {
  const token = getToken(request);
  if (!token) return { response: json({ message: "Unauthorized" }, { status: 401 }) };

  try {
    const user = verifyAccessToken(token);
    if (!hasRole(user, [...roles])) {
      return { response: json({ message: "Forbidden" }, { status: 403 }) };
    }
    return { user };
  } catch {
    return { response: json({ message: "Invalid token" }, { status: 401 }) };
  }
}

async function bodyJson(request: NextRequest) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? "");
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildLeadQuery(searchParams: URLSearchParams) {
  const query: Record<string, unknown> = {};
  if (searchParams.get("status")) query.status = searchParams.get("status");
  if (searchParams.get("department")) query.assignedDepartment = searchParams.get("department");
  if (searchParams.get("solutionCategory")) query.solutionCategory = searchParams.get("solutionCategory");
  if (searchParams.get("leadTemperature")) query.leadTemperature = searchParams.get("leadTemperature");
  const q = searchParams.get("q");
  if (q) {
    query.$or = [
      { leadId: new RegExp(q, "i") },
      { fullName: new RegExp(q, "i") },
      { company: new RegExp(q, "i") },
      { email: new RegExp(q, "i") },
      { phone: new RegExp(q, "i") },
      { requirementSummary: new RegExp(q, "i") },
    ];
  }
  return query;
}

function extractIdentityFromMessage(content: string) {
  return {
    email: content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0],
    phone: content.match(/(?:\+91|0)?[6-9]\d{9}/)?.[0],
    fullName: content.match(/(?:i am|my name is|this is)\s+([A-Za-z ]{2,})/i)?.[1]?.trim(),
  };
}

async function recordAudit(
  request: NextRequest,
  user: { id: string },
  input: { action: string; entityType: string; entityId?: string; before?: unknown; after?: unknown }
) {
  await AuditLogModel.create({
    actorId: user.id,
    actorType: "admin",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent"),
  });
}

async function ensureDefaultAdminUser() {
  const count = await AdminUserModel.estimatedDocumentCount();
  if (count > 0) return;

  const [superPassword, marketingPassword] = await Promise.all([
    hashPassword("OnepwsAdmin@123"),
    hashPassword("OnepwsMarketing@123"),
  ]);

  await AdminUserModel.insertMany([
    {
      firstName: "System",
      lastName: "Admin",
      email: "admin@onepws.com",
      passwordHash: superPassword,
      roles: ["super_admin"],
      isActive: true,
    },
    {
      firstName: "Marketing",
      lastName: "User",
      email: "marketing@onepws.com",
      passwordHash: marketingPassword,
      roles: ["marketing"],
      isActive: true,
    },
  ]);
}

async function login(request: NextRequest) {
  const payload = loginSchema.parse(await bodyJson(request));
  await ensureDefaultAdminUser();

  const user = await AdminUserModel.findOne({ email: payload.email, isActive: true });
  if (!user) return json({ message: "Invalid credentials" }, { status: 401 });
  const valid = await verifyPassword(payload.password, user.passwordHash);
  if (!valid) return json({ message: "Invalid credentials" }, { status: 401 });

  user.lastLoginAt = new Date();
  await user.save();

  const tokenPayload = {
    id: user._id.toString(),
    email: user.email,
    roles: user.roles,
    departmentSlug: user.departmentSlug,
  };
  const accessToken = signAccessToken(tokenPayload);
  const refreshToken = signRefreshToken(tokenPayload);
  const response = json({ accessToken, refreshToken, user: tokenPayload });
  const secure = process.env.NODE_ENV === "production";
  response.cookies.set("accessToken", accessToken, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  response.cookies.set("refreshToken", refreshToken, { httpOnly: true, sameSite: "lax", secure, path: "/" });
  return response;
}

async function handleWidgetInit(request: NextRequest) {
  const payload = widgetInitSchema.parse(await bodyJson(request));
  const session = await initSession({
    ...payload,
    ipHash: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });
  return json(session);
}

async function handleIdentify(request: NextRequest) {
  const payload = chatIdentitySchema.parse(await bodyJson(request));
  const matchedLead = await findExistingLeadByIdentity({
    email: payload.email,
    fullName: payload.fullName,
  });
  const activeSessionId = matchedLead?.sessionId ?? payload.sessionId;
  await captureLeadIdentity(activeSessionId, {
    fullName: payload.fullName,
    email: payload.email,
  });
  const messages = await MessageModel.find({ sessionId: activeSessionId }).sort({ createdAt: 1 }).lean();
  return json({
    sessionId: activeSessionId,
    restored: activeSessionId !== payload.sessionId,
    messages,
    lead: matchedLead,
  });
}

async function handleChatMessage(request: NextRequest) {
  const payload = chatMessageSchema.parse(await bodyJson(request));
  const identity = extractIdentityFromMessage(payload.content);
  const matchedLead =
    identity.email || identity.phone
      ? await findExistingLeadByIdentity({
          email: identity.email,
          phone: identity.phone,
          fullName: identity.fullName,
        })
      : null;
  const activeSessionId = matchedLead?.sessionId ?? payload.sessionId;
  const existingLead = await getSessionLead(activeSessionId);

  await persistMessage({ sessionId: activeSessionId, senderType: "user", content: payload.content, metadata: payload.metadata });
  const pipeline = await runChatPipeline({
    content: payload.content,
    existingLead: existingLead ?? undefined,
    attachments: payload.metadata?.attachments,
  });
  const lead = await upsertLeadFromPipeline(activeSessionId, pipeline);
  await persistMessage({
    sessionId: activeSessionId,
    senderType: "assistant",
    content: pipeline.assistantReply,
    language: pipeline.extraction.detectedLanguage,
    metadata: {
      extraction: pipeline.extraction,
    },
  });

  if (pipeline.extraction.shouldSubmitLead && lead?.leadId) {
    enqueueLeadWork(lead.leadId, activeSessionId).catch((error) => {
      console.warn("Lead qualified, but follow-up queue processing failed", error);
    });
  }

  return json({
    reply: pipeline.assistantReply,
    extraction: pipeline.extraction,
    lead,
    sessionId: activeSessionId,
    resumedExistingSession: activeSessionId !== payload.sessionId,
  });
}

async function handleGet(request: NextRequest, path: string[]) {
  if (path.length === 1 && path[0] === "health") return json({ ok: true });
  if (path[0] === "chat" && path[1] === "history" && path[2]) {
    const messages = await MessageModel.find({ sessionId: path[2] }).sort({ createdAt: 1 }).lean();
    return json(messages);
  }

  const auth = requireAuth(request);
  if (auth.response) return auth.response;

  if (path.join("/") === "admin/me") return json({ user: auth.user });

  if (path.join("/") === "admin/leads") {
    const page = Math.max(1, Number(request.nextUrl.searchParams.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(request.nextUrl.searchParams.get("limit") ?? 25)));
    const sortBy = String(request.nextUrl.searchParams.get("sortBy") ?? "createdAt");
    const sortOrder = String(request.nextUrl.searchParams.get("sortOrder") ?? "desc") === "asc" ? 1 : -1;
    const query = buildLeadQuery(request.nextUrl.searchParams);
    const [items, total] = await Promise.all([
      LeadModel.find(query)
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      LeadModel.countDocuments(query),
    ]);
    return json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  }

  if (path.join("/") === "admin/leads/export.csv") {
    const leads = await LeadModel.find(buildLeadQuery(request.nextUrl.searchParams)).sort({ createdAt: -1 }).limit(1000).lean();
    const columns = [
      "leadId",
      "status",
      "fullName",
      "company",
      "email",
      "phone",
      "solutionCategory",
      "leadTemperature",
      "leadScore",
      "assignedDepartment",
      "assignedPerson",
      "createdAt",
    ];
    const rows = [columns.join(","), ...leads.map((lead) => columns.map((column) => escapeCsvValue(lead[column])).join(","))];
    return new Response(rows.join("\n"), {
      headers: {
        "content-disposition": 'attachment; filename="onepws-leads.csv"',
        "content-type": "text/csv; charset=utf-8",
      },
    });
  }

  if (path[0] === "admin" && path[1] === "leads" && path[2] && path[3] === "timeline") {
    const lead = await LeadModel.findOne({ leadId: path[2] }).lean();
    const [messages, emails, jobs] = await Promise.all([
      MessageModel.find({ sessionId: lead?.sessionId }).select("senderType content createdAt").lean(),
      EmailLogModel.find({ leadId: path[2] }).select("type status createdAt").lean(),
      JobLogModel.find({ "payload.leadId": path[2] }).select("jobType status createdAt").lean(),
    ]);
    const timeline = [
      { type: "lead", label: `Lead ${lead?.status ?? "draft"}`, createdAt: lead?.createdAt, meta: lead?.assignedDepartment ?? "" },
      ...messages.map((message) => ({ type: "message", label: `${message.senderType} message`, createdAt: message.createdAt, meta: message.content })),
      ...emails.map((email) => ({ type: "email", label: `${email.type} ${email.status}`, createdAt: email.createdAt, meta: "" })),
      ...jobs.map((job) => ({ type: "job", label: `${job.jobType} ${job.status}`, createdAt: job.createdAt, meta: "" })),
    ]
      .filter((item) => item.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return json({ leadId: path[2], timeline });
  }

  if (path[0] === "admin" && path[1] === "leads" && path[2]) {
    const lead = await LeadModel.findOne({ leadId: path[2] }).lean();
    const [messages, emails, jobs, audits] = await Promise.all([
      MessageModel.find({ sessionId: lead?.sessionId }).sort({ createdAt: 1 }).lean(),
      EmailLogModel.find({ leadId: path[2] }).sort({ createdAt: -1 }).lean(),
      JobLogModel.find({ "payload.leadId": path[2] }).sort({ createdAt: -1 }).lean(),
      AuditLogModel.find({ entityId: path[2] }).sort({ createdAt: -1 }).lean(),
    ]);
    return json({ lead, messages, emails, jobs, audits });
  }

  if (path.join("/") === "admin/sessions") {
    return json(await ChatSessionModel.find().sort({ createdAt: -1 }).limit(200).lean());
  }

  if (path[0] === "admin" && path[1] === "sessions" && path[2] && path[3] === "messages") {
    return json(await MessageModel.find({ sessionId: path[2] }).sort({ createdAt: 1 }).lean());
  }

  if (path.join("/") === "admin/transcripts/search") {
    const q = String(request.nextUrl.searchParams.get("q") ?? "").trim();
    if (!q) return json([]);
    return json(
      await MessageModel.find({ content: new RegExp(q, "i") })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("sessionId senderType content createdAt")
        .lean()
    );
  }

  if (path.join("/") === "admin/analytics/overview") return json(await getAnalyticsOverview());
  if (path.join("/") === "admin/analytics/sources") {
    return json(await ChatSessionModel.aggregate([{ $group: { _id: "$utmSource", count: { $sum: 1 } } }, { $sort: { count: -1 } }]));
  }
  if (path.join("/") === "admin/routing-rules") return json(await RoutingRuleModel.find().sort({ priority: 1 }).lean());
  if (path.join("/") === "admin/departments") return json(await DepartmentModel.find().sort({ name: 1 }).lean());
  if (path.join("/") === "admin/people") return json(await PersonMappingModel.find().sort({ createdAt: -1 }).lean());
  if (path.join("/") === "admin/prompts") return json(await PromptConfigModel.find().sort({ createdAt: -1 }).lean());
  if (path.join("/") === "admin/email-logs") return json(await EmailLogModel.find().sort({ createdAt: -1 }).limit(200).lean());
  if (path.join("/") === "admin/job-logs") return json(await JobLogModel.find().sort({ createdAt: -1 }).limit(200).lean());
  if (path.join("/") === "admin/audit-logs") return json(await AuditLogModel.find().sort({ createdAt: -1 }).limit(200).lean());
  if (path.join("/") === "admin/settings") {
    const [settings, featureFlags] = await Promise.all([AppSettingModel.find().lean(), FeatureFlagModel.find().lean()]);
    return json({ settings, featureFlags });
  }

  return json({ message: "Not found" }, { status: 404 });
}

async function handlePost(request: NextRequest, path: string[]) {
  if (path.join("/") === "admin/auth/login") return login(request);
  if (path.join("/") === "admin/auth/logout") {
    const auth = requireAuth(request);
    if (auth.response) return auth.response;
    const response = json({ success: true });
    response.cookies.delete("accessToken");
    response.cookies.delete("refreshToken");
    return response;
  }
  if (path.join("/") === "widget/init" || path.join("/") === "chat/session") return handleWidgetInit(request);
  if (path.join("/") === "chat/identify") return handleIdentify(request);
  if (path.join("/") === "chat/message") return handleChatMessage(request);
  if (path.join("/") === "lead/submit") {
    const payload = fallbackLeadFormSchema.parse(await bodyJson(request));
    const lead = await submitFallbackLead(payload);
    enqueueLeadWork(lead.leadId, payload.sessionId).catch((error) => console.warn("Lead saved, but follow-up queue processing failed", error));
    return json(lead);
  }

  const auth = requireAuth(request, adminWriteRoles);
  if (auth.response) return auth.response;
  const body = await bodyJson(request);

  if (path[0] === "admin" && path[1] === "leads" && path[2] && path[3] === "reroute") {
    const lead = await LeadModel.findOne({ leadId: path[2] });
    if (!lead) return json({ message: "Lead not found" }, { status: 404 });
    await enqueueLeadWork(lead.leadId, lead.sessionId);
    await recordAudit(request, auth.user, { action: "lead.rerouted", entityType: "Lead", entityId: path[2], after: { leadId: lead.leadId } });
    return json({ success: true });
  }

  if (path.join("/") === "admin/routing-rules") {
    const payload = routingRuleSchema.parse(body);
    const rule = await RoutingRuleModel.create(payload);
    await recordAudit(request, auth.user, { action: "routingRule.created", entityType: "RoutingRule", entityId: rule._id.toString(), after: rule.toObject() });
    return json(rule);
  }
  if (path.join("/") === "admin/departments") {
    const payload = departmentSchema.parse(body);
    const department = await DepartmentModel.create(payload);
    await recordAudit(request, auth.user, { action: "department.created", entityType: "Department", entityId: department._id.toString(), after: department.toObject() });
    return json(department);
  }
  if (path.join("/") === "admin/people") {
    const payload = personMappingSchema.parse(body);
    const person = await PersonMappingModel.create(payload);
    await recordAudit(request, auth.user, { action: "person.created", entityType: "PersonMapping", entityId: person._id.toString(), after: person.toObject() });
    return json(person);
  }
  if (path.join("/") === "admin/prompts") {
    const prompt = await PromptConfigModel.create(body);
    await recordAudit(request, auth.user, { action: "prompt.created", entityType: "PromptConfig", entityId: prompt._id.toString(), after: prompt.toObject() });
    return json(prompt);
  }

  return json({ message: "Not found" }, { status: 404 });
}

async function handlePatch(request: NextRequest, path: string[]) {
  const auth = requireAuth(request, adminWriteRoles);
  if (auth.response) return auth.response;
  const body = await bodyJson(request);

  if (path[0] === "admin" && path[1] === "leads" && path[2]) {
    const before = await LeadModel.findOne({ leadId: path[2] }).lean();
    const lead = await LeadModel.findOneAndUpdate({ leadId: path[2] }, { $set: body }, { new: true });
    await recordAudit(request, auth.user, { action: "lead.updated", entityType: "Lead", entityId: path[2], before, after: lead?.toObject() });
    return json(lead);
  }
  if (path[0] === "admin" && path[1] === "routing-rules" && path[2]) {
    const before = await RoutingRuleModel.findById(path[2]).lean();
    const rule = await RoutingRuleModel.findByIdAndUpdate(path[2], { $set: body }, { new: true });
    await recordAudit(request, auth.user, { action: "routingRule.updated", entityType: "RoutingRule", entityId: path[2], before, after: rule?.toObject() });
    return json(rule);
  }
  if (path[0] === "admin" && path[1] === "departments" && path[2]) {
    const before = await DepartmentModel.findById(path[2]).lean();
    const department = await DepartmentModel.findByIdAndUpdate(path[2], { $set: body }, { new: true });
    await recordAudit(request, auth.user, { action: "department.updated", entityType: "Department", entityId: path[2], before, after: department?.toObject() });
    return json(department);
  }
  if (path[0] === "admin" && path[1] === "people" && path[2]) {
    const before = await PersonMappingModel.findById(path[2]).lean();
    const person = await PersonMappingModel.findByIdAndUpdate(path[2], { $set: body }, { new: true });
    await recordAudit(request, auth.user, { action: "person.updated", entityType: "PersonMapping", entityId: path[2], before, after: person?.toObject() });
    return json(person);
  }
  if (path[0] === "admin" && path[1] === "prompts" && path[2] && path[3] === "activate") {
    await PromptConfigModel.updateMany({}, { $set: { isActive: false } });
    const prompt = await PromptConfigModel.findByIdAndUpdate(path[2], { $set: { isActive: true } }, { new: true });
    await recordAudit(request, auth.user, { action: "prompt.activated", entityType: "PromptConfig", entityId: path[2], after: prompt?.toObject() });
    return json(prompt);
  }
  if (path.join("/") === "admin/settings") {
    const { settings = [], featureFlags = [] } = body as {
      settings?: Array<{ key: string; value: unknown; description?: string; category?: string }>;
      featureFlags?: Array<{ key: string; enabled: boolean; description?: string }>;
    };
    for (const item of settings) {
      await AppSettingModel.updateOne({ key: item.key }, { $set: item }, { upsert: true });
    }
    for (const item of featureFlags) {
      await FeatureFlagModel.updateOne({ key: item.key }, { $set: item }, { upsert: true });
    }
    await recordAudit(request, auth.user, { action: "settings.updated", entityType: "AppSetting", after: body });
    return json({ success: true });
  }

  return json({ message: "Not found" }, { status: 404 });
}

type RouteContext = { params: Promise<{ path?: string[] }> };

async function getPath(context: RouteContext) {
  const params = await context.params;
  return params.path ?? [];
}

async function handle(request: NextRequest, context: RouteContext) {
  const path = await getPath(context);

  try {
    await connectToDatabase();
    if (request.method === "GET") return handleGet(request, path);
    if (request.method === "POST") return handlePost(request, path);
    if (request.method === "PATCH") return handlePatch(request, path);
    return json({ message: "Method not allowed" }, { status: 405 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const isValidationError = error && typeof error === "object" && "issues" in error;
    console.error(error);
    return json(
      {
        message,
        issues: isValidationError ? error.issues : undefined,
        stack: process.env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.stack : undefined,
      },
      { status: isValidationError ? 400 : 500 }
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}
