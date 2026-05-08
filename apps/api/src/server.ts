// @ts-nocheck
import http from "node:http";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { Server as SocketIOServer } from "socket.io";
import { env } from "@onepws/config";
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
  connectToDatabase,
  enqueueLeadWork,
  captureLeadIdentity,
  findExistingLeadByIdentity,
  getAnalyticsOverview,
  getSessionLead,
  hasRole,
  ensureDefaultAdminUsers,
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
import { chatIdentitySchema, chatMessageSchema, departmentSchema, fallbackLeadFormSchema, loginSchema, personMappingSchema, routingRuleSchema, widgetInitSchema } from "@onepws/types";

type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    email: string;
    roles: ("super_admin" | "marketing" | "sales" | "department_manager" | "viewer")[];
    departmentSlug?: string;
  };
};

const app = express();
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: [env.WIDGET_URL, env.ADMIN_URL, env.ONEPWS_DOMAIN],
    credentials: true,
  },
});

const adminReadRoles = ["super_admin", "marketing", "sales", "department_manager", "viewer"] as const;
const adminWriteRoles = ["super_admin", "marketing", "sales"] as const;

app.use(
  cors({
    origin: [env.WIDGET_URL, env.ADMIN_URL, env.ONEPWS_DOMAIN],
    credentials: true,
  })
);
app.use(helmet());
app.use(compression());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(
  rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
  })
);
app.use(pinoHttp());

io.on("connection", (socket) => {
  socket.on("session:join", (sessionId: string) => {
    socket.join(sessionId);
  });
});

function requireAuth(roles = adminReadRoles) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction) => {
    const token = parseAuthHeader(request) ?? request.cookies?.accessToken;
    if (!token) return response.status(401).json({ message: "Unauthorized" });

    try {
      const user = verifyAccessToken(token);
      if (!hasRole(user, [...roles])) {
        return response.status(403).json({ message: "Forbidden" });
      }
      request.user = user;
      next();
    } catch {
      return response.status(401).json({ message: "Invalid token" });
    }
  };
}

function buildLeadQuery(request: Request) {
  const query: Record<string, unknown> = {};
  if (request.query.status) query.status = request.query.status;
  if (request.query.department) query.assignedDepartment = request.query.department;
  if (request.query.solutionCategory) query.solutionCategory = request.query.solutionCategory;
  if (request.query.leadTemperature) query.leadTemperature = request.query.leadTemperature;
  if (request.query.q) {
    query.$or = [
      { leadId: new RegExp(String(request.query.q), "i") },
      { fullName: new RegExp(String(request.query.q), "i") },
      { company: new RegExp(String(request.query.q), "i") },
      { email: new RegExp(String(request.query.q), "i") },
      { phone: new RegExp(String(request.query.q), "i") },
      { requirementSummary: new RegExp(String(request.query.q), "i") },
    ];
  }
  return query;
}

function escapeCsvValue(value: unknown) {
  const stringValue = String(value ?? "");
  if (stringValue.includes(",") || stringValue.includes('"') || stringValue.includes("\n")) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function extractIdentityFromMessage(content: string) {
  return {
    email: content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0],
    phone: content.match(/(?:\+91|0)?[6-9]\d{9}/)?.[0],
    fullName: content.match(/(?:i am|my name is|this is)\s+([A-Za-z ]{2,})/i)?.[1]?.trim(),
  };
}

