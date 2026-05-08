import { hashPassword } from "./auth";
import { AdminUserModel, AppSettingModel, DepartmentModel, FeatureFlagModel, PersonMappingModel, PromptConfigModel, RoutingRuleModel } from "./models";

const defaultAdminUsers = [
  {
    firstName: "System",
    lastName: "Admin",
    email: "admin@onepws.com",
    password: "OnepwsAdmin@123",
    roles: ["super_admin"],
  },
  {
    firstName: "Marketing",
    lastName: "User",
    email: "marketing@onepws.com",
    password: "OnepwsMarketing@123",
    roles: ["marketing"],
  },
] as const;

export async function ensureDefaultAdminUsers({ resetExistingPasswords = false } = {}) {
  for (const defaultUser of defaultAdminUsers) {
    const email = defaultUser.email.toLowerCase();
    const existing = await AdminUserModel.findOne({ email });

    if (existing) {
      const updates: Record<string, unknown> = {};

      if (resetExistingPasswords) {
        updates.passwordHash = await hashPassword(defaultUser.password);
        updates.isActive = true;
      }

      if (!existing.roles?.length) {
        updates.roles = [...defaultUser.roles];
      }

      if (Object.keys(updates).length > 0) {
        await AdminUserModel.updateOne({ _id: existing._id }, { $set: updates });
      }
      continue;
    }

    await AdminUserModel.create({
      firstName: defaultUser.firstName,
      lastName: defaultUser.lastName,
      email,
      passwordHash: await hashPassword(defaultUser.password),
      roles: [...defaultUser.roles],
      isActive: true,
    });
  }
}

export async function seedBaseData() {
  await DepartmentModel.deleteMany({});
  await PersonMappingModel.deleteMany({});
  await RoutingRuleModel.deleteMany({});
  await PromptConfigModel.deleteMany({});
  await FeatureFlagModel.deleteMany({});
  await AppSettingModel.deleteMany({});
  await AdminUserModel.deleteMany({});

  await DepartmentModel.insertMany([
    { name: "Control Room Team", slug: "control-room", primaryEmail: "controlroom@onepws.com", ccEmails: [] },
    { name: "Console Team", slug: "consoles", primaryEmail: "consoles@onepws.com", ccEmails: [] },
    { name: "Interiors Team", slug: "interiors", primaryEmail: "interiors@onepws.com", ccEmails: [] },
    { name: "Flooring Team", slug: "flooring", primaryEmail: "flooring@onepws.com", ccEmails: [] },
    { name: "Modular OT Team", slug: "modular-ot", primaryEmail: "healthcare@onepws.com", ccEmails: [] },
    { name: "Enterprise Solutions", slug: "enterprise-solutions", primaryEmail: "enterprise@onepws.com", ccEmails: [] },
    { name: "Support", slug: "support", primaryEmail: "support@onepws.com", ccEmails: [] },
  ]);

  await PersonMappingModel.insertMany([
    { fullName: "Amit Sharma", email: "amit.sharma@onepws.com", role: "Sales Manager", departmentSlug: "control-room", aliases: ["amit"] },
    { fullName: "Ritu Mehra", email: "ritu.mehra@onepws.com", role: "Flooring Specialist", departmentSlug: "flooring", aliases: ["ritu"] },
  ]);

  await RoutingRuleModel.insertMany([
    { solutionKeywords: ["control room", "command center"], intents: ["sales_enquiry", "product_enquiry"], targetDepartmentSlug: "control-room", targetEmail: "controlroom@onepws.com", priority: 10 },
    { solutionKeywords: ["console", "operator desk"], intents: ["sales_enquiry", "product_enquiry"], targetDepartmentSlug: "consoles", targetEmail: "consoles@onepws.com", priority: 20 },
    { solutionKeywords: ["auditorium", "interiors"], intents: ["sales_enquiry", "consultation_request"], targetDepartmentSlug: "interiors", targetEmail: "interiors@onepws.com", priority: 30 },
    { solutionKeywords: ["raised floor", "false floor", "flooring"], intents: ["sales_enquiry", "product_enquiry"], targetDepartmentSlug: "flooring", targetEmail: "flooring@onepws.com", priority: 40 },
    { solutionKeywords: ["ot", "clean room", "hospital"], intents: ["sales_enquiry", "consultation_request"], targetDepartmentSlug: "modular-ot", targetEmail: "healthcare@onepws.com", priority: 50 },
    { solutionKeywords: [], intents: [], targetDepartmentSlug: "enterprise-solutions", targetEmail: "enterprise@onepws.com", priority: 999, fallback: true },
  ]);

  await PromptConfigModel.create({
    version: "1.0.0",
    name: "Default OnePWS Sales Prompt",
    systemPrompt: "You are the OnePWS multilingual pre-sales assistant for enterprise infrastructure projects.",
    qualificationPrompt: "Collect lead details naturally and route to the relevant OnePWS internal team.",
    extractionPrompt: "Extract structured JSON from every user message.",
    summaryPrompt: "Summarize each lead for internal stakeholders.",
    routingPrompt: "Determine the best department and fallback routing.",
    languagePolicy: "Reply in the same language as the user when possible.",
    tonePolicy: "Professional, concise, consultative, enterprise-oriented.",
    isActive: true,
  });

  await FeatureFlagModel.insertMany([
    { key: "widget.quickReplies", description: "Enable quick reply suggestions in the widget", enabled: true },
    { key: "admin.analytics", description: "Enable admin analytics dashboard", enabled: true },
  ]);

  await AppSettingModel.insertMany([
    { key: "marketing.ccEmail", value: "marketing@onepws.com", description: "Default marketing CC email", category: "email" },
    { key: "widget.theme", value: { accent: "#db3d24" }, description: "Widget theme configuration", category: "widget" },
  ]);

  await ensureDefaultAdminUsers({ resetExistingPasswords: true });
}