async function recordAudit(request: AuthenticatedRequest, input: { action: string; entityType: string; entityId?: string; before?: unknown; after?: unknown }) {
  if (!request.user) return;
  await AuditLogModel.create({
    actorId: request.user.id,
    actorType: "admin",
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before,
    after: input.after,
    ip: request.ip,
    userAgent: request.headers["user-agent"],
  });
}

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/widget/init", async (request, response, next) => {
  try {
    const payload = widgetInitSchema.parse(request.body);
    const session = await initSession({
      ...payload,
      ipHash: request.ip,
      userAgent: request.headers["user-agent"],
    });
    response.json(session);
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/session", async (request, response, next) => {
  try {
    const payload = widgetInitSchema.parse(request.body);
    const session = await initSession({
      ...payload,
      ipHash: request.ip,
      userAgent: request.headers["user-agent"],
    });
    response.json(session);
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/identify", async (request, response, next) => {
  try {
    const payload = chatIdentitySchema.parse(request.body);
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
    response.json({
      sessionId: activeSessionId,
      restored: activeSessionId !== payload.sessionId,
      messages,
      lead: matchedLead,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat/message", async (request, response, next) => {
  try {
    const payload = chatMessageSchema.parse(request.body);
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

    io.to(activeSessionId).emit("assistant:typing", { active: true });
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
        request.log?.warn({ error, leadId: lead.leadId }, "Lead qualified, but follow-up queue processing failed");
      });
    }

    io.to(activeSessionId).emit("assistant:typing", { active: false });
    response.json({ reply: pipeline.assistantReply, extraction: pipeline.extraction, lead, sessionId: activeSessionId, resumedExistingSession: activeSessionId !== payload.sessionId });
  } catch (error) {
    io.to(request.body.sessionId).emit("assistant:typing", { active: false });
    next(error);
  }
});

app.get("/api/chat/history/:sessionId", async (request, response, next) => {
  try {
    const messages = await MessageModel.find({ sessionId: request.params.sessionId }).sort({ createdAt: 1 }).lean();
    response.json(messages);
  } catch (error) {
    next(error);
  }
});

app.post("/api/lead/submit", async (request, response, next) => {
  try {
    const payload = fallbackLeadFormSchema.parse(request.body);
    const lead = await submitFallbackLead(payload);
    enqueueLeadWork(lead.leadId, payload.sessionId).catch((error) => {
      request.log?.warn({ error, leadId: lead.leadId }, "Lead saved, but follow-up queue processing failed");
    });
    response.json(lead);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/auth/login", async (request, response, next) => {
  try {
    const payload = loginSchema.parse(request.body);
    await ensureDefaultAdminUsers();

    const user = await AdminUserModel.findOne({ email: payload.email, isActive: true });
    if (!user) return response.status(401).json({ message: "Invalid credentials" });
    const valid = await verifyPassword(payload.password, user.passwordHash);
    if (!valid) return response.status(401).json({ message: "Invalid credentials" });

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
    response.cookie("accessToken", accessToken, { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production" });
    response.cookie("refreshToken", refreshToken, { httpOnly: true, sameSite: "lax", secure: env.NODE_ENV === "production" });
    response.json({ accessToken, refreshToken, user: tokenPayload });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/auth/logout", requireAuth(), async (_request, response) => {
  response.clearCookie("accessToken");
  response.clearCookie("refreshToken");
  response.json({ success: true });
});

app.get("/api/admin/me", requireAuth(), async (request: AuthenticatedRequest, response) => {
  response.json({ user: request.user });
});

app.get("/api/admin/leads", requireAuth(), async (request, response, next) => {
  try {
    const page = Math.max(1, Number(request.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(request.query.limit ?? 25)));
    const sortBy = String(request.query.sortBy ?? "createdAt");
    const sortOrder = String(request.query.sortOrder ?? "desc") === "asc" ? 1 : -1;
    const query = buildLeadQuery(request);
    const [items, total] = await Promise.all([
      LeadModel.find(query).sort({ [sortBy]: sortOrder }).skip((page - 1) * limit).limit(limit).lean(),
      LeadModel.countDocuments(query),
    ]);
    response.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/leads/export.csv", requireAuth(), async (request, response, next) => {
  try {
    const leads = await LeadModel.find(buildLeadQuery(request)).sort({ createdAt: -1 }).limit(1000).lean();
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
    const rows = [
      columns.join(","),
      ...leads.map((lead) => columns.map((column) => escapeCsvValue(lead[column])).join(",")),
    ];
    response.setHeader("Content-Type", "text/csv");
    response.setHeader("Content-Disposition", 'attachment; filename="onepws-leads.csv"');
    response.send(rows.join("\n"));
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/leads/:leadId", requireAuth(), async (request, response, next) => {
  try {
    const lead = await LeadModel.findOne({ leadId: request.params.leadId }).lean();
    const [messages, emails, jobs, audits] = await Promise.all([
      MessageModel.find({ sessionId: lead?.sessionId }).sort({ createdAt: 1 }).lean(),
      EmailLogModel.find({ leadId: request.params.leadId }).sort({ createdAt: -1 }).lean(),
      JobLogModel.find({ "payload.leadId": request.params.leadId }).sort({ createdAt: -1 }).lean(),
      AuditLogModel.find({ entityId: request.params.leadId }).sort({ createdAt: -1 }).lean(),
    ]);
    response.json({ lead, messages, emails, jobs, audits });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/leads/:leadId/timeline", requireAuth(), async (request, response, next) => {
  try {
    const lead = await LeadModel.findOne({ leadId: request.params.leadId }).lean();
    const [messages, emails, jobs] = await Promise.all([
      MessageModel.find({ sessionId: lead?.sessionId }).select("senderType content createdAt").lean(),
      EmailLogModel.find({ leadId: request.params.leadId }).select("type status createdAt").lean(),
      JobLogModel.find({ "payload.leadId": request.params.leadId }).select("jobType status createdAt").lean(),
    ]);

    const timeline = [
      { type: "lead", label: `Lead ${lead?.status ?? "draft"}`, createdAt: lead?.createdAt, meta: lead?.assignedDepartment ?? "" },
      ...messages.map((message) => ({ type: "message", label: `${message.senderType} message`, createdAt: message.createdAt, meta: message.content })),
      ...emails.map((email) => ({ type: "email", label: `${email.type} ${email.status}`, createdAt: email.createdAt, meta: "" })),
      ...jobs.map((job) => ({ type: "job", label: `${job.jobType} ${job.status}`, createdAt: job.createdAt, meta: "" })),
    ]
      .filter((item) => item.createdAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    response.json({ leadId: request.params.leadId, timeline });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/leads/:leadId", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const before = await LeadModel.findOne({ leadId: request.params.leadId }).lean();
    const lead = await LeadModel.findOneAndUpdate({ leadId: request.params.leadId }, { $set: request.body }, { new: true });
    await recordAudit(request, { action: "lead.updated", entityType: "Lead", entityId: request.params.leadId, before, after: lead?.toObject() });
    response.json(lead);
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/leads/:leadId/reroute", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const lead = await LeadModel.findOne({ leadId: request.params.leadId });
    if (!lead) return response.status(404).json({ message: "Lead not found" });
    await enqueueLeadWork(lead.leadId, lead.sessionId);
    await recordAudit(request, { action: "lead.rerouted", entityType: "Lead", entityId: request.params.leadId, after: { leadId: lead.leadId } });
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/sessions", requireAuth(), async (_request, response, next) => {
  try {
    const sessions = await ChatSessionModel.find().sort({ createdAt: -1 }).limit(200).lean();
    response.json(sessions);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/sessions/:sessionId/messages", requireAuth(), async (request, response, next) => {
  try {
    const messages = await MessageModel.find({ sessionId: request.params.sessionId }).sort({ createdAt: 1 }).lean();
    response.json(messages);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/transcripts/search", requireAuth(), async (request, response, next) => {
  try {
    const q = String(request.query.q ?? "").trim();
    if (!q) return response.json([]);
    const messages = await MessageModel.find({
      content: new RegExp(q, "i"),
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .select("sessionId senderType content createdAt")
      .lean();
    response.json(messages);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/analytics/overview", requireAuth(), async (_request, response, next) => {
  try {
    response.json(await getAnalyticsOverview());
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/analytics/sources", requireAuth(), async (_request, response, next) => {
  try {
    const data = await ChatSessionModel.aggregate([{ $group: { _id: "$utmSource", count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
    response.json(data);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/routing-rules", requireAuth(), async (_request, response, next) => {
  try {
    response.json(await RoutingRuleModel.find().sort({ priority: 1 }).lean());
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/routing-rules", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const payload = routingRuleSchema.parse(request.body);
    const rule = await RoutingRuleModel.create(payload);
    await recordAudit(request, { action: "routingRule.created", entityType: "RoutingRule", entityId: rule._id.toString(), after: rule.toObject() });
    response.json(rule);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/routing-rules/:id", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const before = await RoutingRuleModel.findById(request.params.id).lean();
    const rule = await RoutingRuleModel.findByIdAndUpdate(request.params.id, { $set: request.body }, { new: true });
    await recordAudit(request, { action: "routingRule.updated", entityType: "RoutingRule", entityId: request.params.id, before, after: rule?.toObject() });
    response.json(rule);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/departments", requireAuth(), async (_request, response, next) => {
  try {
    response.json(await DepartmentModel.find().sort({ name: 1 }).lean());
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/departments", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const payload = departmentSchema.parse(request.body);
    const department = await DepartmentModel.create(payload);
    await recordAudit(request, { action: "department.created", entityType: "Department", entityId: department._id.toString(), after: department.toObject() });
    response.json(department);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/departments/:id", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const before = await DepartmentModel.findById(request.params.id).lean();
    const department = await DepartmentModel.findByIdAndUpdate(request.params.id, { $set: request.body }, { new: true });
    await recordAudit(request, { action: "department.updated", entityType: "Department", entityId: request.params.id, before, after: department?.toObject() });
    response.json(department);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/people", requireAuth(), async (_request, response, next) => {
  try {
    response.json(await PersonMappingModel.find().sort({ createdAt: -1 }).lean());
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/people", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const payload = personMappingSchema.parse(request.body);
    const person = await PersonMappingModel.create(payload);
    await recordAudit(request, { action: "person.created", entityType: "PersonMapping", entityId: person._id.toString(), after: person.toObject() });
    response.json(person);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/people/:id", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const before = await PersonMappingModel.findById(request.params.id).lean();
    const person = await PersonMappingModel.findByIdAndUpdate(request.params.id, { $set: request.body }, { new: true });
    await recordAudit(request, { action: "person.updated", entityType: "PersonMapping", entityId: request.params.id, before, after: person?.toObject() });
    response.json(person);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/prompts", requireAuth(), async (_request, response, next) => {
  try {
    response.json(await PromptConfigModel.find().sort({ createdAt: -1 }).lean());
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/prompts", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const prompt = await PromptConfigModel.create(request.body);
    await recordAudit(request, { action: "prompt.created", entityType: "PromptConfig", entityId: prompt._id.toString(), after: prompt.toObject() });
    response.json(prompt);
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/prompts/:id/activate", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    await PromptConfigModel.updateMany({}, { $set: { isActive: false } });
    const prompt = await PromptConfigModel.findByIdAndUpdate(request.params.id, { $set: { isActive: true } }, { new: true });
    await recordAudit(request, { action: "prompt.activated", entityType: "PromptConfig", entityId: request.params.id, after: prompt?.toObject() });
    response.json(prompt);
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/email-logs", requireAuth(), async (_request, response, next) => {
  try {
    response.json(await EmailLogModel.find().sort({ createdAt: -1 }).limit(200).lean());
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/job-logs", requireAuth(), async (_request, response, next) => {
  try {
    response.json(await JobLogModel.find().sort({ createdAt: -1 }).limit(200).lean());
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/audit-logs", requireAuth(), async (_request, response, next) => {
  try {
    response.json(await AuditLogModel.find().sort({ createdAt: -1 }).limit(200).lean());
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/settings", requireAuth(), async (_request, response, next) => {
  try {
    const [settings, featureFlags] = await Promise.all([AppSettingModel.find().lean(), FeatureFlagModel.find().lean()]);
    response.json({ settings, featureFlags });
  } catch (error) {
    next(error);
  }
});

app.patch("/api/admin/settings", requireAuth(adminWriteRoles), async (request: AuthenticatedRequest, response, next) => {
  try {
    const { settings = [], featureFlags = [] } = request.body as {
      settings?: Array<{ key: string; value: unknown; description?: string; category?: string }>;
      featureFlags?: Array<{ key: string; enabled: boolean; description?: string }>;
    };

    for (const item of settings) {
      await AppSettingModel.updateOne({ key: item.key }, { $set: item }, { upsert: true });
    }
    for (const item of featureFlags) {
      await FeatureFlagModel.updateOne({ key: item.key }, { $set: item }, { upsert: true });
    }

    await recordAudit(request, { action: "settings.updated", entityType: "AppSetting", after: request.body });
    response.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  response.status(500).json({
    message,
    stack: env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.stack : undefined,
  });
});

async function bootstrap() {
  await connectToDatabase();
  server.listen(env.PORT, () => {
    console.log(`OnePWS API listening on ${env.PORT}`);
  });
}

export default app;

if (!process.env.VERCEL) {
  bootstrap().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
